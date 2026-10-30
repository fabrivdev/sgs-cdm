import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),fail:false}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
import {loadManagerialStories} from './managerialStories';
import {monthWindows} from './panoramaDates';
beforeEach(()=>{
 vi.stubEnv('VITE_UNIFIED_PARK_COVERAGE_ENABLED','false');
 mock.fail=false;mock.rpc.mockReset();
 mock.rpc.mockImplementation(async(name:string)=>{
 const windows=monthWindows('2026-10-29',6);
 if(name==='gerencial_clientes_resumen_v1')return {data:[{compradores_base:1,compradores_retenidos:1,propietarios_elegibles:2,propietarios_con_compra_actual:1}],error:null};
 if(name==='campi_clientes_cohortes_v1')return {data:{version:2,desde:'2026-10-01',hasta:'2026-10-29',prev_desde:'2026-09-01',prev_hasta:'2026-09-29',cohorte_base:['a'],cohorte_actual:['a'],retenidos:['a'],propietarios:['a','b'],propietarios_con_compra:['a'],desglose_lineas:null,desglose_estado:'pendiente_definicion_no_aditiva'},error:null};
 if(name==='campi_cobertura_parque_actual_serie_v1')return {data:{version:1,cohort:'current_park',mode:'month',as_of:'2026-10-29',rows:windows.map(w=>({...w,numerator:1,denominator:2}))},error:null};
 if(name==='campi_cobertura_rubros_v1')return mock.fail?{data:null,error:{code:'PGRST202'}}:{data:{version:1,cohort:'current_park',mode:'month',as_of:'2026-10-29',owners:['a','b'],rows:windows.map(w=>({...w,nets:[['a',10,20,30],['b',0,0,0]],source_mismatches:0,union_conflicts:0}))},error:null};
 throw new Error('Unexpected RPC');
 });
});
afterEach(()=>vi.unstubAllEnvs());
const load=()=>loadManagerialStories(['clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-29');
it('does not query the prepared function until explicitly enabled',async()=>{
 vi.stubEnv('VITE_CAMPI_COVERAGE_RUBROS_ENABLED','false');const [s]=await load();
 expect(s.primary?.value).toBe(50);expect(s.coverageRubros).toBeUndefined();
 expect(mock.rpc.mock.calls.some(c=>c[0]==='campi_cobertura_rubros_v1')).toBe(false);
});
it('accepts only a breakdown reconciled with summary, identities and full series',async()=>{
 vi.stubEnv('VITE_CAMPI_COVERAGE_RUBROS_ENABLED','true');const [s]=await load();
 expect(s.coverageRubros?.owners).toEqual(['a','b']);expect(s.primary?.value).toBe(50);
 expect(mock.rpc.mock.calls.filter(c=>c[0]==='campi_cobertura_rubros_v1')).toHaveLength(1);
});
it('keeps the prior total and series when the optional function is unavailable',async()=>{
 vi.stubEnv('VITE_CAMPI_COVERAGE_RUBROS_ENABLED','true');mock.fail=true;const [s]=await load();
 expect(s.status).toBe('ready');expect(s.primary?.value).toBe(50);expect(s.series).toHaveLength(6);expect(s.coverageRubros).toBeUndefined();
});
it('never calls any source without the current park permission or for retention alone',async()=>{
 vi.stubEnv('VITE_CAMPI_COVERAGE_RUBROS_ENABLED','true');
 expect(await loadManagerialStories(['clientes_cobertura_posventa'],[],'2026-10-29')).toEqual([]);expect(mock.rpc).not.toHaveBeenCalled();
 await loadManagerialStories(['clientes_retencion'],['parque.maquinas'],'2026-10-29');
 expect(mock.rpc.mock.calls.some(c=>c[0]==='campi_cobertura_rubros_v1')).toBe(false);
});
