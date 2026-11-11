import { describe, expect, it } from 'vitest';
import { applyClear, planClear } from '../src/sim/commands';
import { serviceBit } from '../src/sim/systems/coverage';
import { cityStats } from '../src/sim/systems/population';
import { updateUtilities } from '../src/sim/systems/utilities';
import { street } from './support/street';

/**
 * Service coverage (sim/systems/coverage.ts) and utilities (sim/systems/utilities.ts): the
 * edges where a building is or isn't served, and what happens when supply runs out or goes away.
 */

describe('service coverage', () => {
  it('reaches exactly its radius from the footprint centre', () => {
    const t = street();
    t.place('police_station', 20, 9); // centre (20.5, 9.5), radius 14
    const inside = t.place('cottage', 33, 11); // dx 13, dy 2: 13.2 tiles
    const outside = t.place('cottage', 34, 11); // dx 14, dy 2: 14.1 tiles
    t.refresh();
    expect(inside.services & serviceBit('police')).not.toBe(0);
    expect(outside.services & serviceBit('police')).toBe(0);
  });

  it('a station still under construction, or cut off from the roads, covers nobody', () => {
    const t = street();
    const st = t.place('fire_station', 20, 9);
    const home = t.place('cottage', 22, 11);
    st.construction = 2;
    t.refresh();
    expect(home.services & serviceBit('fire')).toBe(0);
    st.construction = 0;
    t.refresh();
    expect(home.services & serviceBit('fire')).not.toBe(0);
    // Remove the street: no entrance, no service.
    applyClear(t.city, planClear(t.world, [...Array(61).keys()].map((k) => ({ x: 2 + k, y: 10 }))));
    t.refresh();
    expect(st.entrance).toBe(-1);
    expect(home.services & serviceBit('fire')).toBe(0);
  });

  it('bulldozing a station takes its coverage away straight after the edit', () => {
    const t = street();
    const st = t.place('clinic', 20, 9);
    const home = t.place('cottage', 22, 11);
    t.refresh();
    expect(home.services & serviceBit('health')).not.toBe(0);
    applyClear(t.city, planClear(t.world, [{ x: st.x, y: st.y }]));
    t.refresh(false);
    expect(home.services & serviceBit('health')).toBe(0);
  });

  it('a hospital or trauma centre counts as a clinic; the trauma centre counts as a hospital', () => {
    for (const id of ['hospital', 'trauma_centre'] as const) {
      const t = street();
      t.place(id, 20, 7);
      const home = t.place('cottage', 26, 11);
      t.refresh();
      expect(home.services & serviceBit('hospital'), id).not.toBe(0);
      expect(home.services & serviceBit('health'), id).not.toBe(0);
    }
  });

  it('wider care research stretches clinic reach by a quarter', () => {
    const t = street();
    t.place('clinic', 20, 9); // radius 12 → 15
    const home = t.place('cottage', 34, 11); // 14.1 tiles away
    t.refresh();
    expect(home.services & serviceBit('health')).toBe(0);
    t.city.research.done = 4; // cleanCoal, garbageTrucks, construction, wideCare
    t.refresh();
    expect(home.services & serviceBit('health')).not.toBe(0);
  });
});

describe('water', () => {
  it('reaches 14 tiles from the tower, whatever road the building is on', () => {
    const t = street();
    t.road(2, 22, 60, 22); // a second street, not joined to the first
    t.place('water_tower', 20, 20); // on the second street, centre (20.5, 20.5)
    const otherIsland = t.place('cottage', 20, 12); // on the first street, 8 tiles away
    const edge = t.place('cottage', 31, 12); // dx 11, dy 8: 13.6 tiles
    const tooFar = t.place('cottage', 32, 12); // dx 12, dy 8: 14.4 tiles
    t.refresh();
    const r = updateUtilities(t.world);
    expect(otherIsland.watered).toBe(true);
    expect(edge.watered).toBe(true);
    expect(tooFar.watered).toBe(false);
    expect(r.water.short).toBeGreaterThanOrEqual(1);
  });

  it('a tower serves only up to its capacity; the next tower in reach takes over', () => {
    const t = street();
    t.place('water_tower', 20, 9); // 2,500
    // Ten condo towers (260 each), all within 14 tiles of the tower.
    const condos = [8, 10, 12, 14, 16, 18, 22, 24, 26, 28].map((x) => t.place('condo_tower', x, 11));
    t.refresh();
    expect(condos.filter((c) => c.watered)).toHaveLength(9);
    t.place('water_tower', 21, 9);
    t.refresh();
    expect(condos.every((c) => c.watered)).toBe(true);
  });

  it('civic buildings never need water', () => {
    const t = street();
    const school = t.place('school', 20, 8);
    t.refresh();
    expect(school.watered).toBe(true);
  });
});

describe('power', () => {
  it('without substations, a plant powers only its own road island', () => {
    const t = street();
    t.road(2, 40, 60, 40);
    t.place('power_plant', 30, 41);
    t.place('water_tower', 20, 9);
    t.place('water_tower', 20, 39);
    const here = t.place('cottage', 20, 41);
    const there = t.place('cottage', 20, 11);
    t.refresh();
    expect(here.powered).toBe(true);
    expect(there.powered).toBe(false);
  });

  it('with a substation the grid is shared, but only buildings within its reach get power', () => {
    const t = street();
    t.road(2, 40, 60, 40);
    t.place('power_plant', 30, 41);
    t.place('substation', 20, 9); // reach 12
    const near = t.place('cottage', 25, 11);
    const outside = t.place('cottage', 45, 11);
    const plantSide = t.place('cottage', 30, 39);
    t.refresh();
    expect(near.powered).toBe(true);
    expect(outside.powered).toBe(false);
    // Design risk (energy.md): the first substation also cuts power to every building outside
    // any substation's reach, even ones beside the plant that were powered before.
    expect(plantSide.powered).toBe(false);
  });

  it('a failed plant makes nothing until it is repaired', () => {
    const t = street();
    const plant = t.place('power_plant', 30, 8);
    const home = t.place('cottage', 20, 11);
    plant.repairDays = 3;
    plant.condition = 0;
    t.refresh();
    expect(home.powered).toBe(false);
  });

  it('homes without power or water empty out over the days; restoring both refills them', () => {
    const t = street();
    const plant = t.place('power_plant', 30, 8);
    t.place('water_tower', 22, 9);
    for (let x = 4; x < 20; x++) t.place('walkup', x, 11);
    t.place('factory', 40, 12);
    t.refresh();
    t.sim.runDays(30);
    const full = cityStats(t.world).population;
    expect(full).toBeGreaterThan(100);
    applyClear(t.city, planClear(t.world, [{ x: plant.x, y: plant.y }]));
    t.refresh(false);
    t.sim.runDays(40);
    expect(cityStats(t.world).population).toBe(0);
    t.place('power_plant', 30, 8);
    t.refresh(false);
    t.sim.runDays(40);
    expect(cityStats(t.world).population).toBeGreaterThan(full * 0.5);
  });
});
