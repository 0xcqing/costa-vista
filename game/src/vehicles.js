import { PALETTE, VEHICLE_TYPES } from './config.js';
import { isBlockedForRadius } from './city.js';
import {
  addSkid, spawnDust, spawnSparks, spawnSmoke,
} from './effects.js';
import { dropCruiserPickup } from './pickups.js';
import { playTireScreech } from './audio.js';
import { angleDifference, clamp, pick, roundRect, wrapAngle } from './util.js';

let carSerial = 1;

export function createCar(typeName, x, y, angle = 0, options = {}) {
  const type = VEHICLE_TYPES[typeName] ?? VEHICLE_TYPES.sedan;
  const color = options.color ?? pick(type.colors, options.rng ?? Math.random);
  return {
    id: `car-${carSerial++}`,
    type: typeName,
    label: type.label,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    width: type.width,
    length: type.length,
    maxSpeed: type.maxSpeed,
    accel: type.accel,
    brakeForce: type.brake,
    reverseSpeed: type.reverse,
    grip: type.grip,
    turnRate: type.turn,
    mass: type.mass,
    color,
    roofStripe: options.roofStripe ?? (typeName === 'sports' || typeName === 'muscle'),
    health: options.health ?? 100,
    maxHealth: options.health ?? 100,
    occupied: Boolean(options.occupied),
    parked: Boolean(options.parked),
    police: Boolean(options.police),
    ai: options.ai ?? null,
    driver: options.driver ?? (options.occupied ? 'npc' : null),
    playerDriven: false,
    destroyed: false,
    exploded: false,
    deadTimer: 0,
    sirenPhase: Math.random() * Math.PI * 2,
    lifetime: 0,
    skidClock: 0,
    screechTimer: 0,
    smokeClock: 0,
    fireClock: 0,
    lastSkid: null,
    parkingSpot: options.parkingSpot ?? null,
    traffic: options.traffic ?? null,
    controls: { throttle: 0, steer: 0, brake: 0, handbrake: false },
  };
}

export function getCarSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

export function getForwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

export function damageCar(state, car, amount) {
  if (car.destroyed || amount <= 0) return;
  car.health = Math.max(0, car.health - amount);
  if (car.playerDriven) state.cameraShake = Math.max(state.cameraShake, 5);
  if (car.health <= 0) {
    car.destroyed = true;
    car.controls.throttle = 0;
    car.controls.steer = 0;
    car.controls.brake = 1;
    car.controls.handbrake = true;
    state.stats.carsDestroyed += 1;
    state.pendingExplosions.push({
      x: car.x,
      y: car.y,
      radius: car.type === 'van' ? 150 : 125,
      damage: car.type === 'van' ? 95 : 72,
      car,
    });
    spawnSparks(state, car.x, car.y, 10, '#ffc96b', 220);
    if (car.police) dropCruiserPickup(state, car.x, car.y);
  }
}

export function stepVehicles(state, dt, city, input) {
  const player = state.player;

  for (const car of state.cars) {
    car.lifetime += dt;
    if (car.destroyed) {
      car.deadTimer += dt;
      car.vx *= Math.exp(-1.2 * dt);
      car.vy *= Math.exp(-1.2 * dt);
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.sirenPhase += dt * 8;
      if (car.deadTimer < 2.2) {
        car.fireClock -= dt;
        if (car.fireClock <= 0) {
          car.fireClock = 0.16;
          spawnSmoke(state, car.x, car.y, 1, 12);
        }
      }
      continue;
    }

    if (car.playerDriven) {
      const axis = input.moveAxis();
      car.controls.throttle = -axis.y;
      car.controls.steer = axis.x;
      car.controls.brake = 0;
      car.controls.handbrake = input.isHandbrake();
    } else if (car.parked && car.ai === null) {
      car.controls.throttle = 0;
      car.controls.steer = 0;
      car.controls.brake = 0;
      car.controls.handbrake = true;
    }

    updateCarPhysics(state, car, dt, city);

    if (car.playerDriven && player.inVehicle === car) {
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
    }

    if (car.health < 46) {
      car.smokeClock -= dt;
      if (car.smokeClock <= 0) {
        car.smokeClock = car.health < 20 ? 0.13 : 0.34;
        spawnSmoke(state, car.x - Math.cos(car.angle) * car.length * 0.2, car.y - Math.sin(car.angle) * car.length * 0.2, 1, car.health < 20 ? 11 : 7);
        if (car.health < 16) {
          car.fireClock -= dt;
          if (car.fireClock <= 0) {
            car.fireClock = 0.2;
            spawnSparks(state, car.x, car.y, 2, '#ff9b4a', 60);
          }
        }
      }
    }

    collidedPeds(state, car);
    collidedPlayer(state, car);
  }

  resolveCarCollisions(state);
  consumeDestroyedCars(state);
}

function updateCarPhysics(state, car, dt, city) {
  const controls = car.controls;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;
  const throttle = clamp(controls.throttle || 0, -1, 1);
  const brake = clamp(controls.brake || 0, 0, 1);

  if (throttle > 0) {
    forward += car.accel * throttle * dt;
  } else if (throttle < 0) {
    if (forward > 10) forward += car.brakeForce * throttle * dt;
    else forward += car.accel * 0.55 * throttle * dt;
  }

  if (brake > 0) {
    const amount = car.brakeForce * brake * dt;
    if (Math.abs(forward) <= amount) forward = 0;
    else forward -= Math.sign(forward) * amount;
  }

  const rolling = 0.62 + (controls.handbrake ? 3.4 : 0);
  forward *= Math.exp(-rolling * dt);
  forward = clamp(forward, -car.reverseSpeed, car.maxSpeed);

  const grip = controls.handbrake ? car.grip * 0.16 : car.grip;
  lateral *= Math.exp(-grip * dt);

  const speedFactor = clamp(Math.abs(forward) / 110, 0, 1);
  const direction = forward < -2 ? -1 : 1;
  const steer = clamp(controls.steer || 0, -1, 1);
  const handbrakeTurn = controls.handbrake ? 1.28 : 1;
  car.angle = wrapAngle(car.angle + car.turnRate * (0.28 + speedFactor * 0.72) * steer * direction * handbrakeTurn * dt);

  const newCos = Math.cos(car.angle);
  const newSin = Math.sin(car.angle);
  car.vx = newCos * forward - newSin * lateral;
  car.vy = newSin * forward + newCos * lateral;

  const radius = Math.max(9, Math.min(car.width, car.length) * 0.43);
  const nx = car.x + car.vx * dt;
  if (!isBlockedForRadius(city, nx, car.y, radius)) {
    car.x = nx;
  } else {
    car.vx *= -0.26;
    car.vy *= 0.72;
    state.cameraShake = Math.max(state.cameraShake, car.playerDriven ? 8 : 2.5);
    spawnSparks(state, car.x + newCos * car.length * 0.45, car.y + newSin * car.length * 0.45, 5, '#ffcf79', 130);
  }
  const ny = car.y + car.vy * dt;
  if (!isBlockedForRadius(city, car.x, ny, radius)) {
    car.y = ny;
  } else {
    car.vy *= -0.26;
    car.vx *= 0.72;
    state.cameraShake = Math.max(state.cameraShake, car.playerDriven ? 8 : 2.5);
    spawnSparks(state, car.x, car.y, 4, '#ffcf79', 110);
  }

  const drifting = Math.abs(lateral) > 42 || (controls.handbrake && Math.abs(forward) > 35);
  car.screechTimer = Math.max(0, car.screechTimer - dt);
  if (drifting) {
    if (car.playerDriven && car.screechTimer <= 0) {
      car.screechTimer = 0.55;
      playTireScreech();
    }
    const rearX = car.x - newCos * car.length * 0.29;
    const rearY = car.y - newSin * car.length * 0.29;
    const sideX = -newSin * car.width * 0.31;
    const sideY = newCos * car.width * 0.31;
    const lx = rearX + sideX;
    const ly = rearY + sideY;
    const rx = rearX - sideX;
    const ry = rearY - sideY;
    if (car.lastSkid) {
      addSkid(state, car.lastSkid.lx, car.lastSkid.ly, lx, ly);
      addSkid(state, car.lastSkid.rx, car.lastSkid.ry, rx, ry);
    }
    car.lastSkid = { lx, ly, rx, ry };
    if (Math.random() < 0.12) spawnSmoke(state, rearX, rearY, 1, 5);
  } else {
    car.lastSkid = null;
  }

  if (car.playerDriven && Math.abs(forward) > 180 && Math.random() < 0.04) {
    spawnDust(state, car.x - newCos * car.length * 0.45, car.y - newSin * car.length * 0.45, 1);
  }
}

function collidedPeds(state, car) {
  const speed = getCarSpeed(car);
  if (speed < 95 || car.parked) return;
  for (const ped of state.peds) {
    if (ped.down) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy > 27 * 27) continue;
    const impactAngle = Math.atan2(dy, dx);
    ped.down = true;
    ped.downTimer = 18;
    ped.health = 0;
    ped.vx = car.vx * 0.25 + Math.cos(impactAngle) * 40;
    ped.vy = car.vy * 0.25 + Math.sin(impactAngle) * 40;
    spawnSparks(state, ped.x, ped.y, 4, '#c9443b', 90);
    spawnSmoke(state, ped.x, ped.y, 1, 3);
    if (car.playerDriven) state.pendingWanted += 2;
    state.cameraShake = Math.max(state.cameraShake, 6);
    state.stats.pedsDown += 1;
    break;
  }
}

function collidedPlayer(state, car) {
  const player = state.player;
  if (car.playerDriven || player.inVehicle || player.dead) return;
  const speed = getCarSpeed(car);
  if (speed < 95) return;
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  if (dx * dx + dy * dy > 25 * 25) return;
  player.pendingDamage = Math.max(player.pendingDamage, clamp(speed * 0.35, 28, 90));
  car.vx *= 0.82;
  car.vy *= 0.82;
  state.cameraShake = Math.max(state.cameraShake, 9);
  spawnDust(state, player.x, player.y, 4);
}

function resolveCarCollisions(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.destroyed) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.destroyed) continue;
      const ra = a.length * 0.34;
      const rb = b.length * 0.34;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = ra + rb;
      const distSq = dx * dx + dy * dy;
      if (distSq >= min * min || distSq < 0.001) continue;
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = min - dist;
      const push = overlap * 0.5;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = relative * 0.35;
        a.vx += nx * impulse;
        a.vy += ny * impulse;
        b.vx -= nx * impulse;
        b.vy -= ny * impulse;
      }
      if (a.playerDriven || b.playerDriven) {
        state.stats.crashes += 1;
        state.cameraShake = Math.max(state.cameraShake, 4);
      }
    }
  }
}

function consumeDestroyedCars(state) {
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (!car.destroyed) continue;
    if (car.playerDriven) {
      car.playerDriven = false;
    }
    if (car.deadTimer > 22) {
      if (state.player.inVehicle === car) state.player.inVehicle = null;
      state.cars.splice(i, 1);
    }
  }
}

export function getCarSeatPosition(car, side = 1) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const sideX = -sin * (car.width * 0.5 + 16) * side;
  const sideY = cos * (car.width * 0.5 + 16) * side;
  return { x: car.x + sideX, y: car.y + sideY };
}

export function drawCar(ctx, car, time, state) {
  const halfL = car.length * 0.5;
  const halfW = car.width * 0.5;
  const speed = getCarSpeed(car);

  ctx.save();
  ctx.translate(car.x + 7, car.y + 9);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(35, 23, 20, 0.25)';
  roundRect(ctx, -halfL, -halfW, car.length, car.width, 8);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  ctx.fillStyle = car.destroyed ? '#2d2925' : '#292728';
  for (const side of [-1, 1]) {
    for (const fore of [-1, 1]) {
      roundRect(ctx, halfL * 0.57 * fore - 7, side * (halfW - 2) - 4, 14, 8, 3);
      ctx.fill();
    }
  }

  const bodyColor = car.destroyed ? '#37312a' : car.color;
  ctx.fillStyle = bodyColor;
  roundRect(ctx, -halfL, -halfW, car.length, car.width, car.downtown ? 4 : 7);
  ctx.fill();

  ctx.fillStyle = car.destroyed ? 'rgba(30, 24, 20, 0.7)' : 'rgba(255, 245, 217, 0.17)';
  roundRect(ctx, -halfL + 3, -halfW + 3, car.length - 6, car.width * 0.42, 4);
  ctx.fill();

  const glass = car.destroyed ? '#1b1917' : '#436169';
  ctx.fillStyle = glass;
  roundRect(ctx, -halfL * 0.05, -halfW * 0.71, car.length * 0.26, car.width * 0.7, 3);
  ctx.fill();
  ctx.fillStyle = car.destroyed ? '#24211d' : '#354b52';
  roundRect(ctx, -halfL * 0.66, -halfW * 0.66, car.length * 0.16, car.width * 0.66, 3);
  ctx.fill();

  if (car.roofStripe && !car.destroyed) {
    ctx.fillStyle = 'rgba(245, 229, 199, 0.85)';
    ctx.fillRect(-halfL * 0.52, -car.width * 0.07, car.length * 0.64, car.width * 0.14);
    ctx.fillStyle = 'rgba(80, 50, 40, 0.4)';
    ctx.fillRect(-halfL * 0.52, car.width * 0.04, car.length * 0.64, 1.5);
  }

  if (car.type === 'taxi' && !car.destroyed) {
    ctx.fillStyle = '#2c2927';
    roundRect(ctx, -5, -6, 10, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#f4df9d';
    ctx.fillRect(-3, -3, 6, 6);
  }

  if (car.police) {
    ctx.fillStyle = '#2c3b50';
    ctx.fillRect(-halfL * 0.62, -halfW, car.length * 0.42, 5);
    ctx.fillRect(-halfL * 0.62, halfW - 5, car.length * 0.42, 5);
    const pulse = Math.sin(time * 11 + car.sirenPhase) * 0.5 + 0.5;
    ctx.fillStyle = pulse > 0.5 ? '#ff5a54' : '#4f9dff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    roundRect(ctx, -6, -halfW * 0.45, 12, halfW * 0.9, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = pulse > 0.5 ? '#4f9dff' : '#ff5a54';
    ctx.fillRect(-3, -halfW * 0.35, 2, halfW * 0.7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pulse > 0.5 ? 'rgba(255, 75, 68, 0.65)' : 'rgba(79, 145, 255, 0.65)';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(halfL - 3, -halfW * 0.58, 3.4, 0, Math.PI * 2);
    ctx.arc(halfL - 3, halfW * 0.58, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (car.destroyed) {
    ctx.fillStyle = '#171412';
    roundRect(ctx, -halfL + 3, -halfW + 3, car.length - 6, car.width - 6, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210, 114, 56, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-halfL * 0.4, -halfW * 0.4);
    ctx.lineTo(halfL * 0.3, halfW * 0.1);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffe4a0';
    ctx.beginPath();
    ctx.arc(halfL - 4, -halfW * 0.57, 2.8, 0, Math.PI * 2);
    ctx.arc(halfL - 4, halfW * 0.57, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = car.controls.brake > 0.1 ? '#ff6152' : '#9b3b35';
    ctx.fillRect(-halfL + 1, -halfW * 0.66, 2.5, 5);
    ctx.fillRect(-halfL + 1, halfW * 0.44, 2.5, 5);
  }

  if (car.occupied && !car.destroyed) {
    ctx.fillStyle = car.police ? '#253144' : '#3b2d27';
    ctx.beginPath();
    ctx.arc(-halfL * 0.11, 0, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (speed > 350) {
    ctx.strokeStyle = 'rgba(255, 238, 200, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(car.x - Math.cos(car.angle) * car.length, car.y - Math.sin(car.angle) * car.length);
    ctx.lineTo(car.x - Math.cos(car.angle) * (car.length + 15), car.y - Math.sin(car.angle) * (car.length + 15));
    ctx.stroke();
  }
}

export function nearestVehicle(state, x, y, range, emptyOnly = false) {
  let best = null;
  let bestDist = range * range;
  for (const car of state.cars) {
    if (car.destroyed) continue;
    if (emptyOnly && car.occupied) continue;
    if (car.playerDriven) continue;
    const d = (car.x - x) ** 2 + (car.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function faceAngleDifference(from, to) {
  return angleDifference(to, from);
}

export { PALETTE };
