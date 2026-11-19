import { CAPS, PALETTE } from './config.js';
import { isVisible } from './camera.js';
import { clamp } from './util.js';

function takeParticle(state) {
  for (const particle of state.particles) {
    if (!particle.active) return particle;
  }
  return null;
}

export function addParticle(state, type, x, y, options = {}) {
  const particle = takeParticle(state);
  if (!particle) return null;
  const angle = options.angle ?? Math.random() * Math.PI * 2;
  const speed = options.speed ?? 60;
  particle.active = true;
  particle.type = type;
  particle.x = x;
  particle.y = y;
  particle.vx = options.vx ?? Math.cos(angle) * speed;
  particle.vy = options.vy ?? Math.sin(angle) * speed;
  particle.life = options.life ?? 0.7;
  particle.maxLife = particle.life;
  particle.size = options.size ?? 3;
  particle.color = options.color ?? '#fff1c9';
  particle.gravity = options.gravity ?? 0;
  particle.drag = options.drag ?? 1.6;
  particle.rotation = options.rotation ?? Math.random() * Math.PI;
  particle.spin = options.spin ?? (Math.random() - 0.5) * 6;
  return particle;
}

export function spawnSparks(state, x, y, count = 6, color = '#ffd47a', speed = 210) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    addParticle(state, 'spark', x, y, {
      angle,
      speed: speed * (0.35 + Math.random() * 0.8),
      life: 0.18 + Math.random() * 0.3,
      size: 1 + Math.random() * 2,
      color,
      gravity: 70,
      drag: 2.4,
    });
  }
}

export function spawnBlood(state, x, y, count = 8, angle = 0) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * 1.8;
    addParticle(state, 'blood', x, y, {
      angle: a,
      speed: 35 + Math.random() * 110,
      life: 0.35 + Math.random() * 0.45,
      size: 1.5 + Math.random() * 2.5,
      color: Math.random() < 0.5 ? '#a93332' : '#d2473d',
      drag: 3.5,
      gravity: 90,
    });
  }
}

export function spawnSmoke(state, x, y, count = 1, size = 9) {
  for (let i = 0; i < count; i++) {
    addParticle(state, 'smoke', x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, {
      vx: (Math.random() - 0.5) * 18,
      vy: -18 - Math.random() * 18,
      life: 0.8 + Math.random() * 0.9,
      size: size * (0.7 + Math.random() * 0.7),
      color: Math.random() < 0.3 ? '#c8b8a0' : '#756b61',
      drag: 0.7,
      gravity: -8,
    });
  }
}

export function spawnDust(state, x, y, count = 2) {
  for (let i = 0; i < count; i++) {
    addParticle(state, 'dust', x + (Math.random() - 0.5) * 7, y + 6, {
      vx: (Math.random() - 0.5) * 20,
      vy: -4 - Math.random() * 10,
      life: 0.35 + Math.random() * 0.35,
      size: 3 + Math.random() * 4,
      color: '#d9c49b',
      drag: 2,
    });
  }
}

export function spawnWaterSparkle(state, x, y) {
  addParticle(state, 'water', x, y, {
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.5) * 6,
    life: 0.4 + Math.random() * 0.55,
    size: 1 + Math.random() * 2,
    color: Math.random() < 0.5 ? '#dff7ef' : '#8fe3db',
    drag: 1,
  });
}

export function spawnMuzzleFlash(state, x, y, angle) {
  addParticle(state, 'flash', x, y, {
    vx: Math.cos(angle) * 30,
    vy: Math.sin(angle) * 30,
    life: 0.08,
    size: 9,
    color: '#ffe5a5',
    drag: 8,
  });
  for (let i = 0; i < 4; i++) {
    addParticle(state, 'spark', x, y, {
      angle: angle + (Math.random() - 0.5) * 0.45,
      speed: 120 + Math.random() * 160,
      life: 0.09 + Math.random() * 0.12,
      size: 1 + Math.random(),
      color: '#ffd27a',
      drag: 4,
    });
  }
}

export function spawnExplosion(state, x, y) {
  state.screenFlash = 1;
  state.screenFlashColor = '255, 174, 82';
  state.cameraShake = Math.max(state.cameraShake, 15);
  for (let i = 0; i < 18; i++) {
    addParticle(state, 'fire', x, y, {
      angle: Math.random() * Math.PI * 2,
      speed: 70 + Math.random() * 230,
      life: 0.35 + Math.random() * 0.6,
      size: 6 + Math.random() * 13,
      color: Math.random() < 0.45 ? '#ffd36b' : '#ef6e39',
      drag: 1.4,
      gravity: -20,
    });
  }
  spawnSmoke(state, x, y, 12, 18);
  spawnSparks(state, x, y, 20, '#ffd58a', 310);
  for (let i = 0; i < 8; i++) {
    addParticle(state, 'debris', x, y, {
      angle: Math.random() * Math.PI * 2,
      speed: 60 + Math.random() * 180,
      life: 0.6 + Math.random() * 0.8,
      size: 2 + Math.random() * 4,
      color: Math.random() < 0.5 ? '#4a3d35' : '#8f7360',
      drag: 1.1,
      gravity: 130,
    });
  }
}

export function addSkid(state, x1, y1, x2, y2) {
  state.skidMarks.push({ x1, y1, x2, y2, life: 13, max: 13 });
  if (state.skidMarks.length > CAPS.skids) state.skidMarks.shift();
}

export function stepEffects(state, dt) {
  for (const p of state.particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.vx *= Math.exp(-p.drag * dt);
    p.vy = p.vy * Math.exp(-p.drag * dt) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    if (p.type === 'smoke') p.size += dt * 18;
    if (p.type === 'fire') p.size *= Math.exp(-0.5 * dt);
  }

  for (let i = state.skidMarks.length - 1; i >= 0; i--) {
    const mark = state.skidMarks[i];
    mark.life -= dt;
    if (mark.life <= 0) state.skidMarks.splice(i, 1);
  }

  if (state.screenFlash > 0) state.screenFlash = Math.max(0, state.screenFlash - dt * 2.4);
}

export function drawSkids(ctx, state) {
  for (const mark of state.skidMarks) {
    const alpha = clamp(mark.life / mark.max, 0, 1) * 0.32;
    ctx.strokeStyle = `rgba(35, 28, 25, ${alpha})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2, mark.y2);
    ctx.stroke();
  }
}

export function drawParticles(ctx, state, camera) {
  for (const p of state.particles) {
    if (!p.active) continue;
    if (camera && !isVisible(camera, p.x, p.y, 24 + p.size)) continue;
    const t = clamp(p.life / p.maxLife, 0, 1);
    const alpha = p.type === 'smoke' ? t * 0.45 : t;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === 'spark' || p.type === 'fire' || p.type === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.7, p.size * (0.5 + t * 0.8)), 0, Math.PI * 2);
      ctx.fill();
      if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.8);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      }
    } else if (p.type === 'blood') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'smoke' || p.type === 'dust') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'water') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'debris') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.7);
    }
    ctx.restore();
  }
}

export function drawOceanShimmer(ctx, city, time, camera) {
  const top = camera.y - camera.viewportH / (2 * camera.zoom) - 20;
  const bottom = camera.y + camera.viewportH / (2 * camera.zoom) + 20;
  const left = Math.max(0, camera.x - camera.viewportW / (2 * camera.zoom) - 20);
  const right = Math.min(city.surfX, camera.x + camera.viewportW / (2 * camera.zoom) + 20);
  if (right <= left) return;
  ctx.save();
  ctx.lineWidth = 2;
  for (let y = Math.floor(top / 26) * 26; y < bottom; y += 26) {
    const wobble = Math.sin(time * 0.6 + y * 0.021) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(185, 241, 229, ${0.035 + wobble * 0.055})`;
    ctx.beginPath();
    for (let x = left; x <= right; x += 20) {
      const yy = y + Math.sin(x * 0.034 + time * 0.7 + y * 0.01) * 4;
      if (x === left) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(235, 252, 246, ${0.35 + Math.sin(time * 1.2) * 0.08})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = Math.floor(top / 16) * 16; y < bottom; y += 16) {
    const x = city.surfX + Math.sin(y * 0.044 + time * 1.15) * 6;
    if (y === Math.floor(top / 16) * 16) ctx.moveTo(x - 6, y);
    else ctx.lineTo(x - 6, y);
  }
  ctx.stroke();
  if (Math.random() < 0.22) {
    const sx = 28 + Math.random() * (city.surfX - 40);
    const sy = top + Math.random() * Math.max(1, bottom - top);
    ctx.fillStyle = 'rgba(225, 250, 244, 0.65)';
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSunGlare(ctx, width, height, time) {
  const x = width * 0.15;
  const y = height * 0.10;
  const gradient = ctx.createRadialGradient(x, y, 8, x, y, Math.max(width, height) * 0.65);
  gradient.addColorStop(0, `rgba(255, 226, 151, ${0.31 + Math.sin(time * 0.5) * 0.025})`);
  gradient.addColorStop(0.25, 'rgba(255, 185, 92, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 153, 67, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawWarmOverlay(ctx, width, height, time) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255, 172, 72, 0.17)');
  gradient.addColorStop(0.48, 'rgba(255, 150, 73, 0.095)');
  gradient.addColorStop(1, 'rgba(72, 25, 51, 0.19)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const pulse = 0.035 + Math.sin(time * 0.25) * 0.006;
  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.44, Math.min(width, height) * 0.28,
    width * 0.5, height * 0.5, Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(36, 18, 30, 0)');
  vignette.addColorStop(1, `rgba(42, 19, 30, ${0.30 + pulse})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

export function drawScreenFlash(ctx, state, width, height) {
  if (state.screenFlash <= 0) return;
  ctx.fillStyle = `rgba(${state.screenFlashColor}, ${state.screenFlash * 0.24})`;
  ctx.fillRect(0, 0, width, height);
}

export const EFFECT_COLORS = PALETTE;
