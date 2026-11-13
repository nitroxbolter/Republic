import { describe, expect, it } from 'vitest';
import { applyRoad, planRoad } from '../src/sim/commands';
import { roadPath, RoadType } from '../src/sim/roads';
import { COMMUTE, speedFactor } from '../src/sim/systems/commute';
import { TRAFFIC } from '../src/sim/systems/traffic';
import { jamTown, runTraffic } from './support/jamTown';

const maxCongestion = (c: Float32Array) => c.reduce((m, v) => Math.max(m, v), 0);

describe('commute model', () => {
  it('slows traffic with congestion, never to a stop', () => {
    expect(speedFactor(0.3)).toBe(1);
    expect(speedFactor(1)).toBeCloseTo(0.87, 2);
    expect(speedFactor(2)).toBeCloseTo(0.43, 2);
    expect(speedFactor(50)).toBe(0.2);
  });

  it('finds the overloaded connector road and gives every home a commute time', () => {
    const sim = jamTown();
    const c = sim.commute;
    expect(c.report.commuters).toBeGreaterThan(500);
    // More residents can now live without jobs, so fewer commute; the connector still carries a significant flow.
    expect(c.congestion[sim.world.index(40, 30)]).toBeGreaterThan(0.25);
    expect(c.report.jammedTiles).toBeGreaterThan(0);
    for (const b of sim.world.buildings.values()) {
      if (b.def === 'cottage' && b.occupants > 0) expect(c.commuteMinutes.get(b.id)).toBeGreaterThan(0);
    }
    expect(c.trips.length).toBeGreaterThan(0);
    expect(c.trips.length).toBeLessThanOrEqual(COMMUTE.maxTrips);
  });

  it('a second, faster route relieves the connector', () => {
    const sim = jamTown();
    const connector = sim.world.index(40, 30);
    const before = sim.commute.congestion[connector];
    // A highway down the west side of town (clear of the zones), linked to both main roads.
    const hw = (ax: number, ay: number, bx: number, by: number) =>
      applyRoad(sim.city, planRoad(sim.world, roadPath({ x: ax, y: ay }, { x: bx, y: by }, true), RoadType.Highway), RoadType.Highway);
    hw(2, 10, 2, 50);
    hw(2, 10, 4, 10);
    hw(2, 50, 4, 50);
    sim.worldChanged({ roads: true });
    for (let d = 0; d < 10; d++) sim.day();
    expect(sim.commute.congestion[connector]).toBeLessThan(before * 0.7);
    expect(maxCongestion(sim.commute.congestion)).toBeGreaterThan(0);
  });
});

describe('visible traffic (gridlock regression)', () => {
  it('keeps flowing at rush hour on the town that used to gridlock', () => {
    const sim = jamTown();
    let roadTiles = 0;
    for (let i = 0; i < sim.world.road.length; i++) if (sim.world.road[i] !== RoadType.None) roadTiles++;
    for (let k = 0; k < 3; k++) {
      const f = runTraffic(sim, 40);
      expect(f.cars).toBeLessThanOrEqual(Math.ceil(roadTiles * TRAFFIC.carsPerRoadTile));
      expect(f.stopped).toBeLessThan(0.15);
    }
  });
});
