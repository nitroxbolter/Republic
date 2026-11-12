import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingInstance } from '../buildings/catalog';
import type { World } from '../World';
import { isActive } from './access';
import { hasUtilities } from './utilities';
import { economyReport, effectiveJobs, employmentFactor } from './economy';
import type { SimSystem } from '../core/System';
import { workingAge } from './society';
import type { City } from '../City';

/**
 * Population system: people move into homes and fill jobs, once a day.
 * Pure functions over the World so they're easy to test. See docs/specs/simulation.md.
 */

export interface CityStats {
  population: number;
  /** Homes' total capacity. */
  housing: number;
  jobs: number;
  workers: number;
  /** Working-age residents without a job. */
  unemployed: number;
}

/** How full a building gets from its happiness: 55% when miserable, 100% when fully happy. */
export function happinessFactor(b: BuildingInstance): number {
  return BALANCE.happinessBase + BALANCE.happinessRange * b.happiness;
}

export function cityStats(world: World, taxRate: number = BALANCE.baseTaxRate, society?: City['society']): CityStats {
  let population = 0;
  let housing = 0;
  let jobs = 0;
  let workers = 0;
  const economy = economyReport(world, taxRate);
  for (const b of world.buildings.values()) {
    // Construction sites keep carried-over occupants for later but don't count yet; abandoned buildings are empty.
    if (b.construction > 0 || b.abandoned) continue;
    const d = BUILDINGS[b.def];
    if (d.category === 'residential') {
      population += b.occupants;
      housing += d.capacity;
    } else {
      jobs += b.entrance === -1 || !hasUtilities(b) ? 0 : effectiveJobs(b, economy);
      workers += b.occupants;
    }
  }
  const workforce = workingAge(population, society?.sick, society?.prisoners);
  return { population, housing, jobs, workers, unemployed: Math.max(0, workforce - workers) };
}

/**
 * One in-game day. Homes with road access fill toward a target that rises with job
 * availability; job buildings take workers from the workforce in proportion to capacity.
 */
export function simulateDay(world: World, taxRate: number = BALANCE.baseTaxRate, society?: City['society']) {
  const before = cityStats(world, taxRate, society);
  const workforce = workingAge(before.population, society?.sick, society?.prisoners);
  // How well jobs cover the workforce: 1 when every worker could have a job.
  const jobCover = workforce === 0 ? (before.jobs > 0 ? 1 : 0) : Math.min(1, before.jobs / workforce);
  const fill = BALANCE.minHousingFill + (1 - BALANCE.minHousingFill) * jobCover;

  for (const b of world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (d.category !== 'residential' || !isActive(b)) continue;
    // No power or water: people leave. Otherwise services set how full a home gets (docs/specs/core.md).
    const target = hasUtilities(b) && !b.abandoned ? Math.round(d.capacity * fill * happinessFactor(b)) : 0;
    if (b.occupants < target) b.occupants += Math.max(1, Math.round((target - b.occupants) * BALANCE.moveInRate));
    else if (b.occupants > target) b.occupants -= Math.max(1, Math.round((b.occupants - target) * BALANCE.moveInRate));
    b.occupants = Math.min(d.capacity, Math.max(0, b.occupants));
  }

  // Share the (new) workforce across job buildings by capacity.
  const after = cityStats(world, taxRate, society);
  const available = workingAge(after.population, society?.sick, society?.prisoners);
  const share = after.jobs === 0 ? 0 : Math.min(1, available / after.jobs);
  const economy = economyReport(world, taxRate);
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
  constructor(world: World, taxRate: () => number = () => BALANCE.baseTaxRate, society: () => City['society'] | undefined = () => undefined) {
    this.world = world;
    this.taxRate = taxRate;
    this.society = society;
  }
  onDay() {
    simulateDay(this.world, this.taxRate(), this.society());
  }
}
