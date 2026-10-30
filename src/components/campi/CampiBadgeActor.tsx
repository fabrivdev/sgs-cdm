import {useEffect,useRef,useState} from 'react';
import {CampiBadge} from './badge/controller';
import './campi-badge-motion.css';

export type BadgeMood='neutral'|'attentive'|'thinking'|'happy'|'concerned';
/** Content state only: no sentiment inferred from text or arithmetic signs. */
export const badgeMood=(hasComment:boolean,loading:boolean):BadgeMood=>loading?'thinking':hasComment?'attentive':'neutral';
export function CampiBadgeActor({messageKey,mood,reaction}:{messageKey:string;mood:BadgeMood;reaction?:string}){
 const button=useRef<HTMLButtonElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const actor=useRef<InstanceType<typeof CampiBadge>|null>(null),latest=useRef({messageKey,mood,reaction});latest.current={messageKey,mood,reaction};
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[motion,setMotion]=useState(false),[gesture,setGesture]=useState('rest');
 useEffect(()=>{
  let disposed=false,visible=false,failedLoad=false;const images:Record<string,HTMLImageElement>={};const decoded=new Set<string>();
  setReady(false);setFailed(false);
  const modal=()=>!!document.querySelector('[role="dialog"][aria-modal="true"]');
  const notify=()=>{const s=actor.current?.snapshot();if(!disposed&&s){setMotion(s.running);setGesture(s.gesture??'rest');}};
  const sync=()=>{if(!actor.current)return;actor.current.setModal(modal());notify();};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);actor.current?.setVisibility(visible);notify();},{threshold:.5});
  if(button.current)observer?.observe(button.current);
  const overlays=new MutationObserver(sync);overlays.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','role']});
  const source={canonical:'/campi/campi-reposo-v2.png',blank:'/campi/campi-drop-blank-visor.png',palm:'/campi/campi-saludo-v2.png'};
  const fail=()=>{if(disposed)return;failedLoad=true;actor.current?.dispose();actor.current=null;setReady(false);setFailed(true);setMotion(false);};
  const imageReady=(key:string)=>{
   if(disposed||failedLoad||decoded.has(key))return;
   decoded.add(key);if(decoded.size!==Object.keys(source).length||!canvas.current)return;
   try {
    actor.current=new CampiBadge(canvas.current,images,{onChange:()=>notify()});
    if(!observer&&button.current){const b=button.current.getBoundingClientRect();visible=b.width>0&&b.height>0&&Math.max(0,Math.min(b.right,innerWidth)-Math.max(b.left,0))*Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,0))/(b.width*b.height)>=.5;}
    actor.current.setVisibility(visible);actor.current.setModal(modal());actor.current.setMessage(latest.current.messageKey,latest.current.mood,latest.current.reaction);
    // The constructor and setMessage draw synchronously. Reveal only that complete
    // frame, in the exact same canvas/viewport used by every subsequent frame.
    setReady(true);notify();
   } catch { fail(); }
  };
  for(const [key,url] of Object.entries(source)){
   const image=new Image();images[key]=image;
   image.onload=()=>{if(disposed||failedLoad)return;if(typeof image.decode==='function')image.decode().then(()=>imageReady(key),fail);else imageReady(key);};
   image.onerror=fail;image.src=url;
  }
  document.addEventListener('visibilitychange',notify);
  return()=>{disposed=true;observer?.disconnect();overlays.disconnect();document.removeEventListener('visibilitychange',notify);for(const image of Object.values(images)){image.onload=null;image.onerror=null;}actor.current?.dispose();actor.current=null;};
 },[]);
 useEffect(()=>{actor.current?.setMessage(messageKey,mood,reaction);},[messageKey,mood,reaction]);
 return <button ref={button} type="button" aria-label={failed?'Campi no disponible':'Saludar a Campi'} disabled={!ready} aria-busy={!ready&&!failed} className="campi-badge-touch" onClick={()=>actor.current?.react()} data-mood={mood} data-gesture={gesture} data-motion={motion?'on':'off'}>
  <canvas ref={canvas} width={240} height={224} aria-hidden="true" style={{display:'block',visibility:ready?'visible':'hidden',width:'100%',height:'100%'}}/>
 </button>;
}
