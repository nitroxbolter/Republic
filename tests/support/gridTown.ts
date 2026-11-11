import type { BuildingId, BuildingInstance } from '../../src/sim/buildings/catalog';
import { City } from '../../src/sim/City';
import { applyPlace, applyRoad, applyZone, planPlace, planRoad, planZone } from '../../src/sim/commands';
import { Simulation } from '../../src/sim/core/Simulation';
import { rectTiles, roadPath, RoadType, type BuildableRoad } from '../../src/sim/roads';
import { Terrain } from '../../src/sim/terrain/types';
import { World } from '../../src/sim/World';
import { ZoneType, type ZonedType } from '../../src/sim/zones';

export interface GridTownOptions {
  /** Map side (square). */
  readonly size?: number;
  readonly seed?: number;
  /** Plants and water towers (default on). */
  readonly utilities?: boolean;
  /** Police, fire, clinic and school on every few blocks (default on). */
  readonly services?: boolean;
  readonly funds?: number;
}

export interface GridTown {
  readonly world: World;
  readonly city: City;
  readonly sim: Simulation;
  /** Place a building with its centre tile at (x, y); returns it, or null if it couldn't go there. */
  place(id: BuildingId, x: number, y: number): BuildingInstance | null;
  road(ax: number, ay: number, bx: number, by: number, type?: BuildableRoad): void;
}

/**
 * A grass map with a street grid every 8 tiles and a zone in every block (homes, apartments,
 * shops, offices, industry in turn), plus, by default, power, water and the basic services.
 * The standard "real town" for system tests: it grows to a few thousand people in a few months.
 */
export function gridTown(opts: GridTownOptions = {}): GridTown {
  const size = opts.size ?? 64;
  const world = new World(size, size, opts.seed ?? 11);
  world.terrain.fill(Terrain.Grass);
  world.tree.fill(0);
  const city = new City(world, opts.funds ?? 1e9);
  const road = (ax: number, ay: number, bx: number, by: number, type: BuildableRoad = RoadType.Road) =>
    void applyRoad(city, planRoad(world, roadPath({ x: ax, y: ay }, { x: bx, y: by }, true), type), type);
  const place = (id: BuildingId, x: number, y: number): BuildingInstance | null => {
    if (!applyPlace(city, planPlace(world, id, x, y), 0).ok) return null;
    return world.buildings.get(world.building[world.index(x, y)]) ?? null;
  };
  const last = size - 8;
  for (let k = 8; k <= last; k += 8) {
    road(8, k, last, k);
    road(k, 8, k, last);
  }
  // Civic buildings sit just inside each block's corner, on tiles the zones leave free.
  if (opts.utilities !== false) {
    place('power_plant', 10, 10);
    place('power_plant', 13, 10);
    place('power_plant', 10, 13);
    for (let y = 9; y < last; y += 8) for (let x = 9; x < last; x += 8) place('water_tower', x, y);
  }
  if (opts.services !== false) {
    for (let y = 15; y < last; y += 16) {
      for (let x = 15; x < last; x += 16) {
        place('police_station', x, y);
        place('fire_station', x - 1, y);
        place('clinic', x, y - 1);
        place('school', x - 2, y - 3);
      }
    }
  }
  const zones: readonly ZonedType[] = [ZoneType.Residential, ZoneType.ResidentialHigh, ZoneType.Commercial, ZoneType.Industrial, ZoneType.CommercialHigh];
  let n = 0;
  for (let y = 8; y < last; y += 8) {
    for (let x = 8; x < last; x += 8) {
      const z = zones[n++ % zones.length];
      applyZone(city, planZone(world, rectTiles({ x: x + 1, y: y + 1 }, { x: x + 7, y: y + 7 }), z), z);
    }
  }
  const sim = new Simulation(city);
  sim.worldChanged({ roads: true });
  return { world, city, sim, place, road };
}
