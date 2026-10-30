import { beforeEach, expect, it } from 'vitest';
import { detectBusinessFindings, readFindingMemory, rememberFinding, selectBusinessFindings } from './businessFindings';
import type { PanoramaStory } from './panoramaStoryTypes';
import { withOrderComposition } from './sourceExpansion';

const story=():PanoramaStory=>({id:'maquinas_pedidos',title:'',question:'',message:'',scope:'',status:'ready',sections:['parque.operaciones'],cutoff:null,periodLabel:'',primary:null,supporting:[],chart:null,breakdown:[],details:[],source:'fixture',route:'/parque-operaciones',machineOrders:{asOf:'2026-10-27',orders:3,units:4,stock:2,arrived:0,transit:1,unlinked:1,readyUnits:2,billedUnits:0,ready:[{id:'a',units:1,pendingUnits:1},{id:'b',units:1,pendingUnits:2}],unresolved:[]}});
const detect=(s=story())=>detectBusinessFindings([s],()=>true).findings;
beforeEach(()=>localStorage.clear());
it('separa pedidos completos y parciales sin prometer entrega ni factura',()=>{
 const f=detect()[0];expect(f.facts).toEqual({complete:1,partial:1,assigned:2});expect(f.text).toContain('stock registrado');expect(f.action).toContain('disponibilidad física');expect(f.evidence?.[0]).toContain('corte físico');expect(f.targets).toHaveLength(1);
});
it('sin unidades completas no rellena con cobertura parcial',()=>{const s=story();s.machineOrders!.ready[0].pendingUnits=2;expect(detect(s)).toHaveLength(0);});
it('rechaza identidad duplicada, composición ausente, conteos inconsistentes y permisos',()=>{
 for(const mutate of [(s:PanoramaStory)=>{s.machineOrders!.ready[1].id='a';},(s:PanoramaStory)=>{delete s.machineOrders!.ready[0].pendingUnits;},(s:PanoramaStory)=>{s.machineOrders!.readyUnits=3;}]){const s=story();mutate(s);expect(detect(s)).toHaveLength(0);}
 expect(detectBusinessFindings([story()],()=>false).findings).toHaveLength(0);
});
it('avance de fecha no renueva; cambio de unidades sí, pausa persiste y usuario se aísla',()=>{
 const f=detect()[0];rememberFinding('u',f,'seen');const s=story();s.machineOrders!.asOf='2026-10-28';let next=detect(s)[0];expect(selectBusinessFindings([next],readFindingMemory('u'))[0].status).toBe('follow-up');
 s.machineOrders!.ready[1].pendingUnits=1;next=detect(s)[0];expect(selectBusinessFindings([next],readFindingMemory('u'))[0].status).toBe('changed');rememberFinding('u',f,'paused');expect(selectBusinessFindings([next],readFindingMemory('u'))).toHaveLength(0);expect(readFindingMemory('v')).toEqual({});
});
it('otra fuente fallida no oculta pedidos y no duplica el mismo fenómeno',()=>{const f=detect()[0];expect(detectBusinessFindings([{...story(),status:'error'},story()],()=>true).findings).toHaveLength(1);expect(selectBusinessFindings([f,{...f,id:'duplicate'}],{})).toHaveLength(1);});
it('no llama completo al pedido cuyo segundo renglón no tiene unidad identificada',()=>{
 const s=story();s.primary={label:'Pedidos',value:3,unit:'count'};s.supporting=[{label:'Unidades pendientes',value:5,unit:'count'}];
 s.machineOrders!.ready.forEach(r=>delete r.pendingUnits);
 const payload={pedidos_completos:[{id:'a',unidades:2,disponibles:1,categoria:'No clasificables',clasificable:false},{id:'b',unidades:2,disponibles:1,categoria:'Cobertura parcial',clasificable:true},{id:'c',unidades:1,disponibles:0,categoria:'Sin cobertura',clasificable:true}]};
 expect(detect(withOrderComposition(s,payload))).toHaveLength(0);
 expect(detect(withOrderComposition(s,{}))).toHaveLength(0);
});
it('sustituir pedidos con iguales totales explica el cambio de conjunto',()=>{const f=detect()[0];rememberFinding('u',f,'seen');const s=story();s.machineOrders!.ready[0].id='nuevo';const next=selectBusinessFindings(detect(s),readFindingMemory('u'))[0];expect(next.status).toBe('changed');expect(next.change).toContain('conjunto de pedidos');});
it('bloquea contradicción por pedido entre stock y composición completa',()=>{
 const s=story();s.primary={label:'Pedidos',value:3,unit:'count'};s.supporting=[{label:'Unidades pendientes',value:4,unit:'count'}];
 const payload={pedidos_completos:[{id:'a',unidades:1,disponibles:0,categoria:'Sin cobertura',clasificable:true},{id:'b',unidades:2,disponibles:1,categoria:'Cobertura parcial',clasificable:true},{id:'c',unidades:1,disponibles:0,categoria:'Sin cobertura',clasificable:true}]};
 expect(detect(withOrderComposition(s,payload))).toHaveLength(0);
});
