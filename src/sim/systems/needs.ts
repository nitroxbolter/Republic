import { BALANCE } from '../../shared/balance';
import { BUILDINGS, Lifestyle, type BuildingDef, type BuildingInstance } from '../buildings/catalog';
import type { DayOutcome, SimSystem } from '../core/System';
import type { World } from '../World';
import { isActive } from './access';
import type { CommuteSystem } from './commute';
import { serviceBit } from './coverage';
import { cityStats } from './population';
import { householdPurchasingPower } from './economy';
import { roadSpec } from '../roadTypes';
import { Stage } from '../stages';
import { garbageScore } from './garbage';
import { RAIL } from '../rail';
import { airScore, aqiBand, type AirSystem } from './air';
import type { City } from '../City';
import { workingAge } from './society';

/**
 * Needs system (docs/specs/needs.md): every finished, connected zoned building scores its
 * needs (jobs, shopping, safety, health, education, commute, clean air, parks; workers and
 * customers for businesses). Their weighted average is its happiness, which sets how full
 * it gets, gates levelling up and, after a long unhappy spell, abandons it. Unhappy buildings
 * complain about their worst need.
 */

export type NeedKind =
  | 'jobs'
  | 'shopping'
  | 'safety'
  | 'health'
  | 'education'
  | 'hospital'
  | 'university'
  | 'garbage'
  | 'transit'
  | 'research'
  | 'commute'
  | 'traffic'
  | 'air'
  | 'parks'
  | 'affordability'
  | 'workers'
  | 'customers';

export const NEED_KINDS: readonly NeedKind[] = [
  'jobs',
  'shopping',
  'safety',
  'health',
  'education',
  'hospital',
  'university',
  'garbage',
  'transit',
  'research',
  'commute',
  'traffic',
  'air',
  'parks',
  'affordability',
  'workers',
  'customers',
];

/** Complaint shown for a need, plus one for abandoned buildings. */
export type ComplaintKind = NeedKind | 'abandoned';

export const COMPLAINT_TEXT: Readonly<Record<ComplaintKind, string>> = {
  jobs: 'Não há empregos para nós',
  shopping: 'Não há lojas por perto',
  safety: 'Não nos sentimos seguros: construa delegacias e quartéis dos bombeiros',
  health: 'Precisamos de uma clínica por perto',
  education: 'Precisamos de uma escola por perto',
  hospital: 'Nossas famílias precisam de um hospital',
  university: 'Nossos filhos querem estudar na universidade',
  garbage: 'O lixo está se acumulando na nossa rua',
  transit: 'Precisamos de um terminal de ônibus ou estação de trem por perto',
  research: 'Nossos formados precisam trabalhar em um centro de pesquisa',
  commute: 'O deslocamento está terrível',
  traffic: 'O trânsito dificulta o acesso dos clientes',
  air: 'Fumaça e ruído demais',
  parks: 'Não há parques para aproveitar',
  affordability: 'Os impostos reduziram nosso poder de compra',
  workers: 'Não encontramos trabalhadores',
  customers: 'Não há clientes suficientes',
  abandoned: 'Este lugar está abandonado',
};

type Weights = Readonly<Partial<Record<NeedKind, number>>>;

/**
 * Need weights per kind of building, and for homes per lifestyle tier (normalized by total;
 * docs/specs/evolution.md). Garbage joins from the Village stage with GARBAGE_WEIGHT, and
 * happiness is averaged over the weights a building has, so the others' shares shrink to fit.
 */
const HOME_WEIGHTS: Readonly<Record<Lifestyle, Weights>> = {
  [Lifestyle.Basic]: { jobs: 0.2, safety: 0.15, commute: 0.13, shopping: 0.12, air: 0.12, health: 0.1, education: 0.1, parks: 0.08, affordability: 0.06 },
  [Lifestyle.Comfortable]: { jobs: 0.18, safety: 0.14, commute: 0.12, shopping: 0.11, air: 0.11, health: 0.08, education: 0.08, parks: 0.08, hospital: 0.1, affordability: 0.06 },
  [Lifestyle.Prosperous]: {
    jobs: 0.16,
    safety: 0.13,
    commute: 0.11,
    shopping: 0.1,
    air: 0.1,
    health: 0.06,
    education: 0.06,
    parks: 0.08,
    hospital: 0.1,
    university: 0.1,
    affordability: 0.06,
  },
};
const WEIGHTS = {
  commercial: { workers: 0.3, safety: 0.2, customers: 0.2, traffic: 0.2, air: 0.1 },
  industrial: { workers: 0.6, safety: 0.4 },
} as const satisfies Record<string, Weights>;
const GARBAGE_WEIGHT = { residential: 0.08, commercial: 0.1, industrial: 0.1 } as const;
/**
 * Expectations that come with a better life or a bigger city (docs/specs/evolution.md,
 * "Requests"): asked for even by content homes when they aren't met, in this order.
 */
const EXPECTATIONS: readonly NeedKind[] = ['hospital', 'university', 'transit', 'research'];
/** Transit joins from the Town stage for better-off homes and apartments; research at Metropolis for Prosperous homes. */
const TRANSIT_WEIGHT = 0.08;
const RESEARCH_WEIGHT = 0.06;

const RADIUS = { shopping: 12, parks: 6, highway: 2 } as const;

/** One building's needs (only the ones it has) and the result. */
export interface BuildingNeeds {
  scores: Partial<Record<NeedKind, number>>;
  happiness: number;
  /** Worst need when unhappy enough to complain, or 'abandoned'. */
  complaint: ComplaintKind | null;
}

export interface Complaint {
  kind: ComplaintKind;
  text: string;
  /** Buildings sharing this complaint. */
  count: number;
  /** The unhappiest of them (for "Show me"). */
  building: number;
  x: number;
  y: number;
  /** Authoritative values behind the complaint, shown by the HUD. */
  stats: readonly { label: string; value: string }[];
}

export interface NeedsReport {
  /** Resident-weighted average happiness of homes (0..1); 1 with no residents. */
  happiness: number;
  abandoned: number;
  /** Most common complaints first, at most 4. */
  complaints: Complaint[];
}

function needWeights(def: BuildingDef, b: BuildingInstance, stage: Stage): Weights | null {
  if (def.category === 'civic') return null;
  const home = def.category === 'residential';
  const base = def.category === 'residential' ? HOME_WEIGHTS[b.lifestyle] : WEIGHTS[def.category];
  return {
    ...base,
    // Garbage from the Village; transit when bus stations unlock (Town) for homes that want it;
    // a research centre at Metropolis, for the graduates in Prosperous homes.
    ...(stage >= Stage.Village && { garbage: GARBAGE_WEIGHT[def.category] }),
    ...(home && stage >= Stage.Town && (b.lifestyle >= Lifestyle.Comfortable || def.density === 'high') && { transit: TRANSIT_WEIGHT }),
    ...(home && stage >= Stage.Metropolis && b.lifestyle === Lifestyle.Prosperous && { research: RESEARCH_WEIGHT }),
  };
}

/** A complaint in the words of the building that makes it: incidents and bad air have their own. */
function complaintText(kind: ComplaintKind, b: BuildingInstance, air: AirSystem | null): string {
  if (kind === 'air' && air && air.aqiOf(b) > 150) return 'O ar está nos deixando doentes';
  if (kind === 'safety' && b.robbed > 0) return 'Fomos assaltados e a polícia não veio';
  if (kind === 'health' && b.sick > 0) return 'Ninguém veio quando estávamos doentes';
  return COMPLAINT_TEXT[kind];
}

const centre = (b: BuildingInstance) => {
  const s = BUILDINGS[b.def].size;
  return { x: b.x + s.w / 2, y: b.y + s.h / 2 };
};

export class NeedsSystem implements SimSystem {
  readonly name = 'needs';
  /** Per building id: its scores, happiness and complaint. */
  readonly byBuilding = new Map<number, BuildingNeeds>();
  report: NeedsReport = { happiness: 1, abandoned: 0, complaints: [] };

  private readonly world: World;
  private readonly commute: CommuteSystem | null;
  /** The city's stage: garbage counts from the Village on. */
  private readonly stage: () => Stage;
  /** The air quality field (clean air reads its AQI); without it the air is clean. */
  private readonly air: AirSystem | null;
  private readonly taxRate: () => number;
  private readonly policy: () => City | null;

  constructor(
    world: World,
    commute: CommuteSystem | null = null,
    stage: () => Stage = () => Stage.Hamlet,
    air: AirSystem | null = null,
    taxRate: () => number = () => BALANCE.baseTaxRate,
    policy: () => City | null = () => null,
  ) {
    this.world = world;
    this.commute = commute;
    this.stage = stage;
    this.air = air;
    this.taxRate = taxRate;
    this.policy = policy;
  }

  /** Re-score after edits (so placing a clinic shows up straight away). */
  onWorldChanged() {
    this.score();
  }

  /** Daily: re-score, then move the abandonment streaks on by one day. Buildings that flip are redrawn. */
  onDay(out?: DayOutcome) {
    this.score();
    for (const b of this.world.buildings.values()) {
      if (!this.byBuilding.has(b.id)) continue;
      const was = b.abandoned;
      if (!b.abandoned) {
        b.moodDays = b.happiness < BALANCE.abandonLine ? b.moodDays + 1 : 0;
        if (b.moodDays >= BALANCE.abandonDays) {
          b.abandoned = true;
          b.moodDays = 0;
          b.occupants = 0;
        }
      } else {
        b.moodDays = b.happiness >= BALANCE.recoverLine ? b.moodDays + 1 : 0;
        if (b.moodDays >= BALANCE.recoverDays) {
          b.abandoned = false;
          b.moodDays = 0;
        }
      }
      if (b.abandoned !== was && out) {
        const { w, h } = BUILDINGS[b.def].size;
        out.changed.push({ x: b.x, y: b.y, w, h });
        (b.abandoned ? out.abandoned : out.recovered).push(b.id);
      }
    }
    this.score();
  }

  /** Score every working zoned building's needs and set its happiness. */
  score() {
    const w = this.world;
    const all = [...w.buildings.values()];
    const taxRate = this.taxRate();
    const city = this.policy();
    const stats = cityStats(w, taxRate, city?.society, city?.minimumWage);
    const workforce = workingAge(stats.population, city?.society.sick, city?.society.prisoners);
    const jobCover = workforce === 0 ? 1 : Math.min(1, stats.jobs / workforce);
    const workerShare = stats.jobs === 0 ? 1 : Math.min(1, stats.workers / stats.jobs);
    const traffic = this.commute ? Math.max(0, Math.min(1, 1 - Math.max(0, this.commute.report.avgMinutes - 15) / 45)) : 1;
    const police = serviceBit('police');
    const fire = serviceBit('fire');
    const health = serviceBit('health');
    const education = serviceBit('education');
    const hospital = serviceBit('hospital');
    const university = serviceBit('university');
    const stage = this.stage();

    // Places that matter to neighbours, with their centres.
    const shops: { x: number; y: number; jobs: number }[] = [];
    const homes: { x: number; y: number; people: number }[] = [];
    const parks: { x: number; y: number }[] = [];
    /** Bus and train stations with how far they serve (transit), and whether the city has a research centre. */
    const stations: { x: number; y: number; reach: number }[] = [];
    let researchCentre = false;
    for (const b of all) {
      const d: BuildingDef = BUILDINGS[b.def];
      const c = centre(b);
      if (d.busStation && isActive(b)) stations.push({ ...c, reach: d.busStation.reach });
      if (d.railStation && isActive(b)) stations.push({ ...c, reach: RAIL.walkTiles });
      if (b.def === 'research_centre' && isActive(b)) researchCentre = true;
      if (!isActive(b) || b.abandoned) continue;
      if (d.category === 'commercial') shops.push({ ...c, jobs: d.capacity });
      if (d.category === 'residential') homes.push({ ...c, people: b.occupants });
      if (d.group === 'parks') parks.push(c);
    }
    const near = (c: { x: number; y: number }, p: { x: number; y: number }, r: number) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= r * r;

    this.byBuilding.clear();
    for (const b of all) {
      const d: BuildingDef = BUILDINGS[b.def];
      const weights = needWeights(d, b, stage);
      if (!weights || !isActive(b)) continue;
      const c = centre(b);
      const scores: Partial<Record<NeedKind, number>> = {};
      const kinds = NEED_KINDS.filter((k) => weights[k] !== undefined);
      for (const kind of kinds) {
        scores[kind] = this.needScore(kind, b, {
          jobCover,
          workerShare,
          purchasingPower: householdPurchasingPower(taxRate, city?.minimumWage),
          // A theft nobody stopped, or a patient nobody reached, halves the need for a month (E3).
          safety: ((b.services & police ? 0.6 : 0) + (b.services & fire ? 0.4 : 0)) * (b.robbed > 0 ? 0.5 : 1) * Math.max(0.35, 1 - Math.max(0, (city?.society.prisonOverflow ?? 0) - 2) / Math.max(5, stats.population * 0.02)),
          health: (b.services & health ? 1 : 0) * (b.sick > 0 ? 0.5 : 1) * Math.max(0.5, 1 - ((city?.society.sick ?? 0) + 5 * (city?.society.recentDeaths ?? 0)) / Math.max(1, stats.population)),
          education: b.services & education ? 1 : 0,
          hospital: b.services & hospital ? 1 : 0,
          university: b.services & university ? 1 : 0,
          transit: stations.some((st) => near(c, st, st.reach)) ? 1 : 0,
          research: researchCentre ? 1 : 0,
          shops: () => shops.filter((s) => near(c, s, RADIUS.shopping)).reduce((n, s) => n + s.jobs, 0),
          residents: () => (b.entrance === -1 ? 0 : homes.reduce((n, h) => n + h.people, 0)),
          traffic,
          parks: () => parks.filter((p) => near(c, p, RADIUS.parks)).length,
          // Clean air from the AQI where it stands (docs/specs/evolution.md, E4), less highway noise.
          air: () => Math.max(0, (this.air ? airScore(this.air.aqiOf(b)) : 1) - this.highwayNoise(b)),
        });
      }
      let happiness = 0;
      let total = 0;
      let worst: NeedKind | null = null;
      let worstShortfall = 0;
      for (const kind of kinds) {
        const weight = weights[kind] ?? 0;
        const s = scores[kind] ?? 1;
        happiness += weight * s;
        total += weight;
        const shortfall = weight * (1 - s);
        if (shortfall > worstShortfall) {
          worstShortfall = shortfall;
          worst = kind;
        }
      }
      happiness = total === 0 ? 1 : happiness / total;
      b.happiness = happiness;
      // Unhappy homes complain about their worst need; content ones still ask for their tier's expectation.
      const request = d.category === 'residential' ? EXPECTATIONS.find((k) => weights[k] !== undefined && (scores[k] ?? 1) < BALANCE.requestLine) : undefined;
      const complaint: ComplaintKind | null = b.abandoned ? 'abandoned' : happiness < BALANCE.complainLine ? worst : (request ?? null);
      this.byBuilding.set(b.id, { scores, happiness, complaint });
    }
    this.summarise();
  }

  private needScore(
    kind: NeedKind,
    b: BuildingInstance,
    ctx: {
      jobCover: number;
      workerShare: number;
      purchasingPower: number;
      safety: number;
      traffic: number;
      health: number;
      education: number;
      hospital: number;
      university: number;
      transit: number;
      research: number;
      shops: () => number;
      residents: () => number;
      parks: () => number;
      air: () => number;
    },
  ): number {
    switch (kind) {
      case 'jobs': {
        // No reachable job at all (no commute route) means no jobs, whatever the city has.
        const reachable = !this.commute || this.commute.commuteMinutes.has(b.id) || b.occupants === 0;
        return reachable ? ctx.jobCover : 0;
      }
      case 'shopping':
        return Math.min(1, ctx.shops() / 20);
      case 'safety':
        return ctx.safety;
      case 'health':
        return ctx.health;
      case 'education':
        return ctx.education;
      case 'hospital':
        return ctx.hospital;
      case 'university':
        return ctx.university;
      case 'transit':
        return ctx.transit;
      case 'research':
        return ctx.research;
      case 'garbage':
        return garbageScore(b);
      case 'commute': {
        const m = this.commute?.commuteMinutes.get(b.id);
        if (m === undefined) return 0.5;
        return Math.max(0, Math.min(1, 1 - (m - 15) / 45));
      }
      case 'air':
        return ctx.air();
      case 'parks':
        return Math.min(1, ctx.parks() / 2);
      case 'affordability':
        return Math.min(1, ctx.purchasingPower * 0.9);
      case 'workers':
        return ctx.workerShare;
      case 'customers':
        return Math.min(1, Math.min(1, ctx.residents() / 200) * ctx.traffic * ctx.purchasingPower);
      case 'traffic':
        return ctx.traffic;
    }
  }

  /** Noise from highway tiles within RADIUS.highway of the footprint (0.05 each, at most 0.4). */
  private highwayNoise(b: BuildingInstance): number {
    const w = this.world;
    const { w: bw, h: bh } = BUILDINGS[b.def].size;
    const r = RADIUS.highway;
    let n = 0;
    for (let y = b.y - r; y < b.y + bh + r; y++) {
      for (let x = b.x - r; x < b.x + bw + r; x++) {
        if (w.inBounds(x, y) && roadSpec(w.road[w.index(x, y)])?.noisy) n++;
      }
    }
    return Math.min(0.4, n * 0.05);
  }

  /** City happiness and the top complaints. */
  private summarise() {
    let people = 0;
    let weighted = 0;
    let abandoned = 0;
    const groups = new Map<ComplaintKind, { count: number; worst: BuildingInstance | null }>();
    for (const b of this.world.buildings.values()) {
      if (b.abandoned) abandoned++;
      const n = this.byBuilding.get(b.id);
      if (!n) continue;
      if (BUILDINGS[b.def].category === 'residential' && b.occupants > 0) {
        people += b.occupants;
        weighted += b.occupants * n.happiness;
      }
      if (!n.complaint) continue;
      const g = groups.get(n.complaint) ?? { count: 0, worst: null };
      g.count++;
      if (!g.worst || b.happiness < g.worst.happiness) g.worst = b;
      groups.set(n.complaint, g);
    }
    const complaints: Complaint[] = [];
    for (const [kind, g] of groups) {
      if (!g.worst) continue;
      const c = centre(g.worst);
      complaints.push({
        kind,
        text: complaintText(kind, g.worst, this.air),
        count: g.count,
        building: g.worst.id,
        x: c.x,
        y: c.y,
        stats: this.complaintStats(kind, g.worst),
      });
    }
    complaints.sort((a, b) => b.count - a.count);
    this.report = { happiness: people === 0 ? 1 : weighted / people, abandoned, complaints: complaints.slice(0, 4) };
  }

  private complaintStats(kind: ComplaintKind, b: BuildingInstance): readonly { label: string; value: string }[] {
    const d = BUILDINGS[b.def];
    if (kind === 'customers') {
      let residents = 0;
      for (const home of this.world.buildings.values()) {
        const homeDef = BUILDINGS[home.def];
        if (homeDef.category === 'residential' && isActive(home) && !home.abandoned) residents += home.occupants;
      }
      return [
        { label: 'Road-accessible residents', value: `${residents.toLocaleString()} / 200 target` },
        { label: 'Business capacity', value: `${d.capacity.toLocaleString()} jobs` },
      ];
    }
    if (kind === 'traffic') {
      const minutes = this.commute?.report.avgMinutes ?? 0;
      return [{ label: 'Average travel time', value: `${Math.round(minutes)} minutes` }];
    }
    if (kind === 'air' && this.air) {
      const aqi = Math.round(this.air.aqiOf(b));
      return [{ label: 'Air quality', value: `AQI ${aqi} (${aqiBand(aqi).label})` }];
    }
    if (kind === 'garbage') {
      return [{ label: 'Uncollected garbage', value: `${Math.round(b.garbage)} t` }];
    }
    if (kind === 'workers') {
      const stats = cityStats(this.world, this.taxRate());
      return [
        { label: 'Available workers', value: stats.workers.toLocaleString() },
        { label: 'Building jobs', value: d.capacity.toLocaleString() },
      ];
    }
    const n = this.byBuilding.get(b.id);
    if (!n || kind === 'abandoned') return [];
    return [{ label: 'Need score', value: `${Math.round((n.scores[kind] ?? 0) * 100)}%` }];
  }
}
