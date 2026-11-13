import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/City';
import { applyPlace, applyRoad, applyZone, planPlace, planRoad, planZone } from '../src/sim/commands';
import { Simulation } from '../src/sim/core/Simulation';
import { loadSimulation, parseSave, serialize } from '../src/sim/save';
import { rectTiles, roadPath, RoadType } from '../src/sim/roads';
import { generateTerrain } from '../src/sim/terrain/generate';
import { presetSettings } from '../src/sim/terrain/presets';
import { Terrain } from '../src/sim/terrain/types';
import { ZoneType, type ZonedType } from '../src/sim/zones';

const terrain = presetSettings('plains', 9, 64);

/** A small grid town with every zone, power and water: enough for growth, commutes and needs. */
function town(): Simulation {
  const world = generateTerrain(terrain);
  world.terrain.fill(Terrain.Grass);
  world.tree.fill(0);
  const city = new City(world, 1_000_000);
  const road = (ax: number, ay: number, bx: number, by: number) =>
    applyRoad(city, planRoad(world, roadPath({ x: ax, y: ay }, { x: bx, y: by }, true), RoadType.Road), RoadType.Road);
  for (let k = 8; k <= 56; k += 8) {
    road(8, k, 56, k);
    road(k, 8, k, 56);
  }
  applyPlace(city, planPlace(world, 'power_plant', 10, 10), 0);
  applyPlace(city, planPlace(world, 'solar_farm', 20, 10), 0);
  applyPlace(city, planPlace(world, 'battery_bank', 23, 10), 0);
  applyPlace(city, planPlace(world, 'wind_turbine', 24, 10), 0);
  applyPlace(city, planPlace(world, 'water_tower', 14, 10), 0);
  applyPlace(city, planPlace(world, 'water_tower', 15, 10), 0);
  const zone = (x0: number, y0: number, z: ZonedType) =>
    applyZone(city, planZone(world, rectTiles({ x: x0 + 1, y: y0 + 1 }, { x: x0 + 7, y: y0 + 7 }), z), z);
  const zones: ZonedType[] = [ZoneType.Residential, ZoneType.ResidentialHigh, ZoneType.Commercial, ZoneType.Industrial, ZoneType.CommercialHigh];
  let n = 0;
  for (let y = 16; y < 56; y += 8) for (let x = 8; x < 56; x += 8) zone(x, y, zones[n++ % zones.length]);
  const sim = new Simulation(city);
  sim.worldChanged({ roads: true });
  return sim;
}

/** Everything that decides the city's future, as one comparable value. */
function fingerprint(sim: Simulation) {
  const w = sim.world;
  return {
    day: sim.city.day,
    funds: sim.city.funds,
    road: Array.from(w.road),
    zone: Array.from(w.zone),
    buildings: [...w.buildings.values()].map((b) => [b.def, b.x, b.y, b.variant, b.occupants, b.construction, b.fullDays, b.happiness, b.moodDays, b.abandoned]),
    volume: Array.from(sim.commute.volume),
    streams: [sim.streams.growth.state, sim.streams.fire.state],
    clock: sim.city.ticks,
    stored: [...w.buildings.values()].map((b) => b.stored),
  };
}

describe('determinism (docs/specs/engine.md)', () => {
  it('a saved and reloaded city continues exactly as the running one', () => {
    // Through tick(), as the game runs, so hourly power and battery steps are covered too.
    const running = town();
    running.runDays(40);

    const first = town();
    first.runDays(10);
    const json: unknown = JSON.parse(JSON.stringify(serialize(first.city, terrain, 'Twin', first)));
    const loaded = loadSimulation(parseSave(json));
    loaded.runDays(30);

    const a = fingerprint(running);
    expect(a.buildings.length).toBeGreaterThan(10); // the town grew before hospital coverage became the next constraint
    expect(fingerprint(loaded)).toEqual(a);
  });

  it('the same seed and edits always give the same city', () => {
    const a = town();
    const b = town();
    for (let d = 0; d < 20; d++) {
      a.day();
      b.day();
    }
    expect(fingerprint(b)).toEqual(fingerprint(a));
  });
});
