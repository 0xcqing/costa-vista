import { nearestSidewalkPoint } from './city.js';
import { snapTo } from './camera.js';
import { resetState } from './state.js';
import { createCar } from './vehicles.js';
import { spawnPedAt } from './peds.js';
import {
  getMissionDefs, setupMissions, startMission,
} from './missions.js';

function addTraffic(state, type, x, y, angle) {
  const car = createCar(type, x, y, angle, {
    occupied: true,
    ai: 'traffic',
    driver: 'npc',
    rng: state.rng,
  });
  car.controls.throttle = 0.45;
  car.controls.steer = 0;
  state.cars.push(car);
  return car;
}

function addCruiser(state, x, y, angle) {
  const car = createCar('police', x, y, angle, {
    occupied: true,
    police: true,
    ai: 'police',
    driver: 'officer',
    rng: state.rng,
  });
  car.baseMaxSpeed = car.maxSpeed;
  car.controls.throttle = 0.8;
  state.cars.push(car);
  return car;
}

function placeOnFoot(state, x, y, aim) {
  state.player.x = x;
  state.player.y = y;
  state.player.aimAngle = aim;
  state.player.angle = aim;
  state.player.inVehicle = null;
}

function placeInCar(state, type, x, y, angle) {
  const car = createCar(type, x, y, angle, { rng: state.rng });
  state.cars.push(car);
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = angle;
  state.player.aimAngle = angle;
  state.player.inVehicle = car;
  car.playerDriven = true;
  car.occupied = true;
  car.parked = false;
  car.driver = 'player';
  car.ai = null;
  car.controls.throttle = 0.7;
  return car;
}

function setMouse(input, x, y) {
  if (!input) return;
  input.mouse.x = x;
  input.mouse.y = y;
  input.held.shoot = false;
}

function setFreeRoamMissions(state, city) {
  setupMissions(state, city, getMissionDefs().map((mission) => mission.id));
}

export function stageShot(name, deps, options = {}) {
  const { state, city, camera, input } = deps;
  const scene = options.scene ?? options.name ?? name ?? 'cover';
  const mute = state.mute;
  resetState(state, { screen: 'playing', mute, money: options.money ?? 8640 });
  state.screen = 'playing';
  state.time = 18;
  state.money = options.money ?? 8640;

  let focusX = 800;
  let focusY = 2600;
  let zoom = 0.84;
  let keepBanner = false;

  if (scene === 'mission') {
    const completed = [getMissionDefs()[0].id];
    setupMissions(state, city, completed);
    startMission(state, city, 1, { banner: true });
    if (state.bigMessage) state.bigMessage.life *= 0.62;
    const missionCar = state.missions.data.car;
    if (missionCar) {
      placeOnFoot(state, missionCar.x - 88, missionCar.y + 34, Math.atan2(missionCar.y - (missionCar.y + 34), missionCar.x - (missionCar.x - 88)));
      spawnPedAt(state, city, missionCar.x - 130, missionCar.y + 110, { beach: true });
      spawnPedAt(state, city, missionCar.x + 75, missionCar.y - 95, { beach: true });
      focusX = missionCar.x - 10;
      focusY = missionCar.y + 20;
    } else {
      placeOnFoot(state, 1210, 2470, 0);
      focusX = 1210;
      focusY = 2470;
    }
    zoom = 0.9;
    state.player.health = 90;
    state.player.armor = 50;
    state.money = 6800;
    keepBanner = true;
    setMouse(input, camera.viewportW * 0.5 + 50, camera.viewportH * 0.5 - 30);
  } else if (scene === 'busted') {
    setFreeRoamMissions(state, city);
    const baseX = 862;
    const baseY = 2550;
    const playerCar = placeInCar(state, options.carType ?? 'sports', baseX, baseY, -Math.PI / 2);
    playerCar.vx = Math.cos(-Math.PI / 2) * 235;
    playerCar.vy = Math.sin(-Math.PI / 2) * 235;
    addCruiser(state, baseX - 38, baseY + 64, -Math.PI / 2 + 0.15);
    addCruiser(state, baseX + 44, baseY + 108, -Math.PI / 2 - 0.14);
    addCruiser(state, baseX - 6, baseY + 154, -Math.PI / 2 + 0.04);
    state.wanted = options.wanted ?? options.wantedLevel ?? 4;
    state.heat = 999;
    state.policeSpawnTimer = 7;
    state.policeRoadblockTimer = 7;
    addTraffic(state, 'sedan', baseX, baseY - 260, -Math.PI / 2);
    addTraffic(state, 'van', 828, baseY - 420, Math.PI / 2);
    spawnPedAt(state, city, 746, baseY - 150, { beach: true });
    focusX = baseX;
    focusY = baseY - 40;
    zoom = 0.88;
    setMouse(input, camera.viewportW * 0.5, camera.viewportH * 0.5 - 70);
  } else if (scene === 'drive' || scene === 'chase') {
    setFreeRoamMissions(state, city);
    const baseX = 862;
    const baseY = 2480;
    const carType = options.carType ?? 'sports';
    const car = placeInCar(state, carType, baseX, baseY, -Math.PI / 2);
    car.vx = Math.cos(-Math.PI / 2) * 245;
    car.vy = Math.sin(-Math.PI / 2) * 245;
    addTraffic(state, 'sedan', baseX, baseY - 235, -Math.PI / 2);
    addTraffic(state, 'taxi', 828, baseY - 420, Math.PI / 2);
    addTraffic(state, 'compact', baseX, baseY - 510, -Math.PI / 2);
    addTraffic(state, 'pickup', 828, baseY - 690, Math.PI / 2);
    addTraffic(state, 'van', 828, baseY + 320, Math.PI / 2);
    addTraffic(state, 'sedan', baseX, baseY + 165, -Math.PI / 2);
    spawnPedAt(state, city, 746, baseY - 120, { beach: true });
    spawnPedAt(state, city, 746, baseY - 280, { beach: true });
    state.player.health = 92;
    state.player.armor = 55;

    if (scene === 'chase') {
      state.wanted = options.wanted ?? options.wantedLevel ?? 3;
      state.heat = 999;
      state.policeSpawnTimer = 8;
      addCruiser(state, baseX - 34, baseY + 98, -Math.PI / 2 + 0.16);
      addCruiser(state, baseX + 38, baseY + 145, -Math.PI / 2 - 0.13);
      addTraffic(state, 'muscle', baseX, baseY - 700, -Math.PI / 2);
    }
    focusX = car.x;
    focusY = car.y - 90;
    zoom = 0.88;
    setMouse(input, camera.viewportW * 0.5, camera.viewportH * 0.5 - 80);
  } else if (scene === 'beach') {
    setFreeRoamMissions(state, city);
    placeOnFoot(state, 744, 2226, Math.PI);
    spawnPedAt(state, city, 738, 2320, { beach: true });
    spawnPedAt(state, city, 750, 2400, { beach: true });
    spawnPedAt(state, city, 620, 2310, { beach: true });
    state.money = 5200;
    focusX = 744;
    focusY = 2226;
    zoom = 0.84;
    setMouse(input, camera.viewportW * 0.5 - 200, camera.viewportH * 0.5);
  } else {
    setFreeRoamMissions(state, city);
    placeOnFoot(state, 852, 2610, 0.15);
    addTraffic(state, 'sedan', 878, 2400, -Math.PI / 2);
    addTraffic(state, 'taxi', 812, 2500, Math.PI / 2);
    addTraffic(state, 'compact', 878, 2240, -Math.PI / 2);
    addTraffic(state, 'pickup', 812, 2760, Math.PI / 2);
    addTraffic(state, 'muscle', 878, 2860, -Math.PI / 2);
    spawnPedAt(state, city, 746, 2515, { beach: true });
    spawnPedAt(state, city, 746, 2690, { beach: true });
    spawnPedAt(state, city, 746, 2605, { beach: true });
    state.money = 9360;
    state.player.health = 88;
    state.player.armor = 48;
    focusX = 800;
    focusY = 2585;
    zoom = 0.8;
    setMouse(input, camera.viewportW * 0.5 - 145, camera.viewportH * 0.5 - 15);
  }

  if (options.position && Number.isFinite(options.position.x) && Number.isFinite(options.position.y)) {
    if (state.player.inVehicle) {
      state.player.inVehicle.x = options.position.x;
      state.player.inVehicle.y = options.position.y;
      state.player.x = options.position.x;
      state.player.y = options.position.y;
      focusX = options.position.x;
      focusY = options.position.y;
    } else {
      state.player.x = options.position.x;
      state.player.y = options.position.y;
      focusX = options.position.x;
      focusY = options.position.y;
    }
  }
  if (Number.isFinite(options.wanted) || Number.isFinite(options.wantedLevel)) {
    state.wanted = Math.max(0, Math.min(5, options.wanted ?? options.wantedLevel));
    state.heat = state.wanted > 0 ? 999 : 0;
  }

  state.noise.life = 0;
  state.screenFlash = 0;
  if (!keepBanner) state.bigMessage = null;
  if (state.missions) state.missions.briefing = null;
  if (state.player.inVehicle) {
    state.player.inVehicle.controls.handbrake = false;
  }
  if (camera) {
    snapTo(camera, focusX, focusY);
    camera.zoom = zoom;
    camera.targetZoom = zoom;
    camera.shakeTime = 0;
    camera.shakeAmount = 0;
  }
  return scene;
}
