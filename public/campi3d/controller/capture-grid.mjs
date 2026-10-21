/** Independent settled samples for collision QA, not a continuous animation. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCampi } from './loader.mjs';
import { CampiController } from './runtime.mjs';
import { STATE_IDS, POSTURE_IDS } from './logic.mjs';
import { DEFAULT_ASSET, DEFAULT_MANIFEST } from './capture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bytes = await readFile(DEFAULT_ASSET);
const gltf = await parseCampi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST, 'utf8'));
const controller = new CampiController(gltf, { manifest, auto: false, seed: 216834 });
const frames = [];
for (const state of STATE_IDS) {
  for (const posture of POSTURE_IDS) {
    controller.setState(state, { posture, restart: true, phaseStart: 1.5, playSeconds: 0, holdSeconds: 5 });
    controller.update(4);
    frames.push(controller.capture(frames.length + 1));
  }
}
const output = path.join(here, 'captures/settled-32-combinations.json');
await writeFile(output, JSON.stringify({
  schema: 'campi-controller-local-transforms-v1',
  description: '32 independent settled state/posture combinations for collision QA. Do not play as a continuous animation.',
  discontinuousSamples: true,
  coordinates: 'glTF Y-up; position in meters; quaternion XYZW; local transforms relative to original parent',
  asset: path.basename(DEFAULT_ASSET),
  assetSha256: createHash('sha256').update(bytes).digest('hex'),
  phase: 1.5,
  settlingSecondsPerSample: 4,
  frameCount: frames.length,
  nodes: controller.records.map(({ name, index, node }) => ({
    name, index, parent: node.parent?.userData.originalName ?? null,
  })),
  frames,
}));
console.log(JSON.stringify({ output, samples: frames.length, nodes: controller.records.length }, null, 2));
