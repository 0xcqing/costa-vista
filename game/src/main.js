import {
  MAX_FRAME, PALETTE, PLAYER, SEED, STEP,
} from './config.js';
import { clamp, mulberry32, pointInRect } from './util.js';
import { createState, resetState } from './state.js';
import {
  buildCity, drawCityTiles, nearestSidewalkPoint, prerenderCity,
} from './city.js';
import {
  ACTION_CONFIRM, ACTION_DOWN, ACTION_ENTER_EXIT, ACTION_MUTE, ACTION_PAUSE,
  ACTION_STEAL, ACTION_UP, createInput,
} from './input.js';
import {
  addShake, applyCameraTransform, createCamera, isVisible, setViewport, snapTo,
  updateCamera,
} from './camera.js';
import {
  drawControls, drawPause, drawTitle, getMenuRects, pauseMenuItems, titleMenuItems,
} from './ui.js';
import {
  initAudio, playUiClick, setMuted, toggleMute, updateAudio,
} from './audio.js';
import { loadSave, writeSave } from './save.js';
import { stepPolice, drawPoliceMarkers, drawOfficer } from './police.js';
import { seedTraffic, stepTraffic } from './traffic.js';
import { drawPed, seedPeds, stepPeds } from './peds.js';
import { drawPickups, seedPickups, stepPickups } from './pickups.js';
import {
  acceptMissionBriefing, openMissionBriefing, setupMissions, stepMissions,
} from './missions.js';
import { drawCar, stepVehicles } from './vehicles.js';
import {
  drawPlayer, enterOrExitVehicle, getPlayerPosition, getPlayerVelocity,
  stealNearestVehicle, updatePlayer,
} from './player.js';
import { drawBullets, stepCombat } from './combat.js';
import {
  drawOceanShimmer, drawParticles, drawScreenFlash, drawSkids, drawSunGlare,
  drawWarmOverlay, stepEffects,
} from './effects.js';
import { drawHud, updateHud, showBigMessage } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const ctx = canvas.getContext('2d');

const state = createState();
const city = buildCity(mulberry32(SEED));
prerenderCity(city);
const input = createInput(canvas);
const camera = createCamera();
const deps = { state, city, camera, input };

let dpr = 1;
let accumulator = 0;
let lastTime = performance.now();
let menuMode = 'title';
let titleSelection = 0;
let pauseSelection = 0;
let savedGame = loadSave();
let hasSave = Boolean(savedGame);
if (savedGame) state.mute = savedGame.mute;
let shotPending = false;
let shotPainted = 0;
let shotMode = false;
let mutedHintTime = 0;

window.__shotReady = false;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(240, window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  setViewport(camera, width, height);
}

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function toggleMuteState() {
  state.mute = toggleMute();
  setMuted(state.mute);
  mutedHintTime = 1.4;
  if (state.screen !== 'title') saveProgress();
  announce(state.mute ? 'Sound muted.' : 'Sound on.');
}

function placePlayerAtStart() {
  const start = nearestSidewalkPoint(city, PLAYER.startX, PLAYER.startY);
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.aimAngle = 0;
  state.player.angle = 0;
  snapTo(camera, start.x, start.y);
  camera.zoom = 1;
  camera.targetZoom = 1;
}

function seedWorld() {
  seedTraffic(state, city);
  seedPeds(state, city, 10);
  seedPickups(state, city);
}

function startNewGame() {
  initAudio();
  resetState(state, { screen: 'playing', mute: state.mute });
  setupMissions(state, city, []);
  placePlayerAtStart();
  seedWorld();
  state.screen = 'playing';
  menuMode = 'title';
  accumulator = 0;
  lastTime = performance.now();
  openMissionBriefing(state, city, 0, false);
  announce('Costa Vista. New game. Read the first job briefing.');
}

function startContinue() {
  initAudio();
  const save = loadSave();
  if (!save) {
    startNewGame();
    return;
  }
  resetState(state, {
    screen: 'playing',
    mute: save.mute,
    money: save.money,
    completedMissions: save.completedMissions,
    day: save.day,
  });
  setMuted(state.mute);
  setupMissions(state, city, save.completedMissions);
  placePlayerAtStart();
  seedWorld();
  state.screen = 'playing';
  menuMode = 'title';
  accumulator = 0;
  lastTime = performance.now();
  announce(`Costa Vista. Continued with ${Math.round(state.money)} dollars.`);
}

function saveProgress() {
  if (writeSave(state)) {
    savedGame = loadSave();
    hasSave = Boolean(savedGame);
  }
}

function pauseGame() {
  if (state.screen !== 'playing') return;
  saveProgress();
  state.screen = 'paused';
  menuMode = 'pause';
  pauseSelection = 0;
  accumulator = 0;
  announce('Paused.');
}

function resumeGame() {
  state.screen = 'playing';
  menuMode = 'title';
  accumulator = 0;
  lastTime = performance.now();
  announce('Playing.');
}

function quitToTitle() {
  saveProgress();
  resetState(state, { screen: 'title', mute: state.mute });
  menuMode = 'title';
  titleSelection = 0;
  accumulator = 0;
  announce('Costa Vista. Title screen.');
}

function currentTitleItems() {
  return titleMenuItems(hasSave);
}

function hoverMenu(items, pause) {
  const rects = getMenuRects(camera.viewportW, camera.viewportH, items.length, pause);
  for (let i = 0; i < rects.length; i++) {
    if (pointInRect(input.mouse.x, input.mouse.y, rects[i])) {
      if (pause) pauseSelection = i;
      else titleSelection = i;
      return;
    }
  }
}

function cycleSelection(direction, count, pause) {
  if (count <= 0) return;
  if (pause) pauseSelection = (pauseSelection + direction + count) % count;
  else titleSelection = (titleSelection + direction + count) % count;
}

function chooseTitleItem(item) {
  playUiClick();
  if (item.action === 'new') startNewGame();
  else if (item.action === 'continue') startContinue();
  else if (item.action === 'controls') menuMode = 'title-controls';
}

function choosePauseItem(item) {
  playUiClick();
  if (item.action === 'resume') resumeGame();
  else if (item.action === 'controls') menuMode = 'pause-controls';
  else if (item.action === 'quit') quitToTitle();
}

function handleMenuInput(actions) {
  if (actions & ACTION_MUTE) toggleMuteState();
  if (state.screen === 'title') {
    if (menuMode === 'title-controls') {
      if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) {
        menuMode = 'title';
        playUiClick();
      }
      return;
    }
    const items = currentTitleItems();
    titleSelection = clamp(titleSelection, 0, items.length - 1);
    hoverMenu(items, false);
    if (actions & ACTION_UP) cycleSelection(-1, items.length, false);
    if (actions & ACTION_DOWN) cycleSelection(1, items.length, false);
    if (actions & ACTION_CONFIRM) chooseTitleItem(items[titleSelection]);
    return;
  }

  if (state.screen === 'paused') {
    if (menuMode === 'pause-controls') {
      if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) {
        menuMode = 'pause';
        playUiClick();
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      resumeGame();
      return;
    }
    const items = pauseMenuItems();
    pauseSelection = clamp(pauseSelection, 0, items.length - 1);
    hoverMenu(items, true);
    if (actions & ACTION_UP) cycleSelection(-1, items.length, true);
    if (actions & ACTION_DOWN) cycleSelection(1, items.length, true);
    if (actions & ACTION_CONFIRM) choosePauseItem(items[pauseSelection]);
  }
}

function handlePlayingActions(actions) {
  if (actions & ACTION_MUTE) toggleMuteState();
  if (actions & ACTION_PAUSE) {
    pauseGame();
    return;
  }
  if (state.player.dead) return;
  if (actions & ACTION_ENTER_EXIT) {
    if (enterOrExitVehicle(state, city)) playUiClick();
  }
  if (actions & ACTION_STEAL) {
    if (stealNearestVehicle(state, city)) playUiClick();
  }
}

function stepGame(dt) {
  state.time += dt;
  state.elapsed += dt;
  stepPolice(state, dt, city);
  stepMissions(state, dt, city);
  stepTraffic(state, dt, city);
  stepPeds(state, dt, city);
  stepVehicles(state, dt, city, input);
  updatePlayer(state, dt, input, camera, city);
  stepCombat(state, dt, city);
  stepEffects(state, dt);
  stepPickups(state, dt);
  updateHud(state, dt);
  if (state.saveDirty) {
    saveProgress();
    state.saveDirty = false;
  }
  const velocity = getPlayerVelocity(state);
  const driving = Boolean(state.player.inVehicle);
  const speed = Math.hypot(velocity.x, velocity.y);
  if (driving && speed > 285) {
    state.cameraShake = Math.max(state.cameraShake, (speed - 285) * 0.014);
  }
  if (state.cameraShake > 0) {
    addShake(camera, state.cameraShake);
    state.cameraShake = 0;
  }
  const p = getPlayerPosition(state);
  updateCamera(camera, dt, p, input.mouse, velocity, driving);
}

function drawMissionMarker(ctx, state, time) {
  if (!state.mission || state.mission.completed) return;
  const target = state.mission.target;
  if (!target) return;
  const pulse = Math.sin(time * 3.2) * 0.5 + 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 188, 84, ${0.45 + pulse * 0.25})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 24 + pulse * 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 186, 76, 0.12)';
  ctx.beginPath();
  ctx.arc(target.x, target.y, 42 + pulse * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 219, 145, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target.x, target.y - 5);
  ctx.lineTo(target.x + 7, target.y + 4);
  ctx.lineTo(target.x, target.y + 1);
  ctx.lineTo(target.x - 7, target.y + 4);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawEntities(time) {
  const entities = [];
  for (const car of state.cars) {
    if (!isVisible(camera, car.x, car.y, car.length)) continue;
    entities.push({ y: car.y, draw: () => drawCar(ctx, car, time, state) });
  }
  for (const ped of state.peds) {
    if (!isVisible(camera, ped.x, ped.y, 30)) continue;
    entities.push({ y: ped.y, draw: () => drawPed(ctx, ped, time) });
  }
  for (const officer of state.officers) {
    if (!isVisible(camera, officer.x, officer.y, 30)) continue;
    entities.push({ y: officer.y, draw: () => drawOfficer(ctx, officer, time) });
  }
  const player = state.player;
  if (!player.inVehicle && isVisible(camera, player.x, player.y, 30)) {
    entities.push({ y: player.y, draw: () => drawPlayer(ctx, state, camera) });
  }
  entities.sort((a, b) => a.y - b.y);
  for (const entity of entities) entity.draw();
}


function drawGameWorld(time) {
  const width = camera.viewportW;
  const height = camera.viewportH;
  ctx.fillStyle = PALETTE.oceanDeep;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  applyCameraTransform(ctx, camera);
  drawCityTiles(ctx, city, camera);
  drawOceanShimmer(ctx, city, time, camera);
  drawSkids(ctx, state);
  drawMissionMarker(ctx, state, time);
  drawPickups(ctx, state, camera, time);
  drawEntities(time);
  drawBullets(ctx, state);
  drawParticles(ctx, state, camera);
  drawPoliceMarkers(ctx, state, time);
  ctx.restore();

  drawSunGlare(ctx, width, height, time);
  drawWarmOverlay(ctx, width, height, time);
  drawScreenFlash(ctx, state, width, height);
  drawHud(ctx, state, city, width, height, time);
  if (mutedHintTime > 0) {
    mutedHintTime -= 1 / 60;
    ctx.textAlign = 'center';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 238, 210, 0.7)';
    ctx.fillText(state.mute ? 'SOUND OFF' : 'SOUND ON', width * 0.5, height - 48);
  }
}


function updateGameAudio(dt) {
  const car = state.player.inVehicle;
  let sirenLevel = 0;
  if (state.wanted > 0) {
    const p = getPlayerPosition(state);
    let nearest = Infinity;
    for (const cruiser of state.cars) {
      if (!cruiser.police || cruiser.destroyed) continue;
      nearest = Math.min(nearest, Math.hypot(cruiser.x - p.x, cruiser.y - p.y));
    }
    if (Number.isFinite(nearest)) sirenLevel = clamp(1 - nearest / 1250, 0, 1);
  }
  const p = getPlayerPosition(state);
  const surfLevel = clamp((920 - p.x) / 620, 0, 1);
  const playing = state.screen === 'playing' && !state.missions?.briefing;
  const speed = car && !car.destroyed ? Math.hypot(car.vx, car.vy) : 0;
  updateAudio(dt, {
    driving: playing && Boolean(car) && !car?.destroyed,
    speed,
    sirenLevel: playing ? sirenLevel : 0,
    surfLevel: playing ? surfLevel : 0,
  });
}

function render(now) {
  const time = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = camera.viewportW;
  const height = camera.viewportH;

  if (state.screen === 'title') {
    ctx.clearRect(0, 0, width, height);
    drawTitle(ctx, width, height, time, currentTitleItems(), titleSelection, hasSave);
    if (menuMode === 'title-controls') drawControls(ctx, width, height, time);
    return;
  }

  drawGameWorld(time);
  if (state.screen === 'paused') {
    if (menuMode === 'pause-controls') drawControls(ctx, width, height, time);
    else drawPause(ctx, width, height, pauseMenuItems(), pauseSelection, time);
  }
}

function applyShot(scene, options = {}) {
  shotMode = true;
  menuMode = 'title';
  input.takeActions();
  stageShot(scene, deps, { ...options, scene });
  state.screen = 'playing';
  accumulator = 0;
  lastTime = performance.now();
  shotPending = true;
  shotPainted = 0;
  window.__shotReady = false;
  announce('Costa Vista scene staged.');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME);
  lastTime = now;
  const actions = input.takeActions();

  if (state.screen === 'playing') {
    if (state.missions?.briefing) {
      if (actions & ACTION_MUTE) toggleMuteState();
      if (actions & ACTION_CONFIRM) acceptMissionBriefing(state, city);
      else if (actions & ACTION_PAUSE) pauseGame();
      accumulator = 0;
    } else if (shotMode) {
      accumulator = 0;
    } else {
      handlePlayingActions(actions);
      if (state.screen === 'playing') {
        accumulator += dt;
        while (accumulator >= STEP) {
          stepGame(STEP);
          accumulator -= STEP;
          if (state.screen !== 'playing' || state.missions?.briefing) break;
        }
      }
    }
  } else {
    accumulator = 0;
    handleMenuInput(actions);
  }

  updateGameAudio(dt);
  render(now);
  if (shotPending) {
    shotPainted += 1;
    if (shotPainted >= 2) {
      window.__shotReady = true;
      shotPending = false;
    }
  }
}

function bootShots() {
  if (shotMode) return;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) applyShot(shot, {});
}

window.__cvStage = (options = {}) => {
  const scene = typeof options === 'string' ? options : (options.scene ?? options.name ?? 'cover');
  applyShot(scene, options);
  return 'ok';
};

window.__cvState = () => {
  const p = getPlayerPosition(state);
  return {
    screen: state.screen,
    player: { x: Math.round(p.x), y: Math.round(p.y) },
    wanted: state.wanted,
    carCount: state.cars.length,
    pedestrianCount: state.peds.length,
    mission: state.mission?.name ?? '',
    money: state.money,
    mute: state.mute,
    day: state.day,
    completedMissionCount: state.completedMissions.length,
    driving: Boolean(state.player.inVehicle),
  };
};

window.addEventListener('resize', resize);
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') {
    pauseGame();
    saveProgress();
  }
});

setMuted(state.mute);
resize();

announce('Costa Vista. Use W A S D to move, mouse to aim, left mouse to shoot, E to drive, and F to steal a car.');
bootShots();
requestAnimationFrame(frame);
