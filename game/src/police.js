import { LOCATIONS, POLICE } from './config.js';
import { notify } from './state.js';
import { clamp, distance, pick, roundRect, wrapAngle } from './util.js';
import { createCar, getCarSpeed } from './vehicles.js';
import { shoot } from './combat.js';
import { buildingAt, isBlockedForRadius, nearestSidewalkPoint } from './city.js';
import { showBigMessage } from './hud.js';

let officerSerial = 1;

export function raiseWanted(state, amount) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + amount, 0, 5);
  state.heat = POLICE.heatSeconds;
  state.wantedDecay = 0;
  state.policeSpawnTimer = 0;
  if (state.wanted > before) notify(state, `Wanted level ${state.wanted}`);
}

export function decayWanted(state, dt, city) {
  if (state.heat > 0) {
    state.heat = Math.max(0, state.heat - dt);
    state.wantedDecay = 0;
    return;
  }
  if (state.wanted <= 0) return;
  const playerPos = getPlayerPoint(state);
  const seen = city ? policeSeesPlayer(state, city, playerPos) : false;
  if (seen) {
    state.wantedDecay = 0;
    return;
  }
  const info = nearestPursuer(state, playerPos);
  const rate = info.distance > 1300 ? 2.4 : 1;
  state.wantedDecay += dt * rate;
  if (state.wantedDecay >= POLICE.decayStep) {
    state.wantedDecay = 0;
    state.wanted = Math.max(0, state.wanted - 1);
    if (state.wanted === 0) notify(state, 'The heat has cooled.');
  }
}

export function stepPolice(state, dt, city) {
  const playerPos = getPlayerPoint(state);
  if (state.pendingWanted > 0) {
    const amount = state.pendingWanted;
    state.pendingWanted = 0;
    raiseWanted(state, amount);
  }

  decayWanted(state, dt, city);
  state.policeSpawnTimer -= dt;
  state.policeRoadblockTimer = Math.max(0, state.policeRoadblockTimer - dt);

  const policeCars = state.cars.filter((car) => car.ai === 'police' && !car.destroyed);
  const targetCount = wantedTargetCount(state.wanted);
  if (state.wanted > 0 && policeCars.length < targetCount && state.policeSpawnTimer <= 0) {
    spawnPoliceCruiser(state, city, playerPos);
    state.policeSpawnTimer = Math.max(0.72, POLICE.spawnInterval - state.wanted * 0.24);
  }

  if (state.wanted >= 4 && state.player.inVehicle && state.policeRoadblockTimer <= 0) {
    spawnRoadblock(state, city, playerPos);
  }

  let pursuitSlot = 0;
  for (const car of state.cars) {
    if (car.ai !== 'police' || car.playerDriven || car.destroyed) continue;
    const dx = playerPos.x - car.x;
    const dy = playerPos.y - car.y;
    const distToPlayer = Math.hypot(dx, dy);
    car.sirenPhase += dt * 12;

    if (car.roadblock) {
      car.controls.throttle = 0;
      car.controls.steer = 0;
      car.controls.brake = 1;
      car.controls.handbrake = true;
      if (distToPlayer < 230 && state.wanted > 0) deployOfficer(state, city, car);
      if (state.wanted <= 0 && distToPlayer > 500) car.remove = true;
      continue;
    }

    if (state.wanted <= 0) {
      car.controls.throttle = 0;
      car.controls.steer = 0;
      car.controls.brake = 1;
      car.controls.handbrake = true;
      if (distToPlayer > POLICE.despawnRadius) car.remove = true;
      continue;
    }

    car.maxSpeed = (car.baseMaxSpeed ?? car.maxSpeed) * (state.wanted >= 5 ? 1.16 : state.wanted >= 4 ? 1.09 : 1);
    let targetX = playerPos.x;
    let targetY = playerPos.y;
    const playerCar = state.player.inVehicle && !state.player.inVehicle.destroyed ? state.player.inVehicle : null;
    if (state.wanted >= 2 && playerCar && state.wanted >= 2) {
      const ahead = pursuitSlot === 0 ? 122 : pursuitSlot === 1 ? 112 : -80 - (pursuitSlot % 2) * 38;
      const side = (pursuitSlot % 2 === 0 ? -1 : 1) * (64 + Math.min(34, pursuitSlot * 4));
      const heading = playerCar.angle;
      targetX = playerPos.x + Math.cos(heading) * ahead - Math.sin(heading) * side;
      targetY = playerPos.y + Math.sin(heading) * ahead + Math.cos(heading) * side;
    }
    pursuitSlot += 1;

    const desired = Math.atan2(targetY - car.y, targetX - car.x);
    const difference = wrapAngle(desired - car.angle);
    const speed = getCarSpeed(car);
    car.controls.steer = clamp(difference * 2.55, -1, 1);
    car.controls.throttle = distToPlayer > 70 ? 1 : 0.2;
    car.controls.brake = difference > 1.35 && speed > 145 ? 0.65 : 0;
    car.controls.handbrake = distToPlayer < 62 && speed > 190 && state.wanted >= 3 && Math.random() < 0.03;

    if ((state.player.dead || !state.player.inVehicle) && distToPlayer < 180) {
      deployOfficer(state, city, car);
    } else if (playerCar && getCarSpeed(playerCar) < 46 && distToPlayer < 175) {
      deployOfficer(state, city, car);
    }

    if (state.wanted >= 3 && car.occupied && distToPlayer < 560 && car.gunTimer <= 0) {
      if (policeSeesPoint(city, car.x, car.y, playerPos.x, playerPos.y)) {
        const angle = Math.atan2(playerPos.y - car.y, playerPos.x - car.x) + (Math.random() - 0.5) * 0.2;
        shoot(state, car.x + Math.cos(car.angle) * car.length * 0.5, car.y + Math.sin(car.angle) * car.length * 0.5, angle, {
          hostile: true,
          damage: 9,
          speed: 1120,
          life: 0.46,
        });
        car.gunTimer = 1.15 + Math.random() * 0.8;
      }
    }
    car.gunTimer = Math.max(0, car.gunTimer - dt);

    if (distToPlayer > POLICE.despawnRadius && state.wanted < 4) car.remove = true;
  }

  stepOfficers(state, dt, city, playerPos);
  updateBusted(state, dt, city);
  cleanupPolice(state);
}

function wantedTargetCount(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 1;
  if (wanted === 2) return 2;
  if (wanted === 3) return 4;
  if (wanted === 4) return 6;
  return POLICE.maxCars;
}

function spawnPoliceCruiser(state, city, playerPos) {
  const candidates = city.roadGraph.nodes.filter((node) => {
    const d = Math.hypot(node.x - playerPos.x, node.y - playerPos.y);
    return d > 520 && d < 1380;
  });
  if (!candidates.length) return;
  const node = pick(candidates, state.rng);
  const tooClose = state.cars.some((car) => car.ai === 'police' && Math.hypot(car.x - node.x, car.y - node.y) < 130);
  if (tooClose) return;
  const angle = Math.atan2(playerPos.y - node.y, playerPos.x - node.x);
  const car = createCar('police', node.x + 8, node.y + 8, angle, {
    occupied: true,
    police: true,
    ai: 'police',
    driver: 'officer',
    rng: state.rng,
  });
  car.baseMaxSpeed = car.maxSpeed;
  car.pursuitSlot = state.cars.filter((item) => item.ai === 'police').length;
  car.gunTimer = 0.8 + Math.random() * 0.8;
  car.controls.throttle = 1;
  state.cars.push(car);
}

function spawnRoadblock(state, city, playerPos) {
  const heading = state.player.inVehicle && !state.player.inVehicle.destroyed
    ? state.player.inVehicle.angle
    : state.player.aimAngle;
  const aheadX = Math.cos(heading);
  const aheadY = Math.sin(heading);
  const candidates = city.roadGraph.nodes.filter((node) => {
    const dx = node.x - playerPos.x;
    const dy = node.y - playerPos.y;
    const d = Math.hypot(dx, dy);
    if (d < 380 || d > 960) return false;
    return (dx * aheadX + dy * aheadY) / Math.max(1, d) > 0.42;
  });
  if (!candidates.length) return;
  const node = pick(candidates, state.rng);
  if (state.cars.some((car) => car.roadblock && Math.hypot(car.x - node.x, car.y - node.y) < 220)) return;
  const activeCount = state.cars.filter((car) => car.ai === 'police' && !car.destroyed && !car.roadblock).length;
  const blockCount = Math.max(0, Math.min(3, POLICE.maxCars - activeCount));
  if (blockCount === 0) return;
  const direction = Math.atan2(node.y - playerPos.y, node.x - playerPos.x);
  const blockAngle = direction + Math.PI / 2;
  const roadX = Math.cos(direction);
  const roadY = Math.sin(direction);
  for (let i = 0; i < blockCount; i++) {
    if (state.cars.length > 48) break;
    const offset = (i - (blockCount - 1) / 2) * 56;
    const car = createCar('police', node.x + roadX * offset, node.y + roadY * offset, blockAngle, {
      occupied: true,
      police: true,
      ai: 'police',
      driver: 'officer',
      rng: state.rng,
    });
    car.baseMaxSpeed = car.maxSpeed;
    car.roadblock = true;
    car.parked = true;
    car.controls.handbrake = true;
    car.gunTimer = 1 + Math.random();
    state.cars.push(car);
  }
  state.policeRoadblockTimer = POLICE.roadblockCooldown;
  notify(state, 'Roadblock ahead.');
}

function deployOfficer(state, city, car) {
  if (car.officersDeployed) return;
  car.officersDeployed = true;
  const side = state.cars.indexOf(car) % 2 === 0 ? 1 : -1;
  const x = car.x - Math.sin(car.angle) * (car.width * 0.5 + 20) * side;
  const y = car.y + Math.cos(car.angle) * (car.width * 0.5 + 20) * side;
  if (isBlockedForRadius(city, x, y, 6)) return;
  spawnOfficer(state, x, y, { faction: 'police', fromCruiser: car.id });
}

export function spawnOfficer(state, x, y, options = {}) {
  const cap = POLICE.maxOfficers + 8;
  if (state.officers.length >= cap) return null;
  const faction = options.faction ?? 'police';
  const officer = {
    id: `officer-${officerSerial++}`,
    faction,
    x,
    y,
    angle: options.angle ?? Math.random() * Math.PI * 2,
    health: options.health ?? (faction === 'syndicate' ? 85 : 72),
    maxHealth: options.health ?? (faction === 'syndicate' ? 85 : 72),
    speed: faction === 'syndicate' ? 105 : 118,
    walkPhase: Math.random() * Math.PI * 2,
    down: false,
    downTimer: 0,
    fireTimer: 0.4 + Math.random() * 0.9,
    fromCruiser: options.fromCruiser ?? null,
    pursuitRange: faction === 'syndicate' ? 150 : 105,
    remove: false,
    vx: 0,
    vy: 0,
    skin: faction === 'syndicate' ? '#b98562' : '#d7a37d',
  };
  state.officers.push(officer);
  return officer;
}

export function stepOfficers(state, dt, city, playerPos) {
  const targetPos = playerPos ?? getPlayerPoint(state);
  for (const officer of state.officers) {
    if (officer.down) {
      officer.downTimer -= dt;
      officer.x += officer.vx * dt;
      officer.y += officer.vy * dt;
      officer.vx *= Math.exp(-5 * dt);
      officer.vy *= Math.exp(-5 * dt);
      if (officer.downTimer <= 0) officer.remove = true;
      continue;
    }

    if (state.player.dead) {
      officer.fireTimer = Math.max(officer.fireTimer, 1.5);
      continue;
    }

    const dx = targetPos.x - officer.x;
    const dy = targetPos.y - officer.y;
    const dist = Math.hypot(dx, dy);
    if (officer.faction === 'police' && state.wanted <= 0 && dist > 420) {
      officer.remove = true;
      continue;
    }

    officer.angle = Math.atan2(dy, dx);
    officer.fireTimer = Math.max(0, officer.fireTimer - dt);
    const canShoot = officer.faction === 'syndicate' || state.wanted >= 3;

    if (dist > officer.pursuitRange) {
      const moveX = Math.cos(officer.angle) * officer.speed * dt;
      const moveY = Math.sin(officer.angle) * officer.speed * dt;
      if (!isBlockedForRadius(city, officer.x + moveX, officer.y + moveY, 7)) {
        officer.x += moveX;
        officer.y += moveY;
        officer.walkPhase += officer.speed * dt * 0.16;
      } else {
        officer.angle += (officer.id.length % 2 ? 1 : -1) * 2.2 * dt;
      }
    } else if (canShoot && officer.fireTimer <= 0) {
      if (policeSeesPoint(city, officer.x, officer.y, targetPos.x, targetPos.y)) {
        const spread = officer.faction === 'police' ? (Math.random() - 0.5) * 0.28 : (Math.random() - 0.5) * 0.16;
        const angle = Math.atan2(dy, dx) + spread;
        shoot(state, officer.x + Math.cos(angle) * 13, officer.y + Math.sin(angle) * 13, angle, {
          hostile: true,
          damage: officer.faction === 'syndicate' ? 11 : 9,
          speed: 1120,
          life: 0.5,
        });
        officer.fireTimer = (officer.faction === 'police' ? 1.35 : 1.1) + Math.random() * 0.7;
      }
    }
  }

  for (let i = state.officers.length - 1; i >= 0; i--) {
    if (state.officers[i].remove) state.officers.splice(i, 1);
  }
}

function updateBusted(state, dt, city) {
  const player = state.player;
  if (player.dead || state.wanted <= 0) {
    state.bustTimer = 0;
    return;
  }
  const playerCar = player.inVehicle;
  if (playerCar && !playerCar.destroyed && getCarSpeed(playerCar) > 38) {
    state.bustTimer = 0;
    return;
  }
  const px = playerCar && !playerCar.destroyed ? playerCar.x : player.x;
  const py = playerCar && !playerCar.destroyed ? playerCar.y : player.y;
  let close = 0;
  for (const officer of state.officers) {
    if (officer.down || officer.faction !== 'police') continue;
    if (Math.hypot(officer.x - px, officer.y - py) < POLICE.bustRadius) close += 1;
  }
  if (close >= 2) {
    state.bustTimer += dt;
    if (state.bustTimer >= POLICE.bustTime) bustedPlayer(state, city);
  } else {
    state.bustTimer = 0;
  }
}

function bustedPlayer(state, city) {
  const player = state.player;
  const car = player.inVehicle;
  if (car) {
    car.playerDriven = false;
    car.occupied = false;
    car.driver = null;
    car.parked = true;
    player.inVehicle = null;
  }
  const point = nearestSidewalkPoint(city, LOCATIONS.policeStation.x, LOCATIONS.policeStation.y);
  player.x = point.x;
  player.y = point.y;
  player.health = Math.max(58, player.health);
  player.armor = 0;
  player.knockdown = 0;
  player.invulnerable = 2.2;
  player.aimAngle = Math.PI;
  state.money = Math.max(0, state.money - POLICE.bustFine);
  state.wanted = 0;
  state.heat = 0;
  state.wantedDecay = 0;
  state.pendingWanted = 0;
  state.bustTimer = 0;
  state.playerBustedAt = state.time;
  state.saveDirty = true;
  state.screenFlash = 0.75;
  state.screenFlashColor = '130, 172, 220';
  showBigMessage(state, 'BUSTED', `Fine ${POLICE.bustFine} dollars. Wanted level cleared.`, 3.6, '#8cc4ee');
  notify(state, 'Released near the Downtown precinct.');
  for (const officer of state.officers) {
    if (officer.faction === 'police' && Math.hypot(officer.x - point.x, officer.y - point.y) > 380) officer.remove = true;
  }
}

function cleanupPolice(state) {
  for (let i = state.cars.length - 1; i >= 0; i--) {
    if (state.cars[i].remove) state.cars.splice(i, 1);
  }
  for (let i = state.officers.length - 1; i >= 0; i--) {
    if (state.officers[i].remove) state.officers.splice(i, 1);
  }
}

function getPlayerPoint(state) {
  const car = state.player.inVehicle;
  return car && !car.destroyed ? { x: car.x, y: car.y } : { x: state.player.x, y: state.player.y };
}

function nearestPursuer(state, playerPos) {
  let best = Infinity;
  for (const car of state.cars) {
    if (!car.police || car.destroyed) continue;
    best = Math.min(best, Math.hypot(car.x - playerPos.x, car.y - playerPos.y));
  }
  for (const officer of state.officers) {
    if (officer.faction !== 'police' || officer.down) continue;
    best = Math.min(best, Math.hypot(officer.x - playerPos.x, officer.y - playerPos.y));
  }
  return { distance: best };
}

function policeSeesPlayer(state, city, playerPos) {
  for (const car of state.cars) {
    if (!car.police || car.destroyed) continue;
    if (distance(car.x, car.y, playerPos.x, playerPos.y) > POLICE.sightRange) continue;
    if (policeSeesPoint(city, car.x, car.y, playerPos.x, playerPos.y)) return true;
  }
  for (const officer of state.officers) {
    if (officer.faction !== 'police' || officer.down) continue;
    if (distance(officer.x, officer.y, playerPos.x, playerPos.y) > POLICE.sightRange) continue;
    if (policeSeesPoint(city, officer.x, officer.y, playerPos.x, playerPos.y)) return true;
  }
  return false;
}

function policeSeesPoint(city, ax, ay, bx, by) {
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (buildingAt(city, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

export function drawOfficer(ctx, officer, time) {
  const police = officer.faction === 'police';
  ctx.save();
  ctx.fillStyle = 'rgba(35, 23, 20, 0.24)';
  ctx.beginPath();
  ctx.ellipse(officer.x + 6, officer.y + 9, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (officer.down) {
    ctx.translate(officer.x, officer.y);
    ctx.rotate(0.8);
    ctx.fillStyle = police ? '#2d4360' : '#4b2a2a';
    roundRect(ctx, -11, -6, 22, 12, 5);
    ctx.fill();
    ctx.fillStyle = officer.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.translate(officer.x, officer.y);
  ctx.rotate(officer.angle + Math.PI / 2);
  const stride = Math.sin(officer.walkPhase) * 3.2;
  ctx.strokeStyle = police ? '#1e2b3b' : '#3b2326';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3, 3);
  ctx.lineTo(-4, 8 + stride);
  ctx.moveTo(3, 3);
  ctx.lineTo(4, 8 - stride);
  ctx.stroke();
  ctx.fillStyle = police ? '#344f72' : '#5a3030';
  roundRect(ctx, -6, -5, 12, 14, 5);
  ctx.fill();
  ctx.fillStyle = police ? '#8db4d8' : '#c87857';
  ctx.fillRect(-6, -4, 12, 2.4);
  ctx.fillStyle = officer.skin;
  ctx.beginPath();
  ctx.arc(0, -7, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = police ? '#20354e' : '#422222';
  ctx.beginPath();
  ctx.arc(0, -8.4, 4.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = officer.skin;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-5, -2);
  ctx.lineTo(-2, -9);
  ctx.moveTo(5, -2);
  ctx.lineTo(2, -9);
  ctx.stroke();
  ctx.fillStyle = police ? '#dce7f2' : '#c88463';
  roundRect(ctx, -1.4, -14, 2.8, 9, 1);
  ctx.fill();
  if (police && Math.sin(time * 5) > 0) {
    ctx.fillStyle = Math.sin(time * 9) > 0 ? '#ff6158' : '#6fa8ff';
    ctx.beginPath();
    ctx.arc(0, -15, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


export function drawPoliceMarkers(ctx, state, time) {
  for (const car of state.cars) {
    if (!car.police || car.destroyed || state.wanted <= 0) continue;
    const pulse = Math.sin(time * 8 + car.sirenPhase) * 0.5 + 0.5;
    ctx.strokeStyle = pulse > 0.5 ? 'rgba(255, 91, 82, 0.5)' : 'rgba(77, 145, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 30 + pulse * 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}
