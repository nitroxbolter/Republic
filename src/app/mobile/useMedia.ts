import { useSyncExternalStore } from 'react';

/** Live result of a CSS media query (re-renders when it flips, e.g. on rotation). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/*
 * Layout breakpoints. These mirror the media queries in app.css (see the note in tokens.css);
 * change both together.
 */

/** Phones and tablets held upright (or any narrow window): slim top bar, thumb dock, bottom sheets. */
export const PHONE = '(max-width: 900px) and (min-height: 521px)';
/** A short landscape screen (phones on their side): the HUD goes compact along the edges. */
export const COMPACT = '(max-height: 520px)';
/** The slim top bar, with a More sheet for the rest and the budget as a sheet: PHONE and COMPACT. */
export const SLIM_BAR = '(max-width: 900px) and (min-height: 521px), (max-height: 520px)';
/** Small screens: pickers are a sideways strip, the tour docks instead of pointing. */
export const SMALL_UI = '(max-width: 640px), (max-height: 520px)';
/** No hover and a coarse pointer: a touch screen. */
export const TOUCH = '(hover: none) and (pointer: coarse)';
