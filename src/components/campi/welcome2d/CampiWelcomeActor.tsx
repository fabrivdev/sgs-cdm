import {forwardRef,useEffect,useId,useImperativeHandle,useRef,useState} from 'react';
import {createWelcomeTimeline} from './timeline';
import {atlases,frames,spriteFrame} from './sprites';
import {createEntryRenderer} from './entryRenderer';
import {CampiEntryGate} from './entryGate';

export const CampiWelcomeActor=forwardRef<{prepare():void},{onAdvance:()=>void}>(function CampiWelcomeActor({onAdvance},ref){
 const [index,setIndex]=useState(0),[loaded,setLoaded]=useState(false),[entering,setEntering]=useState(true),[rigReady,setRigReady]=useState(false);
 const preloaded=useRef(new Set<string>()),canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null);
 const id=useId().replace(/:/g,'');const current=useRef(0),interrupted=useRef(0),advance=useRef(onAdvance),requested=useRef(false);
 const prepare=useRef<()=>void>();advance.current=onAdvance;
 useImperativeHandle(ref,()=>({prepare(){if(requested.current)return;requested.current=true;interrupted.current=current.current;if(prepare.current)prepare.current();else advance.current();}}),[]);
 useEffect(()=>{
  if(!loaded)return;let alive=true,raf=0,previous=0;const motionRate=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('campi-motion')==='slow'?.25:1;const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const timeline=createWelcomeTimeline({posesV2:true,reducedMotion:media.matches,onAdvance:()=>{if(alive)advance.current();}});
  let gate:CampiEntryGate|undefined;let renderer:ReturnType<typeof createEntryRenderer>;let observer:ResizeObserver|undefined;
  const stop=()=>{cancelAnimationFrame(raf);raf=0;previous=0;};
  const paint=()=>{const f=timeline.snapshot();renderer?.drawTimeline?.(f);const next=spriteFrame(f,interrupted.current);if(next!==current.current){current.current=next;setIndex(next);}return f;};
  const tick=(now:number)=>{raf=0;if(!alive||document.hidden||media.matches)return;const dt=previous?(now-previous)/1000:0;previous=now;gate?.tick(dt*motionRate);if(gate?.phase==='timeline')paint();if(alive&&gate?.phase!=='cancelled'&&!timeline.snapshot().done)raf=requestAnimationFrame(tick);};
  const resume=()=>{if(alive&&gate&&!document.hidden&&!media.matches&&!raf&&!timeline.snapshot().done&&gate.phase!=='cancelled')raf=requestAnimationFrame(tick);};
  const visibility=()=>{gate?.setHidden(document.hidden);stop();if(!document.hidden)resume();};
  const reduced=()=>{gate?.setReducedMotion(media.matches);stop();if(media.matches){setEntering(false);paint();}resume();};
  const start=()=>{if(!alive||requested.current||gate)return;gate=new CampiEntryGate({entryDuration:renderer?.duration??0,renderEntry:(t:number)=>renderer?.draw(t),existing:timeline,onEntryComplete:()=>{if(alive){setEntering(false);paint();}},onAdvance:()=>{if(alive)advance.current();}});gate.setReducedMotion(media.matches);gate.setHidden(document.hidden);setEntering(!media.matches&&!!renderer);gate.start();prepare.current=()=>{renderer?.capturePose?.();gate?.prepare();};if(media.matches)paint();resume();};
  const image=new Image(),blank=new Image(),palm=new Image();let ready=0;const imageReady=()=>{if(++ready<3)return;if(!alive)return;renderer=canvas.current?createEntryRenderer(canvas.current,image,blank,palm):null;setRigReady(!!renderer);const resize=()=>{if(!alive||!host.current)return;const b=host.current.getBoundingClientRect();renderer?.resize(b.width,b.height+180,window.devicePixelRatio,180);};resize();if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);if(host.current)observer.observe(host.current);}start();};image.onload=imageReady;blank.onload=imageReady;palm.onload=imageReady;image.onerror=blank.onerror=palm.onerror=()=>{if(alive)start();};image.src=atlases[0];blank.src='/campi/campi-drop-blank-visor.png';palm.src='/campi/campi-saludo-v2.png';
  document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);
  return()=>{alive=false;image.onload=null;image.onerror=null;blank.onload=null;blank.onerror=null;palm.onload=null;palm.onerror=null;stop();observer?.disconnect();gate?.dispose();if(!gate)timeline.dispose();prepare.current=undefined;document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);};
 },[loaded]);
 const {bounds:[left,top,right,bottom],anchor,atlas}=frames[index===5?0:index];
 return <div ref={host} style={{position:'relative',width:'100%',height:360,display:'flex',alignItems:'center',justifyContent:'center'}} data-entry-phase={entering?'entry':'existing'}>
 <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',left:0,top:-180,width:'100%',height:'calc(100% + 180px)',visibility:rigReady?'visible':'hidden',pointerEvents:'none'}}/>
 <svg viewBox={`${anchor-300} ${bottom-540} 600 570`} width="100%" height="100%" style={{maxWidth:368,maxHeight:350,opacity:loaded&&!entering&&!rigReady?1:0}} role="img" aria-label="Campi, bienvenida animada en revisión" data-motion-status="whole-pose-v2" data-frame={index} data-expression={index===5?'blink':'open-eyes'}>
 <defs><clipPath id={id}><rect x={left-2} y={top-2} width={right-left+4} height={bottom-top+4}/></clipPath><clipPath id={`${id}-face`}><ellipse cx="303.5" cy="113" rx="72" ry="39"/></clipPath></defs>
 {atlases.map(src=><image key={src} data-preload="true" href={src} width="1536" height="1024" visibility="hidden" onLoad={()=>{preloaded.current.add(src);if(preloaded.current.size===atlases.length)setLoaded(true);}}/>)}
 <image href={atlas} width="1536" height="1024" clipPath={`url(#${id})`}/>{index===5&&<g clipPath={`url(#${id}-face)`} data-face-only="blink"><image href={atlases[0]} x={-929.5} y={-512} width="1536" height="1024"/></g>}</svg></div>;
});
