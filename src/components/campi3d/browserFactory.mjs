import { createWelcomeMotion } from './welcome-motion/welcomeMotion';
import { applySelection, contextChanged, reactionChanged } from './selection.mjs';
/** The supplied URL is a trusted same-origin deployment path, not user-entered content. */
export function createCampiFactory({ runtimeBaseUrl, assetUrl, manifestUrl, seed = 216834, welcome }) {
  return async ({ canvas, container, signal, onChange, onError, onRecipeResult }) => {
    const base = new URL(runtimeBaseUrl, document.baseURI);
    if (base.origin !== location.origin) throw new Error('Campi runtime must be same-origin.');
    const load = name => import(/* @vite-ignore */ new URL(name, base).href);
    let controller, renderer, resizeObserver, model, motion, floor;
    let disposed = false, frame = 0, previousTime = 0, previousKey = '', current, selected;
    let reducedWasEnabled = false, autoBlocked = false;
    const cleanups = [];
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      cleanups.splice(0).forEach(fn => fn());
      motion?.dispose();
      controller?.dispose();
      floor?.geometry.dispose(); floor?.material.dispose();
      // The visible clone shares GPU resources with the sampled GLB scene.
      const resources = new Set();
      model?.traverse(node => {
        if (node.geometry) resources.add(node.geometry);
        for (const material of [].concat(node.material ?? [])) {
          for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
          resources.add(material);
        }
      });
      resources.forEach(resource => resource.dispose());
      renderer?.dispose();
    };
    const listen = (target, event, fn) => {
      target.addEventListener(event, fn);
      cleanups.push(() => target.removeEventListener(event, fn));
    };
    const check = () => {
      if (signal.aborted) throw new DOMException('Campi mount aborted', 'AbortError');
    };
    try {
      const [runtime, loader, integration, assetResponse, manifestResponse] = await Promise.all([
        load('runtime.mjs'), load('loader.mjs'), load('integration.mjs'),
        fetch(assetUrl, { signal }), fetch(manifestUrl, { signal }),
      ]);
      check();
      if (!assetResponse.ok || !manifestResponse.ok) throw new Error(`Campi asset/manifest HTTP ${assetResponse.status}/${manifestResponse.status}`);
      const [gltf, manifest] = await Promise.all([
        assetResponse.arrayBuffer().then(buffer => loader.parseCampi(buffer)), manifestResponse.json(),
      ]);
      model = gltf.scene;
      check();
      const { THREE, CampiController } = runtime;
      const Controller=welcome?(await load('locomotion.mjs')).CampiLocomotionController:CampiController;
      check();
      const recipes=welcome?(await load('welcome-recipes.mjs')).welcomeRecipes((await load('recipes-registry.mjs')).recipes):undefined;
      controller = new Controller(gltf, { manifest, seed, autoPosture: false, demoAutoStates: false,...(recipes?{recipes}:{}) });
      if(welcome)controller.place({x:0,z:0.35,yaw:0});
      model = controller.model;
      renderer = integration.createCampiRenderer({ canvas, transparent: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      const scene = new THREE.Scene();
      scene.add(model, new THREE.HemisphereLight(0xf4fff3, 0x83927a, 2.35));
      const light = new THREE.DirectionalLight(0xfff9e9, 3.1);
      light.position.set(-3, 7, 5);
      scene.add(light);
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      camera.position.set(3.7, 3.1, 8.5);
      camera.lookAt(0, 1.75, 0);
      integration.configureTransparentOverlay({ renderer, scene, model });
      if(welcome){
        camera.position.set(0,2.6,10.5);camera.lookAt(0,1.65,0);
        renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        light.castShadow=true;light.shadow.mapSize.set(1024,1024);
        Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});
        light.shadow.normalBias=.005;light.shadow.bias=-.0001;
        model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
        floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.13}));
        floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
        motion=createWelcomeMotion(controller,{...welcome,signal,
          reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          stayWelcomeWhenReduced:true, revealOnPrepare:true,
          locomotion:{entry:[{kind:'walk',to:[0,0.65]}],toSelector:[{kind:'side-step',to:[-.32,.65]}]},
        });
        motion.bindEnvironment(window.matchMedia('(prefers-reduced-motion: reduce)'),document);
        motion.start();
      }
      const resize = () => {
        const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();
      const update = options => {
        if (disposed) return;
        if(motion){motion.setReducedMotion(options.reducedMotion);motion.setPaused(options.paused||document.hidden);return;}
        const previous = current;
        current = { ...options };
        if (options.reducedMotion) autoBlocked = true;
        // Leaving reduced motion never silently resumes autonomous movement.
        // A subsequent explicit false -> true autoPosture change re-arms it.
        if (!options.reducedMotion && !reducedWasEnabled && previous?.autoPosture === false && options.autoPosture) autoBlocked = false;
        reducedWasEnabled = options.reducedMotion;
        controller.setReducedMotion(options.reducedMotion);
        controller.setDemoAutoStates(false);
        controller.setAutoPosture(options.autoPosture && !autoBlocked);
        controller.setPaused(options.paused || document.hidden);
        if (contextChanged(options, selected) || reactionChanged(options, selected)) {
          // Reduced motion uses the runtime's still pose. Never fade the character to zero.
          try {
              const result = applySelection(controller, options, selected);
              selected = { ...options };
              if (result) {
                onRecipeResult?.(result);
                if (!result.started) onError(Object.assign(new Error(result.reason ?? `Campi recipe ${result.id}: ${result.status}`), { name: 'CampiRecipeBlockedError', result }));
              }
          } catch (error) { onError(error); }
        }
      };
      const tick = time => {
        if (disposed) return;
        try {
          const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
          previousTime = time;
          if (!document.hidden) {
            const snapshot = motion?motion.update(dt):controller.update(dt);
            renderer.render(scene, camera);
            const key = JSON.stringify([snapshot.state, snapshot.posture, snapshot.holding, snapshot.reducedMotion, snapshot.paused, snapshot.autoPosture, snapshot.recipe?.id, snapshot.recipe?.token, snapshot.recipe?.status, snapshot.recipe?.events, snapshot.context]);
            if (key !== previousKey) { previousKey = key; onChange(snapshot); }
          }
          frame = requestAnimationFrame(tick);
        } catch (error) { dispose(); onError(error); }
      };
      listen(document, 'visibilitychange', () => {
        previousTime = 0;
        if(motion)motion.setPaused(document.hidden);else controller.setPaused(Boolean(current?.paused) || document.hidden);
      });
      listen(canvas, 'webglcontextlost', event => {
        event.preventDefault();
        dispose();
        onError(new Error('Campi WebGL context lost. Remount the component to retry.'));
      });
      listen(signal, 'abort', dispose);
      check();
      frame = requestAnimationFrame(tick);
      return { update, dispose, prepare:()=>motion?.prepare(), listRecipes: () => controller.listRecipes?.() ?? [] };
    } catch (error) { dispose(); throw error; }
  };
}
