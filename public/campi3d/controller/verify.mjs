import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readCampi } from './loader.mjs';
import { CampiController, THREE } from './runtime.mjs';
import { STATE_IDS, POSTURE_IDS, REVIEW_TIMELINE } from './logic.mjs';
import { advanceTo, DEFAULT_ASSET, DEFAULT_MANIFEST } from './capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const gltf = await readCampi(DEFAULT_ASSET);
const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST, 'utf8'));
const controller = new CampiController(gltf, { manifest, auto: false });
const report = {
  status: 'running',
  verifiedIn: 'Node.js, mathematical transforms and actual GLB geometry; no browser rendering was attempted',
  assetSha256: createHash('sha256').update(await readFile(DEFAULT_ASSET)).digest('hex'),
  model: { nodes: controller.records.length, states: STATE_IDS.length, authoredPostures: controller.postureSamples.size },
  timing: {
    fps: manifest.fps, firstSample: controller.clipDiagnostics.sourceFirstTime,
    blenderFrameOffset: controller.clipDiagnostics.frameOffset,
    states: controller.clipDiagnostics.diagnostics,
  },
  checks: {},
};
function check(name, execute) {
  const detail = execute();
  report.checks[name] = { passed: true, ...detail };
}
function localSnapshot() {
  return new Map([...controller.nodes].map(([name, n]) => [name, {
    position: n.position.clone(), quaternion: n.quaternion.clone(), scale: n.scale.clone(),
  }]));
}
function poseDifference(a, b) {
  let translation = 0, rotation = 0, scale = 0;
  for (const [name, p] of a) {
    const q = b.get(name);
    translation = Math.max(translation, p.position.distanceTo(q.position));
    rotation = Math.max(rotation, p.quaternion.clone().normalize().angleTo(q.quaternion.clone().normalize()));
    scale = Math.max(scale, p.scale.distanceTo(q.scale));
  }
  return { translation, rotation, scale };
}
function samePose(a, b) {
  for (const [name, p] of a) {
    const q = b.get(name);
    if (!p.position.equals(q.position) || !p.quaternion.equals(q.quaternion) || !p.scale.equals(q.scale)) return false;
  }
  return true;
}
check('eight_real_closed_state_loops', () => {
  for (const [id, diagnostic] of Object.entries(controller.clipDiagnostics.diagnostics)) {
    assert.equal(diagnostic.minimumSamples, 97, `${id} must retain all 97 actual samples`);
    assert.ok(diagnostic.maximumClosureError < 1e-5, `${id} is not closed`);
    assert.equal(diagnostic.duration, 4);
  }
  return { states: STATE_IDS, samplesPerLoop: 97, duration: 4 };
});
check('four_authored_postures_are_distinct', () => {
  const poses = controller.postureSamples;
  const pairs = [];
  for (let a = 0; a < POSTURE_IDS.length; a++) {
    for (let b = a + 1; b < POSTURE_IDS.length; b++) {
      const difference = poseDifference(poses.get(POSTURE_IDS[a]), poses.get(POSTURE_IDS[b]));
      assert.ok(difference.rotation > 0.1, 'A posture pair is only a label or trivial offset');
      pairs.push({ a: POSTURE_IDS[a], b: POSTURE_IDS[b], ...difference });
    }
  }
  return { pairs };
});
check('protected_gesture_arms_survive_composition', () => {
  const checks = [];
  for (const state of ['pensativo', 'explicativo', 'sorprendido']) {
    for (const posture of POSTURE_IDS) {
      controller.setState(state, { posture, restart: true, phaseStart: 1.35, playSeconds: 0 });
      controller.sampleTarget();
      for (const side of state === 'sorprendido' ? ['L', 'R'] : ['R']) {
        for (const part of ['11_UPPER_ARM', '13_FOREARM', '15_HAND', '16_FINGER', '17_FINGERTIP', '16_THUMB']) {
          const prefix = `${part}_${side}`;
          for (const [name, desired] of controller.targetNodes) {
            if (name !== prefix && !name.startsWith(`${prefix}_`)) continue;
            const raw = controller.samplerNodes.get(name);
            assert.ok(desired.quaternion.equals(raw.quaternion), `${state}/${posture}/${name} was overwritten`);
          }
        }
      }
      checks.push({ state, posture });
    }
  }
  return { combinations: checks.length };
});
check('retargeting_never_changes_visible_pose_or_resets_velocity', () => {
  controller.update(0.17);
  const pose = localSnapshot();
  const velocities = JSON.stringify([...controller.velocities].map(([name, v]) => [name, v.position.toArray(), v.angular.toArray(), v.scale.toArray()]));
  controller.setState('contento', { posture: 'peso_derecho' });
  controller.sampleTarget();
  assert.ok(samePose(pose, localSnapshot()));
  assert.equal(JSON.stringify([...controller.velocities].map(([name, v]) => [name, v.position.toArray(), v.angular.toArray(), v.scale.toArray()])), velocities);
  return { visibleTransformWritesOnSelection: 0, velocityResets: 0 };
});
check('all_32_state_posture_combinations_keep_soles_on_floor', () => {
  let maxContactError = 0, maxFlatnessError = 0, maxReachExcess = 0;
  let minimumSoleY = Infinity, maximumSoleY = -Infinity;
  for (const state of STATE_IDS) {
    for (const posture of POSTURE_IDS) {
      controller.setState(state, { posture, restart: true, phaseStart: 1.5, playSeconds: 0 });
      controller.update(2.8);
      for (const foot of controller.lastIK) {
        maxContactError = Math.max(maxContactError, foot.contactError);
        maxFlatnessError = Math.max(maxFlatnessError, foot.flatnessError);
        maxReachExcess = Math.max(maxReachExcess, foot.reachExcess);
      }
      for (const side of ['L', 'R']) {
        const sole = controller.nodes.get(`Boot rubber sole ${side}`);
        let minimum = Infinity;
        const position = sole.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(sole.matrixWorld);
          minimum = Math.min(minimum, point.y);
        }
        minimumSoleY = Math.min(minimumSoleY, minimum);
        maximumSoleY = Math.max(maximumSoleY, minimum);
      }
    }
  }
  assert.ok(maxContactError < 1e-8 && maxFlatnessError < 1e-6 && maxReachExcess === 0);
  assert.ok(minimumSoleY > -1e-6 && maximumSoleY < 1e-6);
  return { combinations: 32, maxContactError, maxFlatnessError, maxReachExcess, minimumSoleY, maximumSoleY };
});
check('holding_is_still_not_perpetual_sway', () => {
  controller.setState('sereno', { posture: 'peso_derecho', restart: true, playSeconds: 1.2 });
  controller.update(5);
  const before = localSnapshot();
  controller.update(2);
  const after = localSnapshot();
  assert.ok(samePose(before, after));
  return { secondsCompared: 2, changedTransforms: 0 };
});
check('pause_preserves_pose_and_clock', () => {
  controller.setPaused(true);
  const before = localSnapshot();
  const time = controller.snapshot().time;
  controller.update(100);
  assert.ok(samePose(before, localSnapshot()));
  assert.equal(controller.snapshot().time, time);
  controller.setPaused(false);
  return { changedTransforms: 0, clockAdvance: 0 };
});
// New controller so the sequence is independent of previous tests.
const sequence = new CampiController(await readCampi(DEFAULT_ASSET), { manifest, auto: false });
let cursor = 0, previous = null;
let maxTranslationStep = 0, maxRotationStep = 0, maxScaleStep = 0, maxContactError = 0;
for (let frame = 0; frame < 653; frame++) {
  cursor = advanceTo(sequence, frame / 24, REVIEW_TIMELINE, cursor);
  const pose = new Map([...sequence.nodes].map(([name, n]) => [name, {
    position: n.position.clone(), quaternion: n.quaternion.clone(), scale: n.scale.clone(),
  }]));
  if (previous) {
    const delta = poseDifference(previous, pose);
    maxTranslationStep = Math.max(maxTranslationStep, delta.translation);
    maxRotationStep = Math.max(maxRotationStep, delta.rotation);
    maxScaleStep = Math.max(maxScaleStep, delta.scale);
  }
  previous = pose;
  for (const foot of sequence.lastIK) maxContactError = Math.max(maxContactError, foot.contactError);
}
check('27_second_transition_sequence_is_bounded_and_grounded', () => {
  assert.ok(maxTranslationStep < 0.04 && maxRotationStep < 0.5 && maxContactError < 1e-8,
    JSON.stringify({ maxTranslationStep, maxRotationStep, maxContactError }));
  return { frames: 653, fps: 24, maxTranslationStep, maxRotationStep, maxScaleStep, maxContactError };
});
report.status = 'passed';
const output = path.join(HERE, 'validation.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: report.checks, output }, null, 2));
