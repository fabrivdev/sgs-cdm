// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createWelcomeMotion } from './welcomeMotion';
import type { EntranceHandle } from './selectorEntrance';
import { readCampi } from '../../../../public/campi3d/controller/loader.mjs';
import { CampiController } from '../../../../public/campi3d/controller/runtime.mjs';

const root = new URL('../../../../public/campi3d/', import.meta.url);
const gltf = await readCampi(new URL('assets/Campi_3D_estados.glb', root));
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
function setup(extra = {}) {
  const runtime = new CampiController(gltf, { manifest, autoPosture: false, demoAutoStates: false });
  let complete!: () => void;
  const entrance: EntranceHandle = {
    finished: new Promise(resolve => { complete = () => resolve('completed'); }),
    cancel: vi.fn(() => complete()), finishReduced: vi.fn(() => complete()), setPaused: vi.fn(),
  };
  const reveal = vi.fn(() => entrance), phases: string[] = [];
  const machine = createWelcomeMotion(runtime, { revealSelector: reveal, onPhase: p => phases.push(p), ...extra });
  const play = vi.spyOn(runtime, 'playRecipe');
  let maxContact = 0, maxStep = 0;
  function advance(seconds: number) {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      const previous = runtime.nodes.get('01_PELVIS').position.clone();
      machine.update(1 / 60);
      maxStep = Math.max(maxStep, previous.distanceTo(runtime.nodes.get('01_PELVIS').position));
      for (const foot of runtime.lastIK) if (foot.planted) maxContact = Math.max(maxContact, foot.contactError);
    }
  }
  return { runtime, machine, reveal, entrance, phases, play, advance, complete: () => complete(),
    metrics: () => ({ maxContact, maxStep }), close: () => { machine.dispose(); runtime.dispose(); } };
}
describe('welcome coordinator against the actual GLB/runtime', () => {
  it('greets once, idles, invites, reveals at the actual palm event, then settles', async () => {
    const t = setup(); t.machine.start(); t.machine.start();
    t.advance(4.2); expect(t.machine.phase).toBe('idle');
    t.advance(25); expect(t.play).toHaveBeenCalledTimes(1);
    expect(t.runtime.snapshot().autoPosture).toBe(true);
    t.machine.prepare(); t.machine.prepare();
    t.advance(.8); expect(t.reveal).not.toHaveBeenCalled();
    t.advance(.2); expect(t.reveal).toHaveBeenCalledOnce();
    t.complete(); await Promise.resolve(); expect(t.machine.phase).toBe('inviting');
    t.advance(3.5); expect(t.machine.phase).toBe('selector');
    expect(t.play.mock.calls.map(c => c[0])).toEqual(['personalidad-02', 'personalidad-12']);
    expect(t.metrics().maxContact).toBeLessThan(1e-8);
    expect(t.metrics().maxStep).toBeLessThan(.03);
    t.close();
  }, 20000); // Simulates 33+ seconds of the real GLB/IK, independent of host CPU speed.
  it('consumes early and repeated clicks, waits for runtime stop, ignores stale greeting completion', () => {
    const t = setup(); t.machine.prepare(); t.machine.prepare();
    expect(t.machine.phase).toBe('settling'); t.advance(.2);
    expect(t.play).toHaveBeenCalledTimes(1); t.advance(.2);
    expect(t.machine.phase).toBe('inviting');
    expect(t.play).toHaveBeenCalledTimes(2);
    t.advance(4); expect(t.reveal).toHaveBeenCalledOnce();
    expect(t.metrics().maxContact).toBeLessThan(1e-8);
    expect(t.metrics().maxStep).toBeLessThan(.03); t.close();
  });
  it('pauses both timelines without consuming elapsed background time', () => {
    const t = setup(); t.machine.start(); t.advance(.2); t.machine.setPaused(true);
    const before = t.runtime.snapshot().recipe.progress;
    t.advance(10); expect(t.runtime.snapshot().recipe.progress).toBe(before);
    t.machine.prepare(); t.advance(10); expect(t.machine.phase).toBe('settling');
    t.machine.setPaused(false); t.advance(1.4);
    expect(t.reveal).toHaveBeenCalledOnce();
    t.machine.setPaused(true); expect(t.entrance.setPaused).toHaveBeenLastCalledWith(true);
    t.close();
  });
  it.each([{ reducedMotion: true }, { reentry: true }])('opens static selector without greeting: %o', async extra => {
    const t = setup(extra); t.machine.start(); t.machine.prepare();
    expect(t.reveal).toHaveBeenCalledWith(true); expect(t.play).not.toHaveBeenCalled();
    t.complete(); await Promise.resolve(); t.advance(20);
    expect(t.machine.phase).toBe('selector'); expect(t.play).not.toHaveBeenCalled(); t.close();
  });
  it('switches to reduced motion mid-gesture, with no replay when toggled back', async () => {
    const t = setup(); t.machine.start(); t.advance(.5);
    t.machine.setReducedMotion(true); t.machine.setReducedMotion(false);
    await Promise.resolve(); t.advance(20);
    expect(t.play).toHaveBeenCalledTimes(1); expect(t.reveal).toHaveBeenCalledWith(true);
    expect(t.runtime.snapshot().autoPosture).toBe(false); t.close();
  });
  it('aborts outstanding UI and ignores late completion without leaking into a new instance', async () => {
    const abort = new AbortController(), t = setup({ signal: abort.signal });
    t.machine.prepare(); t.advance(1.4); const calls = t.phases.length;
    abort.abort(); t.complete(); await Promise.resolve(); t.machine.prepare(); t.machine.update(5);
    expect(t.machine.phase).toBe('disposed'); expect(t.phases).toHaveLength(calls);
    expect(t.entrance.cancel).toHaveBeenCalledOnce();
    const next = setup(); next.machine.start();
    expect(next.play.mock.calls[0][1].token).not.toBe(t.play.mock.calls[0][1].token);
    next.close(); t.close();
  });
  it('falls through missing recipes without claiming an animation ran', async () => {
    const issues = vi.fn(), t = setup({ onIssue: issues });
    t.play.mockImplementation(() => ({ started: false, status: 'blocked_anatomy' }));
    t.machine.start(); expect(t.machine.phase).toBe('idle'); t.machine.prepare();
    expect(t.reveal).toHaveBeenCalledOnce(); t.complete(); await Promise.resolve();
    expect(t.machine.phase).toBe('selector'); expect(issues).toHaveBeenCalledTimes(2); t.close();
  });
  it('detaches environment listeners on disposal', () => {
    const t = setup();
    const media = new EventTarget() as MediaQueryList;
    Object.defineProperty(media, 'matches', { value: false });
    const doc = new EventTarget() as Document;
    Object.defineProperty(doc, 'hidden', { value: false });
    const rmMedia = vi.spyOn(media, 'removeEventListener'), rmDoc = vi.spyOn(doc, 'removeEventListener');
    t.machine.bindEnvironment(media, doc); t.close();
    expect(rmMedia).toHaveBeenCalledOnce(); expect(rmDoc).toHaveBeenCalledOnce();
  });
  it('does not start a recipe if a phase callback navigates away', () => {
    const abort = new AbortController();
    const t = setup({ signal: abort.signal, onPhase: () => abort.abort() });
    t.machine.start(); expect(t.machine.phase).toBe('disposed');
    expect(t.play).not.toHaveBeenCalled(); t.close();
  });
  it('does not invite when reduced motion interrupts the stopping phase', async () => {
    const t = setup(); t.machine.prepare(); t.machine.setReducedMotion(true);
    t.machine.update(1 / 60); await Promise.resolve();
    expect(t.play).toHaveBeenCalledTimes(1);
    expect(t.machine.phase).toBe('selector'); t.close();
  });
});

it('keeps the reduced-motion welcome until explicit CTA',()=>{
 const t=setup({reducedMotion:true,stayWelcomeWhenReduced:true});t.machine.start();t.advance(1);
 expect(t.reveal).not.toHaveBeenCalled();expect(t.play).not.toHaveBeenCalled();
 t.machine.prepare();expect(t.reveal).toHaveBeenCalledOnce();expect(t.play).not.toHaveBeenCalled();t.close();
});

describe('mounted short welcome timing',()=>{
 for(const fps of [30,60])it(`finishes naturally within 3s at ${fps}fps and reveals immediately on click`,async()=>{
  const {CampiLocomotionController}=await import('../../../../public/campi3d/controller/locomotion.mjs');
  const {recipes}=await import('../../../../public/campi3d/controller/recipes-registry.mjs');
  const {welcomeRecipes}=await import('../../../../public/campi3d/controller/welcome-recipes.mjs');
  const runtime=new CampiLocomotionController(gltf,{manifest,recipes:welcomeRecipes(recipes),autoPosture:false,demoAutoStates:false});
  runtime.place({x:0,z:.35,yaw:0});let elapsed=0,idleAt=0,maxContact=0,maxStep=0;
  const reveal=vi.fn(()=>({finished:Promise.resolve('completed' as const),cancel(){},finishReduced(){},setPaused(){}}));
  const motion=createWelcomeMotion(runtime,{revealOnPrepare:true,revealSelector:reveal,locomotion:{entry:[{kind:'walk',to:[0,.65]}]},onPhase:p=>{if(p==='idle')idleAt=elapsed;}});
  motion.start();
  while(elapsed<3.5){const before=runtime.nodes.get('01_PELVIS').position.clone();elapsed+=1/fps;motion.update(1/fps);maxStep=Math.max(maxStep,before.distanceTo(runtime.nodes.get('01_PELVIS').position));for(const foot of runtime.lastIK)if(foot.planted)maxContact=Math.max(maxContact,foot.contactError);}
  expect(idleAt).toBeGreaterThanOrEqual(2);expect(idleAt).toBeLessThanOrEqual(3);
  expect(maxContact).toBeLessThan(1e-8);expect(maxStep).toBeLessThan(.07);
  expect(recipes.find(r=>r.id==='personalidad-02').duration).toBe(3.8);
  motion.prepare();expect(reveal).toHaveBeenCalledOnce();
  console.info(JSON.stringify({fps,idleAt,maxContact,maxStep,selectorRevealDelay:0,selectorEntranceMaxSeconds:.44}));
  motion.dispose();runtime.dispose();
 });
});

it('reveals immediately on an early repeated CTA while braking remains safe',()=>{
 const t=setup({revealOnPrepare:true});t.machine.start();t.advance(.1);
 t.machine.prepare();t.machine.prepare();expect(t.reveal).toHaveBeenCalledOnce();
 t.advance(5);expect(t.reveal).toHaveBeenCalledOnce();expect(t.metrics().maxContact).toBeLessThan(1e-8);t.close();
});
