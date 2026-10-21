import * as THREE from './vendor/three.module.js';

/** Create alpha at context creation: it cannot be enabled on an opaque context later. */
export function createCampiRenderer({ canvas, transparent = true, ...options } = {}) {
  return new THREE.WebGLRenderer({ antialias: true, ...options, canvas, alpha: transparent });
}

/** Transparent character only: no scene backdrop, studio floor, or shadows. */
export function configureTransparentOverlay({ renderer, scene, floor, model }) {
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  if (floor) floor.visible = false;
  scene.traverse(node => {
    if (node.isLight) node.castShadow = false;
  });
  model?.traverse(node => {
    if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
  });
}

/** Respect the system preference until the user explicitly selects a manual override. */
export function bindMotionPreference(controller, onChange = () => {}, media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
  let override = null;
  const apply = () => {
    controller.setReducedMotion(override ?? Boolean(media?.matches));
    onChange(controller.reducedMotion);
  };
  media?.addEventListener('change', apply);
  apply();
  return {
    setEnabled(value) { override = Boolean(value); apply(); },
    useSystem() { override = null; apply(); },
    get enabled() { return controller.reducedMotion; },
    dispose() { media?.removeEventListener('change', apply); },
  };
}

/**
 * Reduced-motion changes are direct still-pose selections. The character remains
 * visible throughout: no opacity fade, display toggle, or delayed stale change.
 * Promise return is retained for embedding compatibility.
 */
export function createPoseTransition(controller, element) {
  const visible = () => {
    if (element) { element.style.transition = ''; element.style.opacity = '1'; }
  };
  return {
    run(change) { visible(); change(); return Promise.resolve(true); },
    dispose() { visible(); },
  };
}
