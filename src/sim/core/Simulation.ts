import { BALANCE } from '../../shared/balance';
import { SIM_TICK_HZ } from '../../shared/constants';
import { RandomStream, subSeed } from '../../shared/rng';
import type { City } from '../City';
import { AccessSystem, updateRoadAccess } from '../systems/access';
import { BudgetSystem } from '../systems/budget';
import { CommuteSystem } from '../systems/commute';
import { NeedsSystem } from '../systems/needs';
import { CoverageSystem, updateCoverage } from '../systems/coverage';
import { AirSystem } from '../systems/air';
import { IncidentSystem } from '../systems/incidents';
import { GarbageSystem } from '../systems/garbage';
import { MaterialsSystem } from '../systems/materials';
import { TrainSystem } from '../systems/trains';
import { LifestyleSystem } from '../systems/lifestyle';
import { stageRequirements } from '../progression';
import { researchDay, techEffects } from '../research';
import { nextStage, stageFor } from '../stages';
import { GrowthSystem } from '../systems/growth';
import { cityStats, PopulationSystem } from '../systems/population';
import { societyDay } from '../systems/society';
import { TrafficSystem } from '../systems/traffic';
import { UtilitiesSystem, updateUtilities, type UtilityReport } from '../systems/utilities';
import type { World } from '../World';
import { emptyOutcome, type DayOutcome, type SimSystem, type WorldChange } from './System';
import { SystemTimings } from './timings';

/** A calendar day every this many ticks. */
export const TICKS_PER_DAY = BALANCE.secondsPerDay * SIM_TICK_HZ;

/** Salts for the systems' random streams (each system gets its own, so they never interfere). */
const SALT = { growth: 0x6077, fire: 0xf12e } as const;

/**
 * The simulation core (D-058): owns the systems and runs them in a fixed order.
 *   - after an edit:  access → utilities → coverage → commute (if roads changed) → air → needs → traffic
 *   - each day:       stage → materials → growth → (the edit refresh) → garbage → commute → air → needs → lifestyle → population → traffic → trains → incidents,
 *                     plus budget (then the garbage month reset) at month end
 *   - each tick:      incidents (vehicles drive, fires burn; a fire that takes a building runs the edit refresh)
 *   - each frame:     the clock, traffic, trains and the emergency vehicles' drawn positions
 * The game layer only calls these entry points and shows the outcome.
 */
export class Simulation {
  readonly access: AccessSystem;
  readonly utilities: UtilitiesSystem;
  readonly coverage: CoverageSystem;
  readonly growth: GrowthSystem;
  readonly incidents: IncidentSystem;
  readonly population: PopulationSystem;
  readonly budget: BudgetSystem;
  readonly commute: CommuteSystem;
  readonly needs: NeedsSystem;
  readonly traffic: TrafficSystem;
  readonly garbage: GarbageSystem;
  readonly air: AirSystem;
  readonly materials: MaterialsSystem;
  readonly trains: TrainSystem;
  readonly lifestyle: LifestyleSystem;
  /** Run after any change to roads or buildings. */
  private readonly onChange: readonly SimSystem[];
  /** Random streams whose state is saved, so a loaded city continues exactly (sim/save.ts). */
  readonly streams: { readonly growth: RandomStream; readonly fire: RandomStream };
  /** Time per system and hook (F3 overlay, `bun run sim:run`). */
  readonly timings = new SystemTimings();
  readonly city: City;

  constructor(city: City) {
    this.city = city;
    const world = city.world;
    this.access = new AccessSystem(world);
    this.utilities = new UtilitiesSystem(world, () => ({ hour: Math.floor(city.hour), day: city.day, seed: world.seed, step: false }));
    this.coverage = new CoverageSystem(world, () => techEffects(city).careReach);
    // Mixing in the day means a loaded city doesn't replay the events of day 0 (identical for new cities).
    const seed = world.seed ^ city.day;
    this.streams = { growth: new RandomStream(subSeed(seed, SALT.growth)), fire: new RandomStream(subSeed(seed, SALT.fire)) };
    this.growth = new GrowthSystem(city, this.streams.growth.next);
    this.materials = new MaterialsSystem(city);
    this.growth.stock = () => this.materials.stock;
    this.population = new PopulationSystem(world, () => city.taxRate, () => city.society, () => city);
    this.budget = new BudgetSystem(city);
    this.commute = new CommuteSystem(world);
    this.air = new AirSystem(world, this.commute, () => techEffects(city));
    // Incidents roll on the fire stream (its name predates them, and saves carry it).
    this.incidents = new IncidentSystem(city, this.streams.fire.next, this.commute, (b) => this.air.aqiOf(b));
    this.needs = new NeedsSystem(world, this.commute, () => city.stage, this.air, () => city.taxRate, () => city);
    this.traffic = new TrafficSystem(world, this.commute);
    this.garbage = new GarbageSystem(city);
    this.lifestyle = new LifestyleSystem(city);
    // An unlocked city opens at its stage straight away (the /demo city, old saves), with no toast.
    if (!city.locked) this.followPopulation();
    this.trains = new TrainSystem(world, this.commute);
    // Incidents last: vehicles re-route on the entrances and roads the others just brought up to date.
    this.onChange = [this.access, this.utilities, this.coverage, this.commute, this.air, this.needs, this.traffic, this.trains, this.incidents];
  }

  get world(): World {
    return this.city.world;
  }

  /** Roads or buildings changed: bring every dependent system up to date. */
  worldChanged(change: WorldChange) {
    for (const s of this.onChange) if (s.onWorldChanged) this.timings.run(`${s.name}.change`, () => s.onWorldChanged?.(change));
  }

  /** One in-game day. Returns what happened, for effects, toasts and refreshes. */
  day(): DayOutcome {
    const out = emptyOutcome();
    const t = this.timings;
    this.city.day++;
    this.climbStage(out);
    t.run('materials.day', () => this.materials.onDay());
    t.run('growth.day', () => this.growth.onDay(out));
    this.materials.afterGrowth();
    t.run('utilities.day', () => this.utilities.onDay?.());
    this.worldChanged({ roads: false });
    t.run('garbage.day', () => this.garbage.onDay());
    t.run('commute.day', () => this.commute.onDay());
    t.run('air.day', () => this.air.onDay());
    t.run('needs.day', () => this.needs.onDay(out));
    t.run('lifestyle.day', () => this.lifestyle.onDay(out));
    t.run('population.day', () => this.population.onDay());
    t.run('traffic.day', () => this.traffic.onDay());
    t.run('trains.day', () => this.trains.onDay());
    t.run('incidents.day', () => this.incidents.onDay());
    t.run('society.day', () => societyDay(this.city, this.incidents.takeSocietyEvents(), this.streams.fire.next));
    t.run('research.day', () => {
      out.research = researchDay(this.city);
    });
    if (this.city.day % BALANCE.daysPerMonth === 0) {
      t.run('budget.month', () => this.budget.onMonth(out));
      t.run('garbage.month', () => this.garbage.onMonth());
      this.incidents.onMonth();
    }
    return out;
  }

  /**
   * A locked city moves up one stage when it meets every requirement of the next (its
   * population and the basics of the current stage); stages never go back down (D-086).
   * Unlocked cities (/demo, old saves) simply follow their population.
   */
  private climbStage(out: DayOutcome) {
    if (!this.city.locked) {
      const before = this.city.stage;
      this.followPopulation();
      if (this.city.stage !== before) out.stage = this.city.stage;
      return;
    }
    const next = nextStage(this.city.stage);
    if (next === null || !stageRequirements(this.world, next).every((r) => r.met)) return;
    this.city.stage = next;
    out.stage = next;
  }

  /** Unlocked cities: the stage their population reaches (never lower than before). */
  private followPopulation() {
    const reached = stageFor(cityStats(this.world).population);
    if (reached > this.city.stage) this.city.stage = reached;
  }

  /**
   * One fixed tick (1 / SIM_TICK_HZ sim seconds): advances the clock, runs the hourly work on
   * each clock-hour boundary, and a whole day every TICKS_PER_DAY ticks. The only way sim time
   * moves (D-068). Returns the day's outcome when a day ran.
   */
  tick(): DayOutcome | null {
    const before = Math.floor(this.city.hour);
    this.city.ticks++;
    const hour = Math.floor(this.city.hour);
    if (hour !== before) this.timings.run('utilities.hour', () => this.utilities.onHour(hour, this.city.day));
    // Incidents run on the tick: vehicles drive, fires burn. A building lost to fire changes the world now.
    if (this.timings.run('incidents.tick', () => this.incidents.tick())) this.worldChanged({ roads: false });
    return this.city.ticks % TICKS_PER_DAY === 0 ? this.day() : null;
  }

  /** Run whole days through tick(), as the game does (harness, tests). */
  runDays(days: number) {
    for (let t = 0; t < days * TICKS_PER_DAY; t++) this.tick();
  }

  /** Every frame, for the visible agents only: `dt` in sim seconds, already scaled by game speed. */
  frame(dt: number) {
    this.timings.run('traffic.frame', () => this.traffic.onFrame(dt, this.city.hour));
    this.trains.onFrame(dt);
    this.incidents.onFrame(dt);
  }
}

/**
 * Bring access, utilities and coverage up to date without a Simulation (tests, the demo
 * builder). Same order as Simulation.worldChanged, minus traffic.
 */
export function refreshCity(world: World): UtilityReport {
  updateRoadAccess(world);
  const report = updateUtilities(world);
  updateCoverage(world);
  return report;
}
