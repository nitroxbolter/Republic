import { useAtomValue, useStore } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type GameOptions } from '../../game/Game';
import { nextPaint } from '../../game/loading';
import { CitySaver } from '../../save/CitySaver';
import type { CityRef } from '../../save/SaveStore';
import { authAtom, saveStatusAtom } from '../atoms';
import { connectGameToStore } from '../bridge';
import { randomSeed } from '../options';
import { BuildingPicker } from '../hud/BuildingPicker';
import { RoadPicker } from '../hud/RoadPicker';
import { ControlsHint } from '../hud/ControlsHint';
import { CostLabel } from '../hud/CostLabel';
import { DebugOverlay } from '../hud/DebugOverlay';
import { InfoPanel } from '../hud/InfoPanel';
import { BudgetPanel } from '../hud/BudgetPanel';
import { DemographyPanel } from '../hud/DemographyPanel';
import { TrafficLegend } from '../hud/TrafficLegend';
import { CitizensPanel } from '../hud/CitizensPanel';
import { Minimap } from '../hud/Minimap';
import { Notices } from '../hud/Notices';
import { Toolbar } from '../hud/Toolbar';
import { TopBar } from '../hud/TopBar';
import { MoreSheet } from '../hud/MoreSheet';
import { Tour } from '../tour/Tour';
import { GuestLimit } from '../account/GuestLimit';
import { LoadingScreen, type LoadError, type LoadKind, type ScreenStage } from './LoadingScreen';

interface GameScreenProps {
  options: GameOptions;
  /** The save this city was loaded from (null: a new city, or the demo). */
  cityRef: CityRef | null;
  /** The city was saved somewhere new (first save, or moved into the account). */
  onSaved: (ref: CityRef) => void;
  /** Same settings, new seed (the `N` key). */
  onReroll: (o: GameOptions) => void;
  /** Back to the New Game screen. */
  onNewCity: () => void;
}

/** Where the city is on its way in: loading a stage, failed at one, or playing. */
type Status =
  | { readonly kind: 'loading'; readonly stage: ScreenStage }
  | { readonly kind: 'failed'; readonly error: LoadError }
  | { readonly kind: 'ready' };

const LOADING: Status = { kind: 'loading', stage: 'world' };

const loadKind = (o: GameOptions): LoadKind => (o.demo ? 'demo' : o.save ? 'save' : 'new');

export function GameScreen({ options, cityRef, onSaved, onReroll, onNewCity }: GameScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const [status, setStatus] = useState<Status>(LOADING);
  /** The loading screen stays up while it fades out over the first frames of the city. */
  const [curtain, setCurtain] = useState(true);
  /** Bumped by "Try again" to run creation once more. */
  const [attempt, setAttempt] = useState(0);
  const saverRef = useRef<CitySaver | null>(null);
  // Read through refs so the game isn't recreated when these change.
  const initialRef = useRef(cityRef);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const save = useCallback(() => void saverRef.current?.saveNow(), []);
  /** Save anything unsaved first (leaving the city, logging out). */
  const flush = useCallback(async () => {
    await saverRef.current?.autosave();
  }, []);
  const leave = useCallback(async () => {
    await flush();
    onNewCity();
  }, [flush, onNewCity]);

  // Logged out while playing a city from the account: it can't be saved any more, so leave it.
  const auth = useAtomValue(authAtom);
  useEffect(() => {
    if (auth.status === 'guest' && saverRef.current?.cityRef?.store === 'cloud') onNewCity();
  }, [auth.status, onNewCity]);

  // Ctrl/⌘ S saves now instead of opening the browser's "Save page".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyS' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // N: roll a new map with the same preset and sliders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.target instanceof HTMLInputElement) return;
      setStatus(LOADING);
      setCurtain(true);
      onReroll({ ...options, terrain: { ...options.terrain, seed: randomSeed() } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, onReroll]);

  useEffect(() => {
    const host = hostRef.current!;
    let game: Game | null = null;
    let disconnect: (() => void) | null = null;
    let cancelled = false;
    let stage: ScreenStage = 'world';

    // Each stage is shown, and painted, before its work starts (D-099).
    const progress = (s: ScreenStage) => {
      stage = s;
      if (!cancelled) setStatus({ kind: 'loading', stage: s });
      return nextPaint();
    };

    // Game.create is async; handle unmount-before-ready (React StrictMode mounts twice in dev).
    Game.create(host, options, progress)
      .then((g) => {
        if (cancelled) {
          g.destroy();
          return;
        }
        game = g;
        disconnect = connectGameToStore(g, store);
        // The demo is a showcase, never saved.
        if (!options.demo) {
          saverRef.current = new CitySaver(g, {
            ref: initialRef.current,
            preferredStore: () => (store.get(authAtom).status === 'user' ? 'cloud' : 'local'),
            onStatus: (s) => store.set(saveStatusAtom, s),
            onRef: (ref) => onSavedRef.current(ref),
          });
        }
        setStatus({ kind: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(`Could not open the city (at "${stage}")`, err);
        setStatus({ kind: 'failed', error: { stage, message: err instanceof Error ? err.message : String(err) } });
      });

    return () => {
      cancelled = true;
      // Last chance for unsaved changes (rerolls, unmount): the snapshot is taken before the game goes.
      const saver = saverRef.current;
      saverRef.current = null;
      saver?.journalNow();
      void saver?.autosave();
      saver?.dispose();
      store.set(saveStatusAtom, null);
      disconnect?.();
      game?.destroy();
    };
  }, [store, options, attempt]);

  const retry = () => {
    setStatus(LOADING);
    setAttempt((a) => a + 1);
  };

  const ready = status.kind === 'ready';
  return (
    <div className="game-screen">
      <div ref={hostRef} className="game-canvas" />
      {/* The HUD only comes in with the city, never over an empty screen. */}
      {ready && <Hud options={options} onNewCity={() => void leave()} onSave={save} beforeLogout={flush} />}
      {curtain && (
        <LoadingScreen
          kind={loadKind(options)}
          name={options.name}
          current={status.kind === 'loading' ? status.stage : 'enter'}
          error={status.kind === 'failed' ? status.error : null}
          leaving={ready}
          onGone={() => setCurtain(false)}
          onRetry={retry}
          onBack={onNewCity}
        />
      )}
    </div>
  );
}

interface HudProps {
  options: GameOptions;
  onNewCity: () => void;
  onSave: () => void;
  beforeLogout: () => Promise<void>;
}

/**
 * Everything over the world. Order matters only within a layer (tokens.css, "Layers"): later
 * siblings paint over earlier ones.
 */
function Hud({ options, onNewCity, onSave, beforeLogout }: HudProps) {
  return (
    <>
      <TopBar cityName={options.name} onNewCity={onNewCity} onSave={onSave} beforeLogout={beforeLogout} />
      <DebugOverlay />
      <CitizensPanel />
      <Minimap />
      <TrafficLegend />
      <Toolbar />
      <InfoPanel />
      <BudgetPanel />
      <DemographyPanel />
      <BuildingPicker />
      <RoadPicker />
      <MoreSheet cityName={options.name} onNewCity={onNewCity} onSave={onSave} beforeLogout={beforeLogout} />
      <Notices />
      <CostLabel />
      <ControlsHint />
      {/* Starts on a new city until finished; an opened city only carries on a tour left midway. */}
      <Tour autoStart={options.demo ? 'never' : options.save ? 'resume' : 'start'} />
      <GuestLimit cityName={options.name} />
    </>
  );
}
