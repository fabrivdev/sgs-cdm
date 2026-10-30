/** Unmounted choreography controller. No art, DOM, storage, data reads or RAF.
 * Durations are draft acting beats, pending validation against approved layered art. */
export type WelcomeBeat='entry'|'brake'|'greet'|'present'|'rest'|'curiosity'|'bow'|'settle'|'invite'|'exit';
export type WelcomeFrame={beat:WelcomeBeat;progress:number;elapsed:number;static:boolean;done:boolean};
const entrance:ReadonlyArray<readonly [WelcomeBeat,number]>=[['entry',1.2],['brake',.45],['greet',1.55],['present',1.6]];
const idle:ReadonlyArray<readonly [WelcomeBeat,number]>=[['rest',7],['curiosity',1.6],['rest',11],['bow',1.4],['rest',13]];
const invitation:ReadonlyArray<readonly [WelcomeBeat,number]>=[['settle',.25],['invite',.9],['exit',.6]];
/** A renderer must blend its CURRENT pose during settle; never reset limbs to frame zero.
 * Feet/contact/silhouette quality cannot be certified by this timing-only controller. */
export function createWelcomeTimeline({reducedMotion=false,onAdvance,onBeat,posesV2=false}:{posesV2?:boolean;reducedMotion?:boolean;onAdvance:()=>void;onBeat?:(beat:WelcomeBeat)=>void}){
 let reduced=reducedMotion,paused=false,disposed=false,started=false,requested=false,completed=false;
 const intro=posesV2?([['rest',.35],['greet',2.4],['present',2.6]] as const):entrance;
 const resting=posesV2?([['rest',6],['curiosity',3],['rest',9],['bow',3.5],['rest',11]] as const):idle;
 const inviting=posesV2?([['settle',.55],['invite',1.2],['exit',.2]] as const):invitation;
 let route:ReadonlyArray<readonly [WelcomeBeat,number]>=intro,index=0,time=0,total=0;
 const snapshot=():WelcomeFrame=>({beat:completed?'rest':route[index][0],progress:reduced||completed?0:Math.min(time/route[index][1],1),elapsed:total,static:reduced||completed,done:completed});
 const notify=()=>{if(!disposed)onBeat?.(snapshot().beat);};
 const finish=()=>{if(disposed||completed)return;completed=true;onAdvance();};
 const rest=()=>{route=resting;index=0;time=0;notify();};
 return {
  snapshot,
  start(){if(disposed||started)return;started=true;if(reduced)rest();else notify();},
  prepare(){if(disposed||requested||completed)return;requested=true;started=true;if(reduced){finish();return;}route=inviting;index=0;time=0;notify();},
  tick(dt:number){
   if(!Number.isFinite(dt)||dt<0)throw new RangeError('Elapsed time must be finite and nonnegative.');
   if(disposed||!started||paused||reduced||completed)return snapshot();
   // A suspended tab must not consume minutes of missed acting on its first frame.
   let remaining=Math.min(dt,.1);
   while(remaining>1e-9&&!disposed&&!completed){
    const advance=Math.min(remaining,route[index][1]-time);time+=advance;total+=advance;remaining-=advance;
    if(time+1e-9>=route[index][1]){
     time=0;index++;
     if(index>=route.length){if(route===inviting){index=route.length-1;finish();break;}rest();}
     else notify();
    }
   }
   return snapshot();
  },
  setPaused(value:boolean){paused=value;},
  setReducedMotion(value:boolean){if(disposed||reduced===value)return;reduced=value;if(value){if(requested)finish();else rest();}/* Turning motion back on never replays entry. */},
  dispose(){disposed=true;},
 };
}
