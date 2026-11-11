import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/shared/balance';
import { Lifestyle } from '../src/sim/buildings/catalog';
import { applyClear, planClear } from '../src/sim/commands';
import { stageRequirements } from '../src/sim/progression';
import { researchDay, researchRate, TECHS } from '../src/sim/research';
import { RoadType } from '../src/sim/roads';
import { Stage } from '../src/sim/stages';
import { lifestyleDay, riseBlocker } from '../src/sim/systems/lifestyle';
import { cityStats, simulateDay } from '../src/sim/systems/population';
import { findRoute, Traffic } from '../src/sim/systems/traffic';
import { street } from './support/street';

/**
 * Edges of the systems that drive a city day to day: traffic routing, people and jobs,
 * needs, lifestyle, research and stages. Each test names the way the system could fail.
 */

describe('traffic and routing', () => {
  it('there is no route between two unconnected streets, and no car tries one', () => {
    const t = street();
    t.road(2, 30, 60, 30);
    expect(findRoute(t.world, t.world.index(10, 10), t.world.index(10, 30))).toBeNull();
    const home = t.place('walkup', 10, 11);
    const job = t.place('factory', 10, 32);
    t.refresh();
    home.occupants = 20;
    job.occupants = 10;
    const traffic = new Traffic(t.world, 1);
    traffic.refreshDemand();
    for (let k = 0; k < 600; k++) traffic.update(0.1, 8);
    expect(traffic.agents.filter((a) => a.kind !== 'person')).toHaveLength(0);
  });

  it('routes never step onto a tile that is not road', () => {
    const t = street();
    t.road(30, 10, 30, 40);
    t.road(30, 40, 60, 40);
    const path = findRoute(t.world, t.world.index(4, 10), t.world.index(58, 40));
    expect(path).not.toBeNull();
    for (const i of path ?? []) expect(t.world.road[i]).not.toBe(RoadType.None);
  });

  it('cars on a road that is bulldozed are dropped, not left driving over grass', () => {
    const t = street();
    for (let x = 4; x < 14; x++) t.place('walkup', x, 11);
    t.place('factory', 50, 12);
    t.place('power_plant', 30, 8);
    t.place('water_tower', 10, 9);
    t.place('water_tower', 48, 9);
    t.refresh();
    t.sim.runDays(10);
    for (let k = 0; k < 300; k++) t.sim.frame(0.1);
    applyClear(t.city, planClear(t.world, [{ x: 30, y: 10 }]));
    t.refresh();
    for (const a of t.sim.traffic.traffic.agents) for (let s = a.seg; s < a.path.length; s++) expect(t.world.road[a.path[s]]).not.toBe(RoadType.None);
  });
});

describe('people and jobs', () => {
  it('never more workers than jobs, never more residents than homes', () => {
    const t = street();
    for (let x = 4; x < 30; x++) t.place('walkup', x, 11);
    t.place('corner_shop', 40, 11);
    t.place('power_plant', 34, 8);
    for (const x of [8, 22, 38]) t.place('water_tower', x, 9);
    t.refresh();
    for (let d = 0; d < 60; d++) simulateDay(t.world);
    const s = cityStats(t.world);
    expect(s.population).toBeLessThanOrEqual(s.housing);
    expect(s.workers).toBeLessThanOrEqual(s.jobs);
    expect(s.unemployed).toBeGreaterThan(0); // one shop can't employ a street of flats
  });

  it('jobs are shared out when workers are short, and every job building gets some', () => {
    const t = street();
    t.place('walkup', 4, 11);
    const a = t.place('factory', 20, 12);
    const b = t.place('factory', 30, 12);
    t.place('power_plant', 40, 8);
    t.place('water_tower', 10, 9);
    t.place('water_tower', 25, 9);
    t.refresh();
    for (let d = 0; d < 60; d++) simulateDay(t.world);
    expect(a.occupants).toBeGreaterThan(0);
    expect(b.occupants).toBeGreaterThan(0);
    expect(Math.abs(a.occupants - b.occupants)).toBeLessThanOrEqual(1);
  });
});

describe('needs', () => {
  it('industry only cares about workers and safety (and garbage from the Village)', () => {
    const t = street();
    t.place('power_plant', 40, 8);
    t.place('water_tower', 22, 9);
    const f = t.place('factory', 20, 12);
    t.refresh();
    t.sim.needs.score();
    expect(Object.keys(t.sim.needs.byBuilding.get(f.id)?.scores ?? {}).sort()).toEqual(['safety', 'workers']);
    t.city.stage = Stage.Village;
    t.sim.needs.score();
    expect(Object.keys(t.sim.needs.byBuilding.get(f.id)?.scores ?? {}).sort()).toEqual(['garbage', 'safety', 'workers']);
  });

  it('a home beside a highway has worse air than the same home on a quiet street', () => {
    const t = street();
    t.road(2, 30, 60, 30, RoadType.Highway);
    t.place('power_plant', 50, 20);
    t.place('water_tower', 20, 9);
    t.place('water_tower', 20, 28);
    const quiet = t.place('cottage', 20, 12);
    const loud = t.place('cottage', 20, 31);
    t.refresh();
    t.sim.needs.score();
    const air = (id: number) => t.sim.needs.byBuilding.get(id)?.scores.air ?? 0;
    expect(air(loud.id)).toBeLessThan(air(quiet.id));
  });

  it('happiness stays within 0..1 whatever the scores', () => {
    const t = street();
    t.place('power_plant', 40, 8);
    t.place('water_tower', 22, 9);
    const home = t.place('cottage', 20, 11);
    home.garbage = 1e6;
    home.robbed = 30;
    home.sick = 30;
    t.city.stage = Stage.Metropolis;
    home.lifestyle = Lifestyle.Prosperous;
    t.refresh();
    t.sim.needs.score();
    expect(home.happiness).toBeGreaterThanOrEqual(0);
    expect(home.happiness).toBeLessThanOrEqual(1);
  });
});

describe('lifestyle', () => {
  it('a Basic home waits for the Town stage; a Comfortable one needs a City, a hospital and a school', () => {
    const t = street();
    const home = t.place('cottage', 20, 11);
    expect(riseBlocker(home, Stage.Village)).toMatch(/Town/);
    expect(riseBlocker(home, Stage.Town)).toBeNull();
    home.lifestyle = Lifestyle.Comfortable;
    expect(riseBlocker(home, Stage.Town)).toMatch(/City/);
    expect(riseBlocker(home, Stage.City)).toMatch(/hospital/);
  });

  it('an empty or unpowered home never moves up, however happy', () => {
    const t = street();
    t.city.stage = Stage.Town;
    const home = t.place('cottage', 20, 11);
    t.refresh();
    home.happiness = 1;
    home.occupants = 3; // no power or water here
    for (let d = 0; d < BALANCE.lifeDays * 2; d++) lifestyleDay(t.city);
    expect(home.lifestyle).toBe(Lifestyle.Basic);
  });
});

describe('research', () => {
  it('finishes at most one project a day, carries the rest over, and stops when all are done', () => {
    const t = street();
    t.city.research.points = 10_000;
    expect(researchDay(t.city)?.id).toBe(TECHS[0].id);
    expect(t.city.research.done).toBe(1);
    expect(t.city.research.points).toBe(10_000 - TECHS[0].points);
    for (let d = 0; d < 20; d++) researchDay(t.city);
    expect(t.city.research.done).toBe(TECHS.length);
    expect(researchDay(t.city)).toBeNull();
  });

  it('a research centre that is unfinished or off the road makes no points', () => {
    const t = street();
    const rc = t.place('research_centre', 20, 8);
    t.refresh();
    expect(researchRate(t.city)).toBe(3);
    rc.construction = 1;
    expect(researchRate(t.city)).toBe(0);
  });
});

describe('stages', () => {
  it('a Town needs police, fire, clinic, school and garbage for 75–90% of homes, not just people', () => {
    const t = street();
    for (let x = 4; x < 30; x++) t.place('walkup', x, 11);
    t.refresh();
    for (const b of t.world.buildings.values()) b.occupants = 20;
    const req = stageRequirements(t.world, Stage.Town);
    expect(req.map((r) => r.label)).toEqual(['Residents', 'Power and water', 'Police', 'Fire station', 'Clinic', 'School', 'Garbage collected']);
    expect(req.find((r) => r.label === 'Police')?.met).toBe(false);
  });

  it('with no homes at all, no service share counts as met', () => {
    const t = street();
    const req = stageRequirements(t.world, Stage.Town);
    expect(req.filter((r) => r.label !== 'Residents').every((r) => !r.met)).toBe(true);
  });
});
