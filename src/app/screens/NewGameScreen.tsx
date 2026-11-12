import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameOptions } from '../../game/Game';
import { paintMinimap } from '../../render/minimap';
import { ViewTransform } from '../../render/view/ViewTransform';
import { DEFAULT_MAP_SIZE, MAP_SIZES } from '../../shared/constants';
import { generateTerrain } from '../../sim/terrain/generate';
import {
  PRESET_IDS,
  PRESETS,
  presetSettings,
  type PresetId,
  type TerrainSettings,
} from '../../sim/terrain/presets';
import type { World } from '../../sim/World';
import type { CityRef } from '../../save/SaveStore';
import { AccountButton } from '../account/AccountButton';
import { DEFAULT_SEED, randomSeed } from '../options';
import { CityList } from './CityList';
import { useCities } from './useCities';
import { uniqueCityName } from './cityNames';

/** Settings changes repaint the preview after this pause (ms). Generation itself takes < 50 ms. */
const PREVIEW_DEBOUNCE = 120;
const SIZE_LABEL: Readonly<Record<number, string>> = { 64: 'Small', 128: 'Medium', 256: 'Large' };
const THUMB = { w: 112, h: 62 } as const;
const PREVIEW = { w: 360, h: 196 } as const;
const BACKDROP = { w: 1600, h: 880 } as const;

/** Paint a world into a canvas element at `w × h` CSS px (device-pixel sharp). */
function paint(canvas: HTMLCanvasElement | null, world: World, w: number, h: number) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  paintMinimap(ctx, world, new ViewTransform(world.width, world.height, 0), w * dpr, h * dpr);
}

function PresetThumb({ preset, seed }: { preset: PresetId; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // Small maps keep the six thumbnails cheap; the big preview shows the real size.
    paint(ref.current, generateTerrain(presetSettings(preset, seed, 64)), THUMB.w, THUMB.h);
  }, [preset, seed]);
  return <canvas ref={ref} style={{ width: THUMB.w, height: THUMB.h }} aria-hidden="true" />;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="ng-slider">
      <span className="ng-slider-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="ng-slider-value">{props.format(props.value)}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ng-field">
      <span className="ng-field-label">{label}</span>
      {children}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface NewGameScreenProps {
  onStart: (o: GameOptions) => void;
  /** Continue a saved city. */
  onOpen: (ref: CityRef) => void;
  /** Shown above the cards (e.g. a city that couldn't be opened). */
  notice?: string;
}

/**
 * The start screen: your saved cities, then found a new one (pick a preset, tune it, preview
 * it live). See docs/04-ui-ux.md, "New Game Screen", and docs/specs/saving.md.
 */
export function NewGameScreen({ onStart, onOpen, notice }: NewGameScreenProps) {
  const [name, setName] = useState('');
  const [terrain, setTerrain] = useState<TerrainSettings>(() =>
    presetSettings('riverValley', DEFAULT_SEED, DEFAULT_MAP_SIZE),
  );
  const [seedText, setSeedText] = useState(String(DEFAULT_SEED));
  const previewRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLCanvasElement>(null);
  const [genMs, setGenMs] = useState(0);
  const cities = useCities();
  const hasCities = (cities.entries?.length ?? 0) > 0;
  const oneCityPerAccount = import.meta.env.VITE_LOCAL_ACCOUNTS === 'on';
  /** With saved cities, the new-city form stays folded until asked for, so "Continue" leads. */
  const [founding, setFounding] = useState(false);
  const showForm = !hasCities || founding;
  const funds = useMemo(() => {
    const f = Number(new URLSearchParams(location.search).get('funds'));
    return Number.isFinite(f) && f > 0 ? f : undefined;
  }, []);

  // Live preview (debounced): the same generator and painter as the game and minimap.
  useEffect(() => {
    const t = setTimeout(() => {
      const t0 = performance.now();
      const world = generateTerrain(terrain);
      setGenMs(Math.round(performance.now() - t0));
      paint(previewRef.current, world, PREVIEW.w, PREVIEW.h);
      paint(backdropRef.current, world, BACKDROP.w, BACKDROP.h);
    }, PREVIEW_DEBOUNCE);
    return () => clearTimeout(t);
  }, [terrain, showForm]);

  const set = (patch: Partial<TerrainSettings>) => setTerrain((t) => ({ ...t, ...patch }));
  const choosePreset = (preset: PresetId) =>
    setTerrain((t) => presetSettings(preset, t.seed, t.size));
  const setSeed = (seed: number) => {
    setSeedText(String(seed));
    set({ seed });
  };
  // The default name never repeats an existing city's ("Island 2"), so cities are easy to tell apart.
  const defaultName = uniqueCityName(PRESETS[terrain.preset].name, cities.entries);
  const start = () => onStart({ terrain, name: name.trim() || defaultName, funds });

  return (
    <div className="new-game">
      <canvas
        ref={backdropRef}
        className="ng-backdrop"
        style={{ width: BACKDROP.w, height: BACKDROP.h }}
        aria-hidden="true"
      />
      <div className="ng-account">
        <AccountButton />
      </div>
      <div className="ng-stack">
        {notice && (
          <p className="panel ng-notice" role="alert">
            {notice}
          </p>
        )}
        <CityList cities={cities} onOpen={onOpen} />
        {!showForm && !oneCityPerAccount && (
          <button type="button" className="panel ng-found" onClick={() => setFounding(true)}>
            <span className="ng-found-plus" aria-hidden="true">
              +
            </span>
            <span>
              <strong>Found a new city</strong>
              <small>Pick fresh land and start from scratch</small>
            </span>
          </button>
        )}
        {showForm && (
          <form
            className="panel ng-card"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <header className="ng-header">
              <h1>Found a new city</h1>
              <p>Pick the land, tune it, then start building.</p>
            </header>

            <div className="ng-body">
              <div className="ng-settings">
                <Field label="City name">
                  <input
                    className="ng-input"
                    value={name}
                    maxLength={32}
                    placeholder={defaultName}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Field label="Terrain">
                  <div className="ng-presets" role="radiogroup" aria-label="Terrain preset">
                    {PRESET_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={terrain.preset === id}
                        className={`ng-preset ${terrain.preset === id ? 'is-active' : ''}`}
                        title={PRESETS[id].description}
                        onClick={() => choosePreset(id)}
                      >
                        <PresetThumb preset={id} seed={terrain.seed} />
                        <span>{PRESETS[id].name}</span>
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="ng-row">
                  <Field label="Map size">
                    <div className="ng-segmented" role="radiogroup" aria-label="Map size">
                      {MAP_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={terrain.size === s}
                          className={terrain.size === s ? 'is-active' : ''}
                          onClick={() => set({ size: s })}
                        >
                          {SIZE_LABEL[s]} <small>{s}</small>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Seed">
                    <div className="ng-seed">
                      <input
                        className="ng-input"
                        inputMode="numeric"
                        value={seedText}
                        onChange={(e) => {
                          setSeedText(e.target.value);
                          const v = Number(e.target.value);
                          if (e.target.value !== '' && Number.isInteger(v)) set({ seed: v });
                        }}
                      />
                      <button
                        type="button"
                        className="ng-dice"
                        title="Random seed"
                        aria-label="Random seed"
                        onClick={() => setSeed(randomSeed())}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <rect
                            x="4"
                            y="4"
                            width="16"
                            height="16"
                            rx="3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          {[
                            [9, 9],
                            [15, 9],
                            [12, 12],
                            [9, 15],
                            [15, 15],
                          ].map(([cx, cy]) => (
                            <circle
                              key={`${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r="1.3"
                              fill="currentColor"
                            />
                          ))}
                        </svg>
                      </button>
                    </div>
                  </Field>
                </div>

                <details className="ng-advanced">
                  <summary>Advanced</summary>
                  <Slider
                    label="Water"
                    value={terrain.water}
                    min={0}
                    max={1}
                    step={0.05}
                    format={pct}
                    onChange={(water) => set({ water })}
                  />
                  <Slider
                    label="Trees"
                    value={terrain.trees}
                    min={0}
                    max={1}
                    step={0.05}
                    format={pct}
                    onChange={(trees) => set({ trees })}
                  />
                  <Slider
                    label="Rivers"
                    value={terrain.rivers}
                    min={0}
                    max={3}
                    step={1}
                    format={(v) => (v === 0 ? 'None' : String(v))}
                    onChange={(rivers) => set({ rivers })}
                  />
                  <Slider
                    label="Coast"
                    value={terrain.coastSides}
                    min={0}
                    max={4}
                    step={1}
                    format={(v) =>
                      v === 0 ? 'Nenhum' : v === 4 ? 'Ilha' : `${v} lado${v === 1 ? '' : 's'}`
                    }
                    onChange={(coastSides) => set({ coastSides })}
                  />
                </details>
              </div>

              <div className="ng-preview">
                <canvas
                  ref={previewRef}
                  style={{ width: PREVIEW.w, height: PREVIEW.h }}
                  aria-label="Map preview"
                />
                <p className="ng-preview-caption">
                  {PRESETS[terrain.preset].description}
                  <span className="ng-dim">
                    {' '}
                    · {terrain.size}×{terrain.size} · generated in {genMs} ms
                  </span>
                </p>
                <button type="submit" className="ng-start">
                  Start building
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
