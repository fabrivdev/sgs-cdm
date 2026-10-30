import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CampiWelcomeActor} from './welcome2d/CampiWelcomeActor';
import GradientWaves from '@/components/auth/GradientWaves';
import './campi-onboarding-2d.css';
export function CampiOnboardingScene({name,selecting,onSelect,children}:{name:string;selecting:boolean;onSelect:()=>void;children:ReactNode;reactionKey?:string|number}){
 const [retainWelcome,setRetainWelcome]=useState(!selecting);
 const actor=useRef<{prepare():void}>(null);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!selecting){setRetainWelcome(true);return;}if(reduced){setRetainWelcome(false);return;}const timer=window.setTimeout(()=>setRetainWelcome(false),600);return()=>window.clearTimeout(timer);},[selecting,reduced]);
 return <div className={`campi-flow${selecting?' campi-flow--selecting':''}${retainWelcome?' campi-flow--staged':''}`}>
 {retainWelcome&&<section aria-hidden={selecting} className={`campi-welcome-slide${selecting?' campi-welcome-slide--out':''}`}>
 <section className="campi-scene-2d" aria-label="Bienvenida de Campi">
  {<div className="campi-welcome-login-background" aria-hidden="true" data-background-source="auth-gradient-waves">
   {!reduced&&<GradientWaves/>}
   <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.5),transparent_46%,rgba(255,255,255,0.12)_100%)]"/>
   <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),transparent_38%,rgba(255,255,255,0.2))] motion-reduce:bg-[#f8faf5]"/>
  </div>}
  <div className="campi-scene-2d-character"><CampiWelcomeActor ref={actor} onAdvance={onSelect}/></div>
  {<div className="campi-scene-2d-copy"><span>Tu espacio de trabajo</span><h1>Hola, {name}.<br/>Soy Campi.</h1><p>Vamos a poner el foco en lo que importa para vos.</p><Button disabled={selecting} tabIndex={selecting?-1:0} onClick={()=>actor.current?.prepare()}>Preparar mi Panorama<ArrowRight className="ml-2 h-4 w-4"/></Button></div>}
 </section></section>}
 <div className="campi-selector-slide" hidden={!selecting}>
 <section className="campi-scene-2d campi-scene-2d--selector" aria-label="Selector de temas"><div className="campi-scene-2d-selector">{children}</div></section>
 </div></div>;
}
