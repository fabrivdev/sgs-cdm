// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { CampiLocomotionController } from '../../../../public/campi3d/controller/locomotion.mjs';
import { readCampi } from '../../../../public/campi3d/controller/loader.mjs';
import { THREE } from '../../../../public/campi3d/controller/runtime.mjs';
import { createWelcomeMotion } from './welcomeMotion';

const base = new URL('../../../../public/campi3d/', import.meta.url);
const source = await readCampi(new URL('assets/Campi_3D_estados.glb', base));
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
function rig() {
  return new CampiLocomotionController({ scene: source.scene.clone(true), animations: source.animations },
    { manifest, autoPosture: false, initialState: 'sereno', initialPosture: 'centrado_suelto' });
}
function advance(c, seconds, fps = 60, update = dt => c.update(dt)) {
  const previous = new Map(), rotations = new Map();
  const metrics = { slip: 0, floor: Infinity, reach: 0, contact: 0, jointStep: 0, swing: 0, footSeparation: Infinity };
  for (let i = 0; i < Math.ceil(seconds * fps); i++) {
    update(1 / fps); c.model.updateMatrixWorld(true);
    for (const foot of c.lastIK) {
      metrics.contact = Math.max(metrics.contact, foot.contactError);
      metrics.reach = Math.max(metrics.reach, foot.reachExcess);
      if (!foot.planted) metrics.swing++;
      if (foot.planted && previous.get(foot.side)?.planted)
        metrics.slip = Math.max(metrics.slip, new THREE.Vector3(...foot.actual).distanceTo(new THREE.Vector3(...previous.get(foot.side).actual)));
      previous.set(foot.side, foot);
      const node = c.nodes.get(`25_FOOT_${foot.side}`);
      // Actual vertices of the GLB sole, not ankle-height proxies.
      for (const v of c.soleVertices[foot.side]) metrics.floor = Math.min(metrics.floor, node.localToWorld(v.clone()).y);
    }
    metrics.footSeparation = Math.min(metrics.footSeparation, new THREE.Vector3(...c.lastIK[0].actual).distanceTo(new THREE.Vector3(...c.lastIK[1].actual)));
    for (const name of ['21_THIGH_L','21_THIGH_R','23_SHIN_L','23_SHIN_R','25_FOOT_L','25_FOOT_R']) {
      const q = c.nodes.get(name).getWorldQuaternion(new THREE.Quaternion());
      if (rotations.has(name)) metrics.jointStep = Math.max(metrics.jointStep, q.angleTo(rotations.get(name)));
      rotations.set(name, q);
    }
  }
  return metrics;
}
function grounded(m) {
  expect(m.contact).toBeLessThan(1e-7); expect(m.reach).toBeLessThan(1e-7);
  expect(m.floor).toBeGreaterThan(-1e-7); expect(m.slip).toBeLessThan(1e-7);
  expect(m.jointStep).toBeLessThan(.20); expect(m.footSeparation).toBeGreaterThan(.42);
}
describe('opt-in locomotion on the real articulated GLB', () => {
  it.each([
    { kind: 'walk', to: [0, 1] },
    { kind: 'side-step', to: [-1, 0] },
    { kind: 'side-step', to: [1, 0] },
    { kind: 'turn', yaw: .65 },
    { kind: 'turn', yaw: -.65 },
  ])('moves with locked support, sole clearance, finite reach and continuous joints: %o', segment => {
    const c = rig(); c.startLocomotion([segment]);
    const m = advance(c, c.motion.duration + .6); grounded(m); expect(m.swing).toBeGreaterThan(20);
    expect(c.snapshot().lastLocomotion.status).toBe('completed');
    if ('to' in segment) {
      expect(c.model.position.x).toBeCloseTo(segment.to[0], 8); expect(c.model.position.z).toBeCloseTo(segment.to[1], 8);
    }
    c.dispose();
  });
  it.each([0, .25, .65, 1.1, 1.9, 2.5])('brakes safely at t=%s, closes both feet and never reaches the old destination by teleport', at => {
    const c = rig(); c.startLocomotion([{ kind: 'walk', to: [0, 1] }]); advance(c, at);
    const before = c.model.position.clone(); c.stopLocomotion('early_click');
    expect(c.model.position.distanceTo(before)).toBe(0);
    const m = advance(c, 4); grounded(m);
    expect(c.model.position.z).toBeGreaterThanOrEqual(before.z - 1e-6); expect(c.model.position.z).toBeLessThanOrEqual(1 + 1e-6);
    expect(c.snapshot().lastLocomotion.status).toBe('stopped'); expect(c.lastIK.every(f => f.planted)).toBe(true);
    c.dispose();
  });
  it('preserves position/velocity at braking without accelerating toward the old endpoint', () => {
    const c = rig(); c.startLocomotion([{ kind: 'walk', to: [0, 1] }]); advance(c, .84, 120);
    const at = c.motion.time, before = c.motion.trajectory(at); c.stopLocomotion();
    const after = c.motion.trajectory(at);
    for (const axis of ['x','z','yaw']) {
      expect(after[axis].p).toBeCloseTo(before[axis].p, 10);
      expect(after[axis].v).toBeCloseTo(before[axis].v, 10);
      expect(after[axis].a).toBeCloseTo(before[axis].a, 10);
    }
    let peak = 0;
    while (c.motion) { peak = Math.max(peak, Math.abs(c.motion.trajectory(c.motion.time).z.v)); c.update(1/120); }
    expect(peak).toBeLessThan(before.z.v * 1.25); expect(c.model.position.z).toBeLessThan(.65); c.dispose();
  });
  it('scales cadence/duration with distance, is deterministic across frame rates, rejects impossible speeds', () => {
    const a = rig(), b = rig(), short = rig();
    a.startLocomotion([{ kind: 'walk', to: [0, 1] }]); b.startLocomotion([{ kind: 'walk', to: [0, 1] }]);
    short.startLocomotion([{ kind: 'walk', to: [0, .3] }]); expect(short.motion.duration).toBeLessThan(a.motion.duration);
    advance(a, 1.5, 24); advance(b, 1.5, 120);
    expect(a.model.position.distanceTo(b.model.position)).toBeLessThan(1e-8);
    for (const side of ['L','R']) expect(a.nodes.get('25_FOOT_'+side).getWorldPosition(new THREE.Vector3()).distanceTo(b.nodes.get('25_FOOT_'+side).getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-7);
    const bad = rig(); expect(() => bad.startLocomotion([{ kind: 'walk', to: [0, 1], duration: .5 }])).toThrow();
    expect(bad.motion).toBeNull(); [a,b,short,bad].forEach(c => c.dispose());
  });
  it('pauses and resumes without replay, grounds a reduced-motion stop and stays still', () => {
    const c = rig(); c.startLocomotion([{ kind: 'walk', to: [0, 1] }]); advance(c,.36);
    c.setPaused(true); const t = c.motion.time, root = c.model.position.clone(); advance(c,.5);
    expect(c.motion.time).toBe(t); expect(c.model.position.distanceTo(root)).toBe(0);
    c.setPaused(false); c.setReducedMotion(true); grounded(advance(c,.5));
    expect(c.lastIK.every(f => f.planted)).toBe(true); expect(c.motion).toBeNull();
    const pose = c.capture(0).transforms; advance(c,.5); expect(c.capture(0).transforms).toEqual(pose);
    c.setReducedMotion(false); expect(c.motion).toBeNull(); expect(c.startLocomotion([{kind:'walk',to:[0,1]}]).started).toBe(true);
    grounded(advance(c,4)); c.dispose();
  });
  it('coordinates entry, turn, greeting, idle, invitation, side steps and UI exactly once', async () => {
    const c = rig(), reveal = vi.fn(() => ({ finished: Promise.resolve('completed' as const), cancel: vi.fn(), finishReduced: vi.fn(), setPaused: vi.fn() }));
    const motion = createWelcomeMotion(c, { revealSelector: reveal, locomotion: {
      entry: [{ kind:'walk',to:[0,.6] },{kind:'turn',yaw:.3}],
      toSelector: [{kind:'turn',yaw:0},{kind:'side-step',to:[-.8,.6]}],
    } });
    const play = vi.spyOn(c,'playRecipe'); motion.start();
    grounded(advance(c,8,60,dt=>motion.update(dt))); expect(motion.phase).toBe('idle');
    motion.prepare(); motion.prepare(); grounded(advance(c,8,60,dt=>motion.update(dt))); await Promise.resolve();
    motion.update(0); expect(motion.phase).toBe('selector'); expect(reveal).toHaveBeenCalledOnce();
    expect(play.mock.calls.map(v=>v[0])).toEqual(['personalidad-02','personalidad-12']);
    expect(c.model.position.x).toBeCloseTo(-.8,7); motion.dispose(); c.dispose();
  }, 20000);
  it('accepts a click during entry and reduced motion/disposal during travel without later replay', async () => {
    const c=rig(), signal=new AbortController();
    const reveal=vi.fn(()=>({finished:Promise.resolve('reduced' as const),cancel:vi.fn(),finishReduced:vi.fn(),setPaused:vi.fn()}));
    const motion=createWelcomeMotion(c,{signal:signal.signal,revealSelector:reveal,locomotion:{entry:[{kind:'walk',to:[0,1]}]}});
    const play=vi.spyOn(c,'playRecipe'); motion.start(); advance(c,.5,60,dt=>motion.update(dt)); motion.prepare();
    grounded(advance(c,2,60,dt=>motion.update(dt))); expect(play.mock.calls.map(v=>v[0])).toEqual(['personalidad-12']);
    motion.setReducedMotion(true); await Promise.resolve(); motion.update(0); expect(reveal).toHaveBeenCalledOnce();
    signal.abort(); const before=c.model.position.clone(); motion.update(10); expect(c.model.position.distanceTo(before)).toBe(0);
    c.dispose();
  });
  it.each([{kind:'side-step',to:[-1,0]},{kind:'turn',yaw:.65}])('also closes supports when cancelling %o', segment => {
    const c=rig(); c.startLocomotion([segment]); advance(c,.7); c.stopLocomotion('cancel');
    grounded(advance(c,4)); expect(c.motion).toBeNull(); expect(c.lastIK.every(f=>f.planted)).toBe(true); c.dispose();
  });
});
