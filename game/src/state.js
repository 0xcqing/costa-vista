import { CAPS, PLAYER, SEED } from './config.js';
import { mulberry32 } from './util.js';

function makeBullet() {
  return {
    active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    life: 0, damage: 0, hostile: false, fromPlayer: false,
  };
}

function makeParticle() {
  return {
    active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, size: 2, color: '#fff', gravity: 0,
    drag: 0.9, rotation: 0, spin: 0,
  };
}

export function createState() {
  const state = {
    screen: 'title',
    day: 1,
    saveDirty: false,
    time: 0,
    elapsed: 0,
    money: 500,
    wanted: 0,
    heat: 0,
    wantedDecay: 0,
    pendingWanted: 0,
    pendingExplosions: [],
    policeSpawnTimer: 0,
    policeRoadblockTimer: 0,
    playerBustedAt: -999,
    bustTimer: 0,
    trafficTimer: 0,
    parkedTimer: 0,
    pedSpawnTimer: 0,
    mute: false,
    rng: mulberry32(SEED + 7),
    screenFlash: 0,
    screenFlashColor: '255, 220, 150',
    cameraShake: 0,
    noise: { x: 0, y: 0, life: 0 },
    player: {},
    cars: [],
    peds: [],
    officers: [],
    missions: null,
    pickups: [],
    bullets: Array.from({ length: CAPS.bullets }, makeBullet),
    particles: Array.from({ length: CAPS.particles }, makeParticle),
    skidMarks: [],
    notifications: [],
    bigMessage: null,
    mission: {},
    completedMissions: [],
    stats: {},
    usedParking: new Set(),
  };
  resetState(state, { screen: 'title' });
  return state;
}

export function resetState(state, options = {}) {
  const mute = options.mute ?? state.mute;
  const completed = options.completedMissions ?? [];
  const day = options.day ?? 1;
  state.screen = options.screen ?? 'playing';
  state.day = day;
  state.saveDirty = false;
  state.time = 0;
  state.elapsed = 0;
  state.money = options.money ?? 500;
  state.wanted = 0;
  state.heat = 0;
  state.wantedDecay = 0;
  state.pendingWanted = 0;
  state.pendingExplosions = [];
  state.policeSpawnTimer = 0;
  state.policeRoadblockTimer = 0;
  state.playerBustedAt = -999;
  state.bustTimer = 0;
  state.trafficTimer = 0;
  state.parkedTimer = 0;
  state.pedSpawnTimer = 0;
  state.mute = Boolean(mute);
  state.rng = mulberry32(SEED + 7);
  state.screenFlash = 0;
  state.screenFlashColor = '255, 220, 150';
  state.cameraShake = 0;
  state.noise = { x: 0, y: 0, life: 0 };
  state.cars = [];
  state.peds = [];
  state.officers = [];
  state.missions = null;
  state.pickups = [];
  state.skidMarks = [];
  state.notifications = [];
  state.bigMessage = null;
  state.completedMissions = completed.slice();
  state.usedParking = new Set();

  for (const bullet of state.bullets) bullet.active = false;
  for (const particle of state.particles) particle.active = false;

  state.player = {
    x: PLAYER.startX,
    y: PLAYER.startY,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    armor: PLAYER.maxArmor * 0.6,
    radius: PLAYER.radius,
    inVehicle: null,
    dead: false,
    deadTimer: 0,
    fireTimer: 0,
    walkPhase: 0,
    moving: false,
    sprinting: false,
    invulnerable: 0,
    knockdown: 0,
    pendingDamage: 0,
    hurtFlash: 0,
    footstepTimer: 0,
  };

  state.mission = {
    id: 'free-roam',
    name: 'Costa Vista',
    stage: 0,
    objective: '',
    target: null,
    completed: false,
    reward: 0,
    timeLeft: null,
    timer: 0,
  };

  state.stats = {
    shotsFired: 0,
    pedsDown: 0,
    carsDestroyed: 0,
    crashes: 0,
    distanceWalked: 0,
  };
}

export function notify(state, text, duration = 3.4) {
  state.notifications.push({ text, life: duration, max: duration });
  if (state.notifications.length > 6) state.notifications.shift();
}

export function noteNoise(state, x, y) {
  state.noise.x = x;
  state.noise.y = y;
  state.noise.life = 0.7;
}
