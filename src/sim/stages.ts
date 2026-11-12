import { BUILDING_IDS, type BuildingId } from './buildings/catalog';
import type { City } from './City';
import { hasTech, type TechId } from './research';

/**
 * City stages (docs/specs/evolution.md, E0; D-086): the city climbs them as its population
 * grows, never goes back down, and each one unlocks buildings and brings a new problem.
 */

export const Stage = { Hamlet: 0, Village: 1, Town: 2, City: 3, Metropolis: 4 } as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export interface StageDef {
  readonly name: string;
  /** Population that reaches it. */
  readonly population: number;
  /** The problem it brings, for the stage-up toast. */
  readonly news: string;
}

export const STAGES: Readonly<Record<Stage, StageDef>> = {
  [Stage.Hamlet]: { name: 'Povoado', population: 0, news: '' },
  [Stage.Village]: { name: 'Vila', population: 150, news: 'Agora é preciso recolher o lixo: construa um aterro sanitário.' },
  [Stage.Town]: { name: 'Cidade pequena', population: 2500, news: 'Os moradores podem alcançar um padrão de vida confortável e vão querer um hospital.' },
  [Stage.City]: { name: 'Cidade', population: 10000, news: 'Os moradores podem se tornar prósperos e vão querer uma universidade.' },
  [Stage.Metropolis]: { name: 'Metrópole', population: 30000, news: 'Sua cidade se tornou uma metrópole.' },
};

export const STAGE_ORDER: readonly Stage[] = [Stage.Hamlet, Stage.Village, Stage.Town, Stage.City, Stage.Metropolis];

/** The stage each building unlocks at; anything not listed is available from the start. */
const UNLOCKS: Readonly<Partial<Record<BuildingId, Stage>>> = {
  school: Stage.Village,
  landfill: Stage.Village,
  riverside_market: Stage.Village,
  central_park: Stage.Village,
  hospital: Stage.Town,
  recycling_centre: Stage.Town,
  gas_plant: Stage.Town,
  solar_farm: Stage.Town,
  battery_bank: Stage.Town,
  botanical_garden: Stage.Town,
  shopping_complex: Stage.Town,
  university: Stage.City,
  trauma_centre: Stage.City,
  incinerator: Stage.City,
  research_centre: Stage.Metropolis,
  observation_wheel: Stage.City,
  theme_park: Stage.City,
  sail_hotel: Stage.City,
  sky_tower: Stage.Metropolis,
  bus_station: Stage.Town,
};

export function unlockStage(id: BuildingId): Stage {
  return UNLOCKS[id] ?? Stage.Hamlet;
}

/** Buildings that unlock exactly at `stage` (for the "What's new" toast). */
export function unlockedAt(stage: Stage): BuildingId[] {
  return BUILDING_IDS.filter((id) => UNLOCKS[id] === stage);
}

/** The highest stage a population reaches (population only; sim/progression.ts has the full gate). */
export function stageFor(population: number): Stage {
  let s: Stage = Stage.Hamlet;
  for (const st of STAGE_ORDER) if (population >= STAGES[st].population) s = st;
  return s;
}

/** The stage after `s`, or null at the top. */
export function nextStage(s: Stage): Stage | null {
  return STAGE_ORDER[STAGE_ORDER.indexOf(s) + 1] ?? null;
}

export function isStage(n: number): n is Stage {
  return STAGE_ORDER.some((s) => s === n);
}

/** Buildings that also need a research project (sim/research.ts). */
const NEEDS_TECH: Readonly<Partial<Record<BuildingId, TechId>>> = { train_station: 'rapidTransit' };

/** The research project a building needs, if any. */
export function unlockTech(id: BuildingId): TechId | null {
  return NEEDS_TECH[id] ?? null;
}

/** Whether the city may place `id` now (always, unless the city locks buildings by stage and research). */
export function isUnlocked(city: Pick<City, 'locked' | 'stage' | 'research'>, id: BuildingId): boolean {
  if (!city.locked) return true;
  const tech = NEEDS_TECH[id];
  return city.stage >= unlockStage(id) && (!tech || hasTech(city, tech));
}
