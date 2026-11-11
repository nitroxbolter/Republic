import { atom, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { overlayAtom } from '../overlay/overlay';
import { api } from '../../save/api';
import type { TourProgress } from '../../shared/api';

/**
 * Tour progress lives on the device for everyone (fast, works offline) and, for signed-in
 * players, in their account too, so a second device doesn't start the tour again.
 */
const KEY = 'citybuilder.tour';

function isProgress(v: unknown): v is TourProgress {
  return typeof v === 'object' && v !== null && 'step' in v && typeof v.step === 'string' && 'done' in v && typeof v.done === 'boolean';
}

function readLocal(): TourProgress | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isProgress(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(p: TourProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode or blocked storage: the tour may offer itself again next time.
  }
}

/**
 * Where this player got to. Signed in, the account wins; a guest's progress that the account
 * doesn't have yet (they just signed up) is copied into it.
 */
export async function loadTourProgress(signedIn: boolean): Promise<TourProgress | null> {
  const local = readLocal();
  if (!signedIn) return local;
  try {
    const remote = await api.getTour();
    if (remote) {
      writeLocal(remote);
      return remote;
    }
    if (local) void api.putTour(local).catch(() => undefined);
    return local;
  } catch {
    return local;
  }
}

export function saveTourProgress(p: TourProgress, signedIn: boolean) {
  writeLocal(p);
  // Best effort: the device copy is enough to carry on, and the next save catches the account up.
  if (signedIn) void api.putTour(p).catch(() => undefined);
}

/** Index of the open tour step, or null when the tour is closed. */
export const tourStepAtom = atom<number | null>(null);

/** Replay the tour from the welcome card (the ? button), closing any open menu first. */
export function useStartTour(): () => void {
  const setStep = useSetAtom(tourStepAtom);
  const setOverlay = useSetAtom(overlayAtom);
  return useCallback(() => {
    setOverlay(null);
    setStep(0);
  }, [setOverlay, setStep]);
}
