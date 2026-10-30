/** Figma IkBozPmGN7IgABQz3ss2by / 27:208, verified 2026-10-22.
 * The Figma preview loops at 2s; product entry is explicitly one-shot.
 * Only dedicated UI wrappers animate. Never pass the character or CTA here.
 */
export const SELECTOR_ENTRANCE = Object.freeze({
  title: { nodeId: '27:209', delay: 0 },
  topics: { nodeId: '27:223', delay: 80 },
  priorities: { nodeId: '27:242', delay: 160 },
  duration: 280, distance: 12, easing: 'cubic-bezier(0, 0, 0.58, 1)',
});
export type EntranceResult = 'completed' | 'cancelled' | 'reduced' | 'unsupported';
export interface EntranceHandle {
  finished: Promise<EntranceResult>;
  cancel(): void;
  finishReduced(): void;
  setPaused(paused: boolean): void;
}
export type SelectorElements = Record<'title' | 'topics' | 'priorities', HTMLElement>;

/** Wrappers must have their final opacity/translate in base styles (1 / 0).
 * Uses the exported Figma fade/translate curves with the verified segment times.
 * Does not change focus, pointer events, layout, or any persisted preferences.
 */
export function playSelectorEntrance(elements: SelectorElements, options: {
  signal?: AbortSignal; reducedMotion?: boolean;
} = {}): EntranceHandle {
  let done = false;
  let resolve!: (value: EntranceResult) => void;
  const finished = new Promise<EntranceResult>(r => { resolve = r; });
  const animations: Animation[] = [];
  const settle = (result: EntranceResult) => {
    if (done) return;
    done = true;
    options.signal?.removeEventListener('abort', abort);
    animations.forEach(animation => animation.cancel());
    resolve(result);
  };
  const abort = () => settle('cancelled');
  const handle: EntranceHandle = {
    finished, cancel: abort, finishReduced: () => settle('reduced'),
    setPaused(paused) { if (!done) animations.forEach(a => paused ? a.pause() : a.play()); },
  };
  if (options.signal?.aborted) { settle('cancelled'); return handle; }
  if (options.reducedMotion) { settle('reduced'); return handle; }
  if (Object.values(elements).some(el => typeof el.animate !== 'function')) {
    settle('unsupported'); return handle;
  }
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const startTime = elements.title.ownerDocument.timeline?.currentTime;
    for (const key of ['title', 'topics', 'priorities'] as const) {
      const animation = elements[key].animate([
        { opacity: 0, translate: `0px ${SELECTOR_ENTRANCE.distance}px` },
        { opacity: 1, translate: '0px 0px' },
      ], { duration: SELECTOR_ENTRANCE.duration, delay: SELECTOR_ENTRANCE[key].delay,
        easing: SELECTOR_ENTRANCE.easing, iterations: 1, fill: 'backwards' });
      animations.push(animation);
      // Register rejection immediately: cancelling any partially constructed group is safe.
      void animation.finished.catch(() => undefined);
      if (typeof startTime === 'number') animation.startTime = startTime;
    }
    void Promise.all(animations.map(a => a.finished)).then(
      () => settle('completed'), () => settle('cancelled'),
    );
  } catch { settle('unsupported'); }
  return handle;
}
