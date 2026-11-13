import { describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 45_000 });
import { City } from '../src/sim/City';
import { refreshCity } from '../src/sim/core/Simulation';
import { buildDemoCity } from '../src/sim/demo';
import { decodeLayer, deserialize, encodeLayer, parseSave, SaveError, serialize, verifySave, type SaveData } from '../src/sim/save';
import { cityStats } from '../src/sim/systems/population';
import { generateTerrain } from '../src/sim/terrain/generate';
import { presetSettings } from '../src/sim/terrain/presets';

const terrain = presetSettings('riverValley', 42, 128);

function demoCity() {
  const city = new City(generateTerrain(terrain), 1e9);
  buildDemoCity(city, 42);
  city.day = 400;
  city.clock = 123.5;
  city.taxRate = 11;
  return city;
}

function buildingsOf(city: City) {
  return [...city.world.buildings.values()].map((b) => ({
    def: b.def,
    x: b.x,
    y: b.y,
    variant: b.variant,
    grown: b.grown,
    construction: b.construction,
    fullDays: b.fullDays,
    occupants: b.occupants,
    happiness: Math.round(b.happiness * 100),
    moodDays: b.moodDays,
    abandoned: b.abandoned,
  }));
}

describe('save format', () => {
  it('layer encoding round-trips and rejects the wrong size', () => {
    const layer = new Uint8Array(5000);
    for (let i = 0; i < layer.length; i++) layer[i] = i % 977 < 300 ? 0 : (i * 7) % 5;
    const text = encodeLayer(layer);
    expect(decodeLayer(text, layer.length)).toEqual(layer);
    expect(() => decodeLayer(text, layer.length + 1)).toThrow(SaveError);
    expect(() => decodeLayer('%%%', 10)).toThrow(SaveError);
    // A long uniform run stays tiny.
    expect(encodeLayer(new Uint8Array(256 * 256)).length).toBeLessThanOrEqual(8);
  });

  it('a grown city survives serialize → JSON → parse → deserialize', () => {
    const city = demoCity();
    const data = serialize(city, terrain, 'Testville');
    const json = JSON.stringify(data);
    // Compact: well under 1 KB per 10 buildings, terrain not stored.
    expect(json.length).toBeLessThan(60 * city.world.buildings.size + 10_000);

    const loaded = deserialize(parseSave(JSON.parse(json)));
    refreshCity(loaded.world);
    const a = city.world;
    const b = loaded.world;
    expect(b.road).toEqual(a.road);
    expect(b.bridge).toEqual(a.bridge);
    expect(b.zone).toEqual(a.zone);
    expect(b.tree).toEqual(a.tree);
    expect(b.decor).toEqual(a.decor);
    expect(b.terrain).toEqual(a.terrain);
    expect(parseSave(JSON.parse(json)).buildingTiles).toEqual(data.buildingTiles);
    expect(buildingsOf(loaded)).toEqual(buildingsOf(city));
    expect(cityStats(b).population).toBe(cityStats(a).population);
    expect({ funds: loaded.funds, day: loaded.day, clock: loaded.clock, taxRate: loaded.taxRate }).toEqual({
      funds: city.funds,
      day: 400,
      clock: 123.5,
      taxRate: 11,
    });
  }, 30_000); // Grows the demo city first: slow when the whole suite runs in parallel.

  it('parseSave rejects junk and drops unknown buildings instead of failing', () => {
    expect(() => parseSave(null)).toThrow(SaveError);
    expect(() => parseSave({ v: 99 })).toThrow(/version/);
    const data: SaveData = serialize(demoCity(), terrain, 'X');
    const json: unknown = JSON.parse(
      JSON.stringify({ ...data, buildings: [['no_such_building', 1, 1, 0, 0, 0, 0, 0, 75, 0], ['cottage', 'x'], ...data.buildings] }),
    );
    expect(parseSave(json).buildings.length).toBe(data.buildings.length);
  });

  it("keeps the player's changes to a preset (seed, size and every slider)", () => {
    const tuned = { ...presetSettings('coastal', 777, 64), water: 0.8, trees: 0.15, rivers: 3, coastSides: 3 };
    const city = new City(generateTerrain(tuned));
    const data = parseSave(JSON.parse(JSON.stringify(serialize(city, tuned, 'Tuned'))));
    expect(data.terrain).toEqual(tuned);
    const loaded = deserialize(data).world;
    expect(loaded.terrain).toEqual(city.world.terrain);
    expect(loaded.tree).toEqual(city.world.tree);
  });

  it('skips buildings that no longer fit the map', () => {
    const data = serialize(new City(generateTerrain(terrain)), terrain, 'X');
    const city = deserialize({
      ...data,
      buildings: [
        ['cottage', 500, 500, 0, 1, 0, 0, 0, 75, 0],
        ['cottage', 3, 3, 0, 1, 0, 0, 2, 75, 0],
        ['cottage', 3, 3, 0, 1, 0, 0, 2, 75, 0],
      ],
    });
    expect(city.world.buildings.size).toBe(1);
  });
});

describe('strict saving', () => {
  it('a charged battery or worn plant never makes the city unloadable', () => {
    const city = demoCity();
    const [first, second] = city.world.buildings.values();
    first.stored = 12.5;
    second.condition = 0.7;
    second.repairDays = 2;
    const data = serialize(city, terrain, 'Batteries');
    verifySave(data);
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(data))));
    expect(loaded.world.buildings.size).toBe(city.world.buildings.size);
  });

  it('keeps the land itself, so a generator change cannot move the ground under a city', () => {
    const city = demoCity();
    const data = serialize(city, terrain, 'Ground');
    // Pretend the generator now makes a different island: the save still has the old one.
    const moved = deserialize({ ...data, terrain: { ...terrain, seed: 7 } });
    expect(moved.world.terrain).toEqual(city.world.terrain);
    expect(moved.world.elevation).toEqual(city.world.elevation);
    // Still compact: a few KB of layers on top of the buildings.
    expect(JSON.stringify(data.layers).length).toBeLessThan(40_000);
  });

  it('a stale or malformed tile map is ignored, not fatal', () => {
    const data = serialize(demoCity(), terrain, 'Tiles');
    const parsed = parseSave({ ...JSON.parse(JSON.stringify(data)), buildingTiles: { '1,1': 999_999, nope: 'x' } });
    expect(() => deserialize(parsed)).not.toThrow();
  });

  it('verifySave rejects snapshots that would not load back whole', () => {
    const data = serialize(demoCity(), terrain, 'Bad');
    expect(() => verifySave({ ...data, buildings: [...data.buildings, ['cottage', 9999, 0, 0, 0, 0, 0, 0, 75, 0]] })).toThrow(/off the map/);
    const [b] = data.buildings;
    expect(() => verifySave({ ...data, buildings: [...data.buildings, b] })).toThrow(/overlaps/);
    expect(() => verifySave({ ...data, layers: { ...data.layers, road: 'AAAA' } })).toThrow(SaveError);
  });
});
