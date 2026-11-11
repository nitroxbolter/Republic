import { policeStation } from './police_station';
import { fireStation } from './fire_station';
import { clinic } from './clinic';
import { school } from './school';
import { hospital } from './hospital';
import { university } from './university';
import { traumaCentre } from './trauma_centre';
import { recyclingCentre } from './recycling_centre';
import { incinerator } from './incinerator';
import { researchCentre } from './research_centre';
import { substation } from './substation';
import type { BuildingArt, RecipeId } from '../types';

/** Civic buildings drawn by the generic recipe painter: police, fire, clinic, school, hospital,
 * university, substation, recycling centre and incinerator. One file per building. */
export const SERVICES = {
  police_station: policeStation,
  fire_station: fireStation,
  clinic,
  school,
  hospital,
  university,
  trauma_centre: traumaCentre,
  recycling_centre: recyclingCentre,
  incinerator,
  research_centre: researchCentre,
  substation,
} satisfies Partial<Record<RecipeId, readonly BuildingArt[]>>;
