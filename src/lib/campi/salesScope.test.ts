import {expect,it} from 'vitest';
import {scopedSalesStory} from './salesScope';
import {billingComponents} from './billingComponents';
import type {PanoramaStory,SalesScope} from './panoramaStoryTypes';
const scope=(section:SalesScope['section'],gross:number,credits:number):SalesScope=>({section,label:section,route:'',source:section,month:{value:gross+credits,previous:50,billing:{gross,credits,net:gross+credits}},ytd:{value:10*(gross+credits),previous:500,billing:{gross:10*gross,credits:10*credits,net:10*(gross+credits)}},chartRows:[{label:'Oct',value:gross+credits,previous:50}]});
const scopes=[scope('repuestos.ventas',100,-20),scope('servicios.ventas',50,-5),scope('parque.ventas',10,-30),scope('servicios.dashboard',8,-2)];
const base:PanoramaStory={id:'ventas_facturacion',title:'',question:'',status:'ready',message:'',scope:'',sections:scopes.map(x=>x.section),cutoff:null,periodLabel:'',primary:{label:'Neto',value:111,unit:'USD',comparison:{value:200,label:''}},supporting:[],chart:null,breakdown:[],details:[],source:'',route:'',salesScopes:scopes};
it('sums each selected category once, including negative net, preserving the bridge',()=>{
 const s=scopedSalesStory(base,['repuestos.ventas','parque.ventas','repuestos.ventas']);
 expect(s.primary?.value).toBe(60);expect(s.primary?.comparison?.value).toBe(100);
 expect(billingComponents(s)).toEqual({gross:110,credits:-50,net:60});
 expect(s.chart?.rows[0].value).toBe(60);expect(s.sections).toHaveLength(2);
});
it('restores total with empty selection and never includes an unauthorized source',()=>{
 expect(scopedSalesStory(base,[])).toBe(base);
 const restricted={...base,sections:['repuestos.ventas'] as const};
 const s=scopedSalesStory({...restricted,sections:[...restricted.sections]},['repuestos.ventas','servicios.dashboard']);
 expect(s.primary?.value).toBe(80);expect(s.sections).toEqual(['repuestos.ventas']);
});
it('recomputes annual values and components while keeping the same selection',()=>{
 const s=scopedSalesStory({...base,periodMode:'ytd'},['servicios.ventas','servicios.dashboard']);
 expect(s.primary?.value).toBe(510);expect(billingComponents(s)).toEqual({gross:580,credits:-70,net:510});
});
it('does not recycle the total bridge or chart if selected data is missing or misaligned',()=>{
 const missing={...scopes[0],month:{value:80,previous:50},chartRows:null};
 const s=scopedSalesStory({...base,salesScopes:[missing,scopes[1]]},['repuestos.ventas','servicios.ventas']);
 expect(billingComponents(s)).toBeNull();expect(s.chart).toBeNull();
});
