/* Campi badge: semantic enum only. No free-text analysis or inference. */
import {CampiBadgeScene} from './scene';
'use strict';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
const KEYS=['head','smile','lift','bend','hello','lu','lf','ru','rf','eye','look','brow','crouch','y','mouth','lean','wristL','wristR','eyeY'];
const GESTURES=['presentacion','consultando','comparacion','saludo','sorpresa','saltito'];
const STATES=Object.freeze({
 sereno:{head:0,eye:1,smile:8,brow:0,look:0,arms:0,fore:0},
 atento:{head:-.07,eye:1.25,smile:5,brow:0,look:-1.5,arms:.05,fore:.08},
 pensativo:{head:.085,eye:.76,smile:1,brow:.12,look:6,arms:.025,fore:.12},
 contento:{head:-.025,eye:.77,smile:13,brow:0,look:0,arms:.07,fore:.1},
 preocupado:{head:.025,eye:.9,smile:-4,brow:.24,look:0,arms:0,fore:.04}
});
function face(ctx,p){
 ctx.save();ctx.strokeStyle=ctx.fillStyle='#f2ffff';ctx.lineCap='round';ctx.lineWidth=4;
 ctx.shadowColor='#bfeaff';ctx.shadowBlur=3;
 for(let j=0;j<2;j++){
  const x=(j?338:270)+p.look,ry=Math.max(1,12*p.eye*(1-p.blink));
  ctx.beginPath();ctx.ellipse(x,109+(p.eyeY||0),8.4,ry,0,0,Math.PI*2);ctx.fill();
  if(p.brow>.015){ctx.beginPath();ctx.moveTo(x-10,88+(j?-1:1)*p.brow*20);ctx.lineTo(x+10,88-(j?-1:1)*p.brow*20);ctx.stroke();}
 }
 ctx.beginPath();ctx.moveTo(291,134);ctx.quadraticCurveTo(304,134+p.smile,317,134);ctx.quadraticCurveTo(304,134+p.smile+(p.mouth||0)*12,291,134);ctx.stroke();ctx.restore();
}
class Badge{
 constructor(canvas,images,options={}){
  this.paused=false;this.speed=1;this.visible=true;this.modal=false;this.messageKey='';this.cancelled=null;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.options=options;this.state='sereno';this.values={...STATES.sereno};this.time=0;this.gesture=null;this.gestureIndex=0;this.changeAt=-10;this.lastTap=-10;this.disposed=false;this.raf=0;this.last=0;
  this.media=matchMedia('(prefers-reduced-motion: reduce)');this.reduced=this.media.matches;
  this.scene=new CampiBadgeScene(images,{transparent:true,badge:true,pose:()=>this.pose(),face});
  this.visibility=()=>{this.last=0;if(document.hidden)this.stop();else this.start();this.notify()};
  this.mediaChange=()=>this.setReduced(this.media.matches);
  document.addEventListener('visibilitychange',this.visibility);this.media.addEventListener('change',this.mediaChange);
  this.draw();this.start();
 }
 pose(){
  const v=this.values,t=this.time,g=this.gesture,u=g?t-g.start:0,motion=this.reduced?0:1;
  const result={...v,t,y:0,crouch:0,lean:0,wristL:0,wristR:0,face:0,greet:0,wave:0,mouth:0,
    blink:motion&&!g&&t>=(this.openUntil||0)?Math.max(0,1-Math.abs(t%8.3-6.2)/.10):0,
    eyeY:0,head:v.head+motion*.009*Math.sin(t*.8),look:v.look,
    lift:0,bend:0,hello:0,lu:v.arms,lf:v.fore,ru:-v.arms,rf:-v.fore,phase:g?'presentacion':'reposo'};
  if(g&&motion&&g.kind==='presentacion'){
   // Right-screen arm: humerus moves out from torso before forearm opens.
   // No IK branch folding the elbow inward; fixed-length FK with distinct joint timing.
   const upperOut=ease((u-.10)/.88),upperBack=ease((u-3.05)/1.18);
   const foreOut=ease((u-.27)/1.08),foreBack=ease((u-2.80)/1.32);
   const upper=-.62*upperOut*(1-upperBack),fore=-1.64*foreOut*(1-foreBack);
   result.ru=-v.arms+upper;result.rf=-v.fore+fore;
   const settle=ease((u-1.40)/.34)*(1-ease((u-1.85)/.60));
   result.ru-=.022*settle;result.rf+=.025*settle;
   const balance=ease((u-.17)/.95)*(1-ease((u-2.90)/1.25));
   result.lean=-.04*balance;result.crouch=.5*balance;
   result.head+=.115*ease((u-.03)/.60)*(1-ease((u-2.20)/.85));
   result.look+=11*ease(u/.48)*(1-ease((u-2.05)/.85));
   result.smile+=3*ease((u-.5)/.65)*(1-ease((u-3.0)/.9));
   result.wristR=-.12*ease((u-.65)/.75)*(1-ease((u-2.65)/.70));
   result.phase=u<.27?'hombro inicia':u<1.35?'brazo superior y codo avanzan':u<2.8?'atención al texto derecho':u<4.23?'recogida coordinada':'reposo';
  }
  if(g&&motion&&g.kind!=='presentacion'){
   const enter=ease((u-.10)/1.05),leave=1-ease((u-2.85)/1.25),e=enter*leave;
   const shoulder=ease((u-.08)/.84)*(1-ease((u-3.03)/1.15));
   const fore=ease((u-.25)/1.08)*(1-ease((u-2.80)/1.25));
   result.phase=g.kind;
   if(g.kind==='consultando'){
    result.ru-=.38*shoulder;result.rf-=1.02*fore;result.wristR=-.10*e;
    result.look+=e*(9+2*Math.sin(Math.max(0,u-1.2)*2.1));result.eyeY=3*e;
    result.head+=e*(.08+.035*Math.sin(Math.max(0,u-1.3)*3));result.eye=v.eye*(1-.15*e);result.brow=v.brow+.09*e;result.smile=v.smile-4*e;result.lean=-.025*e;
   }
   if(g.kind==='comparacion'){
    const change=Math.sin(Math.PI*clamp((u-1.1)/1.55));
    result.ru-=(.48+.04*change)*shoulder;result.rf-=(1.10+.28*change)*fore;
    result.lu-=.25*shoulder;result.lf+=(1.65-.20*change)*fore;
    result.wristR=-.08*e;result.wristL=.12*e;
    result.look+=9*e;result.eyeY=e*(3-6*change);result.head+=e*(.065-.045*change);result.lean=-.022*e;
   }
   if(g.kind==='saludo'){
    const wave=Math.sin(4*Math.PI*clamp((u-1.15)/1.40));
    result.ru-=(.62+.025*wave)*shoulder;result.rf-=(1.64+.14*wave)*fore;
    result.wristR=-.12*e-.10*wave*e;result.smile+=6*e;result.eye=v.eye*(1-.10*e);result.head+=.06*e;result.lean=-.035*e;
   }
   if(g.kind==='sorpresa'){
    result.ru-=.66*shoulder;result.rf-=1.60*fore;
    result.lu+=.42*fore;result.lf+=2.30*shoulder;
    result.wristL=.02*e;result.wristR=-.08*e;
    result.eye=v.eye*(1+.32*e);result.mouth=.8*e;result.smile=v.smile-4*e;
    result.head-=.03*e;result.lean=-.012*e;result.crouch=1.5*e;
   }
   if(g.kind==='saltito'){
    const arm=ease((u-.12)/.63)*(1-ease((u-1.6)/1.15));
    result.ru-=.58*arm;result.rf-=1.5*arm;result.lu+=.42*arm;result.lf+=2.10*ease((u-.08)/.35)*(1-ease((u-1.85)/1.05));
    result.wristR=-.08*arm;result.eye=v.eye*(1+.18*arm);result.smile+=7*arm;
    const prep=8*ease(u/.30)*(1-ease((u-.35)/.35));
    const landing=8*ease((u-1.35)/.14)*(1-ease((u-1.49)/.48));
    result.crouch=prep+landing;
    if(u>=.70&&u<=1.35){const f=(u-.70)/.65;result.y=-24*4*f*(1-f)}
    result.head-=.025*arm;
   }
  }
  if(this.cancelled){const fade=1-ease((t-this.cancelled.start)/.35);for(const k of KEYS)result[k]+=(this.cancelled.offset[k]||0)*fade;}return result;
 }

 draw(){if(!this.disposed)this.scene.draw(this.ctx,this.canvas.width,this.canvas.height,this.time)}
 step(now){
  this.raf=0;if(this.disposed||this.paused||this.reduced||document.hidden||!this.visible||this.modal)return;
  const dt=this.last?Math.min(.05,Math.max(0,(now-this.last)/1000)):0;this.last=now;this.time+=dt*this.speed;
  const a=1-Math.exp(-dt*8);for(const k in this.values)this.values[k]+=(STATES[this.state][k]-this.values[k])*a;
  if(this.gesture&&this.time-this.gesture.start>=5){this.gesture=null;this.openUntil=this.time+.5;this.notify();}
  this.draw();this.raf=requestAnimationFrame(n=>this.step(n));
 }
 start(){if(!this.disposed&&!this.paused&&!this.reduced&&!document.hidden&&this.visible&&!this.modal&&!this.raf)this.raf=requestAnimationFrame(n=>this.step(n))}
 stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;this.last=0}
 setState(value){
  if(this.disposed)return;const next=typeof value==='string'&&Object.hasOwn(STATES,value)?value:'sereno';
  if(next!==this.state){const old=this.pose();this.gesture=null;this.state=next;this.changeAt=this.time;this.preserve(old);}
  if(this.reduced)this.values={...STATES[this.state]};
  this.draw();this.start();this.notify();
 }
 play(kind){
  if(this.disposed||this.reduced||!this.visible||this.modal||document.hidden||this.gesture||!GESTURES.includes(kind))return false;
  this.lastTap=this.time;this.lastGesture=kind;this.gesture={kind,start:this.time};this.start();this.notify();return true;
 }
 react(){const cycle=['saludo','sorpresa','saltito'];const ok=this.play(cycle[this.gestureIndex%3]);if(ok)this.gestureIndex++;return ok;}

 preserve(old){this.cancelled=null;if(this.reduced)return;const next=this.pose(),offset={};for(const k of KEYS)offset[k]=(old[k]||0)-(next[k]||0);this.cancelled={start:this.time,offset};}
 cancelGesture(){if(!this.gesture)return;const old=this.pose();this.gesture=null;this.cancelled=null;const next=this.pose(),offset={};for(const k of KEYS)offset[k]=(old[k]||0)-(next[k]||0);this.cancelled={start:this.time,offset};}
 setMessage(messageKey,mood,requested){
  if(this.disposed)return;
  const key=String(messageKey??''),mapping={neutral:'sereno',attentive:'atento',thinking:'pensativo',happy:'contento',concerned:'preocupado'};
  const state=Object.hasOwn(mapping,mood)?mapping[mood]:'sereno';
  const gesture=GESTURES.includes(requested)?requested:requested==='neutral'?null:state==='atento'?'presentacion':state==='pensativo'?'consultando':null;
  const changed=key!==this.messageKey||state!==this.state||gesture!==this.messageGesture;
  if(changed){const old=this.pose();this.gesture=null;this.messageKey=key;this.messageGesture=gesture;this.state=state;this.preserve(old);this.pendingGesture=this.reduced?null:gesture;}
  this.setState(state);this.playPending();
 }
 playPending(){if(this.pendingGesture&&this.play(this.pendingGesture))this.pendingGesture=null;}

 setPaused(value){if(this.disposed)return;this.paused=!!value;if(this.paused)this.stop();else this.start();this.notify()}
 seek(seconds){if(this.disposed||!Number.isFinite(seconds))return;this.setPaused(true);this.time=Math.max(0,Math.min(5,seconds));this.gesture={kind:this.gesture?.kind||this.lastGesture||'presentacion',start:0};this.cancelled=null;this.draw();this.notify()}
 setVisibility(visible){if(this.disposed)return;this.visible=!!visible;if(!this.visible){this.cancelGesture();this.stop()}else {this.start();this.playPending();}this.notify()}
 setModal(open){if(this.disposed)return;this.modal=!!open;if(this.modal){this.cancelGesture();this.stop()}else {this.start();this.playPending();}this.notify()}
 setReduced(value){if(this.disposed)return;this.reduced=!!value;this.pendingGesture=null;this.gesture=null;this.cancelled=null;this.last=0;if(this.reduced){this.stop();this.values={...STATES[this.state]}}this.draw();this.start();this.notify()}
 restart(){if(this.disposed)return;this.stop();this.time=0;this.lastTap=-10;this.changeAt=-10;this.gesture=null;this.cancelled=null;this.gestureIndex=0;this.values={...STATES[this.state]};this.draw();this.start();this.notify()}
 snapshot(){return {state:this.state,messageKey:this.messageKey,visible:this.visible,modal:this.modal,time:this.time,reduced:this.reduced,gesture:this.gesture?.kind||null,disposed:this.disposed,running:!!this.raf,pose:this.pose()}}
 notify(){this.options.onChange?.(this.snapshot())}
 dispose(){if(this.disposed)return;this.stop();this.disposed=true;document.removeEventListener('visibilitychange',this.visibility);this.media.removeEventListener('change',this.mediaChange)}
}
export {Badge as CampiBadge,STATES,GESTURES};
