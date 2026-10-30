import { describe, it, expect, vi } from 'vitest';
import { playSelectorEntrance, SELECTOR_ENTRANCE } from './selectorEntrance';
function setup() {
  const pending: (() => void)[] = [];
  const animations: Animation[] = [];
  const animate = vi.fn(() => {
    let reject!: (reason?: unknown) => void;
    const finished = new Promise<Animation>((resolve, r) => { pending.push(() => resolve(animation)); reject = r; });
    const animation = { finished, cancel: vi.fn(() => reject()), pause: vi.fn(), play: vi.fn(), startTime: null } as unknown as Animation;
    animations.push(animation); return animation;
  });
  const element = () => { const el = document.createElement('div'); el.animate = animate; return el; };
  const elements = { title: element(), topics: element(), priorities: element() };
  return { animate, elements, animations, complete: () => pending.forEach(fn => fn()) };
}
describe('selector entrance lifecycle', () => {
  it('preserves Figma timing, one-shot playback and base layout styles', async () => {
    const t = setup(), h = playSelectorEntrance(t.elements);
    expect(t.animate.mock.calls.map(c => (c as unknown[])[1])).toEqual([0, 80, 160].map(delay => ({
      duration: 280, delay, easing: SELECTOR_ENTRANCE.easing, iterations: 1, fill: 'backwards',
    })));
    h.setPaused(true); expect(t.animations.every(a => vi.mocked(a.pause).mock.calls.length === 1)).toBe(true);
    h.setPaused(false); t.complete(); expect(await h.finished).toBe('completed');
    expect(Object.values(t.elements).every(e => e.getAttribute('style') === null)).toBe(true);
  });
  it('cancels all animations and settles on abort', async () => {
    const t = setup(), abort = new AbortController();
    const h = playSelectorEntrance(t.elements, { signal: abort.signal }); abort.abort();
    expect(await h.finished).toBe('cancelled'); h.cancel();
    expect(t.animations.every(a => vi.mocked(a.cancel).mock.calls.length === 1)).toBe(true);
  });
  it('does not create a zero-duration animation in reduced mode', async () => {
    const t = setup(), h = playSelectorEntrance(t.elements, { reducedMotion: true });
    expect(await h.finished).toBe('reduced'); expect(t.animate).not.toHaveBeenCalled();
  });
  it('finishes statically on preference changes or unsupported WAAPI', async () => {
    const t = setup(), h = playSelectorEntrance(t.elements); h.finishReduced();
    expect(await h.finished).toBe('reduced');
    t.elements.topics.animate = undefined;
    expect(await playSelectorEntrance(t.elements).finished).toBe('unsupported');
  });
});
