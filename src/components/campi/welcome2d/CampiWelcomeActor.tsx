import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createWelcomeTimeline} from './timeline';
import {spriteFrame} from './sprites';
import {subscribeCampiAssets} from '../campiAssets';
import {createEntryRenderer} from './entryRenderer';
import {CampiEntryGate} from './entryGate';

export const CampiWelcomeActor=forwardRef<{prepare():void},{onAdvance:()=>void}>(function CampiWelcomeActor({onAdvance},ref){
 const [index,setIndex]=useState(0),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[entering,setEntering]=useState(true),[rigReady,setRigReady]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null);
 const current=useRef(0),interrupted=useRef(0),advance=useRef(onAdvance),requested=useRef(false);
 const prepare=useRef<()=>void>();advance.current=onAdvance;
 useImperativeHandle(ref,()=>({prepare(){if(requested.current)return;requested.current=true;interrupted.current=current.current;if(prepare.current)prepare.current();else advance.current();}}),[]);
 useEffect(()=>{
  let alive=true,raf=0,previous=0;setFailed(false);setRigReady(false);const motionRate=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('campi-motion')==='slow'?.25:1;const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const timeline=createWelcomeTimeline({posesV2:true,reducedMotion:media.matches,onAdvance:()=>{if(alive)advance.current();}});
  let gate:CampiEntryGate|undefined;let renderer:ReturnType<typeof createEntryRenderer>;let observer:ResizeObserver|undefined;
  const stop=()=>{cancelAnimationFrame(raf);raf=0;previous=0;};
  const paint=()=>{const f=timeline.snapshot();renderer?.drawTimeline?.(f);const next=spriteFrame(f,interrupted.current);if(next!==current.current){current.current=next;setIndex(next);}return f;};
  const tick=(now:number)=>{raf=0;if(!alive||document.hidden||media.matches)return;const dt=previous?(now-previous)/1000:0;previous=now;gate?.tick(dt*motionRate);if(gate?.phase==='timeline')paint();if(alive&&gate?.phase!=='cancelled'&&!timeline.snapshot().done)raf=requestAnimationFrame(tick);};
  const resume=()=>{if(alive&&gate&&!document.hidden&&!media.matches&&!raf&&!timeline.snapshot().done&&gate.phase!=='cancelled')raf=requestAnimationFrame(tick);};
  const visibility=()=>{gate?.setHidden(document.hidden);stop();if(!document.hidden)resume();};
  const reduced=()=>{gate?.setReducedMotion(media.matches);stop();if(media.matches){setEntering(false);paint();}resume();};
  const start=()=>{if(!alive||requested.current||gate)return;gate=new CampiEntryGate({entryDuration:renderer?.duration??0,renderEntry:(t:number)=>renderer?.draw(t),existing:timeline,onEntryComplete:()=>{if(alive){setEntering(false);paint();}},onAdvance:()=>{if(alive)advance.current();}});gate.setReducedMotion(media.matches);gate.setHidden(document.hidden);setEntering(!media.matches&&!!renderer);gate.start();prepare.current=()=>{renderer?.capturePose?.();gate?.prepare();};if(media.matches)paint();resume();};
  const unsubscribe=subscribeCampiAssets(({canonical,blank,palm})=>{if(!alive||requested.current)return;try{renderer=canvas.current?createEntryRenderer(canvas.current,canonical,blank,palm):null;if(!renderer){setFailed(true);return;}const resize=()=>{if(!alive||!host.current)return;const b=host.current.getBoundingClientRect();renderer?.resize(b.width,b.height+180,window.devicePixelRatio,180);};resize();if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);if(host.current)observer.observe(host.current);}start();setRigReady(true);}catch{setFailed(true);}},()=>{if(alive)setFailed(true);});
  document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);
  return()=>{alive=false;unsubscribe();stop();observer?.disconnect();gate?.dispose();if(!gate)timeline.dispose();prepare.current=undefined;document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);};
 },[attempt]);
 return <div ref={host} role="group" aria-label="Campi, bienvenida animada" aria-busy={!rigReady&&!failed} style={{position:'relative',width:'100%',height:360,display:'flex',alignItems:'center',justifyContent:'center'}} data-frame={index} data-entry-phase={entering?'entry':'existing'}>
 <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',left:0,top:-180,width:'100%',height:'calc(100% + 180px)',visibility:rigReady?'visible':'hidden',pointerEvents:'none'}}/>
 {!rigReady&&<div role="status">{failed?<button type="button" onClick={()=>setAttempt(value=>value+1)}>Reintentar cargar Campi</button>:'Cargando Campi…'}</div>}
 </div>;
});
