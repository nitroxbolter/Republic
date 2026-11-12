import { BUILDINGS, type BuildingInstance, type ServiceKind } from './buildings/catalog';
import { Stage, STAGES } from './stages';
import { isActive } from './systems/access';
import { serviceBit } from './systems/coverage';
import { garbageScore } from './systems/garbage';
import { cityStats } from './systems/population';
import { hasUtilities } from './systems/utilities';
import type { World } from './World';

/**
 * Stage gates (docs/specs/evolution.md, D-086): a locked city reaches the next stage only once
 * it has the population *and* the basics of the stage it is in already work.
 */

/** One condition for reaching a stage, with how far the city is (shown in the HUD). */
export interface StageRequirement {
  readonly label: string;
  /** 0..1 progress (population share, or share of homes served). */
  readonly have: number;
  readonly met: boolean;
  /** "1,830 / 2,500" or "62% / 75%". */
  readonly detail: string;
}

/** Share of homes a service must reach before the city can move on (docs/specs/evolution.md, "Stage gates"). */
const SERVED_SHARE = 0.75;
/** Share of homes with power and water, and with their garbage collected. */
const UTILITY_SHARE = 0.9;

/**
 * What the city needs to reach `stage`: its population, plus the basics of the stage before it
 * (D-086). A city only progresses once what it already has works.
 */
export function stageRequirements(world: World, stage: Stage): StageRequirement[] {
  const pop = cityStats(world).population;
  const target = STAGES[stage].population;
  const out: StageRequirement[] = [
    { label: 'Moradores', have: Math.min(1, target === 0 ? 1 : pop / target), met: pop >= target, detail: `${pop.toLocaleString()} / ${target.toLocaleString()}` },
  ];
  const homes = [...world.buildings.values()].filter((b) => BUILDINGS[b.def].category === 'residential' && isActive(b) && !b.abandoned && b.occupants > 0);
  const share = (label: string, test: (b: BuildingInstance) => boolean, need: number) => {
    const have = homes.length === 0 ? 0 : homes.filter(test).length / homes.length;
    out.push({ label, have: Math.min(1, have / need), met: have >= need, detail: `${Math.round(have * 100)}% / ${Math.round(need * 100)}% das moradias` });
  };
  const served = (kind: ServiceKind) => (b: BuildingInstance) => (b.services & serviceBit(kind)) !== 0;
  if (stage >= Stage.Village) share('Energia e água', hasUtilities, UTILITY_SHARE);
  if (stage >= Stage.Town) {
    share('Polícia', served('police'), SERVED_SHARE);
    share('Bombeiros', served('fire'), SERVED_SHARE);
    share('Clínica', served('health'), SERVED_SHARE);
    share('Escola', served('education'), SERVED_SHARE);
    share('Coleta de lixo', (b) => garbageScore(b) >= 0.5, UTILITY_SHARE);
  }
  if (stage >= Stage.City) share('Hospital', served('hospital'), SERVED_SHARE);
  if (stage >= Stage.Metropolis) share('Universidade', served('university'), SERVED_SHARE);
  return out;
}

