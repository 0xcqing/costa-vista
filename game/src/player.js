import { PLAYER } from './config.js';
import { screenToWorld } from './camera.js';
import { isBlockedForRadius, nearestSidewalkPoint } from './city.js';
import { clamp, normalize, roundRect } from './util.js';
import { shoot } from './combat.js';
import { spawnBlood, spawnDust, spawnSparks } from './effects.js';
import { spawnFleeingPed } from './peds.js';
import { raiseWanted } from './police.js';
import { showBigMessage } from './hud.js';
import {
  getCarSeatPosition, nearestVehicle,
} from './vehicles.js';

export function getPlayerPosition(state) {
  const car = state.player.inVehicle;
  return car && !car.destroyed ? { x: car.x, y: car.y } : { x: state.player.x, y: state.player.y };
}

export function getPlayerVelocity(state) {
  const car = state.player.inVehicle;
  return car ? { x: car.vx, y: car.vy } : { x: 0, y: 0 };
}

export function updatePlayer(state, dt, input, camera, city) {
  const player = state.player;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  player.knockdown = Math.max(0, player.knockdown - dt);
  player.deadTimer = Math.max(0, player.deadTimer - dt);

  if (player.dead) {
    if (player.deadTimer <= 0) respawnPlayer(state, city);
    return;
  }

  const car = player.inVehicle;
  if (car && car.destroyed) {
    player.inVehicle = null;
    car.playerDriven = false;
    player.x = car.x + 24;
    player.y = car.y + 24;
    player.knockdown = 1.2;
    hurtPlayer(state, 34, car.x, car.y);
  }

  if (player.pendingDamage > 0) {
    const amount = player.pendingDamage;
    player.pendingDamage = 0;
    player.knockdown = Math.max(player.knockdown, 0.65);
    hurtPlayer(state, amount, player.x, player.y);
  }

  const mouseWorld = screenToWorld(camera, input.mouse.x, input.mouse.y);
  const aim = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
  player.aimAngle = aim;

  if (player.inVehicle) {
    const driven = player.inVehicle;
    if (driven.destroyed) return;
    if (input.isShooting() && player.fireTimer <= 0) {
      firePlayerWeapon(state, player.x, player.y, aim);
    }
    player.angle = driven.angle;
    return;
  }

  const axis = input.moveAxis();
  const movement = normalize(axis.x, axis.y);
  const sprinting = input.isSprinting() && movement.length > 0;
  const speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.moving = movement.length > 0 && player.knockdown <= 0;
  player.sprinting = sprinting && player.moving;

  if (player.moving) {
    const step = speed * dt;
    const nx = player.x + movement.x * step;
    const ny = player.y + movement.y * step;
    if (!isBlockedForRadius(city, nx, player.y, PLAYER.radius)) player.x = nx;
    if (!isBlockedForRadius(city, player.x, ny, PLAYER.radius)) player.y = ny;
    player.walkPhase += step * 0.12;
    player.footstepTimer -= dt;
    if (player.footstepTimer <= 0) {
      player.footstepTimer = sprinting ? 0.16 : 0.3;
      spawnDust(state, player.x - 4, player.y + 7, 1);
    }
  } else {
    player.walkPhase += dt * 1.8;
  }

  if (input.isShooting() && player.fireTimer <= 0 && player.knockdown <= 0) {
    const muzzleX = player.x + Math.cos(aim) * 16;
    const muzzleY = player.y + Math.sin(aim) * 16;
    firePlayerWeapon(state, muzzleX, muzzleY, aim);
    player.x -= Math.cos(aim) * 1.6;
    player.y -= Math.sin(aim) * 1.6;
  }
}

function firePlayerWeapon(state, x, y, angle) {
  const player = state.player;
  shoot(state, x, y, angle, { fromPlayer: true, hostile: false, damage: 30, speed: 1580 });
  player.fireTimer = PLAYER.fireCooldown;
  state.noise.x = x;
  state.noise.y = y;
  state.noise.life = 0.75;
  state.stats.shotsFired += 1;
  state.cameraShake = Math.max(state.cameraShake, 1.4);
}

export function hurtPlayer(state, amount, sourceX = 0, sourceY = 0) {
  const player = state.player;
  if (player.dead || player.invulnerable > 0) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, remaining * 0.62);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  player.hurtFlash = 0.3;
  state.screenFlash = Math.max(state.screenFlash, 0.48);
  state.screenFlashColor = '188, 38, 34';
  state.cameraShake = Math.max(state.cameraShake, 8);
  spawnBlood(state, player.x, player.y, 5, Math.atan2(player.y - sourceY, player.x - sourceX));
  if (player.health <= 0) {
    player.health = 0;
    wastePlayer(state);
  }
}

export function wastePlayer(state) {
  const player = state.player;
  if (player.dead) return;
  player.dead = true;
  player.deadTimer = PLAYER.wastedTime;
  player.health = 0;
  player.knockdown = PLAYER.wastedTime;
  const car = player.inVehicle;
  if (car) {
    car.playerDriven = false;
    car.occupied = false;
    car.driver = null;
    car.ai = null;
    car.parked = true;
    player.inVehicle = null;
  }
  state.money = Math.max(0, state.money - PLAYER.wastedPenalty);
  state.saveDirty = true;
  state.wanted = 0;
  state.heat = 0;
  state.wantedDecay = 0;
  state.pendingWanted = 0;
  spawnBlood(state, player.x, player.y, 14, Math.random() * Math.PI * 2);
  showBigMessage(state, 'WASTED', `Hospital bill ${PLAYER.wastedPenalty} dollars`, 2.5, '#ef6252');
  state.notifications.push({ text: 'You wake up at Costa Clinic.', life: 4, max: 4 });
  if (state.notifications.length > 6) state.notifications.shift();
}

function respawnPlayer(state, city) {
  const player = state.player;
  const point = nearestSidewalkPoint(city, PLAYER.hospitalX, PLAYER.hospitalY);
  player.x = point.x;
  player.y = point.y;
  player.health = PLAYER.maxHealth;
  player.armor = 35;
  player.dead = false;
  player.deadTimer = 0;
  player.knockdown = 0;
  player.invulnerable = PLAYER.invulnerableTime + 0.8;
  player.aimAngle = 0;
  state.screenFlash = 0.6;
  state.screenFlashColor = '245, 208, 152';
}

export function enterOrExitVehicle(state, city) {
  const player = state.player;
  if (player.dead) return false;
  if (player.inVehicle) {
    exitVehicle(state, city);
    return true;
  }
  const car = nearestVehicle(state, player.x, player.y, PLAYER.enterRange, true);
  if (!car) {
    const occupied = nearestVehicle(state, player.x, player.y, PLAYER.enterRange, false);
    if (occupied) {
      addToast(state, 'That car is occupied. Press F to steal it.');
      return false;
    }
    return false;
  }
  return enterCar(state, car);
}

export function stealNearestVehicle(state, city) {
  const player = state.player;
  if (player.dead) return false;
  if (player.inVehicle) {
    exitVehicle(state, city);
    return true;
  }
  const car = nearestVehicle(state, player.x, player.y, PLAYER.enterRange + 18, false);
  if (!car) return false;
  if (car.occupied) {
    const seat = getCarSeatPosition(car, 1);
    spawnFleeingPed(state, city, seat.x, seat.y, car.angle + Math.PI);
    car.occupied = false;
    car.driver = null;
    car.ai = null;
    car.traffic = null;
    raiseWanted(state, car.police ? 2 : 1);
    state.stats.crashes += 1;
    addToast(state, car.police ? 'Cruiser taken. Every officer is looking for you.' : 'Carjacked. The driver ran.');
  }
  return enterCar(state, car);
}

function enterCar(state, car) {
  const player = state.player;
  if (car.destroyed) return false;
  player.inVehicle = car;
  car.playerDriven = true;
  car.occupied = true;
  car.parked = false;
  car.ai = null;
  car.traffic = null;
  car.driver = 'player';
  car.controls.throttle = 0;
  car.controls.steer = 0;
  car.controls.brake = 0;
  car.controls.handbrake = false;
  return true;
}

function exitVehicle(state, city) {
  const player = state.player;
  const car = player.inVehicle;
  if (!car) return;
  const options = [
    getCarSeatPosition(car, 1),
    getCarSeatPosition(car, -1),
    { x: car.x - Math.cos(car.angle) * (car.length * 0.7), y: car.y - Math.sin(car.angle) * (car.length * 0.7) },
  ];
  let spot = options[0];
  for (const candidate of options) {
    if (!isBlockedForRadius(city, candidate.x, candidate.y, PLAYER.radius)) {
      spot = candidate;
      break;
    }
  }
  player.x = spot.x;
  player.y = spot.y;
  player.inVehicle = null;
  car.playerDriven = false;
  car.occupied = false;
  car.driver = null;
  car.controls.throttle = 0;
  car.controls.steer = 0;
  car.controls.brake = 1;
  car.controls.handbrake = true;
  car.parked = true;
  spawnDust(state, player.x, player.y, 2);
}

function addToast(state, text) {
  state.notifications.push({ text, life: 3.2, max: 3.2 });
  if (state.notifications.length > 6) state.notifications.shift();
}

export function drawPlayer(ctx, state, camera) {
  const player = state.player;
  if (player.inVehicle) return;
  const flicker = player.invulnerable > 0 && Math.floor(player.invulnerable * 15) % 2 === 0;
  if (flicker) ctx.globalAlpha = 0.55;

  ctx.save();
  ctx.fillStyle = 'rgba(35, 23, 20, 0.28)';
  ctx.beginPath();
  ctx.ellipse(player.x + 8, player.y + 10, 13, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (player.dead) {
    ctx.translate(player.x, player.y);
    ctx.rotate(0.6);
    ctx.fillStyle = '#3f4e54';
    roundRect(ctx, -13, -7, 26, 14, 6);
    ctx.fill();
    ctx.fillStyle = '#d8a47d';
    ctx.beginPath();
    ctx.arc(14, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b34b3e';
    ctx.beginPath();
    ctx.arc(-2, 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const bob = player.moving ? Math.sin(player.walkPhase) * 1.4 : Math.sin(player.walkPhase * 0.6) * 0.4;
  ctx.translate(player.x, player.y + bob);
  ctx.rotate(player.aimAngle + Math.PI / 2);
  ctx.scale(1.35, 1.35);
  const stride = player.moving ? Math.sin(player.walkPhase) * 3.7 : 0;

  ctx.strokeStyle = '#33434b';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-3.4, 4);
  ctx.lineTo(-4.5, 9 + stride);
  ctx.moveTo(3.4, 4);
  ctx.lineTo(4.5, 9 - stride);
  ctx.stroke();

  ctx.fillStyle = '#d8a47d';
  ctx.beginPath();
  ctx.arc(0, -5.5, 5, 0, Math.PI * 2);
  ctx.fill();

  const shoulder = ctx.createLinearGradient(-8, 0, 8, 0);
  shoulder.addColorStop(0, '#d2d8cb');
  shoulder.addColorStop(0.5, '#f0eadc');
  shoulder.addColorStop(1, '#c4cbbf');
  ctx.fillStyle = shoulder;
  roundRect(ctx, -8, -3, 16, 12, 6);
  ctx.fill();

  ctx.fillStyle = '#6f8e91';
  roundRect(ctx, -6, -1, 12, 5, 2);
  ctx.fill();

  ctx.fillStyle = '#4e6d70';
  ctx.beginPath();
  ctx.arc(0, -7, 5.6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-7, -7.5, 14, 2.6);
  ctx.fillStyle = '#d8a47d';
  ctx.beginPath();
  ctx.arc(0, -2.5, 4.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d8a47d';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(-6, -1);
  ctx.lineTo(-3, -10);
  ctx.moveTo(6, -1);
  ctx.lineTo(3.2, -10);
  ctx.stroke();

  ctx.fillStyle = '#292b2c';
  roundRect(ctx, -1.7, -14, 3.4, 10, 1);
  ctx.fill();
  ctx.fillStyle = '#69645c';
  ctx.fillRect(-1.2, -12, 2.4, 5);

  ctx.restore();
  ctx.globalAlpha = 1;
}
