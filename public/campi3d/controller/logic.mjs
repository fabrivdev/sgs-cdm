/** Pure deterministic state/posture scheduling. No DOM, renderer, or Three.js. */
export const STATE_IDS = Object.freeze([
  'sereno', 'contento', 'atento', 'preocupado',
  'pensativo', 'sorprendido', 'explicativo', 'alivio',
]);
export const POSTURE_IDS = Object.freeze([
  'centrado_suelto', 'peso_izquierdo', 'peso_derecho', 'manos_bajas_juntas',
]);
export const DEFAULT_RANGES = Object.freeze(Object.fromEntries(STATE_IDS.map((id, i) => [
  id, { start_frame: 493 + i * 97, end_frame: 589 + i * 97, duration_seconds: 4 },
])));

export function mulberry32(seed = 216834) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Exhaust every choice before reusing it; protect recent choices at bag seams. */
export class NoRepeatBag {
  constructor(values, random = Math.random, avoidRecent = 2) {
    if (new Set(values).size !== values.length || !values.length) {
      throw new Error('NoRepeatBag requires a non-empty list of unique choices.');
    }
    this.values = [...values];
    this.random = random;
    this.avoidRecent = Math.min(avoidRecent, values.length - 1);
    this.bag = [];
    this.history = [];
  }
  record(value) {
    if (!this.values.includes(value)) throw new Error(`Unknown choice: ${value}`);
    if (this.history.at(-1) !== value) this.history.push(value);
    this.history = this.history.slice(-this.avoidRecent);
    this.bag = this.bag.filter(v => v !== value);
  }
  next() {
    if (!this.bag.length) this.bag = [...this.values];
    let candidates = this.bag.filter(v => !this.history.includes(v));
    // A nearly exhausted bag may contain only recent choices; do not immediately repeat.
    if (!candidates.length) candidates = this.bag.filter(v => v !== this.history.at(-1));
    if (!candidates.length) {
      // Only possible after explicit selections consume a nonstandard sequence.
      this.bag = [...this.values];
      candidates = this.bag.filter(v => !this.history.includes(v));
      if (!candidates.length) candidates = this.bag;
    }
    const result = candidates[Math.floor(this.random() * candidates.length)];
    this.record(result);
    return result;
  }
}

export class CampiDirector {
  constructor({
    seed = 216834, auto, autoPosture = auto ?? true, demoAutoStates = false, initialState = 'sereno',
    initialPosture = 'peso_izquierdo', minHold = 5.8, maxHold = 9.2,
    minPostureHold = 7.5, maxPostureHold = 12.5,
  } = {}) {
    if (!(minHold > 0 && maxHold >= minHold)) throw new Error('Invalid hold interval.');
    if (!(minPostureHold > 0 && maxPostureHold >= minPostureHold)) throw new Error('Invalid posture hold interval.');
    this.random = mulberry32(seed);
    this.states = new NoRepeatBag(STATE_IDS, this.random, 3);
    this.postures = new NoRepeatBag(POSTURE_IDS, this.random, 2);
    this.minHold = minHold;
    this.maxHold = maxHold;
    this.minPostureHold = minPostureHold;
    this.maxPostureHold = maxPostureHold;
    this.autoPosture = Boolean(autoPosture);
    this.demoAutoStates = Boolean(demoAutoStates);
    this.time = 0;
    this.revision = 0;
    this.events = [];
    this.enter(initialState, initialPosture);
  }
  enter(state, posture, options = {}) {
    if (!STATE_IDS.includes(state)) throw new Error(`Unknown state: ${state}`);
    if (!POSTURE_IDS.includes(posture)) throw new Error(`Unknown posture: ${posture}`);
    const postureChanged = posture !== this.posture;
    this.state = state;
    this.posture = posture;
    this.states.record(state);
    this.postures.record(posture);
    this.elapsed = 0;
    this.holdSeconds = options.holdSeconds ?? this.minHold + this.random() * (this.maxHold - this.minHold);
    // A short acting phrase followed by a real still hold, not a perpetual idle oscillation.
    this.playSeconds = options.playSeconds ?? (1.25 + this.random() * 0.55);
    this.phaseStart = options.phaseStart ?? (0.15 + this.random() * 0.35);
    if (![this.holdSeconds, this.playSeconds, this.phaseStart].every(Number.isFinite)
      || !(this.holdSeconds > 0 && this.playSeconds >= 0 && this.phaseStart >= 0)) {
      throw new Error('Invalid state timing.');
    }
    this.revision++;
    this.events.push({
      time: this.time, state, posture, holdSeconds: this.holdSeconds,
      playSeconds: this.playSeconds, phaseStart: this.phaseStart, revision: this.revision,
    });
    if (this.events.length > 4096) this.events.shift();
    if (postureChanged || this.postureHoldSeconds === undefined) this.resetPostureClock();
  }
  setState(state, { posture, restart = false, ...timing } = {}) {
    if (!STATE_IDS.includes(state)) throw new Error(`Unknown state: ${state}`);
    // A contextual state is authoritative and stable, even if a demo was running.
    this.demoAutoStates = false;
    const requestedPosture = posture ?? this.posture;
    if (!restart && state === this.state && requestedPosture === this.posture) return false;
    this.enter(state, requestedPosture, timing);
    return true;
  }
  setPosture(posture, options = {}) {
    if (!POSTURE_IDS.includes(posture)) throw new Error(`Unknown posture: ${posture}`);
    if (posture === this.posture) return false;
    this.posture = posture;
    this.postures.record(posture);
    this.resetPostureClock();
    this.revision++;
    // Keep the expression/phrase clock when just shifting support.
    this.events.push({ time: this.time, state: this.state, posture, postureOnly: true, revision: this.revision });
    if (this.events.length > 4096) this.events.shift();
    if (options.extendHold) this.holdSeconds = Math.max(this.holdSeconds, this.elapsed + options.extendHold);
    return true;
  }
  resetPostureClock() {
    this.postureElapsed = 0;
    this.postureHoldSeconds = this.minPostureHold + this.random() * (this.maxPostureHold - this.minPostureHold);
  }
  setAutoPosture(enabled) {
    const next = Boolean(enabled);
    if (next && !this.autoPosture) this.resetPostureClock();
    this.autoPosture = next;
    return next;
  }
  setDemoAutoStates(enabled) {
    const next = Boolean(enabled);
    if (next && !this.demoAutoStates) {
      // Enabling a demo schedules a future change; it never restarts the current gesture.
      this.holdSeconds = this.elapsed + this.minHold + this.random() * (this.maxHold - this.minHold);
    }
    this.demoAutoStates = next;
    return next;
  }
  /** Deprecated compatibility alias: auto now means support variation only. */
  setAuto(enabled) { return this.setAutoPosture(enabled); }
  get auto() { return this.autoPosture; }
  tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be finite and non-negative.');
    let remaining = dt;
    while (remaining > 0) {
      const stateBoundary = this.demoAutoStates ? Math.max(0, this.holdSeconds - this.elapsed) : Infinity;
      const postureBoundary = this.autoPosture ? Math.max(0, this.postureHoldSeconds - this.postureElapsed) : Infinity;
      const chunk = Math.min(remaining, stateBoundary, postureBoundary);
      this.elapsed += chunk;
      this.postureElapsed += chunk;
      this.time += chunk;
      remaining -= chunk;
      const stateDue = this.demoAutoStates && this.elapsed >= this.holdSeconds - 1e-10;
      const postureDue = this.autoPosture && this.postureElapsed >= this.postureHoldSeconds - 1e-10;
      if (stateDue) this.enter(this.states.next(), this.posture);
      if (postureDue) this.setPosture(this.postures.next());
      if (!stateDue && !postureDue) break;
    }
    return this.snapshot();
  }
  snapshot() {
    return {
      time: this.time, state: this.state, posture: this.posture, revision: this.revision,
      elapsed: this.elapsed, holdSeconds: this.holdSeconds,
      phase: (this.phaseStart + Math.min(this.elapsed, this.playSeconds)) % 4,
      holding: this.elapsed >= this.playSeconds, auto: this.autoPosture,
      autoPosture: this.autoPosture, demoAutoStates: this.demoAutoStates,
      postureElapsed: this.postureElapsed, postureHoldSeconds: this.postureHoldSeconds,
    };
  }
}

/** Exact critically-damped scalar spring integration for a constant target. */
export function criticalStep(value, velocity, target, omega, dt) {
  const error = value - target;
  const temp = velocity + omega * error;
  const decay = Math.exp(-omega * dt);
  return [
    target + (error + temp * dt) * decay,
    (velocity - omega * temp * dt) * decay,
  ];
}

export const REVIEW_TIMELINE = Object.freeze(STATE_IDS.map((state, i) => ({
  time: i * 3.4,
  state,
  posture: [
    'peso_izquierdo', 'centrado_suelto', 'manos_bajas_juntas', 'peso_derecho',
    'peso_izquierdo', 'manos_bajas_juntas', 'peso_derecho', 'centrado_suelto',
  ][i],
  phaseStart: [0.23, 0.47, 0.19, 0.31, 0.22, 0.43, 0.34, 0.17][i],
  playSeconds: [1.35, 1.48, 1.3, 1.25, 1.45, 1.28, 1.48, 1.4][i],
  holdSeconds: 3.4,
})));
