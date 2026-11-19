import { FONT, PALETTE, PLAYER } from './config.js';
import { clamp, formatMoney, formatTime, roundRect } from './util.js';
import { drawMinimap } from './minimap.js';

export function showBigMessage(state, text, sub = '', duration = 3.4, color = PALETTE.text) {
  state.bigMessage = { text, sub, life: duration, duration, color };
}

export function updateHud(state, dt) {
  for (let i = state.notifications.length - 1; i >= 0; i--) {
    const toast = state.notifications[i];
    toast.life -= dt;
    if (toast.life <= 0) state.notifications.splice(i, 1);
  }
  if (state.bigMessage) {
    state.bigMessage.life -= dt;
    if (state.bigMessage.life <= 0) state.bigMessage = null;
  }
}

export function drawHud(ctx, state, city, width, height, time) {
  const player = state.player;
  const panelX = 22;
  const panelY = 20;

  ctx.save();
  ctx.textBaseline = 'middle';

  drawStatusPanel(ctx, panelX, panelY, player);
  drawMoneyPanel(ctx, width - 22, panelY, state, time);
  drawObjective(ctx, width, state);
  drawWeapon(ctx, width, height, state);
  if (player.inVehicle && !player.inVehicle.destroyed) drawSpeedometer(ctx, width, height, player.inVehicle);
  drawMinimap(ctx, state, city, { x: 22, y: height - 174, w: 204, h: 153 }, time);
  drawToasts(ctx, state, 22, height - 190);
  drawBigMessage(ctx, state, width, height);
  drawMissionBriefing(ctx, state, width, height, time);
  if (state.mute) {
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 242, 217, 0.55)';
    ctx.fillText('MUTED', width - 22, 123);
  }
  ctx.restore();
}

function drawStatusPanel(ctx, x, y, player) {
  ctx.fillStyle = PALETTE.uiPanel;
  roundRect(ctx, x, y, 218, 65, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 236, 202, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawBar(ctx, x + 14, y + 13, 190, 12, player.health / PLAYER.maxHealth, PALETTE.health, 'HEALTH');
  drawBar(ctx, x + 14, y + 39, 190, 10, player.armor / PLAYER.maxArmor, PALETTE.armor, 'ARMOR');
}

function drawBar(ctx, x, y, w, h, ratio, color, label) {
  ctx.font = `700 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(label, x, y - 7);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const value = clamp(ratio, 0, 1);
  if (value > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, Math.max(h - 2, (w - 2) * value), h - 2, (h - 2) / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
    roundRect(ctx, x + 3, y + 2.5, Math.max(0, (w - 6) * value), 2, 1);
    ctx.fill();
  }
}

function drawMoneyPanel(ctx, right, y, state, time) {
  const panelW = 236;
  const panelH = 84;
  const panelX = right - panelW;
  ctx.fillStyle = PALETTE.uiPanel;
  roundRect(ctx, panelX, y, panelW, panelH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 236, 202, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.font = `800 24px ${FONT}`;
  ctx.fillStyle = 'rgba(22, 17, 18, 0.42)';
  ctx.fillText(formatMoney(state.money), right - 13, y + 19);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(formatMoney(state.money), right - 14, y + 18);

  ctx.textAlign = 'left';
  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('WANTED', panelX + 14, y + 48);
  for (let i = 0; i < 5; i++) {
    const active = i < state.wanted;
    const cx = panelX + 112 + i * 18;
    const cy = y + 48;
    const pulse = active ? 1 + Math.sin(time * 7 + i * 0.7) * 0.12 : 1;
    drawStar(ctx, cx, cy, 7.5 * pulse, 3.4 * pulse);
    if (active) {
      ctx.save();
      ctx.shadowColor = PALETTE.wanted;
      ctx.shadowBlur = 8 + Math.sin(time * 7 + i) * 3;
      ctx.fillStyle = PALETTE.wanted;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(255, 240, 207, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  ctx.textAlign = 'right';
  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 239, 210, 0.62)';
  ctx.fillText(`DAY ${state.day ?? 1}`, right - 14, y + 68);
}

function drawStar(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawObjective(ctx, width, state) {
  const objective = state.mission?.objective ?? '';
  if (!objective) return;
  ctx.font = `700 12px ${FONT}`;
  const textWidth = ctx.measureText(objective).width;
  const panelW = clamp(textWidth + 56, 270, Math.min(560, width - 420));
  const x = width * 0.5 - panelW * 0.5;
  const y = 20;
  ctx.fillStyle = 'rgba(26, 20, 21, 0.78)';
  roundRect(ctx, x, y, panelW, 48, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 198, 104, 0.26)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.moveTo(x + 23, y + 17);
  ctx.lineTo(x + 28, y + 24);
  ctx.lineTo(x + 23, y + 31);
  ctx.lineTo(x + 18, y + 24);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.font = `800 9px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText((state.mission.name || 'MISSION').toUpperCase(), x + 38, y + 17);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(objective, x + 38, y + 32, panelW - (state.mission.timeLeft != null ? 92 : 52));
  if (state.mission.timeLeft != null) {
    ctx.textAlign = 'right';
    ctx.font = `800 11px ${FONT}`;
    ctx.fillStyle = state.mission.timeLeft < 20 ? PALETTE.danger : PALETTE.accent;
    ctx.fillText(formatTime(state.mission.timeLeft), x + panelW - 16, y + 32);
  }
}

function drawWeapon(ctx, width, height, state) {
  const name = state.player.inVehicle ? 'PISTOL / DRIVE-BY' : 'PISTOL';
  ctx.textAlign = 'right';
  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('WEAPON', width - 24, height - 48);
  ctx.font = `800 18px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(name, width - 24, height - 28);
  ctx.font = `600 10px ${FONT}`;
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText('12 ROUNDS', width - 24, height - 12);
}

function drawSpeedometer(ctx, width, height, car) {
  const speed = Math.hypot(car.vx, car.vy) * 0.42;
  const cx = width - 82;
  const cy = height - 130;
  const radius = 44;
  const start = Math.PI * 0.78;
  const end = Math.PI * 2.22;
  ctx.save();
  ctx.fillStyle = 'rgba(26, 20, 21, 0.68)';
  roundRect(ctx, cx - 56, cy - 56, 112, 104, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 238, 205, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
  const t = clamp(speed / 210, 0, 1);
  ctx.strokeStyle = t > 0.75 ? PALETTE.danger : PALETTE.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + (end - start) * t);
  ctx.stroke();

  const needle = start + (end - start) * t;
  ctx.strokeStyle = PALETTE.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needle) * 29, cy + Math.sin(needle) * 29);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = `800 18px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(Math.round(speed).toString(), cx, cy + 25);
  ctx.font = `700 8px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('KM/H', cx, cy + 38);
  ctx.restore();
}

function drawToasts(ctx, state, x, bottomY) {
  const visible = state.notifications.slice(-3);
  let y = bottomY;
  for (let i = visible.length - 1; i >= 0; i--) {
    const toast = visible[i];
    const alpha = clamp(toast.life / 0.5, 0, 1);
    ctx.font = `600 11px ${FONT}`;
    const w = Math.min(330, ctx.measureText(toast.text).width + 24);
    y -= 31;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(25, 20, 21, 0.78)';
    roundRect(ctx, x, y, w, 25, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 191, 92, 0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.fillText(toast.text, x + 12, y + 13, w - 20);
    ctx.globalAlpha = 1;
  }
}

function drawBigMessage(ctx, state, width, height) {
  const message = state.bigMessage;
  if (!message) return;
  const elapsed = message.duration - message.life;
  const alpha = clamp(Math.min(elapsed * 4, message.life * 1.7), 0, 1);
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(23, 17, 18, 0.40)';
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText(message.text, width * 0.5 + 2, height * 0.43 + 3);
  ctx.fillStyle = message.color;
  ctx.fillText(message.text, width * 0.5, height * 0.43);
  if (message.sub) {
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(message.sub, width * 0.5, height * 0.43 + 38);
  }
  ctx.globalAlpha = 1;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawMissionBriefing(ctx, state, width, height, time) {
  const briefing = state.missions?.briefing;
  if (!briefing) return;
  const def = briefing.def;
  ctx.save();
  ctx.fillStyle = 'rgba(18, 12, 15, 0.70)';
  ctx.fillRect(0, 0, width, height);

  const panelW = Math.min(650, width - 64);
  const panelH = Math.min(470, height - 64);
  const x = width * 0.5 - panelW * 0.5;
  const y = height * 0.5 - panelH * 0.5;
  ctx.fillStyle = 'rgba(31, 23, 23, 0.95)';
  roundRect(ctx, x, y, panelW, panelH, 18);
  ctx.fill();
  ctx.strokeStyle = briefing.failed ? 'rgba(239, 98, 82, 0.5)' : 'rgba(255, 185, 90, 0.38)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 10px ${FONT}`;
  ctx.fillStyle = briefing.failed ? PALETTE.danger : PALETTE.accent;
  ctx.fillText(briefing.failed ? 'JOB FAILED' : 'JOB BRIEFING', x + 36, y + 36);
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(def.name.toUpperCase(), x + 36, y + 70);

  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 240, 216, 0.84)';
  const copy = briefing.failed ? briefing.reason + ' The crew is ready to run it again.' : def.briefing;
  const lines = wrapText(ctx, copy, panelW - 72);
  let lineY = y + 108;
  for (const line of lines) {
    ctx.fillText(line, x + 36, lineY);
    lineY += 20;
  }

  lineY += 8;
  ctx.font = `800 9px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('OBJECTIVES', x + 36, lineY);
  lineY += 18;
  ctx.font = `600 12px ${FONT}`;
  for (const objective of def.objectives) {
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('>', x + 36, lineY);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(objective, x + 52, lineY);
    lineY += 20;
  }

  ctx.textAlign = 'right';
  ctx.font = `800 16px ${FONT}`;
  ctx.fillStyle = PALETTE.wanted;
  ctx.fillText(`REWARD  $${def.reward}`, x + panelW - 36, y + panelH - 58);

  ctx.textAlign = 'center';
  ctx.font = `700 11px ${FONT}`;
  const pulse = 0.72 + Math.sin(time * 3) * 0.22;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(briefing.failed ? 'Press ENTER to retry this job' : 'Press ENTER to start this job', width * 0.5, y + panelH - 26);
  ctx.globalAlpha = 1;
  ctx.restore();
}
