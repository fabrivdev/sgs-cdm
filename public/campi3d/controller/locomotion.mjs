import { CampiController, THREE, solvePlantedLegs } from './runtime.mjs';
import { smooth } from './recipe-engine.mjs';

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const qYaw = yaw => new THREE.Quaternion().setFromAxisAngle(Y, yaw);
const bump = u => 64 * u ** 3 * (1 - u) ** 3; // C2 lift: no touchdown velocity or acceleration.
let journeyId = 0;

/** Quintic Hermite: position/velocity/acceleration continuous through braking. */
function polynomial(p, v, a, end, duration) {
  const c0 = p, c1 = v * duration, c2 = a * duration * duration / 2;
  const d = end - c0;
  const c3 = 10 * d - 6 * c1 - 3 * c2;
  const c4 = -15 * d + 8 * c1 + 3 * c2;
  const c5 = 6 * d - 3 * c1 - c2;
  return t => {
    const u = clamp(t / duration, 0, 1);
    return {
      p: c0 + c1*u + c2*u*u + c3*u**3 + c4*u**4 + c5*u**5,
      v: (c1 + 2*c2*u + 3*c3*u*u + 4*c4*u**3 + 5*c5*u**4) / duration,
      a: (2*c2 + 6*c3*u + 12*c4*u*u + 20*c5*u**3) / duration**2,
    };
  };
}
const cloneFoot = f => ({ anchor: f.anchor.clone(), orientation: f.orientation.clone(), planted: f.planted, flight: false });

/** Opt-in subclass: the production CampiController and current avatar stay unchanged.
 * One existing mixer, existing pose springs and final two-bone support IK are reused.
 * Coordinates are meters in the model parent's ground plane; the parent may be a scene.
 */
export class CampiLocomotionController extends CampiController {
  constructor(gltf, options = {}) {
    super(gltf, options);
    this.motion = null;
    this.motionQueue = [];
    this.lastLocomotion = null;
    this.heldSupports = null;
    this.rootYaw = 0;
    this.motionDisposed = false;
  }
  /** Initial placement only, before the first update: never a visible teleport. */
  place({ x = 0, z = 0, yaw = 0 } = {}) {
    if (this.steps || this.motion || this.motionDisposed) throw new Error('Placement is only allowed before the first frame.');
    if (![x,z,yaw].every(Number.isFinite)) throw new TypeError('Placement must be finite.');
    this.model.position.set(x, 0, z); this.model.quaternion.copy(qYaw(yaw)); this.rootYaw = yaw;
    this.lastIK = solvePlantedLegs(this.model, this.nodes);
  }
  captureSupports() {
    this.model.updateMatrixWorld(true);
    const result = {};
    const inverse = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const side of ['L','R']) {
      const node = this.nodes.get(`25_FOOT_${side}`);
      result[side] = {
        anchor: this.model.worldToLocal(node.getWorldPosition(new THREE.Vector3())),
        orientation: inverse.clone().multiply(node.getWorldQuaternion(new THREE.Quaternion())),
        planted: this.lastIK.find(f => f.side === side)?.planted ?? true, flight: false,
      };
    }
    return result;
  }
  toParent(support) {
    return { ...cloneFoot(support),
      anchor: support.anchor.clone().applyQuaternion(this.model.quaternion).add(this.model.position),
      orientation: this.model.quaternion.clone().multiply(support.orientation) };
  }
  canonicalFoot(side, pose) {
    const orientation = qYaw(pose.yaw);
    const soleHeight = -Math.min(...this.soleVertices[side].map(v => v.clone().applyQuaternion(orientation).y));
    const anchor = new THREE.Vector3(side === 'L' ? -.32 : .32, soleHeight, .02)
      .applyQuaternion(orientation).add(new THREE.Vector3(pose.x, 0, pose.z));
    return { anchor, orientation, planted: true, flight: false };
  }
  /** Each segment is { kind:'walk'|'side-step'|'turn', to?:[x,z], yaw?:radians, duration?:seconds }.
   * Walking must follow the current facing direction. Turn explicitly before changing direction.
   */
  startLocomotion(segments) {
    if (this.motionDisposed) return { started: false, status: 'disposed' };
    if (this.reducedMotion) return { started: false, status: 'reduced_motion' };
    if (this.motion || this.reducedLanding) return { started: false, status: 'busy_locomotion' };
    if (this.recipeEngine.active) return { started: false, status: 'busy_recipe' };
    if (!Array.isArray(segments) || !segments.length) throw new TypeError('An explicit nonempty route is required.');
    if (this.model.scale.distanceTo(new THREE.Vector3(1,1,1)) > 1e-8 || Math.abs(this.model.position.y) > 1e-8)
      throw new Error('Locomotion expects unit model scale on parent ground y=0. Scale the scene parent instead.');
    // Validate the whole route before mutating the live character.
    let from = { x: this.model.position.x, z: this.model.position.z, yaw: this.rootYaw };
    const planned = segments.map(input => { const segment = this.validateSegment(input, from); from = segment.end; return segment; });
    this.motionQueue = planned;
    this.activeJourney = ++journeyId;
    this.setAutoPosture(false); this.setDemoAutoStates(false);
    this.beginSegment(this.motionQueue.shift());
    return { started: true, status: 'moving', token: this.activeJourney };
  }
  validateSegment(input, from) {
    if (!input || !['walk','side-step','turn'].includes(input.kind)) throw new TypeError('Unknown locomotion kind.');
    const to = input.to ?? [from.x, from.z];
    if (!Array.isArray(to) || to.length !== 2 || !to.every(Number.isFinite) || (input.yaw !== undefined && !Number.isFinite(input.yaw))) throw new TypeError('Finite ground coordinates/yaw required.');
    const end = { x: to[0], z: to[1], yaw: from.yaw + angleDelta(from.yaw, input.yaw ?? from.yaw) };
    const dx = end.x-from.x, dz = end.z-from.z, distance = Math.hypot(dx,dz), turn = Math.abs(end.yaw-from.yaw);
    if (distance > 3 || turn > Math.PI/2 + 1e-8) throw new RangeError('Split long travel (>3m) or turns (>90 degrees) into explicit segments.');
    if (input.kind === 'turn' ? distance > 1e-8 : turn > 1e-8) throw new Error('Travel and stepping turns are separate segments.');
    const forward = dx*Math.sin(from.yaw)+dz*Math.cos(from.yaw);
    const lateral = dx*Math.cos(from.yaw)-dz*Math.sin(from.yaw);
    if (input.kind === 'walk' && (Math.abs(lateral)>1e-5 || forward<0)) throw new Error('Walk forward along heading; turn first.');
    if (input.kind === 'side-step' && Math.abs(forward)>1e-5) throw new Error('Side-step perpendicular to heading.');
    if (distance < 1e-6 && turn < 1e-6) throw new Error('Zero-distance motion is not an animation.');
    const count = Math.max(4, 2*Math.ceil(distance/.45), 2*Math.ceil(turn/.4));
    const minimum = .4 + Math.max(count*.34, 1.875*distance/.8, 1.875*turn/1.3);
    const duration = input.duration ?? minimum;
    if (!Number.isFinite(duration) || duration < minimum-1e-8 || duration > 20) throw new RangeError(`Duration must be ${minimum.toFixed(3)}–20s for this distance and step count.`);
    return { kind: input.kind, end, duration, count, leading: input.kind === 'side-step' && lateral<0 ? 'L' : 'R' };
  }
  beginSegment(segment) {
    const from = { x:this.model.position.x, z:this.model.position.z, yaw:this.rootYaw };
    const travelTime = segment.duration-.4, start=.18;
    const curves = Object.fromEntries(['x','z','yaw'].map(k=>[k,polynomial(from[k],0,0,segment.end[k],travelTime)]));
    const trajectory = time => Object.fromEntries(['x','z','yaw'].map(k=>[k,curves[k](time-start)]));
    const poseAt = time => Object.fromEntries(Object.entries(trajectory(time)).map(([k,v])=>[k,v.p]));
    const supports=this.captureSupports();
    const feet=Object.fromEntries(['L','R'].map(side=>[side,this.toParent(supports[side])]));
    const steps=[], period=travelTime/segment.count;
    for(let i=0;i<segment.count;i++) {
      const side=i%2===0?segment.leading:(segment.leading==='R'?'L':'R');
      const lift=start+(i+.06)*period, land=start+(i+.80)*period;
      // A side-step pair shares one landing center: lead opens the stance, trail
      // closes to normal width. Sampling each side independently can cross boots.
      const destinationTime=segment.kind==='side-step'
        ? start+(Math.floor(i/2)*2+2)*period : land+.65*period;
      const destination=i>=segment.count-2?segment.end:poseAt(Math.min(start+travelTime,destinationTime));
      const to=this.canonicalFoot(side,destination);
      steps.push({side,lift,land,from:cloneFoot(feet[side]),to}); feet[side]=to;
    }
    this.motion={...segment,time:0,start,period,trajectory,steps,initial:Object.fromEntries(['L','R'].map(side=>[side,this.toParent(supports[side])])),status:'moving',stopReason:null};
    this.lastLocomotion={token:this.activeJourney,status:'moving',kind:segment.kind};
    this.heldSupports=null;
  }
  /** Finish the current swing, then two closing steps. Root braking preserves C2 derivatives. */
  stopLocomotion(reason='cancelled') {
    this.motionQueue=[];
    const m=this.motion;
    if (!m || m.stopReason) return false;
    m.stopReason=reason; m.status='braking';
    if(m.time<=m.start) {
      this.lastLocomotion={token:this.activeJourney,status:'stopped',kind:m.kind,reason};
      this.motion=null; return true;
    }
    const remaining=m.steps.filter(s=>s.lift>m.time+1e-8);
    if (remaining.length<2) return true; // Already in the final deceleration/closing pair.
    const closing=remaining.slice(0,2), endTime=closing[1].land+.20;
    const oldTrajectory=m.trajectory, begin=m.time;
    const current=oldTrajectory(begin), brakeTime=endTime-begin;
    // Brake from CURRENT velocity instead of chasing the old accelerating path.
    // Keep a small acceleration contribution for C2 continuity at the request.
    const endpoint=Object.fromEntries(['x','z','yaw'].map(k=>{
      const proposed=current[k].p+current[k].v*brakeTime*.45+current[k].a*brakeTime**2*.02;
      return [k,clamp(proposed,Math.min(current[k].p,m.end[k]),Math.max(current[k].p,m.end[k]))];
    }));
    const curves=Object.fromEntries(['x','z','yaw'].map(k=>[k,polynomial(current[k].p,current[k].v,current[k].a,endpoint[k],endTime-begin)]));
    m.trajectory=time=>time<begin?oldTrajectory(time):Object.fromEntries(['x','z','yaw'].map(k=>[k,curves[k](time-begin)]));
    m.steps=m.steps.filter(s=>s.lift<=begin).concat(closing);
    for(const step of closing) step.to=this.canonicalFoot(step.side,endpoint);
    m.duration=endTime; m.end=endpoint;
    return true;
  }
  setAutoPosture(value) { return super.setAutoPosture(this.motion ? false : value); }
  playRecipe(id, options={}) {
    if (this.motion || this.reducedLanding) return {started:false,id,token:options.token??null,status:'busy_locomotion'};
    return super.playRecipe(id,options);
  }
  setReducedMotion(value) {
    if (value && this.motion) {
      this.heldSupports=this.captureSupports();
      this.lastLocomotion={token:this.activeJourney,status:'reduced_motion',kind:this.motion.kind};
      this.motion=null; this.motionQueue=[];
    }
    return super.setReducedMotion(value);
  }
  sampleTarget() {
    const result=super.sampleTarget();
    const m=this.motion;
    if (!m) { if(this.heldSupports) this.recipeSupports=this.heldSupports; return result; }
    const time=m.time;
    const feet=Object.fromEntries(['L','R'].map(side=>[side,cloneFoot(m.initial[side])]));
    let swing=null;
    for(const step of m.steps) {
      if(time<step.lift) continue;
      if(time>=step.land) { feet[step.side]=cloneFoot(step.to); continue; }
      const u=(time-step.lift)/(step.land-step.lift), ease=smooth(u);
      const foot={anchor:step.from.anchor.clone().lerp(step.to.anchor,ease),orientation:step.from.orientation.clone().slerp(step.to.orientation,ease),planted:false,flight:false};
      foot.anchor.y+=.115*bump(u);
      feet[step.side]=foot; swing={side:step.side,u};
    }
    const inverse=this.model.quaternion.clone().invert();
    this.recipeSupports=Object.fromEntries(['L','R'].map(side=>[side,{
      ...feet[side],anchor:feet[side].anchor.clone().sub(this.model.position).applyQuaternion(inverse),
      orientation:inverse.clone().multiply(feet[side].orientation),
    }]));
    const pelvis=this.targetNodes.get('01_PELVIS');
    const envelope=smooth(Math.min(1,time/.3))*smooth(Math.min(1,(m.duration-time)/.25));
    const sway=swing ? (swing.side==='R'?-1:1)*.105*bump(swing.u) : 0;
    pelvis.position.x+=sway;
    pelvis.position.y-=.045*envelope;
    // Hands swing from the existing loose pose, opposite the advancing leg.
    const swingAmount=swing ? (swing.side==='R'?-1:1)*.22*bump(swing.u)*envelope : 0;
    for(const [side,sign] of [['L',1],['R',-1]]) {
      const arm=this.targetNodes.get(`11_UPPER_ARM_${side}`);
      arm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(m.kind==='side-step'?Z:X,sign*swingAmount));
    }
    this.targetNodes.get('02_WAIST_TORSO').quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z,-sway*.20));
    if(m.kind==='walk') this.targetNodes.get('02_WAIST_TORSO').quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X,.035*envelope));
    this.motionFeet=feet;
    return result;
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<0) throw new RangeError('dt must be finite and nonnegative.');
    if(this.motionDisposed) return this.snapshot();
    if(this.reducedLanding) {
      const snapshot=super.update(dt);
      if(!this.reducedLanding) this.heldSupports=this.captureSupports();
      return snapshot;
    }
    if(this.paused||this.reducedMotion||!this.motion||dt===0) return super.update(dt);
    const count=Math.ceil(dt/this.maxStep), delta=dt/count;
    for(let i=0;i<count;i++) {
      const m=this.motion;
      if(!m) { super.update(delta); continue; }
      m.time=Math.min(m.duration,m.time+delta);
      const pose=m.trajectory(m.time);
      this.model.position.x=pose.x.p; this.model.position.z=pose.z.p;
      this.rootYaw=pose.yaw.p; this.model.quaternion.copy(qYaw(this.rootYaw));
      super.update(delta);
      if(m.time>=m.duration-1e-9) {
        this.lastLocomotion={token:this.activeJourney,status:m.stopReason?'stopped':'completed',kind:m.kind,reason:m.stopReason};
        this.motion=null; this.heldSupports=null;
        if(this.motionQueue.length) this.beginSegment(this.motionQueue.shift());
      }
    }
    return this.snapshot();
  }
  snapshot() {
    return {...super.snapshot(),locomotion:this.motion?{token:this.activeJourney,status:this.motion.status,kind:this.motion.kind,time:this.motion.time,duration:this.motion.duration}:null,lastLocomotion:this.lastLocomotion??null};
  }
  dispose() {
    this.motionDisposed=true; this.motion=null; this.motionQueue=[];
    super.dispose();
  }
}
