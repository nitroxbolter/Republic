import { BUILDINGS, type BuildingInstance } from './buildings/catalog';
import type { City } from './City';
import { hasTech } from './research';
import { isWorking } from './systems/utilities';
import { roadPath } from './roads';
import type { World } from './World';

/**
 * Rail (docs/specs/evolution.md, E7b): track on its own tile layer (`World.rail`), stations
 * beside it, and travel times between stations for the commute model's train option.
 */

export const Rail = { None: 0, Track: 1, Bridge: 2 } as const;
export type RailId = (typeof Rail)[keyof typeof Rail];

/** Neighbour offsets in mask-bit order, as roads (bit 0 NE, 1 SE, 2 SW, 3 NW). */
const STEPS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function isRail(world: World, i: number): boolean {
  return world.rail[i] !== Rail.None;
}

/** Which neighbours carry track that joins this tile (track joins track in every direction). */
export function railMask(world: World, x: number, y: number): number {
  let mask = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + STEPS[d][0];
    const ny = y + STEPS[d][1];
    if (world.inBounds(nx, ny) && isRail(world, world.index(nx, ny))) mask |= 1 << d;
  }
  return mask;
}

/** May this city lay track and build stations? (Rapid transit research, in cities that lock by stage.) */
export function railUnlocked(city: Pick<City, 'locked' | 'research'>): boolean {
  return !city.locked || hasTech(city, 'rapidTransit');
}

/** Rail tuning (spec E7b). */
export const RAIL = {
  /** A home or job is served by a station within this many tiles of its entrance. */
  walkTiles: 8,
  walkMinutes: 1.5,
  waitMinutes: 3,
  minutesPerTile: 0.3,
} as const;

/** The track tile beside a station (its platform): the first rail tile in the ring around the footprint. */
export function platformOf(world: World, b: BuildingInstance): number {
  const { w, h } = BUILDINGS[b.def].size;
  for (let y = b.y - 1; y <= b.y + h; y++) {
    for (let x = b.x - 1; x <= b.x + w; x++) {
      const inside = x >= b.x && x < b.x + w && y >= b.y && y < b.y + h;
      if (inside || !world.inBounds(x, y)) continue;
      if (isRail(world, world.index(x, y))) return world.index(x, y);
    }
  }
  return -1;
}

/** One working station with its platform. */
export interface Station {
  readonly id: number;
  readonly platform: number;
  readonly x: number;
  readonly y: number;
}

/** Today's rail network: working stations and track minutes between every pair (Infinity when not joined). */
export interface RailNetwork {
  readonly stations: readonly Station[];
  /** minutes[a * stations.length + b]: riding from station a to b (no waiting). */
  readonly minutes: Float64Array;
}

export function railNetwork(world: World): RailNetwork {
  const stations: Station[] = [];
  for (const b of world.buildings.values()) {
    if (b.def !== 'train_station' || !isWorking(b)) continue;
    const platform = platformOf(world, b);
    if (platform === -1) continue;
    const { w, h } = BUILDINGS[b.def].size;
    stations.push({ id: b.id, platform, x: b.x + w / 2, y: b.y + h / 2 });
  }
  const n = stations.length;
  const minutes = new Float64Array(n * n).fill(Infinity);
  if (n === 0) return { stations, minutes };
  const dist = new Int32Array(world.width * world.height);
  const queue = new Int32Array(world.width * world.height);
  for (let a = 0; a < n; a++) {
    // Breadth-first over the track from this station's platform.
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    queue[tail++] = stations[a].platform;
    dist[stations[a].platform] = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % world.width;
      const y = (i - x) / world.width;
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!world.inBounds(nx, ny)) continue;
        const j = world.index(nx, ny);
        if (dist[j] !== -1 || !isRail(world, j)) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
    for (let b = 0; b < n; b++) {
      const d = dist[stations[b].platform];
      if (d >= 0) minutes[a * n + b] = d * RAIL.minutesPerTile;
    }
  }
  return { stations, minutes };
}

/** The station serving a tile: the nearest within walking reach, and the walk in minutes. */
export function servingStation(net: RailNetwork, world: World, tile: number): { station: number; walk: number } | null {
  const x = tile % world.width;
  const y = (tile - x) / world.width;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < net.stations.length; k++) {
    const s = net.stations[k];
    const d = Math.hypot(s.x - (x + 0.5), s.y - (y + 0.5));
    if (d <= RAIL.walkTiles && d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best === -1 ? null : { station: best, walk: bestD * RAIL.walkMinutes };
}

/** Track tiles from one platform to another (breadth-first, so the shortest run), or null if not joined. */
export function railPath(world: World, from: number, to: number): Int32Array | null {
  const prev = new Int32Array(world.width * world.height).fill(-1);
  const queue = new Int32Array(world.width * world.height);
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  prev[from] = from;
  while (head < tail) {
    const i = queue[head++];
    if (i === to) break;
    const x = i % world.width;
    const y = (i - x) / world.width;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!world.inBounds(nx, ny)) continue;
      const j = world.index(nx, ny);
      if (prev[j] !== -1 || !isRail(world, j)) continue;
      prev[j] = i;
      queue[tail++] = j;
    }
  }
  if (prev[to] === -1) return null;
  const out: number[] = [];
  for (let v = to; v !== from; v = prev[v]) out.push(v);
  out.push(from);
  return Int32Array.from(out.reverse());
}

/** The four corner masks: two arms at right angles. */
const CORNERS: ReadonlySet<number> = new Set([0b0011, 0b0110, 0b1100, 0b1001]);

export function isCornerMask(mask: number): boolean {
  return CORNERS.has(mask);
}

/**
 * How a corner piece of track is drawn and driven (curved track, D-089): a straight 45° chord
 * when it's part of a staircase (a neighbour along an arm is the opposite corner, so the run
 * reads as one diagonal), otherwise a quarter-turn arc. Null for anything but a corner.
 */
export function railCornerShape(world: World, x: number, y: number): 'arc' | 'chord' | null {
  const mask = railMask(world, x, y);
  if (!CORNERS.has(mask)) return null;
  const opposite = ~mask & 0b1111;
  for (let d = 0; d < 4; d++) {
    if (!(mask & (1 << d))) continue;
    const nx = x + STEPS[d][0];
    const ny = y + STEPS[d][1];
    if (world.inBounds(nx, ny) && railMask(world, nx, ny) === opposite) return 'chord';
  }
  return 'arc';
}

/**
 * The tiles a rail drag lays: a 45° staircase when the drag is roughly diagonal (and not held
 * straight), stepping across and along in turn and finishing in a straight run; otherwise
 * like a road (an L, or one axis).
 */
export function railDragPath(a: { x: number; y: number }, b: { x: number; y: number }, straight: boolean): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const diagonal = !straight && ax > 0 && ay > 0 && Math.min(ax, ay) / Math.max(ax, ay) >= 0.4;
  if (!diagonal) return roadPath(a, b, straight);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const steps = Math.min(ax, ay);
  const out = [{ x: a.x, y: a.y }];
  let x = a.x;
  let y = a.y;
  for (let k = 0; k < steps; k++) {
    x += sx;
    out.push({ x, y });
    y += sy;
    out.push({ x, y });
  }
  while (x !== b.x) out.push({ x: (x += sx), y });
  while (y !== b.y) out.push({ x, y: (y += sy) });
  return out;
}

/**
 * A point along a track path (tile indices, in order), `s` tiles from the first tile's centre,
 * following the drawn track: straight through straight pieces, a chord or arc through corners.
 * Returns world tile coordinates and the unit direction of travel along the path.
 */
export function pointOnTrack(world: World, path: Int32Array, s: number): { x: number; y: number; tx: number; ty: number } {
  const n = path.length;
  const w = world.width;
  const cx = (k: number) => (path[k] % w) + 0.5;
  const cy = (k: number) => Math.floor(path[k] / w) + 0.5;
  const j = Math.max(0, Math.min(n - 1, Math.round(s)));
  // Within tile j: from where the track enters it (the edge shared with the tile before, or its
  // centre at the start) to where it leaves (the next shared edge, or its centre at the end).
  const u = Math.max(0, Math.min(1, s - j + 0.5));
  const ex = j > 0 ? (cx(j - 1) + cx(j)) / 2 : cx(j);
  const ey = j > 0 ? (cy(j - 1) + cy(j)) / 2 : cy(j);
  const xx = j < n - 1 ? (cx(j) + cx(j + 1)) / 2 : cx(j);
  const xy = j < n - 1 ? (cy(j) + cy(j + 1)) / 2 : cy(j);
  const shape = j > 0 && j < n - 1 ? railCornerShape(world, Math.floor(cx(j)), Math.floor(cy(j))) : null;
  if (shape === 'arc') {
    // Quadratic through the tile centre, as the arc is drawn.
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    const px = a * ex + b * cx(j) + c * xx;
    const py = a * ey + b * cy(j) + c * xy;
    const tx = 2 * (1 - u) * (cx(j) - ex) + 2 * u * (xx - cx(j));
    const ty = 2 * (1 - u) * (cy(j) - ey) + 2 * u * (xy - cy(j));
    const len = Math.hypot(tx, ty) || 1;
    return { x: px, y: py, tx: tx / len, ty: ty / len };
  }
  // Straight through (a chord on staircases). At the very ends E or X is the centre.
  const fx = ex + (xx - ex) * u;
  const fy = ey + (xy - ey) * u;
  let tx = xx - ex;
  let ty = xy - ey;
  if (tx === 0 && ty === 0) {
    tx = cx(Math.min(n - 1, j + 1)) - cx(Math.max(0, j - 1));
    ty = cy(Math.min(n - 1, j + 1)) - cy(Math.max(0, j - 1));
  }
  const len = Math.hypot(tx, ty) || 1;
  return { x: fx, y: fy, tx: tx / len, ty: ty / len };
}

const STATION_NAMES = [
  'Central',
  'Ribeirinha',
  'Rua do Mercado',
  'Parque',
  'Moinho Velho',
  'Portão Norte',
  'Rua do Porto',
  'Bosque dos Olmos',
  'Praça da União',
  'Colina',
  'Campo Oeste',
  'Caminho Real',
  'Riacho',
  'Rua da Fundição',
  'Prado',
  'Rua da Estação',
] as const;

/** A station's name, the same every time for the same building. */
export function stationName(id: number): string {
  // A multiplicative hash spreads neighbouring ids over the list.
  const hash = Math.imul(id, 2654435761) >>> 0;
  return STATION_NAMES[(hash >>> 28) % STATION_NAMES.length];
}

/**
 * Which side of a footprint its track runs along, as an art variant: 0 north-east (y − 1),
 * 1 south-east (x + w), 2 south-west (y + h), 3 north-west (x − 1); −1 with no track beside it.
 */
export function trackSide(world: World, x0: number, y0: number, w: number, h: number): number {
  const hits = [0, 0, 0, 0];
  for (let x = x0; x < x0 + w; x++) {
    if (world.inBounds(x, y0 - 1) && isRail(world, world.index(x, y0 - 1))) hits[0]++;
    if (world.inBounds(x, y0 + h) && isRail(world, world.index(x, y0 + h))) hits[2]++;
  }
  for (let y = y0; y < y0 + h; y++) {
    if (world.inBounds(x0 + w, y) && isRail(world, world.index(x0 + w, y))) hits[1]++;
    if (world.inBounds(x0 - 1, y) && isRail(world, world.index(x0 - 1, y))) hits[3]++;
  }
  const best = hits.indexOf(Math.max(...hits));
  return hits[best] > 0 ? best : -1;
}

/** Which side of a footprint has the most road beside it (0 north-east … 3 north-west), or −1. */
export function roadSide(world: World, x0: number, y0: number, w: number, h: number): number {
  const hits = [0, 0, 0, 0];
  const road = (x: number, y: number) => world.inBounds(x, y) && world.road[world.index(x, y)] !== 0;
  for (let x = x0; x < x0 + w; x++) {
    if (road(x, y0 - 1)) hits[0]++;
    if (road(x, y0 + h)) hits[2]++;
  }
  for (let y = y0; y < y0 + h; y++) {
    if (road(x0 + w, y)) hits[1]++;
    if (road(x0 - 1, y)) hits[3]++;
  }
  const best = hits.indexOf(Math.max(...hits));
  return hits[best] > 0 ? best : -1;
}
