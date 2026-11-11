import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { activeToolAtom, authAtom, cityAtom, fundsAtom, gameAtom, worldVersionAtom } from '../atoms';
import { SMALL_UI, TOUCH, useMedia } from '../mobile/useMedia';
import { TOUR_STEPS, type TourSnapshot } from './steps';
import { loadTourProgress, saveTourProgress, tourStepAtom } from './tourState';

type Store = ReturnType<typeof useStore>;

/** Pause after a goal is met, so the player sees the tick before the next step. */
const CLEARED_MS = 900;
/** Space between the card and the control it points at. */
const GAP = 14;
const CARD_W = 320;
const GUTTER = 16;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function readSnapshot(store: Store): TourSnapshot {
  return { tool: store.get(activeToolAtom), funds: store.get(fundsAtom), worldVersion: store.get(worldVersionAtom), city: store.get(cityAtom) };
}

/** What the card has to fit around this frame. */
interface TourLayout {
  /** The control the step means; null when hidden or missing. */
  readonly target: Rect | null;
  /** The control is already switched on (a selected tab): no need to ring it. */
  readonly targetOn: boolean;
  /** An open building or road picker, which the card must never cover. */
  readonly picker: Rect | null;
}

const NO_LAYOUT: TourLayout = { target: null, targetOn: false, picker: null };

function rectOf(el: Element | null): Rect | null {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}

const keyOf = (r: Rect | null) => (r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : '-');

/**
 * Where the `data-tour` control and any open picker are, followed every frame (panels animate
 * and the compact toolbar scrolls). Scrolls the compact toolbar to the control once.
 */
function useTourLayout(name: string | undefined): TourLayout {
  const [layout, setLayout] = useState<TourLayout>(NO_LAYOUT);
  useEffect(() => {
    let frame = 0;
    let last = '';
    let scrolled = false;
    const tick = () => {
      const el = name ? document.querySelector<HTMLElement>(`[data-tour="${name}"]`) : null;
      const target = rectOf(el);
      if (el && target && !scrolled) {
        scrolled = true;
        // Only the sideways toolbar strip (phones) scrolls, never the page: scrollIntoView would
        // move every scrollable ancestor and shift the whole HUD.
        const strip = el.closest<HTMLElement>('.toolbar');
        if (strip && strip.scrollWidth > strip.clientWidth) {
          strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
        }
      }
      const targetOn = el?.getAttribute('aria-selected') === 'true';
      const picker = rectOf(document.querySelector('.building-picker, .road-picker'));
      const key = `${keyOf(target)}|${targetOn}|${keyOf(picker)}`;
      if (key !== last) {
        last = key;
        setLayout({ target, targetOn, picker });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [name]);
  return layout;
}

const overlapsX = (r: Rect, left: number, width: number) => r.left < left + width && left < r.left + r.width;
const inside = (inner: Rect, outer: Rect) =>
  inner.left >= outer.left && inner.top >= outer.top && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;

/** Opening by itself: on a new city from the start, on an opened one only to carry on a tour left midway. */
export type TourAutoStart = 'start' | 'resume' | 'never';

const signedIn = (store: Store) => store.get(authAtom).status === 'user';

/**
 * First-play tour: one card at a time that points at a control and waits for the player to use
 * it. Progress is kept (device, and account when signed in); the ? button in the top bar replays it.
 */
export function Tour({ autoStart }: { autoStart: TourAutoStart }) {
  const [step, setStep] = useAtom(tourStepAtom);
  const game = useAtomValue(gameAtom);
  const authChecked = useAtomValue(authAtom).status !== 'checking';
  const store = useStore();
  const offered = useRef(false);

  useEffect(() => {
    if (autoStart === 'never' || !game || !authChecked || offered.current) return;
    offered.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void loadTourProgress(signedIn(store)).then((p) => {
      if (cancelled || p?.done) return;
      const at = p ? TOUR_STEPS.findIndex((s) => s.id === p.step) : -1;
      if (at < 0 && autoStart === 'resume') return;
      // A moment after the city fades in, so the first thing seen is the map.
      timer = setTimeout(() => setStep(Math.max(0, at)), 800);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      offered.current = false;
    };
  }, [autoStart, game, authChecked, store, setStep]);
  // Leaving the city closes it.
  useEffect(() => () => setStep(null), [setStep]);

  return step === null || !game ? null : <TourCard index={step} />;
}

function TourCard({ index }: { index: number }) {
  const store = useStore();
  const setStep = useSetAtom(tourStepAtom);
  const touch = useMedia(TOUCH);
  const compact = useMedia(SMALL_UI);
  const [minimized, setMinimized] = useState(false);

  const tool = useAtomValue(activeToolAtom);
  const funds = useAtomValue(fundsAtom);
  const worldVersion = useAtomValue(worldVersionAtom);
  const city = useAtomValue(cityAtom);
  const now = useMemo<TourSnapshot>(() => ({ tool, funds, worldVersion, city }), [tool, funds, worldVersion, city]);
  const [start, setStart] = useState(() => readSnapshot(store));

  const step = TOUR_STEPS[index];
  const met = step.done?.(now, start) ?? false;
  const last = index === TOUR_STEPS.length - 1;

  const stepId = step.id;
  const end = useCallback(() => {
    saveTourProgress({ step: stepId, done: true }, signedIn(store));
    setStep(null);
  }, [stepId, store, setStep]);
  const go = useCallback(
    (next: number) => {
      if (next >= TOUR_STEPS.length) return end();
      saveTourProgress({ step: TOUR_STEPS[next].id, done: false }, signedIn(store));
      setStart(readSnapshot(store));
      setStep(next);
    },
    [store, setStep, end],
  );

  useEffect(() => {
    if (!met) return;
    const t = setTimeout(() => go(index + 1), CLEARED_MS);
    return () => clearTimeout(t);
  }, [met, go, index]);

  // A step that opened a panel points into it from then on (e.g. the Utilities tab).
  const stage = step.inside?.when(now) ? step.inside : null;
  const { target: rect, targetOn, picker } = useTourLayout(step.modal ? undefined : (stage?.target ?? step.target));
  const copy = stage?.body ?? step.body;
  const body = touch ? copy.touch : copy.mouse;
  // Progress counts the steps between the welcome and the goodbye.
  const total = TOUR_STEPS.length - 2;

  if (step.modal) {
    return (
      <div className="tour-backdrop">
        <div className="panel tour-card is-modal" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <h2 id="tour-title" className="tour-title">
            {step.title}
          </h2>
          <p className="tour-body">{body}</p>
          <div className="tour-actions">
            {index === 0 && (
              <button type="button" className="tour-link" onClick={end}>
                Skip tour
              </button>
            )}
            <button type="button" className="tour-primary" autoFocus onClick={() => go(index + 1)}>
              {last ? 'Start building' : 'Show me around'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ring = rect && !targetOn && (
    <div
      className="tour-ring"
      aria-hidden="true"
      style={{ left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 }}
    />
  );

  // Phones: the card docks (right edge on landscape, top on portrait) and folds into a pill to free the map.
  if (compact && minimized) {
    return (
      <>
        {ring}
        <button type="button" className="panel tour-pill" onClick={() => setMinimized(false)} aria-label={`Show tour step: ${step.title}`}>
          <span className="tour-count">
            {index}/{total}
          </span>
          {step.title}
        </button>
      </>
    );
  }

  // Elsewhere it sits above or below its control, arrow pointing at it; free steps go top centre.
  // An open picker is never covered: a card for a control below it (the toolbar) goes above the
  // picker instead, without the arrow, and the ring still marks the control.
  let placement: CSSProperties | undefined;
  let arrow: CSSProperties | undefined;
  let side: 'above' | 'below' | 'free' = 'free';
  if (compact) {
    const width = Math.min(260, window.innerWidth * 0.4);
    if (picker && overlapsX(picker, window.innerWidth - width - 8, width)) placement = { maxHeight: Math.max(96, picker.top - 52) };
  } else if (rect) {
    const width = Math.min(CARD_W, window.innerWidth - GUTTER * 2);
    const centre = rect.left + rect.width / 2;
    const left = Math.max(GUTTER, Math.min(window.innerWidth - width - GUTTER, centre - width / 2));
    // A control inside the picker (a tab) gets the card above the whole picker, arrow down to it.
    const inPicker = picker !== null && inside(rect, picker);
    side = inPicker || rect.top + rect.height / 2 > window.innerHeight / 2 ? 'above' : 'below';
    const blocked = side === 'above' && picker !== null && !inPicker && picker.top < rect.top && overlapsX(picker, left, width);
    const anchorTop = picker && (inPicker || blocked) ? picker.top : rect.top;
    placement = side === 'above' ? { left, width, bottom: window.innerHeight - anchorTop + GAP } : { left, width, top: rect.top + rect.height + GAP };
    if (!blocked) arrow = { left: Math.max(18, Math.min(width - 18, centre - left)) };
  }

  return (
    <>
      {ring}
      <div
        key={step.id}
        className={`panel tour-card ${compact ? 'is-docked' : `is-${side}`} ${met ? 'is-cleared' : ''}`}
        style={placement}
        role="dialog"
        aria-labelledby="tour-title"
      >
        {arrow && <span className="tour-arrow" style={arrow} aria-hidden="true" />}
        <div className="tour-head">
          <span className="tour-count">
            {index} of {total}
          </span>
          {compact && (
            <button type="button" className="tour-icon" onClick={() => setMinimized(true)} aria-label="Fold the tour away">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button type="button" className="tour-icon" onClick={end} aria-label="End the tour">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <h2 id="tour-title" className="tour-title">
          {met && (
            <span className="tour-tick" aria-label="Done">
              ✓
            </span>
          )}
          {step.title}
        </h2>
        <p className="tour-body">{body}</p>
        <div className="tour-progress" aria-hidden="true">
          {Array.from({ length: total }, (_, k) => (
            <span key={k} className={`tour-dot ${k + 1 < index ? 'is-done' : k + 1 === index ? 'is-now' : ''}`} />
          ))}
        </div>
        <div className="tour-actions">
          {index > 1 && (
            <button type="button" className="tour-link" onClick={() => go(index - 1)}>
              Back
            </button>
          )}
          {step.done ? (
            <button type="button" className="tour-link" onClick={() => go(index + 1)}>
              Skip step
            </button>
          ) : (
            <button type="button" className="tour-primary" onClick={() => go(index + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </>
  );
}
