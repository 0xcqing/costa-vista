import { PALETTE, WORLD } from './config.js';
import { getViewBounds } from './camera.js';
import {
  chance, circleRectOverlap, clamp, distanceSquared, pick, pointInRect,
  rectsOverlap, roundRect, shuffle,
} from './util.js';

const VERTICALS = [
  { x: 845, width: 118, boulevard: true },
  { x: 1390, width: 90 },
  { x: 1960, width: 90 },
  { x: 2530, width: 90 },
  { x: 3100, width: 90 },
  { x: 3670, width: 90 },
  { x: 4140, width: 90 },
];

const HORIZONTALS = [
  { y: 250, width: 90 },
  { y: 830, width: 90 },
  { y: 1410, width: 90 },
  { y: 1990, width: 90 },
  { y: 2570, width: 90 },
  { y: 3150, width: 90 },
  { y: 3730, width: 90 },
];

const SHOPS = [
  'Marisol', 'Casa Vega', 'La Sirena', 'Sun & Salt', 'Palm Radio',
  'Dune Hotel', 'Rico Market', 'Cobalt', 'Marea', 'El Faro',
  'Norte Coffee', 'Vista Sundries', 'Costa Vinyl', 'Luna Deli',
  'Bronze Fish', 'Tide & Tan', 'Ocho Rides', 'Sol Bakery',
];

const SHOP_COLORS = ['#d4836d', '#d8b25e', '#77a6a2', '#c88e9d', '#9eb58f', '#d39b53'];

const ROOF_COLORS = [
  PALETTE.roofWarm, PALETTE.roofDark, PALETTE.roofPale,
  '#b76d5a', '#d29b86', '#789b95', '#c4a37d', '#8e5441', '#b58b65',
];

const BUILDING_COLORS = [
  PALETTE.terracotta, PALETTE.pastelPink, PALETTE.pastelCream,
  PALETTE.pastelMint, PALETTE.pastelBlue, PALETTE.pastelPeach,
  '#cf9b76', '#e0b78d', '#b7a68f', '#c98773',
  '#c8867f', '#9eb8ad', '#d6b69a', '#b57c6c',
];

const DISTRICT_DATA = [
  { name: 'Downtown Costa', x: 2960, y: 0, w: 1240, h: 1500 },
  { name: 'Old Harbor', x: 760, y: 3030, w: 1550, h: 1170 },
  { name: 'Marina Row', x: 760, y: 1360, w: 780, h: 1900 },
  { name: 'Palm Grove', x: 1540, y: 760, w: 1600, h: 2150 },
  { name: 'Sunset Heights', x: 2680, y: 2960, w: 1520, h: 1240 },
  { name: 'El Sol Beach', x: 0, y: 0, w: 786, h: 4200 },
  { name: 'Costa Flat', x: 760, y: 0, w: 2200, h: 760 },
];

export function buildCity(rng) {
  const city = {
    width: WORLD.size,
    height: WORLD.size,
    tileSize: WORLD.tile,
    tiles: [],
    roads: [],
    buildings: [],
    blocks: [],
    palms: [],
    lamps: [],
    sidewalkSegments: [],
    parkingSpots: [],
    districts: DISTRICT_DATA.map((district) => ({ ...district })),
    roadGraph: { nodes: [], byId: new Map() },
    ocean: { x: 0, y: 0, w: 360, h: WORLD.size },
    beach: { x: 360, y: 0, w: 350, h: WORLD.size },
    promenade: { x: 708, y: 0, w: 78, h: WORLD.size },
    surfX: 360,
    pier: { x: 0, y: 2106, w: 770, h: 78 },
    hospital: { x: 1210, y: 1510 },
    streetNames: [
      'Coastal Boulevard', 'Avenida Sol', 'Calle Mar', 'Palm Way',
      'Cobalt Street', 'Harbor Lane', 'Dune Drive', 'Vista Avenue',
      'Solaris Road', 'Marea Street',
    ],
    beachMarks: [],
    umbrellas: [],
  };

  for (const vertical of VERTICALS) {
    city.roads.push({
      x: vertical.x - vertical.width * 0.5,
      y: 0,
      w: vertical.width,
      h: WORLD.size,
      horizontal: false,
      center: vertical.x,
      width: vertical.width,
      boulevard: Boolean(vertical.boulevard),
    });
  }
  for (const horizontal of HORIZONTALS) {
    city.roads.push({
      x: VERTICALS[0].x,
      y: horizontal.y - horizontal.width * 0.5,
      w: WORLD.size - VERTICALS[0].x,
      h: horizontal.width,
      horizontal: true,
      center: horizontal.y,
      width: horizontal.width,
      boulevard: false,
    });
  }

  buildRoadGraph(city);
  buildBlocks(city, rng);
  buildParkingSpots(city, rng);
  buildBeachDetails(city, rng);
  buildPalms(city, rng);
  buildLamps(city, rng);

  city.buildings.sort((a, b) => a.y - b.y);
  return city;
}

function buildRoadGraph(city) {
  const nodes = [];
  const byId = new Map();
  for (let vi = 0; vi < VERTICALS.length; vi++) {
    for (let hi = 0; hi < HORIZONTALS.length; hi++) {
      const node = {
        id: `${vi}:${hi}`,
        vi,
        hi,
        x: VERTICALS[vi].x,
        y: HORIZONTALS[hi].y,
        edges: [],
      };
      nodes.push(node);
      byId.set(node.id, node);
    }
  }
  for (const node of nodes) {
    if (node.vi > 0) node.edges.push(`${node.vi - 1}:${node.hi}`);
    if (node.vi < VERTICALS.length - 1) node.edges.push(`${node.vi + 1}:${node.hi}`);
    if (node.hi > 0) node.edges.push(`${node.vi}:${node.hi - 1}`);
    if (node.hi < HORIZONTALS.length - 1) node.edges.push(`${node.vi}:${node.hi + 1}`);
  }
  city.roadGraph = { nodes, byId };
}

function buildBlocks(city, rng) {
  let id = 0;
  for (let vi = 0; vi < VERTICALS.length - 1; vi++) {
    for (let hi = 0; hi < HORIZONTALS.length - 1; hi++) {
      const x0 = VERTICALS[vi].x + VERTICALS[vi].width * 0.5;
      const x1 = VERTICALS[vi + 1].x - VERTICALS[vi + 1].width * 0.5;
      const y0 = HORIZONTALS[hi].y + HORIZONTALS[hi].width * 0.5;
      const y1 = HORIZONTALS[hi + 1].y - HORIZONTALS[hi + 1].width * 0.5;
      if (x1 - x0 < 120 || y1 - y0 < 120) continue;

      const downtown = vi >= 4 && hi <= 1;
      const park = vi === 2 && hi === 1;
      const marina = vi === 0 && hi >= 2 && hi <= 3;
      const oldHarbor = vi <= 1 && hi >= 4;
      let district = 'Costa Flat';
      if (downtown) district = 'Downtown Costa';
      else if (park) district = 'Palm Grove';
      else if (marina) district = 'Marina Row';
      else if (oldHarbor) district = 'Old Harbor';
      else if (vi >= 2 && hi <= 2) district = 'Palm Grove';
      else if (vi >= 4 && hi >= 3) district = 'Sunset Heights';

      const block = {
        id: id++,
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
        district,
        kind: park ? 'park' : downtown ? 'downtown' : marina ? 'marina' : oldHarbor ? 'harbor' : 'street',
        sidewalkWidth: 16,
      };
      city.blocks.push(block);
      addSidewalkSegments(city, block);

      if (park) {
        buildPark(city, block, rng);
      } else {
        buildLots(city, block, rng, downtown, marina, oldHarbor);
      }
    }
  }
}

function addSidewalkSegments(city, block) {
  const w = 16;
  city.sidewalkSegments.push(
    { x: block.x, y: block.y, w: block.w, h: w, horizontal: true, block: block.id },
    { x: block.x, y: block.y + block.h - w, w: block.w, h: w, horizontal: true, block: block.id },
    { x: block.x, y: block.y + w, w, h: block.h - w * 2, horizontal: false, block: block.id },
    { x: block.x + block.w - w, y: block.y + w, w, h: block.h - w * 2, horizontal: false, block: block.id },
  );
}

function buildPark(city, block, rng) {
  const inset = 24;
  const parkRect = {
    x: block.x + inset,
    y: block.y + inset,
    w: block.w - inset * 2,
    h: block.h - inset * 2,
  };
  const pathW = 30;
  const cx = parkRect.x + parkRect.w * 0.5;
  const cy = parkRect.y + parkRect.h * 0.5;
  const paths = [
    { x: parkRect.x, y: cy - pathW / 2, w: parkRect.w, h: pathW },
    { x: cx - pathW / 2, y: parkRect.y, w: pathW, h: parkRect.h },
  ];
  for (let i = 0; i < 13; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 40 + rng() * Math.min(parkRect.w, parkRect.h) * 0.42;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (Math.abs(x - cx) < pathW * 0.8 || Math.abs(y - cy) < pathW * 0.8) continue;
    city.palms.push({ x, y, scale: 0.78 + rng() * 0.45, kind: 'park' });
  }
  city.blocks[city.blocks.length - 1].parkRect = parkRect;
  city.blocks[city.blocks.length - 1].paths = paths;
}

function buildLots(city, block, rng, downtown, marina, harbor) {
  const inset = 24;
  const inner = {
    x: block.x + inset,
    y: block.y + inset,
    w: block.w - inset * 2,
    h: block.h - inset * 2,
  };
  const gap = 16;
  const cols = downtown ? (inner.w > 430 ? 2 : 1) : inner.w > 390 ? (rng() < 0.62 ? 2 : 1) : 1;
  const rows = downtown ? (inner.h > 440 ? 2 : 1) : inner.h > 400 ? (rng() < 0.6 ? 2 : 1) : 1;
  const cellW = (inner.w - gap * (cols - 1)) / cols;
  const cellH = (inner.h - gap * (rows - 1)) / rows;
  let made = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!downtown && made > 0 && chance(0.15, rng)) continue;
      const padX = 4 + rng() * 9;
      const padY = 4 + rng() * 9;
      const bx = inner.x + col * (cellW + gap) + padX;
      const by = inner.y + row * (cellH + gap) + padY;
      const bw = cellW - padX * 2;
      const bh = cellH - padY * 2;
      if (bw < 42 || bh < 42) continue;

      const tall = downtown;
      const height = tall ? 190 + rng() * 190 : 26 + rng() * (block.kind === 'marina' ? 54 : 70);
      const color = tall
        ? pick(['#b9a78d', '#9aa8a7', '#c3ae91', '#a89a8d', '#b39b83', '#9ba9a2'], rng)
        : pick(BUILDING_COLORS, rng);
      const shop = chance(tall ? 0.15 : 0.42, rng);
      const sign = shop ? pick(SHOPS, rng) : null;
      const awning = shop || chance(0.18, rng);
      const building = {
        id: city.buildings.length,
        x: bx,
        y: by,
        w: bw,
        h: bh,
        color,
        roof: pick(ROOF_COLORS, rng),
        height,
        downtown: tall,
        shop,
        awning,
        awningColor: sign ? pick(SHOP_COLORS, rng) : '#c77b5b',
        sign,
        neon: chance(tall ? 0.35 : 0.24, rng) ? pick([PALETTE.neonPink, PALETTE.neonMint, '#ffc95c'], rng) : null,
        district: block.district,
        roofUnits: [],
        floors: tall ? 5 + Math.floor(rng() * 9) : 1 + Math.floor(rng() * 3),
        harbor: Boolean(harbor),
        marina: Boolean(marina),
      };
      const unitCount = tall ? 3 + Math.floor(rng() * 4) : Math.floor(rng() * 3);
      for (let u = 0; u < unitCount; u++) {
        const uw = 8 + rng() * Math.min(22, bw * 0.2);
        const uh = 8 + rng() * Math.min(20, bh * 0.18);
        const ux = bx + 8 + rng() * Math.max(1, bw - uw - 16);
        const uy = by + 8 + rng() * Math.max(1, bh - uh - 16);
        building.roofUnits.push({ x: ux, y: uy, w: uw, h: uh });
      }
      city.buildings.push(building);
      made++;
    }
  }
}

function buildParkingSpots(city, rng) {
  let id = 0;
  for (const block of city.blocks) {
    const sides = shuffle([0, 1, 2, 3], rng).slice(0, 2 + Math.floor(rng() * 2));
    for (const side of sides) {
      if (side < 2 && chance(0.35, rng)) continue;
      let x = 0;
      let y = 0;
      let angle = 0;
      if (side === 0) {
        x = block.x + 75 + rng() * Math.max(20, block.w - 150);
        y = block.y - 34;
        angle = 0;
      } else if (side === 1) {
        x = block.x + 75 + rng() * Math.max(20, block.w - 150);
        y = block.y + block.h + 34;
        angle = Math.PI;
      } else if (side === 2) {
        x = block.x - 34;
        y = block.y + 75 + rng() * Math.max(20, block.h - 150);
        angle = Math.PI / 2;
      } else {
        x = block.x + block.w + 34;
        y = block.y + 75 + rng() * Math.max(20, block.h - 150);
        angle = -Math.PI / 2;
      }
      city.parkingSpots.push({ id: `p${id++}`, x, y, angle });
    }
  }
}

function buildBeachDetails(city, rng) {
  for (let i = 0; i < 190; i++) {
    city.beachMarks.push({
      x: 370 + rng() * 330,
      y: rng() * WORLD.size,
      r: 1 + rng() * 3,
      alpha: 0.08 + rng() * 0.18,
    });
  }
  for (let i = 0; i < 17; i++) {
    const x = 410 + rng() * 250;
    const y = 180 + rng() * (WORLD.size - 360);
    if (Math.abs(y - (city.pier.y + city.pier.h / 2)) < 115) continue;
    city.umbrellas.push({
      x,
      y,
      color: pick(['#d86955', '#e3b64e', '#6eaaa2', '#c87899', '#e0d3ae'], rng),
      angle: rng() * Math.PI,
    });
  }
}

function buildPalms(city, rng) {
  for (let y = 100; y < WORLD.size; y += 112) {
    city.palms.push({ x: 746 + (rng() - 0.5) * 14, y: y + (rng() - 0.5) * 28, scale: 0.94 + rng() * 0.3, kind: 'promenade' });
  }
  for (let y = 180; y < WORLD.size; y += 238) {
    if (Math.abs(y - (city.pier.y + city.pier.h / 2)) < 85) continue;
    city.palms.push({ x: 912 + (rng() - 0.5) * 8, y: y + (rng() - 0.5) * 34, scale: 0.82 + rng() * 0.26, kind: 'boulevard' });
  }
  for (let i = 0; i < 52; i++) {
    const y = 60 + rng() * (WORLD.size - 120);
    if (Math.abs(y - (city.pier.y + city.pier.h / 2)) < 68) continue;
    city.palms.push({ x: 398 + rng() * 292, y, scale: 0.72 + rng() * 0.38, kind: 'beach' });
  }
  for (const block of city.blocks) {
    if (block.kind === 'park') continue;
    if (!chance(0.38, rng)) continue;
    const side = Math.floor(rng() * 4);
    let x = block.x + 30 + rng() * (block.w - 60);
    let y = block.y + 8;
    if (side === 1) y = block.y + block.h - 8;
    else if (side === 2) {
      x = block.x + 8;
      y = block.y + 30 + rng() * (block.h - 60);
    } else if (side === 3) {
      x = block.x + block.w - 8;
      y = block.y + 30 + rng() * (block.h - 60);
    }
    if (!cityPointInBuilding(city, x, y, 6)) {
      city.palms.push({ x, y, scale: 0.72 + rng() * 0.3, kind: 'sidewalk' });
    }
  }
}

function buildLamps(city, rng) {
  for (let y = 140; y < WORLD.size; y += 210) {
    city.lamps.push({ x: 774, y, phase: rng() * Math.PI * 2, size: 1 });
  }
  for (let y = 210; y < WORLD.size; y += 235) {
    city.lamps.push({ x: 912, y, phase: rng() * Math.PI * 2, size: 0.92 });
  }
  for (const block of city.blocks) {
    if (!chance(0.66, rng)) continue;
    city.lamps.push({
      x: block.x + (rng() < 0.5 ? 9 : block.w - 9),
      y: block.y + (rng() < 0.5 ? 9 : block.h - 9),
      phase: rng() * Math.PI * 2,
      size: 0.74 + rng() * 0.2,
    });
  }
}

export function prerenderCity(city) {
  const tile = city.tileSize;
  const cols = Math.ceil(city.width / tile);
  const rows = Math.ceil(city.height / tile);
  city.tiles = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const canvas = document.createElement('canvas');
      canvas.width = tile;
      canvas.height = tile;
      const ctx = canvas.getContext('2d');
      ctx.translate(-tx * tile, -ty * tile);
      drawStaticWorld(ctx, city, { x: tx * tile, y: ty * tile, w: tile, h: tile });
      city.tiles.push({ x: tx * tile, y: ty * tile, canvas });
    }
  }
}

export function drawCityTiles(ctx, city, camera) {
  const bounds = getViewBounds(camera, 16);
  const tile = city.tileSize;
  const startX = Math.max(0, Math.floor(bounds.x / tile));
  const startY = Math.max(0, Math.floor(bounds.y / tile));
  const endX = Math.min(Math.ceil(city.width / tile) - 1, Math.floor((bounds.x + bounds.w) / tile));
  const endY = Math.min(Math.ceil(city.height / tile) - 1, Math.floor((bounds.y + bounds.h) / tile));
  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const item = city.tiles[ty * Math.ceil(city.width / tile) + tx];
      if (item) ctx.drawImage(item.canvas, item.x, item.y);
    }
  }
}

function drawStaticWorld(ctx, city, view) {
  drawOcean(ctx, city, view);
  drawBeach(ctx, city, view);
  drawPromenade(ctx, city, view);
  drawRoads(ctx, city, view);
  drawSidewalks(ctx, city, view);
  drawParkBlocks(ctx, city, view);
  drawPier(ctx, city, view);
  drawBuildings(ctx, city, view);
  drawBeachDetails(ctx, city, view);
  drawPalms(ctx, city, view);
  drawLamps(ctx, city, view);
}

function tileVisible(view, x, y, w, h, pad = 0) {
  return rectsOverlap(view, { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 });
}

function drawOcean(ctx, city, view) {
  if (!tileVisible(view, city.ocean.x, city.ocean.y, city.ocean.w, city.ocean.h)) return;
  ctx.fillStyle = PALETTE.oceanDeep;
  ctx.fillRect(city.ocean.x, city.ocean.y, city.ocean.w, city.ocean.h);
  for (let x = 0; x < city.ocean.w; x += 28) {
    const t = x / city.ocean.w;
    ctx.fillStyle = t > 0.55 ? 'rgba(68, 177, 169, 0.14)' : 'rgba(34, 145, 151, 0.13)';
    ctx.fillRect(x, 0, 28, city.height);
  }
  ctx.strokeStyle = 'rgba(225, 245, 238, 0.16)';
  ctx.lineWidth = 2;
  for (let y = 0; y < city.height; y += 34) {
    ctx.beginPath();
    for (let x = 0; x < city.ocean.w; x += 22) {
      const yy = y + Math.sin((x + y) * 0.035) * 5;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(234, 250, 243, 0.76)';
  ctx.lineWidth = 3;
  for (let y = 0; y < city.height; y += 18) {
    const x = city.surfX + Math.sin(y * 0.045) * 5;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.quadraticCurveTo(x + 6, y + 9, x - 1, y + 18);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232, 249, 240, 0.20)';
  ctx.fillRect(city.surfX - 20, 0, 32, city.height);
}

function drawBeach(ctx, city, view) {
  if (!tileVisible(view, city.beach.x, city.beach.y, city.beach.w, city.beach.h)) return;
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(city.beach.x, city.beach.y, city.beach.w, city.beach.h);
  ctx.strokeStyle = 'rgba(167, 132, 78, 0.18)';
  ctx.lineWidth = 2;
  for (let y = 40; y < city.height; y += 72) {
    ctx.beginPath();
    ctx.moveTo(city.beach.x + 18, y);
    ctx.bezierCurveTo(480, y + 10, 580, y - 12, 700, y + 5);
    ctx.stroke();
  }
}

function drawPromenade(ctx, city, view) {
  if (!tileVisible(view, city.promenade.x, city.promenade.y, city.promenade.w, city.promenade.h)) return;
  ctx.fillStyle = PALETTE.promenade;
  ctx.fillRect(city.promenade.x, city.promenade.y, city.promenade.w, city.promenade.h);
  ctx.strokeStyle = 'rgba(138, 112, 76, 0.22)';
  ctx.lineWidth = 1;
  for (let y = 0; y < city.height; y += 38) {
    ctx.beginPath();
    ctx.moveTo(city.promenade.x, y);
    ctx.lineTo(city.promenade.x + city.promenade.w, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(245, 232, 207, 0.42)';
  ctx.fillRect(city.promenade.x + 5, 0, 4, city.height);
}

function drawParkBlocks(ctx, city, view) {
  for (const block of city.blocks) {
    if (block.kind !== 'park') continue;
    const rect = block.parkRect;
    if (!rect || !tileVisible(view, rect.x, rect.y, rect.w, rect.h)) continue;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = PALETTE.parkDark;
    for (let i = 0; i < 24; i++) {
      const x = rect.x + ((i * 97) % Math.max(1, rect.w - 20)) + 8;
      const y = rect.y + ((i * 61) % Math.max(1, rect.h - 20)) + 8;
      ctx.beginPath();
      ctx.arc(x, y, 4 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const path of block.paths) {
      ctx.fillStyle = PALETTE.parkPath;
      ctx.fillRect(path.x, path.y, path.w, path.h);
    }
    ctx.strokeStyle = 'rgba(70, 93, 51, 0.45)';
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }
}

function drawRoads(ctx, city, view) {
  for (const road of city.roads) {
    if (!tileVisible(view, road.x, road.y, road.w, road.h)) continue;
    ctx.fillStyle = road.boulevard ? PALETTE.asphalt : PALETTE.asphalt;
    ctx.fillRect(road.x, road.y, road.w, road.h);
    ctx.fillStyle = 'rgba(255, 227, 188, 0.035)';
    if (road.horizontal) ctx.fillRect(road.x, road.y + 4, road.w, road.h - 8);
    else ctx.fillRect(road.x + 4, road.y, road.w - 8, road.h);
  }

  ctx.strokeStyle = 'rgba(214, 198, 168, 0.42)';
  ctx.lineWidth = 2;
  for (const road of city.roads) {
    if (!tileVisible(view, road.x, road.y, road.w, road.h)) continue;
    if (road.horizontal) {
      ctx.beginPath();
      ctx.moveTo(road.x, road.y + 3);
      ctx.lineTo(road.x + road.w, road.y + 3);
      ctx.moveTo(road.x, road.y + road.h - 3);
      ctx.lineTo(road.x + road.w, road.y + road.h - 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(road.x + 3, road.y);
      ctx.lineTo(road.x + 3, road.y + road.h);
      ctx.moveTo(road.x + road.w - 3, road.y);
      ctx.lineTo(road.x + road.w - 3, road.y + road.h);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(242, 225, 190, 0.65)';
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 26]);
  for (const road of city.roads) {
    if (!tileVisible(view, road.x, road.y, road.w, road.h)) continue;
    ctx.beginPath();
    if (road.horizontal) {
      ctx.moveTo(road.x, road.center);
      ctx.lineTo(road.x + road.w, road.center);
    } else {
      ctx.moveTo(road.center, road.y);
      ctx.lineTo(road.center, road.y + road.h);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const node of city.roadGraph.nodes) {
    if (!tileVisible(view, node.x - 90, node.y - 90, 180, 180)) continue;
    const vw = widthOfVertical(node.x);
    const hw = widthOfHorizontal(node.y);
    ctx.fillStyle = 'rgba(240, 228, 205, 0.62)';
    const gap = 16;
    const band = 11;
    const northY = node.y - hw * 0.5 - gap - band;
    const southY = node.y + hw * 0.5 + gap;
    for (let x = node.x - vw * 0.5 + 5; x < node.x + vw * 0.5 - 6; x += 13) {
      ctx.fillRect(x, northY, 7, band);
      ctx.fillRect(x, southY, 7, band);
    }
    const westX = node.x - vw * 0.5 - gap - band;
    const eastX = node.x + vw * 0.5 + gap;
    for (let y = node.y - hw * 0.5 + 5; y < node.y + hw * 0.5 - 6; y += 13) {
      ctx.fillRect(westX, y, band, 7);
      ctx.fillRect(eastX, y, band, 7);
    }
  }
}

function widthOfVertical(x) {
  const road = VERTICALS.find((item) => item.x === x);
  return road ? road.width : 90;
}

function widthOfHorizontal(y) {
  const road = HORIZONTALS.find((item) => item.y === y);
  return road ? road.width : 90;
}

function drawSidewalks(ctx, city, view) {
  for (const block of city.blocks) {
    if (!tileVisible(view, block.x, block.y, block.w, block.h)) continue;
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(block.x, block.y, block.w, block.h);
    ctx.fillStyle = 'rgba(255, 245, 220, 0.18)';
    ctx.fillRect(block.x + 5, block.y + 5, block.w - 10, block.h - 10);
    ctx.strokeStyle = 'rgba(155, 132, 98, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
    if (block.kind !== 'park') {
      ctx.fillStyle = PALETTE.sidewalkDark;
      ctx.fillRect(block.x + 17, block.y + 17, block.w - 34, block.h - 34);
      ctx.fillStyle = 'rgba(195, 178, 150, 0.22)';
      ctx.fillRect(block.x + 22, block.y + 22, block.w - 44, block.h - 44);
    }
  }
}

function drawPier(ctx, city, view) {
  const pier = city.pier;
  if (!tileVisible(view, pier.x, pier.y, pier.w, pier.h)) return;
  ctx.fillStyle = '#6e4d36';
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  for (let x = 0; x < pier.w; x += 22) {
    ctx.fillStyle = x % 44 === 0 ? '#8a6547' : '#7a563d';
    ctx.fillRect(pier.x + x, pier.y + 3, 19, pier.h - 6);
  }
  ctx.strokeStyle = 'rgba(50, 34, 25, 0.48)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pier.x, pier.y + 4);
  ctx.lineTo(pier.x + pier.w, pier.y + 4);
  ctx.moveTo(pier.x, pier.y + pier.h - 4);
  ctx.lineTo(pier.x + pier.w, pier.y + pier.h - 4);
  ctx.stroke();
  ctx.fillStyle = '#4e3628';
  for (let x = 26; x < pier.w; x += 78) {
    ctx.fillRect(x, pier.y - 7, 8, 7);
    ctx.fillRect(x, pier.y + pier.h, 8, 7);
  }
  ctx.fillStyle = 'rgba(247, 205, 128, 0.25)';
  ctx.fillRect(pier.x, pier.y + pier.h * 0.5 - 1, pier.w, 2);
}

function drawBuildings(ctx, city, view) {
  for (const b of city.buildings) {
    if (!tileVisible(view, b.x, b.y, b.w, b.h, b.height * 1.1 + 30)) continue;
    drawBuilding(ctx, b);
  }
}

function drawBuilding(ctx, b) {
  const shadowX = b.x + b.height * 0.27;
  const shadowY = b.y + b.height * 0.43;
  ctx.save();
  ctx.shadowColor = 'rgba(38, 23, 18, 0.40)';
  ctx.shadowBlur = Math.min(46, 12 + b.height * 0.16);
  ctx.shadowOffsetX = b.height * 0.18;
  ctx.shadowOffsetY = b.height * 0.30;
  ctx.fillStyle = 'rgba(51, 33, 26, 0.24)';
  roundRect(ctx, shadowX, shadowY, b.w, b.h, 4);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(38, 24, 19, 0.16)';
  ctx.fillRect(b.x + 3, b.y + 3, b.w, b.h);

  ctx.fillStyle = b.color;
  roundRect(ctx, b.x, b.y, b.w, b.h, 3);
  ctx.fill();

  const roofInset = b.downtown ? 10 : 5;
  ctx.fillStyle = b.roof;
  roundRect(ctx, b.x + roofInset, b.y + roofInset, b.w - roofInset * 2, b.h - roofInset * 2, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(66, 42, 32, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);

  ctx.fillStyle = 'rgba(255, 233, 191, 0.16)';
  ctx.fillRect(b.x + roofInset + 2, b.y + roofInset + 2, b.w - roofInset * 2 - 4, 4);

  if (b.downtown) {
    ctx.strokeStyle = 'rgba(255, 228, 184, 0.16)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const y = b.y + (b.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(b.x + 12, y);
      ctx.lineTo(b.x + b.w - 12, y);
      ctx.stroke();
    }
  }

  ctx.fillStyle = 'rgba(58, 58, 51, 0.55)';
  for (const unit of b.roofUnits) {
    ctx.fillRect(unit.x, unit.y, unit.w, unit.h);
    ctx.fillStyle = 'rgba(230, 210, 175, 0.2)';
    ctx.fillRect(unit.x, unit.y, unit.w, 2);
    ctx.fillStyle = 'rgba(58, 58, 51, 0.55)';
  }

  if (b.awning) drawAwning(ctx, b);
  if (b.neon) drawNeon(ctx, b);
  if (b.sign) {
    ctx.fillStyle = 'rgba(35, 26, 23, 0.70)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const signY = b.y + b.h + 8;
    ctx.fillRect(b.x + b.w * 0.22, signY - 7, b.w * 0.56, 14);
    ctx.fillStyle = '#f7e5c3';
    ctx.fillText(b.sign, b.x + b.w * 0.5, signY);
  }
}

function drawAwning(ctx, b) {
  const width = Math.min(b.w * 0.72, 150);
  const x = b.x + (b.w - width) * 0.5;
  const y = b.y + b.h + 1;
  const stripe = 12;
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < Math.ceil(width / stripe); i++) {
    ctx.fillStyle = i % 2 === 0 ? b.awningColor : '#efe0bd';
    ctx.fillRect(i * stripe, 0, Math.min(stripe, width - i * stripe), 11);
  }
  ctx.fillStyle = 'rgba(45, 28, 22, 0.24)';
  ctx.fillRect(0, 10, width, 3);
  ctx.restore();
}

function drawNeon(ctx, b) {
  const signX = b.x + b.w - 4;
  const signY = b.y + b.h * 0.25;
  ctx.save();
  ctx.shadowColor = b.neon;
  ctx.shadowBlur = 12;
  ctx.fillStyle = b.neon;
  ctx.fillRect(signX, signY, 4, Math.min(42, b.h * 0.45));
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(signX + 1, signY + 3, 1.5, Math.min(36, b.h * 0.38));
  ctx.restore();
}

function drawBeachDetails(ctx, city, view) {
  for (const mark of city.beachMarks) {
    if (!tileVisible(view, mark.x, mark.y, 6, 6)) continue;
    ctx.fillStyle = `rgba(140, 102, 58, ${mark.alpha})`;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, mark.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const umbrella of city.umbrellas) {
    if (!tileVisible(view, umbrella.x, umbrella.y, 40, 40)) continue;
    ctx.fillStyle = 'rgba(55, 36, 24, 0.16)';
    ctx.beginPath();
    ctx.ellipse(umbrella.x + 11, umbrella.y + 13, 18, 9, umbrella.angle * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#796349';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(umbrella.x, umbrella.y);
    ctx.lineTo(umbrella.x + 5, umbrella.y + 13);
    ctx.stroke();
    ctx.fillStyle = umbrella.color;
    ctx.beginPath();
    ctx.arc(umbrella.x, umbrella.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 214, 0.48)';
    ctx.beginPath();
    ctx.arc(umbrella.x - 2, umbrella.y - 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPalms(ctx, city, view) {
  for (const palm of city.palms) {
    if (!tileVisible(view, palm.x, palm.y, 50, 50)) continue;
    drawPalm(ctx, palm);
  }
}

function drawPalm(ctx, palm) {
  const s = palm.scale;
  ctx.save();
  ctx.translate(palm.x, palm.y);
  ctx.fillStyle = 'rgba(45, 29, 23, 0.18)';
  ctx.beginPath();
  ctx.ellipse(9 * s, 12 * s, 19 * s, 10 * s, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7b5537';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(0, 3 * s);
  ctx.lineTo(-2 * s, -11 * s);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.22;
    const length = (13 + (i % 3) * 3) * s;
    ctx.strokeStyle = i % 2 === 0 ? '#497345' : '#5e8b51';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(-2 * s, -11 * s);
    ctx.quadraticCurveTo(
      -2 * s + Math.cos(angle) * length * 0.6,
      -11 * s + Math.sin(angle) * length * 0.6 - 2 * s,
      -2 * s + Math.cos(angle) * length,
      -11 * s + Math.sin(angle) * length,
    );
    ctx.stroke();
  }
  ctx.fillStyle = '#6f8a4a';
  ctx.beginPath();
  ctx.arc(-2 * s, -11 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function cityPointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (circleRectOverlap(x, y, pad, b)) return true;
  }
  return false;
}

export function isOnRoad(city, x, y) {
  for (const road of city.roads) {
    if (pointInRect(x, y, road)) return true;
  }
  return false;
}

export function isOnSidewalk(city, x, y) {
  if (pointInRect(x, y, city.promenade) || pointInRect(x, y, city.pier)) return true;
  for (const segment of city.sidewalkSegments) {
    if (pointInRect(x, y, segment)) return true;
  }
  return false;
}

export function buildingAt(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (circleRectOverlap(x, y, pad, b)) return b;
  }
  return null;
}

export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const road of city.roads) {
    const px = clamp(x, road.x + 8, road.x + road.w - 8);
    const py = clamp(y, road.y + 8, road.y + road.h - 8);
    const d = distanceSquared(x, y, px, py);
    if (d < bestDist) {
      bestDist = d;
      best = { x: px, y: py };
    }
  }
  return best ?? { x: city.width * 0.5, y: city.height * 0.5 };
}

export function nearestSidewalkPoint(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const segment of city.sidewalkSegments) {
    const px = clamp(x, segment.x + 7, segment.x + segment.w - 7);
    const py = clamp(y, segment.y + 7, segment.y + segment.h - 7);
    const d = distanceSquared(x, y, px, py);
    if (d < bestDist && !buildingAt(city, px, py, 8)) {
      bestDist = d;
      best = { x: px, y: py };
    }
  }
  if (best) return best;
  return nearestRoadPoint(city, x, y);
}

export function isWater(city, x, y) {
  if (x < 0 || y < 0 || x > city.width || y > city.height) return true;
  if (pointInRect(x, y, city.pier)) return false;
  return x < city.surfX;
}

export function isBlockedForRadius(city, x, y, radius) {
  if (x < radius || y < radius || x > city.width - radius || y > city.height - radius) return true;
  if (isWater(city, x, y)) return true;
  return Boolean(buildingAt(city, x, y, radius));
}

export function districtAt(city, x, y) {
  for (const district of city.districts) {
    if (pointInRect(x, y, district)) return district.name;
  }
  return 'Costa Vista';
}

export function randomRoadNodeNear(city, x, y, rng, minDistance = 500, maxDistance = 1200) {
  const candidates = city.roadGraph.nodes.filter((node) => {
    const d = Math.hypot(node.x - x, node.y - y);
    return d >= minDistance && d <= maxDistance;
  });
  if (candidates.length === 0) return city.roadGraph.nodes[Math.floor(rng() * city.roadGraph.nodes.length)] ?? null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function drawLamps(ctx, city, view) {
  for (const lamp of city.lamps) {
    if (!tileVisible(view, lamp.x, lamp.y, 54, 54)) continue;
    const s = lamp.size;
    const glow = ctx.createRadialGradient(lamp.x, lamp.y - 4, 2, lamp.x, lamp.y - 4, 30 * s);
    glow.addColorStop(0, 'rgba(255, 218, 137, 0.42)');
    glow.addColorStop(0.4, 'rgba(255, 188, 95, 0.14)');
    glow.addColorStop(1, 'rgba(255, 174, 74, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y - 4, 30 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4038';
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y + 8 * s);
    ctx.lineTo(lamp.x, lamp.y - 9 * s);
    ctx.stroke();
    ctx.fillStyle = '#ffe0a0';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y - 11 * s, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
