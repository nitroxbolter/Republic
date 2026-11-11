import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import type { GameOptions } from '../game/Game';
import { hasJournal } from '../save/journal';
import { loadCity, recoverNewCity } from '../save/loadCity';
import type { CityRef } from '../save/SaveStore';
import { AuthDialog } from './account/AuthDialog';
import { track, trackVisit } from './analytics';
import { authAtom } from './atoms';
import { useAuthBootstrap } from './auth';
import { clearUrlOptions, demoOptions, isDemoRoute, readCityRef, readUrlOptions, writeCityUrl, writeDemoUrl, writeUrlOptions } from './options';
import { GameScreen } from './screens/GameScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { guestAtom, setChoseGuest } from './screens/landing/guest';
import { LandingScreen } from './screens/landing/LandingScreen';

/** What's on screen. A playing city knows its save (null for a new or demo city). */
type Screen =
  | { readonly kind: 'menu'; readonly notice?: string }
  | { readonly kind: 'recovering' }
  | { readonly kind: 'loading'; readonly ref: CityRef }
  | { readonly kind: 'play'; readonly options: GameOptions; readonly ref: CityRef | null };

function initialScreen(): Screen {
  if (isDemoRoute()) return { kind: 'play', options: demoOptions(), ref: null };
  // A new city closed before its first save is in the journal: store it, then reopen it.
  if (hasJournal('new')) return { kind: 'recovering' };
  const ref = readCityRef();
  if (ref) return { kind: 'loading', ref };
  const options = readUrlOptions();
  return options ? { kind: 'play', options, ref: null } : { kind: 'menu' };
}

/**
 * The start screen (your cities, or found a new one) until a city is chosen or the URL names
 * one, then the game. `/demo` opens a planned, fully grown city straight away.
 */
export function App() {
  useAuthBootstrap();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const auth = useAtomValue(authAtom);
  const [guest, setGuest] = useAtom(guestAtom);

  useEffect(() => trackVisit(), []);
  // Every city that goes into play (new, opened, demo, or straight from a URL) counts once.
  const playing = screen.kind === 'play' ? screen.options : null;
  useEffect(() => {
    if (!playing) return;
    track('city_start', {
      kind: playing.save ? 'open' : playing.demo ? 'demo' : 'new',
      preset: playing.terrain.preset,
      size: playing.terrain.size,
      customFunds: playing.funds !== undefined,
    });
  }, [playing]);

  // Load a saved city, then play it; on failure, back to the menu with the reason.
  const loadingRef = screen.kind === 'loading' ? screen.ref : null;
  useEffect(() => {
    if (!loadingRef) return;
    let cancelled = false;
    loadCity(loadingRef)
      .then(
        (data): Screen => ({ kind: 'play', options: { terrain: data.terrain, name: data.name, save: data }, ref: loadingRef }),
        (err: unknown): Screen => {
          clearUrlOptions();
          const reason = err instanceof Error ? err.message : 'unknown error';
          return { kind: 'menu', notice: `Couldn't open that city: ${reason}` };
        },
      )
      .then((next) => {
        if (!cancelled) setScreen(next);
      });
    return () => {
      cancelled = true;
    };
  }, [loadingRef]);

  const recovering = screen.kind === 'recovering';
  useEffect(() => {
    if (!recovering) return;
    recoverNewCity().then(
      (ref) => {
        if (ref) writeCityUrl(ref);
        setScreen(ref ? { kind: 'loading', ref } : { kind: 'menu' });
      },
      (err: unknown) => {
        // The journal stays, so the next visit tries again.
        const reason = err instanceof Error ? err.message : 'unknown error';
        setScreen({ kind: 'menu', notice: `Couldn't restore your unsaved city yet: ${reason}` });
      },
    );
  }, [recovering]);

  const start = (o: GameOptions) => {
    if (o.demo) writeDemoUrl(o.terrain.seed);
    else writeUrlOptions(o);
    setScreen({ kind: 'play', options: o, ref: null });
  };

  const open = (ref: CityRef) => {
    writeCityUrl(ref);
    setScreen({ kind: 'loading', ref });
  };

  const toMenu = useCallback(() => {
    if (isDemoRoute()) history.replaceState(null, '', '/');
    else clearUrlOptions();
    setScreen({ kind: 'menu' });
  }, []);

  const playAsGuest = () => {
    setChoseGuest(true);
    setGuest(true);
  };
  // Visitors who aren't signed in meet the landing page first; signing in or choosing guest moves on.
  const menu = screen.kind === 'menu';
  const landing = menu && auth.status === 'guest' && !guest;

  return (
    <>
      {menu && auth.status === 'checking' && <div className="landing-blank" />}
      {landing && <LandingScreen onPlay={playAsGuest} onDemo={() => start(demoOptions())} />}
      {menu && !landing && auth.status !== 'checking' && <NewGameScreen onStart={start} onOpen={open} notice={screen.notice} />}
      {(screen.kind === 'loading' || screen.kind === 'recovering') && <LoadingScreen kind="save" current="fetch" />}
      {screen.kind === 'play' && (
        <GameScreen
          options={screen.options}
          cityRef={screen.ref}
          onSaved={writeCityUrl}
          onReroll={(o) => start(o.demo ? demoOptions(o.terrain.seed) : o)}
          onNewCity={toMenu}
        />
      )}
      <AuthDialog />
    </>
  );
}
