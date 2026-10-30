import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createCampiFactory } from '../campi3d/browserFactory.mjs';
import { playSelectorEntrance, type EntranceHandle } from '../campi3d/welcome-motion/selectorEntrance';
import './campi-onboarding.css';

/** Dedicated owner of the existing 3D rig. No storage, business reads or global welcome. */
export function CampiOnboardingScene({name,selecting,onSelect,children}:{name:string;selecting:boolean;onSelect:()=>void;children:ReactNode}){
 const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const view=useRef<{dispose():void;prepare():void}>();
 const callback=useRef(onSelect);callback.current=onSelect;
 const requested=useRef(false),initialSelecting=useRef(selecting);
 const previouslySelected=useRef(selecting);
 useEffect(()=>{if(selecting)previouslySelected.current=true;else requested.current=false;},[selecting]);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!canvas.current||!stage.current)return;
  const abort=new AbortController();let mounted:{dispose():void;prepare():void}|undefined;
  const reveal=(reduced:boolean):EntranceHandle=>{
   if(!abort.signal.aborted)flushSync(()=>callback.current());
   const elements=content.current;
   const title=elements?.querySelector<HTMLElement>('[data-selector-title]');
   const topics=elements?.querySelector<HTMLElement>('[data-selector-topics]');
   const priorities=elements?.querySelector<HTMLElement>('[data-selector-priorities]');
   if(title&&topics&&priorities)return playSelectorEntrance({title,topics,priorities},{reducedMotion:reduced,signal:abort.signal});
   return {finished:Promise.resolve('unsupported'),cancel(){},finishReduced(){},setPaused(){}};
  };
  const fail=()=>{if(!abort.signal.aborted){setFailed(true);if(requested.current)callback.current();}};
  const factory=createCampiFactory({runtimeBaseUrl:'/campi3d/controller/',assetUrl:'/campi3d/assets/Campi_3D_estados.glb',manifestUrl:'/campi3d/manifest.json',welcome:{get reentry(){return initialSelecting.current||requested.current;},revealSelector:reveal}});
  void factory({canvas:canvas.current,container:stage.current,signal:abort.signal,onChange(){},onError:fail,onRecipeResult(){}}).then(instance=>{
   if(abort.signal.aborted){instance.dispose();return;}mounted=instance;view.current=instance;
   if(requested.current)instance.prepare();
  }).catch(fail);
  return()=>{abort.abort();mounted?.dispose();view.current=undefined;};
 },[]);
 const prepare=()=>{if(requested.current)return;requested.current=true;if(previouslySelected.current||failed||!view.current)callback.current();else view.current.prepare();};
 return <section className={`campi-onboarding${selecting?' campi-onboarding--selecting':''}`} aria-label="Bienvenida de Campi">
  <div className="campi-onboarding-brand">Campi</div>
  <div className="campi-onboarding-scene" ref={stage}>
   <canvas ref={canvas} aria-label="Campi 3D de cuerpo completo" role="img"/>
   {failed&&<p role="status" className="campi-onboarding-fallback">No se pudo mostrar Campi en 3D. Podés continuar.</p>}
  </div>
  {!selecting&&<div className="campi-onboarding-copy">
   <h1>Hola, {name}.<br/>Soy Campi.</h1>
   <p>Vamos a poner el foco en lo que importa para vos.</p>
   <Button onClick={prepare}>Preparar mi Panorama<ArrowRight className="ml-2 h-4 w-4"/></Button>
   <small>Empezá cuando quieras.</small>
  </div>}
  <div ref={content} className="campi-onboarding-selector" hidden={!selecting}>{children}</div>
 </section>;
}
