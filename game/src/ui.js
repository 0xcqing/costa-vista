import { FONT, PALETTE } from './config.js';
import { clamp, roundRect } from './util.js';

export function titleMenuItems(hasSave) {
  return [
    { label: 'New Game', action: 'new' },
    ...(hasSave ? [{ label: 'Continue', action: 'continue' }] : []),
    { label: 'Controls', action: 'controls' },
  ];
}

export function pauseMenuItems() {
  return [
    { label: 'Resume', action: 'resume' },
    { label: 'Controls', action: 'controls' },
    { label: 'Quit to Title', action: 'quit' },
  ];
}

export function getMenuRects(width, height, count, pause = false) {
  const w = Math.min(290, width - 60);
  const h = 42;
  const gap = 11;
  const startY = pause ? height * 0.47 : height * 0.59;
  const x = width * 0.5 - w * 0.5;
  const rects = [];
  for (let i = 0; i < count; i++) {
    rects.push({ x, y: startY + i * (h + gap), w, h });
  }
  return rects;
}

export function drawTitle(ctx, width, height, time, items, selected, hasSave) {
  drawTitleBackdrop(ctx, width, height, time);

  const titleSize = clamp(Math.min(width * 0.095, 94), 48, 94);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${titleSize}px ${FONT}`;
  ctx.fillStyle = 'rgba(35, 18, 22, 0.45)';
  ctx.fillText('COSTA VISTA', width * 0.5 + 5, height * 0.31 + 7);
  const titleGradient = ctx.createLinearGradient(0, height * 0.22, 0, height * 0.4);
  titleGradient.addColorStop(0, '#fff4d7');
  titleGradient.addColorStop(0.55, '#ffd58b');
  titleGradient.addColorStop(1, '#e8904e');
  ctx.fillStyle = titleGradient;
  ctx.fillText('COSTA VISTA', width * 0.5, height * 0.31);

  ctx.font = `600 ${clamp(width * 0.014, 13, 18)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 239, 213, 0.82)';
  ctx.fillText('an open-world story of sun and crime', width * 0.5, height * 0.385);

  ctx.strokeStyle = 'rgba(255, 194, 105, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - 138, height * 0.435);
  ctx.lineTo(width * 0.5 + 138, height * 0.435);
  ctx.stroke();

  drawMenu(ctx, width, height, items, selected, false);

  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 238, 208, 0.58)';
  ctx.fillText(hasSave ? 'A save is waiting in the sun.' : 'WASD to move. Mouse to aim. E to drive.', width * 0.5, height - 30);
}

function drawTitleBackdrop(ctx, width, height, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#3e2c55');
  sky.addColorStop(0.32, '#8d4f5f');
  sky.addColorStop(0.6, '#e58c63');
  sky.addColorStop(0.8, '#f3b56e');
  sky.addColorStop(1, '#5d403b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.22;
  const sunY = height * 0.36;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, height * 0.48);
  sunGlow.addColorStop(0, 'rgba(255, 238, 169, 0.95)');
  sunGlow.addColorStop(0.09, 'rgba(255, 212, 117, 0.62)');
  sunGlow.addColorStop(0.36, 'rgba(255, 156, 88, 0.16)');
  sunGlow.addColorStop(1, 'rgba(255, 136, 79, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffe6a8';
  ctx.beginPath();
  ctx.arc(sunX, sunY, clamp(height * 0.055, 28, 56), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(53, 38, 55, 0.34)';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.70);
  ctx.lineTo(width * 0.12, height * 0.63);
  ctx.lineTo(width * 0.23, height * 0.69);
  ctx.lineTo(width * 0.34, height * 0.6);
  ctx.lineTo(width * 0.44, height * 0.68);
  ctx.lineTo(width * 0.58, height * 0.62);
  ctx.lineTo(width * 0.71, height * 0.69);
  ctx.lineTo(width * 0.84, height * 0.61);
  ctx.lineTo(width, height * 0.68);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  const water = ctx.createLinearGradient(0, height * 0.72, 0, height);
  water.addColorStop(0, 'rgba(93, 91, 101, 0.58)');
  water.addColorStop(0.18, 'rgba(39, 57, 68, 0.85)');
  water.addColorStop(1, '#19262f');
  ctx.fillStyle = water;
  ctx.fillRect(0, height * 0.72, width, height * 0.28);
  ctx.strokeStyle = 'rgba(255, 207, 137, 0.20)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const y = height * 0.75 + i * (height * 0.014);
    ctx.beginPath();
    for (let x = 0; x <= width; x += 34) {
      const yy = y + Math.sin(x * 0.018 + time * 0.55 + i) * 2;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  drawPalmSilhouette(ctx, width * 0.82, height * 0.84, Math.min(width, height) * 0.31, time + 0.2);
  drawPalmSilhouette(ctx, width * 0.08, height * 0.92, Math.min(width, height) * 0.25, time + 1.3);
  drawPalmSilhouette(ctx, width * 0.94, height * 0.95, Math.min(width, height) * 0.21, time + 2.2);

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.45, height * 0.22, width * 0.5, height * 0.5, width * 0.72);
  vignette.addColorStop(0, 'rgba(25, 15, 23, 0)');
  vignette.addColorStop(1, 'rgba(25, 15, 23, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawPalmSilhouette(ctx, x, y, size, time) {
  const sway = Math.sin(time * 0.6) * 0.035;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.strokeStyle = '#1d1a22';
  ctx.fillStyle = '#1d1a22';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, size * 0.045);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.08, -size * 0.46, size * 0.005, -size * 0.9);
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const angle = -Math.PI * 0.92 + (i / 8) * Math.PI * 0.9;
    ctx.lineWidth = Math.max(2, size * 0.024);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.9);
    ctx.quadraticCurveTo(
      Math.cos(angle) * size * 0.35,
      -size * 0.9 + Math.sin(angle) * size * 0.28,
      Math.cos(angle) * size * 0.55,
      -size * 0.9 + Math.sin(angle) * size * 0.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPause(ctx, width, height, items, selected, time) {
  ctx.fillStyle = 'rgba(17, 12, 15, 0.66)';
  ctx.fillRect(0, 0, width, height);
  const panelW = Math.min(420, width - 60);
  const panelH = Math.min(410, height - 80);
  const x = width * 0.5 - panelW * 0.5;
  const y = height * 0.5 - panelH * 0.52;
  ctx.fillStyle = 'rgba(29, 22, 23, 0.92)';
  roundRect(ctx, x, y, panelW, panelH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 190, 98, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 42px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('PAUSED', width * 0.5, y + 70);
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('Costa Vista', width * 0.5, y + 101);
  drawMenu(ctx, width, height, items, selected, true);
}

function drawMenu(ctx, width, height, items, selected, pause) {
  const rects = getMenuRects(width, height, items.length, pause);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < items.length; i++) {
    const rect = rects[i];
    const active = i === selected;
    ctx.fillStyle = active ? 'rgba(255, 178, 74, 0.94)' : 'rgba(28, 22, 23, 0.74)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(255, 232, 185, 0.8)' : 'rgba(255, 233, 195, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = active ? '#271b16' : PALETTE.text;
    ctx.fillText(items[i].label, rect.x + rect.w * 0.5, rect.y + rect.h * 0.5 + 0.5);
  }
}

export function drawControls(ctx, width, height, time) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, 'rgba(27, 19, 25, 0.94)');
  bg.addColorStop(1, 'rgba(54, 30, 36, 0.94)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const panelW = Math.min(760, width - 48);
  const panelH = Math.min(520, height - 56);
  const x = width * 0.5 - panelW * 0.5;
  const y = height * 0.5 - panelH * 0.5;
  ctx.fillStyle = 'rgba(21, 16, 18, 0.78)';
  roundRect(ctx, x, y, panelW, panelH, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 190, 98, 0.26)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('CONTROLS', x + 42, y + 58);
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('Sunset driving lessons from the Vista crew.', x + 42, y + 86);

  const controls = [
    ['W A S D', 'Move on foot'],
    ['MOUSE', 'Aim'],
    ['LEFT MOUSE', 'Shoot'],
    ['SHIFT', 'Sprint'],
    ['E', 'Enter or exit vehicle'],
    ['F', 'Steal occupied car'],
    ['SPACE', 'Handbrake while driving'],
    ['W / S', 'Throttle / reverse in car'],
    ['A / D', 'Steer in car'],
    ['ESCAPE', 'Pause'],
    ['M', 'Mute sound'],
    ['W S / ENTER', 'Menu navigation'],
  ];

  const columns = panelW > 620 ? 2 : 1;
  const colW = (panelW - 84) / columns;
  const rowH = 29;
  const startY = y + 128;
  for (let i = 0; i < controls.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx = x + 42 + col * colW;
    const cy = startY + row * rowH;
    ctx.font = `800 11px ${FONT}`;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText(controls[i][0], cx, cy);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(controls[i][1], cx + 142, cy);
  }

  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 239, 211, 0.62)';
  ctx.textAlign = 'center';
  const pulse = 0.65 + Math.sin(time * 2.4) * 0.2;
  ctx.globalAlpha = pulse;
  ctx.fillText('Press ENTER or ESCAPE to go back', width * 0.5, y + panelH - 32);
  ctx.globalAlpha = 1;
}
