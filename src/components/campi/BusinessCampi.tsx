import { TopicRequestDialog } from './TopicRequestDialog';
import type { PanoramaTopic } from '@/lib/campi/panoramaPreferences';
import { commentReaction } from '@/lib/campi/commentReaction';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { factualRounds, readingDuration } from '@/lib/campi/factualRounds';
import { detectBusinessFindings, readFindingMemory } from '@/lib/campi/businessFindings';
import { CampiBadgeActor } from './CampiBadgeActor';

/** Factual rounds share card evidence. Previous finding memory is never erased. */
export function BusinessCampi({userId,stories,hasAccess,loading,failed=false,requestTopics=[],superadmin=false,onChooseTopics}:{
 requestTopics?:readonly PanoramaTopic[];superadmin?:boolean;onChooseTopics?:()=>void;
 userId:string;stories:readonly PanoramaStory[];hasAccess:(s:SectionKey)=>boolean;loading:boolean;failed?:boolean;onRetry?:()=>void;
}) {
 const [memory,setMemory]=useState(()=>readFindingMemory(userId));
 useEffect(()=>{setMemory(readFindingMemory(userId));const sync=()=>setMemory(readFindingMemory(userId));window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[userId]);
 const paused=new Set(detectBusinessFindings(stories,hasAccess).findings.filter(f=>['paused','postponed','resolved'].includes(memory[f.id]?.state)).map(f=>f.topic));
 const comments=loading?[]:factualRounds(stories.filter(s=>!paused.has(s.id)),hasAccess);
 const signature=JSON.stringify([userId,comments]);
 const stable=useMemo(()=>comments,[signature]); // eslint-disable-line react-hooks/exhaustive-deps
 const [position,setPosition]=useState({signature,index:0});
 const index=position.signature===signature?position.index:0;
 const current=stable[index];
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  if(!current||stable.length<=1||!heading.current||typeof IntersectionObserver==='undefined')return;
  let visible=false,timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   clearTimeout(timer);
   if(visible&&!document.hidden&&!document.querySelector('[role="dialog"][aria-modal="true"]'))timer=setTimeout(()=>setPosition({signature,index:(index+1)%stable.length}),readingDuration(current.text));
  };
  const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=0.5);schedule();},{threshold:0.5});
  observer.observe(heading.current);
  const overlays=new MutationObserver(schedule);overlays.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','role']});
  document.addEventListener('visibilitychange',schedule);
  return()=>{clearTimeout(timer);observer.disconnect();overlays.disconnect();document.removeEventListener('visibilitychange',schedule);};
 },[current,index,signature,stable.length]);
 const reaction=commentReaction(current?.evidence,loading);
 const gesture={neutral:'neutral',consultar:'consultando',presentar:'presentacion',comparar:'comparacion',saltito:'saltito'}[reaction.gesture];
 return <section aria-label="Campi" className="min-w-0 rounded-xl border bg-card p-3.5 panorama-hero panorama-hero--serene panorama-hero--sereno">
  <div className="panorama-hero-avatar campi-vector-avatar campi-badge-avatar"><CampiBadgeActor messageKey={`${userId}|${current?.id??'empty'}|${current?.text??''}`} mood={reaction.mood} reaction={gesture}/></div>
  <div className="panorama-hero-message"><div className="campi-synthesis"><h2 ref={heading}>{current?.text ?? (loading?'Estoy revisando las novedades de tu panorama.':failed?'No pude verificar los datos de tus temas.':stories.some(s=>s.status==='ready'&&s.sections.length>0&&s.sections.every(hasAccess))?'Por ahora no hay comparaciones verificadas para comentar.':'Todavía no tengo información suficiente para destacar una novedad.')}</h2></div>{<TopicRequestDialog key={userId} userId={userId} superadmin={superadmin} topics={requestTopics} onChoose={onChooseTopics}/>}</div>
 </section>;
}
