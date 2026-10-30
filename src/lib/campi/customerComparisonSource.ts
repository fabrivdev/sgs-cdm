import { supabase } from '@/integrations/supabase/client';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory } from './panoramaStoryTypes';
import { CUSTOMER_COMPARISON_PERMISSIONS, loadCustomerComparison } from './customerComparison';

/** The installed invoker function enforces module/section access again. */
export async function loadCustomerComparisonStories(granted: SectionKey[], asOf: string): Promise<PanoramaStory[]> {
  const comparison = await loadCustomerComparison(async window => {
    const { data, error } = await supabase.rpc('campi_customer_comparison_v1', { p_from: window.from, p_to: window.to });
    if (error) {
      if(import.meta.env.DEV) console.warn('Campi customer comparison RPC rejected',error.code);
      throw error;
    }
    return data;
  }, section => granted.includes(section), { from: `${asOf.slice(0,4)}-01-01`, to: asOf }).catch(error=>{
    if(import.meta.env.DEV && error instanceof Error) console.warn('Campi customer comparison validation failed',error.message);
    throw error;
  });
  if (!comparison) return [];
  if(import.meta.env.DEV) console.info('Campi customer comparison validated',JSON.stringify({window:comparison.window,population:comparison.population,machines:comparison.machines,coverage:comparison.coverage.estado,groups:comparison.groups.map(g=>({direction:g.direction,clients:g.ids.length,previousGross:g.previousGross,currentGross:g.currentGross}))}));
  const ids=[...new Set(comparison.groups.flatMap(g=>g.ids))];
  const names:Record<string,string>={};
  if(ids.length) {
    const {data,error}=await supabase.from('clientes').select('id,nombre').in('id',ids);
    if(error) throw error;
    for(const row of data ?? []) if(ids.includes(row.id) && row.nombre?.trim()) names[row.id]=row.nombre;
    if(ids.some(id=>!names[id])) throw new Error('Faltan identidades legibles de la cartera.');
  }
  return [{ id:'clientes_cobertura_posventa', title:'Compras de clientes con parque', question:'¿Dónde priorizar la revisión comercial?',
    status:'ready', message:'', scope:'Clientes con parque activo; registros confirmados comparables',
    sections:[...CUSTOMER_COMPARISON_PERMISSIONS], cutoff:null, periodLabel:'Acumulado comparable',
    primary:null, supporting:[], chart:null, breakdown:[], details:[], source:'campi_customer_comparison_v1', route:'/parque-clientes',
    customerComparison:comparison, customerComparisonNames:names }];
}
