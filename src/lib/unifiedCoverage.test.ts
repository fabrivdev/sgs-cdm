import { describe,expect,it,vi,afterEach } from 'vitest';
import { parseUnifiedCoverage,unifiedCoverageWindow,unifiedCoverageProjection } from './unifiedCoverage';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
const fixture=()=>({version:1,policy:'principal_closed_or_completed_v1',from:'2026-01-01',to:'2026-10-29',owners:['a','b','c'],parts:[['a','2026-01-05',100],['a','2026-10-01',-100],['b','2026-10-02',10]],services:[['a','2026-10-03','OS1','cierre'],['a','2026-10-05','OS2:J1','jornada'],['c','2026-01-02','OS3','apertura_historica']],uncertainOwners:[]});
const source=()=>parseUnifiedCoverage(fixture(),'2026-01-01','2026-10-29');
afterEach(()=>vi.unstubAllEnvs());
describe('shared source projections',()=>{
 it('counts service evidence once per owner and unions with parts once',()=>{
  const p=unifiedCoverageProjection(source(),'2026-10-01','2026-10-29',[]);expect(p).toMatchObject({numerator:2,denominator:3,ids:['a','b']});
 });
 it('does not count fully offset parts in accumulated window',()=>{
  expect(unifiedCoverageWindow(source(),'2026-01-01','2026-10-29').parts).toEqual(['b']);
 });
 it('honors each monthly window instead of adding percentages',()=>{
  expect(unifiedCoverageProjection(source(),'2026-01-01','2026-01-31',[])?.ids).toEqual(['a','c']);
  expect(unifiedCoverageProjection(source(),'2026-10-01','2026-10-29',['services'])?.ids).toEqual(['a']);
 });
 it('keeps same universe for every rubric and scopes identities without names',()=>{
  expect(unifiedCoverageProjection(source(),'2026-10-01','2026-10-29',['services'],['a','b'])?.denominator).toBe(2);
  expect(unifiedCoverageProjection(source(),'2026-10-01','2026-10-29',['parts'],['a','b'])?.denominator).toBe(2);
 });
 it('blocks affected unresolved owners, not unrelated filtered owners',()=>{
  const s=source();s.uncertainOwners=['c'];expect(unifiedCoverageProjection(s,s.from,s.to,[])).toBeNull();
  expect(unifiedCoverageProjection(s,s.from,s.to,[],['a','b'])).not.toBeNull();
 });
 it('handles empty population without zero invented from missing data',()=>{
  const p=source();p.owners=[];p.parts=[];p.services=[];
  expect(unifiedCoverageProjection(p,p.from,p.to,[])?.percent).toBeNull();
 });
 it.each(['policy','range','owner','date','amount','duplicatePart','duplicateService','kind','uncertain'] as const)('rejects invalid %s',kind=>{
  const p=fixture();if(kind==='policy')p.policy='old';if(kind==='range')p.from='2026-02-01';if(kind==='owner')p.parts[0][0]='other';if(kind==='date')p.services[0][1]='2026-02-30';if(kind==='amount')p.parts[0][2]=NaN;if(kind==='duplicatePart')p.parts.push(p.parts[0]);if(kind==='duplicateService')p.services.push(p.services[0]);if(kind==='kind')p.services[0][3]='opened';if(kind==='uncertain')(p.uncertainOwners as string[]).push('other');
  expect(()=>parseUnifiedCoverage(p,'2026-01-01','2026-10-29')).toThrow();
 });
 it('rejects range beyond loaded source',()=>expect(()=>unifiedCoverageWindow(source(),'2025-01-01','2026-10-29')).toThrow());
});
