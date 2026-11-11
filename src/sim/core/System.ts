import type { Lifestyle } from '../buildings/catalog';
import type { Stage } from '../stages';
import type { TechDef } from '../research';
import type { BudgetReport } from '../systems/budget';
import type { TileArea } from '../systems/growth';

/**
 * One simulation system (docs/02-architecture.md, "Simulation Systems", D-058). Each system
 * owns one concern (access, utilities, coverage, fire, growth, population, budget, traffic …)
 * and implements only the hooks it needs. `Simulation` calls them in a fixed order.
 */
export interface SimSystem {
  readonly name: string;
  /** Roads or buildings changed (an edit, growth, a fire). */
  onWorldChanged?(change: WorldChange): void;
  /** Once per in-game day; may add to the day's outcome. */
  onDay?(out: DayOutcome): void;
  /** On the last day of each month, after onDay. */
  onMonth?(out: DayOutcome): void;
  /** Every frame, with `dt` in sim seconds (already scaled by game speed). */
  onFrame?(dt: number, hour: number): void;
}

export interface WorldChange {
  /** Road tiles changed (routes must be rebuilt), not just buildings. */
  roads: boolean;
}

/** Everything a day produced, for the game to show (effects, toasts, refreshes). */
export interface DayOutcome {
  /** Tile areas whose buildings changed. */
  changed: TileArea[];
  /** Construction sites started today, and buildings finished today (ids). */
  started: number[];
  completed: number[];
  /** Buildings abandoned today, and abandoned ones that recovered (ids). */
  abandoned: number[];
  recovered: number[];
  /** Set on the last day of a month. */
  budget: BudgetReport | null;
  /** The stage the city reached today, if it climbed one (docs/specs/evolution.md). */
  stage: Stage | null;
  /** A lifestyle tier the city's first homes reached today. */
  lifestyle: Lifestyle | null;
  /** A research project finished today (sim/research.ts). */
  research: TechDef | null;
}

export function emptyOutcome(): DayOutcome {
  return { changed: [], started: [], completed: [], abandoned: [], recovered: [], budget: null, stage: null, lifestyle: null, research: null };
}
