import * as THREE from './vendor/three.module.js';
import { CampiDirector, STATE_IDS, POSTURE_IDS, DEFAULT_RANGES, criticalStep } from './logic.mjs';
import { RecipeEngine, sampleRecipeChannels, normalizeTarget, resolveRecipeTargets, smooth } from './recipe-engine.mjs';
import { recipes as authoredRecipes } from './recipes-registry.mjs';
import { createArmPoseLibrary, applyArmChannels } from './arm-primitives.mjs';
import { isSupportedChannel, applyBodyFaceChannels, collectSoleVertices, footSupportFromChannels, applyShortTurn } from './motion-primitives.mjs';

const DOWN = new THREE.Vector3(0, -1, 0);
const Y_HALF_TURN = new THREE.Quaternion(0, 1, 0, 0);
export const POSTURE_MASKS = Object.freeze({
  sereno: { L: 1, R: 1 }, contento: { L: 0.65, R: 0.65 },
  atento: { L: 0.8, R: 0.8 }, preocupado: { L: 0.15, R: 0.15 },
  pensativo: { L: 0.8, R: 0 }, sorprendido: { L: 0, R: 0 },
  explicativo: { L: 0.8, R: 0 }, alivio: { L: 0.8, R: 0.8 },
});

export function originalNodeMap(model) {
  const map = new Map();
  model.traverse(node => {
    if (node.userData.originalName) map.set(node.userData.originalName, node);
  });
  return map;
}

/** Preserve index+name even though GLTFLoader sanitizes Object3D.name for binding. */
export function originalNodeRecords(model) {
  return [...originalNodeMap(model)].map(([name, node]) => ({
    name, index: node.userData.gltfNodeIndex, node,
  })).sort((a, b) => a.index - b.index);
}

export function rangesFromManifest(manifest = {}) {
  const source = manifest.states ?? manifest.state_loops ?? manifest.stateLoops;
  if (!source) return DEFAULT_RANGES;
  const entries = Array.isArray(source)
    ? source.map(s => [s.id ?? s.name ?? s.state, s])
    : Object.entries(source);
  const result = Object.fromEntries(entries.map(([id, data]) => [id, {
    start_frame: data.start_frame ?? data.startFrame ?? data.frames?.[0],
    end_frame: data.end_frame ?? data.endFrame ?? data.frames?.[1],
    duration_seconds: data.duration_seconds ?? data.durationSeconds ?? 4,
  }]));
  for (const id of STATE_IDS) {
    const r = result[id];
    if (!r || !Number.isFinite(r.start_frame) || !(r.end_frame > r.start_frame)) {
      throw new Error(`The manifest has no valid original-frame range for state ${id}.`);
    }
  }
  return result;
}

/**
 * Blender exports may start at 1/fps (this model does), not zero.
 * Verify the actual first sample, translate Blender frames accordingly, and make
 * AnimationUtils.subclip include the final loop sample without its next state.
 */
export function extractStateClips(source, ranges, fps = 24) {
  const sourceFirstTime = Math.min(...source.tracks.map(t => t.times[0]));
  const sourceLastTime = Math.max(...source.tracks.map(t => t.times.at(-1)));
  const frameOffset = sourceFirstTime * fps - 1;
  const clips = new Map();
  const diagnostics = {};
  for (const [id, range] of Object.entries(ranges)) {
    const start = (range.start_frame + frameOffset) / fps;
    const end = (range.end_frame + frameOffset) / fps;
    const duration = range.duration_seconds ?? end - start;
    if (start < sourceFirstTime - 0.001 || end > sourceLastTime + 0.001) {
      throw new Error(`Real animation for "${id}" is absent: frames ${range.start_frame}–${range.end_frame} exceed the GLB. No substitute state was generated.`);
    }
    const clip = THREE.AnimationUtils.subclip(source, id, start * fps - 0.01, end * fps + 0.01, fps);
    if (!clip.tracks.length) throw new Error(`No tracks were extracted for ${id}.`);
    let maximumClosureError = 0;
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      for (let c = 0; c < size; c++) {
        maximumClosureError = Math.max(maximumClosureError, Math.abs(track.values[c] - track.values[track.values.length - size + c]));
      }
      // The source has an explicit endpoint. Correct only float timestamp noise.
      if (Math.abs(track.times.at(-1) - duration) < 0.002) track.times[track.times.length - 1] = duration;
      if (Math.abs(track.times[0]) < 0.002) track.times[0] = 0;
    }
    clip.duration = duration;
    clips.set(id, clip);
    diagnostics[id] = {
      originalFrames: [range.start_frame, range.end_frame], start, end, duration,
      tracks: clip.tracks.length, minimumSamples: Math.min(...clip.tracks.map(t => t.times.length)),
      maximumClosureError,
    };
  }
  return { clips, diagnostics, sourceFirstTime, sourceLastTime, frameOffset };
}

function stepVector(value, velocity, target, omega, dt) {
  for (const axis of ['x', 'y', 'z']) {
    [value[axis], velocity[axis]] = criticalStep(value[axis], velocity[axis], target[axis], omega, dt);
  }
  if (value.distanceToSquared(target) < 1e-12 && velocity.lengthSq() < 1e-10) {
    value.copy(target);
    velocity.set(0, 0, 0);
  }
}

function quaternionLog(q, output) {
  const sign = q.w < 0 ? -1 : 1;
  const w = THREE.MathUtils.clamp(q.w * sign, -1, 1);
  const length = Math.hypot(q.x, q.y, q.z);
  const gain = length < 1e-9 ? 2 : 2 * Math.atan2(length, w) / length;
  return output.set(q.x * sign * gain, q.y * sign * gain, q.z * sign * gain);
}
function quaternionExp(v, output) {
  const angle = v.length();
  const scale = angle < 1e-9 ? 0.5 : Math.sin(angle / 2) / angle;
  return output.set(v.x * scale, v.y * scale, v.z * scale, Math.cos(angle / 2)).normalize();
}
const scratchQ = new THREE.Quaternion();
const scratchError = new THREE.Vector3();
const zero = new THREE.Vector3();

/** Tangent-space spring with angular velocity retained when the target changes. */
export function stepQuaternion(value, angularVelocity, target, omega, dt) {
  scratchQ.copy(target).invert();
  scratchQ.premultiply(value).normalize();
  quaternionLog(scratchQ, scratchError);
  stepVector(scratchError, angularVelocity, zero, omega, dt);
  quaternionExp(scratchError, scratchQ);
  value.copy(scratchQ).multiply(target).normalize();
}

/** Analytic two-bone solution in world space, followed by exact flat-foot orientation. */
export function solvePlantedLegs(model, nodes = originalNodeMap(model), supports = null) {
  model.updateMatrixWorld(true);
  const rootOrientation = model.getWorldQuaternion(new THREE.Quaternion());
  const rootScale = model.getWorldScale(new THREE.Vector3());
  if (Math.max(Math.abs(rootScale.x - rootScale.y), Math.abs(rootScale.x - rootScale.z)) > 1e-5) {
    throw new Error('Campi support IK requires uniform model scale.');
  }
  // Recipe body height is bounded by actual two-leg reach, never by stretching bones.
  let pelvisCorrection = 0;
  if (supports) {
    for (const side of ['L', 'R']) {
      const origin = model.worldToLocal(nodes.get(`21_THIGH_${side}`).getWorldPosition(new THREE.Vector3()));
      const anchor = supports[side].anchor;
      const length = nodes.get(`22_KNEE_${side}`).position.length() + nodes.get(`24_ANKLE_${side}`).position.length() - 0.001;
      const horizontal = (origin.x - anchor.x) ** 2 + (origin.z - anchor.z) ** 2;
      const maximumHeight = anchor.y + Math.sqrt(Math.max(0, length * length - horizontal));
      pelvisCorrection = Math.max(pelvisCorrection, origin.y - maximumHeight);
    }
    if (pelvisCorrection > 0) {
      nodes.get('01_PELVIS').position.y -= pelvisCorrection;
      model.updateMatrixWorld(true);
    }
  }
  const report = [];
  for (const [side, sign, poleZ] of [['L', -1, 0.42], ['R', 1, 0.55]]) {
    const thigh = nodes.get(`21_THIGH_${side}`);
    const knee = nodes.get(`22_KNEE_${side}`);
    const shin = nodes.get(`23_SHIN_${side}`);
    const ankle = nodes.get(`24_ANKLE_${side}`);
    const foot = nodes.get(`25_FOOT_${side}`);
    if (!thigh || !knee || !shin || !ankle || !foot) throw new Error(`Missing actual leg hierarchy: ${side}`);
    const origin = thigh.getWorldPosition(new THREE.Vector3());
    const support = supports?.[side];
    const anchor = model.localToWorld(support ? support.anchor.clone() : new THREE.Vector3(sign * 0.32, 0.238, 0.02));
    const desiredOrientation = support ? rootOrientation.clone().multiply(support.orientation) : rootOrientation;
    const localOrigin = model.worldToLocal(origin.clone());
    const pole = model.localToWorld(new THREE.Vector3(localOrigin.x, localOrigin.y - 0.48, poleZ));
    const l1 = knee.position.length() * rootScale.x;
    const l2 = ankle.position.length() * rootScale.x;
    const direction = anchor.clone().sub(origin);
    const rawDistance = direction.length();
    const distance = THREE.MathUtils.clamp(rawDistance, Math.abs(l1 - l2) + 1e-6, l1 + l2 - 1e-6);
    direction.normalize();
    const bend = pole.sub(origin).addScaledVector(direction, -pole.dot(direction));
    if (bend.lengthSq() < 1e-10) bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
    bend.normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const mid = origin.clone().addScaledVector(direction, along).addScaledVector(bend, height);
    const end = origin.clone().addScaledVector(direction, distance);
    const thighWorld = new THREE.Quaternion().setFromUnitVectors(DOWN, mid.clone().sub(origin).normalize());
    thigh.quaternion.copy(thigh.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(thighWorld);
    model.updateMatrixWorld(true);
    const shinWorld = new THREE.Quaternion().setFromUnitVectors(DOWN, end.clone().sub(mid).normalize());
    shin.quaternion.copy(shin.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(shinWorld);
    model.updateMatrixWorld(true);
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(desiredOrientation);
    model.updateMatrixWorld(true);
    const actual = foot.getWorldPosition(new THREE.Vector3());
    report.push({
      side, anchor: anchor.toArray(), actual: actual.toArray(),
      contactError: actual.distanceTo(anchor),
      reachExcess: Math.max(0, rawDistance - l1 - l2),
      flatnessError: foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(desiredOrientation),
      planted: support?.planted ?? true, flight: support?.flight ?? false,
      pelvisCorrection,
    });
  }
  return report;
}

export function extractPostureSamples(gltf, manifest, frameOffset) {
  const supplied = manifest?.postures;
  if (!supplied) throw new Error('The manifest must include four actual posture sample frames.');
  const entries = Array.isArray(supplied)
    ? supplied.map((p, i) => [POSTURE_IDS.includes(p.id) ? p.id : POSTURE_IDS[i], p])
    : Object.entries(supplied).map(([id, p], i) => [POSTURE_IDS.includes(id) ? id : POSTURE_IDS[i], p]);
  const model = gltf.scene.clone(true);
  const nodes = originalNodeMap(model);
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(gltf.animations[0]).play();
  const poses = new Map();
  const lastTime = Math.max(...gltf.animations[0].tracks.map(t => t.times.at(-1)));
  for (const [id, data] of entries) {
    const frame = data.sample_frame ?? data.sampleFrame;
    const time = (frame + frameOffset) / (manifest.fps ?? 24);
    if (!Number.isFinite(time) || time > lastTime + 0.001) throw new Error(`Missing actual posture sample: ${id}.`);
    action.time = time;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    mixer.update(0);
    poses.set(id, new Map([...nodes].map(([name, node]) => [name, {
      position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
    }])));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  if (poses.size !== 4 || POSTURE_IDS.some(id => !poses.has(id))) throw new Error('Expected four distinct actual posture samples.');
  return poses;
}

export function applyPosture(nodes, state, posture, samples) {
  const pose = samples.get(posture);
  const baseline = samples.get('centrado_suelto');
  for (const name of ['01_PELVIS', '02_WAIST_TORSO', '04_HEAD']) {
    const node = nodes.get(name);
    const a = baseline.get(name);
    const b = pose.get(name);
    const gain = name === '04_HEAD' ? 0.5 : 1;
    node.position.addScaledVector(b.position.clone().sub(a.position), gain);
    const delta = a.quaternion.clone().invert().multiply(b.quaternion);
    node.quaternion.multiply(new THREE.Quaternion().slerp(delta, gain));
  }
  const mask = POSTURE_MASKS[state];
  for (const [name, node] of nodes) {
    const match = name.match(/^(?:10_SHOULDER|11_UPPER_ARM|13_FOREARM|15_HAND|16_FINGER|17_FINGERTIP|16_THUMB)_([LR])(?:_|$)/);
    if (!match) continue;
    const gain = mask[match[1]];
    if (!gain) continue;
    const desired = pose.get(name);
    node.position.lerp(desired.position, gain);
    node.quaternion.slerp(desired.quaternion, gain);
    node.scale.lerp(desired.scale, gain);
  }
}

/** GLTF decomposes the frown reflection into three negative scales + a half turn.
 * This mathematically identical factorization avoids an unintended mouth spin.
 */
export function canonicalizeSmile(transform) {
  if (transform.scale.x < 0 && transform.scale.z < 0) {
    transform.quaternion.multiply(Y_HALF_TURN).normalize();
    transform.scale.x *= -1;
    transform.scale.z *= -1;
  }
}

/**
 * Runtime works without WebGL. Only the target has an AnimationMixer.
 * The visible hierarchy is never reset, cross-faded via neutral, or reparented.
 */
export class CampiController {
  constructor(gltf, {
    manifest, seed, auto, autoPosture = auto ?? true, demoAutoStates = false,
    initialState, initialPosture, omega = 10.5, reducedMotion = false, recipes = authoredRecipes, onChange,
  } = {}) {
    if (gltf.animations.length !== 1) throw new Error('Expected one complete, synchronized GLB animation.');
    this.originalTemplate = gltf.scene.clone(true);
    this.sourceAnimations = gltf.animations;
    this.restNodes = originalNodeMap(this.originalTemplate);
    this.manifest = manifest;
    this.onChange = onChange;
    this.target = gltf.scene;
    this.model = gltf.scene.clone(true);
    this.target.visible = false;
    this.model.visible = true;
    this.samplerNodes = originalNodeMap(this.target);
    this.nodes = originalNodeMap(this.model);
    this.records = originalNodeRecords(this.model);
    // The mixer-owned hierarchy is never modified by support composition. Three.js
    // skips unchanged PropertyMixer writes; resetting its nodes would corrupt holds.
    this.targetNodes = new Map([...this.samplerNodes].map(([name, node]) => [name, {
      position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
    }]));
    this.director = new CampiDirector({ seed, autoPosture, demoAutoStates, initialState, initialPosture });
    this.recipeEngine = new RecipeEngine(recipes);
    this.recipeEngine.setContext({ state: this.director.state });
    for (const recipe of recipes) for (const channel of Object.keys(recipe.tracks ?? {})) {
      if (!isSupportedChannel(channel)) throw new Error(`${recipe.id}: unsupported real-animation channel ${channel}`);
    }
    this.armLibrary = createArmPoseLibrary(this.nodes);
    this.soleVertices = collectSoleVertices(this.nodes);
    this.recipeSupports = null;
    this.blinkBases = new Map();
    this.currentRecipeChannels = null;
    this.autoPostureBeforeRecipe = null;
    this.specialModel = this.originalTemplate.clone(true);
    this.specialNodes = originalNodeMap(this.specialModel);
    this.specialMixer = new THREE.AnimationMixer(this.specialModel);
    this.specialAction = this.specialMixer.clipAction(gltf.animations[0]).play();
    this.specialAction.setLoop(THREE.LoopOnce, 1);
    this.specialAction.clampWhenFinished = true;
    this.omega = omega;
    this.paused = false;
    this.reducedMotion = false;
    this.maxStep = 1 / 120;
    this.velocities = new Map([...this.nodes].map(([name]) => [name, {
      position: new THREE.Vector3(), angular: new THREE.Vector3(), scale: new THREE.Vector3(),
    }]));
    this.mixer = new THREE.AnimationMixer(this.target);
    const extracted = extractStateClips(gltf.animations[0], rangesFromManifest(manifest), manifest?.fps ?? 24);
    this.clipDiagnostics = extracted;
    this.postureSamples = extractPostureSamples(gltf, manifest, extracted.frameOffset);
    this.actions = new Map([...extracted.clips].map(([id, clip]) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      return [id, action];
    }));
    this.currentAction = null;
    this.sampleTarget();
    // Only initialization starts directly in the selected live pose.
    for (const [name, node] of this.nodes) {
      const source = this.targetNodes.get(name);
      node.position.copy(source.position);
      node.quaternion.copy(source.quaternion);
      node.scale.copy(source.scale);
    }
    this.lastIK = solvePlantedLegs(this.model, this.nodes);
    this.steps = 0;
    this.setReducedMotion(reducedMotion);
  }
  setState(state, options = {}) {
    const changed = this.director.setState(state, this.reducedMotion
      ? { ...options, phaseStart: options.phaseStart ?? 1.4, playSeconds: 0 }
      : options);
    if (changed && this.recipeEngine?.active) this.stopRecipe('context_change');
    if (changed && this.reducedMotion) {
      if (this.reducedLanding) this.pendingStillSelection = true; else this.applyStillPose();
    }
    this.recipeEngine?.setContext({ state });
    return changed;
  }
  setPosture(posture, options = {}) {
    const allowed = this.recipeEngine?.active?.recipe.compatiblePostures;
    if (allowed?.length && !allowed.includes(posture)) {
      this.lastPostureDecision = { status: 'blocked_posture', requestedPosture: posture, compatiblePostures: [...allowed] };
      return false;
    }
    const changed = this.director.setPosture(posture, options);
    if (changed && this.reducedMotion) {
      if (this.reducedLanding) this.pendingStillSelection = true; else this.applyStillPose();
    }
    return changed;
  }
  setAutoPosture(value) {
    if (this.recipeEngine?.active) this.autoPostureBeforeRecipe = Boolean(value);
    return this.director.setAutoPosture(this.reducedMotion || this.recipeEngine?.active ? false : value);
  }
  setDemoAutoStates(value) { return this.director.setDemoAutoStates(this.reducedMotion || this.recipeEngine?.active ? false : value); }
  /** Legacy alias is intentionally safe: it never randomizes contextual emotion. */
  setAuto(value) { return this.setAutoPosture(value); }
  setPaused(value) { this.paused = Boolean(value); }
  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    if (this.reducedMotion) {
      const needsGroundedStill = this.lastIK?.some(foot => !foot.planted || foot.flight);
      this.director.setAutoPosture(false);
      this.director.setDemoAutoStates(false);
      if (this.recipeEngine?.active) {
        // Explicit accessibility mode is a stable still pose, never a hidden/faded character.
        const { id, token } = this.recipeEngine.active;
        this.recipeEngine.lastResult = { id, token, status: 'stopped', reason: 'reduced_motion' };
        this.recipeEngine.active = null;
        this.recipeSupports = null;
        this.autoPostureBeforeRecipe = null;
      }
      if (needsGroundedStill && !this.reducedLanding) this.startReducedLanding();
      // Grounded poses freeze exactly; no surprise reset through neutral.
      for (const velocity of this.velocities.values()) {
        velocity.position.set(0, 0, 0);
        velocity.angular.set(0, 0, 0);
        velocity.scale.set(0, 0, 0);
      }
    }
    // Turning it off does not silently re-enable autonomous motion.
    return this.reducedMotion;
  }
  startReducedLanding() {
    this.model.updateMatrixWorld(true);
    this.sampleTarget();
    const rootInverse = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const supports = {};
    for (const side of ['L', 'R']) {
      const foot = this.nodes.get(`25_FOOT_${side}`);
      const anchor = this.model.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const orientation = rootInverse.clone().multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation);
      const targetOrientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(forward.x, forward.z));
      const min = Math.min(...this.soleVertices[side].map(v => v.clone().applyQuaternion(orientation).y));
      supports[side] = { anchor, orientation, targetOrientation, clearance: Math.max(0, anchor.y + min) };
    }
    this.reducedLanding = {
      elapsed: 0, duration: .32, supports,
      fromY: this.nodes.get('01_PELVIS').position.y,
      toY: Math.min(this.nodes.get('01_PELVIS').position.y, this.targetNodes.get('01_PELVIS').position.y),
    };
  }
  updateReducedLanding(dt) {
    const landing = this.reducedLanding;
    landing.elapsed = Math.min(landing.duration, landing.elapsed + dt);
    const t = smooth(landing.elapsed / landing.duration);
    this.nodes.get('01_PELVIS').position.y = THREE.MathUtils.lerp(landing.fromY, landing.toY, t);
    const supports = {};
    for (const side of ['L', 'R']) {
      const start = landing.supports[side];
      const orientation = start.orientation.clone().slerp(start.targetOrientation, t);
      const floor = -Math.min(...this.soleVertices[side].map(v => v.clone().applyQuaternion(orientation).y));
      const anchor = start.anchor.clone(); anchor.y = floor + start.clearance * (1 - t);
      supports[side] = { anchor, orientation, planted: start.clearance * (1 - t) < 1e-7, flight: false };
    }
    this.lastIK = solvePlantedLegs(this.model, this.nodes, supports);
    if (landing.elapsed >= landing.duration) {
      this.reducedLanding = null;
      if (this.pendingStillSelection) { this.pendingStillSelection = false; this.applyStillPose(); }
    }
    const snapshot = this.snapshot(); this.onChange?.(snapshot); return snapshot;
  }
  applyStillPose() {
    this.sampleTarget();
    for (const [name, node] of this.nodes) {
      const target = this.targetNodes.get(name);
      node.position.copy(target.position);
      node.quaternion.copy(target.quaternion).normalize();
      node.scale.copy(target.scale);
      const velocity = this.velocities.get(name);
      velocity.position.set(0, 0, 0);
      velocity.angular.set(0, 0, 0);
      velocity.scale.set(0, 0, 0);
    }
    this.lastIK = solvePlantedLegs(this.model, this.nodes, this.recipeSupports);
  }
  listRecipes() { return this.recipeEngine.list(); }
  setContext({ state, severity, targets } = {}) {
    if (state !== undefined && !STATE_IDS.includes(state)) throw new Error(`Unknown state: ${state}`);
    const context = this.recipeEngine.setContext({
      ...(state !== undefined ? { state } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(targets !== undefined ? { targets } : {}),
    });
    if (state !== undefined) this.setState(state);
    this.onChange?.(this.snapshot());
    return context;
  }
  playRecipe(id, options = {}) {
    if (this.reducedMotion) {
      this.recipeEngine.get(id); // Invalid IDs are still explicit errors.
      return { started: false, id, token: options.token ?? null, status: 'reduced_motion', reason: 'Reduced motion keeps the current visible pose stable.' };
    }
    this.recipeEngine.setContext({ state: this.director.state });
    const result = this.recipeEngine.play(id, options);
    if (result.started) {
      const active = this.recipeEngine.active;
      active.basePhase = this.director.snapshot().phase;
      if (active.recipe.compatiblePostures?.length && !active.recipe.compatiblePostures.includes(this.director.posture)) {
        const posture = active.recipe.preferredPosture ?? active.recipe.compatiblePostures[0];
        if (!POSTURE_IDS.includes(posture)) throw new Error(`${id}: unknown preferred support posture ${posture}`);
        this.director.setPosture(posture);
        active.preparationRemaining = .75; active.status = 'preparing_posture';
        result.status = 'preparing_posture'; result.preparedPosture = posture;
      }
      if (this.autoPostureBeforeRecipe === null) this.autoPostureBeforeRecipe = this.director.autoPosture;
      this.director.setAutoPosture(false);
      this.director.setDemoAutoStates(false);
      if (this.recipeEngine.active.recipe.special === 'approvedJump') {
        // Follow source root motion, with only the incoming pose error damped.
        // A spring without feed-forward lags the torso behind airborne feet.
        this.sampleTarget();
        const active = this.recipeEngine.active;
        active.jumpPelvisOffset = this.nodes.get('01_PELVIS').position.clone().sub(this.targetNodes.get('01_PELVIS').position);
        active.jumpPelvisVelocity = this.velocities.get('01_PELVIS').position.clone();
      }
    }
    this.onChange?.(this.snapshot());
    return result;
  }
  stopRecipe(reason = 'stopped') {
    const result = this.recipeEngine.stop(reason);
    this.onChange?.(this.snapshot());
    return result;
  }
  sampleApprovedJump(progress, weight = 1) {
    // Source animation is offset by one frame; study authoring uses (frame - 1)/24.
    const sourceTime = this.clipDiagnostics.sourceFirstTime + 5.12 + progress * 3;
    this.specialAction.paused = false;
    this.specialAction.time = sourceTime;
    this.specialMixer.update(0);
    this.specialModel.updateMatrixWorld(true);
    for (const [name, desired] of this.targetNodes) {
      const raw = this.specialNodes.get(name);
      desired.position.lerp(raw.position, weight);
      desired.quaternion.slerp(raw.quaternion, weight);
      desired.scale.lerp(raw.scale, weight);
    }
    const airborne = weight > 1e-6 && progress > (6.08 - 5.12) / 3 && progress < (6.70 - 5.12) / 3;
    const supports = {};
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      const foot = this.specialNodes.get(`25_FOOT_${side}`);
      const point = foot.getWorldPosition(new THREE.Vector3());
      const anchor = new THREE.Vector3(sign * 0.32, 0.238, 0.02).lerp(point, weight);
      const orientation = new THREE.Quaternion().slerp(foot.getWorldQuaternion(new THREE.Quaternion()), weight);
      // The source's subframe quaternion interpolation can lower a sole edge by
      // ~1 cm near takeoff/landing. Respect the actual mesh, not just ankle Y.
      const floorHeight = -Math.min(...this.soleVertices[side].map(v => v.clone().applyQuaternion(orientation).y));
      anchor.y = airborne ? Math.max(anchor.y, floorHeight) : floorHeight;
      supports[side] = { anchor, orientation, planted: !airborne, flight: airborne };
    }
    return supports;
  }
  modelLocalMatrix(name) {
    const chain = [];
    for (let node = this.nodes.get(name); node && node !== this.model; node = node.parent) chain.unshift(node);
    const matrix = new THREE.Matrix4();
    for (const node of chain) {
      const transform = this.targetNodes.get(node.userData.originalName) ?? node;
      matrix.multiply(new THREE.Matrix4().compose(transform.position, transform.quaternion, transform.scale));
    }
    return matrix;
  }
  modelLocalRotation(name) {
    const chain = [];
    for (let node = this.nodes.get(name); node && node !== this.model; node = node.parent) chain.unshift(node);
    const rotation = new THREE.Quaternion();
    for (const node of chain) rotation.multiply(this.targetNodes.get(node.userData.originalName)?.quaternion ?? node.quaternion);
    return rotation.normalize();
  }
  sampleTarget() {
    const status = this.director.snapshot();
    const action = this.actions.get(status.state);
    if (!action) throw new Error(`No real clip exists for ${status.state}.`);
    if (action !== this.currentAction) {
      this.currentAction?.stop();
      action.reset().play();
      this.currentAction = action;
    }
    action.time = this.recipeEngine?.active?.basePhase ?? status.phase;
    this.mixer.update(0);
    // Compose from the untouched sample, never accumulate additive posture offsets.
    for (const [name, desired] of this.targetNodes) {
      const raw = this.samplerNodes.get(name);
      desired.position.copy(raw.position);
      desired.quaternion.copy(raw.quaternion);
      desired.scale.copy(raw.scale);
    }
    canonicalizeSmile(this.targetNodes.get('Friendly smile'));
    applyPosture(this.targetNodes, status.state, status.posture, this.postureSamples);
    this.recipeSupports = null;
    this.currentRecipeChannels = null;
    this.lastArmReport = null;
    const active = this.recipeEngine?.active;
    if (active && !(active.preparationRemaining > 0)) {
      const channels = sampleRecipeChannels(active.recipe, active.progress, active.options.intensity, active.weight);
      this.currentRecipeChannels = channels;
      // Explicit blink channels override ambient blinks, including an intentional 0.
      // Directed gaze starts from the authored eye center rather than idle drift.
      for (const side of ['L', 'R']) {
        const eye = this.targetNodes.get(`Eye ${side}`);
        const rest = this.restNodes.get(`Eye ${side}`);
        if (active.options.intensity > 0 && `face.blink${side}` in channels) eye.scale.y = rest.scale.y;
        if (active.options.intensity > 0 && ('gaze.target' in channels || 'gaze.secondary' in channels)) {
          eye.position.x = rest.position.x; eye.position.y = rest.position.y;
        }
      }
      const motionOptions = {
        ...active.options,
        headParentQuaternion: () => this.modelLocalRotation(this.nodes.get('04_HEAD').parent.userData.originalName),
        torsoParentQuaternion: () => this.modelLocalRotation(this.nodes.get('02_WAIST_TORSO').parent.userData.originalName),
      };
      if (active.recipe.special === 'approvedJump') {
        this.recipeSupports = this.sampleApprovedJump(active.progress, active.weight * active.options.intensity);
        applyBodyFaceChannels(this.targetNodes, channels, { ...motionOptions, skipBody: true });
      } else {
        applyBodyFaceChannels(this.targetNodes, channels, motionOptions);
        this.lastArmReport = applyArmChannels(this.targetNodes, this.armLibrary, channels, {
          ...active.options, intensity: 1, torsoQuaternion: this.modelLocalRotation('02_WAIST_TORSO'),
          headToTorso: (channels['arm.L.ear'] || channels['arm.R.ear'])
            ? this.modelLocalMatrix('02_WAIST_TORSO').invert().multiply(this.modelLocalMatrix('04_HEAD')) : undefined,
        });
        this.recipeSupports = active.recipe.special === 'shortTurn'
          ? applyShortTurn(this.targetNodes, active.progress, this.soleVertices, active.options.intensity * active.weight)
          : footSupportFromChannels(channels, this.soleVertices);
      }
    }
    return status;
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('dt must be finite and non-negative.');
    // A requested accessibility stop completes only the current safe descent,
    // even if paused; no ongoing gesture or automatic state change continues.
    if (this.reducedLanding && dt > 0) return this.updateReducedLanding(dt);
    if (this.paused || this.reducedMotion || dt === 0) return this.snapshot();
    // Do not silently discard time: fixed subdivisions make 24/60/120 fps equivalent.
    const count = Math.ceil(dt / this.maxStep);
    const step = dt / count;
    for (let i = 0; i < count; i++) {
      this.director.tick(step);
      const finished = this.recipeEngine.advance(step);
      if (finished) {
        if (finished.afterState) this.setState(finished.afterState);
        if (this.autoPostureBeforeRecipe !== null) {
          this.director.setAutoPosture(this.autoPostureBeforeRecipe);
          this.autoPostureBeforeRecipe = null;
        }
      }
      this.sampleTarget();
      for (const [name, node] of this.nodes) {
        const target = this.targetNodes.get(name);
        const velocity = this.velocities.get(name);
        const rotationRate = name.startsWith('15_HAND') ? 0.64
          : /^(11_UPPER_ARM|13_FOREARM)/.test(name) ? 0.8
          : name === '02_WAIST_TORSO' ? 0.88
          : name === '01_PELVIS' ? 0.8 : 1;
        const positionRate = name === '01_PELVIS' ? 0.8 : 1;
        const active = this.recipeEngine.active;
        if (name === '01_PELVIS' && active?.jumpPelvisOffset) {
          const previous = node.position.clone();
          for (const axis of ['x', 'y', 'z']) {
            const [error] = criticalStep(active.jumpPelvisOffset[axis], active.jumpPelvisVelocity[axis], 0, this.omega * positionRate, active.time);
            node.position[axis] = target.position[axis] + error;
          }
          velocity.position.copy(node.position).sub(previous).divideScalar(step);
        } else stepVector(node.position, velocity.position, target.position, this.omega * positionRate, step);
        stepQuaternion(node.quaternion, velocity.angular, target.quaternion, this.omega * rotationRate, step);
        const eyeSide = name === 'Eye L' ? 'L' : name === 'Eye R' ? 'R' : null;
        const blinkKey = eyeSide ? `face.blink${eyeSide}` : null;
        if (blinkKey && this.currentRecipeChannels && blinkKey in this.currentRecipeChannels) {
          // A blink curve is already C2 smooth and much faster than body posing.
          // Spring the open-eye baseline, not the authored eyelid closure factor.
          const previousY = node.scale.y;
          const baseline = this.blinkBases.get(eyeSide) ?? { value: previousY, velocity: velocity.scale.y };
          const factor = 1 - .94 * THREE.MathUtils.clamp(this.currentRecipeChannels[blinkKey], 0, 1);
          [baseline.value, baseline.velocity] = criticalStep(baseline.value, baseline.velocity, target.scale.y / factor, this.omega + 2, step);
          this.blinkBases.set(eyeSide, baseline);
          stepVector(node.scale, velocity.scale, target.scale, this.omega + 2, step);
          node.scale.y = baseline.value * factor;
          velocity.scale.y = (node.scale.y - previousY) / step;
        } else {
          if (eyeSide) this.blinkBases.delete(eyeSide);
          stepVector(node.scale, velocity.scale, target.scale, this.omega + 2, step);
        }
      }
      // IK is the final write. Interpolated legs never drift or drag their feet.
      this.lastIK = solvePlantedLegs(this.model, this.nodes, this.recipeSupports);
      this.steps++;
    }
    const snapshot = this.snapshot();
    this.onChange?.(snapshot);
    return snapshot;
  }
  snapshot() {
    return {
      ...this.director.snapshot(), paused: this.paused, reducedMotion: this.reducedMotion, reducedMotionSettling: Boolean(this.reducedLanding), ik: this.lastIK,
      recipe: this.recipeEngine?.snapshot() ?? null,
      lastRecipe: this.recipeEngine?.lastResult ?? null,
      context: this.recipeEngine ? { state: this.recipeEngine.context.state, severity: this.recipeEngine.context.severity } : null,
    };
  }
  capture(frame) {
    const status = this.snapshot();
    return {
      frame, time: status.time, state: status.state, posture: status.posture,
      holding: status.holding, phase: status.phase,
      transforms: this.records.map(({ name, index, node }) => ({
        name, index,
        position: node.position.toArray(),
        quaternion: node.quaternion.toArray(),
        scale: node.scale.toArray(),
      })),
    };
  }
  sampleRecipe(id, normalizedTime, options = {}) {
    if (!Number.isFinite(normalizedTime) || normalizedTime < 0 || normalizedTime > 1) throw new RangeError('normalizedTime must be between 0 and 1.');
    const recipe = this.recipeEngine.get(id);
    if (recipe.status === 'blocked_anatomy') return { id, status: 'blocked_anatomy', available: false, transforms: [], reason: recipe.notes };
    if (!this.qaController) {
      this.qaController = new CampiController({
        scene: this.originalTemplate.clone(true), animations: this.sourceAnimations,
      }, { manifest: this.manifest, recipes: [...this.recipeEngine.registry.values()], autoPosture: false, demoAutoStates: false });
    }
    const qa = this.qaController;
    const state = options.state ?? recipe.state ?? 'sereno';
    const posture = options.posture ?? recipe.preferredPosture ?? recipe.compatiblePostures?.[0] ?? 'centrado_suelto';
    if (recipe.compatiblePostures?.length && !recipe.compatiblePostures.includes(posture)) {
      return { id, state, posture, status: 'blocked_posture', available: false, transforms: [], compatiblePostures: [...recipe.compatiblePostures], reason: 'This contact gesture is not validated on the requested support posture.' };
    }
    const intensity = options.intensity ?? 1;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new RangeError('intensity must be between 0 and 1.');
    qa.director.enter(state, posture, { phaseStart: 1.4, playSeconds: 0, holdSeconds: 100 });
    const resolved = resolveRecipeTargets(recipe, options, {}, true);
    if (resolved.status) throw new Error(`${id}: ${resolved.status}`);
    qa.recipeEngine.active = {
      recipe, id, token: options.token ?? null, progress: normalizedTime, weight: 1,
      basePhase: 1.4, status: 'sampled', time: normalizedTime * recipe.duration, duration: recipe.duration,
      events: (recipe.events ?? []).filter(event => event.at <= normalizedTime),
      options: {
        ...options, intensity,
        target: resolved.target, secondaryTarget: resolved.secondaryTarget,
      },
    };
    qa.applyStillPose();
    return {
      ...qa.capture(1), id, normalizedTime, state, posture, status: 'sampled', available: true,
      channels: sampleRecipeChannels(recipe, normalizedTime, intensity),
      events: qa.recipeEngine.active.events,
      ik: qa.lastIK, armDiagnostics: qa.lastArmReport, special: recipe.special ?? null,
    };
  }
  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.target);
    this.specialMixer.stopAllAction(); this.specialMixer.uncacheRoot(this.specialModel);
    this.qaController?.dispose();
  }
}

export { THREE };
