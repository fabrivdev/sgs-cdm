import {useEffect,useRef,useState} from 'react';
import {CampiBadge} from './badge/controller';
import './campi-badge-motion.css';

export type BadgeMood='neutral'|'attentive'|'thinking'|'happy'|'concerned';
/** Content state only: no sentiment inferred from text or arithmetic signs. */
export const badgeMood=(hasComment:boolean,loading:boolean):BadgeMood=>loading?'thinking':hasComment?'attentive':'neutral';
export function CampiBadgeActor({messageKey,mood,reaction}:{messageKey:string;mood:BadgeMood;reaction?:string}){
 const button=useRef<HTMLButtonElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const actor=useRef<InstanceType<typeof CampiBadge>|null>(null),latest=useRef({messageKey,mood,reaction});latest.current={messageKey,mood,reaction};
 const [ready,setReady]=useState(false),[motion,setMotion]=useState(false),[gesture,setGesture]=useState('rest');
 useEffect(()=>{
  let disposed=false,visible=false;const images:Record<string,HTMLImageElement>={};let loaded=0;
  const modal=()=>!!document.querySelector('[role="dialog"][aria-modal="true"]');
  const notify=()=>{const s=actor.current?.snapshot();if(!disposed&&s){setMotion(s.running);setGesture(s.gesture??'rest');}};
  const sync=()=>{if(!actor.current)return;actor.current.setModal(modal());notify();};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);actor.current?.setVisibility(visible);notify();},{threshold:.5});
  if(button.current)observer?.observe(button.current);
  const overlays=new MutationObserver(sync);overlays.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','role']});
  const source={canonical:'/campi/campi-reposo-v2.png',blank:'/campi/campi-drop-blank-visor.png',palm:'/campi/campi-saludo-v2.png'};
  for(const [key,url] of Object.entries(source)){const image=new Image();images[key]=image;image.onload=()=>{
   if(disposed||++loaded!==3||!canvas.current)return;
   actor.current=new CampiBadge(canvas.current,images,{onChange:()=>notify()});
   if(!observer&&button.current){const b=button.current.getBoundingClientRect();visible=b.width>0&&b.height>0&&Math.max(0,Math.min(b.right,innerWidth)-Math.max(b.left,0))*Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,0))/(b.width*b.height)>=.5;}
   actor.current.setVisibility(visible);actor.current.setModal(modal());actor.current.setMessage(latest.current.messageKey,latest.current.mood,latest.current.reaction);setReady(true);notify();
  };image.onerror=()=>{if(!disposed){actor.current?.dispose();actor.current=null;setReady(false);setMotion(false);}};image.src=url;}
  document.addEventListener('visibilitychange',notify);
  return()=>{disposed=true;observer?.disconnect();overlays.disconnect();document.removeEventListener('visibilitychange',notify);for(const image of Object.values(images)){image.onload=null;image.onerror=null;}actor.current?.dispose();actor.current=null;};
 },[]);
 useEffect(()=>{actor.current?.setMessage(messageKey,mood,reaction);},[messageKey,mood,reaction]);
 return <button ref={button} type="button" aria-label="Saludar a Campi" className="campi-badge-touch" onClick={()=>actor.current?.react()} data-mood={mood} data-gesture={gesture} data-motion={motion?'on':'off'}>
  <canvas ref={canvas} width={240} height={224} aria-hidden="true" style={{display:ready?'block':'none',width:'100%',height:'100%'}}/>
  {!ready&&<svg viewBox="145 0 317 510" width="100%" height="100%" aria-hidden="true"><image href="/campi/campi-reposo-v2.png" width="1536" height="1024"/></svg>}
 </button>;
}
