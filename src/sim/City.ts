import { BALANCE } from '../shared/balance';
import { SIM_TICK_HZ } from '../shared/constants';
import type { ResearchState } from './research';
import { emptyIncidents, type IncidentState } from './systems/incidents';
import { Stage } from './stages';
import type { World } from './World';

/** City-wide state that isn't per-tile: money and the calendar. */
export class City {
  funds: number;
  /** Whole in-game days since founding. */
  day = 0;
  /** Tax rate in percent (BALANCE.minTaxRate … BALANCE.maxTaxRate). */
  taxRate: number = BALANCE.baseTaxRate;
  minimumWage: number = BALANCE.defaultMinimumWage;
  /** Pension paid per senior as a share of the monthly minimum wage. */
  pensionShare: number = BALANCE.pensionShare;
  /** Aggregate social state; individual residents are represented by their homes. */
  society = { sick: 0, prisoners: 0, deaths: 0, recentDeaths: 0, untreatedDeaths: 0, prisonOverflow: 0 };
  /**
   * Fixed sim ticks since founding (SIM_TICK_HZ per sim second). The time of day comes from
   * this integer, never from frame time, so every machine plays a city the same way (D-068).
   */
  ticks = 0;
  /** Highest stage reached (sim/stages.ts); it never goes back down. */
  stage: Stage = Stage.Hamlet;
  /** Stages lock buildings (D-086): on for player cities, off for /demo, tests and the harness. */
  locked = false;
  /**
   * Taxes wait in the Town Hall until the player collects them (docs/specs/evolution.md, E5).
   * On for new player cities, with `locked`; saved cities and /demo collect automatically.
   */
  collectsTaxes = false;
  /** Taxes waiting in the Town Hall's chest. */
  uncollected = 0;
  /**
   * Growth uses construction materials (docs/specs/evolution.md, E6). On for new player cities,
   * with `locked`; saved cities and /demo build freely.
   */
  needsMaterials = false;
  /** Construction materials in stock, in tons. */
  materials = 0;
  /** Research progress (sim/research.ts): points toward the current project, projects finished. */
  research: ResearchState = { points: 0, done: 0 };
  /** Fires, thefts and patients in progress, and the vehicles answering them (docs/specs/evolution.md, E3). */
  incidents: IncidentState = emptyIncidents();

  readonly world: World;

  constructor(world: World, funds: number = BALANCE.startingFunds) {
    this.world = world;
    this.funds = funds;
  }

  /** Sim seconds on the time-of-day clock (separate from the calendar; see docs/04-ui-ux.md). */
  get clock(): number {
    return this.ticks / SIM_TICK_HZ;
  }

  set clock(seconds: number) {
    this.ticks = Math.round(seconds * SIM_TICK_HZ);
  }

  /** Hour of day, 0 ≤ hour < 24. The clock starts at 07:00. */
  get hour(): number {
    return (BALANCE.clockStartHour + (this.clock / BALANCE.secondsPerClockDay) * 24) % 24;
  }

  /** 0-based month and day-of-month, plus year (starting at 1). */
  get date(): { year: number; month: number; dayOfMonth: number } {
    const months = Math.floor(this.day / BALANCE.daysPerMonth);
    return { year: 1 + Math.floor(months / 12), month: months % 12, dayOfMonth: 1 + (this.day % BALANCE.daysPerMonth) };
  }
}
