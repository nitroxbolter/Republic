import { BALANCE } from '../../shared/balance';
import { BUILDINGS, Lifestyle, type BuildingInstance } from '../buildings/catalog';
import type { City } from '../City';
import type { DayOutcome, SimSystem } from '../core/System';
import { Stage } from '../stages';
import { isActive } from './access';
import { serviceBit } from './coverage';
import { hasUtilities } from './utilities';

/**
 * Lifestyle system (docs/specs/evolution.md, E1): homes in a good city move up from Basic to
 * Comfortable to Prosperous, and better-off residents expect more (a hospital, then a
 * university) and earn more. A long unhappy spell moves a home back down a tier.
 * Runs daily after the needs, so it reads today's happiness.
 */

/** What a home still needs before it can move up a tier, or null when it can (or is at the top). */
export function riseBlocker(b: BuildingInstance, stage: Stage): string | null {
  if (b.lifestyle === Lifestyle.Basic) return stage >= Stage.Town ? null : 'a cidade chegar a Cidade pequena (2.500 moradores)';
  if (b.lifestyle === Lifestyle.Comfortable) {
    if (stage < Stage.City) return 'a cidade chegar a Cidade (10.000 moradores)';
    if (!(b.services & serviceBit('hospital'))) return 'um hospital na área';
    if (!(b.services & serviceBit('education'))) return 'uma escola na área';
    return null;
  }
  return 'nada: este é o nível máximo';
}

function canRise(b: BuildingInstance, stage: Stage): boolean {
  return b.lifestyle < Lifestyle.Prosperous && hasUtilities(b) && b.happiness >= BALANCE.lifeUpLine && riseBlocker(b, stage) === null;
}

function up(t: Lifestyle): Lifestyle {
  return t === Lifestyle.Basic ? Lifestyle.Comfortable : Lifestyle.Prosperous;
}

function down(t: Lifestyle): Lifestyle {
  return t === Lifestyle.Prosperous ? Lifestyle.Comfortable : Lifestyle.Basic;
}

/** Homes per tier, and residents per tier. */
export interface LifestyleReport {
  readonly homes: readonly [number, number, number];
  readonly residents: readonly [number, number, number];
}

export function lifestyleReport(city: City): LifestyleReport {
  const homes: [number, number, number] = [0, 0, 0];
  const residents: [number, number, number] = [0, 0, 0];
  for (const b of city.world.buildings.values()) {
    if (BUILDINGS[b.def].category !== 'residential' || b.construction > 0 || b.abandoned) continue;
    homes[b.lifestyle]++;
    residents[b.lifestyle] += b.occupants;
  }
  return { homes, residents };
}

/** One day: move every home's streak on, and its tier when a streak completes. */
export function lifestyleDay(city: City, out?: DayOutcome) {
  const before = lifestyleReport(city).homes;
  const reached: [number, number, number] = [0, 0, 0];
  for (const b of city.world.buildings.values()) {
    if (BUILDINGS[b.def].category !== 'residential') continue;
    // Empty, unconnected or abandoned homes keep their tier and stop counting.
    if (!isActive(b) || b.abandoned || b.occupants === 0) {
      b.lifeDays = 0;
      continue;
    }
    if (canRise(b, city.stage)) {
      b.lifeDays = Math.max(0, b.lifeDays) + 1;
      if (b.lifeDays >= BALANCE.lifeDays) {
        b.lifestyle = up(b.lifestyle);
        b.lifeDays = 0;
        reached[b.lifestyle]++;
      }
    } else if (b.lifestyle > Lifestyle.Basic && b.happiness < BALANCE.lifeDownLine) {
      b.lifeDays = Math.min(0, b.lifeDays) - 1;
      if (b.lifeDays <= -BALANCE.lifeDays) {
        b.lifestyle = down(b.lifestyle);
        b.lifeDays = 0;
      }
    } else {
      b.lifeDays = 0;
    }
  }
  // The first homes ever to reach a tier get a toast.
  if (out) {
    for (const t of [Lifestyle.Comfortable, Lifestyle.Prosperous] as const) {
      if (before[t] === 0 && reached[t] > 0) out.lifestyle = t;
    }
  }
}

export class LifestyleSystem implements SimSystem {
  readonly name = 'lifestyle';
  private readonly city: City;
  constructor(city: City) {
    this.city = city;
  }
  onDay(out: DayOutcome) {
    lifestyleDay(this.city, out);
  }
}
