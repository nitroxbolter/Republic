import { BALANCE } from '../shared/balance';
import { BUILDING_IDS, BUILDINGS, buildingDef, Lifestyle, type BuildingId } from './buildings/catalog';
import { City } from './City';
import { COST_KINDS, defaultCostTaxRates, type CostTaxRates } from './systems/livingCosts';
import { Simulation } from './core/Simulation';
import { BridgeAxis, RoadType } from './roads';
import { PAVEMENTS, roadSpec } from './roadTypes';
import { isStage, Stage } from './stages';
import { TECHS } from './research';
import { Rail } from './rail';
import { loadIncidents, parseIncidents, saveIncidents, type SavedIncidents } from './systems/incidents';
import { GENERATOR_VERSION, generateTerrain } from './terrain/generate';
import { PRESET_IDS, type PresetId, type TerrainSettings } from './terrain/presets';
import { Decor, Terrain } from './terrain/types';
import type { World } from './World';
import { ZoneType } from './zones';
import { initialProperty, type PropertyState } from './systems/realEstate';
import { initialDemography, type DemographicPolicy, type PermitLimits } from './systems/demography';

/**
 * The save format (docs/specs/saving.md, D-034): only what can't be recomputed. Terrain is
 * regenerated from its settings; access, utilities, coverage, commutes, needs and traffic are
 * rebuilt by the Simulation after loading.
 */

export const SAVE_VERSION = 1;

/** `[def, x, y, variant, flags, construction, fullDays, occupants, happiness %, moodDays]`: every building has these. */
type SavedBuildingCore = readonly [
  def: BuildingId,
  x: number,
  y: number,
  variant: number,
  flags: number,
  construction: number,
  fullDays: number,
  occupants: number,
  happiness: number,
  moodDays: number,
];

/** The core fields, plus optional battery charge, power-plant maintenance, then evolution state (docs/specs/evolution.md). */
export type SavedBuilding =
  | SavedBuildingCore
  | readonly [...SavedBuildingCore, stored: number]
  | readonly [...SavedBuildingCore, stored: number, condition: number, repairDays: number]
  | readonly [
      ...SavedBuildingCore,
      stored: number,
      condition: number,
      repairDays: number,
      lifestyle: number,
      lifeDays: number,
      garbage: number,
      filled: number,
    ];

const FLAG = { grown: 1, abandoned: 2 } as const;

export interface SavedCity {
  readonly funds: number;
  readonly propertyLedger?: City['propertyLedger'];
  readonly demography?: DemographicPolicy;
  readonly day: number;
  readonly clock: number;
  readonly taxRate: number;
  readonly incomeTaxRate?: number;
  readonly minimumWage?: number;
  readonly pensionPerSenior?: number;
  readonly costTaxRates?: CostTaxRates;
  /** Older saves used a fraction of minimum wage; loaded once as a fixed amount. */
  readonly pensionShare?: number;
  readonly society?: { readonly sick: number; readonly prisoners: number; readonly deaths: number; readonly recentDeaths: number; readonly untreatedDeaths: number; readonly prisonOverflow: number; readonly naturalDeathCarry?: number };
  /** Highest stage reached and whether stages lock buildings (D-086); absent in older saves. */
  readonly stage?: number;
  readonly locked?: boolean;
  /** Taxes collected by hand at the Town Hall, and what's waiting there (docs/specs/evolution.md, E5). */
  readonly collectsTaxes?: boolean;
  readonly uncollected?: number;
  /** Growth uses construction materials, and the stock (E6). */
  readonly needsMaterials?: boolean;
  readonly materials?: number;
  /** Research progress (E7). */
  readonly research?: { readonly points: number; readonly done: number };
  /** Fires, thefts and patients in progress, vehicles out, and robbed or untreated buildings (E3). */
  readonly incidents?: SavedIncidents;
}

/** Run-length encoded, base64 typed-array layers (one byte per tile). */
export interface SavedLayers {
  readonly road: string;
  readonly bridge: string;
  readonly zone: string;
  /** 1 where the tile has neither tree nor decor (cleared by roads, zoning or buildings). */
  readonly cleared: string;
  /** One-way carriageway directions and footpath styles (docs/specs/transport.md); absent in older saves. */
  readonly lane?: string;
  readonly pave?: string;
  /**
   * The land itself (terrain type and height). Regenerating from the seed alone would move
   * the ground under a saved city if the generator ever changed; absent in older saves.
   */
  readonly ground?: string;
  readonly elev?: string;
  /** Rail track (docs/specs/evolution.md, E7b); absent in older saves. */
  readonly rail?: string;
  /** Flyover decks: road type and axis (docs/specs/transport.md, TX2); absent in older saves. */
  readonly over?: string;
  readonly overAxis?: string;
}

/**
 * The simulation's day-to-day memory, so a loaded city continues exactly as the running one
 * would have (docs/specs/engine.md, "Determinism"). Optional: saves without it load with
 * fresh random streams and a cold commute model.
 */
export interface SavedSimState {
  /** RandomStream states. */
  readonly growth: number;
  readonly fire: number;
  /** Smoothed commute volume on each road tile, in tile order: float32, base64. */
  readonly volume: string;
  /** Commute minutes per building, in `buildings` order (NaN = none): float64, base64. */
  readonly minutes: string;
}

export interface SaveData {
  readonly v: typeof SAVE_VERSION;
  /** GENERATOR_VERSION of the terrain these layers were drawn on. */
  readonly gen: number;
  readonly name: string;
  readonly terrain: TerrainSettings;
  readonly city: SavedCity;
  readonly layers: SavedLayers;
  readonly buildings: readonly SavedBuilding[];
  /** Residential finance keyed by building-array index; absent in older saves. */
  readonly properties?: Readonly<Record<string, PropertyState>>;
  /** Tile-indexed building ownership snapshot: `"x,y"` → building array index. */
  readonly buildingTiles?: Readonly<Record<string, number>>;
  readonly sim?: SavedSimState;
  /** When the client took this snapshot (ms since the epoch), to pick the newest copy on load. */
  readonly savedAt?: number;
}

/** What the city list shows without loading the city. */
export interface SaveSummary {
  readonly name: string;
  readonly population: number;
  readonly funds: number;
  readonly day: number;
  readonly size: number;
  readonly preset: PresetId;
  readonly seed: number;
}

export class SaveError extends Error {}

// ---------------------------------------------------------------- serialize

/** Save a city; pass its Simulation too so a load continues exactly (see SavedSimState). */
export function serialize(city: City, terrain: TerrainSettings, name: string, sim?: Simulation): SaveData {
  const w = city.world;
  const cleared = new Uint8Array(w.width * w.height);
  for (let i = 0; i < cleared.length; i++) cleared[i] = w.tree[i] === 0 && w.decor[i] === Decor.None ? 1 : 0;
  const buildings: SavedBuilding[] = [];
  const buildingIndex = new Map<number, number>();
  const properties: Record<string, PropertyState> = {};
  for (const b of w.buildings.values()) {
    buildingIndex.set(b.id, buildings.length);
    if (b.property) properties[buildings.length] = b.property;
    const core: SavedBuildingCore = [
      b.def,
      b.x,
      b.y,
      b.variant,
      (b.grown ? FLAG.grown : 0) | (b.abandoned ? FLAG.abandoned : 0),
      b.construction,
      b.fullDays,
      b.occupants,
      Math.round(b.happiness * 100),
      b.moodDays,
    ];
    const evolved = b.lifestyle !== Lifestyle.Basic || b.lifeDays !== 0 || b.garbage > 0 || b.filled > 0;
    buildings.push(
      evolved
        ? [...core, b.stored, b.condition, b.repairDays, b.lifestyle, b.lifeDays, b.garbage, b.filled]
        : b.condition < 1 || b.repairDays > 0
          ? [...core, b.stored, b.condition, b.repairDays]
          : b.stored > 0
            ? [...core, b.stored]
            : core,
    );
  }
  const buildingTiles: Record<string, number> = {};
  for (let i = 0; i < w.building.length; i++) {
    const owner = w.building[i];
    const index = buildingIndex.get(owner);
    if (index !== undefined) {
      const x = i % w.width;
      const y = Math.floor(i / w.width);
      buildingTiles[`${x},${y}`] = index;
    }
  }
  return {
    v: SAVE_VERSION,
    gen: GENERATOR_VERSION,
    name,
    terrain: { ...terrain },
    city: { funds: city.funds, propertyLedger: { ...city.propertyLedger }, demography: { ...city.demography, permitLimits: { ...city.demography.permitLimits }, permitUsed: { ...city.demography.permitUsed } }, day: city.day, clock: city.clock, taxRate: city.taxRate, incomeTaxRate: city.incomeTaxRate, minimumWage: city.minimumWage, pensionPerSenior: city.pensionPerSenior, costTaxRates: { ...city.costTaxRates }, society: { ...city.society }, stage: city.stage, locked: city.locked, collectsTaxes: city.collectsTaxes, uncollected: city.uncollected, needsMaterials: city.needsMaterials, materials: city.materials, research: { ...city.research }, ...incidentsField(city) },
    layers: {
      road: encodeLayer(w.road),
      bridge: encodeLayer(w.bridge),
      zone: encodeLayer(w.zone),
      cleared: encodeLayer(cleared),
      lane: encodeLayer(w.lane),
      pave: encodeLayer(w.pave),
      ground: encodeLayer(w.terrain),
      elev: encodeLayer(w.elevation),
      rail: encodeLayer(w.rail),
      over: encodeLayer(w.over),
      overAxis: encodeLayer(w.overAxis),
    },
    buildings,
    ...(Object.keys(properties).length > 0 && { properties }),
    buildingTiles,
    ...(sim && { sim: saveSimState(sim) }),
  };
}

function saveSimState(sim: Simulation): SavedSimState {
  const w = sim.world;
  const { volume, minutes } = sim.commute.exportState();
  const roadVolume: number[] = [];
  for (let i = 0; i < w.road.length; i++) if (w.road[i] !== RoadType.None) roadVolume.push(volume[i]);
  const perBuilding: number[] = [];
  for (const b of w.buildings.values()) perBuilding.push(minutes.get(b.id) ?? NaN);
  return {
    growth: sim.streams.growth.state,
    fire: sim.streams.fire.state,
    volume: toBase64(new Uint8Array(Float32Array.from(roadVolume).buffer)),
    minutes: toBase64(new Uint8Array(Float64Array.from(perBuilding).buffer)),
  };
}

export function summarize(data: SaveData, population: number): SaveSummary {
  const t = data.terrain;
  return { name: data.name, population, funds: data.city.funds, day: data.city.day, size: t.size, preset: t.preset, seed: t.seed };
}

// ---------------------------------------------------------------- deserialize

/**
 * Rebuild a city from a save. The caller still has to run the systems
 * (`new Simulation(city).worldChanged({ roads: true })` or `refreshCity`).
 * Throws SaveError if the layers don't fit the map; skips buildings that no longer fit.
 */
export function deserialize(data: SaveData): City {
  const world = generateTerrain(data.terrain);
  const n = world.width * world.height;
  const road = decodeLayer(data.layers.road, n);
  const bridge = decodeLayer(data.layers.bridge, n);
  const zone = decodeLayer(data.layers.zone, n);
  const cleared = decodeLayer(data.layers.cleared, n);
  const lane = data.layers.lane ? decodeLayer(data.layers.lane, n) : null;
  const pave = data.layers.pave ? decodeLayer(data.layers.pave, n) : null;
  const rail = data.layers.rail ? decodeLayer(data.layers.rail, n) : null;
  const over = data.layers.over ? decodeLayer(data.layers.over, n) : null;
  const overAxis = data.layers.overAxis ? decodeLayer(data.layers.overAxis, n) : null;
  if (data.layers.ground && data.layers.elev) {
    const ground = decodeLayer(data.layers.ground, n);
    for (let i = 0; i < n; i++) if (TERRAIN_VALUES.has(ground[i])) world.terrain[i] = ground[i];
    world.elevation.set(decodeLayer(data.layers.elev, n));
  }
  for (let i = 0; i < n; i++) {
    world.road[i] = ROAD_VALUES.has(road[i]) ? road[i] : RoadType.None;
    world.bridge[i] = world.road[i] !== RoadType.None && BRIDGE_VALUES.has(bridge[i]) ? bridge[i] : BridgeAxis.None;
    world.zone[i] = ZONE_VALUES.has(zone[i]) ? zone[i] : ZoneType.None;
    // Directions only on wide roads; styles only where there's a road.
    world.lane[i] = lane && world.road[i] !== RoadType.None && lane[i] <= 4 && roadSpec(world.road[i])?.width === 2 ? lane[i] : 0;
    world.pave[i] = pave && world.road[i] !== RoadType.None && pave[i] <= PAVEMENTS.length ? pave[i] : 0;
    world.rail[i] = rail && rail[i] <= Rail.Bridge ? rail[i] : Rail.None;
    // A deck only over a road, with a known road type and axis.
    const deckOk = over && overAxis && world.road[i] !== RoadType.None && ROAD_VALUES.has(over[i]) && over[i] !== RoadType.None && (overAxis[i] === 1 || overAxis[i] === 2);
    world.over[i] = deckOk ? over[i] : 0;
    world.overAxis[i] = deckOk ? overAxis[i] : 0;
    if (cleared[i] === 1) {
      world.tree[i] = 0;
      world.decor[i] = Decor.None;
    }
  }
  // Footprints are rebuilt from the building records; buildingTiles is only a cross-check
  // (verifySave), so a skipped building can never make the whole city unloadable.
  for (let i = 0; i < data.buildings.length; i++) {
    const b = addSavedBuilding(world, data.buildings[i]);
    if (b && data.properties?.[i]) b.property = data.properties[i];
  }

  const city = new City(world, data.city.funds);
  if (data.city.propertyLedger) city.propertyLedger = { ...data.city.propertyLedger };
  if (data.city.demography) city.demography = { ...data.city.demography, permitLimits: { ...data.city.demography.permitLimits }, permitUsed: { ...data.city.demography.permitUsed } };
  city.day = data.city.day;
  city.clock = data.city.clock;
  city.taxRate = data.city.taxRate;
  city.incomeTaxRate = data.city.incomeTaxRate ?? 0;
  // Older policy amounts predate the $990 household basket and would leave almost everyone unable to pay it.
  city.minimumWage = data.city.costTaxRates ? data.city.minimumWage ?? BALANCE.defaultMinimumWage : BALANCE.defaultMinimumWage;
  city.pensionPerSenior = data.city.costTaxRates ? data.city.pensionPerSenior ?? BALANCE.defaultPensionPerSenior : BALANCE.defaultPensionPerSenior;
  city.costTaxRates = data.city.costTaxRates ?? defaultCostTaxRates();
  if (data.city.society) city.society = { ...city.society, ...data.city.society };
  // Cities saved before stages existed keep everything they could build (user call, D-086).
  city.locked = data.city.locked ?? false;
  city.collectsTaxes = data.city.collectsTaxes ?? false;
  city.uncollected = Math.max(0, data.city.uncollected ?? 0);
  city.needsMaterials = data.city.needsMaterials ?? false;
  city.materials = Math.max(0, data.city.materials ?? 0);
  if (data.city.research) city.research = { points: Math.max(0, data.city.research.points), done: Math.max(0, Math.min(TECHS.length, Math.floor(data.city.research.done))) };
  city.stage = data.city.stage !== undefined && isStage(data.city.stage) ? data.city.stage : Stage.Hamlet;
  if (data.city.incidents) loadIncidents(city, data.city.incidents);
  return city;
}

/**
 * Load a save into a running Simulation: rebuild the city, bring every system up to date,
 * then put back the saved day-to-day state (random streams, commute) and re-score needs from it.
 */
export function loadSimulation(data: SaveData): Simulation {
  const city = deserialize(data);
  const sim = new Simulation(city);
  sim.worldChanged({ roads: true });
  if (data.sim) restoreSimState(sim, data.sim);
  return sim;
}

function restoreSimState(sim: Simulation, saved: SavedSimState) {
  const w = sim.world;
  sim.streams.growth.state = saved.growth;
  sim.streams.fire.state = saved.fire;
  const roadVolume = floatsFrom(saved.volume, Float32Array);
  const volume = new Float32Array(w.road.length);
  let k = 0;
  for (let i = 0; i < w.road.length && k < roadVolume.length; i++) if (w.road[i] !== RoadType.None) volume[i] = roadVolume[k++];
  const perBuilding = floatsFrom(saved.minutes, Float64Array);
  const minutes = new Map<number, number>();
  let j = 0;
  for (const b of w.buildings.values()) {
    const m = perBuilding[j++];
    if (m !== undefined && !Number.isNaN(m)) minutes.set(b.id, m);
  }
  sim.commute.restoreState({ volume, minutes });
  sim.needs.onWorldChanged();
}

/** Decode base64 bytes as a float array; a corrupt or misaligned blob decodes to nothing. */
function floatsFrom<T extends Float32Array | Float64Array>(text: string, Kind: { new (b: ArrayBuffer): T; readonly BYTES_PER_ELEMENT: number }): T {
  const bytes = fromBase64(text);
  const usable = bytes.length - (bytes.length % Kind.BYTES_PER_ELEMENT);
  return new Kind(bytes.slice(0, usable).buffer);
}

const TERRAIN_VALUES: ReadonlySet<number> = new Set(Object.values(Terrain));
const ROAD_VALUES: ReadonlySet<number> = new Set(Object.values(RoadType));
const BRIDGE_VALUES: ReadonlySet<number> = new Set(Object.values(BridgeAxis));
const ZONE_VALUES: ReadonlySet<number> = new Set(Object.values(ZoneType));

function addSavedBuilding(world: World, s: SavedBuilding) {
  const [def, x, y, variant, flags, construction, fullDays, occupants, happiness, moodDays, stored = 0, condition = 1, repairDays = 0, lifestyle = 0, lifeDays = 0, garbage = 0, filled = 0] = s;
  const { w, h } = BUILDINGS[def].size;
  if (!world.inBounds(x, y) || !world.inBounds(x + w - 1, y + h - 1)) return;
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (world.building[world.index(tx, ty)] !== -1) return;
  const b = world.addBuilding({ def, x, y, variant, grown: (flags & FLAG.grown) !== 0, construction, occupants }, w, h);
  b.fullDays = fullDays;
  b.happiness = Math.min(1, Math.max(0, happiness / 100));
  b.moodDays = moodDays;
  b.abandoned = (flags & FLAG.abandoned) !== 0;
  b.stored = Math.max(0, Math.min(stored, buildingDef(def).energy?.storage ?? 0));
  b.condition = Math.min(1, Math.max(0, condition));
  b.repairDays = Math.max(0, repairDays);
  b.lifestyle = lifestyle >= Lifestyle.Prosperous ? Lifestyle.Prosperous : lifestyle >= Lifestyle.Comfortable ? Lifestyle.Comfortable : Lifestyle.Basic;
  b.lifeDays = Math.max(-BALANCE.lifeDays, Math.min(BALANCE.lifeDays, Math.round(lifeDays)));
  b.garbage = Math.max(0, garbage);
  b.filled = Math.max(0, filled);
  return b;
}

// ---------------------------------------------------------------- verify (before writing)

/**
 * Strict check before a save is stored, so a snapshot that wouldn't load back whole can never
 * overwrite a good one: it must survive JSON → parseSave with every building, every layer must
 * decode to the map size, and every footprint must fit without overlap. Returns the JSON text
 * (callers store or send it as is). Throws SaveError naming the first problem.
 */
export function verifySave(data: SaveData): string {
  const text = JSON.stringify(data);
  const back = parseSave(JSON.parse(text));
  if (back.buildings.length !== data.buildings.length) {
    throw new SaveError(`save check failed: ${data.buildings.length - back.buildings.length} building(s) would not load`);
  }
  const size = back.terrain.size;
  const n = size * size;
  for (const [name, layer] of Object.entries(back.layers)) {
    if (typeof layer === 'string') decodeLayer(layer, n);
    else throw new SaveError(`save check failed: layer ${name}`);
  }
  const taken = new Uint8Array(n);
  for (const [def, x, y] of back.buildings) {
    const { w, h } = BUILDINGS[def].size;
    if (x < 0 || y < 0 || x + w > size || y + h > size) throw new SaveError(`save check failed: ${def} at ${x},${y} is off the map`);
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++) {
        const i = ty * size + tx;
        if (taken[i]) throw new SaveError(`save check failed: ${def} at ${x},${y} overlaps another building`);
        taken[i] = 1;
      }
  }
  return text;
}

// ---------------------------------------------------------------- parse (untrusted JSON → SaveData)

type Obj = Readonly<Record<string, unknown>>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(o: Obj, key: string, lo = -Infinity, hi = Infinity): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new SaveError(`bad ${key}`);
  return v;
}

function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new SaveError(`bad ${key}`);
  return v;
}

function obj(o: Obj, key: string): Obj {
  const v = o[key];
  if (!isObj(v)) throw new SaveError(`bad ${key}`);
  return v;
}

const isBuildingId = (v: unknown): v is BuildingId => typeof v === 'string' && (BUILDING_IDS as readonly string[]).includes(v);
const isPresetId = (v: unknown): v is PresetId => typeof v === 'string' && (PRESET_IDS as readonly string[]).includes(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A non-negative whole number from a saved counter. */
const count = (n: number): number => Math.max(0, Math.round(n));

/**
 * Check untrusted JSON (from the server or IndexedDB) and return it as SaveData.
 * Throws SaveError for anything that isn't a save this version can load. Buildings of
 * unknown types are dropped rather than failing the whole city.
 */
export function parseSave(json: unknown): SaveData {
  if (!isObj(json)) throw new SaveError('not a save');
  const v = num(json, 'v');
  if (v !== SAVE_VERSION) throw new SaveError(`unsupported save version ${v}`);
  const t = obj(json, 'terrain');
  const preset = t.preset;
  if (!isPresetId(preset)) throw new SaveError('bad preset');
  const terrain: TerrainSettings = {
    preset,
    seed: num(t, 'seed'),
    size: num(t, 'size', 16, 1024),
    water: num(t, 'water', 0, 1),
    trees: num(t, 'trees', 0, 1),
    rivers: num(t, 'rivers', 0, 3),
    coastSides: num(t, 'coastSides', 0, 4),
  };
  const c = obj(json, 'city');
  const parsedCostTaxRates = parseCostTaxRates(c.costTaxRates);
  const social = isObj(c.society) ? c.society : null;
  const l = obj(json, 'layers');
  if (!Array.isArray(json.buildings)) throw new SaveError('bad buildings');
  const list: readonly unknown[] = json.buildings;
  const buildings: SavedBuilding[] = [];
  for (const item of list) {
    if (!Array.isArray(item)) continue;
    const fields: readonly unknown[] = item;
    if (fields.length !== 10 && fields.length !== 11 && fields.length !== 13 && fields.length !== 17) continue;
    const [def, ...rest] = fields;
    if (!isBuildingId(def)) continue;
    if (!rest.every(isFiniteNumber)) continue;
    const [x, y, variant, flags, construction, fullDays, occupants, happiness, moodDays, stored, condition, repairDays, lifestyle, lifeDays, garbage, filled] = rest;
    // Position must be exact; counters are rounded rather than dropping the building
    // (a battery's charge is fractional, and dropping it once made whole cities unloadable).
    if (!isInt(x) || !isInt(y)) continue;
    if (condition !== undefined && (condition < 0 || condition > 1)) continue;
    const core: SavedBuildingCore = [
      def,
      x,
      y,
      count(variant),
      count(flags),
      count(construction),
      count(fullDays),
      count(occupants),
      count(happiness),
      count(moodDays),
    ];
    const base: SavedBuilding =
      condition === undefined || repairDays === undefined
        ? stored === undefined
          ? core
          : [...core, stored]
        : [...core, stored ?? 0, condition, count(repairDays)];
    buildings.push(
      lifestyle === undefined || lifeDays === undefined || garbage === undefined || filled === undefined
        ? base
        : [...core, stored ?? 0, condition ?? 1, count(repairDays ?? 0), count(lifestyle), Math.round(lifeDays), Math.max(0, garbage), Math.max(0, filled)],
    );
  }
  const buildingTiles = parseBuildingTiles(json.buildingTiles);
  return {
    v: SAVE_VERSION,
    gen: num(json, 'gen'),
    name: str(json, 'name').slice(0, 64),
    terrain,
    city: {
      funds: num(c, 'funds'),
      ...parsePropertyLedger(c.propertyLedger),
      ...parseDemography(c.demography),
      day: num(c, 'day', 0),
      clock: num(c, 'clock', 0),
      taxRate: num(c, 'taxRate', BALANCE.minTaxRate, BALANCE.maxTaxRate),
      ...(isFiniteNumber(c.incomeTaxRate) && c.incomeTaxRate >= 0 && c.incomeTaxRate <= 100 && { incomeTaxRate: c.incomeTaxRate }),
      ...(isFiniteNumber(c.minimumWage) && c.minimumWage >= BALANCE.minMinimumWage && c.minimumWage <= BALANCE.maxMinimumWage && { minimumWage: c.minimumWage }),
      ...(isFiniteNumber(c.pensionPerSenior) && c.pensionPerSenior >= BALANCE.minPensionPerSenior && c.pensionPerSenior <= BALANCE.maxPensionPerSenior && { pensionPerSenior: c.pensionPerSenior }),
      ...(parsedCostTaxRates && { costTaxRates: parsedCostTaxRates }),
      ...(isFiniteNumber(c.pensionShare) && c.pensionShare >= 0.05 && c.pensionShare <= 0.3 && { pensionShare: c.pensionShare }),
      ...(social && ['sick', 'prisoners', 'deaths', 'untreatedDeaths', 'prisonOverflow'].every((key) => isFiniteNumber(social[key]) && social[key] >= 0) && { society: {
        sick: social.sick as number, prisoners: social.prisoners as number, deaths: social.deaths as number,
        recentDeaths: isFiniteNumber(social.recentDeaths) && social.recentDeaths >= 0 ? social.recentDeaths : 0,
        untreatedDeaths: social.untreatedDeaths as number, prisonOverflow: social.prisonOverflow as number,
        naturalDeathCarry: isFiniteNumber(social.naturalDeathCarry) && social.naturalDeathCarry >= 0 && social.naturalDeathCarry < 1 ? social.naturalDeathCarry : 0,
      } }),
      ...(isFiniteNumber(c.stage) && isStage(c.stage) && { stage: c.stage }),
      ...(typeof c.locked === 'boolean' && { locked: c.locked }),
      ...(typeof c.collectsTaxes === 'boolean' && { collectsTaxes: c.collectsTaxes }),
      ...(isFiniteNumber(c.uncollected) && { uncollected: c.uncollected }),
      ...(typeof c.needsMaterials === 'boolean' && { needsMaterials: c.needsMaterials }),
      ...(isFiniteNumber(c.materials) && { materials: c.materials }),
      ...(isObj(c.research) && isFiniteNumber(c.research.points) && isFiniteNumber(c.research.done) && { research: { points: c.research.points, done: c.research.done } }),
      ...optionalIncidents(parseIncidents(c.incidents)),
    },
    layers: {
      road: str(l, 'road'),
      bridge: str(l, 'bridge'),
      zone: str(l, 'zone'),
      cleared: str(l, 'cleared'),
      ...(typeof l.lane === 'string' && { lane: l.lane }),
      ...(typeof l.pave === 'string' && { pave: l.pave }),
      ...(typeof l.ground === 'string' && typeof l.elev === 'string' && { ground: l.ground, elev: l.elev }),
      ...(typeof l.rail === 'string' && { rail: l.rail }),
      ...(typeof l.over === 'string' && typeof l.overAxis === 'string' && { over: l.over, overAxis: l.overAxis }),
    },
    buildings,
    ...parseProperties(json.properties, buildings),
    ...(buildingTiles && { buildingTiles }),
    ...parseSimState(json.sim),
    ...(isFiniteNumber(json.savedAt) && { savedAt: json.savedAt }),
  };
}

function parsePropertyLedger(value: unknown): { propertyLedger?: City['propertyLedger'] } {
  if (!isObj(value)) return {};
  const fields = ['loaned', 'recovered', 'writtenOff', 'issuedThisMonth', 'acquiredThisMonth', 'repaidEarlyThisMonth'] as const;
  if (!fields.every((field) => isFiniteNumber(value[field]) && value[field] >= 0)) return {};
  return { propertyLedger: { ...Object.fromEntries(fields.map((field) => [field, value[field]])) as Omit<City['propertyLedger'], 'earlyInterestThisMonth'>, earlyInterestThisMonth: isFiniteNumber(value.earlyInterestThisMonth) && value.earlyInterestThisMonth >= 0 ? value.earlyInterestThisMonth : 0 } };
}

function parseDemography(value: unknown): { demography?: DemographicPolicy } {
  if (!isObj(value)) return {};
  const defaults = initialDemography();
  const limits = (v: unknown, fallback: PermitLimits): PermitLimits => {
    if (!isObj(v)) return { ...fallback };
    return Object.fromEntries((['r', 'c', 'o', 'i'] as const).map((key) => [key, isFiniteNumber(v[key]) && v[key] >= 0 && v[key] <= 9999 ? Math.floor(v[key]) : fallback[key]])) as PermitLimits;
  };
  const nonnegative = (key: keyof DemographicPolicy, fallback: number) => isFiniteNumber(value[key]) && value[key] >= 0 ? value[key] : fallback;
  return { demography: {
    strategy: value.strategy === 'stimulate' || value.strategy === 'slow' ? value.strategy : 'balanced',
    annualTarget: isFiniteNumber(value.annualTarget) ? Math.max(0, Math.min(10, value.annualTarget)) : defaults.annualTarget,
    incentivesEnabled: typeof value.incentivesEnabled === 'boolean' ? value.incentivesEnabled : defaults.incentivesEnabled,
    housingSubsidy: isFiniteNumber(value.housingSubsidy) ? Math.max(0, Math.min(BALANCE.demographicMaxHousingSubsidy, value.housingSubsidy)) : 0,
    permitLimits: limits(value.permitLimits, defaults.permitLimits), permitUsed: limits(value.permitUsed, defaults.permitUsed),
    incentiveLevel: isFiniteNumber(value.incentiveLevel) ? Math.max(0, Math.min(1, value.incentiveLevel)) : 0,
    slowLevel: isFiniteNumber(value.slowLevel) ? Math.max(0, Math.min(1, value.slowLevel)) : 0,
    yearStartPopulation: nonnegative('yearStartPopulation', 0), yearStartDay: nonnegative('yearStartDay', 0),
    monthImmigration: nonnegative('monthImmigration', 0), monthEmigration: nonnegative('monthEmigration', 0),
    monthBirths: nonnegative('monthBirths', 0), monthDeaths: nonnegative('monthDeaths', 0),
    lastImmigration: nonnegative('lastImmigration', 0), lastEmigration: nonnegative('lastEmigration', 0),
    lastBirths: nonnegative('lastBirths', 0), lastDeaths: nonnegative('lastDeaths', 0),
    birthCarry: isFiniteNumber(value.birthCarry) ? Math.max(0, Math.min(1, value.birthCarry)) : 0,
  } };
}

function parseProperties(value: unknown, buildings: readonly SavedBuilding[]): { properties?: Readonly<Record<string, PropertyState>> } {
  if (!isObj(value)) return {};
  const properties: Record<string, PropertyState> = {};
  for (const [key, raw] of Object.entries(value)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= buildings.length || !isObj(raw)) continue;
    const def = buildings[index][0];
    if (BUILDINGS[def].category !== 'residential') continue;
    const fallback = initialProperty({ def } as Parameters<typeof initialProperty>[0]);
    const nonnegative = (v: unknown, defaultValue: number) => isFiniteNumber(v) && v >= 0 ? v : defaultValue;
    const loanRaw = raw.loan;
    const loan = isObj(loanRaw) && ['principal', 'interestRate', 'term', 'payment', 'balance', 'paid', 'interestReceived', 'late', 'months'].every((field) => isFiniteNumber(loanRaw[field]) && loanRaw[field] >= 0)
      ? { principal: Number(loanRaw.principal), interestRate: Number(loanRaw.interestRate), term: Number(loanRaw.term), payment: Number(loanRaw.payment), balance: Number(loanRaw.balance), paid: Number(loanRaw.paid), interestReceived: Number(loanRaw.interestReceived), late: Number(loanRaw.late), lateInterest: nonnegative(loanRaw.lateInterest, 0), months: Number(loanRaw.months) }
      : null;
    properties[key] = {
      reserve: nonnegative(raw.reserve, fallback.reserve), debt: nonnegative(raw.debt, 0),
      delinquentMonths: Math.floor(nonnegative(raw.delinquentMonths, 0)),
      status: ['regular', 'loss', 'delinquent', 'critical', 'recovery', 'financed', 'bankrupt'].includes(String(raw.status)) ? raw.status as PropertyState['status'] : 'regular',
      publicOwned: raw.publicOwned === true, loan,
      lastMonth: isFiniteNumber(raw.lastMonth) ? Math.floor(raw.lastMonth) : -1,
      lastRent: nonnegative(raw.lastRent, 0), lastCost: nonnegative(raw.lastCost, 0),
      lastResult: isFiniteNumber(raw.lastResult) ? raw.lastResult : 0,
    };
  }
  return Object.keys(properties).length ? { properties } : {};
}

function parseCostTaxRates(value: unknown): CostTaxRates | null {
  if (!isObj(value)) return null;
  if (!COST_KINDS.every((kind) => isFiniteNumber(value[kind]) && value[kind] >= 0 && value[kind] <= 100)) return null;
  return {
    energy: Number(value.energy), water: Number(value.water),
    housing: Number(value.housing), transport: Number(value.transport),
  };
}

/** Incidents only when there are any, so quiet cities save as before. */
function incidentsField(city: City): { incidents?: SavedIncidents } {
  const saved = saveIncidents(city);
  return saved ? { incidents: saved } : {};
}

function optionalIncidents(saved: SavedIncidents | undefined): { incidents?: SavedIncidents } {
  return saved ? { incidents: saved } : {};
}

/** The optional tile map; a malformed one is dropped (footprints come from the building records). */
function parseBuildingTiles(v: unknown): Readonly<Record<string, number>> | undefined {
  if (!isObj(v)) return undefined;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(v)) {
    if (!/^\d+,\d+$/.test(key) || !isInt(value) || value < 0) return undefined;
    result[key] = value;
  }
  return result;
}

/** The optional sim block; anything malformed is dropped (the city still loads, just cold). */
function parseSimState(v: unknown): { sim?: SavedSimState } {
  if (!isObj(v)) return {};
  const { growth, fire, volume, minutes } = v;
  if (!isInt(growth) || !isInt(fire) || typeof volume !== 'string' || typeof minutes !== 'string') return {};
  return { sim: { growth, fire, volume, minutes } };
}

// ---------------------------------------------------------------- layer encoding

/** Run-length encode bytes as `(value, varint run)` pairs, then base64. */
export function encodeLayer(layer: Uint8Array): string {
  const out: number[] = [];
  let i = 0;
  while (i < layer.length) {
    const value = layer[i];
    let run = 1;
    while (i + run < layer.length && layer[i + run] === value) run++;
    out.push(value);
    for (let r = run; ; r >>>= 7) {
      if (r < 0x80) {
        out.push(r);
        break;
      }
      out.push((r & 0x7f) | 0x80);
    }
    i += run;
  }
  return toBase64(Uint8Array.from(out));
}

/** Inverse of encodeLayer. Throws SaveError unless it decodes to exactly `length` bytes. */
export function decodeLayer(text: string, length: number): Uint8Array {
  const bytes = fromBase64(text);
  const layer = new Uint8Array(length);
  let o = 0;
  let i = 0;
  while (i < bytes.length) {
    const value = bytes[i++];
    let run = 0;
    for (let shift = 0; ; shift += 7) {
      if (i >= bytes.length || shift > 28) throw new SaveError('corrupt layer');
      const b = bytes[i++];
      run |= (b & 0x7f) << shift;
      if (b < 0x80) break;
    }
    if (o + run > length) throw new SaveError('layer larger than the map');
    layer.fill(value, o, o + run);
    o += run;
  }
  if (o !== length) throw new SaveError('layer smaller than the map');
  return layer;
}

// Our own base64 keeps the sim free of DOM and Node globals (btoa / Buffer).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return s;
}

function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) throw new SaveError('corrupt layer');
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}
