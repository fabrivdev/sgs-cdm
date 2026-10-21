import * as THREE from './vendor/three.module.js';
import { clamp, smooth, normalizeTarget } from './recipe-engine.mjs';
import { ARM_POSE_NAMES } from './arm-primitives.mjs';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const turn = (node, axis, angle) => {
  if (node && angle) node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
};
const value = (channels, key, min = -Infinity, max = Infinity) => clamp(channels[key] ?? 0, min, max);
export const ARM_POSES = ARM_POSE_NAMES;
export function isSupportedChannel(name) {
  if (/^(head|torso)\.(pitch|yaw|roll)$/.test(name)) return true;
  if (name === 'torso.targetYaw') return true;
  if (/^body\.(shiftX|shiftY|height|yaw)$/.test(name)) return true;
  if (/^gaze\.(x|y|target|secondary)$/.test(name)) return true;
  if (/^face\.(blinkL|blinkR|eyeOpen|smile|frown|o|browL|browR|browRaise|smirk)$/.test(name)) return true;
  if (/^shoulder\.[LR]\.lift$/.test(name)) return true;
  if (/^hand\.[LR]\.(relaxed|open|fist|point|thumbUp|cup|clap|index|middle|ring|pinky|thumb|roll)$/.test(name)) return true;
  if (/^foot\.[LR]\.(lift|pitch|yaw|side)$/.test(name)) return true;
  const arm = name.match(/^arm\.[LR]\.(.+)$/);
  return Boolean(arm && ARM_POSES.includes(arm[1]));
}

/** All face channels act on actual mesh transforms, including both real eyebrows. */
export function applyBodyFaceChannels(nodes, channels, options = {}) {
  const head = nodes.get('04_HEAD');
  const torso = nodes.get('02_WAIST_TORSO');
  const pelvis = nodes.get('01_PELVIS');
  if (!options.skipBody) {
    for (const [prefix, node, bounds] of [['head', head, [0.4, 0.9, 0.35]], ['torso', torso, [0.22, 0.45, 0.22]]]) {
      turn(node, X, value(channels, `${prefix}.pitch`, -bounds[0], bounds[0]));
      turn(node, Y, value(channels, `${prefix}.yaw`, -bounds[1], bounds[1]));
      turn(node, Z, -value(channels, `${prefix}.roll`, -bounds[2], bounds[2]));
    }
    pelvis.position.x += value(channels, 'body.shiftX', -0.14, 0.14);
    pelvis.position.z -= value(channels, 'body.shiftY', -0.09, 0.09);
    pelvis.position.y += value(channels, 'body.height', -0.13, 0.05);
    turn(pelvis, Y, value(channels, 'body.yaw', -0.55, 0.55));
    const torsoWeight = value(channels, 'torso.targetYaw', 0, 1);
    if (torsoWeight) {
      const parent = options.torsoParentQuaternion?.() ?? new THREE.Quaternion();
      const current = parent.clone().multiply(torso.quaternion);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(current);
      const [x,,z] = normalizeTarget(options.target).direction;
      let delta = Math.atan2(x, z) - Math.atan2(forward.x, forward.z);
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      const axis = Y.clone().applyQuaternion(parent.clone().invert());
      torso.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, clamp(delta, -.4, .4) * torsoWeight)).normalize();
    }
  }
  if (!options.skipBody && options.torsoParentQuaternion) {
    // The public model-space target sector must remain coherent under an
    // asymmetric support yaw. Turn the torso slightly before clamping the arm,
    // rather than silently pointing short of the visible target at the edge.
    const constraints = [
      [options.target, Math.max(...['L','R'].flatMap(side => ['point','palmUpTarget','pointDownTarget'].map(pose => value(channels, `arm.${side}.${pose}`, 0, 1))))],
      [options.secondaryTarget, Math.max(...['L','R'].map(side => value(channels, `arm.${side}.pointSecondary`, 0, 1)))],
    ];
    let totalCorrection = 0;
    for (let iteration = 0; iteration < 2; iteration++) {
      const parent = options.torsoParentQuaternion();
      const inverse = parent.clone().multiply(torso.quaternion).invert();
      let correction = 0;
      for (const [target, gain] of constraints) {
        if (!gain) continue;
        const direction = new THREE.Vector3(...normalizeTarget(target).direction).applyQuaternion(inverse);
        const yaw = Math.atan2(direction.x, direction.z);
        const excess = (yaw - clamp(yaw, -.99, .99)) * gain;
        if (Math.abs(excess) > Math.abs(correction)) correction = excess;
      }
      correction = clamp(correction, -.32 - totalCorrection, .32 - totalCorrection);
      totalCorrection += correction;
      const axis = Y.clone().applyQuaternion(parent.clone().invert());
      torso.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, correction)).normalize();
    }
  }
  let gazeX = value(channels, 'gaze.x', -1, 1);
  let gazeY = value(channels, 'gaze.y', -1, 1);
  const headParent = options.headParentQuaternion?.() ?? new THREE.Quaternion();
  const headGesture = new THREE.Quaternion().setFromAxisAngle(X, value(channels, 'head.pitch', -.4, .4))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Y, value(channels, 'head.yaw', -.9, .9)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -value(channels, 'head.roll', -.35, .35)));
  let totalGazeWeight = 0;
  const directedHead = new THREE.Quaternion();
  const directedEyes = new THREE.Vector2();
  for (const [key, target] of [['target', options.target], ['secondary', options.secondaryTarget]]) {
    const gain = value(channels, `gaze.${key}`, 0, 1);
    if (!gain) continue;
    const [x, y, z] = normalizeTarget(target).direction;
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.asin(clamp(y, -1, 1)), Math.atan2(x, z), 0, 'YXZ'));
    const local = headParent.clone().invert().multiply(look).multiply(headGesture).normalize();
    if (totalGazeWeight === 0) directedHead.copy(local); else directedHead.slerp(local, gain / (totalGazeWeight + gain));
    totalGazeWeight += gain;
    directedEyes.x += x * gain; directedEyes.y += y * gain;
  }
  if (totalGazeWeight) {
    const fixation = smooth(Math.min(1, totalGazeWeight));
    head.quaternion.slerp(directedHead, fixation).normalize();
    // Eyes can lead while the head turns, then center once the head reaches its target.
    gazeX += directedEyes.x * (1 - fixation);
    gazeY += directedEyes.y * (1 - fixation);
  }
  for (const side of ['L', 'R']) {
    const eye = nodes.get(`Eye ${side}`);
    eye.position.x += clamp(gazeX, -1, 1) * 0.035;
    eye.position.y += clamp(gazeY, -1, 1) * 0.025;
    const opening = 1 + value(channels, 'face.eyeOpen', -0.4, 0.45);
    eye.scale.y *= opening * (1 - 0.94 * value(channels, `face.blink${side}`, 0, 1));
    const brow = nodes.get(`Expression brow ${side}`);
    const angle = value(channels, `face.brow${side}`, -0.5, 0.5);
    const raise = value(channels, 'face.browRaise', -0.025, 0.05);
    if (brow) {
      turn(brow, Z, angle);
      brow.position.y += raise;
      if (angle || raise) brow.scale.setScalar(Math.max(brow.scale.x, 0.7));
    }
  }
  const smile = nodes.get('Friendly smile');
  smile.scale.y += value(channels, 'face.smile', -0.6, 0.6) * 0.7;
  const frown = value(channels, 'face.frown', 0, 1);
  smile.scale.y = THREE.MathUtils.lerp(smile.scale.y, -Math.max(0.32, Math.abs(smile.scale.y)), frown);
  turn(smile, Z, value(channels, 'face.smirk', -0.2, 0.2));
  const o = value(channels, 'face.o', 0, 1);
  if (o) {
    nodes.get('Expression oval mouth')?.scale.setScalar(Math.max(0.001, o));
    smile.scale.z *= 1 - o * 0.999;
  }
}

export function collectSoleVertices(nodes) {
  const soles = {};
  for (const side of ['L', 'R']) {
    const foot = nodes.get(`25_FOOT_${side}`);
    const sole = nodes.get(`Boot rubber sole ${side}`);
    foot.updateWorldMatrix(true, true);
    const positions = sole.geometry.attributes.position;
    soles[side] = [];
    for (let i = 0; i < positions.count; i++) {
      soles[side].push(foot.worldToLocal(sole.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i))));
    }
  }
  return soles;
}

export function footSupportFromChannels(channels, soleVertices, weight = 1) {
  const supports = {};
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const pitch = value(channels, `foot.${side}.pitch`, -0.22, 0.22);
    const yaw = value(channels, `foot.${side}.yaw`, -0.55, 0.55);
    const lift = value(channels, `foot.${side}.lift`, 0, 0.09);
    const orientation = new THREE.Quaternion().setFromAxisAngle(Y, yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, pitch));
    const soleMin = Math.min(...soleVertices[side].map(v => v.clone().applyQuaternion(orientation).y));
    supports[side] = {
      anchor: new THREE.Vector3(sign * 0.32 + value(channels, `foot.${side}.side`, -0.1, 0.1), -soleMin + lift, 0.02),
      orientation, planted: lift < 1e-5, flight: false,
    };
  }
  return supports;
}

/** A short turn uses two actual stepping feet out and two steps back. */
export function shortTurnChannels(progress, intensity = 1) {
  const angle = 0.42 * intensity;
  const state = { L: { yaw: 0, lift: 0 }, R: { yaw: 0, lift: 0 } };
  function step(side, start, end, from, to) {
    const u = clamp((progress - start) / (end - start), 0, 1);
    if (progress < start) return;
    state[side].yaw = from + (to - from) * smooth(u);
    state[side].lift = progress < end ? 0.065 * Math.sin(Math.PI * u) * intensity : 0;
  }
  step('R', 0.12, 0.29, 0, angle);
  step('L', 0.32, 0.49, 0, angle);
  step('L', 0.60, 0.77, angle, 0);
  step('R', 0.80, 0.97, angle, 0);
  return state;
}

export function applyShortTurn(nodes, progress, soleVertices, intensity = 1) {
  const feet = shortTurnChannels(progress, intensity);
  const supports = {};
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const { yaw, lift } = feet[side];
    const orientation = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    const anchor = new THREE.Vector3(sign * 0.32, 0.238, 0.02).applyAxisAngle(Y, yaw);
    anchor.y = 0.238 + lift;
    supports[side] = { anchor, orientation, planted: lift < 1e-5, flight: false };
  }
  const meanYaw = (feet.L.yaw + feet.R.yaw) / 2;
  turn(nodes.get('01_PELVIS'), Y, meanYaw);
  nodes.get('01_PELVIS').position.y -= 0.025 * Math.sin(Math.PI * progress) ** 2;
  nodes.get('01_PELVIS').position.x += 0.025 * (feet.L.lift - feet.R.lift) / 0.065;
  return supports;
}
