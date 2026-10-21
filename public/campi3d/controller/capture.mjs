import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCampi } from './loader.mjs';
import { CampiController } from './runtime.mjs';
import { REVIEW_TIMELINE } from './logic.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ASSET = path.resolve(HERE, '../assets/Campi_3D_estados.glb');
export const DEFAULT_MANIFEST = path.resolve(HERE, '../manifest.json');

/** Use exact event times even when an event falls between capture frames. */
export function advanceTo(controller, targetTime, timeline, cursor) {
  while (cursor < timeline.length && timeline[cursor].time <= targetTime + 1e-9) {
    const event = timeline[cursor++];
    const delta = event.time - controller.snapshot().time;
    if (delta > 1e-10) controller.update(delta);
    controller.setState(event.state, { ...event, restart: true });
  }
  const remainder = targetTime - controller.snapshot().time;
  if (remainder > 1e-10) controller.update(remainder);
  return cursor;
}

export async function createCapture({
  asset = DEFAULT_ASSET, manifestPath = DEFAULT_MANIFEST, fps = 24,
  duration = 27.2, seed = 216834, timeline = REVIEW_TIMELINE,
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bytes = await readFile(asset);
  const gltf = await parseCampi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const controller = new CampiController(gltf, {
    manifest, seed, auto: false,
    initialState: timeline[0].state, initialPosture: timeline[0].posture,
  });
  controller.setState(timeline[0].state, { ...timeline[0], restart: true });
  // Initialize the selected phase without adding a transition from the constructor's random phase.
  controller.sampleTarget();
  for (const [name, node] of controller.nodes) {
    const target = controller.targetNodes.get(name);
    node.position.copy(target.position);
    node.quaternion.copy(target.quaternion);
    node.scale.copy(target.scale);
  }
  // An update preserves the visible initialization and solves feet before the first capture.
  const { solvePlantedLegs } = await import('./runtime.mjs');
  controller.lastIK = solvePlantedLegs(controller.model, controller.nodes);
  const frames = [];
  const frameCount = Math.ceil(duration * fps);
  let cursor = 1;
  let maxContactError = 0;
  let maxFlatnessError = 0;
  let maxReachExcess = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    cursor = advanceTo(controller, frame / fps, timeline, cursor);
    frames.push(controller.capture(frame + 1));
    for (const foot of controller.lastIK) {
      maxContactError = Math.max(maxContactError, foot.contactError);
      maxFlatnessError = Math.max(maxFlatnessError, foot.flatnessError);
      maxReachExcess = Math.max(maxReachExcess, foot.reachExcess);
    }
  }
  return {
    schema: 'campi-controller-local-transforms-v1',
    description: 'Exact visible controller transforms after smoothing and planted-foot IK. No rendered-browser verification is implied.',
    coordinates: 'glTF Y-up; position in meters; quaternion XYZW; local transforms relative to original parent',
    frameConvention: 'frame 1 is time 0; render these transforms, not the source action at frame number',
    asset: path.basename(asset),
    assetSha256: createHash('sha256').update(bytes).digest('hex'),
    fps, requestedDuration: duration, videoDuration: frameCount / fps, frameCount,
    seed, timeline,
    sourceTiming: {
      firstTime: controller.clipDiagnostics.sourceFirstTime,
      lastTime: controller.clipDiagnostics.sourceLastTime,
      blenderFrameOffset: controller.clipDiagnostics.frameOffset,
    },
    nodes: controller.records.map(({ name, index, node }) => ({
      name, index, parent: node.parent?.userData.originalName ?? null,
    })),
    validation: { maxContactError, maxFlatnessError, maxReachExcess },
    frames,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const output = path.resolve(option('--out', path.join(HERE, 'captures/controller-27s.json')));
  const capture = await createCapture({
    asset: path.resolve(option('--asset', DEFAULT_ASSET)),
    manifestPath: path.resolve(option('--manifest', DEFAULT_MANIFEST)),
    duration: Number(option('--duration', 27.2)),
    fps: Number(option('--fps', 24)),
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(capture));
  console.log(JSON.stringify({
    output, frames: capture.frameCount, nodes: capture.nodes.length,
    states: [...new Set(capture.frames.map(f => f.state))],
    postures: [...new Set(capture.frames.map(f => f.posture))],
    ...capture.validation,
  }, null, 2));
}
