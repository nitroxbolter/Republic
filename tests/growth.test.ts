import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/shared/balance';
import { mulberry32 } from '../src/shared/rng';
import { BUILDINGS, chooseBuilding, type BuildingDef } from '../src/sim/buildings/catalog';
import { City } from '../src/sim/City';
import { applyClear, applyMove, applyPlace, applyRoad, applyZone, planClear, planMove, planPlace, planRoad, planZone } from '../src/sim/commands';
import { diagnoseLot, diagnoseZones, explainDemand, growDay, zoneDemand } from '../src/sim/systems/growth';
import { findEntrance } from '../src/sim/systems/access';
import { cityStats, simulateDay } from '../src/sim/systems/population';
import { rectTiles, roadPath, RoadType } from '../src/sim/roads';
import { Terrain } from '../src/sim/terrain/types';
import { World } from '../src/sim/World';
import { zoneOf, ZoneType, type ZoneTypeId } from '../src/sim/zones';
import { refreshCity } from '../src/sim/core/Simulation';
import { closeDemographicMonth } from '../src/sim/systems/demography';
import { collectBudget, monthlyBudget } from '../src/sim/systems/budget';

function town(size = 24) {
  const w = new World(size, size, 0);
  w.terrain.fill(Terrain.Grass);
  const city = new City(w, 1_000_000);
  // A road along y = 8 across the map.
  applyRoad(city, planRoad(w, roadPath({ x: 0, y: 8 }, { x: size - 1, y: 8 }, true), RoadType.Road), RoadType.Road);
  return { w, city };
}

const zone = (city: City, x0: number, y0: number, x1: number, y1: number, z: ZoneTypeId) =>
  applyZone(city, planZone(city.world, rectTiles({ x: x0, y: y0 }, { x: x1, y: y1 }), z), z);

/** Run the daily loop the way Game does: growth, access, services, then population. */
function runDays(w: World, days: number, seed = 1) {
  const rng = mulberry32(seed);
  for (let d = 0; d < days; d++) {
    growDay(w, rng);
    refreshCity(w);
    simulateDay(w);
  }
}

/**
 * Give a 32-wide town power, water and all four services: a second road along y = 4 (joined to
 * the main road at x = 31) lined with power plants, water towers, police, fire, clinic and school.
 */
function serve(city: City) {
  const w = city.world;
  const road = (ax: number, ay: number, bx: number, by: number) =>
    applyRoad(city, planRoad(w, roadPath({ x: ax, y: ay }, { x: bx, y: by }, true), RoadType.Road), RoadType.Road);
  road(0, 4, 31, 4);
  road(31, 4, 31, 8);
  const place = (id: Parameters<typeof planPlace>[1], x: number, y: number) => applyPlace(city, planPlace(w, id, x, y), 0);
  for (const x of [0, 2, 4, 6]) place('power_plant', x, 2);
  for (const x of [8, 9, 10, 11, 12]) place('water_tower', x, 3);
  place('police_station', 14, 3);
  place('fire_station', 15, 3);
  place('clinic', 16, 3);
  place('school', 17, 2);
}

describe('zoning', () => {
  it('zones land at a per-tile cost, skipping roads, water and tiles already zoned', () => {
    const { w, city } = town();
    w.terrain[w.index(3, 3)] = Terrain.DeepWater;
    const region = rectTiles({ x: 2, y: 2 }, { x: 4, y: 8 }); // 3×7, the last row is road
    const plan = planZone(w, region, ZoneType.Residential);
    expect(plan.count).toBe(3 * 6 - 1);
    expect(plan.cost).toBe(plan.count * BALANCE.zoneCost);

    const funds = city.funds;
    expect(applyZone(city, plan, ZoneType.Residential).ok).toBe(true);
    expect(city.funds).toBe(funds - plan.cost);
    expect(w.zone[w.index(2, 2)]).toBe(ZoneType.Residential);
    expect(w.zone[w.index(3, 3)]).toBe(ZoneType.None);
    expect(planZone(w, region, ZoneType.Residential).count).toBe(0);
  });

  it('dezoning is free; roads and placed buildings clear the zone under them', () => {
    const { w, city } = town();
    zone(city, 2, 2, 6, 7, ZoneType.Commercial);
    const dezone = planZone(w, rectTiles({ x: 2, y: 2 }, { x: 2, y: 7 }), ZoneType.None);
    expect(dezone.count).toBe(6);
    expect(dezone.cost).toBe(0);

    applyRoad(city, planRoad(w, roadPath({ x: 4, y: 2 }, { x: 4, y: 7 }, true), RoadType.Road), RoadType.Road);
    expect(w.zone[w.index(4, 5)]).toBe(ZoneType.None);
    applyPlace(city, planPlace(w, 'park', 6, 6), 0);
    expect(w.zone[w.index(6, 6)]).toBe(ZoneType.None);
    expect(planZone(w, [{ x: 6, y: 6 }], ZoneType.Commercial).count).toBe(0); // placed buildings block zoning
  });
});

describe('road access range', () => {
  it('finds the nearest land road within the range', () => {
    const { w } = town();
    expect(findEntrance(w, 5, 7, 1, 1, 3)).toBe(w.index(5, 8));
    expect(findEntrance(w, 5, 5, 1, 1, 3)).toBe(w.index(5, 8));
    expect(findEntrance(w, 5, 4, 1, 1, 3)).toBe(-1);
  });
});

describe('growth', () => {
  it('explains the first blocker of each vacant shop lot and does not count construction as vacant', () => {
    const { w, city } = town();
    zone(city, 3, 3, 3, 3, ZoneType.Commercial);
    zone(city, 4, 7, 4, 7, ZoneType.Commercial);
    expect(diagnoseLot(city, 3, 3)?.reason).toBe('noRoad');
    expect(diagnoseLot(city, 4, 7)?.reason).toBe('queued');
    expect(diagnoseZones(city).c).toMatchObject({ noRoad: 1, queued: 1 });

    city.needsMaterials = true;
    city.materials = 0;
    expect(diagnoseLot(city, 4, 7, BALANCE.materialsImportPerDay)?.reason).toBe('materials');
    expect(diagnoseZones(city, BALANCE.materialsImportPerDay).c.materials).toBe(1);

    city.needsMaterials = false;
    growDay(w, () => 0);
    expect(diagnoseLot(city, 4, 7)).toBeNull();
    expect(diagnoseZones(city).c.queued).toBe(0);
  });

  it('identifies shop oversupply on an accessible vacant lot', () => {
    const { w, city } = town();
    zone(city, 2, 7, 9, 7, ZoneType.Commercial);
    growDay(w, () => 0);
    expect(zoneDemand(w, city.taxRate, city).c).toBeLessThanOrEqual(0);
    expect(diagnoseLot(city, 9, 7)?.reason).toBe('noDemand');
    expect(diagnoseZones(city).c.noDemand).toBeGreaterThan(0);
  });

  it('a new town wants homes first, and homes create demand for jobs', () => {
    const { w } = town();
    const d0 = zoneDemand(w);
    expect(d0.r).toBeGreaterThan(0);
    expect(d0.c).toBeGreaterThan(0);
    expect(d0.i).toBeGreaterThan(0);
  });

  it('housing subsidy starts residential construction after ordinary demand is satisfied', () => {
    const { w, city } = town();
    for (let x = 2; x < 10; x++) w.addBuilding({ def: 'family_house', x, y: 7, variant: 0, occupants: 0 }, 1, 1);
    zone(city, 10, 7, 16, 7, ZoneType.Residential);
    expect(zoneDemand(w, city.taxRate, city).r).toBeLessThanOrEqual(0);
    expect(diagnoseLot(city, 10, 7)?.reason).toBe('noDemand');

    city.demography.housingSubsidy = BALANCE.demographicMaxHousingSubsidy;
    expect(zoneDemand(w, city.taxRate, city).r).toBeGreaterThan(0);
    city.demography.permitLimits.r = 0;
    expect(diagnoseLot(city, 10, 7)?.reason).toBe('permitLimit');
    city.demography.permitLimits.r = 1;
    const first = growDay(w, () => 0, city.taxRate, undefined, city);
    expect(first.started).toHaveLength(1);
    expect(city.demography.permitUsed.r).toBe(1);
    const started = w.buildings.get(first.started[0]);
    if (!started) throw new Error('expected a residential construction site');
    const grant = Math.round(BUILDINGS[started.def].cost * city.demography.housingSubsidy);
    expect(city.demography.monthConstructionGrants).toBe(grant);
    const forecast = monthlyBudget(w, city.taxRate, city.pensionPerSenior, city.minimumWage, city.costTaxRates, city.incomeTaxRate, city.society, city);
    expect(forecast.breakdown.constructionGrants).toBe(grant);
    city.demography.monthConstructionGrants = 0;
    const withoutGrant = monthlyBudget(w, city.taxRate, city.pensionPerSenior, city.minimumWage, city.costTaxRates, city.incomeTaxRate, city.society, city);
    expect(forecast.expenses - withoutGrant.expenses).toBe(grant);
    city.demography.monthConstructionGrants = grant;
    expect(explainDemand(w, city.taxRate, city).r).toMatch(/subsídio habitacional/);
    expect(growDay(w, () => 0, city.taxRate, undefined, city).started).toHaveLength(0);
    city.collectsTaxes = true;
    const funds = city.funds;
    const closed = collectBudget(city);
    expect(closed.cashNet).toBe(city.funds - funds);
    expect(closed.cashNet).toBe(-closed.expenses);
    expect(closed.breakdown.constructionGrants).toBe(grant);
    closeDemographicMonth(city);
    expect(city.demography.monthConstructionGrants).toBe(0);
  });

  it('zoned tiles near a road grow construction sites that finish after constructionDays', () => {
    const { w, city } = town();
    zone(city, 2, 5, 9, 7, ZoneType.Residential); // within 3 of the road
    zone(city, 2, 1, 9, 3, ZoneType.Residential); // too far
    const rng = mulberry32(7);
    const day1 = growDay(w, rng);
    expect(day1.started.length).toBe(BALANCE.growthPerDay);
    for (const id of day1.started) {
      const b = w.buildings.get(id)!;
      expect(b.grown).toBe(true);
      expect(b.construction).toBe(BALANCE.constructionDays);
      expect(b.y).toBeGreaterThanOrEqual(5);
      expect(BUILDINGS[b.def].level).toBe(1);
    }
    // Sites don't count as population until they finish.
    refreshCity(w);
    simulateDay(w);
    expect(cityStats(w).housing).toBe(0);

    const finished: number[] = [];
    for (let d = 0; d < BALANCE.constructionDays; d++) finished.push(...growDay(w, rng).completed);
    expect(finished).toEqual(expect.arrayContaining([...day1.started]));
    for (const id of day1.started) expect(w.buildings.get(id)?.construction).toBe(0);
  });

  it('a serviced town grows, levels up and merges lots over time', () => {
    const { w, city } = town(32);
    serve(city);
    // Towers (level 3) come from high density; houses top out at level 2.
    zone(city, 0, 5, 15, 7, ZoneType.ResidentialHigh);
    zone(city, 16, 5, 31, 7, ZoneType.Residential);
    zone(city, 0, 9, 15, 11, ZoneType.Commercial);
    zone(city, 16, 9, 31, 11, ZoneType.Industrial);
    runDays(w, 400);

    const stats = cityStats(w);
    expect(stats.population).toBeGreaterThan(BALANCE.levelPopulation[3]);
    const levels = [...w.buildings.values()].map((b) => BUILDINGS[b.def].level);
    expect(Math.max(...levels)).toBe(3);
    expect([...w.buildings.values()].some((b) => BUILDINGS[b.def].size.w === 2)).toBe(true);
    // Every grown building sits on its own zone.
    for (const b of w.buildings.values()) {
      const d: BuildingDef = BUILDINGS[b.def];
      if (d.zone === null || d.density === null) continue;
      expect(w.zone[w.index(b.x, b.y)]).toBe(zoneOf(d.zone, d.density));
    }
  });

  it('apartment and office zones grow high-density buildings from the start', () => {
    const { w, city } = town(32);
    serve(city);
    zone(city, 0, 5, 15, 7, ZoneType.ResidentialHigh);
    zone(city, 16, 5, 31, 7, ZoneType.CommercialHigh);
    zone(city, 0, 9, 31, 11, ZoneType.Industrial);
    runDays(w, 30);
    const defs = [...w.buildings.values()].filter((b) => b.grown).map((b) => b.def);
    expect(defs).toContain('walkup');
    expect(defs.some((d) => d === 'cottage' || d === 'family_house' || d === 'corner_shop' || d === 'cafe')).toBe(false);
  });

  it('homes without power or water stay empty', () => {
    const { w, city } = town();
    zone(city, 0, 5, 23, 7, ZoneType.Residential);
    runDays(w, 30);
    expect(w.buildings.size).toBeGreaterThan(0);
    expect(cityStats(w).population).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const grow = () => {
      const { w, city } = town();
      zone(city, 0, 5, 23, 7, ZoneType.Residential);
      zone(city, 0, 9, 23, 10, ZoneType.Industrial);
      runDays(w, 120, 99);
      return [...w.buildings.values()].map((b) => `${b.def}@${b.x},${b.y}`).join(' ');
    };
    expect(grow()).toBe(grow());
  });

  it('Clear removes a grown building and its zone (there is no separate Dezone)', () => {
    const { w, city } = town();
    zone(city, 2, 7, 2, 7, ZoneType.Residential);
    runDays(w, 2);
    const b = [...w.buildings.values()][0];
    expect(b).toBeDefined();
    applyClear(city, planClear(w, [{ x: b.x, y: b.y }]));
    expect(w.buildings.size).toBe(0);
    expect(w.zone[w.index(2, 7)]).toBe(ZoneType.None);
    runDays(w, 4);
    expect(w.buildings.size).toBe(0);
  });

  it('chooseBuilding picks from the matching zone, level and size', () => {
    const rng = mulberry32(3);
    expect(['cottage', 'family_house']).toContain(chooseBuilding('R', 'low', 1, 1, rng));
    expect(chooseBuilding('I', 'low', 2, 1, rng)).toBeNull();
    expect(chooseBuilding('I', 'low', 2, 2, rng)).toBe('warehouse');
    expect(chooseBuilding('R', 'high', 2, 1, rng)).toBe('walkup');
    expect(chooseBuilding('C', 'high', 2, 1, rng)).toBe('small_office');
  });
});

describe('demand explanations (master plan §6.4)', () => {
  it('office oversupply can pause construction independently of available workers', () => {
    const w = new World(24, 12, 3);
    w.terrain.fill(Terrain.Grass);
    const city = new City(w, 1e9);
    applyRoad(city, planRoad(w, roadPath({ x: 0, y: 5 }, { x: 23, y: 5 }, true), RoadType.Road), RoadType.Road);
    for (let x = 0; x < 4; x++) applyPlace(city, planPlace(w, 'cottage', x, 4), 0);
    for (let x = 6; x < 10; x++) applyPlace(city, planPlace(w, 'small_office', x, 4), 0);
    applyZone(city, planZone(w, rectTiles({ x: 12, y: 6 }, { x: 15, y: 6 }), ZoneType.CommercialHigh), ZoneType.CommercialHigh);
    refreshCity(w);
    // Four offices (160 jobs) for four cottages (12 residents): far more jobs than workers.
    expect(zoneDemand(w).o).toBeLessThan(0);
    expect(zoneDemand(w).i).toBeLessThan(0); // industry doesn't build jobs nobody can staff either
    expect(explainDemand(w).o).toMatch(/já atendem à procura atual/);
    expect(zoneDemand(w).r).toBeGreaterThan(0); // and homes are wanted
    const g = growDay(w, mulberry32(1));
    expect(g.waiting.o).toBe(4);
    expect(g.started).toHaveLength(0);
  });

  it('starts houses and apartments without jobs when residents need housing', () => {
    const { w, city } = town();
    for (let x = 1; x <= 5; x++) {
      applyPlace(city, planPlace(w, 'walkup', x, 4), 0);
      const b = [...w.buildings.values()].at(-1)!;
      b.occupants = 30;
    }
    zone(city, 8, 7, 8, 7, ZoneType.Residential);
    zone(city, 9, 7, 9, 7, ZoneType.ResidentialHigh);
    expect(cityStats(w).workers).toBe(0);
    expect(zoneDemand(w, city.taxRate, city).r).toBeGreaterThan(0);
    expect(diagnoseLot(city, 8, 7)?.reason).toBe('queued');
    expect(diagnoseLot(city, 9, 7)?.reason).toBe('queued');
    const result = growDay(w, mulberry32(2), city.taxRate, undefined, city);
    expect(result.started).toHaveLength(2);
    expect(result.started.map((id) => BUILDINGS[w.buildings.get(id)!.def].density).sort()).toEqual(['high', 'low']);
  });

  it('starts an office with no existing residents or workers', () => {
    const { w, city } = town();
    zone(city, 9, 7, 9, 7, ZoneType.CommercialHigh);
    expect(cityStats(w).workers).toBe(0);
    expect(diagnoseLot(city, 9, 7)?.reason).toBe('queued');
    const result = growDay(w, mulberry32(2), city.taxRate, undefined, city);
    expect(result.started).toHaveLength(1);
    expect(BUILDINGS[w.buildings.get(result.started[0])!.def].density).toBe('high');
  });
});

describe('moving buildings in a growing town', () => {
  /** Every footprint tile belongs to its building, and every owned tile to a live building. */
  function footprintsConsistent(w: World): string | null {
    const owned = new Map<number, number>();
    for (const b of w.buildings.values()) {
      const { w: bw, h: bh } = BUILDINGS[b.def].size;
      for (let y = b.y; y < b.y + bh; y++) {
        for (let x = b.x; x < b.x + bw; x++) {
          const at = w.building[w.index(x, y)];
          if (at !== b.id) return `${b.def}#${b.id} at ${x},${y} but tile says ${at}`;
          owned.set(w.index(x, y), b.id);
        }
      }
    }
    for (let i = 0; i < w.building.length; i++) if (w.building[i] !== -1 && owned.get(i) !== w.building[i]) return `stray tile ${i} → ${w.building[i]}`;
    return null;
  }

  it('nothing grows over a moved building, wherever it goes', () => {
    const { w, city } = town(32);
    serve(city);
    zone(city, 0, 9, 31, 11, ZoneType.Residential);
    zone(city, 0, 5, 13, 7, ZoneType.Commercial);
    runDays(w, 40);
    const rng = mulberry32(7);
    for (let round = 0; round < 30; round++) {
      // Move a random finished building to a random spot it can go (often a zoned lot).
      const done = [...w.buildings.values()].filter((b) => b.construction === 0);
      const b = done[Math.floor(rng() * done.length)];
      for (let k = 0; k < 40; k++) {
        const plan = planMove(w, b.id, Math.floor(rng() * 32), 5 + Math.floor(rng() * 7));
        if (plan?.ok) {
          applyMove(city, plan);
          break;
        }
      }
      refreshCity(w);
      runDays(w, 3, round);
      expect(footprintsConsistent(w)).toBeNull();
    }
  });
});
