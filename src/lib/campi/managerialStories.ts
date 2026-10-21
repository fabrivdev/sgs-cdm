import { supabase } from '@/integrations/supabase/client';
import { loadOperationsData } from '@/features/service-orders/data';
import { loadWorkLog } from '@/features/service-orders/workLog';
import { workedProductivity } from '@/features/service-orders/workedProductivity';
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
    cutoff: asOf, periodLabel: asOf, primary: null, supporting: [], chart: null, breakdown: [], details: [], source, route };
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
  const completed = count('Completado'), pending = count('Pendiente'), started = count('Iniciado'), cancelled = count('Cancelada');
  const story = base('agenda_cumplimiento', 'servicios.planificador', `/?desde=${from}&hasta=${asOf}`, 'servicio_jornadas', asOf);
  story.periodMode = period; story.periodOptions = ['month', 'ytd']; story.visitKey = `agenda_cumplimiento:${period}:${asOf}`;
  story.periodLabel = `${from}–${asOf}`;
  story.status = eligible.length ? 'ready' : 'empty';
  story.primary = { label: 'Agenda cumplida', value: eligible.length ? completed / eligible.length * 100 : null, unit: 'percent' };
  story.supporting = [{ label: 'Completadas', value: completed, unit: 'count' }, { label: 'Evaluables', value: eligible.length, unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Estado de compromisos', unit: 'count', rows: [
    { label: 'Completadas', value: completed }, { label: 'Pendientes', value: pending },
    { label: 'Iniciadas', value: started }, { label: 'Canceladas', value: cancelled },
  ] };
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
  retention.periodLabel = `${retentionRanges.previousFrom}–${retentionRanges.previousTo} → ${retentionRanges.from}–${asOf}`;
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
  coverage.periodLabel = `${periodRanges(asOf, period).from}–${asOf}`;
  coverage.status = row.propietarios_elegibles ? 'ready' : 'empty';
  coverage.primary = { label: 'Cobertura posventa', value: row.propietarios_elegibles ? row.propietarios_con_compra_actual / row.propietarios_elegibles * 100 : null, unit: 'percent' };
  coverage.supporting = [{ label: 'Con compra', value: row.propietarios_con_compra_actual, unit: 'count' }, { label: 'Propietarios', value: row.propietarios_elegibles, unit: 'count' }];
  coverage.chart = { kind: 'bars', title: 'Propietarios del parque', unit: 'count', rows: [
    { label: 'Con actividad de posventa', value: row.propietarios_con_compra_actual },
    { label: 'Sin compra en la ventana', value: row.propietarios_elegibles - row.propietarios_con_compra_actual },
  ] };
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

async function loadCustomers(asOf: string, period: StoryPeriod) {
  const range = periodRanges(asOf, period);
  const { data, error } = await supabase.rpc('gerencial_clientes_resumen_v1', {
    p_desde: range.from, p_hasta: asOf, p_prev_desde: range.previousFrom,
    p_prev_hasta: range.previousTo, p_sucursal: 'TODAS',
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) throw new Error('La cohorte de clientes está incompleta.');
  return customerStories(data[0], asOf, period);
}

async function loadProductivity(asOf: string) {
  const from = periodRanges(asOf).from;
  const signal = new AbortController().signal;
  const [snapshot, logs] = await Promise.all([
    loadOperationsData(supabase, from, asOf, signal),
    loadWorkLog(supabase, from, asOf, null, signal),
  ]);
  const filters: OperationsFilters = { dateFrom: from, dateTo: asOf, periodMode: 'mes', q: '',
    fSucursales: [], fMarcas: [], fTiposTiempo: [], fEstadosTrabajo: [], fTécnicos: [],
    fResponsablesOS: [], fEstadosOS: [], fOSRubros: [] };
  const result = workedProductivity(logs, snapshot.data, filters);
  const available = result.capacidad.horasDisponibles;
  const story = base('servicios_productividad', 'servicios.ordenes', `/servicios/ordenes?tab=productividad&desde=${from}&hasta=${asOf}`, 'service_orders_work_log_v1 + capacidad de Servicios', asOf);
  story.status = available > 0 ? 'ready' : 'empty';
  story.primary = { label: 'Productividad', value: available > 0 ? result.horasPersona / available * 100 : null, unit: 'percent' };
  story.supporting = [{ label: 'Horas trabajadas', value: result.horasPersona, unit: 'count' }, { label: 'Horas disponibles', value: available, unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Horas-persona', unit: 'count', rows: [
    { label: 'Trabajadas', value: result.horasPersona }, { label: 'Disponibles', value: available },
  ] };
  story.message = available > 0 ? `${Math.round(result.horasPersona)} de ${Math.round(available)} horas-persona disponibles trabajadas.` : 'No hay capacidad positiva comparable para calcular productividad.';
  story.details = result.issues.length ? [`${result.issues.length} registros requieren revisión y no se cuentan como horas trabajadas.`] : [];
  return story;
}

async function loadEfficiency(asOf: string) {
  const from = periodRanges(asOf).from;
  const rows: { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null;
    fecha_emision_factura: string | null; situacion_os: string | null; servicios_cantidad: number | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,fecha_abierta_os,fecha_cierre_os,fecha_emision_factura,situacion_os,servicios_cantidad')
      .gte('fecha_cierre_os', from).lte('fecha_cierre_os', `${asOf}T23:59:59.999Z`).order('os_numero').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const candidates = rows.filter(row => canonicalSituacion(row.situacion_os) === 'Cerrada')
    .map(row => ({ os: row.os_numero, estadoOS: 'Cerrada', horas: row.servicios_cantidad ?? 0,
      fechaApertura: row.fecha_abierta_os?.slice(0, 10) ?? null,
      fechaCierre: row.fecha_cierre_os?.slice(0, 10) ?? null,
      fechaFacturacion: row.fecha_emision_factura?.slice(0, 10) ?? null }));
  const signal = new AbortController().signal;
  const bills = await loadOrderBilling(supabase, candidates.map(row => row.os), asOf, signal);
  const result = billingEfficiency(candidates.map(row => ({ ...row, billing: bills[billingKey(row.os)] ?? null })));
  const story = base('servicios_eficiencia', 'servicios.ordenes', `/servicios/ordenes?tab=productividad&desde=${from}&hasta=${asOf}`, 'service_orders_billing_v2 + ordenes_servicio_importadas', asOf);
  story.status = result.percentage !== null ? 'ready' : 'empty';
  story.primary = { label: 'Eficiencia', value: result.percentage, unit: 'percent' };
  story.supporting = [{ label: 'Horas facturadas', value: result.billedHours, unit: 'count' },
    { label: 'Horas trabajadas', value: result.workedHours, unit: 'count' },
    { label: 'OS conciliadas', value: result.orders, unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Horas de OS cerradas', unit: 'count', rows: [
    { label: 'Facturadas', value: result.billedHours }, { label: 'Trabajadas', value: result.workedHours },
  ] };
  story.message = result.percentage !== null ? `${result.orders} OS cerradas con horas facturadas y trabajadas conciliadas.`
    : result.incomplete ? `${result.incomplete} OS cerradas tienen horas o tarifas incompletas; la eficiencia no es medible.`
      : 'No hay OS cerradas conciliadas en este período.';
  story.details = result.incomplete ? [`${result.incomplete} OS incompletas excluyen la tasa de esta cohorte.`] : [];
  return story;
}

type ClosedOrderRow = { os_numero: string; fecha_cierre_os: string | null; situacion_os: string | null; tipo_tiempo: string | null };
export function billedOrdersStory(rows: readonly ClosedOrderRow[], bills: Readonly<Record<string, OrderBilling>>, asOf: string, period: StoryPeriod = 'month'): PanoramaStory {
  const from = periodRanges(asOf, period).from;
  const closed = new Map<string, ClosedOrderRow>();
  for (const row of rows) {
    if (canonicalSituacion(row.situacion_os) !== 'Cerrada') continue;
    const key = billingKey(row.os_numero);
    const closedDay = row.fecha_cierre_os?.slice(0, 10);
    if (!key || !closedDay || !day(closedDay)) throw new Error('La cohorte de OS cerradas no concilia.');
    if (closedDay < from || closedDay > asOf) continue;
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
  story.periodLabel = `${from}–${asOf}`;
  story.status = closed.size ? 'ready' : 'empty';
  story.primary = { label: 'OS facturadas a cliente', value: closed.size ? billed / closed.size * 100 : null, unit: 'percent' };
  story.supporting = [{ label: 'Facturadas a cliente', value: billed, unit: 'count' }, { label: 'OS cerradas', value: closed.size, unit: 'count' },
    { label: 'Tipo Cliente', value: clientType, unit: 'count' }, { label: 'Otros tipos', value: otherType, unit: 'count' }];
  story.chart = closed.size ? { kind: 'bars', title: 'OS cerradas según factura a cliente', unit: 'count', rows: [
    { label: 'Cliente facturada', value: billed }, { label: 'Cliente sin factura', value: clientType - billed }, { label: 'Garantía, interno u otra', value: otherType },
  ] } : null;
  story.message = closed.size ? `${billed} de ${closed.size} OS cerradas tienen una factura positiva de cliente vinculada.` : 'No hay OS cerradas en este período.';
  return story;
}

async function loadBilledOrders(asOf: string, period: StoryPeriod) {
  const from = periodRanges(asOf, period).from;
  const rows: ClosedOrderRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,fecha_cierre_os,situacion_os,tipo_tiempo')
      .gte('fecha_cierre_os', from).lte('fecha_cierre_os', `${asOf}T23:59:59.999Z`).order('os_numero').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const clientOs = rows.filter(row => canonicalSituacion(row.situacion_os) === 'Cerrada' && canonicalTipoTiempo(row.tipo_tiempo) === 'Cliente').map(row => row.os_numero);
  const bills = await loadOrderBilling(supabase, clientOs, asOf, new AbortController().signal);
  return billedOrdersStory(rows, bills, asOf, period);
}

export const loadManagerialStories: StoryLoader = async (topics, granted, asOf, period = 'month') => {
  const selected = topics.filter(id => id === 'agenda_cumplimiento' ? granted.includes('servicios.planificador')
    : id === 'servicios_eficiencia' || id === 'servicios_os_facturadas' ? granted.includes('servicios.ordenes') && granted.includes('servicios.ventas')
    : id === 'servicios_productividad' ? granted.includes('servicios.ordenes')
    : (id === 'clientes_retencion' || id === 'clientes_cobertura_posventa') && granted.includes('parque.maquinas'));
  const customers = selected.some(id => id.startsWith('clientes_')) ? loadCustomers(asOf, period) : null;
  return Promise.all(selected.map(async id => {
    try {
      if (id === 'agenda_cumplimiento') return await loadPlanning(asOf, period);
      if (id === 'servicios_os_facturadas') return await loadBilledOrders(asOf, period);
      if (id === 'servicios_productividad') return await loadProductivity(asOf);
      if (id === 'servicios_eficiencia') return await loadEfficiency(asOf);
      return (await customers!).find(story => story.id === id)!;
    } catch {
      const section: SectionKey = id === 'agenda_cumplimiento' ? 'servicios.planificador' : id === 'servicios_productividad' || id === 'servicios_eficiencia' || id === 'servicios_os_facturadas' ? 'servicios.ordenes' : 'parque.maquinas';
      return { ...base(id, section, '', 'Fuente no disponible', asOf), status: 'error' as const,
        message: 'No se pudo consultar este indicador completo.' };
    }
  }));
};
