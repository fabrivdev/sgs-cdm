import { beforeEach, expect, it, vi } from 'vitest';
const {sales,services}=vi.hoisted(()=>({sales:vi.fn(async()=>[]),services:vi.fn(async()=>[])}));
vi.mock('./salesStories',()=>({loadSalesStories:sales}));
vi.mock('./operationsStories',()=>({loadOperationsStories:services}));
import { loadBusinessSources, selectedBusinessSources, selectedBusinessStories } from './businessSources';
import type { PanoramaStory } from './panoramaStoryTypes';
beforeEach(()=>vi.clearAllMocks());
it('vincula fuentes a temas exactos, sin ampliar por área ni usar fallback',()=>{
 expect(selectedBusinessSources(['servicios_pendientes','clientes_cobertura_posventa','ventas_evolucion','servicios_os_facturadas']).map(s=>s.id)).toEqual(['sales','customers']);
 expect(selectedBusinessSources(['maquinas_pedidos']).map(s=>s.id)).toEqual(['orders']);
 expect(selectedBusinessSources(['maquinas_stock','ventas_facturacion','clientes_retencion'])).toEqual([]);
 expect(selectedBusinessSources([])).toEqual([]);
});
it('elimina respuestas cacheadas de temas retirados antes de presentar',()=>{
 const rows=[{id:'maquinas_pedidos'},{id:'ventas_evolucion'}] as PanoramaStory[];
 expect(selectedBusinessStories(rows,['ventas_evolucion']).map(s=>s.id)).toEqual(['ventas_evolucion']);
 expect(selectedBusinessStories(rows,[])).toEqual([]);
});
it('consulta pedidos sólo con permiso operativo y no pide cierres ni NC para rellenar',async()=>{
 await loadBusinessSources('orders',[],'2026-10-27');expect(services).not.toHaveBeenCalled();
 await loadBusinessSources('orders',['parque.operaciones'],'2026-10-27');expect(services).toHaveBeenCalledWith(['maquinas_pedidos'],['parque.operaciones'],'2026-10-27','month');
});
it('no consulta sin permisos ni amplía secciones',async()=>{
 await loadBusinessSources('sales',[],'2026-10-26');expect(sales).not.toHaveBeenCalled();
 await loadBusinessSources('sales',['servicios.ventas','parque.maquinas'],'2026-10-26');
 expect(sales).toHaveBeenCalledWith(['ventas_evolucion'],['servicios.ventas'],'2026-10-26','month');
});
it('separa fallo de ventas de resolución OS',async()=>{
 sales.mockRejectedValueOnce(new Error('Ventas no disponible'));
 const outcomes=await Promise.allSettled([loadBusinessSources('sales',['repuestos.ventas'],'2026-10-26'),loadBusinessSources('services',['servicios.ordenes'],'2026-10-26')]);
 expect(outcomes.map(r=>r.status)).toEqual(['rejected','fulfilled']);
});
