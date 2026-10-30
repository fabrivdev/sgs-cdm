import {it,expect,vi,beforeEach,afterEach} from 'vitest';
beforeEach(()=>vi.stubEnv('VITE_UNIFIED_PARK_COVERAGE_ENABLED','false'));
afterEach(()=>vi.unstubAllEnvs());
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import {loadManagerialStories} from './managerialStories';
it('keeps the established customer summary when the optional cohort RPC is unavailable',async()=>{
 rpc.mockImplementation(async(name:string)=>{if(name!=='gerencial_clientes_resumen_v1')throw new Error('Optional SQL unavailable');return {data:[{compradores_base:4,compradores_retenidos:2,propietarios_elegibles:8,propietarios_con_compra_actual:4}],error:null};});
 const stories=await loadManagerialStories(['clientes_retencion','clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-21');
 expect(rpc.mock.calls.map(call=>call[0])).toEqual(['gerencial_clientes_resumen_v1','campi_clientes_cohortes_v1','campi_cobertura_parque_actual_serie_v1']);expect(stories.map(s=>s.primary?.value)).toEqual([50,50]);expect(stories[1].chart).toBeNull();
});
it('shows the park coverage split only when customer identities reconcile',async()=>{
 rpc.mockReset();
 rpc.mockImplementation(async(name:string)=>name==='gerencial_clientes_resumen_v1'
   ? {data:[{compradores_base:2,compradores_retenidos:1,propietarios_elegibles:2,propietarios_con_compra_actual:1}],error:null}
   : {data:{version:2,desde:'2026-10-01',hasta:'2026-10-21',prev_desde:'2026-09-01',prev_hasta:'2026-09-21',cohorte_base:['a','b'],cohorte_actual:['b'],retenidos:['b'],propietarios:['a','b'],propietarios_con_compra:['b'],desglose_lineas:null,desglose_estado:'pendiente_definicion_no_aditiva'},error:null});
 const stories=await loadManagerialStories(['clientes_retencion','clientes_cobertura_posventa'],['parque.maquinas'],'2026-10-21');
 expect(stories.map(s=>s.primary?.value)).toEqual([50,50]);
 expect(stories[1].chart?.rows.map(r=>r.value)).toEqual([1,1]);
 expect(stories[1].source).toContain('campi_clientes_cohortes_v1');
});
