import * as THREE from './vendor/three.module.js';

/**
 * Campi's actual exported hierarchy is Y-up, with its face towards +Z:
 * shoulder -> upper -> elbow (0,-.49,0) -> forearm ->
 * wrist (0,-.455,0) -> hand. No scene, renderer or world matrix is required.
 *
 * IK is an authoring operation here. Its endpoints become LOCAL upper-arm,
 * forearm and wrist quaternions. Runtime interpolation is FK, including the
 * wrist: it never keeps a hand hanging at a world-space target.
 */
export const ARM_POSE_NAMES = Object.freeze([
  'rest', 'hip', 'chin', 'temple', 'ear', 'chest', 'crossLow', 'crossHigh',
  'behind', 'point', 'pointSecondary', 'indexUp', 'pointDown', 'palmUp',
  'palmOut', 'open', 'raise', 'fistUp', 'clap', 'inspect', 'stretch', 'invite',
  'circleTop', 'circleOut', 'circleDown', 'circleIn',
  'palmUpTarget',
  'pointDownTarget',
  'sideClearance',
  'handsFront',
  'clapReady',
  'crossHighReady',
]);
export const HAND_POSE_NAMES = Object.freeze([
  'relaxed', 'open', 'fist', 'point', 'thumbUp', 'cup', 'clap',
]);

const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'];
const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const weight = value => clamp(finite(value), 0, 1);
const ease = value => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function vector(value, fallback = [0, 0, 0]) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return new THREE.Vector3(...fallback.map((v, i) => finite(value[i], v)));
  }
  return new THREE.Vector3(
    finite(value?.x, fallback[0]), finite(value?.y, fallback[1]), finite(value?.z, fallback[2]),
  );
}

function quaternion(value) {
  if (value?.isQuaternion) return value.clone().normalize();
  const q = Array.isArray(value) || ArrayBuffer.isView(value)
    ? new THREE.Quaternion(...[0, 0, 0, 1].map((v, i) => finite(value[i], v)))
    : new THREE.Quaternion(finite(value?.x), finite(value?.y), finite(value?.z), finite(value?.w, 1));
  return q.lengthSq() > 1e-12 ? q.normalize() : q.identity();
}

function writeQuaternion(node, q) {
  if (typeof node.quaternion?.copy === 'function') node.quaternion.copy(q);
  else if (Array.isArray(node.quaternion) || ArrayBuffer.isView(node.quaternion)) q.toArray(node.quaternion);
  else if (node.quaternion) Object.assign(node.quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
  else node.quaternion = q.clone();
}

function writePosition(node, p) {
  if (typeof node.position?.copy === 'function') node.position.copy(p);
  else if (Array.isArray(node.position) || ArrayBuffer.isView(node.position)) p.toArray(node.position);
  else if (node.position) Object.assign(node.position, { x: p.x, y: p.y, z: p.z });
  else node.position = p.clone();
}

function required(nodes, name) {
  const node = nodes.get(name);
  if (!node) throw new Error(`Campi arm primitives require original GLB node "${name}".`);
  return node;
}

function channelValue(channels, name) {
  return finite(channels instanceof Map ? channels.get(name) : channels?.[name]);
}

/** The actual palm faces -Z (white dorsal armor is +Z); fingers extend -Y. */
function handBasis(direction, normal) {
  const y = vector(direction).normalize().negate();
  if (y.lengthSq() < 1e-10) y.set(0, 1, 0);
  const z = vector(normal).negate().addScaledVector(y, vector(normal).dot(y));
  if (z.lengthSq() < 1e-8) {
    z.copy(Math.abs(y.z) < .85 ? Z : X).addScaledVector(y, -y.dot(Math.abs(y.z) < .85 ? Z : X));
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function solveLocalPose(rig, target, pole, fingerDirection, palmNormal, upperTwist = 0) {
  const origin = rig.shoulder;
  const delta = vector(target).sub(origin);
  const rawDistance = delta.length();
  if (rawDistance < 1e-9) delta.copy(DOWN);
  const direction = delta.normalize();
  // Keep an elbow bend and avoid the straight-chain singularity.
  const distance = clamp(rawDistance, Math.abs(rig.upperLength - rig.forearmLength) + .06,
    rig.upperLength + rig.forearmLength - .025);
  const bend = vector(pole).sub(origin);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(rig.sign, 0, .35).addScaledVector(direction, -direction.dot(new THREE.Vector3(rig.sign, 0, .35)));
  }
  if (bend.lengthSq() < 1e-8) bend.copy(Z).addScaledVector(direction, -direction.z);
  bend.normalize();
  const along = (rig.upperLength ** 2 - rig.forearmLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, rig.upperLength ** 2 - along ** 2));
  const elbow = origin.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const wrist = origin.clone().addScaledVector(direction, distance);
  const upper = new THREE.Quaternion().setFromUnitVectors(DOWN, elbow.clone().sub(origin).normalize());
  // Axial twist leaves the authored endpoint intact but makes the FK approach
  // travel around, rather than through, the rounded chest for a central clap.
  if (upperTwist) upper.multiply(new THREE.Quaternion().setFromAxisAngle(DOWN, upperTwist));
  const forearmTorso = new THREE.Quaternion().setFromUnitVectors(DOWN, wrist.clone().sub(elbow).normalize());
  const forearm = upper.clone().invert().multiply(forearmTorso).normalize();
  const handTorso = handBasis(fingerDirection, palmNormal);
  const hand = forearmTorso.clone().invert().multiply(handTorso).normalize();
  return {
    upper, forearm, hand,
    // Authoring diagnostics, not runtime world-space constraints.
    elbow, wrist, fingerDirection: vector(fingerDirection).normalize(),
    requestedWrist: vector(target), reachClamped: rawDistance > distance + 1e-6, upperTwist,
  };
}

function poseSpecs(sign) {
  const s = sign;
  const frontPole = [s * 1.14, .22, .56];
  const highPole = [s * 1.25, .73, .26];
  const definition = (wrist, direction = [0, -1, 0], normal = [0, 0, 1], pole = frontPole, upperTwist = 0) => ({
    wrist, direction, normal, pole, upperTwist,
  });
  return {
    rest: definition([s * .78, -.08, .055], [0, -1, 0], [0, 0, -1], [s * 1.25, .20, -.25]),
    hip: definition([s * .488, .06, -.03], [-s * .2, -Math.sqrt(.0575), .95],
      [-s, 0, 0], [s * 1.30, .30, .04]),
    chin: definition([s * .28, .74, .74], [-s * .36, .89, -.06], [s * .4, .1, 1],
      [s * .632, .839, .469]),
    // Fingers approach the head from outside. Wrist/forearm never target the face.
    temple: definition([s * 1.18, 1.20, .43], [-s * .12, .99, .02], [-s, 0, .2], highPole),
    ear: definition([s * 1.18, 1.13, .06], [-s * .15, .99, .04], [-s, 0, .08], highPole),
    chest: definition([s * .32, .46, .61], [-s * .46, .89, -.05], [0, 0, -1]),
    // Low/high have the SAME meaning on both sides. Recipes choose the lower
    // arm explicitly; side-dependent heights would put opposite choices together.
    // The hands cross the center, not the wrists: Campi's short forearms
    // cannot cross central wrist targets without penetrating the wide torso.
    crossLow: definition([s * .20, .34, .73], [-s, 0, .08], [0, 0, -1],
      [s * 1.05, .28, .63]),
    crossHigh: definition([s * .20, .70, .77], [-s, 0, .08], [0, 0, -1],
      [s * 1.05, .40, .65]),
    crossHighReady: definition([s * .88, .74, .77], [-s, 0, .08], [0, 0, -1],
      [s * 1.20, .45, .55]),
    behind: definition([s * .54, .03, -.52], [-s * .40, -.91, -.04],
      [0, 0, -1], [s * .78, .37, -.35]),
    sideClearance: definition([s * 1.15, .12, -.02], [0, -1, 0], [0, 0, -1],
      [s * 1.25, .40, 0]),
    handsFront: definition([s * .30, .23, .70], [-s * .10, -.98, .15], [0, 0, -1],
      [s * 1.10, .28, .60]),
    indexUp: definition([s * .95, .77, .45], [s * .06, .995, .08], [0, 0, 1]),
    pointDown: definition([s * .89, .20, .47], [s * .12, -.95, .29], [0, 0, 1]),
    palmUp: definition([s * .97, .51, .53], [s * .60, .03, .80], [0, 1, 0]),
    palmOut: definition([s * .99, .80, .40], [s * .08, 1, 0], [0, 0, 1]),
    open: definition([s * 1.11, .28, .24], [s * .45, -.76, .47], [0, 0, 1]),
    raise: definition([s * 1.14, 1.22, .22], [s * .10, .995, 0], [0, 0, 1], highPole),
    fistUp: definition([s * 1.00, .98, .40], [s * .05, 1, .05], [0, 0, 1], highPole),
    // The wrist bearings are thicker than the palms. Converging, shallowly
    // angled palms make contact near their rounded ends while wrists stay apart.
    clap: definition([s * .1071, .76, .60], [-s * .22, .55, .8056674], [-s, 0, 0],
      [s * .85, .63, .80], s * .55),
    clapReady: definition([s * .65, .60, .65], [-s * .22, .55, .8056674], [-s, 0, 0],
      [s * 1.10, .30, .50], s * .55),
    inspect: definition([s * .42, .58, .70], [s * .10, .85, .52], [0, 1, -1]),
    stretch: definition([s * 1.39, .77, .04], [s, .03, .05], [0, 0, 1], [s * 1.18, .24, .16]),
    invite: definition([s * .81, .35, .65], [s * .10, .14, 1], [0, 1, 0]),
    circleTop: definition([s * .97, .60, .53], [s * .60, .03, .80], [0, 1, 0]),
    circleOut: definition([s * 1.06, .51, .53], [s * .60, .03, .80], [0, 1, 0]),
    circleDown: definition([s * .97, .42, .53], [s * .60, .03, .80], [0, 1, 0]),
    circleIn: definition([s * .88, .51, .53], [s * .60, .03, .80], [0, 1, 0]),
  };
}

/**
 * Clamp directions into a forward-facing interaction sector. Targets are
 * directions, NOT positions. Invalid or zero directions use a safe default.
 */
function safeTarget(target, sign, secondary = false) {
  const fallback = new THREE.Vector3(sign * (secondary ? .75 : .52), secondary ? .15 : .10, 1).normalize();
  const raw = target?.direction;
  const values = raw?.isVector3 ? raw.toArray() : raw;
  const valid = (Array.isArray(values) || ArrayBuffer.isView(values))
    && values.length >= 3 && [values[0], values[1], values[2]].every(Number.isFinite);
  const requested = valid ? vector(values) : fallback.clone();
  const invalid = !valid || requested.lengthSq() < 1e-12;
  if (invalid) requested.copy(fallback);
  requested.normalize();
  const yaw = clamp(Math.atan2(requested.x, requested.z), -1.03, 1.03);
  const pitch = clamp(Math.asin(clamp(requested.y, -1, 1)), -.65, .65);
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)).normalize();
  return {
    direction,
    requestedDirection: requested,
    clamped: invalid || direction.angleTo(requested) > 1e-6,
    usedFallback: invalid,
  };
}

function pointPose(rig, target, secondary, palmUp = false, downward = false) {
  const info = safeTarget(target, rig.sign, secondary);
  const d = info.direction;
  if (downward && d.y > -.22) {
    d.y = -.35;
    d.normalize();
    info.clamped = true;
  }
  // The hand aims along d; its wrist stays in a forward, low, reachable
  // envelope. A target behind Campi cannot drive an arm through its torso.
  const lateral = rig.sign * Math.max(.09, .20 + rig.sign * d.x * .43);
  const wrist = downward
    ? [rig.shoulder.x + lateral, .35 + d.y * .22, .42 + d.z * .14]
    : [rig.shoulder.x + lateral, clamp(.72 + d.y * .35, .42, .94), .52 + d.z * .20];
  const pose = solveLocalPose(rig, wrist, [rig.sign * 1.22, .25, .42], d, [0, palmUp ? 1 : -1, 0]);
  pose.target = info;
  return pose;
}

function handShape(sign, name) {
  const definitions = {
    relaxed: { curls: [.24, .24, .24, .24], spread: .012, thumb: .35, thumbCurl: .28 },
    open: { curls: [.035, .035, .045, .055], spread: .055, thumb: -.27, thumbCurl: .12 },
    fist: { curls: [1.40, 1.48, 1.48, 1.42], spread: 0, thumb: .95, thumbCurl: .70 },
    // Curls are anatomical order; the existing left mesh row is reversed.
    point: { curls: [0, 1.47, 1.48, 1.42], spread: 0, thumb: .87, thumbCurl: .64 },
    // Pair with an upright arm pose (fistUp). applyArmChannels also applies a
    // limited local wrist swing so partial arm weights still read thumb-up.
    thumbUp: { curls: [1.42, 1.49, 1.49, 1.43], spread: 0, thumb: -1.10, thumbCurl: .035 },
    cup: { curls: [.48, .57, .61, .65], spread: .015, thumb: .50, thumbCurl: .38 },
    clap: { curls: [-.12, -.12, -.12, -.12], spread: .004, thumb: .12, thumbCurl: -.25 },
  };
  const definition = definitions[name];
  const fingers = definition.curls.map((_, i) => {
    const curl = definition.curls[sign < 0 ? 3 - i : i];
    return {
    // Blender's +Y spread axis exports as glTF -Z. Curl remains local +X.
    base: new THREE.Quaternion().setFromAxisAngle(Z, -(i - 1.5) * definition.spread)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, curl)),
    tip: new THREE.Quaternion().setFromAxisAngle(X, curl * .92),
    };
  });
  return {
    fingers,
    thumb: new THREE.Quaternion().setFromAxisAngle(Z, sign * definition.thumb)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, definition.thumbCurl)),
  };
}

function localMeshPoints(nodes, name, fallback) {
  const mesh = nodes.get(name);
  const attribute = mesh?.geometry?.attributes?.position;
  if (!attribute) return fallback.map(p => new THREE.Vector3(...p));
  const matrix = new THREE.Matrix4().compose(vector(mesh.position), quaternion(mesh.quaternion),
    vector(mesh.scale, [1, 1, 1]));
  const points = [];
  for (let i = 0; i < attribute.count; i++) {
    points.push(new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(matrix));
  }
  return points;
}

function boxPoints(centerY, halfX, halfY, halfZ) {
  const points = [];
  for (const x of [-halfX, halfX]) for (const y of [-halfY, halfY]) for (const z of [-halfZ, halfZ]) {
    points.push([x, centerY + y, z]);
  }
  return points;
}

/**
 * Build once from the actual GLB Map. It also accepts snapshots whose
 * position/quaternion/scale contain Three.js values, arrays, or {x,y,z,w}.
 * The map and its transforms are never modified by this function.
 *
 * Result: { poses:{L,R}, hands:{L,R}, rig:{L,R}, diagnostics, ... }.
 * poses[side][name] contains upper/forearm/hand local Quaternions and
 * authoring-only elbow/wrist Vector3 diagnostics in torso space.
 */
export function createArmPoseLibrary(nodes) {
  if (!(nodes instanceof Map)) throw new TypeError('createArmPoseLibrary expects a Map keyed by ORIGINAL GLB names.');
  const library = {
    version: 1, space: 'gltf-local-Y-up-front+Z',
    armPoseNames: ARM_POSE_NAMES, handPoseNames: HAND_POSE_NAMES,
    poses: { L: {}, R: {} }, hands: { L: {}, R: {} }, rig: {},
    diagnostics: { anatomy: [], warnings: [] },
    _pointCache: { L: {}, R: {} },
  };
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const names = {
      shoulder: `10_SHOULDER_${side}`, upper: `11_UPPER_ARM_${side}`,
      elbow: `12_ELBOW_${side}`, forearm: `13_FOREARM_${side}`,
      wrist: `14_WRIST_${side}`, hand: `15_HAND_${side}`, thumb: `16_THUMB_${side}`,
      fingers: Array.from({ length: 4 }, (_, i) => [`16_FINGER_${side}_${i}`, `17_FINGERTIP_${side}_${i}`]),
    };
    for (const name of [names.shoulder, names.upper, names.elbow, names.forearm,
      names.wrist, names.hand, names.thumb, ...names.fingers.flat()]) required(nodes, name);
    const elbowOffset = vector(required(nodes, names.elbow).position);
    const wristOffset = vector(required(nodes, names.wrist).position);
    if (Math.abs(elbowOffset.length() - .49) > .01 || Math.abs(wristOffset.length() - .455) > .01
      || elbowOffset.clone().normalize().dot(DOWN) < .999
      || wristOffset.clone().normalize().dot(DOWN) < .999) {
      throw new Error(`Campi ${side} arm geometry differs from its documented two-bone GLB hierarchy.`);
    }
    const rig = library.rig[side] = {
      side, sign, names, shoulder: new THREE.Vector3(sign * .555, .72, 0),
      upperLength: elbowOffset.length(), forearmLength: wristOffset.length(),
      anatomicalFingerIndices: sign < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3],
    };
    rig.fingerSurfaces = names.fingers.map(([base, tip], i) => {
      const length = vector(required(nodes, tip).position).length();
      return {
        base: localMeshPoints(nodes, `Finger proximal ${side}${i}`, boxPoints(-length / 2, .024, length / 2, .026)),
        tip: localMeshPoints(nodes, `Finger distal ${side}${i}`, boxPoints(-.032, .023, .034, .025)),
      };
    });
    for (const [name, spec] of Object.entries(poseSpecs(sign))) {
      library.poses[side][name] = solveLocalPose(rig, spec.wrist, spec.pole, spec.direction, spec.normal, spec.upperTwist);
    }
    library.poses[side].point = pointPose(rig, undefined, false);
    library.poses[side].pointSecondary = pointPose(rig, undefined, true);
    library.poses[side].palmUpTarget = pointPose(rig, undefined, false, true);
    library.poses[side].pointDownTarget = pointPose(rig, undefined, false, false, true);
    for (const name of HAND_POSE_NAMES) library.hands[side][name] = handShape(sign, name);

    const thumbX = vector(required(nodes, names.thumb).position).x;
    const distances = names.fingers.map(([name]) => Math.abs(vector(required(nodes, name).position).x - thumbX));
    const nearest = distances.indexOf(Math.min(...distances));
    const index = rig.anatomicalFingerIndices[0];
    library.diagnostics.anatomy.push({ side, contractualIndex: index, nearestThumbFinger: nearest,
      anatomicalFingerIndices: [...rig.anatomicalFingerIndices], consistent: nearest === index });
    if (nearest !== index) library.diagnostics.warnings.push(
      `${side}: contract uses finger i${index}, but existing GLB geometry places i${nearest} nearest the thumb. Verify the supplied asset.`,
    );
  }
  return library;
}

/** A deterministic spherical blend; absent/zero channels leave input intact. */
function blendQuaternion(current, contributions) {
  if (!contributions.length) return current;
  let total = 0;
  const mixed = new THREE.Quaternion();
  for (const [q, w] of contributions) {
    if (!(w > 0)) continue;
    if (!total) mixed.copy(q);
    else mixed.slerp(q, w / (total + w));
    total += w;
  }
  return current.slerp(mixed, Math.min(1, total)).normalize();
}

function cachedPoint(library, side, target, secondary, palmUp = false, downward = false) {
  const kind = downward ? 'downward' : palmUp ? 'palmUp' : secondary ? 'secondary' : 'primary';
  const info = safeTarget(target, library.rig[side].sign, secondary);
  const key = `${info.direction.toArray().join(',')}|${info.clamped}|${info.usedFallback}`;
  const previous = library._pointCache[side][kind];
  if (previous?.key === key) return previous.pose;
  const pose = pointPose(library.rig[side], target, secondary, palmUp, downward);
  library._pointCache[side][kind] = { key, pose };
  return pose;
}

function targetInTorso(target, inverseTorso) {
  if (!inverseTorso || !target?.direction) return target;
  const raw = target.direction?.isVector3 ? target.direction.toArray() : target.direction;
  if ((!Array.isArray(raw) && !ArrayBuffer.isView(raw)) || raw.length < 3
    || ![raw[0], raw[1], raw[2]].every(Number.isFinite)) return target;
  return { direction: vector(raw).applyQuaternion(inverseTorso).toArray() };
}

function headMatrix(nodes, supplied) {
  if (supplied?.isMatrix4) return supplied.clone();
  if (supplied?.elements?.length === 16) return new THREE.Matrix4().fromArray(supplied.elements);
  if ((Array.isArray(supplied) || ArrayBuffer.isView(supplied)) && supplied.length === 16) {
    return new THREE.Matrix4().fromArray(supplied);
  }
  const result = new THREE.Matrix4();
  for (const name of ['03_NECK', '04_HEAD']) {
    const node = required(nodes, name);
    result.multiply(new THREE.Matrix4().compose(vector(node.position), quaternion(node.quaternion),
      vector(node.scale, [1, 1, 1])));
  }
  return result;
}

/** Author an ear-contact endpoint in the CURRENT head-local frame, then return
 * only FK quaternions. The blend never constrains a hand in world space.
 * Actual exported finger surfaces, including the planned curl/roll, establish
 * clearance from the earpiece's outer plane; transform-only fixtures use a
 * conservative box fallback instead of pretending mesh geometry was present.
 */
function earContactPose(nodes, library, side, channels, gain, shapes, lift, suppliedHeadMatrix) {
  const rig = library.rig[side];
  const head = headMatrix(nodes, suppliedHeadMatrix);
  const headRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(head));
  const normal = new THREE.Vector3(rig.sign, 0, 0).transformDirection(head);
  const ear = new THREE.Vector3(rig.sign * .906, .45, -.02).applyMatrix4(head);
  const direction = new THREE.Vector3(-rig.sign * .15, .99, .04).normalize().applyQuaternion(headRotation);
  const palmNormal = new THREE.Vector3(-rig.sign, 0, .08).normalize().applyQuaternion(headRotation);
  const handRotation = handBasis(direction, palmNormal);
  const roll = clamp(channelValue(channels, `hand.${side}.roll`), -.25, .25) * gain;
  const plannedHand = handRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll));
  const handScale = vector(required(nodes, rig.names.hand).scale, [1, 1, 1]);
  let minimum = Infinity;
  let middleOffset;
  for (let i = 0; i < 4; i++) {
    const anatomy = rig.anatomicalFingerIndices.indexOf(i);
    const adjustment = clamp(channelValue(channels, `hand.${side}.${FINGER_NAMES[anatomy]}`), -.65, 1.25) * gain;
    const baseNode = required(nodes, rig.names.fingers[i][0]);
    const tipNode = required(nodes, rig.names.fingers[i][1]);
    const baseQ = blendQuaternion(quaternion(baseNode.quaternion), shapes.map(([shape, w]) => [shape.fingers[i].base, w]));
    const tipQ = blendQuaternion(quaternion(tipNode.quaternion), shapes.map(([shape, w]) => [shape.fingers[i].tip, w]));
    baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(X, adjustment));
    tipQ.multiply(new THREE.Quaternion().setFromAxisAngle(X, adjustment * .92));
    const basePosition = vector(baseNode.position);
    const tipPosition = vector(tipNode.position);
    const toTorso = (point, distal) => {
      const p = point.clone();
      if (distal) p.applyQuaternion(tipQ).add(tipPosition);
      return p.applyQuaternion(baseQ).add(basePosition).multiply(handScale).applyQuaternion(plannedHand);
    };
    for (const point of rig.fingerSurfaces[i].base) minimum = Math.min(minimum, normal.dot(toTorso(point, false)));
    for (const point of rig.fingerSurfaces[i].tip) minimum = Math.min(minimum, normal.dot(toTorso(point, true)));
    if (anatomy === 1) middleOffset = toTorso(new THREE.Vector3(0, -.032, 0), true);
  }
  const wrist = ear.clone().sub(middleOffset);
  const gap = .005;
  wrist.addScaledVector(normal, gap + normal.dot(middleOffset) - minimum);
  const shoulder = vector(required(nodes, rig.names.shoulder).position);
  shoulder.y += lift * .18;
  const pose = solveLocalPose({ ...rig, shoulder }, wrist,
    [rig.sign * 1.25, .73, .26], direction, palmNormal);
  pose.earContact = { surfaceClearance: gap, reachable: !pose.reachClamped, wrist: pose.wrist.toArray() };
  return pose;
}

/** Keep the palm beside the actual pelvis, not beside a yawed torso's
 * imaginary waist. The fingers continue mostly forward with a slight inward
 * and downward diagonal, away from the thighs. The wider wrist remains behind
 * and outside the palm's waist contact area. At full weight this endpoint is
 * mesh-calibrated to ~8.3 mm from the lateral hip bearing, without intersecting
 * the pelvis shell, wrist, torso or thigh meshes in the supported postures.
 */
function hipContactPose(nodes, library, side, lift) {
  const rig = library.rig[side];
  const torso = required(nodes, '02_WAIST_TORSO');
  const pelvisToTorso = new THREE.Matrix4().compose(vector(torso.position),
    quaternion(torso.quaternion), vector(torso.scale, [1, 1, 1])).invert();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(pelvisToTorso));
  const wrist = new THREE.Vector3(rig.sign * .488, .13, -.03).applyMatrix4(pelvisToTorso);
  const direction = new THREE.Vector3(-rig.sign * .2, -Math.sqrt(.0575), .95).applyQuaternion(rotation);
  const normal = new THREE.Vector3(-rig.sign, 0, 0).applyQuaternion(rotation);
  const shoulder = vector(required(nodes, rig.names.shoulder).position);
  shoulder.y += lift * .18;
  const pose = solveLocalPose({ ...rig, shoulder }, wrist,
    [rig.sign * 1.30, .30, .04], direction, normal);
  pose.hipContact = { reachable: !pose.reachClamped, wrist: pose.wrist.toArray() };
  return pose;
}

/**
 * Mutate only active arm/hand/shoulder channels on Object3Ds or transform
 * snapshots. Call on a freshly sampled base each frame; additive finger,
 * shoulder and roll channels are deliberately not a hidden stateful reset.
 *
 * channels: flat object or Map, e.g. {'arm.R.indexUp': .8, 'hand.R.point': 1}.
 * options: {target:{direction:[x,y,z]}, secondaryTarget, intensity:0..1,
 *           torsoQuaternion?: Quaternion | [x,y,z,w], headToTorso?: Matrix4}.
 * torsoQuaternion is torso-to-MODEL-local accumulated rotation, after current
 * pelvis/torso channels and excluding the external scene transform. When
 * supplied, model-local targets are converted to the authored torso frame.
 * Omit it only when the caller already supplies torso-local target directions.
 * headToTorso maps 04_HEAD local coordinates into 02_WAIST_TORSO coordinates.
 * If omitted, ear derives it from 03_NECK and 04_HEAD local transforms.
 * Hip derives pelvis-to-torso from the inverse of 02_WAIST_TORSO itself.
 * These moving anatomical frames author FK endpoints; no world-hand lock or
 * per-frame hand translation is applied.
 * Intensity is applied here once. The caller must not scale channels again.
 * Returns compact diagnostics; no renderer, node parenting, scale or limb
 * translation is changed. Shoulder lift adds a small local translation.
 * thumbUp alone seats its thumb pivot 6 mm towards the palm at full weight,
 * preserving the capsule's anatomical root as it opens; zero restores the
 * freshly sampled base position. Neither wrist nor hand position is changed.
 */
export function applyArmChannels(nodes, library, channels, {
  target, secondaryTarget, intensity = 1, torsoQuaternion, headToTorso,
} = {}) {
  if (!(nodes instanceof Map)) throw new TypeError('applyArmChannels expects an original-name node Map.');
  if (!library?.rig?.L || !library?.rig?.R) throw new TypeError('Use createArmPoseLibrary(nodes) before applying channels.');
  const gain = clamp(finite(intensity, 1), 0, 1);
  const report = { applied: false, intensity: gain, sides: {} };
  if (!gain) return report;
  const inverseTorso = torsoQuaternion ? quaternion(torsoQuaternion).invert() : null;
  target = targetInTorso(target, inverseTorso);
  secondaryTarget = targetInTorso(secondaryTarget, inverseTorso);
  for (const side of ['L', 'R']) {
    const rig = library.rig[side];
    const lift = clamp(channelValue(channels, `shoulder.${side}.lift`), -.20, .20) * gain;
    const armContributions = [];
    const shapeContributions = [];
    const sideReport = report.sides[side] = { armWeight: 0, handWeight: 0, targetClamped: false };
    for (const name of HAND_POSE_NAMES) {
      const w = weight(channelValue(channels, `hand.${side}.${name}`)) * gain;
      if (!w) continue;
      shapeContributions.push([library.hands[side][name], w]);
      sideReport.handWeight += w;
    }
    const shoulder = required(nodes, rig.names.shoulder);
    const inverseShoulder = quaternion(shoulder.quaternion)
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, rig.sign * lift)).invert();
    const addArmPose = (pose, w) => {
      if (!(w > 0)) return;
      // Every library endpoint is absolute in torso space, not just a point.
      // Compensating the inherited shoulder prevents posture-specific extra
      // turns from pushing crossed hands, claps or ear gestures into the model.
      armContributions.push([{ ...pose, upper: inverseShoulder.clone().multiply(pose.upper).normalize() }, w]);
      sideReport.armWeight += w;
    };
    for (const name of ARM_POSE_NAMES) {
      const w = weight(channelValue(channels, `arm.${side}.${name}`)) * gain;
      if (!w) continue;
      if (name === 'crossHigh') {
        // Raise the upper crossed hand while still outside the lower hand.
        // A shared low corridor would collide when left/right curves lag.
        if (w < .30) addArmPose(library.poses[side].sideClearance, ease(w / .30));
        else if (w < .60) {
          const t = ease((w - .30) / .30);
          addArmPose(library.poses[side].sideClearance, 1 - t);
          addArmPose(library.poses[side].crossHighReady, t);
        } else {
          const t = ease((w - .60) / .40);
          addArmPose(library.poses[side].crossHighReady, 1 - t);
          addArmPose(library.poses[side].crossHigh, t);
        }
        sideReport.crossHighViaClearance = true;
        continue;
      }
      if (['behind', 'crossLow', 'ear', 'hip', 'clap'].includes(name)) {
        // An outward FK waypoint avoids the direct chest-to-back chord from
        // central/low hand postures. Crossed hands first separate laterally;
        // an ear approach rises outside the ear. A clap first opens the palms.
        // Descending weights retrace the same local-quaternion arc.
        const via = name === 'clap' ? 'clapReady' : 'sideClearance';
        const t = ease(w < .5 ? 2 * w : 2 * w - 1);
        addArmPose(library.poses[side][via], w < .5 ? t : 1 - t);
        if (w >= .5) {
          const endpoint = name === 'ear'
            ? earContactPose(nodes, library, side, channels, gain, shapeContributions, lift, headToTorso)
            : name === 'hip' ? hipContactPose(nodes, library, side, lift)
              : library.poses[side][name];
          addArmPose(endpoint, t);
          if (endpoint.earContact) sideReport.earContact = endpoint.earContact;
          if (endpoint.hipContact) sideReport.hipContact = endpoint.hipContact;
        }
        sideReport[`${name}ViaClearance`] = true;
        continue;
      }
      const pose = name === 'point' ? cachedPoint(library, side, target, false)
        : name === 'pointSecondary' ? cachedPoint(library, side, secondaryTarget, true)
          : name === 'palmUpTarget' ? cachedPoint(library, side, target, false, true)
            : name === 'pointDownTarget' ? cachedPoint(library, side, target, false, false, true)
          : library.poses[side][name];
      addArmPose(pose, w);
      if (pose.target) {
        sideReport.targetClamped ||= pose.target.clamped;
        sideReport[name] = { direction: pose.target.direction.toArray(),
          usedFallback: pose.target.usedFallback, reachClamped: pose.reachClamped };
      }
    }
    if (armContributions.length) {
      for (const [name, key] of [[rig.names.upper, 'upper'], [rig.names.forearm, 'forearm'], [rig.names.hand, 'hand']]) {
        const node = required(nodes, name);
        writeQuaternion(node, blendQuaternion(quaternion(node.quaternion),
          armContributions.map(([pose, w]) => [pose[key], w])));
      }
      report.applied = true;
    }
    for (let i = 0; i < 4; i++) {
      const anatomicalIndex = rig.anatomicalFingerIndices.indexOf(i);
      const adjustment = clamp(channelValue(channels, `hand.${side}.${FINGER_NAMES[anatomicalIndex]}`), -.65, 1.25) * gain;
      if (!shapeContributions.length && !adjustment) continue;
      for (const [j, key] of [[0, 'base'], [1, 'tip']]) {
        const node = required(nodes, rig.names.fingers[i][j]);
        const q = blendQuaternion(quaternion(node.quaternion),
          shapeContributions.map(([shape, w]) => [shape.fingers[i][key], w]));
        if (adjustment) q.multiply(new THREE.Quaternion().setFromAxisAngle(X, adjustment * (j ? .92 : 1)));
        writeQuaternion(node, q.normalize());
      }
      report.applied = true;
    }
    const thumbAdjustment = clamp(channelValue(channels, `hand.${side}.thumb`), -.65, 1.25) * gain;
    if (shapeContributions.length || thumbAdjustment) {
      const thumb = required(nodes, rig.names.thumb);
      const q = blendQuaternion(quaternion(thumb.quaternion),
        shapeContributions.map(([shape, w]) => [shape.thumb, w]));
      if (thumbAdjustment) q.multiply(new THREE.Quaternion().setFromAxisAngle(X, thumbAdjustment));
      writeQuaternion(thumb, q.normalize());
      report.applied = true;
    }
    const thumbUp = weight(channelValue(channels, `hand.${side}.thumbUp`)) * gain;
    if (thumbUp) {
      // The original thumb pivot lies 20 mm outside the palm's side. Opening
      // the capsule would expose a 2.85 mm gap (before the hand's 1.18 scale).
      // Seat only its root locally, smoothly with the same shape weight.
      const thumb = required(nodes, rig.names.thumb);
      const thumbRoot = vector(thumb.position);
      thumbRoot.x += rig.sign * .006 * thumbUp;
      writePosition(thumb, thumbRoot);
      sideReport.thumbRootInset = .006 * thumbUp;
      // A partial fistUp arm still needs an unmistakably vertical thumb.
      // Solve an angular LOCAL wrist correction only, keeping the wrist and
      // every limb translation untouched. This minimal swing preserves dorsal
      // orientation and is limited to a reasonable 77-degree wrist change.
      const hand = required(nodes, rig.names.hand);
      const frame = inverseShoulder.clone().invert();
      for (const name of [rig.names.upper, rig.names.elbow, rig.names.forearm, rig.names.wrist]) {
        frame.multiply(quaternion(required(nodes, name).quaternion));
      }
      const current = quaternion(hand.quaternion);
      const thumbAxis = DOWN.clone().applyQuaternion(library.hands[side].thumbUp.thumb)
        .applyQuaternion(current).applyQuaternion(frame).normalize();
      const up = Y.clone();
      if (inverseTorso) up.applyQuaternion(inverseTorso);
      const correction = new THREE.Quaternion().setFromUnitVectors(thumbAxis, up.normalize());
      const angle = new THREE.Quaternion().angleTo(correction);
      if (angle > 1.35) correction.slerp(new THREE.Quaternion(), 1 - 1.35 / angle);
      const desired = frame.clone().invert().multiply(correction).multiply(frame).multiply(current);
      writeQuaternion(hand, current.slerp(desired, thumbUp).normalize());
      sideReport.thumbUpCorrection = Math.min(angle, 1.35);
      sideReport.thumbUpLimited = angle > 1.35;
      report.applied = true;
    }
    const roll = clamp(channelValue(channels, `hand.${side}.roll`), -.25, .25) * gain;
    if (roll) {
      const hand = required(nodes, rig.names.hand);
      // Roll around the actual local long axis, not global Y.
      writeQuaternion(hand, quaternion(hand.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll)));
      report.applied = true;
    }
    if (lift) {
      const shoulder = required(nodes, rig.names.shoulder);
      writeQuaternion(shoulder, quaternion(shoulder.quaternion)
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z, rig.sign * lift)).normalize());
      const p = vector(shoulder.position);
      p.y += lift * .18;
      writePosition(shoulder, p);
      report.applied = true;
    }
  }
  return report;
}
