import { LOCATIONS } from './config.js';
import { notify } from './state.js';
import { clamp, distance, pick, wrapAngle } from './util.js';
import { createCar, getCarSpeed } from './vehicles.js';
import { nearestRoadPoint, nearestSidewalkPoint } from './city.js';
import { spawnOfficer } from './police.js';
import { shoot } from './combat.js';
import { showBigMessage } from './hud.js';
import { playMissionPassed } from './audio.js';
import { spawnSparks } from './effects.js';

export const MISSION_DEFS = [
  {
    id: 'clockwork-run',
    name: 'Clockwork Run',
    reward: 850,
    timeLimit: 155,
    briefing: 'Mari Aguilar is the sharpest young mechanic at her uncle Rudy\'s garage, but tonight she is the driver. A sealed crate is waiting at the Old Harbor fish market and a buyer is waiting in Palm Grove. Beat the harbor master\'s lockup.',
    objectives: [
      'Collect the sealed crate at the fish market.',
      'Deliver the crate to the Palm Grove clinic.',
    ],
  },
  {
    id: 'blue-marlin',
    name: 'The Blue Marlin',
    reward: 1250,
    briefing: 'Mari spots a cobalt sports car parked by the marina with Palma money in the trunk. The valet is watching it. Take the Blue Marlin to the chop shop and make sure it arrives in one piece.',
    objectives: [
      'Steal the marked Blue Marlin near Marina Row.',
      'Deliver the Blue Marlin to the chop shop.',
    ],
  },
  {
    id: 'smoke-at-the-docks',
    name: 'Smoke at the Docks',
    reward: 1550,
    briefing: 'A Palma runner wants to talk to Rudy. Mari takes the meeting at the fish market instead. Keep your pistol close and your back to the water.',
    objectives: [
      'Meet Rudy\'s contact at the Old Harbor docks.',
      'Survive the Palma ambush and drop the crew.',
    ],
  },
  {
    id: 'the-fast-lane',
    name: 'The Fast Lane',
    reward: 1850,
    timeLimit: 125,
    briefing: 'Rudy traces the Palma courier to a car carrying ledgers across the city. Mari has one chance to put it in the wall before the numbers vanish.',
    objectives: [
      'Wreck the Palma courier car.',
    ],
  },
  {
    id: 'palma-house',
    name: 'Palma House',
    reward: 5000,
    timeLimit: 220,
    briefing: 'Rudy rides shotgun and Mari drives. Take the sedan to the Palma compound, clear the house, then lose five stars on the beach road. This is the last favor Old Harbor owes them.',
    objectives: [
      'Get into Rudy\'s sedan.',
      'Drive Rudy to the Palma compound.',
      'Clear the Palma compound.',
      'Five stars. Escape to the beach.',
    ],
  },
];

function playerPoint(state) {
  const car = state.player.inVehicle;
  return car && !car.destroyed ? { x: car.x, y: car.y } : { x: state.player.x, y: state.player.y };
}

function garagePoint(city) {
  return nearestSidewalkPoint(city, LOCATIONS.garage.x, LOCATIONS.garage.y);
}

export function setupMissions(state, city, completedIds = state.completedMissions) {
  const completed = Array.isArray(completedIds) ? completedIds.slice() : [];
  state.completedMissions = completed;
  const currentIndex = MISSION_DEFS.findIndex((mission) => !completed.includes(mission.id));
  const index = currentIndex < 0 ? MISSION_DEFS.length : currentIndex;
  state.missions = {
    list: MISSION_DEFS,
    currentIndex: index,
    active: false,
    briefing: null,
    data: {},
    freeRoam: index >= MISSION_DEFS.length,
  };
  if (state.missions.freeRoam) setFreeRoam(state);
  else setGarageObjective(state, city);
}

function setGarageObjective(state, city) {
  state.mission = {
    id: 'garage',
    name: 'Rudy\'s Garage',
    stage: 0,
    objective: 'Visit Rudy\'s garage in Old Harbor.',
    target: garagePoint(city),
    completed: false,
    reward: 0,
    timeLeft: null,
    kind: 'garage',
  };
}

function setFreeRoam(state) {
  state.mission = {
    id: 'free-roam',
    name: 'Costa Vista',
    stage: 2,
    objective: 'Free roam. The city is yours.',
    target: null,
    completed: true,
    reward: 0,
    timeLeft: null,
    kind: 'free',
  };
}

export function openMissionBriefing(state, city, index, failed = false, reason = '') {
  if (!state.missions) setupMissions(state, city);
  const missionIndex = clamp(index, 0, MISSION_DEFS.length - 1);
  state.missions.currentIndex = missionIndex;
  state.missions.briefing = {
    def: MISSION_DEFS[missionIndex],
    index: missionIndex,
    failed,
    reason,
  };
  state.missions.active = false;
  state.bigMessage = null;
}

export function acceptMissionBriefing(state, city) {
  if (!state.missions || !state.missions.briefing) return false;
  const briefing = state.missions.briefing;
  state.missions.briefing = null;
  startMission(state, city, briefing.index, { banner: !briefing.failed });
  return true;
}

export function startMission(state, city, index, options = {}) {
  if (!state.missions) setupMissions(state, city);
  const missionIndex = clamp(index, 0, MISSION_DEFS.length - 1);
  const def = MISSION_DEFS[missionIndex];
  cleanupMissionActors(state);
  state.missions.currentIndex = missionIndex;
  state.missions.active = true;
  state.missions.briefing = null;
  state.missions.data = {};
  state.mission = {
    id: def.id,
    name: def.name,
    stage: 0,
    objective: def.objectives[0],
    target: null,
    completed: false,
    reward: def.reward,
    timeLeft: def.timeLimit ?? null,
    kind: 'mission',
  };
  if (options.banner !== false) {
    showBigMessage(state, def.name.toUpperCase(), 'Mission started', 2.6, '#ffd06a');
  }
  setupMissionActors(state, city, def, state.missions.data);
  announceMission(`Mission started: ${def.name}. ${state.mission.objective}`);
  return def;
}

function setupMissionActors(state, city, def, data) {
  if (def.id === 'clockwork-run') {
    data.market = nearestSidewalkPoint(city, 1235, 3180);
    data.clinic = nearestSidewalkPoint(city, 2150, 1090);
    state.mission.target = data.market;
  } else if (def.id === 'blue-marlin') {
    const spot = nearestRoadPoint(city, 1210, 2470);
    const car = createCar('sports', spot.x, spot.y, 0, {
      color: '#357f91',
      occupied: true,
      driver: 'valet',
      parked: true,
      rng: state.rng,
    });
    car.missionCar = def.id;
    car.label = 'Blue Marlin';
    state.cars.push(car);
    data.car = car;
    data.chopShop = nearestSidewalkPoint(city, 1580, 3010);
    state.mission.target = { x: car.x, y: car.y };
  } else if (def.id === 'smoke-at-the-docks') {
    data.docks = nearestSidewalkPoint(city, 1185, 3260);
    data.enemies = [];
    state.mission.target = data.docks;
  } else if (def.id === 'the-fast-lane') {
    const spot = nearestRoadPoint(city, 2660, 1710);
    const car = createCar('muscle', spot.x, spot.y, Math.PI * 0.5, {
      color: '#292423',
      occupied: true,
      driver: 'npc',
      ai: 'traffic',
      health: 145,
      rng: state.rng,
    });
    car.missionCar = def.id;
    car.cruiseSpeed = 0.66;
    car.traffic = null;
    car.controls.throttle = 0.7;
    state.cars.push(car);
    data.courier = car;
    state.mission.target = { x: car.x, y: car.y };
  } else if (def.id === 'palma-house') {
    const spot = nearestRoadPoint(city, LOCATIONS.garage.x + 60, LOCATIONS.garage.y + 30);
    const car = createCar('sedan', spot.x, spot.y, 0, {
      color: '#d3ad65',
      occupied: false,
      parked: true,
      rng: state.rng,
    });
    car.missionCar = def.id;
    car.label = 'Rudy\'s Sedan';
    state.cars.push(car);
    data.allyCar = car;
    data.compound = nearestSidewalkPoint(city, 3560, 3340);
    data.escape = nearestSidewalkPoint(city, 790, 3860);
    data.chaseCars = [];
    data.enemies = [];
    state.mission.target = { x: car.x, y: car.y };
  }
}

export function stepMissions(state, dt, city) {
  const manager = state.missions;
  if (!manager || manager.briefing) return;
  const playerPos = playerPoint(state);

  if (!manager.active) {
    if (manager.freeRoam) return;
    if (!state.mission.target) setGarageObjective(state, city);
    const garage = state.mission.target;
    if (garage && distance(playerPos.x, playerPos.y, garage.x, garage.y) < 74) {
      openMissionBriefing(state, city, manager.currentIndex, false);
    }
    return;
  }

  const def = manager.list[manager.currentIndex];
  if (!def) return;
  const data = manager.data;
  if (typeof state.mission.timeLeft === 'number') {
    state.mission.timeLeft -= dt;
    if (state.mission.timeLeft <= 0) {
      failMission(state, city, 'The clock ran out.');
      return;
    }
  }

  if (def.id === 'clockwork-run') {
    if (state.mission.stage === 0 && distance(playerPos.x, playerPos.y, data.market.x, data.market.y) < 58) {
      state.mission.stage = 1;
      state.mission.objective = def.objectives[1];
      state.mission.target = data.clinic;
      notify(state, 'Crate secured. The clinic is waiting.');
      spawnSparks(state, playerPos.x, playerPos.y, 12, '#ffd57c', 120);
    } else if (state.mission.stage === 1 && distance(playerPos.x, playerPos.y, data.clinic.x, data.clinic.y) < 62) {
      completeMission(state, city);
    }
  } else if (def.id === 'blue-marlin') {
    const car = data.car;
    if (!car || car.destroyed || !state.cars.includes(car)) {
      failMission(state, city, 'The Blue Marlin is lost.');
      return;
    }
    if (state.mission.stage === 0) {
      state.mission.target = { x: car.x, y: car.y };
      if (state.player.inVehicle === car) {
        state.mission.stage = 1;
        state.mission.objective = def.objectives[1];
        state.mission.target = data.chopShop;
        notify(state, 'Blue Marlin acquired. Keep the paint clean.');
      }
    } else if (state.mission.stage === 1) {
      if (state.player.inVehicle !== car) {
        if (distance(playerPos.x, playerPos.y, data.chopShop.x, data.chopShop.y) < 80) {
          notify(state, 'The chop shop needs the car, not just you.');
        }
      } else if (distance(car.x, car.y, data.chopShop.x, data.chopShop.y) < 72) {
        completeMission(state, city);
      }
    }
  } else if (def.id === 'smoke-at-the-docks') {
    if (state.mission.stage === 0) {
      if (distance(playerPos.x, playerPos.y, data.docks.x, data.docks.y) < 82) {
        state.mission.stage = 1;
        state.mission.objective = def.objectives[1];
        state.mission.target = data.docks;
        spawnAmbush(state, city, playerPos, data);
        showBigMessage(state, 'AMBUSH', 'Palma crew, coming in hot.', 2.6, '#ef7b5f');
      }
    } else {
      if (distance(playerPos.x, playerPos.y, data.docks.x, data.docks.y) > 440) {
        failMission(state, city, 'You left the meet behind.');
        return;
      }
      if (enemiesDown(state, data.enemies)) completeMission(state, city);
    }
  } else if (def.id === 'the-fast-lane') {
    const courier = data.courier;
    if (courier && state.cars.includes(courier)) {
      state.mission.target = { x: courier.x, y: courier.y };
      if (courier.destroyed || courier.health <= 0) completeMission(state, city);
    } else {
      failMission(state, city, 'The courier got away with the ledgers.');
    }
  } else if (def.id === 'palma-house') {
    stepPalmaHouse(state, city, def, data, playerPos);
  }
}

function stepPalmaHouse(state, city, def, data, playerPos) {
  const car = data.allyCar;
  if (state.mission.stage < 2 && (!car || car.destroyed || !state.cars.includes(car))) {
    failMission(state, city, 'Rudy\'s ride is gone.');
    return;
  }

  if (state.mission.stage === 0) {
    state.mission.target = { x: car.x, y: car.y };
    if (state.player.inVehicle === car) {
      state.mission.stage = 1;
      state.mission.objective = def.objectives[1];
      state.mission.target = data.compound;
      notify(state, 'Rudy is aboard. Keep the sedan in one piece.');
      spawnSyndicateChase(state, city, playerPos, data);
    }
  } else if (state.mission.stage === 1) {
    state.mission.target = data.compound;
    updateSyndicateChase(state, city, data);
    if (car.health < 45 && !data.warned) {
      data.warned = true;
      notify(state, 'The sedan is smoking. Rudy is not impressed.');
    }
    if (state.player.inVehicle === car && distance(car.x, car.y, data.compound.x, data.compound.y) < 82) {
      state.mission.stage = 2;
      state.mission.objective = def.objectives[2];
      state.mission.target = data.compound;
      state.mission.timeLeft = null;
      removeChaseCars(state, data);
      spawnCompoundCrew(state, city, data);
      showBigMessage(state, 'PALMA HOUSE', 'Clear the compound.', 2.6, '#f0a05e');
    }
  } else if (state.mission.stage === 2) {
    if (car.destroyed) {
      failMission(state, city, 'Rudy\'s sedan was destroyed.');
      return;
    }
    if (enemiesDown(state, data.enemies)) {
      state.mission.stage = 3;
      state.mission.objective = def.objectives[3];
      state.mission.target = data.escape;
      state.mission.timeLeft = 100;
      state.wanted = 5;
      state.heat = 999;
      state.wantedDecay = 0;
      state.pendingWanted = 0;
      state.policeRoadblockTimer = 0;
      state.policeSpawnTimer = 0;
      showBigMessage(state, 'FIVE STARS', 'Rudy is clear. Get to the beach road.', 3.2, '#ff7a62');
    }
  } else if (state.mission.stage === 3) {
    if (distance(playerPos.x, playerPos.y, data.escape.x, data.escape.y) < 85) {
      state.wanted = 0;
      state.heat = 0;
      state.pendingWanted = 0;
      completeMission(state, city);
    }
  }
}

function spawnAmbush(state, city, playerPos, data) {
  const offsets = [
    { x: 120, y: -70 }, { x: 175, y: 70 }, { x: -120, y: -100 }, { x: -150, y: 95 },
  ];
  data.enemies = [];
  for (const offset of offsets) {
    const p = nearestSidewalkPoint(city, playerPos.x + offset.x, playerPos.y + offset.y);
    const officer = spawnOfficer(state, p.x, p.y, { faction: 'syndicate', health: 90 });
    if (officer) data.enemies.push(officer);
  }
}

function spawnCompoundCrew(state, city, data) {
  const offsets = [
    { x: 90, y: -80 }, { x: 150, y: 40 }, { x: -90, y: 90 },
    { x: -150, y: -20 }, { x: 25, y: 150 }, { x: 205, y: 120 },
  ];
  data.enemies = [];
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    const p = nearestSidewalkPoint(city, data.compound.x + offset.x, data.compound.y + offset.y);
    const officer = spawnOfficer(state, p.x, p.y, {
      faction: 'syndicate',
      health: 110 + (i % 2) * 25,
    });
    if (officer) data.enemies.push(officer);
  }
}

function enemiesDown(state, enemies) {
  if (!enemies || enemies.length === 0) return false;
  return enemies.every((officer) => officer.down || !state.officers.includes(officer));
}

function spawnSyndicateChase(state, city, playerPos, data) {
  data.chaseCars = [];
  const points = [
    nearestRoadPoint(city, playerPos.x - 260, playerPos.y + 80),
    nearestRoadPoint(city, playerPos.x + 320, playerPos.y + 40),
  ];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const car = createCar('muscle', p.x, p.y, -Math.PI / 2, {
      color: i === 0 ? '#4c2f2c' : '#383d3c',
      occupied: true,
      ai: 'syndicate',
      driver: 'npc',
      health: 125,
      rng: state.rng,
    });
    car.syndicateTimer = 1 + i * 0.7;
    state.cars.push(car);
    data.chaseCars.push(car);
  }
}

function updateSyndicateChase(state, city, data) {
  const target = playerPoint(state);
  for (const car of data.chaseCars) {
    if (car.destroyed || !state.cars.includes(car) || car.playerDriven) continue;
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dist = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    const difference = wrapAngle(desired - car.angle);
    car.controls.steer = clamp(difference * 2.8, -1, 1);
    car.controls.throttle = 1;
    car.controls.brake = difference > 1.3 && getCarSpeed(car) > 160 ? 0.5 : 0;
    car.controls.handbrake = false;
    car.syndicateTimer = Math.max(0, car.syndicateTimer - 1 / 60);
    if (dist < 440 && car.syndicateTimer <= 0) {
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.22;
      shoot(state, car.x + Math.cos(car.angle) * car.length * 0.5, car.y + Math.sin(car.angle) * car.length * 0.5, angle, {
        hostile: true,
        damage: 8,
        speed: 1080,
        life: 0.45,
      });
      car.syndicateTimer = 1.8 + Math.random() * 0.9;
    }
  }
}

function removeChaseCars(state, data) {
  for (const car of data.chaseCars) {
    car.remove = true;
    const index = state.cars.indexOf(car);
    if (index >= 0) state.cars.splice(index, 1);
  }
  data.chaseCars = [];
}

function completeMission(state, city) {
  const manager = state.missions;
  if (!manager || !manager.active) return;
  const def = manager.list[manager.currentIndex];
  if (!def) return;
  const nextIndex = manager.currentIndex + 1;
  state.money += def.reward;
  if (!state.completedMissions.includes(def.id)) state.completedMissions.push(def.id);
  state.missions.active = false;
  state.missions.currentIndex = nextIndex;
  state.day += 1;
  state.saveDirty = true;
  state.player.invulnerable = Math.max(state.player.invulnerable, 1.4);
  cleanupMissionActors(state);
  playMissionPassed();
  if (nextIndex >= MISSION_DEFS.length) {
    state.missions.freeRoam = true;
    setFreeRoam(state);
    state.wanted = 0;
    state.heat = 0;
    state.pendingWanted = 0;
    showBigMessage(
      state,
      'COSTA VISTA IS YOURS',
      'Thanks for playing. Mari owns these streets now. Free roam unlocked.',
      5.5,
      '#ffd06a',
    );
  } else {
    setGarageObjective(state, city);
    showBigMessage(
      state,
      'MISSION PASSED',
      `${def.name}  +$${def.reward}`,
      4,
      '#ffd06a',
    );
    notify(state, 'Return to Rudy\'s garage for the next job.');
  }
  notify(state, `Mission complete: ${def.name}.`);
  announceMission(`Mission passed. ${def.name}.`);
}

function failMission(state, city, reason) {
  const manager = state.missions;
  if (!manager || !manager.active) return;
  const def = manager.list[manager.currentIndex];
  const index = manager.currentIndex;
  manager.active = false;
  cleanupMissionActors(state);
  manager.briefing = {
    def,
    index,
    failed: true,
    reason,
  };
  state.bigMessage = {
    text: 'MISSION FAILED',
    sub: reason,
    life: 2.4,
    duration: 2.4,
    color: '#ef6252',
  };
  notify(state, `Mission failed: ${reason}`);
  announceMission(`Mission failed. ${reason}`);
}

function cleanupMissionActors(state) {
  const manager = state.missions;
  if (!manager) return;
  const data = manager.data || {};
  const cars = [];
  if (data.car) cars.push(data.car);
  if (data.courier) cars.push(data.courier);
  if (data.allyCar) cars.push(data.allyCar);
  if (Array.isArray(data.chaseCars)) cars.push(...data.chaseCars);
  for (const car of cars) {
    if (!car) continue;
    if (state.player.inVehicle === car) {
      state.player.inVehicle = null;
      car.playerDriven = false;
    }
    const index = state.cars.indexOf(car);
    if (index >= 0) state.cars.splice(index, 1);
  }
  for (const officer of state.officers) {
    if (officer.faction === 'syndicate') officer.remove = true;
  }
  manager.data = {};
}

export function getMissionDefs() {
  return MISSION_DEFS.slice();
}

function announceMission(text) {
  try {
    const line = document.getElementById('status');
    if (line) line.textContent = text;
  } catch {
    // The hidden status line is optional outside the browser.
  }
}
