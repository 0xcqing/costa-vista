import { CAPS, PALETTE, PLAYER } from './config.js';
import { notify } from './state.js';
import { playPickup } from './audio.js';
import { spawnSparks } from './effects.js';
import { isVisible } from './camera.js';
import { clamp, roundRect } from './util.js';
import { nearestSidewalkPoint } from './city.js';

const SPRINKLE_POINTS = [
  [1240, 2240], [1980, 1680], [2620, 2420], [3050, 1080],
  [3480, 2820], [1660, 3380], [880, 2650], [2320, 3320],
  [3740, 1560], [1460, 1160], [754, 3080], [2820, 3820],
];

let pickupSerial = 1;

export function spawnPickup(state, type, x, y, options = {}) {
  if (state.pickups.length >= CAPS.pickups) state.pickups.shift();
  const pickup = {
    id: `pickup-${pickupSerial++}`,
    type,
    x,
    y,
    amount: options.amount ?? (type === 'cash' ? 90 : type === 'health' ? 34 : 48),
    phase: options.phase ?? Math.random() * Math.PI * 2,
    source: options.source ?? 'street',
  };
  state.pickups.push(pickup);
  return pickup;
}

export function seedPickups(state, city) {
  state.pickups = [];
  for (let i = 0; i < SPRINKLE_POINTS.length; i++) {
    const [x, y] = SPRINKLE_POINTS[i];
    const p = nearestSidewalkPoint(city, x, y);
    const type = i % 5 === 0 ? 'health' : i % 7 === 0 ? 'armor' : 'cash';
    spawnPickup(state, type, p.x, p.y, {
      amount: type === 'cash' ? 75 + (i % 4) * 35 : 34 + (i % 3) * 8,
      phase: i * 0.8,
      source: 'street',
    });
  }
}

export function dropPedPickup(state, x, y) {
  if (Math.random() < 0.48) {
    spawnPickup(state, Math.random() < 0.35 ? 'health' : 'cash', x + (Math.random() - 0.5) * 9, y + (Math.random() - 0.5) * 9, {
      amount: 40 + Math.floor(Math.random() * 70),
      source: 'ped',
    });
  }
}

export function dropCruiserPickup(state, x, y) {
  const type = Math.random() < 0.55 ? 'armor' : 'cash';
  spawnPickup(state, type, x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16, {
    amount: type === 'cash' ? 120 + Math.floor(Math.random() * 120) : 55,
    source: 'cruiser',
  });
}

export function stepPickups(state, dt) {
  const car = state.player.inVehicle;
  const px = car && !car.destroyed ? car.x : state.player.x;
  const py = car && !car.destroyed ? car.y : state.player.y;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pickup = state.pickups[i];
    if (Math.hypot(pickup.x - px, pickup.y - py) > 33) continue;
    if (pickup.type === 'cash') {
      state.money += pickup.amount;
      notify(state, `Found ${pickup.amount} dollars.`);
      state.saveDirty = true;
    } else if (pickup.type === 'health') {
      state.player.health = clamp(state.player.health + pickup.amount, 0, PLAYER.maxHealth);
      notify(state, 'Health pack used.');
    } else {
      state.player.armor = clamp(state.player.armor + pickup.amount, 0, PLAYER.maxArmor);
      notify(state, 'Armor vest strapped on.');
    }
    spawnSparks(state, pickup.x, pickup.y, 14, pickup.type === 'cash' ? '#ffe08b' : pickup.type === 'health' ? '#89e59a' : '#8fc8ee', 145);
    playPickup();
    state.pickups.splice(i, 1);
  }
}

export function drawPickups(ctx, state, camera, time) {
  for (const pickup of state.pickups) {
    if (camera && !isVisible(camera, pickup.x, pickup.y, 42)) continue;
    drawPickup(ctx, pickup, time);
  }
}

export function drawPickup(ctx, pickup, time) {
  const bob = Math.sin(time * 2.6 + pickup.phase) * 4;
  const hue = pickup.type === 'cash' ? '255, 194, 83' : pickup.type === 'health' ? '111, 224, 133' : '112, 181, 226';
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.fillStyle = 'rgba(58, 39, 19, 0.22)';
  ctx.beginPath();
  ctx.ellipse(7, 13, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 30 + Math.sin(time * 3 + pickup.phase) * 4);
  glow.addColorStop(0, `rgba(${hue}, 0.34)`);
  glow.addColorStop(1, `rgba(${hue}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();

  if (pickup.type === 'cash') {
    ctx.fillStyle = '#5f8b57';
    ctx.fillRect(-11, -6, 22, 13);
    ctx.fillStyle = '#88b16c';
    ctx.fillRect(-11, -8, 22, 5);
    ctx.fillStyle = '#f4dfa5';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  } else if (pickup.type === 'health') {
    ctx.fillStyle = '#eff0dc';
    roundRect(ctx, -9, -10, 18, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#5cc878';
    ctx.fillRect(-2.5, -7, 5, 14);
    ctx.fillRect(-7, -2.5, 14, 5);
  } else {
    ctx.fillStyle = '#405b6b';
    roundRect(ctx, -9, -10, 18, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#7bb5dc';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(242, 250, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
