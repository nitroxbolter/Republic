import { BALANCE } from '../shared/balance';
import { SIM_TICK_HZ } from '../shared/constants';
import type { ResearchState } from './research';
import { emptyIncidents, type IncidentState } from './systems/incidents';
import { Stage } from './stages';
import type { World } from './World';
import { defaultCostTaxRates, type CostTaxRates } from './systems/livingCosts';
import { initialDemography, type DemographicPolicy } from './systems/demography';
import { initialBank, type BankState } from './systems/bank';
import { emptyMilitary, type MilitaryState } from './systems/military';

/** City-wide state that isn't per-tile: money and the calendar. */
export class City {
  funds: number;
  /** Whole in-game days since founding. */
  day = 0;
  /** Tax rate in percent (BALANCE.minTaxRate … BALANCE.maxTaxRate). */
  taxRate: number = BALANCE.baseTaxRate;
  /** Percent withheld from workers' gross wages; pensions are exempt. */
  incomeTaxRate = 0;
  minimumWage: number = BALANCE.defaultMinimumWage;
  /** Monthly government payment per senior, independent of the minimum wage. */
  pensionPerSenior: number = BALANCE.defaultPensionPerSenior;
  costTaxRates: CostTaxRates = defaultCostTaxRates();
  propertyLedger = { loaned: 0, recovered: 0, writtenOff: 0, issuedThisMonth: 0, acquiredThisMonth: 0, repaidEarlyThisMonth: 0, earlyInterestThisMonth: 0 };
  demography: DemographicPolicy = initialDemography();
  bank: BankState = initialBank();
  /** Troops and equipment owned by the city; facility storage limits are derived from its buildings. */
  military: MilitaryState = emptyMilitary();
  /** Aggregate social state; individual residents are represented by their homes. */
  society = { sick: 0, prisoners: 0, deaths: 0, recentDeaths: 0, untreatedDeaths: 0, prisonOverflow: 0, naturalDeathCarry: 0 };
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
    world.onRemoveBuilding = (b) => { if (b.property?.loan) this.propertyLedger.writtenOff += b.property.loan.balance + b.property.loan.late; };
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
