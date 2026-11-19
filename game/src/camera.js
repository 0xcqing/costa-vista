import { CAMERA } from './config.js';
import { clamp, damp, normalize } from './util.js';

export function createCamera() {
  return {
    x: 2100,
    y: 2100,
    zoom: 1,
    targetZoom: 1,
    viewportW: 1280,
    viewportH: 720,
    shakeTime: 0,
    shakeAmount: 0,
    shakeX: 0,
    shakeY: 0,
    focusX: 2100,
    focusY: 2100,
  };
}

export function setViewport(camera, width, height) {
  camera.viewportW = Math.max(1, width);
  camera.viewportH = Math.max(1, height);
}

export function snapTo(camera, x, y) {
  camera.x = x;
  camera.y = y;
  camera.focusX = x;
  camera.focusY = y;
}

export function addShake(camera, amount) {
  camera.shakeAmount = Math.max(camera.shakeAmount, amount);
  camera.shakeTime = Math.max(camera.shakeTime, 0.24 + amount * 0.05);
}

export function updateCamera(camera, dt, target, mouse, velocity, driving) {
  const centerX = camera.viewportW * 0.5;
  const centerY = camera.viewportH * 0.5;
  let lookX = 0;
  let lookY = 0;

  if (driving) {
    const dir = normalize(velocity?.x || 0, velocity?.y || 0);
    const speed = Math.hypot(velocity?.x || 0, velocity?.y || 0);
    const amount = clamp(speed * 0.42, 0, CAMERA.lookAheadDriving);
    lookX = dir.x * amount;
    lookY = dir.y * amount;
  } else {
    const dx = (mouse?.x ?? centerX) - centerX;
    const dy = (mouse?.y ?? centerY) - centerY;
    const dir = normalize(dx, dy);
    const amount = clamp((Math.hypot(dx, dy) / Math.max(0.5, camera.zoom)) * 0.28, 0, CAMERA.lookAheadOnFoot);
    lookX = dir.x * amount;
    lookY = dir.y * amount;
  }

  const focusX = target.x + lookX;
  const focusY = target.y + lookY;
  camera.x = damp(camera.x, focusX, CAMERA.followSmooth, dt);
  camera.y = damp(camera.y, focusY, CAMERA.followSmooth, dt);
  camera.focusX = focusX;
  camera.focusY = focusY;

  const speed = Math.hypot(velocity?.x || 0, velocity?.y || 0);
  const speedT = clamp(speed / 430, 0, 1);
  camera.targetZoom = driving
    ? CAMERA.zoomDrivingBase + (CAMERA.zoomDrivingFast - CAMERA.zoomDrivingBase) * speedT
    : CAMERA.zoomOnFoot;
  camera.zoom = damp(camera.zoom, camera.targetZoom, CAMERA.zoomSmooth, dt);

  if (camera.shakeTime > 0) {
    camera.shakeTime = Math.max(0, camera.shakeTime - dt);
    camera.shakeAmount *= Math.exp(-5.2 * dt);
    const strength = camera.shakeAmount;
    camera.shakeX = (Math.random() * 2 - 1) * strength;
    camera.shakeY = (Math.random() * 2 - 1) * strength;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
    camera.shakeAmount = 0;
  }
}

export function applyCameraTransform(ctx, camera) {
  ctx.translate(camera.viewportW * 0.5 + camera.shakeX, camera.viewportH * 0.5 + camera.shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

export function worldToScreen(camera, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + camera.viewportW * 0.5 + camera.shakeX,
    y: (y - camera.y) * camera.zoom + camera.viewportH * 0.5 + camera.shakeY,
  };
}

export function screenToWorld(camera, x, y) {
  return {
    x: (x - camera.viewportW * 0.5 - camera.shakeX) / camera.zoom + camera.x,
    y: (y - camera.viewportH * 0.5 - camera.shakeY) / camera.zoom + camera.y,
  };
}

export function getViewBounds(camera, padding = 80) {
  const halfW = camera.viewportW / (2 * camera.zoom);
  const halfH = camera.viewportH / (2 * camera.zoom);
  return {
    x: camera.x - halfW - padding,
    y: camera.y - halfH - padding,
    w: halfW * 2 + padding * 2,
    h: halfH * 2 + padding * 2,
  };
}

export function isVisible(camera, x, y, radius = 40) {
  const halfW = camera.viewportW / (2 * camera.zoom) + radius;
  const halfH = camera.viewportH / (2 * camera.zoom) + radius;
  return Math.abs(x - camera.x) <= halfW && Math.abs(y - camera.y) <= halfH;
}
