// Customer identity SQL remains disabled until population/date/permission semantics are validated.
import { unifiedCoverageEnabled } from '../unifiedCoverage';
import { loadUnifiedCoverageStory } from './unifiedCoverageStory';
import { seriesChart } from './seriesData';
import { validateCustomerCohorts } from './sourceExpansion';
import type { SeriesPoint } from './panoramaStoryTypes';
import { formatRange, formatMonth, monthWindows } from './panoramaDates';
import { parseCoverageRubros } from './coverageRubros';
import { parseCurrentParkCoverageSeries } from './coverageSeries';
import { supabase } from '@/integrations/supabase/client';
import { loadOperationsData } from '@/features/service-orders/data';
import { loadWorkLog } from '@/features/service-orders/workLog';
import { workedProductivity } from '@/features/service-orders/workedProductivity';
import { NEW_SYSTEM_START } from '@/lib/imports/cutoff';
import { billingEfficiency, billingKey, loadOrderBilling, type OrderBilling } from '@/features/service-orders/billing';
import { canonicalSituacion, canonicalTipoTiempo, type OperationsFilters } from '@/features/service-orders/useOperationsModel';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryLoader, StoryPeriod, StoryTopicId } from './panoramaStoryTypes';

type CustomerRow = {
  compradores_base: number; compradores_retenidos: number;
  propietarios_elegibles: number; propietarios_con_compra_actual: number;
};
type PlanningRow = { id: string; fecha: string; estado: string };
const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function periodRanges(asOf: string, period: StoryPeriod = 'month') {
  if (!day(asOf)) throw new Error('Fecha de análisis inválida.');
  const [year, month, date] = asOf.split('-').map(Number);
  if (period === 'ytd') {
    const priorDay = Math.min(date, new Date(Date.UTC(year - 1, month, 0)).getUTCDate());
    return { from: `${year}-01-01`, previousFrom: `${year - 1}-01-01`, previousTo: `${year - 1}-${String(month).padStart(2, '0')}-${String(priorDay).padStart(2, '0')}` };
  }
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const previousDay = Math.min(date, new Date(Date.UTC(year, month - 1, 0)).getUTCDate());
  return { from: `${asOf.slice(0, 7)}-01`, previousFrom: previous.toISOString().slice(0, 7) + '-01',
    previousTo: `${previous.toISOString().slice(0, 7)}-${String(previousDay).padStart(2, '0')}` };
}

function base(id: StoryTopicId, section: SectionKey, route: string, source: string, asOf: string): PanoramaStory {
  return { id, title: '', question: '', status: 'ready', message: '', scope: '', sections: [section],
    cutoff: asOf, periodLabel: formatRange({ from: periodRanges(asOf).from, to: asOf }), time: { window: { from: periodRanges(asOf).from, to: asOf } }, primary: null, supporting: [], chart: null, breakdown: [], details: [], source, route };
}

export function planningStory(rows: readonly PlanningRow[], asOf: string, period: StoryPeriod = 'month'): PanoramaStory {
  const from = periodRanges(asOf, period).from;
  const unique = new Map<string, PlanningRow>();
  for (const row of rows) {
    if (!row.id || !day(row.fecha) || !['Completado', 'Pendiente', 'Iniciado', 'Cancelada'].includes(row.estado))
      throw new Error('La agenda devolvió jornadas incompletas.');
    const prior = unique.get(row.id);
    if (prior && (prior.fecha !== row.fecha || prior.estado !== row.estado)) throw new Error('La agenda duplicó una jornada con estados distintos.');
    unique.set(row.id, row);
  }
  const eligible = [...unique.values()].filter(row => row.fecha >= from && row.fecha <= asOf);
  const count = (status: string) => eligible.filter(row => row.estado === status).length;
  const completed = count('Completado');
  const story = base('agenda_cumplimiento', 'servicios.planificador', `/?desde=${from}&hasta=${asOf}`, 'servicio_jornadas', asOf);
  story.periodMode = period; story.periodOptions = ['month', 'ytd']; story.visitKey = `agenda_cumplimiento:${period}:${asOf}`;
  story.time = { window: { from, to: asOf } };
  story.periodLabel = formatRange(story.time.window!);
  story.status = eligible.length ? 'ready' : 'empty';
  story.primary = { label: 'Agenda cumplida', value: eligible.length ? completed / eligible.length * 100 : null, unit: 'percent' };
  story.supporting = [{ label: 'Completadas', value: completed, unit: 'count' }, { label: 'Evaluables', value: eligible.length, unit: 'count' }];
  const groups = new Map<string, { label: string; done: number; total: number }>();
  for (const row of eligible) {
    const start = new Date(`${row.fecha}T00:00:00Z`);
    if (period === 'month') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    else start.setUTCDate(1);
    const key = start.toISOString().slice(0, 10);
    const weekEnd = new Date(start);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const actualStart = key < from ? from : key;
    const actualEnd = weekEnd.toISOString().slice(0, 10) > asOf ? asOf : weekEnd.toISOString().slice(0, 10);
    const label = period === 'month' ? formatRange({ from: actualStart, to: actualEnd })
      : formatMonth(key);
    const group = groups.get(key) ?? { label, done: 0, total: 0 };
    group.total++;
    if (row.estado === 'Completado') group.done++;
    groups.set(key, group);
  }
  story.chart = { kind: 'bars', title: period === 'month' ? 'Cumplimiento semanal' : 'Cumplimiento mensual', unit: 'percent',
    rows: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({ label: group.label, value: group.done / group.total * 100 })) };
  story.message = eligible.length ? `${completed} de ${eligible.length} jornadas evaluables están completadas.` : 'No hay jornadas evaluables en este período.';
  story.details = ['Las fechas futuras no entran en el denominador. Una jornada completada no equivale a una OS cerrada.'];
  return story;
}

export function customerStories(row: CustomerRow, asOf: string, period: StoryPeriod = 'month'): PanoramaStory[] {
  if (![row.compradores_base, row.compradores_retenidos, row.propietarios_elegibles, row.propietarios_con_compra_actual].every(integer)
    || row.compradores_retenidos > row.compradores_base || row.propietarios_con_compra_actual > row.propietarios_elegibles)
    throw new Error('La cohorte de clientes no concilia.');
  const customerWindow = periodRanges(asOf, period);
  const customerRoute = `/parque-clientes?desde=${customerWindow.from}&hasta=${asOf}`;
  const retention = base('clientes_retencion', 'parque.maquinas', customerRoute, 'gerencial_clientes_resumen_v1', asOf);
  retention.periodMode = period; retention.periodOptions = ['month', 'ytd']; retention.visitKey = `clientes_retencion:${period}:${asOf}`;
  const retentionRanges = periodRanges(asOf, period);
  retention.time = { window: { from: retentionRanges.from, to: asOf }, comparison: { from: retentionRanges.previousFrom, to: retentionRanges.previousTo } };
  retention.periodLabel = 'Base ' + formatRange(retention.time.comparison!) + ' · Recompra ' + formatRange(retention.time.window!);
  retention.status = row.compradores_base ? 'ready' : 'empty';
  retention.primary = { label: 'Retención', value: row.compradores_base ? row.compradores_retenidos / row.compradores_base * 100 : null, unit: 'percent' };
  retention.supporting = [{ label: 'Retenidos', value: row.compradores_retenidos, unit: 'count' }, { label: 'Cohorte base', value: row.compradores_base, unit: 'count' }];
  retention.chart = { kind: 'bars', title: 'Clientes de la cohorte', unit: 'count', rows: [
    { label: 'Volvieron a comprar', value: row.compradores_retenidos },
    { label: 'Sin recompra en la ventana', value: row.compradores_base - row.compradores_retenidos },
  ] };
  retention.message = row.compradores_base ? `${row.compradores_retenidos} de ${row.compradores_base} compradores de la cohorte volvieron a comprar.` : 'No hay cohorte base medible.';
  const coverage = base('clientes_cobertura_posventa', 'parque.maquinas', customerRoute, 'gerencial_clientes_resumen_v1', asOf);
  coverage.periodMode = period; coverage.periodOptions = ['month', 'ytd']; coverage.visitKey = `clientes_cobertura_posventa:${period}:${asOf}`;
  coverage.time = { window: { from: customerWindow.from, to: asOf } };
  coverage.periodLabel = formatRange(coverage.time.window!);
  coverage.status = row.propietarios_elegibles ? 'ready' : 'empty';
  coverage.primary = { label: 'Cobertura posventa', value: row.propietarios_elegibles ? row.propietarios_con_compra_actual / row.propietarios_elegibles * 100 : null, unit: 'percent' };
  coverage.supporting = [{ label: 'Con compra', value: row.propietarios_con_compra_actual, unit: 'count' }, { label: 'Propietarios', value: row.propietarios_elegibles, unit: 'count' }];
  // This aggregate reports a deduplicated union, not separate Services and
  // Parts coverage over the same owner population.
  coverage.chart = null;
  coverage.message = row.propietarios_elegibles ? `${row.propietarios_con_compra_actual} de ${row.propietarios_elegibles} propietarios compraron servicios o repuestos.` : 'No hay propietarios elegibles medibles.';
  return [retention, coverage];
}

async function loadPlanning(asOf: string, period: StoryPeriod) {
  const from = periodRanges(asOf, period).from;
  const rows: PlanningRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('servicio_jornadas').select('id,fecha,estado')
      .gte('fecha', from).lte('fecha', asOf).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return planningStory(rows, asOf, period);
}

async function loadCustomers(asOf: string, period: StoryPeriod, withRubros = false) {
  const range = periodRanges(asOf, period);
  const args = {
    p_desde: range.from, p_hasta: asOf, p_prev_desde: range.previousFrom,
    p_prev_hasta: range.previousTo, p_sucursal: 'TODAS',
  };
  const [summary, cohort, coverageSeries, rubros] = await Promise.all([
    supabase.rpc('gerencial_clientes_resumen_v1', args),
    Promise.resolve(supabase.rpc('campi_clientes_cohortes_v1' as never, args as never))
      .catch(() => ({ data: null, error: true })),
    Promise.resolve(supabase.rpc('campi_cobertura_parque_actual_serie_v1' as never,
      { p_hasta: asOf, p_modo: period } as never)).catch(() => ({ data: null, error: true })),
    withRubros && import.meta.env.VITE_CAMPI_COVERAGE_RUBROS_ENABLED === 'true'
      ? Promise.resolve(supabase.rpc('campi_cobertura_rubros_v1' as never, {p_hasta:asOf,p_modo:period} as never)).catch(()=>({data:null,error:true}))
      : Promise.resolve({data:null,error:true}),
  ]);
  const { data, error } = summary;
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) throw new Error('La cohorte de clientes está incompleta.');
  const stories = customerStories(data[0], asOf, period);
  let identities: {owners:string[];buyers:string[]} | null = null;
  if (!cohort.error && cohort.data) {
    try {
      const verified = validateCustomerCohorts(cohort.data, {
        desde: range.from, hasta: asOf, prev_desde: range.previousFrom, prev_hasta: range.previousTo,
        compradores_base: data[0].compradores_base, compradores_retenidos: data[0].compradores_retenidos,
        propietarios_elegibles: data[0].propietarios_elegibles,
        propietarios_con_compra_actual: data[0].propietarios_con_compra_actual,
      });
      identities={owners:verified.propietarios,buyers:verified.propietarios_con_compra};
      stories.forEach(story => { story.source = 'gerencial_clientes_resumen_v1 + campi_clientes_cohortes_v1'; });
      stories[1].chart = { kind: 'bars', title: 'Cobertura del parque', unit: 'count', rows: [
        { label: 'Con compra', value: verified.propietarios_con_compra.length },
        { label: 'Sin compra en la ventana', value: verified.propietarios.length - verified.propietarios_con_compra.length },
      ] };
    } catch {
      // The established summary remains visible if the optional identity source drifts.
    }
  }
  if (!coverageSeries.error && coverageSeries.data) {
    const validated = parseCurrentParkCoverageSeries(coverageSeries.data, asOf, period, {
      numerator: data[0].propietarios_con_compra_actual,
      denominator: data[0].propietarios_elegibles,
    });
    if (validated) {
      stories[1].series = validated.points;
      stories[1].chart = { kind: 'trend', unit: 'percent',
        title: period === 'ytd' ? 'Cobertura acumulada del parque actual' : 'Compras mensuales del parque actual',
        rows: validated.rows };
      stories[1].source += ' + campi_cobertura_parque_actual_serie_v1';
      stories[1].details.push('La serie usa los propietarios elegibles del parque actual en todas las barras; no representa el parque histórico de cada mes.');
    }
  }
  if (identities && stories[1].series && !rubros.error) {
    const validated=parseCoverageRubros(rubros.data,asOf,period,{...identities,series:stories[1].series});
    if(validated)stories[1].coverageRubros=validated;
  }
  return stories;
}

export function measuredHoursPercentage(worked: number, available: number): number | null {
  if (![worked, available].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Bases de horas inválidas.');
  return available > 0 ? worked / available * 100 : null;
}

async function loadProductivity(asOf: string, period: StoryPeriod) {
  const from = [periodRanges(asOf, period).from, NEW_SYSTEM_START].sort().at(-1)!;
  const seriesFrom = [monthWindows(asOf, 6)[0].from, NEW_SYSTEM_START].sort().at(-1)!;
  const story = base('servicios_productividad', 'servicios.ordenes', `/servicios/ordenes?tab=productividad&desde=${from}&hasta=${asOf}`, 'service_orders_work_log_v1 + capacidad de Servicios', asOf);
  story.periodMode = period; story.periodOptions = ['month', 'ytd'];
  story.visitKey = `servicios_productividad:v2:${period}:${asOf}`;
  story.time = { window: { from, to: asOf } };
  story.periodLabel = formatRange(story.time.window);
  if (from > asOf) { story.status = 'empty'; story.primary = { label: 'Productividad', value: null, unit: 'percent' }; story.message = 'No hay período del sistema nuevo hasta esta fecha.'; return story; }
  const signal = new AbortController().signal;
  const [snapshot, logs] = await Promise.all([
    loadOperationsData(supabase, seriesFrom, asOf, signal),
    loadWorkLog(supabase, seriesFrom, asOf, null, signal),
  ]);
  const filters: OperationsFilters = { dateFrom: from, dateTo: asOf, periodMode: 'mes', q: '',
    fSucursales: [], fMarcas: [], fTiposTiempo: [], fEstadosTrabajo: [], fTécnicos: [],
    fResponsablesOS: [], fEstadosOS: [], fOSRubros: [] };
  const result = workedProductivity(logs, snapshot.data, filters);
  const available = result.capacidad.horasDisponibles;
  story.status = available > 0 ? 'ready' : 'empty';
  story.primary = { label: 'Productividad', value: measuredHoursPercentage(result.horasPersona, available), unit: 'percent', note: period === 'ytd' ? `Desde ${NEW_SYSTEM_START}` : undefined };
  story.supporting = [{ label: 'Horas trabajadas', value: result.horasPersona, unit: 'count' }, { label: 'Horas disponibles', value: available, unit: 'count' }];
  const historical = seriesFrom === from ? result : workedProductivity(logs, snapshot.data, { ...filters, dateFrom: seriesFrom });
  story.series = historical.evolucion.map(row => ({ from: row.dateFrom, to: row.dateTo,
    value: measuredHoursPercentage(row.horasPersona, row.horasDisponibles), numerator: row.horasPersona,
    denominator: row.horasDisponibles, ids: [], cutoff: asOf, complete: row.horasDisponibles > 0 && !row.incomplete }));
  story.chart = seriesChart(story.series, 'Productividad por mes · capacidad configurada', 'percent');
  story.message = available > 0 ? `${Math.round(result.horasPersona)} de ${Math.round(available)} horas-persona disponibles trabajadas.` : 'No hay capacidad positiva comparable para calcular productividad.';
  story.details = result.issues.length ? [`${result.issues.length} registros requieren revisión y no se cuentan como horas trabajadas.`] : [];
  return story;
}

async function loadEfficiency(asOf: string, period: StoryPeriod, historical = false) {
  const from = [periodRanges(asOf, period).from, NEW_SYSTEM_START].sort().at(-1)!;
  const firstWindow = monthWindows(asOf, period === 'ytd' ? Number(asOf.slice(5, 7)) : 6)[0].from;
  const seriesFrom = historical ? [firstWindow, NEW_SYSTEM_START].sort().at(-1)! : from;
  if (from > asOf) { const empty = base('servicios_eficiencia', 'servicios.ordenes', '', 'service_orders_billing_v2', asOf);
    empty.status = 'empty'; empty.primary = { label: 'Eficiencia', value: null, unit: 'percent' }; return empty; }
  const rows: { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null;
    fecha_emision_factura: string | null; situacion_os: string | null; servicios_cantidad: number | null }[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const { data, error, count } = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,fecha_abierta_os,fecha_cierre_os,fecha_emision_factura,situacion_os,servicios_cantidad', { count: 'exact' })
      .gte('fecha_cierre_os', seriesFrom).lte('fecha_cierre_os', `${asOf}T23:59:59.999Z`).order('os_numero').range(offset, offset + 499);
    if (error) throw error;
    if (!Array.isArray(data) || count === null || (expected !== null && expected !== count)) throw new Error('Universo de cierres incompleto o cambiante.');
    expected = count; rows.push(...data);
    if (rows.length === expected) break;
    if (data.length !== 500 || rows.length > expected) throw new Error('Paginación de cierres incompleta.');
  }
  const candidates = rows.filter(row => canonicalSituacion(row.situacion_os) === 'Cerrada')
    .map(row => ({ os: row.os_numero, estadoOS: 'Cerrada', horas: row.servicios_cantidad ?? 0,
      fechaApertura: row.fecha_abierta_os?.slice(0, 10) ?? null,
      fechaCierre: row.fecha_cierre_os?.slice(0, 10) ?? null,
      fechaFacturacion: row.fecha_emision_factura?.slice(0, 10) ?? null }));
  const signal = new AbortController().signal;
  const bills = await loadOrderBilling(supabase, candidates.map(row => row.os), asOf, signal);
  const joined = candidates.map(row => ({ ...row, billing: bills[billingKey(row.os)] ?? null }));
  if (new Set(joined.map(row => billingKey(row.os))).size !== joined.length) throw new Error('Identidades de OS duplicadas.');
  const result = billingEfficiency(joined.filter(row => row.fechaCierre! >= from));
  const story = base('servicios_eficiencia', 'servicios.ordenes', `/servicios/ordenes?tab=productividad&desde=${from}&hasta=${asOf}`, 'service_orders_billing_v2 + ordenes_servicio_importadas', asOf);
  story.periodMode = period; story.periodOptions = ['month', 'ytd']; story.visitKey = `servicios_eficiencia:v2:${period}:${asOf}`;
  story.time = { window: { from, to: asOf } }; story.periodLabel = formatRange(story.time.window);
  story.status = result.percentage !== null ? 'ready' : 'empty';
  story.primary = { label: 'Eficiencia', value: result.percentage, unit: 'percent', note: period === 'ytd' ? `Desde ${NEW_SYSTEM_START}` : undefined };
  story.supporting = [{ label: 'Horas facturadas', value: result.billedHours, unit: 'count' },
    { label: 'Horas trabajadas', value: result.workedHours, unit: 'count' },
    { label: 'OS conciliadas', value: result.orders, unit: 'count' }];
  story.series = monthWindows(asOf, period === 'ytd' ? Number(asOf.slice(5, 7)) : 6).filter(window => window.from >= NEW_SYSTEM_START).map(window => {
    const cohort = joined.filter(row => row.fechaCierre! >= window.from && row.fechaCierre! <= window.to);
    const metric = billingEfficiency(cohort);
    return { ...window, value: metric.percentage, numerator: metric.billedHours, denominator: metric.workedHours, ids: cohort.map(row => billingKey(row.os)), cutoff: asOf, complete: metric.incomplete === 0 };
  });
  story.chart = seriesChart(story.series, 'Eficiencia por mes de cierre · corte documental común', 'percent');
  story.message = result.percentage !== null ? `${result.orders} OS cerradas con horas facturadas y trabajadas conciliadas.`
    : result.incomplete ? `${result.incomplete} OS cerradas tienen horas o tarifas incompletas; la eficiencia no es medible.`
      : 'No hay OS cerradas conciliadas en este período.';
  story.details = result.incomplete ? [`${result.incomplete} OS incompletas excluyen la tasa de esta cohorte.`] : [];
  return story;
}

type ClosedOrderRow = { os_numero: string; fecha_cierre_os: string | null; situacion_os: string | null; tipo_tiempo: string | null };
export function billedOrdersStory(rows: readonly ClosedOrderRow[], bills: Readonly<Record<string, OrderBilling>>, asOf: string, period: StoryPeriod = 'month', window?: { from: string; to: string }): PanoramaStory {
  const from = window?.from ?? periodRanges(asOf, period).from;
  const to = window?.to ?? asOf;
  const closed = new Map<string, ClosedOrderRow>();
  for (const row of rows) {
    if (canonicalSituacion(row.situacion_os) !== 'Cerrada') continue;
    const key = billingKey(row.os_numero);
    const closedDay = row.fecha_cierre_os?.slice(0, 10);
    if (!key || !closedDay || !day(closedDay)) throw new Error('La cohorte de OS cerradas no concilia.');
    if (closedDay < from || closedDay > to) continue;
    if (closed.has(key)) throw new Error('La cohorte de OS cerradas no concilia.');
    closed.set(key, row);
  }
  let billed = 0, clientType = 0, otherType = 0;
  for (const [key, row] of closed) {
    if (canonicalTipoTiempo(row.tipo_tiempo) !== 'Cliente') { otherType++; continue; }
    clientType++;
    const bill = bills[key];
    if (!bill || bill.ambiguous) throw new Error('No se pudo conciliar la factura de una OS cliente.');
    if (bill.matched && bill.date && bill.date <= asOf && bill.total !== null && bill.total > 0 && bill.documents.length > 0) billed++;
  }
  const story = base('servicios_os_facturadas', 'servicios.ordenes', `/servicios/ordenes?cohorte=resolution&estado=cerrada&desde=${from}&hasta=${asOf}`, 'ordenes_servicio_importadas + service_orders_billing_v2', asOf);
  story.sections = ['servicios.ordenes', 'servicios.ventas'];
  story.periodMode = period; story.periodOptions = ['month', 'ytd']; story.visitKey = `servicios_os_facturadas:${period}:${asOf}`;
  story.time = { window: { from, to: asOf } };
  story.periodLabel = formatRange(story.time.window!);
  story.status = closed.size ? 'ready' : 'empty';
  story.primary = { label: 'OS facturadas a cliente', value: closed.size ? billed / closed.size * 100 : null, unit: 'percent' };
  story.supporting = [{ label: 'Facturadas a cliente', value: billed, unit: 'count' }, { label: 'OS cerradas', value: closed.size, unit: 'count' },
    { label: 'Tipo Cliente', value: clientType, unit: 'count' }, { label: 'Otros tipos', value: otherType, unit: 'count' }];
  // The source does not return monthly closing cohorts. Keep the validated
  // aggregate without inventing a series or a discarded commercial category.
  story.chart = null;
  story.message = closed.size ? `${billed} de ${closed.size} OS cerradas tienen una factura positiva de cliente vinculada.` : 'No hay OS cerradas en este período.';
  return story;
}

export function billedSeries(rows: readonly ClosedOrderRow[], bills: Readonly<Record<string, OrderBilling>>, asOf: string, period: StoryPeriod = 'month'): SeriesPoint[] {
  return monthWindows(asOf, period === 'ytd' ? Number(asOf.slice(5,7)) : 6).map(window => {
    const cohort = rows.filter(row => canonicalSituacion(row.situacion_os) === 'Cerrada' && row.fecha_cierre_os?.slice(0,10) >= window.from && row.fecha_cierre_os.slice(0,10) <= window.to);
    const ids = cohort.map(row => billingKey(row.os_numero));
    if (new Set(ids).size !== ids.length) throw new Error('Identidades de OS duplicadas.');
    try {
      const summary = billedOrdersStory(cohort, bills, asOf, period, window);
      return { ...window, value: summary.primary!.value, numerator: summary.supporting[0].value, denominator: cohort.length, ids, cutoff: asOf, complete: true };
    } catch { return { ...window, value: null, numerator: null, denominator: cohort.length, ids, cutoff: asOf, complete: false }; }
  });
}

async function loadBilledOrders(asOf: string, period: StoryPeriod, historical = false) {
  const from = historical ? monthWindows(asOf, period === 'ytd' ? Number(asOf.slice(5,7)) : 6)[0].from : periodRanges(asOf, period).from;
  const rows: ClosedOrderRow[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const { data, error, count } = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,fecha_cierre_os,situacion_os,tipo_tiempo', { count: 'exact' })
      .gte('fecha_cierre_os', from).lte('fecha_cierre_os', `${asOf}T23:59:59.999Z`).order('os_numero').range(offset, offset + 499);
    if (error) throw error;
    if (!Array.isArray(data) || count === null || (expected !== null && expected !== count)) throw new Error('Universo de cierres incompleto o cambiante.');
    expected = count; rows.push(...data);
    if (rows.length === expected) break;
    if (data.length !== 500 || rows.length > expected) throw new Error('Paginación de cierres incompleta.');
  }
  const clientOs = rows.filter(row => canonicalSituacion(row.situacion_os) === 'Cerrada' && canonicalTipoTiempo(row.tipo_tiempo) === 'Cliente').map(row => row.os_numero);
  const bills = await loadOrderBilling(supabase, clientOs, asOf, new AbortController().signal);
  const story = billedOrdersStory(rows, bills, asOf, period);
  story.series = billedSeries(rows, bills, asOf, period);
  story.chart = seriesChart(story.series, 'OS facturadas por mes de cierre · corte documental común', 'percent');
  return story;
}

/** Optional history cannot invalidate the independently loaded current KPI. */
export async function withHistoricalSeries(current: () => Promise<PanoramaStory>, history: () => Promise<PanoramaStory>): Promise<PanoramaStory> {
  const story = await current();
  story.series = undefined; story.chart = null;
  try { const expanded = await history(); story.series = expanded.series; story.chart = expanded.chart; }
  catch { story.details.push('Serie histórica no disponible; se conserva el indicador del período consultado.'); }
  return story;
}

export const loadManagerialStories: StoryLoader = async (topics, granted, asOf, period = 'month') => {
  const selected = topics.filter(id => id === 'agenda_cumplimiento' ? granted.includes('servicios.planificador')
    : id === 'servicios_eficiencia' || id === 'servicios_os_facturadas' ? granted.includes('servicios.ordenes') && granted.includes('servicios.ventas')
    : id === 'servicios_productividad' ? granted.includes('servicios.ordenes')
    : (id === 'clientes_retencion' || id === 'clientes_cobertura_posventa') && granted.includes('parque.maquinas'));
  const customers = selected.some(id => id === 'clientes_retencion' || (id === 'clientes_cobertura_posventa' && !unifiedCoverageEnabled())) ? loadCustomers(asOf, period, selected.includes('clientes_cobertura_posventa') && !unifiedCoverageEnabled()) : null;
  return Promise.all(selected.map(async id => {
    try {
      if (id === 'clientes_cobertura_posventa' && unifiedCoverageEnabled()) return await loadUnifiedCoverageStory(customerStories({compradores_base:0,compradores_retenidos:0,propietarios_elegibles:0,propietarios_con_compra_actual:0},asOf,period)[1],asOf,period);
      if (id === 'agenda_cumplimiento') return await loadPlanning(asOf, period);
      if (id === 'servicios_os_facturadas') return await withHistoricalSeries(() => loadBilledOrders(asOf, period), () => loadBilledOrders(asOf, period, true));
      if (id === 'servicios_productividad') return await loadProductivity(asOf, period);
      if (id === 'servicios_eficiencia') return await withHistoricalSeries(() => loadEfficiency(asOf, period), () => loadEfficiency(asOf, period, true));
      return (await customers!).find(story => story.id === id)!;
    } catch (error) {
      if (id === 'clientes_cobertura_posventa' && unifiedCoverageEnabled()) {
        const diagnostic = error as { code?: string; message?: string };
        console.error('[unified-coverage] ' + JSON.stringify({ code: diagnostic?.code ?? 'CLIENT_VALIDATION', message: diagnostic?.message ?? 'Unknown coverage failure' }));
      }
      const section: SectionKey = id === 'agenda_cumplimiento' ? 'servicios.planificador' : id === 'servicios_productividad' || id === 'servicios_eficiencia' || id === 'servicios_os_facturadas' ? 'servicios.ordenes' : 'parque.maquinas';
      return { ...base(id, section, '', 'Fuente no disponible', asOf), status: 'error' as const,
        message: 'No se pudo consultar este indicador completo.' };
    }
  }));
};
