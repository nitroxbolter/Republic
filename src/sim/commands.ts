import { BALANCE } from '../shared/balance';
import { BUILDINGS, buildingDef, footprintOrigin, type BuildingDef, type BuildingId } from './buildings/catalog';
import type { City } from './City';
import { ROAD_SPECS, roadSpec } from './roadTypes';
import { isUnlocked } from './stages';
import { isRail, Rail, railMask, railUnlocked, roadSide, trackSide, type RailId } from './rail';
import { DIRS, BridgeAxis, roadMask, RoadType, type BridgeAxisId, type BuildableRoad, type TilePos } from './roads';
import { Decor, Terrain } from './terrain/types';
import type { World } from './World';
import { ZoneType, zoneOf, type ZoneTypeId } from './zones';

/**
 * Every world mutation goes through a plan → apply pair (docs/decisions.md D-014).
 * `plan*` is pure: it validates and prices, and drives the tool preview.
 * `apply*` re-checks funds and mutates.
 */

export interface PlannedTile extends TilePos {
  /** Whether this tile will actually be changed. */
  valid: boolean;
  cost: number;
  /** Set for road tiles over water. */
  bridge?: BridgeAxisId;
  /** One-way carriageways: travel direction (sim/roads.ts DIRS index). */
  lane?: number;
  /** Rail tiles: track on land or on a bridge (sim/rail.ts Rail). */
  rail?: RailId;
  /** Flyover tiles (TX2): the new road crosses over the existing one on a deck along this axis (1 x, 2 y). */
  overAxis?: 1 | 2;
}

export interface Plan {
  tiles: PlannedTile[];
  /** Total cost of the valid tiles. */
  cost: number;
  /** Number of tiles that will change. */
  count: number;
}

export interface ApplyResult {
  ok: boolean;
  reason?: 'nothing-to-do' | 'insufficient-funds' | 'locked';
  /** Bounding box of changed tiles, for render refresh. */
  changed?: { minX: number; minY: number; maxX: number; maxY: number };
  /** Tiles that changed, in plan order (drives build effects). */
  tiles?: readonly PlannedTile[];
}

/** Cost of clearing trees and decorations from tile `i`. */
export function clearCost(world: World, i: number): number {
  let cost = world.tree[i] * BALANCE.treeClearCost;
  const d = world.decor[i];
  if (d === Decor.Rocks) cost += BALANCE.rocksClearCost;
  else if (d === Decor.Boulder) cost += BALANCE.boulderClearCost;
  else if (d !== Decor.None) cost += BALANCE.minorDecorClearCost;
  return cost;
}

function isWater(world: World, i: number): boolean {
  const t = world.terrain[i];
  return t === Terrain.DeepWater || t === Terrain.ShallowWater;
}



/** Land a road can go on: not rock, no building. Existing roads count (they're kept or upgraded). */
function roadableLand(world: World, i: number): boolean {
  return !isWater(world, i) && world.terrain[i] !== Terrain.Rock && world.building[i] === -1;
}

/**
 * Check the water run that starts at path[k] (path[k − 1] is land). A bridge must start on
 * roadable land, be straight (every step, including the one back onto land, goes the same
 * way), land on roadable land within the path, span at most maxBridgeSpan tiles, and not
 * cross an existing bridge sideways. Otherwise it would be left dangling.
 */
function bridgeRunValid(world: World, path: readonly TilePos[], k: number): boolean {
  const start = path[k - 1];
  if (!world.inBounds(start.x, start.y) || !roadableLand(world, world.index(start.x, start.y))) return false;
  const dx = path[k].x - start.x;
  const dy = path[k].y - start.y;
  const axis = dx !== 0 ? BridgeAxis.X : BridgeAxis.Y;
  for (let j = k; j < path.length; j++) {
    const p = path[j];
    if (p.x - path[j - 1].x !== dx || p.y - path[j - 1].y !== dy) return false;
    if (!world.inBounds(p.x, p.y)) return false;
    const i = world.index(p.x, p.y);
    if (!isWater(world, i)) return j - k <= BALANCE.maxBridgeSpan && roadableLand(world, i);
    if (world.bridge[i] !== BridgeAxis.None && world.bridge[i] !== axis) return false;
  }
  return false; // path ends over water
}

/**
 * Price a road along `path`. Each tile is judged on its own (docs/specs/roads.md): rock,
 * buildings and the map edge block only their own tiles, and the rest of the drag still builds.
 * Water is crossed by straight bridges that start and end on roadable land; a crossing that
 * can't be bridged is blocked as a whole. The same or a bigger road is kept for free; a
 * smaller one is upgraded in place, paying the difference.
 *
 * Wide roads (boulevards, expressways) lay two rows from one straight drag: the dragged row
 * carries traffic in the drag's direction, the row on its left the other way (we drive on the
 * right). A step is built only where both rows can be, so no half carriageways are left.
 */
export function planRoad(world: World, path: readonly TilePos[], type: BuildableRoad, opts: { flyover?: boolean } = {}): Plan {
  const spec = ROAD_SPECS[type];
  if (spec.width === 1) return planRow(world, path, type, -1, opts.flyover === true);
  const a = path[0];
  const b = path[path.length - 1];
  const d = path.length < 2 ? 1 : b.x > a.x ? 1 : b.x < a.x ? 3 : b.y > a.y ? 2 : 0;
  const [lx, ly] = DIRS[(d + 3) % 4];
  const near = planRow(world, path, type, d);
  const far = planRow(
    world,
    path.map((p) => ({ x: p.x + lx, y: p.y + ly })),
    type,
    (d + 2) % 4,
  );
  // Pair the rows step by step (out-of-bounds steps are missing from a row).
  const farAt = new Map(far.tiles.map((t) => [`${t.x - lx},${t.y - ly}`, t]));
  const tiles: PlannedTile[] = [];
  let cost = 0;
  let count = 0;
  for (const t of near.tiles) {
    const f = farAt.get(`${t.x},${t.y}`);
    const both = t.valid && f !== undefined && f.valid;
    for (const p of f ? [t, f] : [t]) {
      tiles.push(both ? p : { ...p, valid: false, cost: 0 });
      if (both) {
        cost += p.cost;
        if (p.cost > 0) count++;
      }
    }
  }
  return { tiles, cost, count };
}

/** One row of road tiles (see planRoad). `lane` is the travel direction for one-way rows, −1 otherwise. */
function planRow(world: World, path: readonly TilePos[], type: BuildableRoad, lane: number, flyover = false): Plan {
  const tiles: PlannedTile[] = [];
  let cost = 0;
  let count = 0;
  const spec = ROAD_SPECS[type];
  const oneWay = lane >= 0 ? { lane } : {};
  /** Whether the water crossing we're in can be bridged; decided on entering it. */
  let crossingOk = false;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    if (!world.inBounds(p.x, p.y)) continue;
    const i = world.index(p.x, p.y);
    const water = isWater(world, i);

    let bridge: BridgeAxisId = BridgeAxis.None;
    if (water) {
      const prev = k > 0 ? path[k - 1] : null;
      const prevI = prev && world.inBounds(prev.x, prev.y) ? world.index(prev.x, prev.y) : -1;
      if (prevI === -1 || !isWater(world, prevI)) crossingOk = prevI !== -1 && bridgeRunValid(world, path, k);
      if (crossingOk && prev) bridge = p.x !== prev.x ? BridgeAxis.X : BridgeAxis.Y;
    }
    // Roads pass under track at right angles (it's carried on an overpass), never along it:
    // trains and cars never meet at grade (user call, D-091).
    const blockedByRail = isRail(world, i) && !crossesAtRightAngle(railMask(world, p.x, p.y), path, k);
    if (blockedByRail || (water ? !crossingOk : !roadableLand(world, i))) {
      tiles.push({ ...p, valid: false, cost: 0 });
      continue;
    }

    const existing = roadSpec(world.road[i]);
    // Flyover mode: crossing another road at right angles, carry this one over it on a deck (TX2).
    if (flyover && existing && !water && world.bridge[i] === BridgeAxis.None && world.over[i] === 0 && !isRail(world, i) && crossesAtRightAngle(roadMask(world, p.x, p.y), path, k)) {
      const a = path[Math.max(0, k - 1)];
      const b = path[Math.min(path.length - 1, k + 1)];
      const c = BALANCE.flyoverCost + spec.cost;
      tiles.push({ ...p, valid: true, cost: c, overAxis: a.x !== b.x ? 1 : 2 });
      cost += c;
      count++;
      continue;
    }
    if (existing && existing.rank >= spec.rank) {
      tiles.push({ ...p, valid: true, cost: 0, ...(water && { bridge }) });
      continue;
    }
    const full = water ? spec.bridgeCost : spec.cost + clearCost(world, i);
    const c = existing ? Math.max(1, full - (water ? existing.bridgeCost : existing.cost)) : full;
    tiles.push({ ...p, valid: true, cost: c, ...(water && { bridge }), ...oneWay });
    cost += c;
    count++;
  }
  return { tiles, cost, count };
}

/** Build a planned road. `pave` is the footpath style picked in the road tool (World.pave; 0 = default). */
export function applyRoad(city: City, plan: Plan, type: BuildableRoad, pave = 0): ApplyResult {
  const w = city.world;
  // Tiles that already carry the road are listed with cost 0; every real change costs at least the road price.
  const real = plan.tiles.filter((t) => t.valid && t.cost > 0);
  if (real.length === 0) return { ok: false, reason: 'nothing-to-do' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  for (const t of real) {
    const i = w.index(t.x, t.y);
    if (t.overAxis) {
      // A flyover deck: the road underneath stays as it is.
      w.over[i] = type;
      w.overAxis[i] = t.overAxis;
      continue;
    }
    w.road[i] = type;
    w.bridge[i] = t.bridge ?? BridgeAxis.None;
    w.lane[i] = t.lane === undefined ? 0 : t.lane + 1;
    w.pave[i] = pave;
    w.tree[i] = 0;
    w.decor[i] = Decor.None;
    w.zone[i] = ZoneType.None;
  }
  city.funds -= plan.cost;
  return { ok: true, changed: bounds(real), tiles: real };
}

/**
 * Price rail track along `path` (docs/specs/evolution.md, E7b). Like roads: rock, buildings and
 * the map edge block their own tiles; water is crossed by straight bridges. Track crosses a road
 * only at right angles, on an overpass, and never runs along one (D-091).
 */
export function planRail(world: World, path: readonly TilePos[]): Plan {
  const tiles: PlannedTile[] = [];
  let cost = 0;
  let count = 0;
  let crossingOk = false;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    if (!world.inBounds(p.x, p.y)) continue;
    const i = world.index(p.x, p.y);
    if (isRail(world, i)) {
      tiles.push({ ...p, valid: true, cost: 0 });
      continue;
    }
    const water = isWater(world, i);
    if (water) {
      const prev = k > 0 ? path[k - 1] : null;
      const prevI = prev && world.inBounds(prev.x, prev.y) ? world.index(prev.x, prev.y) : -1;
      if (prevI === -1 || !isWater(world, prevI)) crossingOk = prevI !== -1 && bridgeRunValid(world, path, k);
    }
    const road = roadSpec(world.road[i]);
    // Over a road the track rides an overpass (D-091): at right angles only, and not over a bridge.
    const crossing = road !== null && world.bridge[i] === BridgeAxis.None && crossesAtRightAngle(roadMask(world, p.x, p.y), path, k);
    const ok = water ? crossingOk && world.road[i] === RoadType.None : world.terrain[i] !== Terrain.Rock && world.building[i] === -1 && (road === null || crossing);
    if (!ok) {
      tiles.push({ ...p, valid: false, cost: 0 });
      continue;
    }
    const c = water ? BALANCE.railBridgeCost : BALANCE.railCost + (road ? 0 : clearCost(world, i));
    tiles.push({ ...p, valid: true, cost: c, rail: water ? Rail.Bridge : Rail.Track });
    cost += c;
    count++;
  }
  return { tiles, cost, count };
}

/** Lay planned track (needs the Rapid transit research in cities that lock by stage). */
export function applyRail(city: City, plan: Plan): ApplyResult {
  const real = plan.tiles.filter((t) => t.valid && t.cost > 0);
  if (real.length === 0) return { ok: false, reason: 'nothing-to-do' };
  if (!railUnlocked(city)) return { ok: false, reason: 'locked' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  const w = city.world;
  for (const t of real) {
    const i = w.index(t.x, t.y);
    w.rail[i] = t.rail ?? Rail.Track;
    w.tree[i] = 0;
    w.decor[i] = Decor.None;
    w.zone[i] = ZoneType.None;
  }
  city.funds -= plan.cost;
  return { ok: true, changed: bounds(real), tiles: real };
}

/** Price clearing a region: trees, decorations, roads, buildings and zones. Empty tiles are listed as invalid (no-op). */
export function planClear(world: World, region: readonly TilePos[]): Plan {
  const tiles: PlannedTile[] = [];
  let cost = 0;
  let count = 0;
  for (const p of region) {
    if (!world.inBounds(p.x, p.y)) continue;
    const i = world.index(p.x, p.y);
    const hasSomething =
      world.tree[i] > 0 ||
      world.decor[i] !== Decor.None ||
      world.road[i] !== RoadType.None ||
      world.rail[i] !== Rail.None ||
      world.building[i] !== -1 ||
      world.zone[i] !== ZoneType.None;
    const c = hasSomething ? clearCost(world, i) : 0;
    tiles.push({ ...p, valid: hasSomething, cost: c });
    if (hasSomething) {
      cost += c;
      count++;
    }
  }
  return { tiles, cost, count };
}

export function applyClear(city: City, plan: Plan): ApplyResult {
  const valid = plan.tiles.filter((t) => t.valid);
  if (valid.length === 0) return { ok: false, reason: 'nothing-to-do' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  const w = city.world;
  const touched: TilePos[] = [...valid];
  for (const t of valid) {
    const i = w.index(t.x, t.y);
    w.tree[i] = 0;
    w.decor[i] = Decor.None;
    w.road[i] = RoadType.None;
    w.bridge[i] = BridgeAxis.None;
    w.lane[i] = 0;
    w.pave[i] = 0;
    w.rail[i] = Rail.None;
    w.over[i] = 0;
    w.overAxis[i] = 0;
    // Clear is the one "remove" tool: zones go too (there's no separate Dezone, D-051).
    w.zone[i] = ZoneType.None;
    // Selecting any tile of a building removes the whole building.
    touched.push(...removeBuildingAt(w, i));
  }
  city.funds -= plan.cost;
  return { ok: true, changed: bounds(touched), tiles: valid };
}

function bounds(tiles: readonly TilePos[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  }
  return { minX, minY, maxX, maxY };
}

export interface PlacePlan extends Plan {
  building: BuildingId;
  /** Footprint's top (north) tile. */
  origin: TilePos;
  /** Every footprint tile is valid. */
  ok: boolean;
  /** Why it can't be built here beyond the tiles (e.g. a station with no track beside it). */
  note?: string;
}

/** Price placing `id` with its footprint centred on (cx, cy). Trees and decorations are auto-cleared. */
export function planPlace(world: World, id: BuildingId, cx: number, cy: number): PlacePlan {
  const def = BUILDINGS[id];
  const origin = footprintOrigin(id, cx, cy);
  const tiles: PlannedTile[] = [];
  let clearing = 0;
  let ok = true;
  for (let y = origin.y; y < origin.y + def.size.h; y++) {
    for (let x = origin.x; x < origin.x + def.size.w; x++) {
      if (!world.inBounds(x, y)) {
        ok = false;
        continue;
      }
      const i = world.index(x, y);
      const valid =
        !isWater(world, i) &&
        world.terrain[i] !== Terrain.Rock &&
        world.road[i] === RoadType.None &&
        world.rail[i] === Rail.None &&
        world.building[i] === -1 &&
        // Buildings need a flat footprint (docs/specs/elevation.md).
        world.elevation[i] === world.elevation[world.index(origin.x, origin.y)];
      const c = valid ? clearCost(world, i) : 0;
      tiles.push({ x, y, valid, cost: c });
      clearing += c;
      if (!valid) ok = false;
    }
  }
  // A station needs track beside it for its platform (sim/rail.ts).
  const def2: BuildingDef = def;
  const needsTrack = def2.railStation === true && !trackAround(world, origin.x, origin.y, def.size.w, def.size.h);
  if (needsTrack) ok = false;
  return { tiles, cost: def.cost + clearing, count: ok ? 1 : 0, building: id, origin, ok, ...(needsTrack && { note: 'A estação precisa de trilhos ao lado' }) };
}

/** Any track in the ring of tiles around a footprint. */
function trackAround(world: World, x0: number, y0: number, w: number, h: number): boolean {
  for (let y = y0 - 1; y <= y0 + h; y++) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const inside = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
      if (!inside && world.inBounds(x, y) && isRail(world, world.index(x, y))) return true;
    }
  }
  return false;
}

/** Does the path at step k run across a straight (or end) piece whose arms are all on the other axis? */
function crossesAtRightAngle(mask: number, path: readonly TilePos[], k: number): boolean {
  const a = path[Math.max(0, k - 1)];
  const b = path[Math.min(path.length - 1, k + 1)];
  // Path along x (SE–NW, bits 1 and 3) crosses pieces on the y axis (bits 0 and 2), and vice versa.
  const alongX = a.x !== b.x;
  const other = alongX ? 0b0101 : 0b1010;
  return mask !== 0 && (mask & ~other) === 0;
}

export function applyPlace(city: City, plan: PlacePlan, variant: number): ApplyResult {
  if (!plan.ok) return { ok: false, reason: 'nothing-to-do' };
  if (!isUnlocked(city, plan.building)) return { ok: false, reason: 'locked' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  const w = city.world;
  const { size } = BUILDINGS[plan.building];
  for (const t of plan.tiles) {
    const i = w.index(t.x, t.y);
    w.tree[i] = 0;
    w.decor[i] = Decor.None;
    // Placed buildings never sit on a zone (only grown ones do).
    w.zone[i] = ZoneType.None;
  }
  // Stations face what they serve: a train station its track, a bus station its street (its
  // driveway turns off there). The side is the art variant.
  const pd = buildingDef(plan.building);
  const side = pd.railStation
    ? trackSide(w, plan.origin.x, plan.origin.y, size.w, size.h)
    : pd.busStation
      ? roadSide(w, plan.origin.x, plan.origin.y, size.w, size.h)
      : -1;
  w.addBuilding({ def: plan.building, x: plan.origin.x, y: plan.origin.y, variant: side >= 0 ? side : variant }, size.w, size.h);
  city.funds -= plan.cost;
  return { ok: true, changed: bounds(plan.tiles), tiles: plan.tiles };
}

export interface MovePlan extends PlacePlan {
  /** The building being moved. */
  moving: number;
}

/** Can a building move here? Built buildings only, same rules as placing; its own tiles count as free. */
export function planMove(world: World, id: number, cx: number, cy: number): MovePlan | null {
  const b = world.buildings.get(id);
  if (!b) return null;
  const def = BUILDINGS[b.def];
  const origin = footprintOrigin(b.def, cx, cy);
  const tiles: PlannedTile[] = [];
  let clearing = 0;
  let ok = b.construction === 0 && (origin.x !== b.x || origin.y !== b.y);
  for (let y = origin.y; y < origin.y + def.size.h; y++) {
    for (let x = origin.x; x < origin.x + def.size.w; x++) {
      if (!world.inBounds(x, y)) {
        ok = false;
        continue;
      }
      const i = world.index(x, y);
      const occupant = world.building[i];
      const valid =
        !isWater(world, i) && world.terrain[i] !== Terrain.Rock && world.road[i] === RoadType.None && world.rail[i] === Rail.None && (occupant === -1 || occupant === id);
      const c = valid ? clearCost(world, i) : 0;
      tiles.push({ x, y, valid, cost: c });
      clearing += c;
      if (!valid) ok = false;
    }
  }
  const fee = Math.round(def.cost * BALANCE.moveCostShare);
  return { tiles, cost: fee + clearing, count: ok ? 1 : 0, building: b.def, origin, ok, moving: id };
}

/**
 * Move a building, keeping everything about it (residents, level, happiness, battery charge).
 * A grown home or business brings its zone along; the lot it leaves stays zoned, so something
 * new can grow there.
 */
export function applyMove(city: City, plan: MovePlan): ApplyResult {
  if (!plan.ok) return { ok: false, reason: 'nothing-to-do' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  const w = city.world;
  const b = w.buildings.get(plan.moving);
  if (!b) return { ok: false, reason: 'nothing-to-do' };
  const def: BuildingDef = BUILDINGS[b.def];
  const from: TilePos[] = [
    { x: b.x, y: b.y },
    { x: b.x + def.size.w - 1, y: b.y + def.size.h - 1 },
  ];
  const zone = b.grown && def.zone && def.density ? zoneOf(def.zone, def.density) : ZoneType.None;
  for (const t of plan.tiles) {
    const i = w.index(t.x, t.y);
    w.tree[i] = 0;
    w.decor[i] = Decor.None;
    w.zone[i] = zone;
  }
  w.moveBuilding(b.id, plan.origin.x, plan.origin.y, def.size.w, def.size.h);
  city.funds -= plan.cost;
  return { ok: true, changed: bounds([...from, ...plan.tiles]), tiles: plan.tiles };
}

/** Remove the building covering tile `i`, if any. Returns its footprint corners for refresh bounds. */
function removeBuildingAt(w: World, i: number): TilePos[] {
  const b = w.buildings.get(w.building[i]);
  if (!b) return [];
  const { w: bw, h: bh } = BUILDINGS[b.def].size;
  w.removeBuilding(b.id, bw, bh);
  return [
    { x: b.x, y: b.y },
    { x: b.x + bw - 1, y: b.y + bh - 1 },
  ];
}

/**
 * Price zoning a region as `zone`. Valid tiles are the ones that change:
 * land without rock or road, not already this zone, and either empty or holding a grown building
 * (which rezoning or dezoning removes). See docs/specs/buildings.md, "Zoning".
 */
export function planZone(world: World, region: readonly TilePos[], zone: ZoneTypeId): Plan {
  const tiles: PlannedTile[] = [];
  let cost = 0;
  let count = 0;
  for (const p of region) {
    if (!world.inBounds(p.x, p.y)) continue;
    const i = world.index(p.x, p.y);
    const b = world.buildings.get(world.building[i]);
    const valid =
      world.zone[i] !== zone &&
      !isWater(world, i) &&
      world.terrain[i] !== Terrain.Rock &&
      world.road[i] === RoadType.None &&
      world.rail[i] === Rail.None &&
      (b === undefined || b.grown);
    const c = valid && zone !== ZoneType.None ? BALANCE.zoneCost : 0;
    tiles.push({ ...p, valid, cost: c });
    if (valid) {
      cost += c;
      count++;
    }
  }
  return { tiles, cost, count };
}

export function applyZone(city: City, plan: Plan, zone: ZoneTypeId): ApplyResult {
  const valid = plan.tiles.filter((t) => t.valid);
  if (valid.length === 0) return { ok: false, reason: 'nothing-to-do' };
  if (plan.cost > city.funds) return { ok: false, reason: 'insufficient-funds' };
  const w = city.world;
  const touched: TilePos[] = [...valid];
  for (const t of valid) {
    const i = w.index(t.x, t.y);
    w.zone[i] = zone;
    touched.push(...removeBuildingAt(w, i));
  }
  city.funds -= plan.cost;
  return { ok: true, changed: bounds(touched), tiles: valid };
}
