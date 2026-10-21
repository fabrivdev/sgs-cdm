import * as THREE from './vendor/three.module.js';
import { fetchCampi } from './loader.mjs';
import { CampiController } from './runtime.mjs';
import { STATE_IDS } from './logic.mjs';
import { createCampiRenderer, configureTransparentOverlay, bindMotionPreference, createPoseTransition } from './integration.mjs';

const names = {
  sereno: 'Sereno', contento: 'Contento', atento: 'Atento', preocupado: 'Preocupado',
  pensativo: 'Pensativo', sorprendido: 'Sorprendido', explicativo: 'Explicativo', alivio: 'Alivio',
};
const supportNames = {
  centrado_suelto: 'Relajado asimétrico', peso_izquierdo: 'Peso izquierdo',
  peso_derecho: 'Peso derecho', manos_bajas_juntas: 'Manos bajas juntas',
};
const $ = id => document.getElementById(id);
let controller;
let last = 0;
let revision = -1;
let holding = null;
let renderer;
const overlay = new URLSearchParams(location.search).get('overlay') === '1';
document.documentElement.classList.toggle('campi-overlay', overlay);

try {
  renderer = createCampiRenderer({ canvas: $('canvas'), transparent: overlay });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8ece2');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(3.7, 3.1, 8.5);
  camera.lookAt(0, 1.75, 0);
  scene.add(new THREE.HemisphereLight(0xf4fff3, 0x83927a, 2.35));
  const key = new THREE.DirectionalLight(0xfff9e9, 3.1);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -4, near: 0.1, far: 18 });
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdbfff2, 1.6);
  rim.position.set(3, 4, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#e6eade', roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const [gltf, manifestResponse] = await Promise.all([
    fetchCampi('../assets/Campi_3D_estados.glb'), fetch('../manifest.json'),
  ]);
  if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
  controller = new CampiController(gltf, {
    manifest: await manifestResponse.json(), seed: 216834,
    autoPosture: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    demoAutoStates: false,
  });
  controller.model.traverse(node => {
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
  });
  scene.add(controller.model);
  if (overlay) configureTransparentOverlay({ renderer, scene, floor, model: controller.model });
  const transition = createPoseTransition(controller, $('canvas'));
  const motionPreference = bindMotionPreference(controller, enabled => {
    $('reduced-motion').setAttribute('aria-pressed', String(enabled));
    $('auto').disabled = enabled;
    $('auto-posture').disabled = enabled;
    $('pause').disabled = enabled;
    revision = -1;
  });
  for (const state of STATE_IDS) {
    const button = document.createElement('button');
    button.textContent = names[state];
    button.dataset.state = state;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      transition.run(() => {
        controller.setDemoAutoStates(false);
        controller.setPaused(false);
        controller.setState(state);
        revision = -1;
      });
    });
    $('states').append(button);
  }
  for (const id of ['posture', 'next-posture', 'reduced-motion']) $(id).disabled = false;
  for (const id of ['auto', 'auto-posture', 'pause']) $(id).disabled = controller.reducedMotion;
  $('posture').addEventListener('change', e => {
    const posture = e.target.value;
    transition.run(() => {
      controller.setPosture(posture, { extendHold: 3 });
      controller.setPaused(false);
      revision = -1;
    });
  });
  $('next-posture').addEventListener('click', () => {
    transition.run(() => {
      controller.setPosture(controller.director.postures.next(), { extendHold: 3 });
      controller.setPaused(false);
      revision = -1;
    });
  });
  $('auto').addEventListener('click', () => {
    controller.setDemoAutoStates(!controller.director.demoAutoStates);
    revision = -1;
  });
  $('auto-posture').addEventListener('click', () => {
    controller.setAutoPosture(!controller.director.autoPosture);
    revision = -1;
  });
  $('pause').addEventListener('click', () => {
    controller.setPaused(!controller.paused);
    revision = -1;
  });
  $('reduced-motion').addEventListener('click', () => {
    transition.dispose();
    motionPreference.setEnabled(!controller.reducedMotion);
  });
  // Same-origin embed API. No cross-origin message listener or external publication.
  const api = {
    controller,
    listRecipes: () => controller.listRecipes(),
    playRecipe: (id, options) => controller.playRecipe(id, options),
    stopRecipe: () => controller.stopRecipe(),
    setContext: context => controller.setContext(context),
    sampleRecipe: (id, normalizedTime, options) => controller.sampleRecipe(id, normalizedTime, options),
    setState: (state, options) => transition.run(() => { controller.setState(state, options); revision = -1; }),
    setPosture: posture => transition.run(() => { controller.setPosture(posture); revision = -1; }),
    setReducedMotion: value => { transition.dispose(); motionPreference.setEnabled(value); },
    useSystemMotionPreference: () => motionPreference.useSystem(),
    setPaused: value => { controller.setPaused(value); revision = -1; },
    setAuto: value => { const result = controller.setAuto(value); revision = -1; return result; },
    setAutoPosture: value => { const result = controller.setAutoPosture(value); revision = -1; return result; },
    setDemoAutoStates: value => { const result = controller.setDemoAutoStates(value); revision = -1; return result; },
  };
  globalThis.campi = api;
  globalThis.dispatchEvent(new CustomEvent('campi-ready', { detail: api }));
  document.addEventListener('visibilitychange', () => { last = 0; });
  const resize = () => {
    const { width, height } = $('canvas').getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(camera.aspect < 1 ? 3.4 : 3.7, 3.1, camera.aspect < 1 ? 10.5 : 8.5);
    camera.lookAt(0, 1.75, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe($('canvas'));
  resize();
  function frame(time) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
    last = time;
    const status = controller.update(dt);
    if (status.revision !== revision || status.holding !== holding) {
      revision = status.revision;
      holding = status.holding;
      $('state-label').textContent = names[status.state];
      $('posture-label').textContent = supportNames[status.posture];
      $('phase-label').textContent = status.reducedMotion ? 'Pose estable · movimiento reducido' : status.paused ? 'En pausa' : status.holding ? 'Sostiene la pose' : 'Gesto en curso';
      $('posture').value = status.posture;
      $('auto').setAttribute('aria-pressed', String(status.demoAutoStates));
      $('auto-posture').setAttribute('aria-pressed', String(status.autoPosture));
      $('pause').setAttribute('aria-pressed', String(status.paused));
      $('pause').textContent = status.paused ? 'Continuar' : 'Pausar';
      for (const button of $('states').children) {
        button.setAttribute('aria-pressed', String(button.dataset.state === status.state));
      }
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
} catch (error) {
  $('state-label').textContent = 'Vista no disponible';
  $('posture-label').textContent = '';
  $('error').hidden = false;
  $('error').textContent = `No se pudo cargar el estudio 3D completo. ${error.message}. Serví la carpeta campi-real3d-v5 por HTTP, no mediante file://.`;
  console.error(error);
}
