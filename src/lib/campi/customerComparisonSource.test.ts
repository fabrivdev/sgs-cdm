import { beforeEach, expect, it, vi } from 'vitest';
const {rpc,readNames}=vi.hoisted(()=>({rpc:vi.fn(),readNames:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,from:()=>({select:()=>({in:readNames})})}}));
import { loadCustomerComparisonStories } from './customerComparisonSource';
import { CUSTOMER_COMPARISON_PERMISSIONS } from './customerComparison';
import { detectBusinessFindings, selectBusinessFindings } from './businessFindings';
const fixture=()=>({contract_version:1,attribution_rule:'OS_CUSTOMER_V3',deduplication_rule:'DOCUMENT_LINE_V3',alcance:'DATOS_CARGADOS_NO_CERTIFICA_AUSENCIA_EN_ORIGEN',ventanas:[2025,2026].map(anio=>({anio,desde:`${anio}-01-01T00:00:00Z`,hasta:`${anio}-10-28T00:00:00Z`})),clientes_parque:1,detalle_clientes:[{cliente_id:'test-client',maquinas:2,ventas_previous:1,ventas_current:1,usd_ventas_previous:100,usd_ventas_current:50,usd_nc_previous:0,usd_nc_current:50,ambiguos_previous:0,ambiguos_current:0,grupos_no_usd:0,estado:'CON_VENTA_ACTUAL_CONFIRMADA'}],estados:[{estado:'CON_VENTA_ACTUAL_CONFIRMADA',clientes:1}],conservacion:{filas_seleccionadas:3,descartes_auditados_con_contraparte:0,filas_restantes:3,copias_reconciliadas:3,grupos_documentales:3,filas_detalle_no_acotados:0,grupos_no_acotados_sin_impacto_parque:0,grupos_con_impacto_parque:3,grupos_fuera_parque_con_identidad_acotada:0},no_determinados:[2025,2026].map(anio=>({anio,grupos:0,identidad_no_acotada:0,identidad_no_acotada_posible_venta:0,identidad_no_acotada_solo_nc:0})),detalle_no_acotados:[],cobertura_historica:{estado:'NO_ACREDITADA'}});
beforeEach(()=>{rpc.mockReset();readNames.mockReset();readNames.mockResolvedValue({data:[{id:'test-client',nombre:'Cliente de prueba'}],error:null});rpc.mockResolvedValue({data:fixture(),error:null});});
it('no lee con permiso parcial; usa una RPC parametrizada con permiso completo',async()=>{
 for(const denied of CUSTOMER_COMPARISON_PERMISSIONS) expect(await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS.filter(p=>p!==denied),'2026-10-27')).toEqual([]);
 expect(rpc).not.toHaveBeenCalled();expect(readNames).not.toHaveBeenCalled();
 await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27');
 expect(rpc).toHaveBeenCalledExactlyOnceWith('campi_customer_comparison_v1',{p_from:'2026-01-01',p_to:'2026-10-27'});
});
it('presenta grupo observado, bruto y límites sin declarar ausencia con neto cero',async()=>{
 const stories=await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27');
 const {findings}=detectBusinessFindings(stories,()=>true);expect(findings).toHaveLength(1);
 expect(findings[0].text).toContain('confirmadas menores');expect(findings[0].text).toContain('50');
 expect(findings[0].evidence?.join(' ')).toContain('no tiene cobertura acreditada');
 expect(detectBusinessFindings(stories,s=>s!=='servicios.ventas').findings).toEqual([]);
 expect(selectBusinessFindings(findings,{[findings[0].id]:{state:'paused',decision:findings[0].decision,facts:findings[0].facts,at:'2026-10-27'}})).toEqual([]);
});
it('propaga error de esta familia sin convertirlo en cero',async()=>{rpc.mockResolvedValue({data:null,error:new Error('42501')});await expect(loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27')).rejects.toThrow('42501');});
it('crecimiento observado no se llama recuperación y el corte no se inventa',async()=>{const f=fixture();f.detalle_clientes[0].usd_ventas_current=150;rpc.mockResolvedValue({data:f,error:null});const stories=await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27');expect(stories[0].cutoff).toBeNull();const found=detectBusinessFindings(stories,()=>true).findings[0];expect(found.positive).toBe(true);expect(found.text).toContain('confirmadas mayores');expect(found.text).not.toMatch(/recuperad|nuevo cliente/);expect(found.evidence?.join(' ')).toContain('Cliente de prueba');});
it('una corrección de NC del mismo corte tiene diferencia explicada',async()=>{const first=detectBusinessFindings(await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27'),()=>true).findings[0];const f=fixture();f.detalle_clientes[0].usd_nc_current=25;rpc.mockResolvedValue({data:f,error:null});const next=detectBusinessFindings(await loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27'),()=>true).findings;const selected=selectBusinessFindings(next,{[first.id]:{state:'seen',decision:first.decision,facts:first.facts,at:'2026-10-27',observation:first.observation}});expect(selected[0].change).toContain('NC identificadas actuales');});
it('no muestra cartera sin nombres respaldados por UUID',async()=>{readNames.mockResolvedValue({data:[],error:null});await expect(loadCustomerComparisonStories(CUSTOMER_COMPARISON_PERMISSIONS,'2026-10-27')).rejects.toThrow('identidades legibles');});
