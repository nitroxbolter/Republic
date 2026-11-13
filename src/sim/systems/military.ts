import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingId } from '../buildings/catalog';
import type { City } from '../City';

export type MilitaryVehicle = 'patrol' | 'transport' | 'armored' | 'helicopter';
export type MilitaryUnitKind = 'soldier' | MilitaryVehicle;
export interface MilitaryWaypoint { x: number; y: number }
export interface MilitaryUnit {
  id: number;
  kind: MilitaryUnitKind;
  x: number;
  y: number;
  path: MilitaryWaypoint[];
  pathIndex: number;
  heading: number;
}
export type MilitaryPurchase = MilitaryVehicle | 'rifles' | 'ammunition' | 'supplies';

export interface MilitaryState {
  soldiers: number;
  vehicles: Record<MilitaryVehicle, number>;
  rifles: number;
  ammunition: number;
  supplies: number;
  units: MilitaryUnit[];
  nextUnitId: number;
}

export interface MilitaryCapacities {
  soldiers: number;
  vehicles: number;
  rifles: number;
  ammunition: number;
  supplies: number;
  barracks: number;
  garages: number;
  armories: number;
  depots: number;
  commandCenters: number;
}

export interface MilitaryReport {
  inventory: MilitaryState;
  capacity: MilitaryCapacities;
  monthlyPayroll: number;
  enlistmentCost: number;
  commandAvailable: boolean;
}

export type MilitaryActionResult =
  | { ok: true; cost: number; quantity: number }
  | { ok: false; reason: 'command' | 'facility' | 'capacity' | 'funds' | 'equipment' | 'quantity' };

export function emptyMilitary(): MilitaryState {
  return { soldiers: 0, vehicles: { patrol: 0, transport: 0, armored: 0, helicopter: 0 }, rifles: 0, ammunition: 0, supplies: 0, units: [], nextUnitId: 1 };
}

function stagingPosition(city: City, offset: number) {
  const base = facilities(city, 'military_base')[0];
  if (!base) return null;
  // Stage units around the apron at the front of the command center.
  const lane = offset % 10;
  const row = Math.floor(offset / 10);
  // Open staging area just in front of the command center, rather than stacking units on its roof.
  return { x: base.x - 1 + lane * 0.46, y: base.y + 3.5 + row * 0.46 };
}

class MinHeap {
  private readonly values: { i: number; f: number }[] = [];
  get length() { return this.values.length; }
  push(value: { i: number; f: number }) {
    let at = this.values.length;
    this.values.push(value);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.values[parent].f <= value.f) break;
      this.values[at] = this.values[parent];
      at = parent;
    }
    this.values[at] = value;
  }
  pop() {
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length) {
      let at = 0;
      while (true) {
        const left = at * 2 + 1, right = left + 1;
        if (left >= this.values.length) break;
        const child = right < this.values.length && this.values[right].f < this.values[left].f ? right : left;
        if (this.values[child].f >= last.f) break;
        this.values[at] = this.values[child];
        at = child;
      }
      this.values[at] = last;
    }
    return first;
  }
}

function spawnUnits(city: City, kind: MilitaryUnitKind, quantity: number) {
  const offset = city.military.units.length;
  for (let i = 0; i < quantity; i++) {
    const p = stagingPosition(city, offset + i);
    if (!p) break;
    city.military.units.push({ id: city.military.nextUnitId++, kind, ...p, path: [], pathIndex: 0, heading: 0 });
  }
}

function pathFor(city: City, unit: MilitaryUnit, tx: number, ty: number): MilitaryWaypoint[] | null {
  const world = city.world;
  const sx = Math.floor(unit.x), sy = Math.floor(unit.y);
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return null;
  const start = world.index(Math.max(0, Math.min(world.width - 1, sx)), Math.max(0, Math.min(world.height - 1, sy)));
  const target = world.index(tx, ty);
  const isHelicopter = unit.kind === 'helicopter';
  const baseId = world.building[start];
  const walkable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
    const i = world.index(x, y);
    if (isHelicopter) return true;
    const building = world.building[i];
    const water = world.terrain[i] === 0 || world.terrain[i] === 1;
    return (!water || world.bridge[i] !== 0) && (building === -1 || building === baseId && baseId !== -1);
  };
  if (!walkable(tx, ty)) return null;
  if (start === target) return [];
  const n = world.width * world.height;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new MinHeap();
  open.push({ i: start, f: 0 });
  g[start] = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
  const heuristic = (x: number, y: number) => Math.max(Math.abs(tx - x), Math.abs(ty - y)) + (Math.SQRT2 - 1) * Math.min(Math.abs(tx - x), Math.abs(ty - y));
  let expanded = 0;
  while (open.length && expanded++ < n) {
    const current = open.pop()!.i;
    if (closed[current]) continue;
    if (current === target) {
      const path: MilitaryWaypoint[] = [];
      for (let at = target; at !== start; at = parent[at]) path.push({ x: at % world.width + 0.5, y: Math.floor(at / world.width) + 0.5 });
      return path.reverse();
    }
    closed[current] = 1;
    const x = current % world.width, y = Math.floor(current / world.width);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(nx, ny) || (dx !== 0 && dy !== 0 && (!walkable(x + dx, y) || !walkable(x, y + dy)))) continue;
      const next = world.index(nx, ny);
      if (closed[next]) continue;
      const cost = g[current] + (dx && dy ? Math.SQRT2 : 1);
      if (cost >= g[next]) continue;
      parent[next] = current;
      g[next] = cost;
      open.push({ i: next, f: cost + heuristic(nx, ny) });
    }
  }
  return null;
}

export function issueMilitaryMove(city: City, unitId: number, tileX: number, tileY: number): 'ok' | 'unit' | 'blocked' {
  const unit = city.military.units.find((item) => item.id === unitId);
  if (!unit) return 'unit';
  const path = pathFor(city, unit, tileX, tileY);
  if (!path) return 'blocked';
  unit.path = path;
  unit.pathIndex = 0;
  return 'ok';
}

export function advanceMilitaryUnits(city: City, dt: number) {
  if (dt <= 0) return;
  for (const unit of city.military.units) {
    const speed = unit.kind === 'soldier' ? 1.05 : unit.kind === 'helicopter' ? 3.4 : 2.1;
    let remaining = speed * dt;
    while (remaining > 0 && unit.pathIndex < unit.path.length) {
      const p = unit.path[unit.pathIndex];
      const dx = p.x - unit.x, dy = p.y - unit.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.0001) { unit.pathIndex++; continue; }
      unit.heading = Math.atan2(dy, dx);
      const step = Math.min(distance, remaining);
      unit.x += dx / distance * step;
      unit.y += dy / distance * step;
      remaining -= step;
      if (step === distance) unit.pathIndex++;
    }
    if (unit.pathIndex >= unit.path.length) { unit.path = []; unit.pathIndex = 0; }
  }
}

/** Backfill movable sprites for saves created before units had world positions. */
export function restoreMilitaryUnits(city: City) {
  if (city.military.units.length || !facilities(city, 'military_base').length) return;
  const maxSoldiers = Math.min(city.military.soldiers, militaryCapacities(city).soldiers);
  const maxVehicles = Math.min(Object.values(city.military.vehicles).reduce((sum, count) => sum + count, 0), militaryCapacities(city).vehicles);
  for (let i = 0; i < maxSoldiers; i++) spawnUnits(city, 'soldier', 1);
  for (const kind of ['patrol', 'transport', 'armored', 'helicopter'] as const) {
    const count = Math.min(city.military.vehicles[kind], maxVehicles);
    for (let i = 0; i < count; i++) spawnUnits(city, kind, 1);
  }
}

function facilities(city: City, id: BuildingId) {
  return [...city.world.buildings.values()].filter((b) => b.def === id && b.construction === 0);
}

export function militaryCapacities(city: City): MilitaryCapacities {
  const barracks = facilities(city, 'barracks');
  const bases = facilities(city, 'military_base');
  const garages = facilities(city, 'military_garage');
  const armories = facilities(city, 'armory');
  const depots = facilities(city, 'military_depot');
  return {
    soldiers: [...barracks, ...bases].reduce((sum, b) => sum + BUILDINGS[b.def].capacity, 0),
    vehicles: garages.reduce((sum, b) => sum + BUILDINGS[b.def].capacity, 0),
    rifles: armories.length * BALANCE.military.riflesPerArmory,
    ammunition: armories.length * BALANCE.military.ammoPerArmory,
    supplies: depots.length * BALANCE.military.suppliesPerDepot,
    barracks: barracks.length,
    garages: garages.length,
    armories: armories.length,
    depots: depots.length,
    commandCenters: bases.length,
  };
}

export function militaryReport(city: City): MilitaryReport {
  const capacity = militaryCapacities(city);
  return {
    inventory: city.military,
    capacity,
    monthlyPayroll: city.military.soldiers * BALANCE.military.monthlySoldierPay,
    enlistmentCost: BALANCE.military.enlistmentCost,
    commandAvailable: capacity.commandCenters > 0,
  };
}

export function militaryMonthlyPayroll(city: City): number {
  return Math.round(city.military.soldiers * BALANCE.military.monthlySoldierPay);
}

function quantityIsValid(quantity: number) {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10_000;
}

export function enlistSoldiers(city: City, quantity: number): MilitaryActionResult {
  if (!quantityIsValid(quantity)) return { ok: false, reason: 'quantity' };
  const capacity = militaryCapacities(city);
  if (!capacity.commandCenters) return { ok: false, reason: 'command' };
  if (!capacity.soldiers) return { ok: false, reason: 'facility' };
  if (city.military.soldiers + quantity > capacity.soldiers) return { ok: false, reason: 'capacity' };
  if (city.military.rifles < quantity || city.military.ammunition < quantity * BALANCE.military.roundsPerSoldier) return { ok: false, reason: 'equipment' };
  const cost = quantity * BALANCE.military.enlistmentCost;
  if (city.funds < cost) return { ok: false, reason: 'funds' };
  city.funds -= cost;
  city.military.soldiers += quantity;
  spawnUnits(city, 'soldier', quantity);
  city.military.rifles -= quantity;
  city.military.ammunition -= quantity * BALANCE.military.roundsPerSoldier;
  return { ok: true, cost, quantity };
}

const VEHICLE_FACILITY: Readonly<Record<MilitaryVehicle, BuildingId>> = {
  patrol: 'military_garage',
  transport: 'military_garage',
  armored: 'military_garage',
  helicopter: 'military_garage',
};

export function purchaseMilitary(city: City, item: MilitaryPurchase, quantity: number): MilitaryActionResult {
  if (!quantityIsValid(quantity)) return { ok: false, reason: 'quantity' };
  const capacity = militaryCapacities(city);
  if (!capacity.commandCenters) return { ok: false, reason: 'command' };

  let cost: number;
  if (item in VEHICLE_FACILITY) {
    if (!facilities(city, VEHICLE_FACILITY[item as MilitaryVehicle]).length) return { ok: false, reason: 'facility' };
    const stored = Object.values(city.military.vehicles).reduce((sum, count) => sum + count, 0);
    if (stored + quantity > capacity.vehicles) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.vehicleCosts[item as MilitaryVehicle] * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.vehicles[item as MilitaryVehicle] += quantity;
    spawnUnits(city, item as MilitaryVehicle, quantity);
  } else if (item === 'rifles') {
    if (!capacity.armories) return { ok: false, reason: 'facility' };
    if (city.military.rifles + quantity > capacity.rifles) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.rifleCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.rifles += quantity;
  } else if (item === 'ammunition') {
    if (!capacity.armories) return { ok: false, reason: 'facility' };
    const rounds = quantity * BALANCE.military.roundsPerAmmoCrate;
    if (city.military.ammunition + rounds > capacity.ammunition) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.ammoCrateCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.ammunition += rounds;
  } else {
    if (!capacity.depots) return { ok: false, reason: 'facility' };
    const supplies = quantity * BALANCE.military.suppliesPerCrate;
    if (city.military.supplies + supplies > capacity.supplies) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.supplyCrateCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.supplies += supplies;
  }

  city.funds -= cost;
  return { ok: true, cost, quantity };
}
