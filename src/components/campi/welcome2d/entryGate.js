export class CampiEntryGate{
 constructor({entryDuration,renderEntry,existing,onEntryComplete=()=>{},onAdvance=()=>{}}){Object.assign(this,{entryDuration,renderEntry,existing,onEntryComplete,onAdvance});this.elapsed=0;this.phase='idle';this.started=false;this.disposed=false;this.paused=false;this.hidden=false;this.reduced=false;this.prepared=false;this.token=0;}
 start(){if(this.disposed||this.started)return;this.started=true;this.token++;if(this.reduced){this.phase='timeline';this.existing.setReducedMotion(true);this.existing.start();return}this.phase='entry';this.renderEntry(0)}
 tick(dt){if(this.disposed||!this.started||this.paused||this.hidden||this.phase==='cancelled')return;dt=Math.max(0,Math.min(.1,Number(dt)||0));if(this.phase==='entry'){const token=this.token;this.elapsed=Math.min(this.entryDuration,this.elapsed+dt);this.renderEntry(this.elapsed);if(this.elapsed>=this.entryDuration&&token===this.token&&!this.disposed){this.phase='timeline';this.onEntryComplete({token,canonicalFrame:0});if(token!==this.token||this.disposed||this.phase!=='timeline')return;this.existing.start()}}else if(this.phase==='timeline')this.existing.tick(dt)}
 snapshot(){return{phase:this.phase,elapsed:this.elapsed,paused:this.paused,hidden:this.hidden,reduced:this.reduced,prepared:this.prepared,token:this.token,timeline:this.phase==='timeline'?this.existing.snapshot():null}}
 prepare(){if(this.disposed||this.prepared)return;this.prepared=true;if(this.phase==='entry'){this.phase='cancelled';this.token++;this.onAdvance({reason:'entry-cancelled',preserveCurrentPose:true})}else if(this.phase==='timeline')this.existing.prepare()}
 setPaused(v){if(this.disposed)return;this.paused=!!v;this.existing.setPaused(this.paused||this.hidden)}
 setHidden(v){if(this.disposed)return;this.hidden=!!v;this.existing.setPaused(this.paused||this.hidden)}
 setReducedMotion(v){if(this.disposed)return;this.reduced=!!v;this.existing.setReducedMotion(this.reduced);if(this.reduced&&this.started&&this.phase==='entry'){this.token++;this.phase='timeline';this.existing.start()}}
 dispose(){if(this.disposed)return;this.disposed=true;this.phase='disposed';this.token++;this.existing.dispose()}
}
