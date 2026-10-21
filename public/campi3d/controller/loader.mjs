import { GLTFLoader } from './vendor/GLTFLoader.js';

export async function parseCampi(arrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  gltf.scene.traverse(node => {
    const index = gltf.parser.associations.get(node)?.nodes;
    if (index !== undefined) {
      node.userData.gltfNodeIndex = index;
      node.userData.originalName = gltf.parser.json.nodes[index].name ?? `node_${index}`;
    }
  });
  return gltf;
}

export async function fetchCampi(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return parseCampi(await response.arrayBuffer());
}

export async function readCampi(path) {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path);
  return parseCampi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
