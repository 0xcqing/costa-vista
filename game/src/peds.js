import { PEDS } from './config.js';
import { isVisible } from './camera.js';
import { isBlockedForRadius } from './city.js';
import { clamp, distance, pick, roundRect, wrapAngle } from './util.js';
import { spawnDust } from './effects.js';
import { dropPedPickup } from './pickups.js';

const SKIN = ['#e4b08a', '#c98d62', '#f0c7a0', '#9e674a', '#d99d75', '#7d513c'];
const SHIRTS = ['#e06d5a', '#74a6a6', '#e1b153', '#a8ad7d', '#c58ba4', '#6f93b4', '#e6d5b2', '#b66b4b'];
const PANTS = ['#405761', '#6e604d', '#8b7b62', '#3e4c57', '#7b4c3d', '#d6cbb0'];
const BEACH_SHIRTS = ['#f2b04e', '#56b7b2', '#ee6d88', '#ebd8a2', '#7bbf86'];

let pedSerial = 1;

function pickPoint(segment, rng) {
  if (segment.horizontal) {
    return {
      x: segment.x + 8 + rng() * Math.max(1, segment.w - 16),
      y: segment.y + 4 + rng() * Math.max(1, segment.h - 8),
    };
  }
  return {
    x: segment.x + 4 + rng() * Math.max(1, segment.w - 8),
    y: segment.y + 8 + rng() * Math.max(1, segment.h - 16),
  };
}

function makePed(state, city, x, y, segment, options = {}) {
  const rng = state.rng;
  const beach = options.beach ?? (x < 900 || rng() < 0.22);
  const target = segment ? pickPoint(segment, rng) : { x: x + Math.cos(rng() * Math.PI * 2) * 120, y: y + Math.sin(rng() * Math.PI * 2) * 120 };
  return {
    id: `ped-${pedSerial++}`,
    x,
    y,
    angle: Math.atan2(target.y - y, target.x - x),
    targetX: target.x,
    targetY: target.y,
    segment,
    beach,
    skin: pick(SKIN, rng),
    shirt: pick(beach ? BEACH_SHIRTS : SHIRTS, rng),
    pants: beach ? pick(['#d8c08e', '#7995a3', '#e0a774'], rng) : pick(PANTS, rng),
    walkSpeed: PEDS.walkSpeed * (0.78 + rng() * 0.42),
    speed: 0,
    walkPhase: rng() * Math.PI * 2,
    health: 100,
    down: false,
    downTimer: 0,
    fleeTimer: 0,
    vx: 0,
    vy: 0,
    bob: rng() * 3,
  };
}

export function spawnPedAt(state, city, x, y, options = {}) {
  if (state.peds.length >= PEDS.maxPeds) return null;
  let segment = null;
  let bestDist = Infinity;
  for (const candidate of city.sidewalkSegments) {
    const cx = candidate.x + candidate.w * 0.5;
    const cy = candidate.y + candidate.h * 0.5;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      segment = candidate;
    }
  }
  const ped = makePed(state, city, x, y, segment, options);
  if (options.fleeing) {
    ped.fleeTimer = PEDS.fleeTime;
    ped.targetX = x + Math.cos(ped.angle) * 220;
    ped.targetY = y + Math.sin(ped.angle) * 220;
  }
  state.peds.push(ped);
  return ped;
}

export function spawnFleeingPed(state, city, x, y, angle) {
  if (state.peds.length >= PEDS.maxPeds) return null;
  const ped = makePed(state, city, x, y, null, {});
  ped.fleeTimer = PEDS.fleeTime;
  const away = angle + Math.PI + (state.rng() - 0.5) * 0.6;
  ped.targetX = x + Math.cos(away) * 220;
  ped.targetY = y + Math.sin(away) * 220;
  ped.angle = away;
  state.peds.push(ped);
  return ped;
}

export function seedPeds(state, city, count = 9) {
  const segments = nearbySegments(state, city, 1100);
  for (let i = 0; i < count && state.peds.length < PEDS.maxPeds; i++) {
    const segment = segments.length ? segments[Math.floor(state.rng() * segments.length)] : null;
    if (!segment) break;
    const point = pickPoint(segment, state.rng);
    state.peds.push(makePed(state, city, point.x, point.y, segment));
  }
}

function nearbySegments(state, city, radius) {
  const player = state.player;
  const segments = [];
  for (const segment of city.sidewalkSegments) {
    const cx = segment.x + segment.w * 0.5;
    const cy = segment.y + segment.h * 0.5;
    const d = Math.hypot(cx - player.x, cy - player.y);
    if (d > 150 && d < radius) segments.push(segment);
  }
  const p = city.promenade;
  const promenade = { x: p.x, y: 0, w: p.w, h: city.height, horizontal: false, promenade: true };
  const px = p.x + p.w * 0.5;
  if (Math.abs(px - player.x) < radius) segments.push(promenade);
  return segments;
}

function spawnPedNearby(state, city) {
  if (state.peds.length >= PEDS.maxPeds) return;
  const segments = nearbySegments(state, city, PEDS.spawnRadiusMax);
  if (!segments.length) return;
  const segment = segments[Math.floor(state.rng() * segments.length)];
  const point = pickPoint(segment, state.rng);
  if (distance(state.player.x, state.player.y, point.x, point.y) < PEDS.spawnRadiusMin) return;
  state.peds.push(makePed(state, city, point.x, point.y, segment));
}

export function stepPeds(state, dt, city) {
  if (state.noise.life > 0) state.noise.life = Math.max(0, state.noise.life - dt);
  state.pedSpawnTimer -= dt;
  if (state.pedSpawnTimer <= 0) {
    state.pedSpawnTimer = 0.42;
    spawnPedNearby(state, city);
  }

  const player = state.player;
  for (const ped of state.peds) {
    if (ped.down) {
      if (!ped.dropped) {
        ped.dropped = true;
        dropPedPickup(state, ped.x, ped.y);
      }
      ped.downTimer -= dt;
      ped.x += ped.vx * dt;
      ped.y += ped.vy * dt;
      ped.vx *= Math.exp(-4 * dt);
      ped.vy *= Math.exp(-4 * dt);
      continue;
    }

    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0 && shouldFlee(state, city, ped)) {
      ped.fleeTimer = PEDS.fleeTime;
      let threatX = state.noise.x;
      let threatY = state.noise.y;
      if (state.noise.life <= 0) {
        let best = 9999;
        for (const car of state.cars) {
          if (Math.hypot(car.vx, car.vy) < 110) continue;
          const d = distance(ped.x, ped.y, car.x, car.y);
          if (d < best) {
            best = d;
            threatX = car.x;
            threatY = car.y;
          }
        }
      }
      const away = Math.atan2(ped.y - threatY, ped.x - threatX);
      ped.targetX = ped.x + Math.cos(away) * 260;
      ped.targetY = ped.y + Math.sin(away) * 260;
    }

    const isFleeing = ped.fleeTimer > 0;
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 9) {
      if (ped.segment) {
        const point = pickPoint(ped.segment, state.rng);
        ped.targetX = point.x;
        ped.targetY = point.y;
      } else {
        ped.fleeTimer = 0;
      }
    }

    const targetSpeed = isFleeing ? PEDS.fleeSpeed : ped.walkSpeed;
    const desiredAngle = Math.atan2(dy, dx);
    if (dist > 0.5) {
      const turn = wrapAngle(desiredAngle - ped.angle);
      ped.angle = wrapAngle(ped.angle + clamp(turn, -5 * dt, 5 * dt));
    }
    ped.speed += (targetSpeed - ped.speed) * Math.min(1, dt * 5);
    const moveX = Math.cos(ped.angle) * ped.speed * dt;
    const moveY = Math.sin(ped.angle) * ped.speed * dt;
    if (!isBlockedForRadius(city, ped.x + moveX, ped.y + moveY, 6)) {
      ped.x += moveX;
      ped.y += moveY;
    } else {
      ped.angle = wrapAngle(ped.angle + (ped.id.length % 2 ? 1 : -1) * 1.8 * dt);
      ped.speed *= 0.7;
    }
    ped.walkPhase += ped.speed * dt * 0.18;
    if (!isFleeing && Math.random() < 0.003) spawnDust(state, ped.x - 5, ped.y + 5, 1);

    const distToPlayer = distance(ped.x, ped.y, player.x, player.y);
    if (distToPlayer > PEDS.despawnRadius && state.peds.length > 8) ped.remove = true;
    if (ped.fleeTimer > 0 && distToPlayer > 520) ped.fleeTimer = Math.min(ped.fleeTimer, 1.2);
  }

  for (let i = state.peds.length - 1; i >= 0; i--) {
    const ped = state.peds[i];
    if (ped.remove || (ped.down && ped.downTimer <= 0)) {
      state.peds.splice(i, 1);
    }
  }
}

function shouldFlee(state, city, ped) {
  if (state.noise.life > 0 && distance(ped.x, ped.y, state.noise.x, state.noise.y) < 560) return true;
  for (const car of state.cars) {
    if (Math.hypot(car.vx, car.vy) < 135) continue;
    if (distance(ped.x, ped.y, car.x, car.y) < 120) return true;
  }
  return false;
}

export function drawPed(ctx, ped, time) {
  const bob = Math.sin(ped.walkPhase) * (ped.down ? 0 : 1.3);
  ctx.save();
  ctx.fillStyle = 'rgba(35, 23, 20, 0.22)';
  ctx.beginPath();
  ctx.ellipse(ped.x + 7, ped.y + 9, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ped.down) {
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -11, -6, 22, 12, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.translate(ped.x, ped.y + bob);
  ctx.rotate(ped.angle + Math.PI / 2);
  const stride = Math.sin(ped.walkPhase) * 3.8;
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-2.8, 2);
  ctx.lineTo(-3.5, 7 + stride);
  ctx.moveTo(2.8, 2);
  ctx.lineTo(3.5, 7 - stride);
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  roundRect(ctx, -5.5, -6, 11, 14, 5);
  ctx.fill();
  ctx.strokeStyle = ped.skin;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-5, -3);
  ctx.lineTo(-8, 2 + stride);
  ctx.moveTo(5, -3);
  ctx.lineTo(8, 2 - stride);
  ctx.stroke();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -8, 4.3, 0, Math.PI * 2);
  ctx.fill();
  if (ped.beach) {
    ctx.fillStyle = 'rgba(245, 223, 170, 0.8)';
    ctx.beginPath();
    ctx.arc(0, -9.2, 4.6, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  if (ped.fleeTimer > 0) {
    ctx.fillStyle = 'rgba(255, 231, 178, 0.9)';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -16);
  }
  ctx.restore();
}

export function drawPeds(ctx, state, camera, time) {
  for (const ped of state.peds) {
    if (camera && !isVisible(camera, ped.x, ped.y, 28)) continue;
    drawPed(ctx, ped, time);
  }
}
