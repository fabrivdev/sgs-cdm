import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
import {loadManagerialStories} from './managerialStories';
import {scopedCoverageStory} from './coverageRubros';
import {factualVariants} from './factualRounds';
import {unifiedCoverageProjection,parseUnifiedCoverage} from '../unifiedCoverage';
const payload={version:1,policy:'principal_closed_or_completed_v1',from:'2026-05-01',to:'2026-10-29',owners:['a','b'],parts:[['a','2026-10-01',10]],services:[['b','2026-10-02','OS1','apertura_historica']],uncertainOwners:[]};
beforeEach(()=>{vi.stubEnv('VITE_UNIFIED_PARK_COVERAGE_ENABLED','true');mock.rpc.mockReset();mock.rpc.mockResolvedValue({data:payload,error:null});});
afterEach(()=>vi.unstubAllEnvs());
it('uses one shared RPC, not buyer summaries, and reconciles the Parque projection',async()=>{
 const [story]=await loadManagerialStories(['clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-29');
 expect(mock.rpc.mock.calls.map(c=>c[0])).toEqual(['parque_cobertura_unificada_v1']);expect(story.coverageBasis).toBe('attention');expect(story.primary?.value).toBe(100);
 const source=parseUnifiedCoverage(payload,payload.from,payload.to);
 for(const [selection,rubric] of [[['servicios.ventas'],['services']],[['repuestos.ventas'],['parts']],[['repuestos.ventas','servicios.ventas'],[]]] as const){
  const scoped=scopedCoverageStory(story,selection);const parque=unifiedCoverageProjection(source,'2026-10-01','2026-10-29',rubric);
  expect(scoped.primary?.value).toBe(parque?.percent);expect(scoped.cohort?.numerator).toEqual(parque?.ids);
 }
 const service=scopedCoverageStory(story,['servicios.ventas']);const comment=factualVariants(service,()=>true,'2026-10-29')[0].text;
 expect(comment).toContain('recibieron atención de servicio');expect(comment).not.toContain('compras de servicios');expect(story.series).toHaveLength(6);
});
it.each(['absent','denied','uncertain'])('does not relabel old commercial coverage on %s',async kind=>{
 mock.rpc.mockResolvedValue(kind==='uncertain'?{data:{...payload,uncertainOwners:['a']},error:null}:{data:null,error:{code:kind==='denied'?'42501':'PGRST202'}});
 const [story]=await loadManagerialStories(['clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-29');expect(story.status).toBe('error');expect(story.primary).toBeNull();expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it('does not query without source permission',async()=>{expect(await loadManagerialStories(['clientes_cobertura_posventa'],[],'2026-10-29')).toEqual([]);expect(mock.rpc).not.toHaveBeenCalled();});
it('uses cumulative windows from January when requested',async()=>{mock.rpc.mockResolvedValue({data:{...payload,from:'2026-01-01'},error:null});const [story]=await loadManagerialStories(['clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-29','ytd');expect(story.series).toHaveLength(10);expect(story.series?.every(r=>r.from==='2026-01-01')).toBe(true);});
