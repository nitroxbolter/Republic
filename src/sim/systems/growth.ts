import { BALANCE } from '../../shared/balance';
import {
  ART_VARIANTS,
  BUILDINGS,
  BASIC_SERVICES,
  Lifestyle,
  startLevel,
  zonedBuildings,
  type BuildingDef,
  type BuildingId,
  type BuildingInstance,
  wealthOf,
} from '../buildings/catalog';
import { findEntrance } from './access';
import { cityStats } from './population';
import { hasUtilities } from './utilities';
import { serviceBit, serviceScore } from './coverage';
import { Decor } from '../terrain/types';
import { isFlat } from '../terrain/elevation';
import type { World } from '../World';
import { isZoned, ZONE_DENSITY, ZONE_LETTER, ZONED_TYPES, zoneOf, type ZonedType } from '../zones';
import type { City } from '../City';
import type { DayOutcome, SimSystem } from '../core/System';
import { materialsFor, UNLIMITED, type MaterialStock } from './materials';
import { economyReport, effectiveJobs, householdPurchasingPower } from './economy';

/**
 * Zoned growth: demand, new lots, construction and levelling up. Runs once per in-game day.
 * See docs/specs/buildings.md, "Growth".
 */

type Rng = () => number;

/** Demand per zone in [−1, 1]. Positive means the city wants more of it. */
/** Demand per bar, each −1..1: homes, shops, offices, industry. */
export interface ZoneDemand {
  readonly r: number;
  /** Shops (low-density commercial). */
  readonly c: number;
  /** Offices (high-density commercial). */
  readonly o: number;
  readonly i: number;
}

/** A rectangle of world tiles. */
export interface TileArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GrowthResult {
  /** Areas whose buildings changed today (for render refresh). */
  readonly changed: readonly TileArea[];
  /** Ids of construction sites started today (new lots and upgrades). */
  readonly started: readonly number[];
  /** Ids of buildings that finished construction today. */
  readonly completed: readonly number[];
  /** Empty zoned tiles with road access that didn't grow because their demand is ≤ 0. */
  readonly waiting: ZoneDemand;
}

/** Investor confidence rises as the city becomes prosperous, served and well occupied. */
export function investorScore(world: World, taxRate: number = BALANCE.baseTaxRate): number {
  let occupied = 0;
  let capacity = 0;
  let happy = 0;
  let happyCount = 0;
  for (const b of world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (b.construction > 0 || b.abandoned) continue;
    if (d.category === 'residential') {
      capacity += d.capacity;
      occupied += b.occupants;
      happy += b.happiness;
      happyCount++;
    }
  }
  const homes = capacity === 0 ? 0 : occupied / capacity;
  const mood = happyCount === 0 ? 0 : happy / happyCount;
  const stats = cityStats(world, taxRate);
  const jobs = stats.housing === 0 ? 0 : Math.min(1, stats.jobs / Math.max(1, stats.population * BALANCE.workforceShare));
  return Math.max(0, Math.min(1, homes * 0.35 + mood * 0.4 + jobs * 0.25));
}

function isAffluentBuilding(id: BuildingId, confidence: number): boolean {
  const wealth = wealthOf(id);
  return wealth !== 'luxury' || confidence >= 0.72;
}

function eligibleBuildings(ids: readonly BuildingId[], confidence: number): BuildingId[] {
  return ids.filter((id) => isAffluentBuilding(id, confidence));
}

const DEMAND_FLOOR = { r: 50, c: 20, o: 40, i: 20 } as const;

function ratio(want: number, have: number, floor: number): number {
  return Math.max(-1, Math.min(1, (want - have) / Math.max(want, floor)));
}

/**
 * Homes need jobs and jobs follow homes. Supply counts every building, including sites
 * under construction, so demand drops as soon as a lot starts and growth doesn't overshoot.
 */
/** Higher taxes than the base rate cool demand, lower ones warm it (docs/specs/core.md). */
/** What demand is made of: capacities built, capacities wanted, and the tax effect. */
interface DemandInputs {
  housing: number;
  shops: number;
  offices: number;
  industrial: number;
  /** Jobs the workforce could still fill beyond every job that exists (negative: too many jobs). */
  openJobs: number;
  wantR: number;
  wantShops: number;
  wantOffices: number;
  wantI: number;
  /** University graduates in the city (docs/specs/evolution.md); each wants office work. */
  graduates: number;
}

function demandInputs(world: World, taxRate: number): DemandInputs {
  let housing = 0;
  let shops = 0;
  let offices = 0;
  let industrial = 0;
  let civic = 0;
  let graduates = 0;
  const economy = economyReport(world, taxRate);
  const university = serviceBit('university');
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if (d.category === 'residential' && b.lifestyle > Lifestyle.Basic && b.services & university && !b.abandoned) {
      graduates += b.occupants * BALANCE.graduateShare;
    }
    if (d.category === 'residential') housing += d.capacity;
    else if (d.category === 'commercial') {
      if (d.density === 'high') offices += d.capacity;
      else shops += d.capacity;
    } else if (d.category === 'industrial') industrial += d.capacity;
    else civic += d.capacity;
  }
  const structuralJobs = shops + offices + industrial + civic;
  let jobs = civic;
  for (const b of world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (d.category === 'commercial' || d.category === 'industrial') jobs += effectiveJobs(b, economy);
  }
  // Zone supply uses structural jobs to avoid building duplicate offices/industry just because
  // a tax shock temporarily lowered current production and staffing.
  const openJobs = housing * BALANCE.workforceShare * BALANCE.jobSlack - structuralJobs;
  return {
    housing,
    shops,
    offices,
    industrial,
    openJobs,
    wantR: (jobs / BALANCE.workforceShare) * BALANCE.housingSlack + BALANCE.seedHousing,
    wantShops: (housing * BALANCE.shopJobsPerResident + BALANCE.seedCommercialJobs) * economy.purchasingPower,
    wantOffices: offices + openJobs * BALANCE.officeJobShare + graduates * BALANCE.graduateOfficeJobs,
    wantI: industrial + openJobs * (1 - BALANCE.officeJobShare) + BALANCE.seedIndustrialJobs,
    graduates,
  };
}

export function zoneDemand(world: World, taxRate: number = BALANCE.baseTaxRate): ZoneDemand {
  const x = demandInputs(world, taxRate);
  const adjust = (d: number) => Math.max(-1, Math.min(1, d));
  return {
    r: adjust(ratio(x.wantR, x.housing, DEMAND_FLOOR.r)),
    c: adjust(ratio(x.wantShops, x.shops, DEMAND_FLOOR.c)),
    o: adjust(ratio(x.wantOffices, x.offices, DEMAND_FLOOR.o)),
    i: adjust(ratio(x.wantI, x.industrial, DEMAND_FLOOR.i)),
  };
}

/** One plain sentence per bar: why demand is where it is and what raises it (master plan §6.4). */
export type DemandWhy = Readonly<Record<keyof ZoneDemand, string>>;

export function explainDemand(world: World, taxRate: number = BALANCE.baseTaxRate): DemandWhy {
  const x = demandInputs(world, taxRate);
  const n = (v: number) => Math.round(Math.abs(v)).toLocaleString();
  const purchasingPower = householdPurchasingPower(taxRate);
  const taxNote = taxRate > BALANCE.baseTaxRate
    ? ` Com impostos de ${taxRate}%, o poder de compra é ${Math.round(purchasingPower * 100)}% do nível de referência e reduz as vendas do comércio.`
    : taxRate < BALANCE.baseTaxRate
      ? ` Com impostos de ${taxRate}%, o poder de compra é ${Math.round(purchasingPower * 100)}% do nível de referência.`
      : '';
  const tooManyJobs = `A cidade já tem ${n(x.openJobs)} empregos a mais que trabalhadores. Moradias atraem trabalhadores.`;
  return {
    r:
      (x.wantR > x.housing
        ? `Há empregos precisando de trabalhadores: espaço para cerca de ${n(x.wantR - x.housing)} novos moradores.`
        : 'Há mais moradias que empregos: lojas, escritórios e indústrias atraem moradores.') + taxNote,
    c:
      (x.wantShops > x.shops
        ? `Os moradores querem cerca de ${n(x.wantShops - x.shops)} novos empregos em lojas próximas.`
        : `Já há lojas suficientes (${n(x.shops)} empregos) para os moradores. Mais moradias aumentam a demanda.`) + taxNote,
    o:
      (x.openJobs > 0 ? `Os trabalhadores poderiam ocupar cerca de ${n(x.openJobs * BALANCE.officeJobShare)} novos empregos em escritórios.` : tooManyJobs) +
      (x.graduates >= 1 ? ` Formados querem cerca de ${n(x.graduates * BALANCE.graduateOfficeJobs)} empregos em escritórios.` : '') +
      taxNote,
    i: (x.openJobs > 0 ? `Os trabalhadores poderiam ocupar cerca de ${n(x.openJobs * (1 - BALANCE.officeJobShare))} novos empregos industriais.` : tooManyJobs) + taxNote,
  };
}

/** Which demand bar a zone grows on: shops and offices have their own. */
export function demandKey(zone: ZonedType): keyof ZoneDemand {
  const letter = ZONE_LETTER[zone];
  if (letter === 'R') return 'r';
  if (letter === 'I') return 'i';
  return ZONE_DENSITY[zone] === 'high' ? 'o' : 'c';
}

export function demandFor(demand: ZoneDemand, zone: ZonedType): number {
  return demand[demandKey(zone)];
}

/** 0 = foundation, 1 = scaffold. Only meaningful while `construction > 0`. */
export function constructionStage(b: BuildingInstance): 0 | 1 {
  return b.construction > BALANCE.constructionDays / 2 ? 0 : 1;
}

/** Up to `n` items in random order (partial Fisher–Yates; shuffles `items` in place). */
function sample<T>(items: T[], n: number, rng: Rng): T[] {
  const k = Math.min(n, items.length);
  for (let a = 0; a < k; a++) {
    const b = a + Math.floor(rng() * (items.length - a));
    [items[a], items[b]] = [items[b], items[a]];
  }
  return items.slice(0, k);
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function areaOf(b: BuildingInstance): TileArea {
  const { w, h } = BUILDINGS[b.def].size;
  return { x: b.x, y: b.y, w, h };
}

/** One day of growth. Mutates the world; the caller refreshes rendering and road access. */
/**
 * One day of growth. `stock` supplies construction materials (sim/systems/materials.ts): a new
 * lot or upgrade only starts when its materials can be had today.
 */
export function growDay(world: World, rng: Rng, taxRate: number = BALANCE.baseTaxRate, stock: MaterialStock = UNLIMITED): GrowthResult {
  const changed: TileArea[] = [];
  const started: number[] = [];
  const completed: number[] = [];

  // 1. Construction counts down; the scaffold appears halfway.
  for (const b of world.buildings.values()) {
    if (b.construction > 0) {
      b.construction--;
      if (b.construction === 0) completed.push(b.id);
      if (b.construction === 0 || b.construction === Math.floor(BALANCE.constructionDays / 2)) changed.push(areaOf(b));
    } else if (b.grown) {
      const cap = BUILDINGS[b.def].capacity;
      b.fullDays = cap > 0 && b.occupants >= cap * BALANCE.upgradeOccupancy ? b.fullDays + 1 : 0;
    }
  }

  const demand = zoneDemand(world, taxRate);
  const confidence = investorScore(world, taxRate);
  const build = (def: BuildingId, x: number, y: number, occupants = 0, lifestyle: Lifestyle = Lifestyle.Basic) => {
    const { w, h } = BUILDINGS[def].size;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const i = world.index(tx, ty);
        world.tree[i] = 0;
        world.decor[i] = Decor.None;
      }
    }
    const capacity: number = BUILDINGS[def].capacity;
    const b = world.addBuilding(
      {
        def,
        x,
        y,
        variant: Math.floor(rng() * ART_VARIANTS),
        grown: true,
        construction: BALANCE.constructionDays,
        occupants: Math.min(capacity, occupants),
        lifestyle,
      },
      w,
      h,
    );
    started.push(b.id);
    changed.push(areaOf(b));
  };

  // 2. New lots on empty zoned tiles with road access, at their density's first level.
  const empty = new Map<ZonedType, { x: number; y: number }[]>(ZONED_TYPES.map((z) => [z, []]));
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const i = world.index(x, y);
      const z = world.zone[i];
      if (!isZoned(z) || world.building[i] !== -1) continue;
      if (findEntrance(world, x, y, 1, 1, BALANCE.roadAccessRange) === -1) continue;
      empty.get(z)?.push({ x, y });
    }
  }
  const waiting = { r: 0, c: 0, o: 0, i: 0 };
  for (const z of ZONED_TYPES) {
    const d = demandFor(demand, z);
    if (d <= 0) {
      waiting[demandKey(z)] += empty.get(z)?.length ?? 0;
      continue;
    }
    const ids = eligibleBuildings(zonedBuildings(ZONE_LETTER[z], ZONE_DENSITY[z], startLevel(ZONE_LETTER[z], ZONE_DENSITY[z]), 1), confidence);
    if (ids.length === 0) continue;
    for (const t of sample(empty.get(z) ?? [], Math.ceil(d * BALANCE.growthPerDay), rng)) {
      const id = pick(ids, rng);
      if (stock.take(materialsFor(id))) build(id, t.x, t.y);
    }
  }

  // 3. Thriving grown buildings level up, in place or by merging a 2×2 block.
  const population = cityStats(world).population;
  const candidates = new Map<ZonedType, BuildingInstance[]>(ZONED_TYPES.map((z) => [z, []]));
  for (const b of world.buildings.values()) {
    const def: BuildingDef = BUILDINGS[b.def];
    if (!b.grown || b.abandoned || b.construction > 0 || b.entrance === -1 || def.zone === null || def.density === null || def.level >= 3) continue;
    if (b.fullDays < BALANCE.upgradeAfterDays || population < BALANCE.levelPopulation[def.level + 1]) continue;
    // Level 2 needs at least one service nearby and some happiness; level 3 needs all four
    // services and happy residents (and power and water).
    const toLevel3 = def.level + 1 >= 3;
    if (!hasUtilities(b) || serviceScore(b) < (toLevel3 ? BASIC_SERVICES.length : 1)) continue;
    if (b.happiness < (toLevel3 ? BALANCE.happyLevel3 : BALANCE.happyLevel2)) continue;
    candidates.get(zoneOf(def.zone, def.density))?.push(b);
  }
  for (const z of ZONED_TYPES) {
    const d = demandFor(demand, z);
    if (d <= 0) continue;
    let budget = Math.ceil(d * BALANCE.upgradesPerDay);
    for (const b of sample(candidates.get(z) ?? [], Infinity, rng)) {
      if (budget === 0) break;
      // An earlier merge today may already have absorbed this building.
      if (world.buildings.get(b.id) !== b) continue;
      if (upgrade(world, b, z, rng, build, confidence, stock)) budget--;
    }
  }

  return { changed, started, completed, waiting };
}

type Build = (def: BuildingId, x: number, y: number, occupants?: number, lifestyle?: Lifestyle) => void;

function upgrade(world: World, b: BuildingInstance, zone: ZonedType, rng: Rng, build: Build, confidence: number, stock: MaterialStock): boolean {
  const def: BuildingDef = BUILDINGS[b.def];
  const letter = ZONE_LETTER[zone];
  const density = ZONE_DENSITY[zone];
  const next = def.level + 1;
  /** Rebuild as `id`; false (nothing touched) when its materials can't be had today. */
  const replace = (olds: readonly BuildingInstance[], x: number, y: number, id: BuildingId): boolean => {
    if (!stock.take(materialsFor(id))) return false;
    let occupants = 0;
    // People bring their lifestyle; a merged block takes the lowest tier among its homes.
    let lifestyle: Lifestyle = Lifestyle.Prosperous;
    for (const o of olds) {
      const s = BUILDINGS[o.def].size;
      occupants += o.occupants;
      if (o.lifestyle < lifestyle) lifestyle = o.lifestyle;
      world.removeBuilding(o.id, s.w, s.h);
    }
    build(id, x, y, occupants, lifestyle);
    return true;
  };

  if (def.size.w === 2) {
    const two = eligibleBuildings(zonedBuildings(letter, density, next, 2), confidence);
    if (two.length === 0) return false;
    return replace([b], b.x, b.y, pick(two, rng));
  }

  const one = eligibleBuildings(zonedBuildings(letter, density, next, 1), confidence);
  const two = eligibleBuildings(zonedBuildings(letter, density, next, 2), confidence);
  const tryMerge = () => {
    if (two.length === 0) return false;
    const square = findMergeSquare(world, b, zone, def.level, rng);
    if (!square) return false;
    return replace(square.buildings, square.x, square.y, pick(two, rng));
  };
  // Merge when there's no 1×1 option, otherwise half the time (falling back to in place).
  if ((one.length === 0 || rng() < 0.5) && tryMerge()) return true;
  if (one.length === 0) return false;
  return replace([b], b.x, b.y, pick(one, rng));
}

/**
 * A 2×2 square containing `b` whose tiles are all zoned `zone` and hold only empty lots or
 * finished grown 1×1 buildings of at most `level`, with road access. Returns its origin and buildings.
 */
function findMergeSquare(
  world: World,
  b: BuildingInstance,
  zone: ZonedType,
  level: number,
  rng: Rng,
): { x: number; y: number; buildings: BuildingInstance[] } | null {
  const offsets = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;
  const start = Math.floor(rng() * offsets.length);
  for (let k = 0; k < offsets.length; k++) {
    const [ox, oy] = offsets[(start + k) % offsets.length];
    const sx = b.x - ox;
    const sy = b.y - oy;
    const found: BuildingInstance[] = [];
    let ok = world.inBounds(sx, sy) && world.inBounds(sx + 1, sy + 1);
    for (let ty = sy; ok && ty < sy + 2; ty++) {
      for (let tx = sx; ok && tx < sx + 2; tx++) {
        const i = world.index(tx, ty);
        if (world.zone[i] !== zone) {
          ok = false;
          break;
        }
        const id = world.building[i];
        if (id === -1) continue;
        const o = world.buildings.get(id);
        const d = o && BUILDINGS[o.def];
        if (!o || !d || !o.grown || o.construction > 0 || d.size.w !== 1 || d.level > level) ok = false;
        else found.push(o);
      }
    }
    if (ok && isFlat(world, sx, sy, 2, 2) && findEntrance(world, sx, sy, 2, 2, BALANCE.roadAccessRange) !== -1) {
      return { x: sx, y: sy, buildings: found };
    }
  }
  return null;
}

/** Zoned growth once a day; new and finished sites go into the day's outcome. */
export class GrowthSystem implements SimSystem {
  readonly name = 'growth';
  private readonly city: City;
  private readonly rng: Rng;
  /** Where construction materials come from (set by the Simulation; unlimited otherwise). */
  stock: () => MaterialStock = () => UNLIMITED;
  /** Today's empty zoned lots held back by low demand (for the "why isn't it growing" notice). */
  waiting: ZoneDemand = { r: 0, c: 0, o: 0, i: 0 };
  constructor(city: City, rng: Rng) {
    this.city = city;
    this.rng = rng;
  }
  onDay(out: DayOutcome) {
    const g = growDay(this.city.world, this.rng, this.city.taxRate, this.stock());
    out.changed.push(...g.changed);
    out.started.push(...g.started);
    out.completed.push(...g.completed);
    this.waiting = g.waiting;
  }
  demand(): ZoneDemand {
    return zoneDemand(this.city.world, this.city.taxRate);
  }
  explain(): DemandWhy {
    return explainDemand(this.city.world, this.city.taxRate);
  }
}
