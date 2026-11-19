import { PEDS } from './config.js';
import { distance, segmentCircleHit, clamp } from './util.js';
import {
  spawnBlood, spawnExplosion, spawnMuzzleFlash, spawnSparks,
} from './effects.js';
import { buildingAt } from './city.js';
import { damageCar } from './vehicles.js';
import { playExplosion, playShoot } from './audio.js';

export function shoot(state, x, y, angle, options = {}) {
  let bullet = null;
  for (const candidate of state.bullets) {
    if (!candidate.active) {
      bullet = candidate;
      break;
    }
  }
  if (!bullet) {
    bullet = state.bullets.reduce((oldest, current) => (
      current.life < oldest.life ? current : oldest
    ), state.bullets[0]);
  }
  if (!bullet) return null;
  const speed = options.speed ?? 1500;
  bullet.active = true;
  bullet.x = x;
  bullet.y = y;
  bullet.px = x;
  bullet.py = y;
  bullet.vx = Math.cos(angle) * speed;
  bullet.vy = Math.sin(angle) * speed;
  bullet.life = options.life ?? 0.55;
  bullet.damage = options.damage ?? 26;
  bullet.hostile = Boolean(options.hostile);
  bullet.fromPlayer = Boolean(options.fromPlayer);
  spawnMuzzleFlash(state, x, y, angle);
  playShoot();
  return bullet;
}

export function stepCombat(state, dt, city) {
  for (const bullet of state.bullets) {
    if (!bullet.active) continue;
    bullet.life -= dt;
    if (bullet.life <= 0) {
      bullet.active = false;
      continue;
    }
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (buildingAt(city, bullet.x, bullet.y)) {
      bullet.active = false;
      spawnSparks(state, bullet.x, bullet.y, 4, '#dfc79f', 110);
      continue;
    }

    let hit = false;
    for (const car of state.cars) {
      if (car.destroyed) continue;
      if (bullet.fromPlayer && car === state.player.inVehicle) continue;
      const radius = Math.max(car.width * 0.5, 13);
      if (!segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, car.x, car.y, radius)) continue;
      damageCar(state, car, bullet.damage);
      spawnSparks(state, bullet.x, bullet.y, 7, '#ffd078', 180);
      if (car.occupied && car.driver === 'npc' && Math.random() < 0.35) {
        car.occupied = false;
        car.driver = null;
      }
      if (bullet.fromPlayer && car.police) state.pendingWanted += 1;
      hit = true;
      break;
    }
    if (hit) {
      bullet.active = false;
      continue;
    }

    if (!bullet.hostile) {
      for (const officer of state.officers) {
        if (officer.down) continue;
        if (!segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, officer.x, officer.y, 11)) continue;
        officer.health -= bullet.damage;
        officer.fireTimer = Math.max(officer.fireTimer, 0.4);
        spawnBlood(state, officer.x, officer.y, 7, Math.atan2(bullet.vy, bullet.vx));
        if (bullet.fromPlayer && officer.faction === 'police') {
          state.pendingWanted += officer.health <= 0 ? 5 : 2;
        }
        if (officer.health <= 0) {
          officer.health = 0;
          officer.down = true;
          officer.downTimer = 14;
          officer.vx = bullet.vx * 0.04;
          officer.vy = bullet.vy * 0.04;
        }
        hit = true;
        break;
      }
    }

    if (hit) {
      bullet.active = false;
      continue;
    }

    if (!bullet.hostile) {
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (!segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, ped.x, ped.y, 10)) continue;
        const wasAlive = ped.health > 0;
        ped.health -= bullet.damage;
        ped.fleeTimer = PEDS.fleeTime;
        spawnBlood(state, ped.x, ped.y, 8, Math.atan2(bullet.vy, bullet.vx));
        if (ped.health <= 0) {
          ped.down = true;
          ped.downTimer = PEDS.downTime;
          ped.health = 0;
          if (bullet.fromPlayer) state.stats.pedsDown += 1;
          if (bullet.fromPlayer) state.pendingWanted += 2;
        } else if (bullet.fromPlayer && wasAlive) {
          state.pendingWanted += 1;
        }
        hit = true;
        break;
      }
    }

    if (hit) {
      bullet.active = false;
      continue;
    }

    if (bullet.hostile && !state.player.dead) {
      const targetCar = state.player.inVehicle;
      if (targetCar && !targetCar.destroyed) {
        if (segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, targetCar.x, targetCar.y, Math.max(targetCar.width * 0.55, 15))) {
          damageCar(state, targetCar, bullet.damage * 0.8);
          state.player.pendingDamage += bullet.damage * 0.22;
          spawnSparks(state, bullet.x, bullet.y, 5, '#ffd078', 150);
          bullet.active = false;
          continue;
        }
      } else if (segmentCircleHit(bullet.px, bullet.py, bullet.x, bullet.y, state.player.x, state.player.y, 11)) {
        state.player.pendingDamage += bullet.damage;
        spawnBlood(state, state.player.x, state.player.y, 4, Math.atan2(bullet.vy, bullet.vx));
        bullet.active = false;
        continue;
      }
    }

    if (bullet.x < 0 || bullet.y < 0 || bullet.x > city.width || bullet.y > city.height) {
      bullet.active = false;
    }
  }

  const pending = state.pendingExplosions.slice();
  state.pendingExplosions.length = 0;
  for (const explosion of pending) {
    explodeAt(state, explosion.x, explosion.y, explosion.radius, explosion.damage);
  }
}

export function explodeAt(state, x, y, radius, damage) {
  spawnExplosion(state, x, y);
  playExplosion();
  state.cameraShake = Math.max(state.cameraShake, 18);
  for (const car of state.cars) {
    if (car.destroyed) continue;
    const d = distance(x, y, car.x, car.y);
    if (d > radius + car.length * 0.4) continue;
    damageCar(state, car, damage * clamp(1 - d / (radius + car.length * 0.4), 0.2, 1));
    const angle = Math.atan2(car.y - y, car.x - x);
    car.vx += Math.cos(angle) * 90;
    car.vy += Math.sin(angle) * 90;
    spawnSparks(state, car.x, car.y, 5, '#ffc96b', 180);
  }

  for (const ped of state.peds) {
    if (ped.down) continue;
    const d = distance(x, y, ped.x, ped.y);
    if (d > radius) continue;
    ped.down = true;
    ped.downTimer = PEDS.downTime;
    ped.health = 0;
    ped.vx = Math.cos(Math.atan2(ped.y - y, ped.x - x)) * 120;
    ped.vy = Math.sin(Math.atan2(ped.y - y, ped.x - x)) * 120;
    spawnBlood(state, ped.x, ped.y, 7);
    state.stats.pedsDown += 1;
    state.pendingWanted += 1;
  }

  for (const officer of state.officers) {
    if (officer.down) continue;
    const d = distance(x, y, officer.x, officer.y);
    if (d > radius) continue;
    officer.health = 0;
    officer.down = true;
    officer.downTimer = 14;
    officer.vx = Math.cos(Math.atan2(officer.y - y, officer.x - x)) * 80;
    officer.vy = Math.sin(Math.atan2(officer.y - y, officer.x - x)) * 80;
    if (officer.faction === 'police') state.pendingWanted += 2;
  }

  const player = state.player;
  if (!player.dead) {
    const d = distance(x, y, player.x, player.y);
    if (d < radius + 14) {
      const amount = damage * clamp(1 - d / (radius + 14), 0.25, 1);
      player.pendingDamage += amount;
      player.knockdown = Math.max(player.knockdown, 1);
    }
  }
}

export function drawBullets(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bullet of state.bullets) {
    if (!bullet.active) continue;
    ctx.strokeStyle = bullet.fromPlayer ? 'rgba(255, 232, 166, 0.92)' : 'rgba(255, 155, 122, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bullet.px, bullet.py);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.fillStyle = '#fff4cc';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
