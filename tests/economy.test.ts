import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/shared/balance';
import { Lifestyle } from '../src/sim/buildings/catalog';
import { applyPlace, planPlace } from '../src/sim/commands';
import { Stage } from '../src/sim/stages';
import { collectBudget, monthlyBudget } from '../src/sim/systems/budget';
import { garbageDay } from '../src/sim/systems/garbage';
import { zoneDemand } from '../src/sim/systems/growth';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { presetSettings } from '../src/sim/terrain/presets';
import { street } from './support/street';

/** Budget, garbage and shop demand: money in, money out, and what the city makes. */

describe('budget', () => {
  /** A street of full walk-ups and a workshop, for a known tax base. */
  function taxed() {
    const t = street();
    const homes = [4, 5, 6, 7].map((x) => t.place('walkup', x, 11));
    const shop = t.place('corner_shop', 12, 11);
    t.place('power_plant', 30, 8);
    t.place('water_tower', 20, 9);
    t.refresh();
    for (const h of homes) h.occupants = 20;
    shop.occupants = 4;
    return { t, homes, shop };
  }

  it('taxes scale with the rate: 0% collects nothing, twice the base rate collects twice as much', () => {
    const { t } = taxed();
    const base = monthlyBudget(t.world, BALANCE.baseTaxRate).income;
    expect(base).toBe(Math.round(80 * BALANCE.taxPerResident + 4 * BALANCE.taxPerWorker));
    expect(monthlyBudget(t.world, 0).income).toBe(0);
    expect(monthlyBudget(t.world, BALANCE.baseTaxRate * 2).income).toBe(base * 2);
  });

  it('better-off homes pay more, construction sites and abandoned homes pay nothing', () => {
    const { t, homes } = taxed();
    const base = monthlyBudget(t.world).income;
    homes[0].lifestyle = Lifestyle.Prosperous;
    const richer = monthlyBudget(t.world).income;
    expect(richer - base).toBe(Math.round(20 * BALANCE.taxPerResident * (BALANCE.lifestyleTax[Lifestyle.Prosperous] - 1)));
    homes[0].lifestyle = Lifestyle.Basic;
    homes[1].abandoned = true;
    homes[2].construction = 2;
    expect(monthlyBudget(t.world).income).toBe(base - Math.round(40 * BALANCE.taxPerResident));
  });

  it('upkeep: every road tile, every bridge tile at the bridge rate, every civic building by group', () => {
    const t = street();
    const roads = monthlyBudget(t.world).breakdown.roads;
    expect(roads).toBe(Math.round(61 * BALANCE.roadUpkeep));
    t.place('police_station', 20, 9);
    t.place('water_tower', 22, 9);
    t.place('park', 24, 9);
    const r = monthlyBudget(t.world);
    expect(r.breakdown.services).toBe(60);
    expect(r.breakdown.utilities).toBeGreaterThan(0);
    expect(r.breakdown.parks).toBeGreaterThan(0);
    expect(r.expenses).toBe(r.breakdown.roads + r.breakdown.services + r.breakdown.utilities + r.breakdown.parks);
  });

  it('a city can go into debt; it then cannot build, but keeps running', () => {
    const t = street();
    t.city.funds = 100; // after the street is built
    for (let k = 0; k < 4; k++) collectBudget(t.city); // road upkeep with no taxes
    expect(t.city.funds).toBeLessThan(100);
    t.city.funds = -500;
    const r = applyPlace(t.city, planPlace(t.world, 'police_station', 20, 9), 0);
    expect(r.ok).toBe(false);
    t.sim.runDays(30);
    expect(Number.isFinite(t.city.funds)).toBe(true);
  });
});

describe('garbage', () => {
  function bins(stage: Stage = Stage.Village) {
    const t = street();
    t.city.stage = stage;
    const home = t.place('walkup', 20, 11);
    t.place('power_plant', 30, 8);
    t.place('water_tower', 22, 9);
    t.refresh();
    home.occupants = 20;
    return { t, home };
  }

  it('nothing piles up before the Village stage', () => {
    const { t, home } = bins(Stage.Hamlet);
    garbageDay(t.city);
    expect(home.garbage).toBe(0);
  });

  it('piles up each day, but never past garbageMaxDays of output', () => {
    const { t, home } = bins();
    for (let d = 0; d < BALANCE.garbageMaxDays + 20; d++) garbageDay(t.city);
    expect(home.garbage).toBeCloseTo(20 * BALANCE.garbagePerResident * BALANCE.garbageMaxDays);
  });

  it('a landfill on another road island does not collect, however close', () => {
    const { t, home } = bins();
    t.road(2, 16, 60, 16); // a separate street
    t.place('landfill', 20, 14); // 3×3, on the other street
    t.refresh();
    garbageDay(t.city);
    expect(home.garbage).toBeGreaterThan(0);
  });

  it('a landfill in reach on the same roads empties the bins; abandoned buildings make none', () => {
    const { t, home } = bins();
    t.place('landfill', 40, 7);
    t.refresh();
    for (let d = 0; d < 5; d++) garbageDay(t.city);
    expect(home.garbage).toBe(0);
    home.abandoned = true;
    const r = garbageDay(t.city);
    expect(r.made).toBe(0);
  });

  it('recycling centres sell their tons at month end, then count afresh', () => {
    const { t } = bins();
    const centre = t.place('recycling_centre', 40, 8);
    t.refresh();
    for (let d = 0; d < 10; d++) garbageDay(t.city);
    expect(centre.filled).toBeGreaterThan(0);
    expect(monthlyBudget(t.world).recycling).toBe(Math.round(centre.filled * 0.4 * BALANCE.recyclePrice));
    t.sim.garbage.onMonth();
    expect(centre.filled).toBe(0);
  });

  it('efficient garbage trucks research collects 30% more a day', () => {
    const day = (done: number) => {
      const t = street();
      t.city.stage = Stage.Village;
      t.city.research.done = done;
      t.place('power_plant', 30, 8);
      t.place('water_tower', 22, 9);
      // All within the landfill's 22-tile reach, holding far more than a day's trucks.
      const homes = [30, 32, 34, 36, 38, 40, 42, 44, 48, 50].map((x) => t.place('condo_tower', x, 12));
      const landfill = t.place('landfill', 46, 7);
      t.refresh();
      for (const h of homes) {
        h.occupants = 260;
        h.garbage = 100; // far more than one day's trucks
      }
      garbageDay(t.city);
      return landfill.filled;
    };
    expect(day(2)).toBeCloseTo(day(0) * 1.3);
  });
});

describe('shops and demand', () => {
  it('shop demand rises with homes; a high tax rate holds every zone back', () => {
    const t = street();
    const before = zoneDemand(t.world).c;
    for (let x = 4; x < 20; x++) t.place('walkup', x, 11);
    t.refresh();
    expect(zoneDemand(t.world).c).toBeGreaterThan(before);
    const low = zoneDemand(t.world, BALANCE.baseTaxRate);
    const high = zoneDemand(t.world, BALANCE.maxTaxRate);
    // Bars already pinned at −1 can't fall further; the rest must.
    for (const k of ['r', 'c', 'o', 'i'] as const) expect(high[k], k).toBeLessThanOrEqual(low[k]);
    const sum = (d: typeof low) => d.r + d.c + d.o + d.i;
    expect(sum(high)).toBeLessThan(sum(low));
  });

  it('demand never leaves −1..1, even in extreme cities', () => {
    const t = street();
    expect(Object.values(zoneDemand(t.world, 0)).every((v) => v >= -1 && v <= 1)).toBe(true);
    for (let x = 4; x < 60; x += 2) t.place('office_tower', x, 12);
    t.refresh();
    expect(Object.values(zoneDemand(t.world, BALANCE.maxTaxRate)).every((v) => v >= -1 && v <= 1)).toBe(true);
  });

  it('a shop with no workers and no customers is unhappy about both', () => {
    const t = street();
    t.place('power_plant', 30, 8);
    t.place('water_tower', 22, 9);
    const shop = t.place('corner_shop', 20, 11);
    t.refresh();
    t.sim.needs.score();
    const n = t.sim.needs.byBuilding.get(shop.id);
    expect(n?.scores.workers).toBe(0);
    expect(n?.scores.customers).toBe(0);
    expect(n && n.happiness).toBeLessThan(BALANCE.complainLine);
  });

  it('shops near homes with people find customers and workers', () => {
    const t = street();
    t.place('power_plant', 30, 8);
    t.place('water_tower', 22, 9);
    t.place('water_tower', 8, 9);
    for (let x = 2; x < 18; x++) t.place('walkup', x, 11);
    const shop = t.place('corner_shop', 20, 11);
    t.refresh();
    t.sim.runDays(30);
    const n = t.sim.needs.byBuilding.get(shop.id);
    expect(n?.scores.customers).toBeGreaterThan(0.5);
    expect(n?.scores.workers).toBeGreaterThan(0.5);
  });
});

describe('garbage survives a save exactly', () => {
  it('keeps fractional tons in bins and landfills, so a loaded city continues the same', () => {
    const t = street();
    t.city.stage = Stage.Village;
    const home = t.place('walkup', 20, 11);
    const landfill = t.place('landfill', 40, 7);
    home.garbage = 1.2345;
    landfill.filled = 987.654;
    const back = deserialize(parseSave(JSON.parse(JSON.stringify(serialize(t.city, presetSettings('plains', 5, 64), 'G')))));
    const at = (x: number, y: number) => back.world.buildings.get(back.world.building[back.world.index(x, y)]);
    expect(at(home.x, home.y)?.garbage).toBe(1.2345);
    expect(at(landfill.x, landfill.y)?.filled).toBe(987.654);
  });
});
