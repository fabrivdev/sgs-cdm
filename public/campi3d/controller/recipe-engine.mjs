import { STATE_IDS, POSTURE_IDS } from './logic.mjs';
/** Recipe timing and authorization are renderer-independent and deterministic. */
export const SEVERITIES = Object.freeze(['normal', 'important', 'critical']);
export const TARGET_NAMES = Object.freeze(['priority1', 'priority2', 'priority3', 'priority4', 'conversation', 'primary', 'secondary']);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const smooth = value => {
  const t = clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};

export function normalizeTarget(target, fallback = [0, 0, 1]) {
  if (target !== undefined && (!target || typeof target !== 'object' || !Array.isArray(target.direction))) {
    throw new TypeError('An explicit target must be { direction: [x, y, z] }; malformed targets cannot use a fallback.');
  }
  const input = target === undefined ? fallback : target.direction;
  if (!Array.isArray(input) || input.length !== 3 || !input.every(Number.isFinite)) {
    throw new TypeError('A target must be { direction: [x, y, z] } with finite local glTF coordinates.');
  }
  const length = Math.hypot(...input);
  if (length < 1e-8) throw new RangeError('Target direction cannot be zero.');
  const yaw = clamp(Math.atan2(input[0], input[2]), -0.85, 0.85);
  const pitch = clamp(Math.asin(clamp(input[1] / length, -1, 1)), -0.55, 0.65);
  return { direction: [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)] };
}

/** Named contextual targets are semantic: a conversation is not an indicator. */
export function resolveRecipeTargets(recipe, options = {}, targets = {}, forSample = false) {
  if (options.target !== undefined) normalizeTarget(options.target);
  if (options.secondaryTarget !== undefined) normalizeTarget(options.secondaryTarget);
  const conversation = recipe.targetRole === 'conversation';
  const secondaryConversation = recipe.secondaryTargetRole === 'conversation';
  const primary = options.target ?? (conversation ? targets.conversation : targets.primary ?? targets.priority1);
  const secondary = options.secondaryTarget ?? (secondaryConversation ? targets.conversation : targets.secondary ?? targets.priority2);
  if (!forSample && recipe.requiresTarget && !primary) return { status: 'missing_target', reason: recipe.targetRole ?? 'A real target is required.' };
  if (!forSample && recipe.requiresSecondaryTarget && !secondary) return { status: 'missing_secondary_target', reason: 'A second real target is required.' };
  const target = normalizeTarget(primary, forSample && recipe.requiresTarget ? [0.6, recipe.targetSector === 'lower' ? -.3 : .1, 1] : [0, 0, 1]);
  const secondaryTarget = normalizeTarget(secondary, forSample && recipe.requiresSecondaryTarget ? [-.65, .05, 1] : [0, 0, 1]);
  if (recipe.targetSector === 'lower' && target.direction[1] >= -.05) return { status: 'invalid_target_sector', reason: 'This recipe needs a visible target below the character gaze.' };
  if (recipe.requiresSecondaryTarget) {
    const cosine = target.direction.reduce((sum, v, i) => sum + v * secondaryTarget.direction[i], 0);
    if (cosine > Math.cos(8 * Math.PI / 180)) return { status: 'targets_too_close', reason: 'The two visible targets must be at least 8 degrees apart.' };
  }
  return { target, secondaryTarget };
}

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe.id !== 'string' || !recipe.id) throw new TypeError('A recipe requires an id.');
  if (recipe.state !== undefined && recipe.state !== null && !STATE_IDS.includes(recipe.state)) throw new Error(`${recipe.id}: unknown contextual state.`);
  if (recipe.requiresSeverity && !SEVERITIES.includes(recipe.requiresSeverity)) throw new Error(`${recipe.id}: unknown required severity.`);
  if (recipe.compatiblePostures !== undefined) {
    if (!Array.isArray(recipe.compatiblePostures) || !recipe.compatiblePostures.length || recipe.compatiblePostures.some(p => !POSTURE_IDS.includes(p))) throw new Error(`${recipe.id}: invalid compatiblePostures.`);
    if (recipe.preferredPosture && !recipe.compatiblePostures.includes(recipe.preferredPosture)) throw new Error(`${recipe.id}: preferredPosture must be compatible.`);
  }
  if (recipe.status === 'blocked_anatomy') return recipe;
  if (!Number.isFinite(recipe.duration) || recipe.duration <= 0 || recipe.duration > 30) {
    throw new RangeError(`${recipe.id}: duration must be finite and between 0 and 30 seconds.`);
  }
  for (const [name, keys] of Object.entries(recipe.tracks ?? {})) {
    if (!Array.isArray(keys) || !keys.length) throw new TypeError(`${recipe.id}/${name}: missing curve keys.`);
    let previous = -Infinity;
    for (const key of keys) {
      if (!Array.isArray(key) || key.length !== 2 || !key.every(Number.isFinite) || key[0] < 0 || key[0] > 1 || key[0] < previous) {
        throw new TypeError(`${recipe.id}/${name}: invalid normalized curve.`);
      }
      previous = key[0];
    }
  }
  for (const event of recipe.events ?? []) {
    if (!Number.isFinite(event.at) || event.at < 0 || event.at > 1 || typeof event.type !== 'string') {
      throw new TypeError(`${recipe.id}: invalid event.`);
    }
  }
  return recipe;
}

export function createRecipeRegistry(recipes = []) {
  const map = new Map();
  for (const recipe of recipes) {
    validateRecipe(recipe);
    if (map.has(recipe.id)) throw new Error(`Duplicate recipe id: ${recipe.id}`);
    map.set(recipe.id, recipe);
  }
  return map;
}

export function sampleCurve(keys, normalizedTime) {
  const time = clamp(normalizedTime, 0, 1);
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [b, valueB] = keys[i];
    const [a, valueA] = keys[i - 1];
    if (time <= b) {
      if (b === a) return valueB;
      return valueA + (valueB - valueA) * smooth((time - a) / (b - a));
    }
  }
  return keys.at(-1)[1];
}

export function sampleRecipeChannels(recipe, normalizedTime, intensity = 1, weight = 1) {
  const gain = clamp(intensity, 0, 1) * clamp(weight, 0, 1);
  return Object.fromEntries(Object.entries(recipe.tracks ?? {}).map(([name, keys]) => [
    name, sampleCurve(keys, normalizedTime) * gain,
  ]));
}

export class RecipeEngine {
  constructor(recipes = []) {
    this.registry = createRecipeRegistry(recipes);
    this.active = null;
    this.lastResult = null;
    this.seenTokens = new Map();
    this.context = { state: 'sereno', severity: 'normal', targets: {} };
  }
  setRecipes(recipes) { this.registry = createRecipeRegistry(recipes); }
  setContext(context = {}) {
    if (context.state !== undefined && !STATE_IDS.includes(context.state)) throw new Error('Unknown contextual state.');
    if (context.severity !== undefined && !SEVERITIES.includes(context.severity)) throw new Error('Unknown severity.');
    const targets = { ...this.context.targets };
    for (const [name, value] of Object.entries(context.targets ?? {})) {
      if (!TARGET_NAMES.includes(name)) throw new Error(`Unknown target name: ${name}`);
      if (value === null) delete targets[name];
      else targets[name] = normalizeTarget(value);
    }
    this.context = { ...this.context, ...context, targets };
    if (this.active && this.blockReason(this.active.recipe)) this.stop('context_blocked');
    else if (this.active && context.targets !== undefined) {
      const resolved = resolveRecipeTargets(this.active.recipe, this.active.sourceOptions, targets);
      if (resolved.status) this.stop(resolved.status);
      else Object.assign(this.active.options, resolved);
    }
    return this.context;
  }
  list() {
    return [...this.registry.values()].map(({ tracks, ...metadata }) => ({
      ...metadata,
      available: metadata.status !== 'blocked_anatomy',
      channels: Object.keys(tracks ?? {}),
      // Authored curves are not acceptance or visual verification.
      status: metadata.status ?? 'authored_unvalidated',
    }));
  }
  get(id) {
    const recipe = this.registry.get(id);
    if (!recipe) throw new Error(`Unknown recipe id: ${id}`);
    return recipe;
  }
  blockReason(recipe) {
    if (recipe.status === 'blocked_anatomy') return 'blocked_anatomy';
    if (recipe.requiresSeverity && recipe.requiresSeverity !== this.context.severity) return 'blocked_severity';
    const personality = recipe.state === null || recipe.id.startsWith('personalidad-');
    if (personality && this.context.severity === 'critical') return 'blocked_critical_personality';
    if (this.context.severity !== 'normal' && recipe.seriousAllowed === false) return 'blocked_serious_context';
    if (recipe.compatibleStates?.length && !recipe.compatibleStates.includes(this.context.state)) return 'blocked_context';
    return null;
  }
  play(id, options = {}) {
    const recipe = this.get(id);
    const current = this.active;
    const inFlight = current?.recipe.special === 'approvedJump' && current.progress > (6.08 - 5.12) / 3 && current.progress < (6.70 - 5.12) / 3;
    const inSteps = current?.recipe.special === 'shortTurn' && current.progress > .12 && current.progress < .97;
    if (inFlight || inSteps) return { started: false, id, token: options.token ?? null, status: 'busy_support_motion', reason: 'Finish the current landing or stepping sequence before starting another recipe.' };
    const reason = this.blockReason(recipe);
    if (reason) return { started: false, id, token: options.token ?? null, status: reason, reason: recipe.notes || reason };
    const resolved = resolveRecipeTargets(recipe, options, this.context.targets);
    if (resolved.status) return { started: false, id, token: options.token ?? null, ...resolved };
    if (recipe.state === 'sorprendido' && !['atento', 'contento', 'preocupado'].includes(options.afterState)) {
      throw new Error(`${id} requires afterState: atento, contento, or preocupado.`);
    }
    if (options.afterState && !['sereno', 'contento', 'atento', 'preocupado', 'pensativo', 'sorprendido', 'explicativo', 'alivio'].includes(options.afterState)) {
      throw new Error(`Unknown afterState: ${options.afterState}`);
    }
    if (options.token !== undefined && this.seenTokens.get(id)?.has(options.token)) {
      return { started: false, id, token: options.token, status: 'duplicate_token' };
    }
    const intensity = options.intensity ?? 1;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError('intensity must be between 0 and 1.');
    const { target, secondaryTarget } = resolved;
    if (options.token !== undefined) {
      const tokens = this.seenTokens.get(id) ?? new Set(); tokens.add(options.token);
      if (tokens.size > 128) tokens.delete(tokens.values().next().value);
      this.seenTokens.set(id, tokens);
    }
    this.active = {
      recipe, id, token: options.token ?? null, time: 0, progress: 0, weight: 1,
      duration: recipe.duration, status: 'playing', events: [], fired: new Set(),
      sourceOptions: { ...options },
      options: { ...options, intensity, target, secondaryTarget },
      stopTime: null, stopReason: null,
    };
    this.lastResult = { started: true, id, token: options.token ?? null, status: 'playing' };
    this.advance(0);
    return this.lastResult;
  }
  stop(reason = 'stopped') {
    if (!this.active) return false;
    this.active.preparationRemaining = 0;
    if (this.active.recipe.special === 'shortTurn' && this.active.progress > .12 && this.active.progress < .97) {
      this.active.deferredStop = reason; this.active.status = 'finishing_steps'; return true;
    }
    if (this.active.recipe.special === 'approvedJump' && this.active.progress > (6.08 - 5.12) / 3
      && this.active.progress < (6.70 - 5.12) / 3) {
      this.active.deferredStop = reason;
      this.active.status = 'finishing_landing';
      return true;
    }
    if (this.active.stopTime === null) {
      this.active.stopTime = this.active.time;
      this.active.status = 'stopping';
      this.active.stopReason = reason;
    }
    return true;
  }
  advance(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and non-negative.');
    const active = this.active;
    if (!active) return null;
    if (active.preparationRemaining > 0) {
      const preparation = Math.min(dt, active.preparationRemaining);
      active.preparationRemaining -= preparation; dt -= preparation;
      if (active.preparationRemaining > 1e-9) return null;
      active.preparationRemaining = 0; active.status = 'playing';
    }
    active.time += dt;
    active.progress = clamp(active.time / active.duration, 0, 1);
    if (active.deferredStop && active.progress >= (active.recipe.special === 'shortTurn' ? .97 : (6.70 - 5.12) / 3)) {
      const reason = active.deferredStop;
      active.deferredStop = null;
      this.stop(reason);
    }
    for (const [index, event] of (active.recipe.events ?? []).entries()) {
      if (!active.fired.has(index) && event.at <= active.progress + 1e-9) {
        active.fired.add(index);
        active.events.push({ ...event, time: active.time });
      }
    }
    if (active.stopTime !== null) active.weight = 1 - smooth((active.time - active.stopTime) / 0.32);
    if (active.progress >= 1 || active.weight <= 0) {
      const result = {
        id: active.id, token: active.token, status: active.stopTime === null ? 'completed' : 'stopped',
        progress: active.progress, events: active.events,
        afterState: active.stopTime === null ? active.options.afterState : undefined,
      };
      this.active = null;
      this.lastResult = result;
      return result;
    }
    return null;
  }
  snapshot() {
    if (!this.active) return null;
    const { id, token, status, progress, events } = this.active;
    return { id, token, status, progress, events: [...events], preparationRemaining: this.active.preparationRemaining ?? 0 };
  }
}
