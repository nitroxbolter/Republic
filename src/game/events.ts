import type { SystemTiming } from '../sim/core/timings';
import type { BuildingId, WealthTier } from '../sim/buildings/catalog';
import type { DemandWhy, ZoneDemand } from '../sim/systems/growth';
import type { BudgetReport } from '../sim/systems/budget';
import type { CostTaxRates } from '../sim/systems/livingCosts';
import type { PowerReport } from '../sim/systems/energy';
import type { UtilityTotals } from '../sim/systems/utilities';
import type { CommuteReport } from '../sim/systems/commute';
import type { NeedKind, NeedsReport } from '../sim/systems/needs';
import type { ServiceKind } from '../sim/buildings/catalog';
import type { StageRequirement } from '../sim/progression';
import type { Stage } from '../sim/stages';
import type { AirReport } from '../sim/systems/air';
import type { TechId } from '../sim/research';
import type { MaterialsReport } from '../sim/systems/materials';
import type { EconomyReport } from '../sim/systems/economy';
import type { societyReport } from '../sim/systems/society';
import type { ToolId } from './tools';

/** Typed event bus: the game emits, the UI bridge / renderer listen. Nothing polls. */
export interface GameEventMap {
  stats: DebugStats;
  hover: { x: number; y: number } | null;
  grid: boolean;
  tool: ToolId;
  building: BuildingId;
  /** Footpath style for new roads (0 = default, else PAVEMENTS index + 1). */
  pavement: number;
  /** Road tools build flyovers over the roads they cross. */
  flyover: boolean;
  funds: number;
  /** Live cost label for an in-progress drag; null when there's nothing to show. */
  toolPreview: ToolPreviewInfo | null;
  notice: Notice;
  /** An ongoing problem was fixed: drop its alert (the Notice key) from the inbox. */
  resolve: string;
  muted: boolean;
  /** View rotation in quarter turns (0–3). */
  rotation: number;
  city: CityInfo;
  /** Hour of day on the clock (0–24), a few times a second. */
  clock: number;
  dayNight: DayNightMode;
  trafficView: boolean;
  happinessView: boolean;
  /** The air quality (AQI) view is on. */
  airView: boolean;
  /** Version counter, bumped when tiles or buildings change (minimap repaint). */
  worldChanged: number;
  budget: BudgetInfo;
  /** Building shown in the info panel, or null when it's closed. */
  inspect: InspectInfo | null;
  /** Reason an individual zoned lot is still vacant. */
  zoneInspect: ZoneInspectInfo | null;
}

export interface ZoneInspectInfo {
  x: number;
  y: number;
  name: string;
  title: string;
  detail: string;
  waiting: boolean;
}

/** Day/night look: follow the clock, or stay in daylight or at night. */
export type DayNightMode = 'cycle' | 'day' | 'night';

export interface CityInfo {
  population: number;
  housing: number;
  jobs: number;
  workers: number;
  unemployed: number;
  economy: EconomyReport;
  society: ReturnType<typeof societyReport>;
  date: { year: number; month: number; dayOfMonth: number };
  /** Index into GAME_SPEEDS (0 = paused). */
  speed: number;
  cars: number;
  people: number;
  /** R/C/I demand, each in [−1, 1]. */
  demand: ZoneDemand;
  /** Why each bar is where it is, in a sentence. */
  demandWhy: DemandWhy;
  power: UtilityTotals;
  water: UtilityTotals;
  /** Commuters, average commute and jammed road tiles (docs/specs/traffic.md). */
  traffic: CommuteReport;
  /** City happiness, abandoned buildings and the top complaints (docs/specs/needs.md). */
  needs: NeedsReport;
  /** Stage, what the next one needs, and residents by lifestyle (docs/specs/evolution.md). */
  progress: ProgressInfo;
  /** Residents' average AQI and the worst area's (docs/specs/evolution.md, E4). */
  air: AirReport;
}

export interface ProgressInfo {
  stage: Stage;
  stageName: string;
  /** Stages lock buildings in this city (D-086). */
  locked: boolean;
  next: { name: string; requirements: readonly StageRequirement[] } | null;
  /** Residents per lifestyle tier: Basic, Comfortable, Prosperous. */
  residents: readonly [number, number, number];
  /** Research (E7): the project under way, finished ones, and points a day; null before any research. */
  research: { current: { name: string; effect: string; points: number; needed: number } | null; done: readonly string[]; rate: number } | null;
  /** Finished research projects (some buildings need one, e.g. stations need Rapid transit). */
  techs: readonly TechId[];
}

export interface BudgetInfo {
  /** Percent. */
  taxRate: number;
  minimumWage: number;
  pensionPerSenior: number;
  costTaxRates: CostTaxRates;
  /** Last month's collected budget (null before the first month ends). */
  last: BudgetReport | null;
  /** Next month at today's numbers. */
  forecast: BudgetReport;
  /** This hour's grid: output by source, demand and battery charge (docs/specs/energy.md). */
  power: PowerReport;
  water: UtilityTotals;
  /** Clock hour the grid was balanced for. */
  hour: number;
  /** Cities that collect taxes by hand: what's waiting at the Town Hall (docs/specs/evolution.md, E5). */
  taxes: { waiting: number; hasTownHall: boolean } | null;
  /** Cities that build with materials: today's stock and flows (E6). */
  materials: MaterialsReport | null;
}

/** What a civic building provides (shown in the info panel). */
export type Provides =
  | { kind: 'service'; service: ServiceKind; radius: number }
  | { kind: 'utility'; power?: number; water?: number; coverage?: number; condition?: number; repairCost?: number };

export interface InspectInfo {
  id: number;
  name: string;
  category: string;
  level: number;
  wealth: WealthTier;
  investorValue: number;
  description: string;
  occupants: number;
  capacity: number;
  /** 'Residents' for homes, 'Workers' otherwise. */
  occupantLabel: string;
  hasRoad: boolean;
  size: { w: number; h: number };
  /** Grew on a zone (vs placed with the Build tool). */
  grown: boolean;
  /** Days of construction left; 0 when finished. */
  constructionDays: number;
  needsUtilities: boolean;
  powered: boolean;
  watered: boolean;
  /** Services covering it (zoned buildings). */
  services: readonly ServiceKind[];
  provides: Provides | null;
  powerIssue: { reason: string; stats: readonly { label: string; value: string }[] } | null;
  /** Power plants only: condition and repair status. */
  condition: number | null;
  repairDays: number;
  repairCost: number;
  /** Monthly running cost. */
  upkeep: number;
  /** Homes: average commute of its workers (minutes), null if unknown. */
  commuteMinutes: number | null;
  /** Zoned buildings: happiness, each need's score and the current complaint. */
  needs: { happiness: number; scores: readonly { kind: NeedKind; score: number }[]; complaint: string | null } | null;
  abandoned: boolean;
  /** Homes: lifestyle tier and what moves it (docs/specs/evolution.md). */
  lifestyle: { tier: string; note: string } | null;
  /** Zoned buildings from the Village stage: tons of garbage waiting for collection. */
  garbage: number | null;
  /** Garbage facilities: today's collection and, for landfills, how full they are. */
  facility: { collectedToday: number; trucks: number; filled: number | null; holds: number | null } | null;
  /** Air quality where it stands (0–500). */
  aqi: number;
  /** The Town Hall in a city that collects by hand: taxes waiting there. */
  taxesWaiting: number | null;
  /** Train stations (E7b): its name, riders a day here, track beside it, and the lines it's on. */
  station: StationInfo | null;
  /** Bus stations: riders a day, and buses out of its fleet. */
  busStation: { riders: number; out: number; fleet: number; reach: number } | null;
}

export interface StationInfo {
  name: string;
  riders: number;
  onTrack: boolean;
  /** Each line through it: its stops in order (this one marked) and the trains running it. */
  lines: readonly { stops: readonly { name: string; riders: number; here: boolean }[]; trains: number }[];
}

export interface ToolPreviewInfo {
  tool: ToolId;
  /** Name shown instead of the tool verb (e.g. the building being placed). */
  label: string | null;
  /** The action can't happen here (e.g. building footprint blocked). */
  blocked: boolean;
  /** Cursor position in canvas CSS px. */
  screen: { x: number; y: number };
  cost: number;
  /** Tiles that will change. */
  count: number;
  affordable: boolean;
  /** Extra warning under the cost (e.g. zone tiles that no road reaches). */
  note: string | null;
  /** A finished touch drag waiting for Build or Cancel (D-080). */
  awaitingConfirm: boolean;
}

export interface Notice {
  id: number;
  /** Milestones (a new stage, residents moving up) stand out and stay longer. */
  kind: 'error' | 'info' | 'milestone';
  message: string;
  /**
   * Alerts worth keeping carry a key: they go to the alerts inbox, a newer one with the same key
   * replaces the older, and the game resolves the key when the problem is gone. Without a key a
   * notice is only a toast.
   */
  key?: string;
  /** The game date it happened, for the inbox ("Jul 9, Y3"). */
  date?: string;
}

export interface DebugStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  visibleChunks: number;
  totalChunks: number;
  visibleSprites: number;
  agents: number;
  agentsDrawn: number;
  bootAtlasMs: number;
  bootChunksMs: number;
  zoom: number;
  mapSize: number;
  seed: number;
  simTick: number;
  /** The slowest simulation hooks so far this game (sim/core/timings.ts). */
  systems: readonly SystemTiming[];
}

type Listener<T> = (payload: T) => void;

export class EventBus<M> {
  private listeners: { [K in keyof M]?: Set<Listener<M[K]>> } = {};

  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    const set = (this.listeners[type] ??= new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof M>(type: K, payload: M[K]) {
    this.listeners[type]?.forEach((fn) => fn(payload));
  }

  clear() {
    this.listeners = {};
  }
}

export type GameEvents = EventBus<GameEventMap>;
