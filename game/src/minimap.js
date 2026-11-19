import { PALETTE } from './config.js';
import { clamp, roundRect } from './util.js';
import { districtAt } from './city.js';

export function drawMinimap(ctx, state, city, rect, time) {
  const car = state.player.inVehicle;
  const p = car && !car.destroyed ? { x: car.x, y: car.y } : { x: state.player.x, y: state.player.y };
  const scale = Math.min(rect.w / 1500, rect.h / 1125);
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;

  function mapX(x) {
    return cx + (x - p.x) * scale;
  }
  function mapY(y) {
    return cy + (y - p.y) * scale;
  }
  function rectPath(x, y, w, h) {
    ctx.rect(mapX(x), mapY(y), w * scale, h * scale);
  }

  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
  ctx.clip();
  ctx.fillStyle = '#9d8968';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.fillStyle = PALETTE.ocean;
  ctx.fillRect(mapX(0), rect.y, city.ocean.w * scale, rect.h);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(mapX(city.beach.x), rect.y, city.beach.w * scale, rect.h);
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.beginPath();
  for (const block of city.blocks) rectPath(block.x, block.y, block.w, block.h);
  ctx.fill();
  ctx.fillStyle = PALETTE.park;
  ctx.beginPath();
  for (const block of city.blocks) {
    if (block.kind === 'park' && block.parkRect) rectPath(block.parkRect.x, block.parkRect.y, block.parkRect.w, block.parkRect.h);
  }
  ctx.fill();

  ctx.fillStyle = '#6c665f';
  ctx.beginPath();
  for (const road of city.roads) rectPath(road.x, road.y, road.w, road.h);
  ctx.fill();

  ctx.fillStyle = '#76553c';
  ctx.fillRect(mapX(city.pier.x), mapY(city.pier.y), city.pier.w * scale, city.pier.h * scale);

  ctx.fillStyle = 'rgba(235, 196, 126, 0.7)';
  for (const car of state.cars) {
    if (car === state.player.inVehicle) continue;
    if (car.police) continue;
    const x = mapX(car.x);
    const y = mapY(car.y);
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
  }

  for (const car of state.cars) {
    if (!car.police) continue;
    const x = mapX(car.x);
    const y = mapY(car.y);
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    const flash = Math.sin(time * 12 + car.sirenPhase) > 0;
    if (!car.destroyed) {
      ctx.strokeStyle = flash ? 'rgba(255, 91, 83, 0.75)' : 'rgba(93, 156, 255, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 4.5 + (Math.sin(time * 9) + 1) * 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = car.destroyed ? '#4a4643' : flash ? '#ff5b53' : '#5d9cff';
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const officer of state.officers) {
    if (officer.faction !== 'police' || officer.down) continue;
    const x = mapX(officer.x);
    const y = mapY(officer.y);
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    ctx.fillStyle = Math.sin(time * 12) > 0 ? '#ff746c' : '#77a9ff';
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }

  ctx.fillStyle = 'rgba(244, 233, 209, 0.55)';
  for (const ped of state.peds) {
    const x = mapX(ped.x);
    const y = mapY(ped.y);
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  }

  if (state.mission && state.mission.target) {
    const target = state.mission.target;
    const mx = clamp(mapX(target.x), rect.x + 10, rect.x + rect.w - 10);
    const my = clamp(mapY(target.y), rect.y + 10, rect.y + rect.h - 10);
    const pulse = 3 + Math.sin(time * 4) * 1.4;
    ctx.fillStyle = 'rgba(255, 183, 76, 0.24)';
    ctx.beginPath();
    ctx.arc(mx, my, pulse + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.arc(mx, my, pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  const angle = state.player.inVehicle ? state.player.inVehicle.angle : state.player.aimAngle;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#fff5dd';
  ctx.strokeStyle = 'rgba(60, 36, 25, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, 4.5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, -4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(30, 23, 24, 0.62)';
  roundRect(ctx, rect.x + 7, rect.y + 7, 23, 17, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', rect.x + 18.5, rect.y + 16);

  const district = districtAt(city, p.x, p.y).toUpperCase();
  ctx.textAlign = 'left';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 242, 216, 0.9)';
  const labelWidth = ctx.measureText(district).width + 12;
  ctx.fillStyle = 'rgba(30, 23, 24, 0.58)';
  roundRect(ctx, rect.x + 7, rect.y + rect.h - 22, labelWidth, 15, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 242, 216, 0.9)';
  ctx.fillText(district, rect.x + 13, rect.y + rect.h - 14.5);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 238, 205, 0.42)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x + 0.75, rect.y + 0.75, rect.w - 1.5, rect.h - 1.5, 12);
  ctx.stroke();
}
