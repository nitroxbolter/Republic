import type { BuildingId, BuildingInstance } from '../../src/sim/buildings/catalog';
import { City } from '../../src/sim/City';
import { applyPlace, applyRoad, planPlace, planRoad } from '../../src/sim/commands';
import { Simulation } from '../../src/sim/core/Simulation';
import { roadPath, RoadType, type BuildableRoad } from '../../src/sim/roads';
import { Terrain } from '../../src/sim/terrain/types';
import { World } from '../../src/sim/World';

export interface Street {
  readonly world: World;
  readonly city: City;
  readonly sim: Simulation;
  /** Place with the centre tile at (x, y); throws if it can't go there (a test bug). */
  place(id: BuildingId, x: number, y: number): BuildingInstance;
  road(ax: number, ay: number, bx: number, by: number, type?: BuildableRoad): void;
  /** Bring every system up to date after edits. */
  refresh(roads?: boolean): void;
}

/**
 * The smallest useful town for one-system tests: a 64×64 grass map with one street along
 * y = 10 (x 2..62). Lots beside it (y 7..13) have road access. Nothing else.
 */
export function street(opts: { funds?: number; size?: number } = {}): Street {
  const size = opts.size ?? 64;
  const world = new World(size, size, 5);
  world.terrain.fill(Terrain.Grass);
  world.tree.fill(0);
  const city = new City(world, opts.funds ?? 1e9);
  const road = (ax: number, ay: number, bx: number, by: number, type: BuildableRoad = RoadType.Road) =>
    void applyRoad(city, planRoad(world, roadPath({ x: ax, y: ay }, { x: bx, y: by }, true), type), type);
  road(2, 10, size - 2, 10);
  const sim = new Simulation(city);
  const place = (id: BuildingId, x: number, y: number): BuildingInstance => {
    const r = applyPlace(city, planPlace(world, id, x, y), 0);
    if (!r.ok) throw new Error(`could not place ${id} at ${x},${y}: ${JSON.stringify(r)}`);
    const b = world.buildings.get(world.building[world.index(x, y)]);
    if (!b) throw new Error(`placed ${id} not found`);
    return b;
  };
  const refresh = (roads = true) => sim.worldChanged({ roads });
  refresh();
  return { world, city, sim, place, road, refresh };
}
