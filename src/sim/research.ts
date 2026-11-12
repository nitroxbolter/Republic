import type { City } from './City';
import { serviceBit } from './systems/coverage';
import { isWorking } from './systems/utilities';

/**
 * Research (docs/specs/evolution.md, E7; D-090): universities and research centres make points
 * every day, which finish projects in a fixed order. Each finished project is permanent.
 */

export const TECH_IDS = ['cleanCoal', 'garbageTrucks', 'construction', 'wideCare', 'greenIndustry', 'rapidTransit'] as const;
export type TechId = (typeof TECH_IDS)[number];

export interface TechDef {
  readonly id: TechId;
  readonly name: string;
  readonly points: number;
  /** What it does, for the HUD. */
  readonly effect: string;
}

export const TECHS: readonly TechDef[] = [
  { id: 'cleanCoal', name: 'Carvão mais limpo', points: 90, effect: 'Usinas a carvão e gás produzem 40% menos fumaça' },
  { id: 'garbageTrucks', name: 'Coleta de lixo eficiente', points: 120, effect: 'Instalações de lixo recolhem 30% mais por dia' },
  { id: 'construction', name: 'Construção moderna', points: 150, effect: 'Edifícios precisam de 30% menos materiais' },
  { id: 'wideCare', name: 'Saúde ampliada', points: 200, effect: 'Clínicas e hospitais alcançam 25% mais longe' },
  { id: 'greenIndustry', name: 'Indústria verde', points: 250, effect: 'A indústria produz 40% menos fumaça' },
  { id: 'rapidTransit', name: 'Transporte rápido', points: 300, effect: 'Desbloqueia trilhos e estações de trem' },
];

/** Research progress: points toward the current project, and how many are finished. */
export interface ResearchState {
  points: number;
  done: number;
}

const POINTS = { centre: 3, centreWithUniversity: 4.5, university: 1 } as const;

/** Is a project finished? */
export function hasTech(city: Pick<City, 'research'>, id: TechId): boolean {
  return TECH_IDS.indexOf(id) < city.research.done;
}

/** The project under way, or null when all are done. */
export function currentTech(city: Pick<City, 'research'>): TechDef | null {
  return TECHS[city.research.done] ?? null;
}

/** Points a day from the city's working research centres and universities. */
export function researchRate(city: City): number {
  let rate = 0;
  const university = serviceBit('university');
  for (const b of city.world.buildings.values()) {
    if (!isWorking(b)) continue;
    if (b.def === 'research_centre') rate += b.services & university ? POINTS.centreWithUniversity : POINTS.centre;
    else if (b.def === 'university') rate += POINTS.university;
  }
  return rate;
}

/** One day of research. Returns the project finished today, if any. */
export function researchDay(city: City): TechDef | null {
  const r = city.research;
  const tech = currentTech(city);
  if (!tech) return null;
  r.points += researchRate(city);
  if (r.points < tech.points) return null;
  r.points -= tech.points;
  r.done++;
  return tech;
}

/** Multipliers the systems read (1 = no change). */
export interface TechEffects {
  /** Coal and gas plant smoke. */
  readonly fossilSmoke: number;
  readonly industrySmoke: number;
  readonly garbageTrucks: number;
  readonly materials: number;
  /** Clinic and hospital reach. */
  readonly careReach: number;
}

export function techEffects(city: Pick<City, 'research'>): TechEffects {
  return {
    fossilSmoke: hasTech(city, 'cleanCoal') ? 0.6 : 1,
    industrySmoke: hasTech(city, 'greenIndustry') ? 0.6 : 1,
    garbageTrucks: hasTech(city, 'garbageTrucks') ? 1.3 : 1,
    materials: hasTech(city, 'construction') ? 0.7 : 1,
    careReach: hasTech(city, 'wideCare') ? 1.25 : 1,
  };
}

/** Effects of a city with no research (tests, systems built without a city). */
export const NO_TECH: TechEffects = { fossilSmoke: 1, industrySmoke: 1, garbageTrucks: 1, materials: 1, careReach: 1 };
