import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/City';
import { applyPlace, applyRoad, planPlace, planRoad } from '../src/sim/commands';
import { Simulation } from '../src/sim/core/Simulation';
import { laneDir, roadMask, roadPath, RoadType, type BuildableRoad } from '../src/sim/roads';
import { decodeLayer, parseSave, serialize } from '../src/sim/save';
import { findRoute } from '../src/sim/systems/traffic';
import { ROAD_SPECS } from '../src/sim/roadTypes';
import { Terrain } from '../src/sim/terrain/types';
import { World } from '../src/sim/World';

/** Homes at the west end, jobs at the east, joined by one corridor of the given road type. */
function corridor(type: BuildableRoad) {
  const w = new World(64, 10, 5);
  w.terrain.fill(Terrain.Grass);
  const city = new City(w, 1e9);
  applyRoad(city, planRoad(w, roadPath({ x: 0, y: 5 }, { x: 63, y: 5 }, true), type), type);
  // Utilities right by the road (within the 3-tile access range). Three plants keep the grid
  // under its wear threshold (docs/specs/energy.md), so the corridor never loses power mid-test.
  applyPlace(city, planPlace(w, 'power_plant', 30, 3), 0);
  applyPlace(city, planPlace(w, 'power_plant', 34, 3), 0);
  applyPlace(city, planPlace(w, 'power_plant', 30, 6), 0);
  applyPlace(city, planPlace(w, 'water_tower', 32, 4), 0);
  applyPlace(city, planPlace(w, 'water_tower', 33, 4), 0);
  // Water reaches 14 tiles (D-093): a tower by the homes and one by the offices.
  applyPlace(city, planPlace(w, 'water_tower', 7, 2), 0);
  applyPlace(city, planPlace(w, 'water_tower', 56, 2), 0);
  for (let x = 0; x < 14; x++) for (const y of [3, 4, 6, 7]) applyPlace(city, planPlace(w, 'walkup', x, y), 0);
  // Fires burn unanswered buildings down (E3); a fire station keeps the homes standing, so the
  // test measures the road, not the luck of the fire roll.
  applyPlace(city, planPlace(w, 'fire_station', 7, 8), 0);
  for (let x = 50; x < 64; x += 2) for (const y of [3, 6]) applyPlace(city, planPlace(w, 'office_tower', x, y), 0);
  const sim = new Simulation(city);
  sim.worldChanged({ roads: true });
  sim.runDays(30);
  const mid = w.index(32, 5);
  return { congestion: sim.commute.congestion[mid], minutes: sim.commute.report.avgMinutes, commuters: sim.commute.report.commuters };
}

describe('road hierarchy (docs/specs/transport.md, T1)', () => {
  it('every road type is fully described, and bigger roads carry more, faster', () => {
    const order = [RoadType.Road, RoadType.Avenue, RoadType.Highway] as const;
    for (let k = 1; k < order.length; k++) {
      const a = ROAD_SPECS[order[k - 1]];
      const b = ROAD_SPECS[order[k]];
      expect(b.rank).toBeGreaterThan(a.rank);
      expect(b.capacity).toBeGreaterThan(a.capacity);
      expect(b.minutes).toBeLessThan(a.minutes);
    }
    expect(ROAD_SPECS[RoadType.Avenue].lanes).toHaveLength(2);
    expect(ROAD_SPECS[RoadType.Highway].footpath).toBeNull();
  });

  it('an avenue corridor jams less and commutes faster than a street', () => {
    const street = corridor(RoadType.Road);
    const avenue = corridor(RoadType.Avenue);
    expect(street.commuters).toBeGreaterThan(500);
    expect(avenue.congestion).toBeLessThan(street.congestion * 0.6);
    expect(avenue.minutes).toBeLessThan(street.minutes);
  });
});

describe('wide roads, ramps and pedestrian streets (T2)', () => {
  function flat(n = 20) {
    const w = new World(n, n, 1);
    w.terrain.fill(Terrain.Grass);
    return { w, city: new City(w, 1e9) };
  }
  const build = (city: City, type: BuildableRoad, a: { x: number; y: number }, b: { x: number; y: number }) =>
    applyRoad(city, planRoad(city.world, roadPath(a, b, true), type), type);

  it('pedestrian streets alongside an expressway or boulevard open no median and put up no lights', () => {
    // User report: a pedestrian street next to an expressway had traffic lights on every tile.
    for (const type of [RoadType.Expressway, RoadType.Boulevard] as const) {
      const { w, city } = flat(24);
      build(city, type, { x: 2, y: 10 }, { x: 20, y: 10 }); // rows 9 and 10
      build(city, RoadType.Pedestrian, { x: 2, y: 8 }, { x: 20, y: 8 });
      build(city, RoadType.Pedestrian, { x: 2, y: 11 }, { x: 20, y: 11 });
      for (let x = 4; x <= 18; x++) {
        // No link across the median mid-span (row 9 → SW, row 10 → NE).
        expect(roadMask(w, x, 9) & 0b0100).toBe(0);
        expect(roadMask(w, x, 10) & 0b0001).toBe(0);
      }
      const sim = new Simulation(city);
      expect(sim.traffic.traffic.lights()).toHaveLength(0);
    }
  });

  it('one drag lays a boulevard as two opposite one-way carriageways that join only at crossings and ends', () => {
    const { w, city } = flat();
    build(city, RoadType.Boulevard, { x: 2, y: 10 }, { x: 15, y: 10 });
    // Dragged row carries traffic in the drag direction (SE, +x); the row on its left (y − 1) the other way.
    expect(laneDir(w, w.index(8, 10))).toBe(1);
    expect(laneDir(w, w.index(8, 9))).toBe(3);
    expect(w.road[w.index(8, 9)]).toBe(RoadType.Boulevard);
    // Mid-span: end-to-end links only (SE and NW), no link across the median.
    expect(roadMask(w, 8, 10)).toBe(0b1010);
    expect(roadMask(w, 8, 9)).toBe(0b1010);
  });

  it('a crossing street opens the median; traffic never drives against the flow', () => {
    const { w, city } = flat();
    build(city, RoadType.Boulevard, { x: 2, y: 10 }, { x: 15, y: 10 });
    build(city, RoadType.Road, { x: 8, y: 4 }, { x: 8, y: 16 });
    expect(w.road[w.index(8, 10)]).toBe(RoadType.Boulevard); // the street didn't downgrade it
    expect(roadMask(w, 8, 10) & 0b0001).toBeTruthy(); // joined to its partner across the median
    // A car going west must use the westbound carriageway (y = 9), never the eastbound one.
    const route = findRoute(w, w.index(14, 10), w.index(3, 9));
    expect(route).not.toBeNull();
    for (const t of route ?? []) if (w.lane[t] !== 0 && t % w.width < 8) expect(laneDir(w, t)).toBe(3);
  });

  it('expressways join only expressways, highways and ramps', () => {
    const { w, city } = flat();
    build(city, RoadType.Expressway, { x: 2, y: 10 }, { x: 15, y: 10 });
    build(city, RoadType.Road, { x: 5, y: 11 }, { x: 5, y: 16 });
    expect(roadMask(w, 5, 11) & 0b0001).toBe(0); // a street can't join an expressway…
    build(city, RoadType.Ramp, { x: 10, y: 11 }, { x: 10, y: 13 });
    expect(roadMask(w, 10, 11) & 0b0001).toBeTruthy(); // …a ramp can
    expect(ROAD_SPECS[RoadType.Expressway].capacity * 2).toBe(4000); // eight lanes over two tiles
  });

  it('pedestrian streets are walkable but cars route around them', () => {
    const { w, city } = flat();
    build(city, RoadType.Road, { x: 2, y: 5 }, { x: 15, y: 5 });
    build(city, RoadType.Pedestrian, { x: 6, y: 6 }, { x: 6, y: 9 });
    expect(ROAD_SPECS[RoadType.Pedestrian].cars).toBe(false);
    expect(findRoute(w, w.index(6, 9), w.index(2, 5))).toBeNull(); // no car starts deep in a pedestrian street…
    const through = findRoute(w, w.index(2, 5), w.index(15, 5));
    expect(through).not.toBeNull();
    expect([...(through ?? [])].some((t) => w.road[t] === RoadType.Pedestrian)).toBe(false); // …or drives through one
  });

  it('wide roads survive a save', () => {
    const { w, city } = flat(24);
    build(city, RoadType.Expressway, { x: 2, y: 10 }, { x: 15, y: 10 });
    w.pave[w.index(1, 1)] = 2;
    const terrain = { preset: 'plains' as const, seed: 1, size: 24, water: 0, trees: 0, rivers: 0, coastSides: 0 };
    const data = parseSave(JSON.parse(JSON.stringify(serialize(city, terrain, 'X'))));
    expect(data.layers.lane).toBeDefined();
    expect(decodeLayer(data.layers.lane ?? '', 24 * 24)).toEqual(w.lane);
  });
});
