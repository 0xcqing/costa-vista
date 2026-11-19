import { TRAFFIC } from './config.js';
import { angleDifference, clamp, pick, wrapAngle } from './util.js';
import { createCar, getCarSpeed } from './vehicles.js';

const TRAFFIC_TYPES = ['compact', 'sedan', 'sedan', 'taxi', 'van', 'pickup', 'muscle', 'compact'];

export function seedTraffic(state, city) {
  for (let i = 0; i < 5; i++) spawnAmbientCar(state, city);
  for (let i = 0; i < 5; i++) spawnParkedCar(state, city);
}

export function stepTraffic(state, dt, city) {
  const player = state.player;
  const px = player.inVehicle ? player.inVehicle.x : player.x;
  const py = player.inVehicle ? player.inVehicle.y : player.y;

  state.trafficTimer -= dt;
  const ambientCount = state.cars.filter((car) => car.ai === 'traffic' && !car.destroyed).length;
  if (ambientCount < TRAFFIC.maxCars && state.trafficTimer <= 0) {
    state.trafficTimer = TRAFFIC.spawnInterval;
    spawnAmbientCar(state, city);
  }

  state.parkedTimer -= dt;
  const parkedCount = state.cars.filter((car) => car.parked && !car.playerDriven && !car.destroyed).length;
  if (parkedCount < TRAFFIC.parkedMax && state.parkedTimer <= 0) {
    state.parkedTimer = 2.8;
    spawnParkedCar(state, city);
  }

  for (const car of state.cars) {
    if (car.ai === 'traffic' && !car.playerDriven && !car.destroyed) {
      updateAmbientCar(state, city, car, dt, px, py);
    }
  }

  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (car.playerDriven || car.police || car.ai === 'police') continue;
    const d = Math.hypot(car.x - px, car.y - py);
    if (car.remove || (car.ai === 'traffic' && d > TRAFFIC.despawnRadius) || (car.parked && d > TRAFFIC.despawnRadius + 260)) {
      state.cars.splice(i, 1);
    }
  }
}

function chooseSpawnNode(state, city, px, py) {
  const candidates = city.roadGraph.nodes.filter((node) => {
    const d = Math.hypot(node.x - px, node.y - py);
    return d > TRAFFIC.spawnRadiusMin && d < TRAFFIC.spawnRadiusMax;
  });
  if (!candidates.length) return null;
  return pick(candidates, state.rng);
}

function spawnAmbientCar(state, city) {
  const player = state.player;
  const px = player.inVehicle ? player.inVehicle.x : player.x;
  const py = player.inVehicle ? player.inVehicle.y : player.y;
  const node = chooseSpawnNode(state, city, px, py);
  if (!node) return;
  if (state.cars.some((car) => Math.hypot(car.x - node.x, car.y - node.y) < 110)) return;
  const nextId = pick(node.edges, state.rng);
  const target = city.roadGraph.byId.get(nextId);
  if (!target) return;
  const direction = Math.atan2(target.y - node.y, target.x - node.x);
  const laneX = -Math.sin(direction) * 17;
  const laneY = Math.cos(direction) * 17;
  const type = pick(TRAFFIC_TYPES, state.rng);
  const car = createCar(type, node.x + laneX, node.y + laneY, direction, {
    occupied: true,
    ai: 'traffic',
    driver: 'npc',
    rng: state.rng,
    traffic: { fromId: node.id, toId: nextId, cruise: 0.42 + state.rng() * 0.22 },
  });
  car.cruiseSpeed = 0.42 + state.rng() * 0.22;
  car.controls.throttle = 0.4;
  state.cars.push(car);
}

function spawnParkedCar(state, city) {
  const player = state.player;
  const px = player.inVehicle ? player.inVehicle.x : player.x;
  const py = player.inVehicle ? player.inVehicle.y : player.y;
  const used = new Set(state.cars.filter((car) => car.parkingSpot).map((car) => car.parkingSpot));
  const candidates = city.parkingSpots.filter((spot) => {
    if (used.has(spot.id)) return false;
    const d = Math.hypot(spot.x - px, spot.y - py);
    return d > 120 && d < TRAFFIC.parkedRadius;
  });
  if (!candidates.length) return;
  const spot = pick(candidates, state.rng);
  const type = pick(['compact', 'sedan', 'sedan', 'pickup', 'taxi', 'van'], state.rng);
  const car = createCar(type, spot.x, spot.y, spot.angle, {
    parked: true,
    rng: state.rng,
    parkingSpot: spot.id,
  });
  car.controls.handbrake = true;
  state.cars.push(car);
}

function updateAmbientCar(state, city, car, dt, px, py) {
  let path = car.traffic;
  if (!path) {
    const nearest = nearestNode(city, car.x, car.y);
    if (!nearest || nearest.edges.length === 0) return;
    path = { fromId: nearest.id, toId: nearest.edges[0], cruise: 0.5 };
    car.traffic = path;
  }

  let target = city.roadGraph.byId.get(path.toId);
  if (!target) return;
  let from = city.roadGraph.byId.get(path.fromId) || target;
  let dx = target.x - from.x;
  let dy = target.y - from.y;
  let len = Math.hypot(dx, dy) || 1;
  let laneX = (-dy / len) * 17;
  let laneY = (dx / len) * 17;
  let targetX = target.x + laneX;
  let targetY = target.y + laneY;
  let arrival = Math.hypot(car.x - targetX, car.y - targetY);
  if (arrival < 24) {
    const choices = target.edges.filter((id) => id !== path.fromId);
    const nextId = choices.length ? pick(choices, state.rng) : target.edges[0];
    if (!nextId) return;
    path.fromId = target.id;
    path.toId = nextId;
    from = target;
    target = city.roadGraph.byId.get(nextId);
    if (!target) return;
    dx = target.x - from.x;
    dy = target.y - from.y;
    len = Math.hypot(dx, dy) || 1;
    laneX = (-dy / len) * 17;
    laneY = (dx / len) * 17;
    targetX = target.x + laneX;
    targetY = target.y + laneY;
  }

  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const difference = angleDifference(desired, car.angle);
  const speed = getCarSpeed(car);
  let speedTarget = car.maxSpeed * (path.cruise ?? 0.5) * (Math.abs(difference) > 0.65 ? 0.55 : 1);
  const ahead = trafficAhead(state, car, px, py);
  if (ahead.close) speedTarget = 0;
  else if (ahead.near) speedTarget *= 0.35;

  car.controls.steer = clamp(difference * 2.1, -1, 1);
  car.controls.handbrake = false;
  car.controls.throttle = speed < speedTarget ? 0.58 : 0;
  car.controls.brake = speed > speedTarget + 24 ? 0.85 : 0;
  car.sirenPhase += dt;
}

function trafficAhead(state, car, px, py) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let near = false;
  let close = false;
  for (const other of state.cars) {
    if (other === car || other.destroyed) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward <= 0 || forward > 105) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side > 40) continue;
    if (forward < 62) close = true;
    else near = true;
  }
  if (!state.player.inVehicle) {
    const dx = px - car.x;
    const dy = py - car.y;
    const forward = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (forward > 0 && forward < 78 && side < 32) close = true;
    else if (forward > 0 && forward < 115 && side < 42) near = true;
  }
  return { near, close };
}

function nearestNode(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const node of city.roadGraph.nodes) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export function spawnTaxiAt(state, city, x, y, angle) {
  const car = createCar('taxi', x, y, angle, {
    occupied: true, ai: 'traffic', driver: 'npc', rng: state.rng,
  });
  car.traffic = { fromId: '0:0', toId: '0:0', cruise: 0.45 };
  const nearest = nearestNode(city, x, y);
  if (nearest && nearest.edges.length) {
    car.traffic.fromId = nearest.id;
    car.traffic.toId = nearest.edges[0];
  }
  state.cars.push(car);
  return car;
}
