import {expect,it,vi} from 'vitest';
import {CampiEntryGate} from './entryGate';
import {createEntryRenderer} from './entryRenderer';
import {dropPose} from './approvedDropScene';
function setup(){const existing={start:vi.fn(),tick:vi.fn(),snapshot:()=>({}),prepare:vi.fn(),setPaused:vi.fn(),setReducedMotion:vi.fn(),dispose:vi.fn()};const advance=vi.fn(),end=vi.fn(),render=vi.fn();const gate=new CampiEntryGate({entryDuration:.2,renderEntry:render,existing,onEntryComplete:end,onAdvance:advance});return{gate,existing,advance,end,render};}
it('starts real timeline only after endpoint, never advances selector at arrival',()=>{const t=setup();t.gate.start();t.gate.tick(9);expect(t.existing.start).not.toHaveBeenCalled();t.gate.tick(.1);expect(t.existing.start).toHaveBeenCalledOnce();expect(t.end).toHaveBeenCalledOnce();expect(t.advance).not.toHaveBeenCalled();t.gate.prepare();t.gate.prepare();expect(t.existing.prepare).toHaveBeenCalledOnce();});
it('respects initial hidden, cancellation and terminal disposal',()=>{const t=setup();t.gate.setHidden(true);t.gate.start();t.gate.tick(.1);expect(t.gate.elapsed).toBe(0);t.gate.setHidden(false);t.gate.tick(.05);t.gate.prepare();t.gate.prepare();expect(t.advance).toHaveBeenCalledOnce();t.gate.dispose();t.gate.tick(10);t.gate.start();expect(t.existing.start).not.toHaveBeenCalled();});
it('reduced motion skips entrance and never replays it when disabled',()=>{const t=setup();t.gate.setReducedMotion(true);t.gate.start();expect(t.existing.start).toHaveBeenCalledOnce();expect(t.render).not.toHaveBeenCalled();t.gate.setReducedMotion(false);t.gate.tick(.1);expect(t.render).not.toHaveBeenCalled();});
it('keeps approved v6 entry expression and arm timing without starting its greeting',()=>{
 for(const [t,phase] of [[.5,'Caída'],[1.2,'Aterrizaje'],[1.5,'Rebote'],[1.9,'Asentarse']] as const)expect(dropPose(t).phase).toBe(phase);
 expect(dropPose(1).face).toBeGreaterThan(.9);expect(dropPose(1).arms).toBeGreaterThan(.4);expect(dropPose(2.2).greet).toBe(0);
});
function renderer(){const noop=()=>{};const ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k as keyof typeof o]:noop,set:()=>true});return createEntryRenderer({getContext:()=>ctx,width:0,height:0},{},{} )!;}
it('preserves time and floor through resize and completes the approved single greeting at 5.4 seconds',()=>{const r=renderer();r.resize(600,540,1,180);r.draw(1.2);const floor=r.snapshot().groundY;r.resize(900,540,2,180);expect(r.snapshot().time).toBe(1.2);expect(r.snapshot().groundY).toBe(floor);expect(r.snapshot().groundX).toBe(450);expect(r.duration).toBe(5.4);});

import {continuationPose} from './entryRenderer';
it('plays the approved greeting then keeps idle across every legacy timeline beat',()=>{
 expect(dropPose(3.3).greet).toBeGreaterThan(.9);
 for(const beat of ['greet','present','curiosity','bow','invite','rest'])for(const elapsed of [0,1,8,30]){
  const p=continuationPose({beat,elapsed,static:false});expect(p.t).toBe(5.4+elapsed);expect(p.greet).toBe(0);expect(p.wave).toBeCloseTo(0);
 }
});
it('holds the approved idle under reduced motion',()=>{
 const p=continuationPose({beat:'present',elapsed:100,static:true});expect(p.t).toBe(5.4);expect(p.arms).toBe(0);expect(p.y).toBeCloseTo(0);
});
