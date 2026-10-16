import { supabase } from '@/integrations/supabase/client';
import { fetchSemaforoHistorico } from '@/hooks/useSemaforoHistorico';
import { parseProjectedMachineStock, projectedStockTotals } from '@/lib/projectedMachineStock';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaTopicId } from './panoramaPreferences';

export type PanoramaMetric = {
  id: string;
  topic: PanoramaTopicId;
  label: string;
  value: number;
  unit: 'PYG' | 'USD' | 'unidades';
  section: SectionKey;
  scope: string;
  period: string;
  cutoff: string;
  version: string;
  route: string;
};

export type PanoramaInsight = {
  id: string;
  topic: PanoramaTopicId;
  title: string;
  value: number;
  total: number;
  count: number;
  unit: 'USD';
  cutoff: string;
  route: string;
};

export type PanoramaSourceResult = { section: SectionKey; metrics: PanoramaMetric[]; insights?: PanoramaInsight[]; error?: string };

type Source = {
  section: SectionKey;
  topics: readonly PanoramaTopicId[];
  load: (today: string) => Promise<{ metrics: PanoramaMetric[]; insights?: PanoramaInsight[] }>;
};

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const period = (today: string) => today.slice(0, 7);
const monthStart = (today: string) => `${period(today)}-01`;

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = supabase as unknown as { rpc: (rpcName: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || 'No se pudo consultar la fuente.');
  if (!data || typeof data !== 'object') throw new Error('La fuente no devolvió un resumen válido.');
  return data;
}

const SOURCES: readonly Source[] = [
  {
    section: 'repuestos.ventas', topics: ['ventas_facturacion', 'repuestos_demanda'],
    load: async today => {
      const data = await rpc('ventas_repuestos_panorama_v2', {
        p_desde: monthStart(today), p_hasta: today, p_sucursal: null, p_buscar: null, p_agrupacion: 'mes',
      }) as { resumen?: { facturado?: unknown; unidades_netas?: unknown } };
      const billed = number(data.resumen?.facturado);
      const units = number(data.resumen?.unidades_netas);
      if (billed === null) throw new Error('La fuente de Repuestos no devolvió facturación.');
      return { metrics: [
        { id: 'repuestos.facturado', topic: 'ventas_facturacion', label: 'Facturación de repuestos', value: billed, unit: 'USD', section: 'repuestos.ventas', scope: 'Repuestos', period: period(today), cutoff: today, version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas' },
        ...(units === null ? [] : [{ id: 'repuestos.unidades_netas', topic: 'repuestos_demanda' as const, label: 'Unidades netas vendidas', value: units, unit: 'unidades' as const, section: 'repuestos.ventas' as const, scope: 'Repuestos', period: period(today), cutoff: today, version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas' }]),
      ] };
    },
  },
  {
    section: 'servicios.ventas', topics: ['ventas_facturacion'],
    load: async today => {
      const data = await rpc('ventas_servicios_panorama_v2', {
        p_desde: monthStart(today), p_hasta: today, p_marca: null, p_tipo_maquina: null,
        p_sucursal: null, p_tipo_tiempo: null, p_agrupacion: 'mes', p_buscar: null,
      }) as { resumen?: { total?: unknown } };
      const total = number(data.resumen?.total);
      if (total === null) throw new Error('La fuente de Servicios no devolvió facturación.');
      return { metrics: [{ id: 'servicios.facturado', topic: 'ventas_facturacion', label: 'Facturación de servicios', value: total, unit: 'USD', section: 'servicios.ventas', scope: 'Servicios', period: period(today), cutoff: today, version: 'ventas_servicios_panorama_v2', route: '/servicios/ventas' }] };
    },
  },
  {
    section: 'repuestos.analisis', topics: ['repuestos_stock'],
    load: async today => {
      const data = await fetchSemaforoHistorico({ busqueda: '', marca: '', color: '', sucursal: '' }, 0, 1);
      const value = number(data.valor_kardex_usd);
      if (value === null) throw new Error('El inventario no tiene valor USD consolidado.');
      const red = data.por_color?.find(row => row.color === 'ROJO');
      const redValue = number(red?.valor_kardex_usd);
      return {
        metrics: [{ id: 'repuestos.valor_stock', topic: 'repuestos_stock', label: 'Valor Kardex referencial', value, unit: 'USD', section: 'repuestos.analisis', scope: 'Repuestos', period: 'stock', cutoff: data.fecha_analisis, version: 'repuestos_analisis_valorizado:ultima_compra_v1', route: '/repuestos/analisis' }],
        insights: red && redValue !== null && value > 0 ? [{ id: 'repuestos.stock_antiguo', topic: 'repuestos_stock', title: 'Stock sin ventas en tres años y última compra hace más de 1.000 días', value: redValue, total: value, count: red.lineas, unit: 'USD', cutoff: data.fecha_analisis, route: '/repuestos/analisis' }] : [],
      };
    },
  },
  {
    section: 'parque.stock_proyectado', topics: ['maquinas_proyeccion'],
    load: async today => {
      const data = parseProjectedMachineStock(await rpc('parque_stock_proyectado_v1', { p_corte: today }));
      const total = projectedStockTotals(data.filas);
      return { metrics: [{ id: 'parque.stock_proyectado', topic: 'maquinas_proyeccion', label: 'Stock proyectado', value: total.stockProyectado, unit: 'unidades', section: 'parque.stock_proyectado', scope: 'Máquinas nuevas desde 31/08/2026', period: data.fecha_corte, cutoff: data.fecha_corte, version: 'parque_stock_proyectado_v1', route: '/parque-stock-proyectado' }] };
    },
  },
];

export function sourceSectionsForTopics(topics: readonly PanoramaTopicId[], canAccess: (section: SectionKey) => boolean) {
  return SOURCES.filter(source => source.topics.some(topic => topics.includes(topic)) && canAccess(source.section)).map(source => source.section);
}

export async function loadPanoramaData(topics: readonly PanoramaTopicId[], grantedSections: readonly SectionKey[], today: string): Promise<PanoramaSourceResult[]> {
  const granted = new Set(grantedSections);
  const sources = SOURCES.filter(source => granted.has(source.section) && source.topics.some(topic => topics.includes(topic)));
  return Promise.all(sources.map(async source => {
    try {
      const loaded = await source.load(today);
      const metrics = loaded.metrics.filter(metric => topics.includes(metric.topic));
      const insights = loaded.insights?.filter(insight => topics.includes(insight.topic));
      return { section: source.section, metrics, insights };
    } catch (error) {
      return { section: source.section, metrics: [], error: error instanceof Error ? error.message : 'No se pudo consultar la fuente.' };
    }
  }));
}
