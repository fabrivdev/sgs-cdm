import type { CampiEmotion } from '../types';
import type { EntranceHandle } from './selectorEntrance';

export interface LocomotionSegment {
  kind: 'walk' | 'side-step' | 'turn'; to?: [number, number]; yaw?: number; duration?: number;
}
interface LocomotionStatus { token: number; status: string; kind: string }
// Depend only on fields consumed here; the JS runtime returns a richer snapshot.
interface MotionSnapshot {
  recipe?: { token?: string | number | null; events: unknown[] } | null;
  lastRecipe?: { token?: string | number | null } | null;
  reducedMotionSettling?: boolean;
  locomotion?: LocomotionStatus | null;
  lastLocomotion?: LocomotionStatus | null;
}

/** Structural adapter to the EXISTING CampiController. No new rig/mixer/clock. */
export interface WelcomeRuntime {
  setContext(context: { state: CampiEmotion; severity: 'normal' }): unknown;
  setAutoPosture(enabled: boolean): unknown;
  setDemoAutoStates(enabled: boolean): unknown;
  setReducedMotion(enabled: boolean): unknown;
  setPaused(paused: boolean): unknown;
  playRecipe(id: string, options: { token: string; afterState: CampiEmotion }): { started: boolean; status?: string };
  stopRecipe(reason?: string): unknown;
  snapshot(): MotionSnapshot;
  update(dt: number): MotionSnapshot;
  startLocomotion?(segments: LocomotionSegment[]): { started: boolean; status: string; token?: number };
  stopLocomotion?(reason?: string): unknown;
}
export type WelcomePhase = 'new' | 'entering' | 'greeting' | 'idle' | 'settling' | 'inviting' | 'positioning' | 'selector' | 'disposed';
export const WELCOME_CAPABILITIES = Object.freeze({
  greeting: 'personalidad-02', invitation: 'personalidad-12',
  walkingEntrance: 'CampiLocomotionController', braking: 'CampiLocomotionController', lateralLocomotion: 'CampiLocomotionController',
  // Opt-in extension, not the controller mounted in the current app.
});
let instanceSerial = 0;

/** One instance per owned runtime mount. Feed its update from the existing RAF.
 * UI is supplied by the future host; no routes, storage, data, or DOM are mounted here.
 */
export function createWelcomeMotion(runtime: WelcomeRuntime, options: {
  reentry?: boolean;
  revealOnPrepare?: boolean;
  stayWelcomeWhenReduced?: boolean;
  reducedMotion?: boolean;
  locomotion?: { entry?: LocomotionSegment[]; toSelector?: LocomotionSegment[] };
  signal?: AbortSignal;
  onPhase?(phase: WelcomePhase): void;
  revealSelector(reducedMotion: boolean): EntranceHandle;
  onIssue?(issue: string): void;
}) {
  if (options.locomotion && (!runtime.startLocomotion || !runtime.stopLocomotion)) {
    throw new Error('Explicit locomotion requires CampiLocomotionController; no CSS fallback is allowed.');
  }
  const instance = ++instanceSerial;
  let phase: WelcomePhase = 'new';
  let reduced = Boolean(options.reducedMotion), paused = false;
  let autonomousBlocked = reduced || Boolean(options.reentry);
  let requested = false, revealed = false, uiDone = false, gestureDone = false;
  let token = '', serial = 0;
  let travelToken: number | undefined;
  let selectorTravelStarted = false;
  let selectorTravelDone = !options.locomotion?.toSelector?.length;
  let entrance: EntranceHandle | undefined;
  let unsubscribe: (() => void) | undefined;
  const alive = () => phase !== 'disposed';
  const notify = (next: WelcomePhase) => { phase = next; options.onPhase?.(next); };
  const idle = () => {
    runtime.setAutoPosture(!reduced && !autonomousBlocked);
    notify('idle');
  };
  const finish = () => {
    if (alive() && phase !== 'selector' && requested && uiDone && gestureDone && selectorTravelDone) {
      runtime.setAutoPosture(!reduced && !autonomousBlocked);
      notify('selector');
    }
  };
  const reveal = () => {
    if (revealed || !alive()) return;
    revealed = true;
    try {
      entrance = options.revealSelector(reduced);
      if (!alive()) { entrance.cancel(); return; }
      entrance.setPaused(paused);
      void entrance.finished.then(() => {
        if (!alive()) return;
        uiDone = true; finish();
      }, () => {
        if (!alive()) return;
        options.onIssue?.('selector_entrance_failed'); uiDone = true; finish();
      });
    } catch {
      options.onIssue?.('selector_reveal_failed');
      // Report failure, never claim the selector mounted successfully.
    }
  };
  const play = (id: string, state: CampiEmotion) => {
    token = `welcome-${instance}-${++serial}`;
    try {
      runtime.setAutoPosture(false);
      runtime.setContext({ state, severity: 'normal' });
      const result = runtime.playRecipe(id, { token, afterState: state });
      if (!result.started) options.onIssue?.(`${id}:${result.status}`);
      return result.started;
    } catch { options.onIssue?.(`${id}:runtime_error`); return false; }
  };
  const invite = () => {
    notify('inviting');
    if (!alive()) return;
    if (!play(WELCOME_CAPABILITIES.invitation, 'atento')) {
      gestureDone = true; reveal();
    }
  };
  const travel = (segments: LocomotionSegment[], next: WelcomePhase) => {
    notify(next);
    if (!alive()) return false;
    try {
      const result = runtime.startLocomotion!(segments);
      travelToken = result.token;
      if (!result.started) options.onIssue?.(`locomotion:${result.status}`);
      return result.started;
    } catch { options.onIssue?.('locomotion:invalid_route'); return false; }
  };
  const greet = () => {
    notify('greeting');
    if (alive() && !play(WELCOME_CAPABILITIES.greeting, 'sereno') && alive()) idle();
  };
  const positionForSelector = () => {
    if (selectorTravelDone || selectorTravelStarted || !alive()) return;
    selectorTravelStarted = true;
    if (!travel(options.locomotion!.toSelector!, 'positioning')) selectorTravelDone = true;
  };
  const api = {
    get phase() { return phase; },
    get selectorVisible() { return revealed; },
    start() {
      if (phase !== 'new') return;
      runtime.setDemoAutoStates(false);
      runtime.setReducedMotion(reduced);
      runtime.setPaused(paused);
      if (options.reentry || (reduced && !options.stayWelcomeWhenReduced)) {
        requested = gestureDone = true;
        selectorTravelDone = true;
        notify('selector');
        if (!alive()) return;
        // Reentry is also a static selector, without an entrance replay.
        const wasReduced = reduced; reduced = true; reveal(); reduced = wasReduced;
        runtime.setAutoPosture(false);
      } else if (reduced) { idle(); } else {
        if (!options.locomotion?.entry?.length || !travel(options.locomotion.entry, 'entering')) {
          if (alive()) greet();
        }
      }
    },
    prepare() {
      if (!alive() || requested) return;
      // A click received before readiness/start must not get lost.
      if (phase === 'new') api.start();
      if (requested || !alive()) return;
      requested = true;
      if(options.revealOnPrepare)reveal();
      if (reduced) { gestureDone = true; reveal(); return; }
      if (runtime.snapshot().recipe || runtime.snapshot().locomotion) {
        notify('settling');
        if (alive()) { runtime.stopRecipe('welcome_prepare'); runtime.stopLocomotion?.('welcome_prepare'); }
      } else invite();
    },
    /** Only this call advances time; host must not also call runtime.update(dt). */
    update(dt: number) {
      if (!alive()) return runtime.snapshot();
      const snapshot = runtime.update(dt);
      if (phase === 'entering' && !gestureDone && !reduced && !snapshot.locomotion && snapshot.lastLocomotion?.token === travelToken) greet();
      if (phase === 'positioning' && !snapshot.locomotion && snapshot.lastLocomotion?.token === travelToken) selectorTravelDone = true;
      if (requested && gestureDone) { positionForSelector(); finish(); return snapshot; }
      if (phase === 'settling' && !snapshot.recipe && !snapshot.locomotion && !snapshot.reducedMotionSettling && !paused) invite();
      else if (phase === 'greeting' && !snapshot.recipe && snapshot.lastRecipe?.token === token) idle();
      else if (phase === 'inviting') {
        const active = snapshot.recipe;
        if (active?.token === token && active.events.some(e =>
          typeof e === 'object' && e !== null && 'type' in e && e.type === 'inviting_palm_open')) reveal();
        if (!active && snapshot.lastRecipe?.token === token) {
          gestureDone = true; reveal(); positionForSelector(); finish();
        }
      }
      return snapshot;
    },
    setPaused(value: boolean) {
      if (!alive()) return;
      paused = value; runtime.setPaused(value); entrance?.setPaused(value);
    },
    setReducedMotion(value: boolean) {
      if (!alive() || reduced === value) return;
      reduced = value;
      runtime.setReducedMotion(value);
      if (value) {
        autonomousBlocked = true;
        runtime.setAutoPosture(false);
        gestureDone = true;
        selectorTravelDone = true;
        if(options.stayWelcomeWhenReduced&&!requested){idle();return;}
        if (phase !== 'new') {
          requested = true; reveal(); entrance?.finishReduced(); finish();
        }
      }
      // Turning it off never replays the greeting or autonomously restarts motion.
    },
    /** Optional browser binding, explicitly installed by the future host. */
    bindEnvironment(media: MediaQueryList, document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>) {
      if (!alive()) return () => {};
      unsubscribe?.();
      const motion = () => api.setReducedMotion(media.matches);
      const visibility = () => api.setPaused(document.hidden);
      media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
      motion(); visibility();
      const remove = () => {
        media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility);
      };
      unsubscribe = remove;
      return remove;
    },
    dispose() {
      if (!alive()) return;
      phase = 'disposed';
      options.signal?.removeEventListener('abort', api.dispose);
      unsubscribe?.(); unsubscribe = undefined;
      entrance?.cancel();
      runtime.stopRecipe('welcome_disposed');
      runtime.stopLocomotion?.('welcome_disposed');
      runtime.setAutoPosture(false); runtime.setPaused(true);
      // Host still owns renderer/controller disposal; never publish after unmount.
    },
  };
  options.signal?.addEventListener('abort', api.dispose, { once: true });
  if (options.signal?.aborted) api.dispose();
  return api;
}
