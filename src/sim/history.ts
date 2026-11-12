import type { Simulation } from './core/Simulation';
import { lifestyleReport } from './systems/lifestyle';
import { cityStats } from './systems/population';

/**
 * One sample of the city's vital signs (docs/05-master-plan.md §4.6). The headless harness
 * writes them as CSV; the history ring buffer and Graphs panel (step 11.2) store them.
 */
export interface CitySample {
  readonly day: number;
  readonly population: number;
  readonly housing: number;
  readonly jobs: number;
  readonly workers: number;
  readonly unemployed: number;
  readonly funds: number;
  /** 0..1 */
  readonly happiness: number;
  readonly abandoned: number;
  readonly buildings: number;
  readonly commuters: number;
  readonly avgCommute: number;
  readonly jammedTiles: number;
  /** R/C/I demand, each −1..1. */
  readonly demandR: number;
  readonly demandC: number;
  readonly demandO: number;
  readonly demandI: number;
  readonly powerShort: number;
  readonly waterShort: number;
  /** City stage (sim/stages.ts) and residents per lifestyle tier (docs/specs/evolution.md). */
  readonly stage: number;
  readonly comfortable: number;
  readonly prosperous: number;
  /** Tons of garbage lying uncollected. */
  readonly garbage: number;
}

export function sampleCity(sim: Simulation): CitySample {
  const s = cityStats(sim.world, sim.city.taxRate);
  const demand = sim.growth.demand();
  const traffic = sim.commute.report;
  const needs = sim.needs.report;
  const utilities = sim.utilities.report;
  const life = lifestyleReport(sim.city);
  return {
    day: sim.city.day,
    population: s.population,
    housing: s.housing,
    jobs: s.jobs,
    workers: s.workers,
    unemployed: s.unemployed,
    funds: sim.city.funds,
    happiness: needs.happiness,
    abandoned: needs.abandoned,
    buildings: sim.world.buildings.size,
    commuters: traffic.commuters,
    avgCommute: traffic.avgMinutes,
    jammedTiles: traffic.jammedTiles,
    demandR: demand.r,
    demandC: demand.c,
    demandO: demand.o,
    demandI: demand.i,
    powerShort: utilities.power.short,
    waterShort: utilities.water.short,
    stage: sim.city.stage,
    comfortable: life.residents[1],
    prosperous: life.residents[2],
    garbage: Math.round(sim.garbage.report.uncollected),
  };
}

/** Column order for CSV output. */
export const SAMPLE_COLUMNS: readonly (keyof CitySample)[] = [
  'day',
  'population',
  'housing',
  'jobs',
  'workers',
  'unemployed',
  'funds',
  'happiness',
  'abandoned',
  'buildings',
  'commuters',
  'avgCommute',
  'jammedTiles',
  'demandR',
  'demandC',
  'demandO',
  'demandI',
  'powerShort',
  'waterShort',
  'stage',
  'comfortable',
  'prosperous',
  'garbage',
];
