import { supabase } from '@/integrations/supabase/client';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryLoader, StoryTopicId } from './panoramaStoryTypes';

type Row = Record<string, unknown>;
type Source = { section: SectionKey; label: string; rpc: string; amount: string; route: string; extra: Row };
const SOURCES: Source[] = [
  { section: 'repuestos.ventas', label: 'Repuestos', rpc: 'ventas_repuestos_panorama_filtros_v1', amount: 'facturado', route: '/repuestos/ventas', extra: { p_marca: null, p_vendedor: null } },
  { section: 'servicios.ventas', label: 'Servicios', rpc: 'ventas_servicios_panorama_v2', amount: 'total', route: '/servicios/ventas', extra: { p_marca: null, p_tipo_maquina: null, p_tipo_tiempo: null } },
  { section: 'parque.ventas', label: 'Máquinas', rpc: 'ventas_maquinas_dashboard_filtros_v2', amount: 'total', route: '/parque-ventas', extra: { p_marca: null, p_tipo_maquina: null, p_vendedor: null } },
];
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La fuente no devolvió un resumen válido.');
  return value as Row;
};
const numeric = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('La fuente devolvió un importe o conteo desconocido.');
  return value;
};
const metric = (value: unknown, field: string): number => {
  const result = numeric(value);
  if (field === 'clientes' && (!Number.isInteger(result) || result < 0)) throw new Error('La fuente devolvió un conteo de clientes inválido.');
  return result;
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function salesRanges(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(`${asOf}T00:00:00Z`)) || iso(new Date(`${asOf}T00:00:00Z`)) !== asOf) throw new Error('Fecha de referencia inválida.');
  const [year, month, day] = asOf.split('-').map(Number);
  const lastYearDay = Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate());
  return { year, month, from: `${year}-01-01`, to: asOf, previousFrom: `${year - 1}-01-01`, previousTo: iso(new Date(Date.UTC(year - 1, month - 1, lastYearDay))), previousMonthFrom: iso(new Date(Date.UTC(year, month - 2, 1))), previousMonthTo: iso(new Date(Date.UTC(year, month - 1, 0))) };
}
export function salesChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
}
type Report = { summary: Row; periods: Map<string, Row>; sparse: boolean };
function parseReport(data: unknown, source: Source): Report {
  const value = object(data), summary = object(value.resumen);
  numeric(summary[source.amount]);
  if (!Array.isArray(value.periodos)) throw new Error('La fuente no devolvió períodos verificables.');
  const periods = new Map<string, Row>();
  for (const raw of value.periodos) {
    const row = object(raw);
    if (typeof row.periodo !== 'string' || !/^\d{4}-\d{2}-01$/.test(row.periodo)) throw new Error('Período mensual inválido.');
    const key = row.periodo.slice(0, 7);
    if (periods.has(key)) throw new Error('La fuente repitió un período.');
    numeric(row[source.amount]); periods.set(key, row);
  }
  // Aggregate endpoints return the whole range, not a page. Reconcile before consuming months.
  const sum = [...periods.values()].reduce((total, row) => total + numeric(row[source.amount]), 0);
  if (Math.abs(sum - numeric(summary[source.amount])) > Math.max(0.01, Math.abs(sum) * 1e-10)) throw new Error('Los períodos no concilian con el total de la fuente.');
  return { summary, periods, sparse: source.section === 'parque.ventas' };
}
function monthly(report: Report, key: string, field: string): number {
  const row = report.periods.get(key);
  // Machines groups the complete source without generate_series: an absent group has no movements.
  // This is only valid after reconciling every returned month against the server total.
  if (!row && report.sparse) return 0;
  if (!row) throw new Error(`La fuente no informa el mes ${key}.`);
  return metric(row[field], field);
}
function base(id: StoryTopicId, sources: Source[], asOf: string): PanoramaStory {
  return { id, visitKey: `${id}:v1:${asOf.slice(0, 7)}`, title: id === 'ventas_facturacion' ? 'Facturación' : 'Identidades de repuestos', question: id === 'ventas_facturacion' ? '¿Cómo viene la facturación?' : '¿Cuántas identidades aparecen en documentos de repuestos?', status: 'ready', message: '', scope: sources.map(source => source.label).join(' + '), sections: sources.map(source => source.section), cutoff: null, periodLabel: `01/${asOf.slice(5, 7)}–${asOf.slice(8, 10)}/${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`, primary: null, supporting: [], chart: null, breakdown: [], details: ['Fecha de factura. Ventas y notas de crédito con su signo.', 'La fecha de referencia limita el período; la fuente no informa su fecha real de actualización.'], source: sources.map(source => source.rpc).join(' + '), route: sources[0]?.route ?? '/campi' };
}

export const loadSalesStories: StoryLoader = async (topics, granted, asOf) => {
  const billingSources = topics.includes('ventas_facturacion') ? SOURCES.filter(source => granted.includes(source.section)) : [];
  const parts = SOURCES[0];
  const wantsClients = topics.includes('repuestos_clientes') && granted.includes(parts.section);
  if (!billingSources.length && !wantsClients) return [];
  let ranges: ReturnType<typeof salesRanges>;
  try { ranges = salesRanges(asOf); } catch (error) {
    return ([...(billingSources.length ? [base('ventas_facturacion', billingSources, asOf)] : []), ...(wantsClients ? [base('repuestos_clientes', [parts], asOf)] : [])]).map(story => ({ ...story, status: 'error', message: (error as Error).message }));
  }
  // Per invocation cache shares Repuestos between stories. Queue caps network concurrency at two.
  let running = 0;
  const waiters: Array<() => void> = [];
  const cache = new Map<string, Promise<Report>>();
  const report = (source: Source, from: string, to: string): Promise<Report> => {
    const key = `${source.rpc}:${from}:${to}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      if (running >= 2) await new Promise<void>(resolve => waiters.push(resolve));
      running++;
      try {
        // Reuse the USD reporting contract consumed by Ventas.tsx (usd.format(summary.total)); no conversion.
        const result = await supabase.rpc(source.rpc as never, { p_desde: from, p_hasta: to, p_sucursal: null, p_buscar: null, p_agrupacion: 'mes', ...source.extra } as never);
        if (result.error) throw new Error(`${source.label}: ${result.error.message || 'no se pudo consultar la fuente.'}`);
        return parseReport(result.data, source);
      } finally { running--; waiters.shift()?.(); }
    })());
    return cache.get(key)!;
  };
  const load = async (id: StoryTopicId, sources: Source[]): Promise<PanoramaStory> => {
    const story = base(id, sources, asOf);
    try {
      const loaded = await Promise.all(sources.map(async source => {
        const [current, previous, december] = await Promise.all([report(source, ranges.from, ranges.to), report(source, ranges.previousFrom, ranges.previousTo), ...(ranges.month === 1 ? [report(source, ranges.previousMonthFrom, ranges.previousMonthTo)] : [])]);
        return { source, current, previous, december };
      }));
      const clients = id === 'repuestos_clientes';
      const field = (source: Source) => clients ? 'clientes' : source.amount;
      const currentMonth = loaded.map(({ source, current }) => monthly(current, asOf.slice(0, 7), field(source)));
      const priorMonthLY = loaded.map(({ source, previous }) => monthly(previous, ranges.previousTo.slice(0, 7), field(source)));
      const mtd = currentMonth.reduce((a, b) => a + b, 0), mtdLY = priorMonthLY.reduce((a, b) => a + b, 0);
      const ytd = loaded.reduce((sum, row) => sum + metric(row.current.summary[field(row.source)], field(row.source)), 0);
      const ytdLY = loaded.reduce((sum, row) => sum + metric(row.previous.summary[field(row.source)], field(row.source)), 0);
      const lastMonth = loaded.reduce((sum, row) => sum + monthly(row.december ?? row.current, ranges.previousMonthFrom.slice(0, 7), field(row.source)), 0);
      const unit = clients ? 'count' as const : 'USD' as const;
      story.primary = { label: clients ? 'Identidades del mes' : 'Facturación del mes', value: mtd, unit, comparison: { value: mtdLY, label: `Mismo tramo de ${ranges.year - 1}` } };
      story.supporting = [
        { label: 'Variación interanual del mes', value: salesChange(mtd, mtdLY), unit: 'percent', note: mtdLY === 0 ? 'Sin base: el período anterior es cero.' : undefined },
        { label: 'Mes anterior completo', value: lastMonth, unit, note: `${ranges.previousMonthFrom} al ${ranges.previousMonthTo}; contexto, no comparación de tramos iguales.` },
        { label: clients ? 'Identidades del año' : 'Acumulado del año', value: ytd, unit, comparison: { value: ytdLY, label: `Mismo tramo de ${ranges.year - 1}` } },
      ];
      const annualChange = salesChange(ytd, ytdLY);
      story.supporting.push({ label: 'Variación interanual acumulada', value: annualChange, unit: 'percent', note: ytdLY === 0 ? 'Sin base comparable.' : undefined });
      const rows = Array.from({ length: ranges.month }, (_, index) => {
        const month = String(index + 1).padStart(2, '0');
        return { label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][index], value: loaded.reduce((sum, row) => sum + monthly(row.current, `${ranges.year}-${month}`, field(row.source)), 0), previous: loaded.reduce((sum, row) => sum + monthly(row.previous, `${ranges.year - 1}-${month}`, field(row.source)), 0) };
      });
      const partialMonth = Number(asOf.slice(8)) < new Date(Date.UTC(ranges.year, ranges.month, 0)).getUTCDate();
      if (partialMonth && rows.length) rows[rows.length - 1].label += '*';
      story.chart = { kind: 'trend', title: (clients ? 'Identidades por mes' : 'Facturación por mes') + (partialMonth ? ' · *mes parcial' : ''), rows, unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1) };
      story.breakdown = clients ? [] : loaded.map(({ source }, index) => ({ label: source.label, value: currentMonth[index], unit: 'USD', route: source.route }));
      const monthlyChange = salesChange(mtd, mtdLY);
      const pct = (value: number) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(Math.abs(value)) + '%';
      const movement = (value: number) => value === 0 ? 'sin variación' : `${pct(value)} ${value > 0 ? 'por encima' : 'por debajo'}`;
      story.message = clients
        ? `${mtd} identidades en documentos este mes, frente a ${mtdLY} en el mismo tramo de ${ranges.year - 1}.`
        : monthlyChange === null ? 'El mismo tramo del año anterior no tiene importe para calcular una variación porcentual.'
        : `El mes está ${movement(monthlyChange)} del mismo tramo de ${ranges.year - 1}${annualChange === null ? '.' : `; el acumulado, ${movement(annualChange)}.`}`;
      story.attention = !clients && monthlyChange !== null && monthlyChange < 0;
      story.details.push('Importes USD según el contrato de las vistas de Ventas existentes; no se acredita aquí la moneda individual ni una auditoría productiva.', `Comparación: ${ranges.from} al ${ranges.to} frente a ${ranges.previousFrom} al ${ranges.previousTo}. Último mes del gráfico recortado al mismo día.`, 'Sin ajustes por inflación, tipo de cambio ni días hábiles.');
      if (clients) story.details.push('Conteo DISTINCT del servidor por identidad canónica; incluye clientes con NC y la identidad «Cliente no informado». No equivale a compradores positivos.', 'El acumulado anual es único sobre el rango completo; nunca suma los clientes de los meses. No permite deducir clientes nuevos, recurrentes o perdidos.');
      return story;
    } catch (error) {
      return { ...story, status: 'error', message: error instanceof Error ? error.message : 'No se pudo consultar la fuente.', primary: null, supporting: [], chart: null, breakdown: [], attention: true };
    }
  };
  return Promise.all([...(billingSources.length ? [load('ventas_facturacion', billingSources)] : []), ...(wantsClients ? [load('repuestos_clientes', [parts])] : [])]);
};
