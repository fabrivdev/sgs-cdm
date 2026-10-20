import { supabase } from '@/integrations/supabase/client';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryLoader, StoryTopicId } from './panoramaStoryTypes';
import { panoramaTopicDefinition } from './panoramaPreferences';

type Row = Record<string, unknown>;
type Source = { section: SectionKey; label: string; rpc: string; amount: string; gross: string; credit: string; creditSigned?: boolean; route: string; extra: Row };
const SOURCES: Source[] = [
  { section: 'repuestos.ventas', label: 'Repuestos', rpc: 'ventas_repuestos_panorama_filtros_v1', amount: 'facturado', gross: 'ventas', credit: 'notas_credito', creditSigned: true, route: '/repuestos/ventas', extra: { p_marca: null, p_vendedor: null } },
  { section: 'servicios.ventas', label: 'Servicios', rpc: 'campi_ventas_servicios_componentes_v1', amount: 'total', gross: 'venta_bruta', credit: 'notas_credito_monto', route: '/servicios/ventas', extra: {} },
  { section: 'parque.ventas', label: 'Máquinas', rpc: 'ventas_maquinas_dashboard_filtros_v2', amount: 'total', gross: 'venta_bruta', credit: 'notas_credito_monto', route: '/parque-ventas', extra: { p_marca: null, p_tipo_maquina: null, p_vendedor: null } },
];
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La fuente no devolvió un resumen válido.');
  return value as Row;
};
const numeric = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('La fuente devolvió un importe o conteo desconocido.');
  return value;
};
const metric = (value: unknown): number => numeric(value);
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
type Report = { summary: Row; periods: Map<string, Row>; sparse: boolean; monthlyComponents: boolean };
function parseReport(data: unknown, source: Source): Report {
  const value = object(data), summary = object(value.resumen);
  numeric(summary[source.amount]);
  if (source.section === 'servicios.ventas' && numeric(summary.nc_sign_conflicts) !== 0) throw new Error('Servicios contiene notas de crédito con signo positivo; revisar la fuente antes de informar ventas brutas.');
  const checkComponents = (row: Row) => {
    const gross = numeric(row[source.gross]), credit = numeric(row[source.credit]);
    if (gross < 0 || (source.creditSigned ? credit > 0 : credit < 0)) throw new Error(`${source.label}: signo de ventas o NC inválido.`);
    const net = gross + (source.creditSigned ? credit : -credit);
    if (Math.abs(net - numeric(row[source.amount])) > Math.max(0.01, Math.abs(net) * 1e-10)) throw new Error(`${source.label}: ventas y NC no concilian con el neto.`);
  };
  checkComponents(summary);
  if (!Array.isArray(value.periodos)) throw new Error('La fuente no devolvió períodos verificables.');
  const periods = new Map<string, Row>();
  for (const raw of value.periodos) {
    const row = object(raw);
    if (typeof row.periodo !== 'string' || !/^\d{4}-\d{2}-01$/.test(row.periodo)) throw new Error('Período mensual inválido.');
    const key = row.periodo.slice(0, 7);
    if (periods.has(key)) throw new Error('La fuente repitió un período.');
    numeric(row[source.amount]);
    if (row[source.gross] !== undefined || row[source.credit] !== undefined) checkComponents(row);
    periods.set(key, row);
  }
  let monthlyComponents = source.section !== 'parque.ventas';
  if (source.section === 'parque.ventas' && Array.isArray(value.lineas)) {
    const byMonth = new Map<string, { gross: number; credit: number; net: number }>();
    for (const raw of value.lineas) {
      const line = object(raw);
      if (typeof line.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(line.fecha)) throw new Error('Máquinas: línea sin fecha verificable.');
      const amount = numeric(line.facturado);
      const key = line.fecha.slice(0, 7);
      const month = byMonth.get(key) ?? { gross: 0, credit: 0, net: 0 };
      month.net += amount;
      if (amount > 0) month.gross += amount;
      if (amount < 0) month.credit -= amount;
      byMonth.set(key, month);
    }
    for (const [key, month] of byMonth) {
      const row = periods.get(key);
      if (!row || Math.abs(numeric(row.total) - month.net) > 0.01) throw new Error('Máquinas: líneas y períodos no concilian.');
      periods.set(key, { ...row, venta_bruta: month.gross, notas_credito_monto: month.credit });
    }
    const gross = [...byMonth.values()].reduce((sum, row) => sum + row.gross, 0);
    const credit = [...byMonth.values()].reduce((sum, row) => sum + row.credit, 0);
    if (Math.abs(gross - numeric(summary.venta_bruta)) > 0.01 || Math.abs(credit - numeric(summary.notas_credito_monto)) > 0.01) throw new Error('Máquinas: componentes mensuales no concilian.');
    monthlyComponents = true;
  }
  // Aggregate endpoints return the whole range, not a page. Reconcile before consuming months.
  const sum = [...periods.values()].reduce((total, row) => total + numeric(row[source.amount]), 0);
  if (Math.abs(sum - numeric(summary[source.amount])) > Math.max(0.01, Math.abs(sum) * 1e-10)) throw new Error('Los períodos no concilian con el total de la fuente.');
  if (source.section !== 'parque.ventas') for (const field of [source.gross, source.credit]) {
    const componentSum = [...periods.values()].reduce((total, row) => total + numeric(row[field]), 0);
    if (Math.abs(componentSum - numeric(summary[field])) > Math.max(0.01, Math.abs(componentSum) * 1e-10)) throw new Error(`${source.label}: los períodos de ventas y NC no concilian.`);
  }
  return { summary, periods, sparse: source.section === 'parque.ventas', monthlyComponents };
}
function monthly(report: Report, key: string, field: string): number {
  const row = report.periods.get(key);
  // Machines groups the complete source without generate_series: an absent group has no movements.
  // This is only valid after reconciling every returned month against the server total.
  if (!row && report.sparse) return 0;
  if (!row) throw new Error(`La fuente no informa el mes ${key}.`);
  return metric(row[field]);
}
function base(id: StoryTopicId, sources: Source[], asOf: string): PanoramaStory {
  const topic = panoramaTopicDefinition(id);
  return { id, visitKey: `${id}:v3:${asOf.slice(0, 7)}`, title: topic?.title ?? 'Ventas de repuestos', question: topic?.question ?? '¿Cómo se componen las ventas y notas de crédito de repuestos?', status: 'ready', message: '', scope: sources.map(source => source.label).join(' + '), sections: sources.map(source => source.section), cutoff: null, periodLabel: `01/${asOf.slice(5, 7)}–${asOf.slice(8, 10)}/${asOf.slice(5, 7)}/${asOf.slice(0, 4)}`, primary: null, supporting: [], chart: null, breakdown: [], details: ['Fecha de factura. Ventas antes de NC y notas de crédito por separado.', 'La fecha de referencia limita el período; la fuente no informa su fecha real de actualización.'], source: sources.map(source => source.rpc).join(' + '), route: sources.length === 1 ? sources[0].route : '', navigationPeriod: { from: `${asOf.slice(0, 7)}-01`, to: asOf } };
}

export const loadSalesStories: StoryLoader = async (topics, granted, asOf) => {
  const billingIds = (['ventas_evolucion', 'ventas_facturacion', 'ventas_neto_anual', 'ventas_nc_impacto', 'ventas_repuestos', 'ventas_servicios', 'ventas_maquinas'] as const).filter(id => topics.includes(id));
  const billingSources = billingIds.length ? SOURCES.filter(source => granted.includes(source.section)) : [];
  const sourcesFor = (id: StoryTopicId) => id === 'ventas_repuestos' ? billingSources.filter(source => source.section === 'repuestos.ventas')
    : id === 'ventas_servicios' ? billingSources.filter(source => source.section === 'servicios.ventas')
    : id === 'ventas_maquinas' ? billingSources.filter(source => source.section === 'parque.ventas') : billingSources;
  const parts = SOURCES[0];
  const wantsComposition = topics.includes('repuestos_clientes') && granted.includes(parts.section);
  if (!billingSources.length && !wantsComposition) return [];
  let ranges: ReturnType<typeof salesRanges>;
  try { ranges = salesRanges(asOf); } catch (error) {
    return ([...billingIds.filter(id => sourcesFor(id).length).map(id => base(id, sourcesFor(id), asOf)), ...(wantsComposition ? [base('repuestos_clientes', [parts], asOf)] : [])]).map(story => ({ ...story, status: 'error', message: (error as Error).message }));
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
        const args = source.section === 'servicios.ventas' ? { p_desde: from, p_hasta: to } : { p_desde: from, p_hasta: to, p_sucursal: null, p_buscar: null, p_agrupacion: 'mes', ...source.extra };
        const result = await supabase.rpc(source.rpc as never, args as never);
        if (result.error) throw new Error(`${source.label}: ${result.error.message || 'no se pudo consultar la fuente.'}`);
        return parseReport(result.data, source);
      } finally { running--; waiters.shift()?.(); }
    })());
    return cache.get(key)!;
  };
  const load = async (id: StoryTopicId, sources: Source[]): Promise<PanoramaStory> => {
    const story = base(id, sources, asOf);
    try {
      const monthFrom = `${ranges.year}-${String(ranges.month).padStart(2, '0')}-01`;
      const monthLYFrom = `${ranges.year - 1}-${String(ranges.month).padStart(2, '0')}-01`;
      const loaded = await Promise.all(sources.map(async source => {
        const [current, previous, december] = await Promise.all([report(source, ranges.from, ranges.to), report(source, ranges.previousFrom, ranges.previousTo), ...(ranges.month === 1 ? [report(source, ranges.previousMonthFrom, ranges.previousMonthTo)] : [])]);
        return { source, current, previous, december };
      }));
      if (billingIds.some(billingId => billingId === id)) {
        const monthlyReports = await Promise.all(loaded.map(async ({ source, current, previous, december }) => {
          const period = (r: Report, key: string) => {
            const row = r.periods.get(key);
            if (!row && r.sparse && r.monthlyComponents) return { total: 0, venta_bruta: 0, notas_credito_monto: 0 };
            if (!row) throw new Error(`${source.label}: falta el período ${key}.`);
            return row;
          };
          // Machines exposes gross/NC only in its summary. The other two RPCs
          // already return complete, reconciled monthly components.
          return {
            source, current: current.summary, previous: previous.summary,
            month: source.section === 'parque.ventas' && !current.monthlyComponents ? (await report(source, monthFrom, ranges.to)).summary : period(current, asOf.slice(0, 7)),
            monthLY: source.section === 'parque.ventas' && !previous.monthlyComponents ? (await report(source, monthLYFrom, ranges.previousTo)).summary : period(previous, ranges.previousTo.slice(0, 7)),
            lastMonth: source.section === 'parque.ventas' && !(december ?? current).monthlyComponents ? (await report(source, ranges.previousMonthFrom, ranges.previousMonthTo)).summary : period(december ?? current, ranges.previousMonthFrom.slice(0, 7)),
          };
        }));
        const sum = (pick: (item: typeof monthlyReports[number]) => Row, field: 'gross' | 'credit' | 'amount') => monthlyReports.reduce((total, item) => total + numeric(pick(item)[item.source[field]]), 0);
        const gross = sum(item => item.month, 'gross'), grossLY = sum(item => item.monthLY, 'gross');
        const credits = monthlyReports.reduce((total, item) => total + numeric(item.month[item.source.credit]) * (item.source.creditSigned ? -1 : 1), 0);
        const creditsLY = monthlyReports.reduce((total, item) => total + numeric(item.monthLY[item.source.credit]) * (item.source.creditSigned ? -1 : 1), 0);
        const net = sum(item => item.month, 'amount'), netLY = sum(item => item.monthLY, 'amount');
        const ytdNet = sum(item => item.current, 'amount'), ytdNetLY = sum(item => item.previous, 'amount');
        const ytdGross = sum(item => item.current, 'gross'), ytdGrossLY = sum(item => item.previous, 'gross');
        const ytdCredits = ytdGross - ytdNet;
        if (Math.abs(gross - credits - net) > Math.max(0.01, Math.abs(net) * 1e-10)) throw new Error('Las ventas y NC consolidadas no concilian con el neto.');
        const unit = 'USD' as const;
        if (id === 'ventas_evolucion' || id === 'ventas_repuestos' || id === 'ventas_servicios' || id === 'ventas_maquinas') {
          story.visitKey = `${id}:brutas-v1:${asOf.slice(0, 7)}`;
          story.primary = { label: 'Ventas antes de NC del mes', value: gross, unit, comparison: { value: grossLY, label: `Mismo tramo de ${ranges.year - 1}` } };
          story.supporting = [
            { label: 'Ventas acumuladas del año', value: ytdGross, unit, comparison: { value: ytdGrossLY, label: `Mismo corte de ${ranges.year - 1}` } },
            { label: 'Variación acumulada', value: salesChange(ytdGross, ytdGrossLY), unit: 'percent', note: ytdGrossLY === 0 ? 'Sin base comparable.' : undefined },
          ];
          const fullMonths = loaded.every(({ current, previous }) => current.monthlyComponents && previous.monthlyComponents);
          story.chart = fullMonths ? { kind: 'trend', title: 'Ventas antes de NC por mes', unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1), rows: Array.from({ length: ranges.month }, (_, index) => {
            const month = String(index + 1).padStart(2, '0');
            return { label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][index], value: loaded.reduce((total, item) => total + (item.current.periods.get(`${ranges.year}-${month}`)?.[item.source.gross] as number ?? 0), 0), previous: loaded.reduce((total, item) => total + (item.previous.periods.get(`${ranges.year - 1}-${month}`)?.[item.source.gross] as number ?? 0), 0) };
          }) } : { kind: 'bars', title: 'Ventas por área autorizada', unit, rows: monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.month[item.source.gross]), previous: numeric(item.monthLY[item.source.gross]) })), currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1) };
          story.breakdown = monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.month[item.source.gross]), unit, route: item.source.route }));
          story.message = grossLY > 0 ? `Las ventas antes de NC ${gross >= grossLY ? 'subieron' : 'bajaron'} ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(Math.abs(salesChange(gross, grossLY)!))}% frente al mismo tramo del año anterior.` : 'No hay base comparable para calcular la variación mensual de ventas.';
          story.details.push(`Ventas positivas de facturas entre ${monthFrom} y ${ranges.to}; comparación con ${monthLYFrom} a ${ranges.previousTo}. Las NC se analizan por separado en Facturación neta.`, 'El acumulado compara fechas equivalentes de ambos años.');
          return story;
        }
        if (id === 'ventas_neto_anual') {
          story.navigationPeriod = { from: ranges.from, to: asOf };
          story.visitKey = `${id}:v1:${asOf.slice(0, 7)}`;
          story.primary = { label: 'Neto acumulado del año', value: ytdNet, unit, comparison: { value: ytdNetLY, label: `Mismo corte de ${ranges.year - 1}` } };
          story.supporting = [{ label: 'Ventas antes de NC acumuladas', value: ytdGross, unit }, { label: 'NC acumuladas', value: -ytdCredits, unit }];
          story.chart = { kind: 'trend', title: 'Facturación neta mensual', unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1), rows: Array.from({ length: ranges.month }, (_, index) => {
            const month = String(index + 1).padStart(2, '0');
            return { label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][index], value: loaded.reduce((total, item) => total + monthly(item.current, `${ranges.year}-${month}`, item.source.amount), 0), previous: loaded.reduce((total, item) => total + monthly(item.previous, `${ranges.year - 1}-${month}`, item.source.amount), 0) };
          }) };
          story.breakdown = monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.current[item.source.amount]), unit, route: item.source.route }));
          story.message = ytdNetLY === 0 ? 'Sin base anual comparable.' : `El neto acumulado ${ytdNet >= ytdNetLY ? 'supera' : 'queda por debajo de'} el mismo corte del año anterior.`;
          return story;
        }
        if (id === 'ventas_nc_impacto') {
          story.visitKey = `${id}:v1:${asOf.slice(0, 7)}`;
          story.primary = { label: 'NC del mes', value: credits, unit, comparison: { value: creditsLY, label: `Mismo tramo de ${ranges.year - 1}` } };
          story.supporting = [{ label: 'Participación sobre ventas', value: gross > 0 ? credits / gross * 100 : null, unit: 'percent' }, { label: 'Ventas antes de NC', value: gross, unit }, { label: 'Neto del mes', value: net, unit }];
          story.chart = { kind: 'bars', title: 'NC por área autorizada', unit, rows: monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.month[item.source.credit]) * (item.source.creditSigned ? -1 : 1) })) };
          story.breakdown = monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.month[item.source.credit]) * (item.source.creditSigned ? -1 : 1), unit, route: item.source.route }));
          story.message = gross > 0 ? `Las NC equivalen al ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(credits / gross * 100)}% de las ventas antes de NC del mes.` : 'Sin ventas positivas para expresar las NC como porcentaje.';
          return story;
        }
        story.visitKey = `${id}:neto-v3:${asOf.slice(0, 7)}`;
        story.primary = { label: 'Facturación neta del mes', value: net, unit, comparison: { value: netLY, label: `Mismo tramo de ${ranges.year - 1}` } };
        story.supporting = [
          { label: 'Ventas antes de NC del mes', value: gross, unit, comparison: { value: grossLY, label: `Mismo tramo de ${ranges.year - 1}` } },
          { label: 'Notas de crédito del mes', value: -credits, unit },
          { label: 'Facturación neta acumulada', value: ytdNet, unit, comparison: { value: ytdNetLY, label: `Mismo tramo de ${ranges.year - 1}` } },
          { label: 'Ventas acumuladas antes de NC', value: ytdGross, unit, comparison: { value: ytdGrossLY, label: `Mismo tramo de ${ranges.year - 1}` } },
          { label: 'NC acumuladas del año', value: -ytdCredits, unit },
          { label: 'Mes anterior completo, antes de NC', value: sum(item => item.lastMonth, 'gross'), unit },
        ];
        story.chart = { kind: 'bars', title: 'Neto por área autorizada', rows: monthlyReports.map(item => ({ label: item.source.label, value: numeric(item.month[item.source.amount]), previous: numeric(item.monthLY[item.source.amount]) })), unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1) };
        story.detailChart = { kind: 'trend', title: 'Evolución mensual de la facturación neta', unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1), rows: Array.from({ length: ranges.month }, (_, index) => {
          const month = String(index + 1).padStart(2, '0');
          return { label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][index],
            value: loaded.reduce((total, item) => total + monthly(item.current, `${ranges.year}-${month}`, item.source.amount), 0),
            previous: loaded.reduce((total, item) => total + monthly(item.previous, `${ranges.year - 1}-${month}`, item.source.amount), 0) };
        }) };
        story.breakdown = monthlyReports.map(item => { const areaGross = numeric(item.month[item.source.gross]); const areaNet = numeric(item.month[item.source.amount]); return { label: item.source.label, value: areaNet, unit, route: item.source.route, billing: { sales: areaGross, credits: areaGross - areaNet } }; });
        story.breakdown = [
          ...story.breakdown.map(row => ({ ...row, group: 'Áreas del mes' })),
          ...story.detailChart.rows.map(row => ({ label: row.label, value: row.value, previous: row.previous, unit, group: 'Mes a mes' })),
        ];
        story.message = `Facturación neta del mes: $ ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(net)}, después de $ ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(credits)} en notas de crédito.`;
        story.attention = false;
        story.details.push('Cada área usa su mismo contrato de movimientos en USD. Ventas antes de NC − importe de NC = neto; el signo de NC se normaliza exactamente una vez.', `Comparación del ${monthFrom} al ${ranges.to} con ${monthLYFrom} al ${ranges.previousTo}.`, 'El acumulado neto usa el mismo corte de fechas de ambos años. El mes anterior completo es solo contexto, no un tramo equivalente.');
        return story;
      }
      const composition = id === 'repuestos_clientes';
      const field = (source: Source) => composition ? 'ventas' : source.amount;
      if (composition) {
        for (const { current, previous, december } of loaded) for (const report of [current, previous, december].filter((item): item is Report => Boolean(item))) {
          const components = [report.summary, ...report.periods.values()];
          for (const row of components) {
            const gross = numeric(row.ventas), credit = numeric(row.notas_credito), net = numeric(row.facturado);
            if (Math.abs(gross + credit - net) > Math.max(0.01, Math.abs(net) * 1e-10)) throw new Error('Ventas, notas de crédito y neto de repuestos no concilian.');
          }
          for (const key of ['ventas', 'notas_credito'] as const) {
            const sum = [...report.periods.values()].reduce((total, row) => total + numeric(row[key]), 0);
            if (Math.abs(sum - numeric(report.summary[key])) > Math.max(0.01, Math.abs(sum) * 1e-10)) throw new Error('Los períodos de ventas de repuestos no concilian.');
          }
        }
      }
      const currentMonth = loaded.map(({ source, current }) => monthly(current, asOf.slice(0, 7), field(source)));
      const priorMonthLY = loaded.map(({ source, previous }) => monthly(previous, ranges.previousTo.slice(0, 7), field(source)));
      const mtd = currentMonth.reduce((a, b) => a + b, 0), mtdLY = priorMonthLY.reduce((a, b) => a + b, 0);
      const ytd = loaded.reduce((sum, row) => sum + metric(row.current.summary[field(row.source)]), 0);
      const ytdLY = loaded.reduce((sum, row) => sum + metric(row.previous.summary[field(row.source)]), 0);
      const lastMonth = loaded.reduce((sum, row) => sum + monthly(row.december ?? row.current, ranges.previousMonthFrom.slice(0, 7), field(row.source)), 0);
      const unit = 'USD' as const;
      story.primary = { label: composition ? 'Ventas antes de NC' : 'Facturación neta del mes', value: mtd, unit, comparison: { value: mtdLY, label: `Mismo tramo de ${ranges.year - 1}` } };
      story.supporting = [
        { label: 'Variación interanual del mes', value: salesChange(mtd, mtdLY), unit: 'percent', note: mtdLY === 0 ? 'Sin base: el período anterior es cero.' : undefined },
        { label: 'Mes anterior completo', value: lastMonth, unit, note: `${ranges.previousMonthFrom} al ${ranges.previousMonthTo}; contexto, no comparación de tramos iguales.` },
        { label: composition ? 'Ventas acumuladas' : 'Acumulado del año', value: ytd, unit, comparison: { value: ytdLY, label: `Mismo tramo de ${ranges.year - 1}` } },
      ];
      const annualChange = salesChange(ytd, ytdLY);
      story.supporting.push({ label: 'Variación interanual acumulada', value: annualChange, unit: 'percent', note: ytdLY === 0 ? 'Sin base comparable.' : undefined });
      const rows = Array.from({ length: ranges.month }, (_, index) => {
        const month = String(index + 1).padStart(2, '0');
        return { label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][index], value: loaded.reduce((sum, row) => sum + monthly(row.current, `${ranges.year}-${month}`, field(row.source)), 0), previous: loaded.reduce((sum, row) => sum + monthly(row.previous, `${ranges.year - 1}-${month}`, field(row.source)), 0) };
      });
      const partialMonth = Number(asOf.slice(8)) < new Date(Date.UTC(ranges.year, ranges.month, 0)).getUTCDate();
      if (partialMonth && rows.length) rows[rows.length - 1].label += '*';
      story.chart = { kind: 'trend', title: (composition ? 'Ventas de repuestos por mes' : 'Facturación neta por mes') + (partialMonth ? ' · *mes parcial' : ''), rows, unit, currentLabel: String(ranges.year), previousLabel: String(ranges.year - 1) };
      story.breakdown = composition ? [] : loaded.map(({ source }, index) => ({ label: source.label, value: currentMonth[index], unit: 'USD', route: source.route }));
      if (composition) {
        const report = loaded[0].current;
        const nc = monthly(report, asOf.slice(0, 7), 'notas_credito');
        const net = monthly(report, asOf.slice(0, 7), 'facturado');
        story.supporting.unshift({ label: 'Notas de crédito del mes', value: nc, unit }, { label: 'Facturación neta de repuestos', value: net, unit });
        story.breakdown = [{ label: 'Ventas antes de NC', value: mtd, unit, route: parts.route }, { label: 'Notas de crédito', value: nc, unit, route: parts.route }, { label: 'Neto', value: net, unit, route: parts.route }];
      }
      const monthlyChange = salesChange(mtd, mtdLY);
      const pct = (value: number) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(Math.abs(value)) + '%';
      const movement = (value: number) => value === 0 ? 'sin variación' : `${pct(value)} ${value > 0 ? 'por encima' : 'por debajo'}`;
      story.message = composition
        ? `Ventas antes de notas de crédito y neto de repuestos para el tramo; ambos componentes están conciliados con la fuente.`
        : monthlyChange === null ? 'El mismo tramo del año anterior no tiene importe para calcular una variación porcentual.'
        : `El mes está ${movement(monthlyChange)} del mismo tramo de ${ranges.year - 1}${annualChange === null ? '.' : `; el acumulado, ${movement(annualChange)}.`}`;
      story.attention = false;
      story.details.push('Importes en dólares según el contrato de las vistas de Ventas existentes; no se acredita aquí la moneda individual ni una auditoría productiva.', `Comparación: ${ranges.from} al ${ranges.to} frente a ${ranges.previousFrom} al ${ranges.previousTo}. Último mes del gráfico recortado al mismo día.`, 'Sin ajustes por inflación, tipo de cambio ni días hábiles.');
      if (composition) story.details.push('Ventas antes de notas de crédito + notas de crédito firmadas = facturación neta. No se confunde cantidad de identidades documentales con compradores efectivos.', 'La comparación interanual de esta tarjeta corresponde a ventas antes de NC; el neto se muestra por separado.');
      return story;
    } catch (error) {
      return { ...story, status: 'error', message: error instanceof Error ? error.message : 'No se pudo consultar la fuente.', primary: null, supporting: [], chart: null, breakdown: [], attention: true };
    }
  };
  return Promise.all([...billingIds.filter(id => sourcesFor(id).length).map(id => load(id, sourcesFor(id))), ...(wantsComposition ? [load('repuestos_clientes', [parts])] : [])]);
};
