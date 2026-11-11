import { describe, expect, it } from 'vitest';
import type { BuildingId, BuildingInstance } from '../src/sim/buildings/catalog';
import { City } from '../src/sim/City';
import { applyPlace, applyRoad, planPlace, planRoad } from '../src/sim/commands';
import { Simulation } from '../src/sim/core/Simulation';
import { loadSimulation, parseSave, serialize } from '../src/sim/save';
import { roadPath, RoadType } from '../src/sim/roads';
import { hazard, INCIDENTS, type IncidentEvent, type IncidentKind } from '../src/sim/systems/incidents';
import { presetSettings } from '../src/sim/terrain/presets';
import { Terrain } from '../src/sim/terrain/types';
import { World } from '../src/sim/World';

/**
 * Incidents (docs/specs/evolution.md, E3): one long street (y = 10, x 2..62) with cottages on
 * its south side and stations on its north side. Under 200 residents, so the daily roll never
 * starts anything by itself: each test starts its own incident.
 */
function street(stations: readonly (readonly [BuildingId, number])[] = []) {
  const w = new World(64, 64, 3);
  w.terrain.fill(Terrain.Grass);
  const city = new City(w, 1e9);
  applyRoad(city, planRoad(w, roadPath({ x: 2, y: 10 }, { x: 62, y: 10 }, true), RoadType.Road), RoadType.Road);
  const place = (id: BuildingId, x: number, y: number): BuildingInstance => {
    const r = applyPlace(city, planPlace(w, id, x, y), 0);
    if (!r.ok) throw new Error(`could not place ${id} at ${x},${y}`);
    const b = w.buildings.get(w.building[w.index(x, y)]);
    if (!b) throw new Error('placed building not found');
    return b;
  };
  for (const [id, x] of stations) place(id, x, id === 'hospital' || id === 'trauma_centre' ? 7 : 9);
  const sim = new Simulation(city);
  const home = (x: number) => {
    const b = place('cottage', x, 11);
    sim.worldChanged({ roads: false });
    b.occupants = 3;
    return b;
  };
  sim.worldChanged({ roads: true });
  const events: IncidentEvent[] = [];
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      sim.tick();
      events.push(...sim.incidents.takeEvents());
    }
  };
  const saw = (type: IncidentEvent['type'], kind?: IncidentKind) => events.some((e) => e.type === type && (kind === undefined || ('kind' in e && e.kind === kind)));
  return { w, city, sim, home, run, saw, events };
}

describe('incidents (E3)', () => {
  it('a fire truck from a nearby station puts the fire out, and the building stays', () => {
    const t = street([['fire_station', 20]]);
    const b = t.home(24);
    t.sim.incidents.start('fire', b);
    t.run(INCIDENTS.burnAfter + 60);
    expect(t.saw('resolved', 'fire')).toBe(true);
    expect(t.saw('burned')).toBe(false);
    expect(t.w.buildings.has(b.id)).toBe(true);
    expect(t.sim.incidents.active.filter((i) => i.kind === 'fire')).toHaveLength(0);
  });

  it('the truck drives out, works at the scene, and comes back', () => {
    const t = street([['fire_station', 20]]);
    const b = t.home(30);
    t.sim.incidents.start('fire', b);
    t.run(1);
    const truck = t.sim.incidents.responders[0];
    expect(truck).toMatchObject({ kind: 'fire', phase: 'out' });
    expect(truck.agent.kind).toBe('fire_truck');
    const phases = new Set<string>();
    for (let k = 0; k < INCIDENTS.burnAfter && t.sim.incidents.responders.length > 0; k++) {
      phases.add(t.sim.incidents.responders[0].phase);
      t.run(1);
    }
    expect([...phases]).toEqual(['out', 'scene', 'back']);
    expect(t.sim.incidents.responders).toHaveLength(0);
    const station = [...t.w.buildings.values()].find((s) => s.def === 'fire_station');
    expect(station && t.sim.incidents.calls.get(station.id)).toEqual({ answered: 1, late: 0 });
  });

  it('with no fire station the fire spreads to its neighbour, then burns the building down', () => {
    const t = street();
    const b = t.home(24);
    const next = t.home(25);
    t.sim.incidents.start('fire', b);
    t.run(1);
    expect(t.saw('unreached', 'fire')).toBe(true);
    t.run(INCIDENTS.spreadAfter);
    expect(t.sim.incidents.incidentAt(next.id)?.kind).toBe('fire');
    t.run(INCIDENTS.burnAfter - INCIDENTS.spreadAfter);
    expect(t.saw('burned')).toBe(true);
    expect(t.w.buildings.has(b.id)).toBe(false);
    // The lot is clear again.
    expect(t.w.building[t.w.index(24, 11)]).toBe(-1);
  });

  it('police catch a thief in time; without police the home is robbed and its safety halved', () => {
    const caught = street([['police_station', 20]]);
    const home = caught.home(23);
    caught.sim.incidents.start('theft', home);
    caught.run(INCIDENTS.theftWindow + 1);
    expect(caught.saw('resolved', 'theft')).toBe(true);
    expect(home.robbed).toBe(0);

    // A fire station alone gives the safety need 0.4; a theft nobody stops halves it.
    const robbed = street([['fire_station', 20]]);
    const victim = robbed.home(23);
    robbed.sim.needs.score();
    const before = robbed.sim.needs.byBuilding.get(victim.id)?.scores.safety;
    robbed.sim.incidents.start('theft', victim);
    robbed.run(INCIDENTS.theftWindow + 1);
    expect(robbed.saw('missed', 'theft')).toBe(true);
    // A day boundary may already have worn one day off.
    expect(victim.robbed).toBeGreaterThanOrEqual(INCIDENTS.markDays - 1);
    robbed.sim.needs.score();
    expect(before).toBeCloseTo(0.4);
    expect(robbed.sim.needs.byBuilding.get(victim.id)?.scores.safety).toBeCloseTo(0.2);
  });

  it('a station too far away arrives too late, and its call counts as late', () => {
    const t = street([['police_station', 4]]);
    const home = t.home(60); // ~56 road tiles: well over a day's drive for a patrol car
    t.sim.incidents.start('theft', home);
    t.run(INCIDENTS.theftWindow + 1);
    expect(t.saw('missed', 'theft')).toBe(true);
    t.run(6 * 60);
    const station = [...t.w.buildings.values()].find((s) => s.def === 'police_station');
    expect(station && t.sim.incidents.calls.get(station.id)).toEqual({ answered: 0, late: 1 });
  });

  it('clinics treat illness but not injuries; a hospital takes both', () => {
    const clinic = street([['clinic', 20]]);
    const sick = clinic.home(23);
    clinic.sim.incidents.start('illness', sick);
    const hurt = clinic.home(26);
    clinic.sim.incidents.start('injury', hurt);
    clinic.run(INCIDENTS.patientWindow + 1);
    expect(clinic.saw('resolved', 'illness')).toBe(true);
    expect(clinic.saw('unreached', 'injury')).toBe(true);
    expect(clinic.saw('missed', 'injury')).toBe(true);
    expect(hurt.sick).toBeGreaterThanOrEqual(INCIDENTS.markDays - 1);

    const hospital = street([['hospital', 20]]);
    const patient = hospital.home(23);
    hospital.sim.incidents.start('injury', patient);
    hospital.run(INCIDENTS.patientWindow + 1);
    expect(hospital.saw('resolved', 'injury')).toBe(true);
    expect(patient.sick).toBe(0);
  });

  it('a fire in an occupied home may injure someone, who needs an ambulance too', () => {
    const t = street([['fire_station', 20]]);
    let injured = false;
    // The injury roll is random; over a few fires one hurts someone.
    for (let x = 24; x < 58 && !injured; x += 2) {
      t.sim.incidents.start('fire', t.home(x));
      injured = t.sim.incidents.active.some((i) => i.kind === 'injury');
    }
    expect(injured).toBe(true);
  });

  it('a station never sends more vehicles than its fleet', () => {
    const t = street([['police_station', 20]]);
    for (const x of [23, 25, 27]) t.sim.incidents.start('theft', t.home(x));
    t.run(2);
    expect(t.sim.incidents.responders).toHaveLength(2);
  });

  it('a city saved mid-incident continues exactly as the running one', () => {
    const terrain = presetSettings('plains', 3, 64);
    const make = () => street([['fire_station', 20], ['police_station', 40]]);
    const fingerprint = (sim: Simulation) => ({
      incidents: sim.incidents.active.map((i) => [i.kind, i.age, i.answered, i.work]),
      vehicles: sim.incidents.responders.map((r) => [r.kind, r.phase, r.elapsed, r.duration, r.from, r.to]),
      buildings: [...sim.world.buildings.values()].map((b) => [b.def, b.x, b.y, b.robbed, b.sick]),
    });
    const begin = (t: ReturnType<typeof make>) => {
      t.sim.incidents.start('fire', t.home(24));
      t.sim.incidents.start('theft', t.home(44));
      t.home(56);
    };
    const running = make();
    begin(running);
    running.run(30);
    const first = make();
    begin(first);
    first.run(15);
    const json: unknown = JSON.parse(JSON.stringify(serialize(first.city, terrain, 'Twin', first.sim)));
    const loaded = loadSimulation(parseSave(json));
    expect(loaded.incidents.responders.length).toBeGreaterThan(0);
    for (let k = 0; k < 15; k++) loaded.tick();
    expect(fingerprint(loaded)).toEqual(fingerprint(running.sim));
  });

  it('hazard: coverage lowers it, industry and joblessness raise it', () => {
    const t = street([['fire_station', 20], ['police_station', 21]]);
    const near = t.home(22);
    const far = t.home(60);
    const ctx = { jobless: 0, aqi: () => 0 };
    expect(hazard('fire', near, ctx)).toBeLessThan(hazard('fire', far, ctx));
    expect(hazard('theft', near, ctx)).toBeLessThan(hazard('theft', far, ctx));
    expect(hazard('theft', far, { jobless: 0.5, aqi: () => 0 })).toBeCloseTo(hazard('theft', far, ctx) * 2);
    expect(hazard('illness', far, { jobless: 0, aqi: () => 150 })).toBeCloseTo(hazard('illness', far, ctx) * 2);
    const station = [...t.w.buildings.values()].find((s) => s.def === 'fire_station');
    expect(station && hazard('fire', station, ctx)).toBe(0);
  });
});
