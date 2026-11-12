import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/City';
import { applyPlace, applyRail, applyRoad, planPlace, planRail, planRoad } from '../src/sim/commands';
import { Simulation } from '../src/sim/core/Simulation';
import { TRAINS } from '../src/sim/systems/trains';
import { pointOnTrack, Rail, railCornerShape, railDragPath, railMask, railNetwork, railPath } from '../src/sim/rail';
import { roadPath, RoadType } from '../src/sim/roads';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { Terrain } from '../src/sim/terrain/types';
import { World } from '../src/sim/World';

/** Rail (docs/specs/evolution.md, E7b). */
function flat(n = 40) {
  const w = new World(n, n, 2);
  w.terrain.fill(Terrain.Grass);
  return { w, city: new City(w, 1e9) };
}
const rail = (city: City, a: { x: number; y: number }, b: { x: number; y: number }) => applyRail(city, planRail(city.world, roadPath(a, b, true)));
const road = (city: City, a: { x: number; y: number }, b: { x: number; y: number }) =>
  applyRoad(city, planRoad(city.world, roadPath(a, b, true), RoadType.Road), RoadType.Road);

describe('rail track', () => {
  it('joins in every direction, crosses a street at right angles on an overpass, but never runs along one', () => {
    const { w, city } = flat();
    road(city, { x: 10, y: 2 }, { x: 10, y: 30 }); // a street running along y
    expect(rail(city, { x: 4, y: 12 }, { x: 16, y: 12 }).ok).toBe(true); // crosses it along x
    expect(w.rail[w.index(10, 12)]).toBe(Rail.Track);
    expect(w.road[w.index(10, 12)]).toBe(RoadType.Road); // the road passes under the overpass (D-091)
    expect(railMask(w, 10, 12)).toBe(0b1010);
    const along = planRail(w, roadPath({ x: 10, y: 14 }, { x: 10, y: 20 }, true));
    expect(along.tiles.every((t) => !t.valid)).toBe(true);
  });

  it('bridges straight over water, and blocks zones and buildings on its tiles', () => {
    const { w, city } = flat();
    for (let y = 0; y < 40; y++) for (const x of [20, 21, 22]) w.terrain[w.index(x, y)] = Terrain.DeepWater;
    expect(rail(city, { x: 15, y: 8 }, { x: 28, y: 8 }).ok).toBe(true);
    expect(w.rail[w.index(21, 8)]).toBe(Rail.Bridge);
    expect(planPlace(w, 'park', 16, 8).ok).toBe(false);
  });

  it('a station needs track beside it; stations on one line know the ride between them', () => {
    const { w, city } = flat();
    road(city, { x: 2, y: 10 }, { x: 37, y: 10 });
    expect(planPlace(w, 'train_station', 5, 13).ok).toBe(false);
    expect(planPlace(w, 'train_station', 5, 13).note).toMatch(/trilhos/);
    rail(city, { x: 2, y: 15 }, { x: 37, y: 15 });
    expect(applyPlace(city, planPlace(w, 'train_station', 5, 13), 0).ok).toBe(true);
    expect(applyPlace(city, planPlace(w, 'train_station', 33, 13), 0).ok).toBe(true);
    const sim = new Simulation(city);
    sim.worldChanged({ roads: true });
    const net = railNetwork(w);
    expect(net.stations).toHaveLength(2);
    expect(net.minutes[1]).toBeGreaterThan(0);
    expect(net.minutes[1]).toBeLessThan(Infinity);
  });

  it('needs the Rapid transit research in cities that lock by stage', () => {
    const { city } = flat();
    city.locked = true;
    expect(rail(city, { x: 2, y: 5 }, { x: 10, y: 5 })).toMatchObject({ ok: false, reason: 'locked' });
    city.research.done = 6;
    expect(rail(city, { x: 2, y: 5 }, { x: 10, y: 5 }).ok).toBe(true);
  });

  it('track survives a save', () => {
    const { w, city } = flat();
    rail(city, { x: 2, y: 5 }, { x: 10, y: 5 });
    const terrain = { preset: 'plains', seed: 2, size: 40, water: 0, trees: 0, rivers: 0, coastSides: 0 } as const;
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(serialize(city, terrain, 'Rail')))));
    for (let x = 2; x <= 10; x++) expect(loaded.world.rail[loaded.world.index(x, 5)]).toBe(Rail.Track);
    expect(w.rail[w.index(11, 5)]).toBe(Rail.None);
  });
});

describe('commuting by train', () => {
  it('a line between a suburb and downtown takes 15%+ of commutes off the roads', () => {
    const w = new World(72, 40, 4);
    w.terrain.fill(Terrain.Grass);
    const city = new City(w, 1e9);
    // Suburb at the west, downtown at the east, joined by one long winding road.
    road(city, { x: 2, y: 8 }, { x: 14, y: 8 });
    road(city, { x: 14, y: 8 }, { x: 14, y: 34 });
    road(city, { x: 14, y: 34 }, { x: 58, y: 34 });
    road(city, { x: 58, y: 34 }, { x: 58, y: 8 });
    road(city, { x: 58, y: 8 }, { x: 70, y: 8 });
    const place = (id: Parameters<typeof planPlace>[1], x: number, y: number) => applyPlace(city, planPlace(w, id, x, y), 0);
    for (const x of [6, 7, 8]) place('power_plant', x * 2 - 6, 11);
    for (let x = 3; x < 13; x++) place('water_tower', x, 6);
    place('water_tower', 66, 10); // downtown's offices (water reaches 14 tiles, D-093)
    for (let x = 2; x < 13; x++) for (const y of [9, 10]) place('walkup', x, y);
    for (let x = 60; x < 70; x += 2) place('office_tower', x, 6);
    const sim = new Simulation(city);
    sim.worldChanged({ roads: true });
    sim.runDays(10);
    const before = sim.commute.report;
    expect(before.commuters).toBeGreaterThan(100);
    expect(before.trainRiders).toBe(0);

    // A straight line under the two districts, with a station at each end (3 tiles from the road).
    // It crosses the two north–south roads at right angles (level crossings).
    expect(rail(city, { x: 2, y: 13 }, { x: 70, y: 13 }).ok).toBe(true);
    expect(place('train_station', 2, 11).ok).toBe(true);
    expect(place('train_station', 68, 11).ok).toBe(true);
    sim.worldChanged({ roads: true });
    sim.runDays(10);
    const after = sim.commute.report;
    expect(after.trainRiders / after.commuters).toBeGreaterThan(0.15);
    // Fewer cars on the roads than before the line opened, though the town kept growing.
    expect(after.commuters - after.trainRiders).toBeLessThan(before.commuters);
  });
});

describe('trains on lines', () => {
  /** A straight line along y = 15 with stations every 7 tiles, and riders for four trains. */
  function lineTown() {
    const { w, city } = flat(48);
    road(city, { x: 2, y: 10 }, { x: 45, y: 10 });
    rail(city, { x: 2, y: 15 }, { x: 45, y: 15 });
    for (const x of [4, 11, 18, 25, 32, 39]) applyPlace(city, planPlace(w, 'train_station', x, 13), 0);
    const sim = new Simulation(city);
    sim.worldChanged({ roads: true });
    const ids = [...w.buildings.values()].filter((b) => b.def === 'train_station').map((b) => b.id);
    sim.commute.railTrips = [{ from: ids[0], to: ids[ids.length - 1], riders: 1000 }];
    sim.trains.refresh();
    return { w, sim, ids };
  }

  it('one line through every station, with more trains for more riders', () => {
    const { sim, ids } = lineTown();
    expect(sim.trains.lines).toHaveLength(1);
    expect(sim.trains.lines[0].stops.map((s) => s.station).sort()).toEqual([...ids].sort());
    expect(sim.trains.poses()).toHaveLength(4 * (TRAINS.carriages + 1));
    expect(sim.trains.linesAt(ids[2])[0].trains).toBe(4);
  });

  it('trains never overlap: same-direction trains keep their distance, opposite ones use the other track', () => {
    const { sim } = lineTown();
    let minGap = Infinity;
    let stops = 0;
    for (let f = 0; f < 4000; f++) {
      sim.trains.onFrame(1 / 30);
      const cars = sim.trains.poses();
      const trains: (typeof cars)[] = [];
      for (let k = 0; k < cars.length; k += TRAINS.carriages + 1) trains.push(cars.slice(k, k + TRAINS.carriages + 1));
      // Any two cars of different trains closer than a car length must be on different tracks.
      for (let a = 0; a < trains.length; a++) {
        for (let b = a + 1; b < trains.length; b++) {
          for (const p of trains[a]) {
            for (const q of trains[b]) {
              const d = Math.hypot(p.x - q.x, p.y - q.y);
              if (Math.abs(p.y - q.y) < 0.05) minGap = Math.min(minGap, d); // same track (same lane y)
            }
          }
        }
      }
      // Count trains standing at platforms.
      stops += sim.trains['trains'].filter((t) => t.dwell > 0).length > 0 ? 1 : 0;
    }
    expect(minGap).toBeGreaterThan(1);
    expect(stops).toBeGreaterThan(100);
  });

  it('a train changes ends at a terminus and keeps its whole length on the track', () => {
    const { sim } = lineTown();
    const end = sim.trains.lines[0].path.length - 1;
    for (let f = 0; f < 6000; f++) {
      sim.trains.onFrame(1 / 30);
      for (const t of sim.trains['trains']) {
        const tail = t.s - t.heading * TRAINS.carriages;
        expect(Math.min(t.s, tail)).toBeGreaterThanOrEqual(-0.001);
        expect(Math.max(t.s, tail)).toBeLessThanOrEqual(end + 0.001);
      }
    }
  });
});

describe('curved track (D-089)', () => {
  it('a diagonal drag lays a staircase drawn as one 45° line; a single turn bends as an arc', () => {
    const { w, city } = flat();
    const path = railDragPath({ x: 4, y: 4 }, { x: 12, y: 12 }, false);
    // Across and along in turn: every step moves one tile on one axis.
    for (let k = 1; k < path.length; k++) expect(Math.abs(path[k].x - path[k - 1].x) + Math.abs(path[k].y - path[k - 1].y)).toBe(1);
    expect(applyRail(city, planRail(w, path)).ok).toBe(true);
    expect(railCornerShape(w, 6, 5)).toBe('chord');
    applyRail(city, planRail(w, roadPath({ x: 20, y: 20 }, { x: 30, y: 26 }, false))); // an L: one right-angle turn
    expect(railCornerShape(w, 30, 20)).toBe('arc');
    expect(railCornerShape(w, 25, 20)).toBeNull(); // a straight piece
  });

  it('trains glide along diagonals and round bends without jumping', () => {
    const { w, city } = flat();
    rail(city, { x: 2, y: 4 }, { x: 10, y: 4 });
    applyRail(city, planRail(w, railDragPath({ x: 10, y: 4 }, { x: 18, y: 12 }, false)));
    rail(city, { x: 18, y: 12 }, { x: 18, y: 22 });
    const path = railPath(w, w.index(2, 4), w.index(18, 22));
    expect(path).not.toBeNull();
    if (!path) return;
    let last = pointOnTrack(w, path, 0);
    for (let s = 0.05; s <= path.length - 1; s += 0.05) {
      const p = pointOnTrack(w, path, s);
      expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThan(0.12);
      last = p;
    }
  });

  it('crosses an expressway at right angles on an overpass, never along it; trains ride the deck raised', () => {
    const { w, city } = flat();
    applyRoad(city, planRoad(w, roadPath({ x: 12, y: 2 }, { x: 12, y: 30 }, true), RoadType.Expressway), RoadType.Expressway);
    expect(rail(city, { x: 4, y: 16 }, { x: 20, y: 16 }).ok).toBe(true);
    expect(w.road[w.index(12, 16)]).toBe(RoadType.Expressway);
    expect(w.rail[w.index(12, 16)]).toBe(Rail.Track);
    const along = planRail(w, roadPath({ x: 12, y: 20 }, { x: 12, y: 26 }, true));
    expect(along.tiles.filter((t) => t.valid)).toHaveLength(0);
    applyPlace(city, planPlace(w, 'train_station', 5, 14), 0);
    applyPlace(city, planPlace(w, 'train_station', 18, 14), 0);
    const sim = new Simulation(city);
    sim.worldChanged({ roads: true });
    const ids = [...w.buildings.values()].filter((b) => b.def === 'train_station').map((b) => b.id);
    expect(ids).toHaveLength(2);
    sim.commute.railTrips = [{ from: ids[0], to: ids[1], riders: 50 }];
    sim.trains.refresh();
    let raised = false;
    for (let k = 0; k < 80 && !raised; k++) {
      sim.trains.onFrame(0.25);
      raised = sim.trains.poses().some((c) => c.raised);
    }
    expect(raised).toBe(true);
  });
});
