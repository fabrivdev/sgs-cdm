import {describe,expect,it} from 'vitest';
import {parseCoverageRubros,scopedCoverageStory} from './coverageRubros';
import {monthWindows} from './panoramaDates';
import {customerStories} from './managerialStories';
import {factualVariants} from './factualRounds';
import type {StoryPeriod} from './panoramaStoryTypes';
const asOf='2026-10-29';
function fixture(mode:StoryPeriod='month'){
 const windows=monthWindows(asOf,mode==='ytd'?10:6);
 const rows=windows.map(w=>({from:mode==='ytd'?'2026-01-01':w.from,to:w.to,nets:[['a',100,20,120],['b',0,50,50],['c',-10,0,-10]],source_mismatches:0,union_conflicts:0}));
 const raw={version:1,cohort:'current_park',mode,as_of:asOf,owners:['a','b','c'],rows};
 const expected={owners:['c','a','b'],buyers:['b','a'],series:rows.map(row=>({from:row.from,to:row.to,value:200/3,numerator:2,denominator:3,ids:[],cutoff:asOf,complete:true}))};
 return {raw,expected};
}
describe('coverage contract activation',()=>{
 it.each(['month','ytd'] as const)('validates all %s windows against existing identities and series',mode=>{
  const {raw,expected}=fixture(mode);const result=parseCoverageRubros(raw,asOf,mode,expected);
  expect(result?.rows).toHaveLength(mode==='month'?6:10);
  expect(result?.rows.at(-1)?.parts).toEqual(['a']);expect(result?.rows.at(-1)?.services).toEqual(['a','b']);
 });
 it.each(['duplicates','unknown','null','dates','owners','source','union','summary','series','mode'] as const)('fails closed for %s while leaving the fallback independent',kind=>{
  const {raw,expected}=fixture();
  if(kind==='duplicates')raw.rows[0].nets[1][0]='a';
  if(kind==='unknown')raw.rows[0].nets[1][0]='outsider';
  if(kind==='null')raw.rows[0].nets[0][1]=null as never;
  if(kind==='dates')raw.rows[0].from='2026-05-02';
  if(kind==='owners')raw.owners.push('a');
  if(kind==='source')raw.rows[0].source_mismatches=1;
  if(kind==='union')raw.rows[0].nets[0]=['a',100,-200,-100];
  if(kind==='summary')expected.buyers=['a'];
  if(kind==='series')expected.series[0].numerator=1;
  if(kind==='mode')raw.mode='ytd';
  expect(parseCoverageRubros(raw,asOf,'month',expected)).toBeNull();
 });
 it('accepts a genuinely empty population without making a percentage',()=>{
  const {raw,expected}=fixture();raw.owners=[];raw.rows.forEach(r=>r.nets=[]);
  expected.owners=[];expected.buyers=[];expected.series.forEach(r=>{r.numerator=0;r.denominator=0;r.value=null as never;});
  expect(parseCoverageRubros(raw,asOf,'month',expected)?.owners).toEqual([]);
 });
});
it('filters unique owners, series and badge together; both rubros union once; empty selection restores original',()=>{
 const {raw,expected}=fixture();
 const story=customerStories({compradores_base:0,compradores_retenidos:0,propietarios_elegibles:3,propietarios_con_compra_actual:2},asOf)[1];
 story.coverageRubros=parseCoverageRubros(raw,asOf,'month',expected)!;
 const parts=scopedCoverageStory(story,['repuestos.ventas','repuestos.ventas']);
 expect(parts.primary?.value).toBeCloseTo(100/3);expect(parts.supporting[0].value).toBe(1);
 expect(parts.series?.every(row=>row.numerator===1&&row.denominator===3)).toBe(true);
 expect(factualVariants(parts,()=>true,asOf)[0].text).toContain('compras de repuestos.');
 expect(factualVariants(parts,()=>true,asOf)[0].text).not.toContain('o servicios');
 const both=scopedCoverageStory(story,['repuestos.ventas','servicios.ventas']);
 expect(both.primary?.value).toBe(story.primary?.value);expect(both.cohort?.numerator).toEqual(['a','b']);
 expect(scopedCoverageStory(story,[])).toBe(story);
 expect(scopedCoverageStory({...story,coverageRubros:undefined},['repuestos.ventas']).primary).toBe(story.primary);
 expect(scopedCoverageStory({...story,sections:[]},['repuestos.ventas']).primary).toBe(story.primary);
});
