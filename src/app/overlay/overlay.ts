import { atom, useAtom } from 'jotai';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * The overlay manager (D-098). Menus and sheets share one slot, so opening one closes whatever
 * else was open: two never stack or fight over the same corner of the screen. Contextual panels
 * that follow the game (the inspect panel, pickers for the active tool) are driven by the game
 * instead; on phones GameScreen keeps them from sharing the bottom sheet with these.
 */
export type OverlayId =
  /** Top-bar menus. */
  | 'clock'
  | 'stage'
  | 'alerts'
  | 'account'
  /** Phones: the sheet with everything the slim top bar leaves out. */
  | 'more'
  /** The budget and taxes panel (from the funds button). */
  | 'budget';

export const overlayAtom = atom<OverlayId | null>(null);

export interface OverlayHandle {
  readonly open: boolean;
  toggle: () => void;
  close: () => void;
  show: () => void;
}

/** Open, close or toggle one overlay; opening it closes any other. */
export function useOverlay(id: OverlayId): OverlayHandle {
  const [current, setCurrent] = useAtom(overlayAtom);
  const open = current === id;
  const toggle = useCallback(() => setCurrent((c) => (c === id ? null : id)), [id, setCurrent]);
  const close = useCallback(() => setCurrent((c) => (c === id ? null : c)), [id, setCurrent]);
  const show = useCallback(() => setCurrent(id), [id, setCurrent]);
  return { open, toggle, close, show };
}

/**
 * While `open`, a press outside `ref` (unless `outside` is false) or Escape calls `onClose`. Escape is caught before the
 * game sees it (capture phase), so it closes the menu rather than also cancelling the tool;
 * the next Escape reaches the game as usual.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, { outside = true }: { outside?: boolean } = {}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeRef.current();
    };
    if (outside) window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [open, ref, outside]);
}
