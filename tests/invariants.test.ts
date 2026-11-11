import { describe, expect, it } from 'vitest';
import { BUILDING_IDS, buildingDef, type BuildingId } from '../src/sim/buildings/catalog';
import { applyClear, planClear } from '../src/sim/commands';
import type { Simulation } from '../src/sim/core/Simulation';
import { TECHS } from '../src/sim/research';
import { RoadType } from '../src/sim/roads';
import { loadSimulation, parseSave, serialize } from '../src/sim/save';
import { INCIDENTS } from '../src/sim/systems/incidents';
import { materialStorage } from '../src/sim/systems/materials';
import { cityStats } from '../src/sim/systems/population';
import { presetSettings } from '../src/sim/terrain/presets';
import { mulberry32 } from '../src/shared/rng';
import { gridTown } from './support/gridTown';

/**
 * Invariants across every system (docs/02-architecture.md, "Simulation Systems"): rules that
 * must hold every day whatever the player does. A long run with random edits (bulldozing
 * buildings and roads, new stations, tax changes) is where systems that are each fine alone
 * break each other: dangling ids, NaN, negative stock, over-full buildings, cars on removed road.
 */

/** Every rule, as a list of what broke (empty when all hold). */
function violations(sim: Simulation): string[] {
  const out: string[] = [];
  const bad = (msg: string) => out.length < 20 && out.push(msg);
  const w = sim.world;
  const city = sim.city;
  const finite = (n: number) => Number.isFinite(n);

  // City.
  if (!finite(city.funds)) bad(`funds ${city.funds}`);
  if (!finite(city.materials) || city.materials < 0) bad(`materials ${city.materials}`);
  if (city.needsMaterials && city.materials > materialStorage(city) + 1e-6) bad(`materials ${city.materials} over storage ${materialStorage(city)}`);
  if (!finite(city.uncollected) || city.uncollected < 0) bad(`uncollected ${city.uncollected}`);
  if (city.research.done < 0 || city.research.done > TECHS.length || !finite(city.research.points)) bad(`research ${JSON.stringify(city.research)}`);

  // Buildings.
  for (const b of w.buildings.values()) {
    const d = buildingDef(b.def);
    const tag = `${b.def}#${b.id}@${b.x},${b.y}`;
    if (!Number.isInteger(b.occupants) || b.occupants < 0 || b.occupants > d.capacity) bad(`${tag} occupants ${b.occupants}/${d.capacity}`);
    if (!finite(b.happiness) || b.happiness < 0 || b.happiness > 1) bad(`${tag} happiness ${b.happiness}`);
    if (!finite(b.garbage) || b.garbage < 0) bad(`${tag} garbage ${b.garbage}`);
    if (d.garbage?.holds !== undefined && b.filled > d.garbage.holds + 1e-6) bad(`${tag} landfill over-full ${b.filled}`);
    if (b.condition < 0 || b.condition > 1 || b.repairDays < 0) bad(`${tag} condition ${b.condition} repair ${b.repairDays}`);
    if (b.construction < 0) bad(`${tag} construction ${b.construction}`);
    if (b.abandoned && b.occupants > 0) bad(`${tag} abandoned with ${b.occupants} occupants`);
    if (b.robbed < 0 || b.robbed > INCIDENTS.markDays || b.sick < 0 || b.sick > INCIDENTS.markDays) bad(`${tag} marks ${b.robbed}/${b.sick}`);
    if (b.entrance !== -1 && w.road[b.entrance] === RoadType.None) bad(`${tag} entrance ${b.entrance} is not a road`);
    if (b.entrance === -1 && b.occupants > 0 && d.category !== 'civic') bad(`${tag} has occupants but no road`);
    for (let y = b.y; y < b.y + d.size.h; y++) {
      for (let x = b.x; x < b.x + d.size.w; x++) {
        if (!w.inBounds(x, y)) bad(`${tag} off the map`);
        else {
          const i = w.index(x, y);
          if (w.building[i] !== b.id) bad(`${tag} tile ${x},${y} owned by ${w.building[i]}`);
          if (w.road[i] !== RoadType.None) bad(`${tag} stands on a road at ${x},${y}`);
        }
      }
    }
  }
  // No tile points at a building that is gone.
  for (let i = 0; i < w.building.length; i++) if (w.building[i] !== -1 && !w.buildings.has(w.building[i])) bad(`tile ${i} owned by missing building ${w.building[i]}`);

  // People.
  const s = cityStats(w);
  if (s.population > s.housing) bad(`population ${s.population} over housing ${s.housing}`);

  // Incidents.
  const seen = new Set<string>();
  const perKind = new Map<string, number>();
  for (const inc of sim.incidents.active) {
    if (!w.buildings.has(inc.building)) bad(`incident ${inc.id} on missing building ${inc.building}`);
    const key = `${inc.kind}:${inc.building}`;
    if (seen.has(key)) bad(`two ${inc.kind} incidents on building ${inc.building}`);
    seen.add(key);
    perKind.set(inc.kind, (perKind.get(inc.kind) ?? 0) + 1);
    if (inc.kind === 'fire' && !inc.answered && inc.age > INCIDENTS.burnAfter) bad(`fire ${inc.id} older than burnAfter (${inc.age})`);
  }
  for (const [kind, n] of perKind) if (n > INCIDENTS.maxActive + (kind === 'injury' ? INCIDENTS.maxActive : 0)) bad(`${n} ${kind} incidents at once`);
  const perStation = new Map<number, number>();
  for (const r of sim.incidents.responders) {
    const st = w.buildings.get(r.station);
    if (!st) bad(`vehicle from missing station ${r.station}`);
    perStation.set(r.station, (perStation.get(r.station) ?? 0) + 1);
    if (r.elapsed < 0 || r.duration < 0 || !finite(r.duration)) bad(`vehicle timing ${r.elapsed}/${r.duration}`);
  }
  for (const [id, n] of perStation) {
    const st = w.buildings.get(id);
    const fleet = st ? (buildingDef(st.def).responder?.vehicles ?? 0) : 0;
    if (n > fleet) bad(`station ${id} has ${n} vehicles out of a fleet of ${fleet}`);
  }

  // Traffic: cars only on road that still exists.
  for (const a of sim.traffic.traffic.agents) {
    for (let k = a.seg; k < a.path.length; k++) {
      if (w.road[a.path[k]] === RoadType.None) {
        bad(`${a.kind} on a removed road tile ${a.path[k]}`);
        break;
      }
    }
  }
  // Commute and air numbers stay real.
  for (let i = 0; i < w.road.length; i++) {
    const c = sim.commute.congestion[i];
    if (!finite(c) || c < 0) {
      bad(`congestion ${c} at ${i}`);
      break;
    }
  }
  if (!finite(sim.commute.report.avgMinutes)) bad(`avg commute ${sim.commute.report.avgMinutes}`);
  for (const v of sim.air.aqi) {
    if (!finite(v) || v < 0) {
      bad(`AQI ${v}`);
      break;
    }
  }
  return out;
}

/** One day through tick() and frame(), so traffic and emergency vehicles really move. */
function liveDay(sim: Simulation) {
  for (let t = 0; t < 60; t++) {
    sim.tick();
    sim.frame(0.1);
    sim.incidents.takeEvents();
  }
}

const STATIONS: readonly BuildingId[] = ['fire_station', 'police_station', 'clinic', 'hospital', 'landfill', 'water_tower', 'power_plant', 'park'];

/** A random player: bulldozes a building or a stretch of road, places a station, nudges the tax. */
function randomEdit(sim: Simulation, place: (id: BuildingId, x: number, y: number) => unknown, rng: () => number) {
  const w = sim.world;
  const roll = rng();
  const x = 2 + Math.floor(rng() * (w.width - 4));
  const y = 2 + Math.floor(rng() * (w.height - 4));
  if (roll < 0.35) {
    const ids = [...w.buildings.keys()];
    const b = w.buildings.get(ids[Math.floor(rng() * ids.length)]);
    if (b) applyClear(sim.city, planClear(w, [{ x: b.x, y: b.y }]));
  } else if (roll < 0.55) {
    // A short stretch of road (often splitting the network).
    applyClear(sim.city, planClear(w, [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }]));
  } else if (roll < 0.9) {
    place(STATIONS[Math.floor(rng() * STATIONS.length)], x, y);
  } else {
    sim.city.taxRate = Math.floor(rng() * 21);
  }
  sim.worldChanged({ roads: true });
}

describe('simulation invariants', () => {
  it('a serviced town keeps every rule every day for a year of play with random edits', () => {
    const t = gridTown({ size: 64 });
    const rng = mulberry32(7);
    let stage = t.city.stage;
    const failures: string[] = [];
    for (let day = 1; day <= 360 && failures.length === 0; day++) {
      liveDay(t.sim);
      if (day > 60 && day % 5 === 0) randomEdit(t.sim, t.place, rng);
      if (t.city.stage < stage) failures.push(`day ${day}: stage went down`);
      stage = t.city.stage;
      for (const v of violations(t.sim)) failures.push(`day ${day}: ${v}`);
    }
    expect(failures).toEqual([]);
    expect(cityStats(t.world).population).toBeGreaterThan(500); // it really was a living city
  }, 120_000);

  it('a city with nothing working (no power, water or services, broke, top tax) degrades without breaking', () => {
    const t = gridTown({ size: 48, utilities: false, services: false, funds: 0 });
    t.city.taxRate = 20;
    const failures: string[] = [];
    for (let day = 1; day <= 120 && failures.length === 0; day++) {
      liveDay(t.sim);
      for (const v of violations(t.sim)) failures.push(`day ${day}: ${v}`);
    }
    expect(failures).toEqual([]);
    expect(cityStats(t.world).population).toBe(0);
  }, 60_000);

  it('an empty map runs a year: no roads, no buildings, no crash', () => {
    const t = gridTown({ size: 32 });
    applyClear(t.city, planClear(t.world, [...Array(32 * 32).keys()].map((i) => ({ x: i % 32, y: Math.floor(i / 32) }))));
    t.sim.worldChanged({ roads: true });
    expect(t.world.buildings.size).toBe(0);
    t.sim.runDays(360);
    expect(violations(t.sim)).toEqual([]);
    expect(Number.isFinite(t.city.funds)).toBe(true);
  });

  it('every catalog building placed alone on a road works for a month without breaking a rule', () => {
    for (const id of BUILDING_IDS) {
      const t = gridTown({ size: 32, services: false });
      const d = buildingDef(id);
      // Rail stations need track; skip what can't stand by a road alone.
      if (d.railStation) continue;
      const b = t.place(id, 18, 13);
      if (!b) continue; // footprint doesn't fit this test lot; covered by the catalog tests
      t.sim.worldChanged({ roads: false });
      t.sim.runDays(30);
      expect(violations(t.sim), id).toEqual([]);
    }
  }, 120_000);

  it('saving and loading at any point mid-year changes nothing about the future', () => {
    const terrain = { ...presetSettings('plains', 11, 64) };
    const days = [45, 120];
    for (const at of days) {
      const running = gridTown();
      running.sim.runDays(at + 20);
      const first = gridTown();
      first.sim.runDays(at);
      const json: unknown = JSON.parse(JSON.stringify(serialize(first.city, terrain, 'Twin', first.sim)));
      const loaded = loadSimulation(parseSave(json));
      loaded.runDays(20);
      const sig = (sim: Simulation) => ({
        funds: sim.city.funds,
        buildings: [...sim.world.buildings.values()].map((b) => [b.def, b.x, b.y, b.occupants, b.happiness, b.garbage, b.robbed, b.sick, b.lifestyle]),
        incidents: sim.incidents.active.map((i) => [i.kind, i.age]),
        streams: [sim.streams.growth.state, sim.streams.fire.state],
      });
      expect(sig(loaded), `saved at day ${at}`).toEqual(sig(running.sim));
    }
  }, 120_000);
});
