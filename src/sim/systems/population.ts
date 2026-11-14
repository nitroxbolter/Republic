import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingInstance } from '../buildings/catalog';
import type { World } from '../World';
import { isActive } from './access';
import { hasUtilities } from './utilities';
import { economyReport, effectiveJobs, employmentFactor, type HouseholdPolicy } from './economy';
import type { SimSystem } from '../core/System';
import { workingAge } from './society';
import type { City } from '../City';
import { migrationOutlook, recordMigration } from './demography';

/**
 * Population system: people move into homes and fill jobs, once a day.
 * Pure functions over the World so they're easy to test. See docs/specs/simulation.md.
 */

export interface CityStats {
  population: number;
  /** Homes' total capacity. */
  housing: number;
  /** Current effective employment slots at finished, connected and supplied buildings. */
  jobs: number;
  /** Finished, connected buildings that currently offer at least one job. */
  jobBuildings: number;
  /** Unfilled positions across eligible job buildings. */
  jobVacancies: number;
  /** Number of eligible job buildings with at least one open position. */
  vacantJobBuildings: number;
  /** Adults available for work after illness and imprisonment. */
  workforce: number;
  /** Workers assigned to active positions, bounded by both open positions and workforce. */
  workers: number;
  /** Working-age residents without a job. */
  unemployed: number;
}

/** How full a building gets from its happiness: 55% when miserable, 100% when fully happy. */
export function happinessFactor(b: BuildingInstance): number {
  return BALANCE.happinessBase + BALANCE.happinessRange * b.happiness;
}

export function cityStats(world: World, taxRate: number = BALANCE.baseTaxRate, society?: City['society'], policy?: HouseholdPolicy): CityStats {
  let population = 0;
  let housing = 0;
  let jobs = 0;
  let workers = 0;
  let jobBuildings = 0;
  let vacantJobBuildings = 0;
  const economy = economyReport(world, taxRate, policy);
  for (const b of world.buildings.values()) {
    // Construction sites keep carried-over occupants for later but don't count yet; abandoned buildings are empty.
    if (b.construction > 0 || b.abandoned) continue;
    const d = BUILDINGS[b.def];
    if (d.category === 'residential') {
      population += b.occupants;
      housing += d.capacity;
    } else {
      // Count workers and jobs from the same eligible buildings. Occupants can briefly be
      // stale after a utility/access change or an economic slowdown, so cap them to live slots.
      if (b.entrance === -1 || !hasUtilities(b)) continue;
      const slots = Math.floor(effectiveJobs(b, economy));
      if (slots <= 0) continue;
      jobs += slots;
      jobBuildings++;
      const assigned = Math.min(slots, Math.max(0, b.occupants));
      workers += assigned;
      if (slots > assigned) vacantJobBuildings++;
    }
  }
  const workforce = workingAge(population, society?.sick, society?.prisoners);
  workers = Math.min(workforce, workers);
  const jobVacancies = Math.max(0, jobs - workers);
  return { population, housing, jobs, jobBuildings, jobVacancies, vacantJobBuildings, workforce, workers, unemployed: workforce - workers };
}

/**
 * One in-game day. Housing attracts migrants independently of local job supply;
 * jobs still determine employment and therefore spending, taxes and happiness.
 */
export function simulateDay(world: World, taxRate: number = BALANCE.baseTaxRate, society?: City['society'], policy?: City) {
  const before = cityStats(world, taxRate, society, policy);
  const workforce = workingAge(before.population, society?.sick, society?.prisoners);
  const jobCover = workforce === 0 ? (before.jobs > 0 ? 1 : 0) : Math.min(1, before.jobs / workforce);
  const outlook = migrationOutlook(policy, taxRate, economyReport(world, taxRate, policy).purchasingPower);
  const migrationRate = policy ? Math.max(BALANCE.demographicNaturalMoveInFloor, 1 - policy.demography.slowLevel * (1 - BALANCE.demographicNaturalMoveInFloor) + (policy.demography.strategy === 'stimulate' && policy.demography.incentivesEnabled ? policy.demography.incentiveLevel * BALANCE.demographicStimulusMoveInBonus : 0)) : 1;
  let immigration = 0, emigration = 0;

  for (const b of world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (d.category !== 'residential' || !isActive(b)) continue;
    // Jobs help modestly; even a town with none can occupy most available homes.
    const target = hasUtilities(b) && !b.abandoned ? Math.round(d.capacity * Math.max(0.7, happinessFactor(b)) * (1 - BALANCE.housingJobInfluence * (1 - jobCover))) : 0;
    const previous = b.occupants;
    if (b.occupants < target && outlook > 0) b.occupants += Math.max(1, Math.round((target - b.occupants) * BALANCE.moveInRate * migrationRate * outlook * happinessFactor(b)));
    else if (b.occupants > target) b.occupants -= Math.max(1, Math.round((b.occupants - target) * BALANCE.moveInRate));
    b.occupants = Math.min(d.capacity, Math.max(0, b.occupants));
    immigration += Math.max(0, b.occupants - previous);
    emigration += Math.max(0, previous - b.occupants);
  }
  if (policy) recordMigration(policy, immigration, emigration);

  // Share the (new) workforce across job buildings by capacity.
  const after = cityStats(world, taxRate, society, policy);
  const available = workingAge(after.population, society?.sick, society?.prisoners);
  const share = after.jobs === 0 ? 0 : Math.min(1, available / after.jobs);
  const economy = economyReport(world, taxRate, policy);
  for (const b of world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (d.category === 'residential' || b.construction > 0) continue;
    const factor = d.category === 'civic' ? 1 : happinessFactor(b);
    b.occupants = b.entrance === -1 || !hasUtilities(b) || b.abandoned ? 0 : Math.floor(d.capacity * share * factor * employmentFactor(d.category, economy));
  }
}

/** Moves people into homes and jobs once a day. */
export class PopulationSystem implements SimSystem {
  readonly name = 'population';
  private readonly world: World;
  private readonly taxRate: () => number;
  private readonly society: () => City['society'] | undefined;
  private readonly policy: () => City | undefined;
  constructor(world: World, taxRate: () => number = () => BALANCE.baseTaxRate, society: () => City['society'] | undefined = () => undefined, policy: () => City | undefined = () => undefined) {
    this.world = world;
    this.taxRate = taxRate;
    this.society = society;
    this.policy = policy;
  }
  onDay() {
    simulateDay(this.world, this.taxRate(), this.society(), this.policy());
  }
}
