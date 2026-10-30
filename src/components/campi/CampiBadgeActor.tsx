import {subscribeCampiAssets} from './campiAssets';
import {useEffect,useRef,useState} from 'react';
import {CampiBadge} from './badge/controller';
import './campi-badge-motion.css';

export type BadgeMood='neutral'|'attentive'|'thinking'|'happy'|'concerned';
/** Content state only: no sentiment inferred from text or arithmetic signs. */
export const badgeMood=(hasComment:boolean,loading:boolean):BadgeMood=>loading?'thinking':hasComment?'attentive':'neutral';
export function CampiBadgeActor({messageKey,mood,reaction}:{messageKey:string;mood:BadgeMood;reaction?:string}){
 const button=useRef<HTMLButtonElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const actor=useRef<InstanceType<typeof CampiBadge>|null>(null),latest=useRef({messageKey,mood,reaction});latest.current={messageKey,mood,reaction};
 const [attempt,setAttempt]=useState(0);
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[motion,setMotion]=useState(false),[gesture,setGesture]=useState('rest');
 useEffect(()=>{
  let disposed=false,visible=false,lastModal=false;
  setReady(false);setFailed(false);
  const modal=()=>!!document.querySelector('[role="dialog"][aria-modal="true"]');
  const notify=()=>{const s=actor.current?.snapshot();if(!disposed&&s){setMotion(s.running);setGesture(s.gesture??'rest');}};
  const sync=()=>{const next=modal();if(!actor.current||next===lastModal)return;lastModal=next;actor.current.setModal(next);notify();};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);actor.current?.setVisibility(visible);notify();},{threshold:.5});
  if(button.current)observer?.observe(button.current);
  const overlays=new MutationObserver(sync);overlays.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','role']});
  const fail=()=>{if(disposed)return;actor.current?.dispose();actor.current=null;setReady(false);setFailed(true);setMotion(false);};
  const unsubscribe=subscribeCampiAssets(images=>{
   if(disposed||!canvas.current)return;
   try {
    actor.current=new CampiBadge(canvas.current,images,{onChange:()=>notify()});
    if(!observer&&button.current){const b=button.current.getBoundingClientRect();visible=b.width>0&&b.height>0&&Math.max(0,Math.min(b.right,innerWidth)-Math.max(b.left,0))*Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,0))/(b.width*b.height)>=.5;}
    actor.current.setVisibility(visible);lastModal=modal();actor.current.setModal(lastModal);actor.current.setMessage(latest.current.messageKey,latest.current.mood,latest.current.reaction);
    // The constructor and setMessage draw synchronously. Reveal only that complete
    // frame, in the exact same canvas/viewport used by every subsequent frame.
    setReady(true);notify();
   } catch { fail(); }
  },fail);
  document.addEventListener('visibilitychange',notify);
  return()=>{disposed=true;observer?.disconnect();overlays.disconnect();document.removeEventListener('visibilitychange',notify);unsubscribe();actor.current?.dispose();actor.current=null;};
 },[attempt]);
 useEffect(()=>{actor.current?.setMessage(messageKey,mood,reaction);},[messageKey,mood,reaction]);
 return <button ref={button} type="button" aria-label={failed?'Reintentar cargar Campi':'Saludar a Campi'} disabled={!ready&&!failed} aria-busy={!ready&&!failed} className="campi-badge-touch" style={{position:'relative'}} onClick={()=>failed?setAttempt(value=>value+1):actor.current?.react()} data-mood={mood} data-gesture={gesture} data-motion={motion?'on':'off'}>
  {!ready&&<span role="status" className="absolute inset-0 flex items-center justify-center text-xs pointer-events-none">{failed?'Reintentar Campi':'Cargando Campi…'}</span>}
  <canvas ref={canvas} width={240} height={224} aria-hidden="true" style={{display:'block',visibility:ready?'visible':'hidden',width:'100%',height:'100%'}}/>
 </button>;
}
