import {describe,it,expect} from 'vitest';
import {commentEvidence,commentReaction,type CommentEvidence} from './commentReaction';
import {factualVariants} from './factualRounds';
import type {PanoramaStory,StoryTopicId} from './panoramaStoryTypes';
const evidence=(topic:StoryTopicId,value=120):CommentEvidence=>({topic,period:'month',value,unit:'USD',window:{from:'2026-10-01',to:'2026-10-30'},comparison:{value:100,window:{from:'2025-10-01',to:'2025-10-30'}},complete:true});
describe('reaction policy',()=>{
 it.each(['ventas_evolucion','ventas_facturacion','agenda_cumplimiento','servicios_productividad','servicios_eficiencia','clientes_retencion','clientes_cobertura_posventa'] as const)('higher is favorable only with evidence: %s',topic=>{expect(commentReaction(evidence(topic)).assessment).toBe('favorable');expect(commentReaction(evidence(topic,80)).mood).toBe('concerned');});
 it.each(['servicios_pendientes','repuestos_stock','repuestos_alertas'] as const)('lower is favorable: %s',topic=>{expect(commentReaction(evidence(topic,80)).gesture).toBe('saltito');expect(commentReaction(evidence(topic)).assessment).toBe('unfavorable');});
 it.each(['maquinas_pedidos','servicios_os_facturadas'] as const)('ambiguous direction stays neutral: %s',topic=>expect(commentReaction(evidence(topic)).assessment).toBe('neutral'));
 it('never celebrates absent, partial, invalid, unchanged, missing-window or nonpositive-baseline evidence',()=>{
  expect(commentReaction().gesture).toBe('neutral');expect(commentReaction(undefined,true).gesture).toBe('consultar');
  for(const e of [{...evidence('ventas_evolucion'),complete:false},{...evidence('ventas_evolucion'),value:null},{...evidence('ventas_evolucion'),window:null},{...evidence('ventas_evolucion'),comparison:null},evidence('ventas_evolucion',100),evidence('ventas_evolucion',100.1),{...evidence('ventas_evolucion'),comparison:{value:0,window:evidence('ventas_evolucion').window} }])expect(commentReaction(e).gesture).not.toBe('saltito');
 });
});
const story=():PanoramaStory=>({id:'ventas_evolucion',status:'ready',title:'Ventas',question:'Q',message:'',scope:'',sections:['repuestos.ventas'],cutoff:'2026-10-30',periodLabel:'',time:{window:{from:'2026-10-01',to:'2026-10-30'},comparison:{from:'2025-10-01',to:'2025-10-30'}},primary:{label:'Ventas',unit:'USD',value:120,comparison:{value:100,label:''}},supporting:[{label:'Ventas acumuladas del año',unit:'USD',value:200,comparison:{value:400,label:''}}],chart:null,breakdown:[],details:[],source:'fixture',route:'',temporalComparisons:[{kind:'day',label:'Ventas',current:{from:'2026-10-29',to:'2026-10-29'},previous:{from:'2026-10-22',to:'2026-10-22'},components:[{section:'repuestos.ventas',value:30,previous:50}]},{kind:'week',label:'Ventas',current:{from:'2026-10-19',to:'2026-10-25'},previous:{from:'2026-10-12',to:'2026-10-18'},components:[{section:'repuestos.ventas',value:60,previous:40}]}]});
it('keeps month/day/week/accumulated values and dates separate without guessing annual bounds',()=>{
 const comments=factualVariants(story(),()=>true,'2026-10-30');
 expect(comments.map(c=>c.evidence?.value)).toEqual([120,30,60,200]);
 expect(comments.map(c=>commentReaction(c.evidence).assessment)).toEqual(['favorable','unfavorable','favorable','uncompared']);
 expect(comments[1].evidence?.window?.from).toBe('2026-10-29');expect(comments[2].evidence?.window?.from).toBe('2026-10-19');
 expect(comments[3].evidence?.window).toBeNull();expect(comments[3].evidence?.comparison?.value).toBe(400);
});
it('does not attach an unspoken comparison to non-sales text, nor bypass permissions',()=>{
 const s=story();s.id='servicios_productividad';s.supporting=[];
 expect(factualVariants(s,()=>true,'2026-10-30')[0].evidence?.comparison).toBeNull();
 expect(factualVariants(story(),()=>false,'2026-10-30')).toEqual([]);
 expect(commentEvidence({...story(),billingCoverage:{additional:'unavailable',allCoreAreas:true}},story().primary!,'month').complete).toBe(false);
});
