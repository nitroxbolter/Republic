/**
 * The steps a city goes through before its first frame (D-099), in order. `Game.create` reports
 * each one as it starts, so the loading screen shows what is really happening; nothing here is
 * timed or estimated.
 */
export const LOAD_STAGES = ['world', 'simulation', 'graphics', 'art', 'map', 'enter'] as const;
export type LoadStage = (typeof LOAD_STAGES)[number];

/** Called as each stage starts. May return a promise: creation waits for it (one painted frame). */
export type LoadProgress = (stage: LoadStage) => void | Promise<void>;

/**
 * Wait for the browser to paint once. The steps between stages are long synchronous jobs, so
 * without this the loading screen would never get a chance to show the new stage.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve();
    // Two frames: the first runs before the paint that shows the change, the second after it.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    // A tab in the background gets no frames at all; don't hold the city up waiting for one.
    setTimeout(resolve, 120);
  });
}
