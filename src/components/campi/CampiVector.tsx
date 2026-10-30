import {useEffect,useId,useRef,useState} from 'react';
import './campi-vector.css';
type Context='welcome'|'selector'|'badge';
/** Original layered vector proposal. Gestures describe interaction, never business sentiment. */
export function CampiVector({context,eventKey='',className=''}:{context:Context;eventKey?:string|number;className?:string}){
 const id=useId().replace(/:/g,'');
 const lastInteraction=useRef('');
 const [gesture,setGesture]=useState('rest');
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [visible,setVisible]=useState(()=>!document.hidden);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden);media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{
  const interaction=JSON.stringify([context,eventKey]);
  if(reduced||!visible){lastInteraction.current=interaction;setGesture('rest');return;}
  let timer:ReturnType<typeof setTimeout>,end:ReturnType<typeof setTimeout>,step=0;
  const gestures=['blink','look','blink','tilt','blink','look'];const pauses=[4700,8300,6100,11200,5300,9700];
  const play=(name:string)=>{setGesture(name);clearTimeout(end);end=setTimeout(()=>setGesture('rest'),name==='blink'?180:1250);};
  if(lastInteraction.current!==interaction){play(context==='welcome'?'wave':eventKey?'nod':context==='selector'?'invite':'look');lastInteraction.current=interaction;}else setGesture('rest');
  const next=()=>{timer=setTimeout(()=>{play(gestures[step%gestures.length]);step++;next();},pauses[step%pauses.length]);};next();
  return()=>{clearTimeout(timer);clearTimeout(end);};
 },[context,eventKey,reduced,visible]);
 return <svg className={`campi-vector ${className}`} data-gesture={gesture} data-context={context} viewBox="0 0 240 280" role="img" aria-label="Campi, ilustración 2D" xmlns="http://www.w3.org/2000/svg">
 <defs><linearGradient id={`${id}-shell`} x2=".8" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#e1ece5"/></linearGradient><linearGradient id={`${id}-face`} x2="0" y2="1"><stop stopColor="#243b39"/><stop offset="1" stopColor="#102624"/></linearGradient></defs>
 <ellipse cx="120" cy="266" rx="58" ry="7" fill="#173c32" opacity=".10"/>
 <g className="cv-legs" stroke="#36564c" strokeWidth="2.5" strokeLinejoin="round">
  <path d="M85 207h27l-2 35-26 3zM129 207h27l1 38-26-3z" fill={`url(#${id}-shell)`}/>
  <path d="M86 241h24l4 15q-14 10-39 3l1-8zM132 241h24l10 10 1 8q-25 7-39-3z" fill="#eaf2ed"/>
  <path d="M80 254h28M134 254h27" stroke="#65a940" strokeWidth="6" strokeLinecap="round"/>
 </g>
 <g className="cv-body">
 <path d="M96 113h48v25H96z" fill="#36564c"/>
 <g className="cv-arm cv-arm-left" stroke="#36564c" strokeWidth="2.5" strokeLinejoin="round">
  <circle cx="78" cy="145" r="13" fill="#77af4d"/><path d="M69 153q-10 17-6 36l14 2 10-34" fill={`url(#${id}-shell)`}/><circle cx="70" cy="192" r="8" fill="#36564c"/>
  <path d="M63 198q-4 9-1 18l5 4 5-3 4 2 5-7-4-15z" fill="#eaf2ed"/><path d="m67 204 0 9m6-10 0 10" strokeWidth="1.5"/>
 </g>
 <g className="cv-arm cv-arm-right" stroke="#36564c" strokeWidth="2.5" strokeLinejoin="round">
  <circle cx="162" cy="145" r="13" fill="#77af4d"/><path d="M171 153q10 17 6 36l-14 2-10-34" fill={`url(#${id}-shell)`}/><circle cx="170" cy="192" r="8" fill="#36564c"/>
  <path d="M177 198q4 9 1 18l-5 4-5-3-4 2-5-7 4-15z" fill="#eaf2ed"/><path d="m173 204 0 9m-6-10 0 10" strokeWidth="1.5"/>
 </g>
 <path d="M85 130q35-12 70 0l5 54q-3 34-40 38-37-4-40-38z" fill={`url(#${id}-shell)`} stroke="#36564c" strokeWidth="2.5"/>
 <path d="M91 190q29 13 58 0" fill="none" stroke="#c1d4c8" strokeWidth="2"/>
 <g transform="translate(120 160)" fill="#68a642"><path d="M0-19Q18-19 18-3Q9-12 0-8z"/><path d="M0-19Q18-19 18-3Q9-12 0-8z" transform="rotate(120)"/><path d="M0-19Q18-19 18-3Q9-12 0-8z" transform="rotate(240)"/><circle r="4"/></g>
 </g>
 <g className="cv-head" stroke="#36564c" strokeWidth="2.5">
 <rect x="37" y="52" width="19" height="43" rx="9" fill="#69aa43"/><rect x="184" y="52" width="19" height="43" rx="9" fill="#69aa43"/>
 <path d="M54 31Q120 4 186 31q14 21 7 64-6 24-73 27-67-3-73-27-7-43 7-64z" fill={`url(#${id}-shell)`}/>
 <path d="M100 20q20-5 40 0l-4 8h-32z" fill="#70ad48" stroke="none"/>
 <path d="M65 43q55-20 110 0 10 22 3 48-8 16-58 17-50-1-58-17-7-26 3-48z" fill={`url(#${id}-face)`}/>
 <path d="M73 46q42-14 79-3" stroke="#49615a" strokeWidth="2" strokeLinecap="round" fill="none"/>
 <g className="cv-gaze" fill="#edfff3" stroke="none"><g className="cv-eyes"><ellipse cx="94" cy="72" rx="7" ry="11"/><ellipse cx="146" cy="72" rx="7" ry="11"/></g><g className="cv-lids" fill="#17312e"><rect x="85" y="59" width="18" height="26" rx="4"/><rect x="137" y="59" width="18" height="26" rx="4"/></g><path className="cv-mouth" d="M110 88q10 9 20 0" fill="none" stroke="#edfff3" strokeWidth="3.5" strokeLinecap="round"/></g>
 <path d="M72 90h8m80 0h8" stroke="#79bc5d" strokeWidth="3" strokeLinecap="round"/>
 </g></svg>;
}
