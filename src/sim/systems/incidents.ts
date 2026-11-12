import { SIM_TICK_HZ } from '../../shared/constants';
import { BUILDINGS, buildingDef, Lifestyle, type BuildingDef, type BuildingInstance, type ResponderDef, type ResponderKind } from '../buildings/catalog';
import type { City } from '../City';
import type { SimSystem, WorldChange } from '../core/System';
import { roadMask, RoadType } from '../roads';
import { roadSpec } from '../roadTypes';
import type { World } from '../World';
import { speedFactor } from './commute';
import { serviceBit } from './coverage';
import { garbageScore } from './garbage';
import { cityStats } from './population';
import { findRoute, TRAFFIC, type Agent, type AgentKind } from './traffic';
import { isWorking } from './utilities';

/**
 * Incidents (docs/specs/evolution.md, E3; D-097): fires, thefts and illness happen to
 * buildings, and fire stations, police stations, clinics, hospitals and the trauma centre send
 * vehicles over the roads to answer them. Whether help arrives in time decides the outcome.
 *
 * Everything here is sim state on the fixed tick, rolled on the saved fire stream, so a city
 * plays the same everywhere (D-068, D-085). Vehicles carry an `Agent` only so the renderer
 * can draw them with the traffic; their position comes from the tick, not from traffic physics.
 */

export type IncidentKind = 'fire' | 'theft' | 'illness' | 'injury';
export const INCIDENT_KINDS: readonly IncidentKind[] = ['fire', 'theft', 'illness', 'injury'];

const DAY = 6 * SIM_TICK_HZ;

export const INCIDENTS = {
  /** No incidents until the city has this many residents. */
  minPopulation: 200,
  /** At most this many of each kind at once. */
  maxActive: 6,
  /** Daily chance per building, before size and modifiers. */
  fireChance: 0.0004,
  theftChance: 0.0005,
  illnessChance: 0.0004,
  /** Coverage cuts the chance to this share. */
  fireCovered: 0.35,
  policeCovered: 0.35,
  clinicCovered: 0.5,
  /** Chance that a fire in an occupied building also injures someone. */
  injuryChance: 0.5,
  /** Ticks: an unanswered fire spreads, then burns the building down. */
  spreadAfter: 1.5 * DAY,
  burnAfter: 3 * DAY,
  /** Ticks a fire truck works before the fire is out. */
  fireWork: DAY,
  /** Ticks a police car or ambulance must arrive within. */
  theftWindow: DAY,
  patientWindow: 1.5 * DAY,
  /** Ticks a police car or ambulance stays at the scene. */
  sceneTicks: Math.round(DAY / 3),
  /** Days a building stays robbed or untreated (its need is halved). */
  markDays: 30,
  /** Emergency speed, as a multiple of a car's. */
  speed: 2,
  /** Only stations this many tiles away (along the grid) are asked, the nearest few routed. */
  maxTiles: 80,
  routed: 3,
  /** Ticks between asks when no vehicle is free or none can reach the building. */
  askEvery: 10,
} as const;

export interface Incident {
  readonly id: number;
  readonly kind: IncidentKind;
  /** Building id. */
  readonly building: number;
  /** Ticks since it started. */
  age: number;
  /** A vehicle has reached it. */
  answered: boolean;
  /** Fires: ticks a truck has worked on it. */
  work: number;
  /** Fires: already spread once. */
  spread: boolean;
  /** The "nobody can reach it" event went out. */
  reported: boolean;
  /** Ticks until it asks for a vehicle again. */
  wait: number;
}

export type ResponderPhase = 'out' | 'scene' | 'back';
const PHASES: readonly ResponderPhase[] = ['out', 'scene', 'back'];

export interface Responder {
  readonly kind: ResponderKind;
  /** Station building id. */
  readonly station: number;
  /** Incident id it was sent to (that incident may be over). */
  readonly incident: number;
  phase: ResponderPhase;
  /** The station's entrance and the incident's (road tiles). They follow a building that moves. */
  from: number;
  to: number;
  /** Where the current leg started: `from` (out) or `to` (back), or where it was re-routed. */
  start: number;
  path: Int32Array;
  /** Ticks spent in this phase and how long it lasts. */
  elapsed: number;
  duration: number;
  /** Ticks shown on screen, a little ahead of `elapsed` between ticks so the motion is smooth. */
  shown: number;
  /** What the renderer draws. */
  readonly agent: Agent;
}

/** Saved with the city (`City.incidents`). */
export interface IncidentState {
  next: number;
  list: Incident[];
  responders: Responder[];
}

export function emptyIncidents(): IncidentState {
  return { next: 1, list: [], responders: [] };
}

/** Something the game shows: a toast, an alert, dust, a redraw. */
export type IncidentEvent =
  | { readonly type: 'started'; readonly kind: IncidentKind; readonly building: BuildingInstance }
  /** No vehicle could be sent (none free, none built, or no road to it). Once per incident. */
  | { readonly type: 'unreached'; readonly kind: IncidentKind; readonly building: BuildingInstance }
  /** Put out, caught, treated. */
  | { readonly type: 'resolved'; readonly kind: IncidentKind; readonly building: BuildingInstance }
  /** Robbed or untreated. */
  | { readonly type: 'missed'; readonly kind: IncidentKind; readonly building: BuildingInstance }
  /** Burned down and removed from the world. */
  | { readonly type: 'burned'; readonly building: BuildingInstance };

/** Which vehicle answers an incident. */
export function responderFor(kind: IncidentKind): ResponderKind {
  return kind === 'fire' ? 'fire' : kind === 'theft' ? 'police' : 'ambulance';
}

/** Agent kinds drawn for each responder. */
export const RESPONDER_AGENT: Readonly<Record<ResponderKind, AgentKind>> = { fire: 'fire_truck', police: 'police_car', ambulance: 'ambulance' };

function canAnswer(r: ResponderDef, kind: IncidentKind): boolean {
  return r.kind === responderFor(kind) && (kind !== 'injury' || r.injuries === true);
}

/** Bigger buildings have more going on: √(capacity ÷ 10), within 0.6–3. */
function sizeFactor(d: BuildingDef): number {
  return Math.min(3, Math.max(0.6, Math.sqrt(d.capacity / 10)));
}

/** What the daily roll needs to know about the city. */
export interface HazardContext {
  /** Share of the workforce without a job (0..1). */
  readonly jobless: number;
  readonly prisonOverflow?: number;
  /** AQI where a building stands (50 or less is clean). */
  readonly aqi: (b: BuildingInstance) => number;
}

/** A building's daily chance of each incident (docs/specs/evolution.md, E3, "Hazard"). 0 when it can't happen there. */
export function hazard(kind: IncidentKind, b: BuildingInstance, ctx: HazardContext): number {
  const d: BuildingDef = BUILDINGS[b.def];
  if (d.category === 'civic' || b.construction > 0) return 0;
  const size = sizeFactor(d);
  const home = d.category === 'residential';
  switch (kind) {
    case 'fire': {
      if (b.occupants === 0 && !b.abandoned) return 0;
      const risk = (d.category === 'industrial' ? 2 : 1) * (b.abandoned ? 3 : 1) * (d.level === 3 ? 1.3 : 1);
      return INCIDENTS.fireChance * size * risk * (b.services & serviceBit('fire') ? INCIDENTS.fireCovered : 1);
    }
    case 'theft': {
      if (b.occupants === 0 || b.abandoned || d.category === 'industrial') return 0;
      const risk = (1 + 2 * ctx.jobless + Math.min(2, (ctx.prisonOverflow ?? 0) / 10)) * (home ? 1 : 1.5) * (b.lifestyle === Lifestyle.Prosperous ? 1.3 : 1);
      return INCIDENTS.theftChance * size * risk * (b.services & serviceBit('police') ? INCIDENTS.policeCovered : 1);
    }
    case 'illness': {
      if (!home || b.occupants === 0 || b.abandoned) return 0;
      const air = 1 + Math.max(0, ctx.aqi(b) - 50) / 100;
      const garbage = garbageScore(b) < 0.5 ? 1.5 : 1;
      return INCIDENTS.illnessChance * size * air * garbage * (b.services & serviceBit('health') ? INCIDENTS.clinicCovered : 1);
    }
    case 'injury':
      // Injuries only come with fires.
      return 0;
  }
}

/** A station's calls this month: reached in time, and arrived too late. */
export interface StationCalls {
  answered: number;
  late: number;
}

/** Ticks to drive a route at emergency speed, each tile at its road's speed slowed by its congestion. */
export function travelTicks(world: World, path: Int32Array, congestion: Float32Array | null, speed = 1): number {
  const v = TRAFFIC.carSpeed * INCIDENTS.speed * speed;
  let seconds = 0;
  for (let k = 1; k < path.length; k++) {
    const i = path[k];
    const slow = congestion ? speedFactor(congestion[i]) : 1;
    seconds += 1 / (v * (roadSpec(world.road[i])?.carSpeed ?? 1) * slow);
  }
  return Math.max(1, Math.ceil(seconds * SIM_TICK_HZ));
}

function manhattan(world: World, a: number, b: number): number {
  const w = world.width;
  return Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));
}

function newAgent(kind: ResponderKind, path: Int32Array): Agent {
  return { kind: RESPONDER_AGENT[kind], path, seg: 0, t: 0, speed: 0, variant: 0, age: 0, wait: 0, dwell: 0, stopSeg: -1, lane: 0, prevLane: 0 };
}

/** Where congestion comes from (the commute model); null drives at free speed. */
export interface CongestionSource {
  readonly congestion: Float32Array;
}

export class IncidentSystem implements SimSystem {
  readonly name = 'incidents';
  /** Per station id: this month's calls. */
  readonly calls = new Map<number, StationCalls>();
  private readonly city: City;
  private readonly rng: () => number;
  private readonly commute: CongestionSource | null;
  private readonly aqi: (b: BuildingInstance) => number;
  private events: IncidentEvent[] = [];
  private societyCursor = 0;
  private scratch: Int32Array;

  constructor(city: City, rng: () => number, commute: CongestionSource | null = null, aqi: (b: BuildingInstance) => number = () => 0) {
    this.city = city;
    this.rng = rng;
    this.commute = commute;
    this.aqi = aqi;
    this.scratch = new Int32Array(2 * city.world.width * city.world.height);
  }

  private get world(): World {
    return this.city.world;
  }

  private get state(): IncidentState {
    return this.city.incidents;
  }

  /** Everything that happened since the last call (the game shows them). */
  takeEvents(): IncidentEvent[] {
    const out = this.events;
    this.events = [];
    this.societyCursor = 0;
    return out;
  }

  /** New events for the social model, without taking them away from the game or harness. */
  takeSocietyEvents(): IncidentEvent[] {
    const out = this.events.slice(this.societyCursor);
    this.societyCursor = this.events.length;
    return out;
  }

  /** Active incidents (read-only view for the renderer and HUD). */
  get active(): readonly Incident[] {
    return this.state.list;
  }

  /** Vehicles out (the renderer draws their agents). */
  get responders(): readonly Responder[] {
    return this.state.responders;
  }

  /** The incident at a building, if any (a fire first). */
  incidentAt(buildingId: number): Incident | null {
    let found: Incident | null = null;
    for (const inc of this.state.list) {
      if (inc.building !== buildingId) continue;
      if (inc.kind === 'fire') return inc;
      found ??= inc;
    }
    return found;
  }

  /** The vehicle on its way to (or working at) an incident. */
  vehicleFor(incidentId: number): Responder | null {
    return this.state.responders.find((r) => r.incident === incidentId && r.phase !== 'back') ?? null;
  }

  /** Vehicles a station has out right now. */
  out(stationId: number): number {
    let n = 0;
    for (const r of this.state.responders) if (r.station === stationId) n++;
    return n;
  }

  /** Daily: wear off old marks and roll for new incidents. */
  onDay() {
    const world = this.world;
    for (const b of world.buildings.values()) {
      if (b.robbed > 0) b.robbed--;
      if (b.sick > 0) b.sick--;
    }
    const stats = cityStats(world, this.city.taxRate, this.city.society);
    if (stats.population < INCIDENTS.minPopulation) return;
    const workforce = stats.workers + stats.unemployed;
    const ctx: HazardContext = { jobless: workforce > 0 ? Math.min(1, stats.unemployed / workforce) : 0, prisonOverflow: this.city.society.prisonOverflow, aqi: this.aqi };
    const count = new Map<IncidentKind, number>(INCIDENT_KINDS.map((k) => [k, 0]));
    const busy = new Set<string>();
    for (const inc of this.state.list) {
      count.set(inc.kind, (count.get(inc.kind) ?? 0) + 1);
      busy.add(`${inc.kind}:${inc.building}`);
    }
    for (const b of world.buildings.values()) {
      if (BUILDINGS[b.def].category === 'civic') continue;
      for (const kind of ['fire', 'theft', 'illness'] as const) {
        const chance = hazard(kind, b, ctx);
        // One draw per building and kind, whatever the outcome, so the stream stays in step.
        const roll = chance > 0 ? this.rng() : 1;
        if (roll >= chance || busy.has(`${kind}:${b.id}`) || (count.get(kind) ?? 0) >= INCIDENTS.maxActive) continue;
        this.start(kind, b);
        busy.add(`${kind}:${b.id}`);
        count.set(kind, (count.get(kind) ?? 0) + 1);
      }
    }
  }

  /** Month end: start counting calls afresh. */
  onMonth() {
    this.calls.clear();
  }

  /** Start an incident now (the daily roll, a spreading fire, tests). A fire in an occupied building may injure someone. */
  start(kind: IncidentKind, b: BuildingInstance): Incident {
    const inc: Incident = { id: this.state.next++, kind, building: b.id, age: 0, answered: false, work: 0, spread: false, reported: false, wait: 0 };
    this.state.list.push(inc);
    this.events.push({ type: 'started', kind, building: b });
    if (kind === 'fire' && b.occupants > 0 && this.rng() < INCIDENTS.injuryChance && !this.state.list.some((i) => i.kind === 'injury' && i.building === b.id)) {
      this.state.list.push({ id: this.state.next++, kind: 'injury', building: b.id, age: 0, answered: false, work: 0, spread: false, reported: false, wait: 0 });
      this.events.push({ type: 'started', kind: 'injury', building: b });
    }
    return inc;
  }

  /** One fixed tick: vehicles move, incidents age and resolve. Returns true when a building burned down. */
  tick(): boolean {
    this.moveResponders();
    return this.ageIncidents();
  }

  private moveResponders() {
    const world = this.world;
    const list = this.state.responders;
    for (let k = list.length - 1; k >= 0; k--) {
      const r = list[k];
      if (!world.buildings.has(r.station)) {
        list.splice(k, 1);
        continue;
      }
      // A truck at a fire works until it's out (ageIncidents sends it back).
      if (r.phase === 'scene' && r.kind === 'fire' && this.find(r.incident)) continue;
      r.elapsed++;
      if (r.elapsed < r.duration) continue;
      if (r.phase === 'out') this.arrive(r);
      else if (r.phase === 'scene') this.headBack(r);
      else list.splice(k, 1);
    }
  }

  private arrive(r: Responder) {
    const inc = this.find(r.incident);
    const calls = this.calls.get(r.station) ?? { answered: 0, late: 0 };
    this.calls.set(r.station, calls);
    r.phase = 'scene';
    r.elapsed = 0;
    if (!inc) {
      // Too late: the building burned, was robbed, or the patient gave up. Straight back.
      calls.late++;
      r.duration = 0;
      return;
    }
    calls.answered++;
    inc.answered = true;
    if (inc.kind !== 'fire') {
      // Police and ambulances settle it on arrival, then stay a while.
      const b = this.world.buildings.get(inc.building);
      this.remove(inc);
      if (b) this.events.push({ type: 'resolved', kind: inc.kind, building: b });
    }
    r.duration = INCIDENTS.sceneTicks;
  }

  private headBack(r: Responder) {
    const station = this.world.buildings.get(r.station);
    const path = station ? findRoute(this.world, r.to, r.from, this.scratch) : null;
    if (!station || !path) {
      this.state.responders.splice(this.state.responders.indexOf(r), 1);
      return;
    }
    r.phase = 'back';
    this.setLeg(r, r.to, path, station);
  }

  /** Start a leg of the trip: from `start` along `path`, timed at today's congestion. */
  private setLeg(r: Responder, start: number, path: Int32Array, station: BuildingInstance) {
    r.start = start;
    r.path = path;
    r.agent.path = path;
    r.agent.seg = 0;
    r.agent.t = 0;
    r.elapsed = 0;
    r.shown = 0;
    r.duration = travelTicks(this.world, path, this.commute?.congestion ?? null, buildingDef(station.def).responder?.speed ?? 1);
  }

  /** Whether the rest of a vehicle's path is still connected road, tile to tile. */
  private pathIntact(r: Responder): boolean {
    const world = this.world;
    const w = world.width;
    const n = r.path.length;
    const from = Math.min(n - 1, Math.floor(Math.min(1, r.elapsed / Math.max(1, r.duration)) * (n - 1)));
    for (let k = from; k < n; k++) {
      const i = r.path[k];
      if (world.road[i] === RoadType.None) return false;
      if (k + 1 >= n) break;
      const j = r.path[k + 1];
      const dx = (j % w) - (i % w);
      const dy = Math.floor(j / w) - Math.floor(i / w);
      const bit = dy === -1 ? 1 : dx === 1 ? 2 : dy === 1 ? 4 : 8;
      if (!(roadMask(world, i % w, Math.floor(i / w)) & bit)) return false;
    }
    return true;
  }

  /** The road tile a moving vehicle is on now. */
  private tileOf(r: Responder): number {
    const n = r.path.length;
    const s = Math.min(1, r.elapsed / Math.max(1, r.duration)) * (n - 1);
    return r.path[Math.min(n - 1, Math.floor(s))];
  }

  /**
   * Roads or buildings changed: every vehicle still driving re-routes from where it is, to where
   * its incident (or station) is now. One heading out with no way through is called back; one
   * that can't get home either is gone. Its incident then asks again, as when nobody was free.
   */
  onWorldChanged(change: WorldChange) {
    const world = this.world;
    const list = this.state.responders;
    for (const r of [...list]) {
      if (r.phase === 'scene') continue; // parked; the way back is routed when it leaves
      const station = world.buildings.get(r.station);
      if (!station) continue; // moveResponders drops it
      if (station.entrance !== -1) r.from = station.entrance;
      let goal = r.from;
      if (r.phase === 'out') {
        const inc = this.find(r.incident);
        const b = inc ? world.buildings.get(inc.building) : undefined;
        if (b && b.entrance !== -1) r.to = b.entrance;
        goal = r.to;
      }
      // Keep the trip unless its destination moved or the road ahead is gone, so edits elsewhere
      // (and reloading a save) never disturb a vehicle that can still get there.
      if (goal === r.path[r.path.length - 1] && (!change.roads || this.pathIntact(r))) continue;
      const here = this.tileOf(r);
      const path = findRoute(world, here, goal, this.scratch);
      if (path) {
        this.setLeg(r, here, path, station);
        continue;
      }
      const home = r.phase === 'out' ? findRoute(world, here, r.from, this.scratch) : null;
      if (home) {
        r.phase = 'back';
        this.setLeg(r, here, home, station);
      } else {
        list.splice(list.indexOf(r), 1);
      }
    }
  }

  /** Age every incident; returns true when a building burned down (the world changed). */
  private ageIncidents(): boolean {
    const world = this.world;
    let burned = false;
    for (const inc of [...this.state.list]) {
      if (!this.state.list.includes(inc)) continue;
      const b = world.buildings.get(inc.building);
      if (!b) {
        this.remove(inc);
        continue;
      }
      inc.age++;
      if (inc.kind === 'fire') {
        if (inc.answered) {
          if (++inc.work >= INCIDENTS.fireWork) {
            this.remove(inc);
            this.events.push({ type: 'resolved', kind: 'fire', building: b });
          }
          continue;
        }
        if (!inc.spread && inc.age >= INCIDENTS.spreadAfter) {
          inc.spread = true;
          this.spread(b);
        }
        if (inc.age >= INCIDENTS.burnAfter) {
          this.burnDown(b);
          burned = true;
          continue;
        }
      } else if (!inc.answered && inc.age >= (inc.kind === 'theft' ? INCIDENTS.theftWindow : INCIDENTS.patientWindow)) {
        if (inc.kind === 'theft') b.robbed = INCIDENTS.markDays;
        else b.sick = INCIDENTS.markDays;
        this.remove(inc);
        this.events.push({ type: 'missed', kind: inc.kind, building: b });
        continue;
      }
      if (!inc.answered && !this.vehicleFor(inc.id)) {
        if (inc.wait > 0) inc.wait--;
        else if (!this.dispatch(inc, b)) {
          inc.wait = INCIDENTS.askEvery;
          if (!inc.reported) {
            inc.reported = true;
            this.events.push({ type: 'unreached', kind: inc.kind, building: b });
          }
        }
      }
    }
    return burned;
  }

  /** The fire takes the building: its incidents end, the lot is cleared (the zone stays, so it regrows). */
  private burnDown(b: BuildingInstance) {
    for (const inc of this.state.list.filter((i) => i.building === b.id)) this.remove(inc);
    const { w, h } = BUILDINGS[b.def].size;
    this.world.removeBuilding(b.id, w, h);
    this.events.push({ type: 'burned', building: b });
  }

  /** An unanswered fire catches the first touching zoned building that isn't burning yet. */
  private spread(b: BuildingInstance) {
    const world = this.world;
    const { w, h } = BUILDINGS[b.def].size;
    if (this.state.list.filter((i) => i.kind === 'fire').length >= INCIDENTS.maxActive) return;
    for (let y = b.y - 1; y <= b.y + h; y++) {
      for (let x = b.x - 1; x <= b.x + w; x++) {
        if (!world.inBounds(x, y)) continue;
        const id = world.building[world.index(x, y)];
        if (id === -1 || id === b.id) continue;
        const n = world.buildings.get(id);
        if (!n || BUILDINGS[n.def].category === 'civic' || n.construction > 0) continue;
        if (this.state.list.some((i) => i.kind === 'fire' && i.building === id)) continue;
        this.start('fire', n);
        return;
      }
    }
  }

  /**
   * Send a vehicle from the station with the fastest route: stations of the right kind, working,
   * with a vehicle free and within reach; the nearest few are routed. False when none can go.
   */
  private dispatch(inc: Incident, b: BuildingInstance): boolean {
    const world = this.world;
    const target = b.entrance;
    if (target === -1) return false;
    const candidates: { s: BuildingInstance; r: ResponderDef; d: number }[] = [];
    for (const s of world.buildings.values()) {
      const r = buildingDef(s.def).responder;
      if (!r || !canAnswer(r, inc.kind) || !isWorking(s)) continue;
      const d = manhattan(world, s.entrance, target);
      if (d > INCIDENTS.maxTiles || this.out(s.id) >= r.vehicles) continue;
      candidates.push({ s, r, d });
    }
    candidates.sort((p, q) => p.d - q.d || p.s.id - q.s.id);
    let best: { s: BuildingInstance; r: ResponderDef; path: Int32Array; ticks: number } | null = null;
    for (const c of candidates.slice(0, INCIDENTS.routed)) {
      const path = findRoute(world, c.s.entrance, target, this.scratch);
      if (!path) continue;
      const ticks = travelTicks(world, path, this.commute?.congestion ?? null, c.r.speed ?? 1);
      if (!best || ticks < best.ticks) best = { s: c.s, r: c.r, path, ticks };
    }
    if (!best) return false;
    this.state.responders.push({
      kind: best.r.kind,
      station: best.s.id,
      incident: inc.id,
      phase: 'out',
      from: best.s.entrance,
      to: target,
      start: best.s.entrance,
      path: best.path,
      elapsed: 0,
      duration: best.ticks,
      shown: 0,
      agent: newAgent(best.r.kind, best.path),
    });
    return true;
  }

  private find(id: number): Incident | null {
    return this.state.list.find((i) => i.id === id) ?? null;
  }

  private remove(inc: Incident) {
    const k = this.state.list.indexOf(inc);
    if (k !== -1) this.state.list.splice(k, 1);
    // A truck at a fire that is over (put out or burned down) heads back.
    for (const r of this.state.responders) if (r.incident === inc.id && r.phase === 'scene') r.duration = Math.min(r.duration, r.elapsed);
  }

  /**
   * Every frame: place each vehicle's agent along its path, easing a little ahead of the
   * last tick so it moves smoothly, with its light bar flashing. Drawing only.
   */
  onFrame(dt: number) {
    for (const r of this.state.responders) {
      const a = r.agent;
      a.age += dt;
      a.variant = Math.floor(a.age * 5) % 2;
      const n = r.path.length;
      if (r.phase === 'scene' || n < 2) {
        // Parked at the scene, facing the way it came in.
        a.seg = Math.max(0, n - 2);
        a.t = n < 2 ? 0 : 1;
        continue;
      }
      r.shown = Math.min(r.elapsed + 1, Math.max(r.elapsed, r.shown + dt * SIM_TICK_HZ));
      const s = Math.min(1, r.shown / Math.max(1, r.duration)) * (n - 1);
      a.seg = Math.min(n - 2, Math.floor(s));
      a.t = s - a.seg;
    }
  }
}

// ---------------------------------------------------------------- saving

/** `[kind, x, y, age, flags, work]`: the building by its footprint's top tile. */
export type SavedIncident = readonly [kind: IncidentKind, x: number, y: number, age: number, flags: number, work: number];
/** `[stationX, stationY, incident index, phase, elapsed, duration, from, to, start]`: the current leg runs from `start`. */
export type SavedResponder = readonly [x: number, y: number, incident: number, phase: number, elapsed: number, duration: number, from: number, to: number, start: number];
/** `[x, y, robbed days, sick days]`. */
export type SavedMark = readonly [x: number, y: number, robbed: number, sick: number];

export interface SavedIncidents {
  readonly list: readonly SavedIncident[];
  readonly responders: readonly SavedResponder[];
  readonly marks: readonly SavedMark[];
}

const FLAG = { answered: 1, spread: 2, reported: 4 } as const;

export function saveIncidents(city: City): SavedIncidents | undefined {
  const world = city.world;
  const st = city.incidents;
  const index = new Map<number, number>();
  const list: SavedIncident[] = [];
  for (const inc of st.list) {
    const b = world.buildings.get(inc.building);
    if (!b) continue;
    index.set(inc.id, list.length);
    list.push([inc.kind, b.x, b.y, inc.age, (inc.answered ? FLAG.answered : 0) | (inc.spread ? FLAG.spread : 0) | (inc.reported ? FLAG.reported : 0), inc.work]);
  }
  const responders: SavedResponder[] = [];
  for (const r of st.responders) {
    const s = world.buildings.get(r.station);
    if (s) responders.push([s.x, s.y, index.get(r.incident) ?? -1, PHASES.indexOf(r.phase), r.elapsed, r.duration, r.from, r.to, r.start]);
  }
  const marks: SavedMark[] = [];
  for (const b of world.buildings.values()) if (b.robbed > 0 || b.sick > 0) marks.push([b.x, b.y, b.robbed, b.sick]);
  if (list.length === 0 && responders.length === 0 && marks.length === 0) return undefined;
  return { list, responders, marks };
}

/** The building whose footprint starts at (x, y), if any. */
function buildingAt(world: World, x: number, y: number): BuildingInstance | null {
  if (!world.inBounds(x, y)) return null;
  const b = world.buildings.get(world.building[world.index(x, y)]);
  return b && b.x === x && b.y === y ? b : null;
}

/** Put saved incidents back into a freshly loaded city (roads and buildings already in place). */
export function loadIncidents(city: City, saved: SavedIncidents) {
  const world = city.world;
  const st = emptyIncidents();
  const ids: number[] = [];
  for (const [kind, x, y, age, flags, work] of saved.list) {
    const b = buildingAt(world, x, y);
    const id = st.next++;
    ids.push(b ? id : -1);
    if (!b) continue;
    st.list.push({ id, kind, building: b.id, age, answered: (flags & FLAG.answered) !== 0, work, spread: (flags & FLAG.spread) !== 0, reported: (flags & FLAG.reported) !== 0, wait: 0 });
  }
  for (const [x, y, incident, phase, elapsed, duration, from, to, start] of saved.responders) {
    const s = buildingAt(world, x, y);
    const kind = s ? buildingDef(s.def).responder?.kind : undefined;
    const p = PHASES[phase];
    if (!s || !kind || !p) continue;
    const path = findRoute(world, start, p === 'back' ? from : to);
    if (!path) continue;
    st.responders.push({ kind, station: s.id, incident: ids[incident] ?? -1, phase: p, from, to, start, path, elapsed, duration, shown: elapsed, agent: newAgent(kind, path) });
  }
  for (const [x, y, robbed, sick] of saved.marks) {
    const b = buildingAt(world, x, y);
    if (!b) continue;
    b.robbed = robbed;
    b.sick = sick;
  }
  city.incidents = st;
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Check untrusted saved incidents; anything malformed is dropped (the city loads without them). */
export function parseIncidents(v: unknown): SavedIncidents | undefined {
  if (!isRecord(v)) return undefined;
  const o = v;
  const rows = (key: string, len: number): readonly (readonly unknown[])[] => {
    const a = o[key];
    if (!Array.isArray(a)) return [];
    const list: readonly unknown[] = a;
    return list.filter((r): r is readonly unknown[] => Array.isArray(r) && r.length === len);
  };
  const int = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  const isKind = (k: unknown): k is IncidentKind => typeof k === 'string' && (INCIDENT_KINDS as readonly string[]).includes(k);
  const big = 1 << 30;
  const list: SavedIncident[] = [];
  for (const [kind, x, y, age, flags, work] of rows('list', 6)) {
    if (isKind(kind) && int(x, 0, 4096) && int(y, 0, 4096) && int(age, 0, big) && int(flags, 0, 7) && int(work, 0, big)) list.push([kind, x, y, age, flags, work]);
  }
  const responders: SavedResponder[] = [];
  for (const [x, y, incident, phase, elapsed, duration, from, to, start] of rows('responders', 9)) {
    if (int(x, 0, 4096) && int(y, 0, 4096) && int(incident, -1, big) && int(phase, 0, 2) && int(elapsed, 0, big) && int(duration, 0, big) && int(from, 0, big) && int(to, 0, big) && int(start, 0, big)) {
      responders.push([x, y, incident, phase, elapsed, duration, from, to, start]);
    }
  }
  const marks: SavedMark[] = [];
  for (const [x, y, robbed, sick] of rows('marks', 4)) {
    if (int(x, 0, 4096) && int(y, 0, 4096) && int(robbed, 0, 365) && int(sick, 0, 365)) marks.push([x, y, robbed, sick]);
  }
  return { list, responders, marks };
}
