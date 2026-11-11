import type { AnimationEvent } from 'react';
import { LOAD_STAGES, type LoadStage } from '../../game/loading';

/** Opening a saved city starts with fetching it; then the game's own stages follow. */
export type ScreenStage = 'fetch' | LoadStage;

/** What kind of city is opening: the words differ a little. */
export type LoadKind = 'new' | 'save' | 'demo';

const LABEL: Readonly<Record<ScreenStage, Readonly<Record<LoadKind, string>>>> = {
  fetch: { new: 'Fetching your city', save: 'Fetching your saved city', demo: 'Fetching the city' },
  world: { new: 'Shaping the terrain', save: 'Reading your saved city', demo: 'Shaping the terrain' },
  simulation: { new: 'Founding the city', save: 'Waking the city up', demo: 'Building the demo city' },
  graphics: { new: 'Starting the graphics', save: 'Starting the graphics', demo: 'Starting the graphics' },
  art: { new: 'Painting buildings, trees and traffic', save: 'Painting buildings, trees and traffic', demo: 'Painting buildings, trees and traffic' },
  map: { new: 'Laying out the map', save: 'Laying out the map', demo: 'Laying out the map' },
  enter: { new: 'Entering the city', save: 'Entering the city', demo: 'Entering the city' },
};

/** The stages shown for each kind: a saved city skips "founding" (it's restored whole). */
export function stagesFor(kind: LoadKind): readonly ScreenStage[] {
  return kind === 'save' ? ['fetch', ...LOAD_STAGES.filter((s) => s !== 'simulation')] : LOAD_STAGES;
}

export function stageLabel(stage: ScreenStage, kind: LoadKind): string {
  return LABEL[stage][kind];
}

export interface LoadError {
  /** The stage that failed. */
  readonly stage: ScreenStage;
  readonly message: string;
}

interface LoadingScreenProps {
  kind: LoadKind;
  /** The city's name, when known. */
  name?: string;
  current: ScreenStage;
  error?: LoadError | null;
  /** The city is ready: fade out, then call `onGone`. */
  leaving?: boolean;
  onGone?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
}

/**
 * The screen between choosing a city and seeing it (D-099). It lists the real loading steps and
 * ticks them off as `Game.create` reports them; there is no percentage, because the steps take
 * very different times on different machines. If a step fails it says which, and offers a retry.
 */
export function LoadingScreen({ kind, name, current, error, leaving, onGone, onRetry, onBack }: LoadingScreenProps) {
  const stages = stagesFor(kind);
  const at = Math.max(0, stages.indexOf(current));
  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (leaving && e.target === e.currentTarget) onGone?.();
  };

  return (
    <div
      className={`loading-screen ${leaving ? 'is-leaving' : ''} ${error ? 'is-failed' : ''}`}
      role={error ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={!error && !leaving}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="loading-body">
        <Skyline building={!error} />
        <p className="loading-kicker">{kind === 'demo' ? 'Demo city' : kind === 'save' ? 'Opening' : 'Founding'}</p>
        <h1 className="loading-name">{name ?? 'Your city'}</h1>

        {error ? (
          <div className="loading-error">
            <h2>{error.stage === 'graphics' ? "Your browser can't draw the city" : "The city couldn't open"}</h2>
            {error.stage === 'graphics' ? (
              <p>
                Openpolis needs WebGL. Turn on hardware acceleration in your browser settings (Chrome: Settings → System → Use graphics acceleration),
                then try again. If it's already on, try an up-to-date Chrome, Edge, Firefox or Safari.
              </p>
            ) : (
              <p>Something went wrong while {stageLabel(error.stage, kind).toLowerCase()}. Your saved cities are safe.</p>
            )}
            <code className="loading-detail">{error.message}</code>
            <div className="loading-actions">
              {onBack && (
                <button type="button" className="loading-secondary" onClick={onBack}>
                  Your cities
                </button>
              )}
              {onRetry && (
                <button type="button" className="loading-primary" onClick={onRetry} autoFocus>
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <ol className="loading-steps" aria-label="Loading steps">
            {stages.map((s, k) => (
              <li key={s} className={k < at || leaving ? 'is-done' : k === at ? 'is-now' : ''} aria-current={k === at ? 'step' : undefined}>
                <i aria-hidden="true" />
                {stageLabel(s, kind)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * A small isometric block of towers that rise one after another while the city loads (an
 * indeterminate indicator: it loops, it doesn't measure anything). Still when loading failed.
 */
function Skyline({ building }: { building: boolean }) {
  // Towers on a 3×3 diamond: [column, row, height]. Drawn back to front.
  const towers: readonly (readonly [number, number, number])[] = [
    [0, 0, 22],
    [1, 0, 34],
    [0, 1, 16],
    [2, 0, 14],
    [1, 1, 46],
    [0, 2, 26],
    [2, 1, 30],
    [1, 2, 18],
    [2, 2, 24],
  ];
  const W = 16;
  const H = 8;
  return (
    <svg className={`loading-skyline ${building ? 'is-building' : ''}`} viewBox="-60 -70 120 110" aria-hidden="true">
      <path d={`M0 ${-H * 0.5} L${W * 1.75} ${H * 1.25} L0 ${H * 3} L${-W * 1.75} ${H * 1.25}Z`} className="loading-lot" />
      {towers.map(([c, r, h], k) => {
        const x = (c - r) * W * 0.55;
        const y = (c + r) * H * 0.55 + H * 0.2;
        const w = W * 0.5;
        const d = H * 0.5;
        return (
          <g key={k} className="loading-tower" style={{ animationDelay: `${k * 140}ms` }}>
            <path d={`M${x - w} ${y} L${x} ${y + d} L${x} ${y + d - h} L${x - w} ${y - h}Z`} className="t-left" />
            <path d={`M${x} ${y + d} L${x + w} ${y} L${x + w} ${y - h} L${x} ${y + d - h}Z`} className="t-right" />
            <path d={`M${x - w} ${y - h} L${x} ${y + d - h} L${x + w} ${y - h} L${x} ${y - d - h}Z`} className="t-top" />
          </g>
        );
      })}
    </svg>
  );
}
