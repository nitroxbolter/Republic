import type { GameOptions } from '../game/Game';
import { formatCityRef, parseCityRef, type CityRef } from '../save/SaveStore';
import { DEFAULT_MAP_SIZE, MAP_SIZES } from '../shared/constants';
import { PRESET_IDS, PRESETS, presetSettings, type PresetId } from '../sim/terrain/presets';
import { appPath, isAppPath } from './basePath';

/**
 * A new city's options live in the URL until its first save (then `?city=` takes over), so a
 * reload reopens the same city:
 * `?preset=coastal&seed=42&size=128&water=0.5&trees=0.4&rivers=1&coast=1&name=Bayport&funds=100000`.
 * Without a seed the New Game screen opens instead.
 */

/** The approved River Valley map (docs/specs/terrain.md), preselected on the New Game screen. */
export const DEFAULT_SEED = 42;
export const DEFAULT_CITY_NAME = 'New Town';

function isPreset(v: string | null): v is PresetId {
  return v !== null && (PRESET_IDS as readonly string[]).includes(v);
}

function num(q: URLSearchParams, key: string, lo: number, hi: number): number | undefined {
  const v = Number(q.get(key));
  return q.has(key) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
}

export function readUrlOptions(): GameOptions | null {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed'));
  if (!q.has('seed') || !Number.isInteger(seed)) return null;
  const size = Number(q.get('size'));
  const preset = isPreset(q.get('preset')) ? (q.get('preset') as PresetId) : 'riverValley';
  const base = presetSettings(preset, seed, (MAP_SIZES as readonly number[]).includes(size) ? size : DEFAULT_MAP_SIZE);
  return {
    terrain: {
      ...base,
      water: num(q, 'water', 0, 1) ?? base.water,
      trees: num(q, 'trees', 0, 1) ?? base.trees,
      rivers: num(q, 'rivers', 0, 3) ?? base.rivers,
      coastSides: num(q, 'coast', 0, 4) ?? base.coastSides,
    },
    name: q.get('name')?.trim() || PRESETS[preset].name,
    funds: num(q, 'funds', 0, 1e9),
  };
}

/** Write the options to the URL (replacing history), keeping only what differs from the preset. */
export function writeUrlOptions(o: GameOptions) {
  const t = o.terrain;
  const def = PRESETS[t.preset].sliders;
  const q = new URLSearchParams();
  q.set('seed', String(t.seed));
  q.set('size', String(t.size));
  if (t.preset !== 'riverValley') q.set('preset', t.preset);
  if (t.water !== def.water) q.set('water', String(t.water));
  if (t.trees !== def.trees) q.set('trees', String(t.trees));
  if (t.rivers !== def.rivers) q.set('rivers', String(t.rivers));
  if (t.coastSides !== def.coastSides) q.set('coast', String(t.coastSides));
  q.set('name', o.name);
  if (o.funds !== undefined) q.set('funds', String(o.funds));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

/** Back to the New Game screen: drop the city from the URL (keep `funds`, a testing aid). */
export function clearUrlOptions() {
  const funds = new URLSearchParams(location.search).get('funds');
  history.replaceState(null, '', funds ? `${location.pathname}?funds=${funds}` : location.pathname);
}

/** A saved city in the URL (`?city=cloud:12`): a reload reopens it from its store. */
export function readCityRef(): CityRef | null {
  return parseCityRef(new URLSearchParams(location.search).get('city'));
}

export function writeCityUrl(ref: CityRef) {
  history.replaceState(null, '', `${location.pathname}?city=${formatCityRef(ref)}`);
}

/** The /demo route: a planned, fully grown city on River Valley (`/demo?seed=N` for another). */
export function isDemoRoute(): boolean {
  return isAppPath('demo');
}

export function demoOptions(seed = Number(new URLSearchParams(location.search).get('seed')) || DEFAULT_SEED): GameOptions {
  return { terrain: presetSettings('riverValley', seed, DEFAULT_MAP_SIZE), name: 'Demo City', demo: true };
}

/** Keep the demo's seed in the URL (so a reload shows the same city). */
export function writeDemoUrl(seed: number) {
  history.replaceState(null, '', `${appPath('demo')}?seed=${seed}`);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
