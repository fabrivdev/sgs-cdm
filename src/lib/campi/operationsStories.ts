import { supabase } from '@/integrations/supabase/client';
import { fetchSemaforoHistorico, SEMAFORO_COLORES, type SemaforoResultado } from '@/hooks/useSemaforoHistorico';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryLoader, StoryTopicId } from './panoramaStoryTypes';
import { parsePartsExposure, partsExposureStory } from './partsExposure';

const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const required = (v: unknown) => { const n = number(v); if (n === null) throw new Error('La fuente devolvió un valor incompleto.'); return n; };
const day = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const stamp = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === v ? v : null;
};
const definitions: Partial<Record<StoryTopicId, { title: string; question: string; section: SectionKey; route: string; source: string }>> = {
  repuestos_sucursales: { title: 'Antigüedad de repuestos por sucursal', question: '¿Cuánto tiempo hace desde la última compra por sucursal?', section: 'repuestos.analisis', route: '/repuestos/analisis', source: 'repuestos_analisis_valorizado · sucursales' },
  repuestos_stock: { title: 'Stock antiguo de repuestos', question: '¿Qué valor de repuestos está en gris o rojo?', section: 'repuestos.analisis', route: '/repuestos/analisis', source: 'campi_repuestos_exposicion_v1' },
  maquinas_pedidos: { title: 'Pedidos de máquinas pendientes', question: '¿Qué unidades de pedidos siguen sin facturar?', section: 'parque.operaciones', route: '/parque-operaciones', source: 'maquinaria_pedidos_lineas_estado_actual + maquinaria_unidades_facturadas_confirmadas' },
  maquinas_stock: { title: 'Stock físico de máquinas', question: '¿Qué existencias informa la última foto?', section: 'parque.stock', route: '/parque-stock', source: 'parque_stock_maquinas · saldo_actual' },
  maquinas_proyeccion: { title: 'Proyección de máquinas nuevas', question: '¿Qué saldo queda después de compras y ventas pendientes?', section: 'parque.stock_proyectado', route: '/parque-stock-proyectado', source: 'parque_stock_proyectado_v1' },
  servicios_pendientes: { title: 'Órdenes de servicio abiertas', question: '¿Cuántas OS siguen abiertas y desde cuándo?', section: 'servicios.ordenes', route: '/servicios/ordenes', source: 'ordenes_servicio_importadas · situacion_os / fecha_abierta_os' },
};
function base(id: StoryTopicId): PanoramaStory {
  const d = definitions[id]!;
  return { id, title: d.title, question: d.question, sections: [d.section], route: d.route, source: d.source, status: 'ready', message: '', scope: '', cutoff: null, periodLabel: 'Corte no informado', primary: null, supporting: [], chart: null, breakdown: [], details: [] };
}
function parts(id: StoryTopicId, data: SemaforoResultado): PanoramaStory {
  const story = base(id);
  const total = required(data.lineas);
  const value = number(data.valor_kardex_usd);
  story.status = total === 0 ? 'empty' : 'ready';
  story.scope = 'REP activos con stock global positivo; valor observado en Kardex (USD)';
  // fecha_analisis is the classification day, NOT the inventory/Kardex cut-off.
  story.details = [`Fecha de clasificación: ${day(data.fecha_analisis) ?? 'no informada'}. El corte del inventario no está acreditado.`, 'El valor es referencial del Kardex; no se recalcula multiplicando saldo por costo. Negativos y valores ausentes se conservan.', 'No incluye pedidos de compra pendientes.'];
  story.primary = { label: 'Valor Kardex referencial', value, unit: 'USD' };
  story.supporting = [{ label: 'Códigos con stock', value: total, unit: 'count' }, { label: 'Ubicaciones sin valor', value: number(data.ubicaciones_sin_valor), unit: 'count' }];
  if (id === 'repuestos_sucursales') {
    const branches = data.sucursales.map(r => ({ name: r.nombre, days: number(r.dias_compra_promedio), dated: number(r.valor_compra_con_fecha_usd), positive: number(r.valor_positivo_usd) }));
    if (branches.some(r => r.dated === null || r.positive === null || r.dated < 0 || r.positive < 0 || r.dated > r.positive || (r.days === null) !== (r.dated === 0))) throw new Error('Cobertura de compras por sucursal incompleta.');
    const measured = branches.filter(r => r.days !== null && r.dated! > 0);
    const dated = branches.reduce((sum, r) => sum + r.dated!, 0);
    const positive = branches.reduce((sum, r) => sum + r.positive!, 0);
    const average = dated > 0 ? measured.reduce((sum, r) => sum + r.days! * r.dated!, 0) / dated : null;
    story.primary = { label: 'Días desde última compra', value: average, unit: 'days' };
    story.supporting = [{ label: 'Valor con compra fechada', value: dated, unit: 'USD' }, { label: 'Cobertura del valor positivo', value: positive > 0 ? dated / positive * 100 : null, unit: 'percent' }];
    story.message = average === null ? 'No hay valor positivo con última compra comprobada para calcular la antigüedad.' : 'Antigüedad de la última compra por sucursal, ponderada por valor USD positivo con fecha.';
    story.chart = { kind: 'bars', title: 'Días desde última compra por sucursal', unit: 'days', rows: measured.map(r => ({ label: r.name, value: r.days! })) };
    story.breakdown = measured.map(r => ({ label: r.name, value: r.days!, unit: 'days', note: `Cobertura: ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(r.dated! / r.positive! * 100)}% del valor positivo.` }));
    story.details.push('Cada promedio usa el valor USD positivo de esa sucursal con fecha de compra comprobada. El promedio general pondera las sucursales por ese mismo valor; sin fecha o sin valor positivo quedan fuera.', 'Los códigos presentes en varias sucursales no son sumables como códigos únicos. Las ventas históricas del semáforo son globales, no ventas locales.');
  } else {
    story.message = total ? 'Semáforo de ventas de tres años calendario y última compra comprobada.' : 'Sin productos dentro del universo del análisis.';
    story.chart = { kind: 'bars', title: 'Valor Kardex por semáforo', unit: 'USD', rows: data.por_color.flatMap(r => number(r.valor_kardex_usd) === null ? [] : [{ label: SEMAFORO_COLORES.find(c => c.id === r.color)?.label ?? r.color, value: r.valor_kardex_usd! }]) };
    story.breakdown = data.por_color.flatMap(r => {
      const color = SEMAFORO_COLORES.find(c => c.id === r.color);
      return [{ label: `${color?.label ?? r.color} · códigos`, value: required(r.lineas), unit: 'count' as const, note: color?.descripcion }, ...(number(r.valor_kardex_usd) === null ? [] : [{ label: `${color?.label ?? r.color} · valor`, value: r.valor_kardex_usd!, unit: 'USD' as const }])];
    });
    const red = data.por_color.find(r => r.color === 'ROJO');
    story.supporting.push({ label: 'Rojo · valor Kardex', value: number(red?.valor_kardex_usd), unit: 'USD', note: 'Sin ventas en tres años; última compra hace más de 1.000 días.' });
    story.details.push('Sin equivalencia no significa sin movimiento. Sin datos significa sin ventas trianuales y sin compra comprobada.', 'Rotación no disponible: el RPC declara SIN_BASE_COMPARABLE; no se deriva una tasa de los colores.');
  }
  return story;
}

async function projected(asOf: string) {
  const story = base('maquinas_proyeccion');
  const { data, error } = await supabase.rpc('parque_stock_proyectado_v1' as never, { p_corte: asOf } as never);
  if (error) throw error;
  const raw = data as unknown as { fecha_corte?: unknown; solo_nuevas?: unknown; disponible_desde?: unknown; filas?: Array<Record<string, unknown>> } | null;
  if (!raw || !Array.isArray(raw.filas) || raw.solo_nuevas !== true || day(raw.fecha_corte) !== asOf || !day(raw.disponible_desde)) throw new Error('Proyección incompleta o corte no confirmado.');
  const rows = raw.filas.map(r => ({ label: `${String(r.marca ?? 'Sin marca')} · ${String(r.modelo ?? 'Sin modelo')}`, stock: required(r.stock), compras: required(r.pedidos_compra), ventas: required(r.ventas_pendientes), value: required(r.stock_proyectado) }));
  if (rows.some(r => Math.abs(r.stock + r.compras - r.ventas - r.value) > 0.000001)) throw new Error('Los componentes de la proyección no concilian.');
  const sum = (key: 'stock' | 'compras' | 'ventas' | 'value') => rows.reduce((s, r) => s + r[key], 0);
  story.cutoff = asOf; story.periodLabel = `Corte ${asOf}`;
  story.scope = `Máquinas nuevas · apertura ${raw.disponible_desde}`;
  story.status = rows.length ? 'ready' : 'empty';
  story.message = 'Saldo calculado de máquinas nuevas después de sumar compras pendientes y restar ventas pendientes.';
  story.primary = { label: 'Saldo proyectado', value: sum('value'), unit: 'count' };
  story.supporting = [{ label: 'Stock calculado', value: sum('stock'), unit: 'count' }, { label: 'Compras pendientes', value: sum('compras'), unit: 'count' }, { label: 'Ventas pendientes', value: sum('ventas'), unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Saldo proyectado por modelo', rows: [...rows].sort((a,b) => b.value-a.value).slice(0, 10).map(({ label, value }) => ({ label, value })), unit: 'count' };
  story.breakdown = rows.map(r => ({ label: r.label, value: r.value, unit: 'count', note: `Stock ${r.stock} + compras ${r.compras} − ventas ${r.ventas}` }));
  story.details = ['Saldo calculado desde la apertura, distinto de la foto física del Stock. Es una suma algebraica entre modelos: no acredita que un modelo pueda cubrir la venta pendiente de otro.', 'Los arribos se reconocen por ATA real; ETA y entrega física no sustituyen facturación.', 'El gráfico muestra hasta 10 modelos con mayor saldo; el detalle incluye todos.'];
  return story;
}

async function machineStock() {
  const story = base('maquinas_stock');
  type Row = { id: string; sucursal: string | null; marca: string | null; estado: string | null; saldo_actual: number | null };
  const rows: Row[] = [];
  let expected: number | null = null;
  // Narrow projection, stable order and exact count. Never summarize a capped page.
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('parque_stock_maquinas').select('id,sucursal,marca,estado,saldo_actual', { count: 'exact' }).order('id').range(offset, offset + 499);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || number(result.count) === null) throw new Error('No se pudo verificar el universo del stock.');
    if (expected === null) expected = result.count;
    if (expected !== result.count || expected! > 5000) throw new Error('Stock cambiado o demasiado amplio para este resumen; consultá Stock.');
    rows.push(...result.data);
    if (rows.length === expected) break;
    if (result.data.length !== 500 || rows.length > expected!) throw new Error('La foto de stock está incompleta.');
  }
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('La foto de stock contiene filas repetidas.');
  rows.forEach(r => required(r.saldo_actual));
  const sum = (subset: Row[]) => subset.reduce((s,r) => s + r.saldo_actual!,0);
  const branches = new Map<string, number>();
  rows.forEach(r => branches.set(r.sucursal || 'Sin sucursal', (branches.get(r.sucursal || 'Sin sucursal') ?? 0) + r.saldo_actual!));
  story.status = rows.length ? 'ready' : 'empty';
  story.scope = 'Foto autoritativa de Stock de Maquinarias · nuevas y usadas';
  story.message = 'Existencias físicas informadas, agrupadas por sucursal.';
  story.primary = { label: 'Saldo físico', value: sum(rows), unit: 'count' };
  story.supporting = [{ label: 'Nuevas', value: sum(rows.filter(r => r.estado === 'Nuevo')), unit: 'count' }, { label: 'Usadas', value: sum(rows.filter(r => r.estado === 'Usado')), unit: 'count' }, { label: 'Otra condición / sin informar', value: sum(rows.filter(r => !['Nuevo', 'Usado'].includes(r.estado ?? ''))), unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Saldo por sucursal', rows: [...branches].map(([label,value]) => ({label,value})), unit: 'count' };
  story.breakdown = story.chart.rows.map(r => ({...r, unit: 'count'}));
  story.details = ['La fecha de importación no acredita la fecha de corte de la foto.', 'Saldo físico no equivale a disponibilidad comercial: reservas, vínculos y conflictos se revisan en Stock. No se agregan máquinas del Parque como existencias.'];
  return story;
}

async function serviceOrders(asOf: string) {
  const story = base('servicios_pendientes');
  const shifted = (days: number) => new Date(Date.parse(asOf + 'T00:00:00Z') - days * 86400000).toISOString().slice(0,10);
  const query = () => supabase.from('ordenes_servicio_importadas').select('os_numero', { head: true, count: 'exact' });
  type Query = ReturnType<typeof query>;
  const count = async (filter: (query: Query) => Query) => {
    const result = await filter(supabase.from('ordenes_servicio_importadas').select('os_numero', { head: true, count: 'exact' }));
    if (result.error) throw result.error;
    return required(result.count);
  };
  // Read only scalar counts; no financial payload and no thousands of OS downloads.
  const open = (q: Query) => q.ilike('situacion_os', '%abiert%');
  const [opened, closed, week, month, older] = await Promise.all([
    count(open), count(q => q.ilike('situacion_os', '%cerrad%')),
    count(q => open(q).gte('fecha_abierta_os', shifted(7)).lt('fecha_abierta_os', shifted(-1))),
    count(q => open(q).gte('fecha_abierta_os', shifted(30)).lt('fecha_abierta_os', shifted(7))),
    count(q => open(q).lt('fecha_abierta_os', shifted(30))),
  ]);
  const undated = opened - week - month - older;
  if (undated < 0) throw new Error('Las consultas de OS cambiaron durante la lectura; volvé a consultar.');
  story.scope = 'OS importadas con estado explícito Abierta · todas las fechas de apertura';
  story.message = 'Pendientes operativas según estado de la OS; antigüedad desde apertura.';
  story.status = opened ? 'ready' : 'empty';
  story.primary = { label: 'OS abiertas', value: opened, unit: 'count' };
  story.supporting = [{ label: 'Abiertas hace más de 30 días', value: older, unit: 'count' }, { label: 'Sin antigüedad válida', value: undated, unit: 'count' }, { label: 'OS cerradas registradas', value: closed, unit: 'count' }];
  const rows = [{ label: '0–7 días', value: week }, { label: '8–30 días', value: month }, { label: 'Más de 30 días', value: older }, { label: 'Sin fecha / fecha futura', value: undated }];
  story.chart = { kind: 'bars', title: `Antigüedad de abiertas al ${asOf}`, rows, unit: 'count' };
  story.breakdown = rows.map(r => ({...r, unit: 'count'}));
  story.details = [`Antigüedad calculada al ${asOf}; el corte de actualización de la fuente no está informado.`, 'Solo estados que contienen Abierta se incluyen; canceladas, anuladas y estados desconocidos no se presumen pendientes.', 'La fecha y situación de facturación no deciden si una OS está abierta. Estas consultas independientes no son una foto transaccional.'];
  return story;
}

export const loadOperationsStories: StoryLoader = async (topics, granted, asOf) => {
  if (!day(asOf)) throw new Error('Fecha de análisis inválida.');
  const selected = [...new Set(topics)].filter(id => definitions[id] && granted.includes(definitions[id]!.section));
  let partsRequest: Promise<SemaforoResultado> | undefined;
  return Promise.all(selected.map(async id => {
    try {
      if (id === 'repuestos_stock') {
        const response = await supabase.rpc('campi_repuestos_exposicion_v1' as never);
        if (response.error) throw response.error;
        return partsExposureStory(parsePartsExposure(response.data));
      }
      if (id === 'repuestos_sucursales') {
        partsRequest ??= fetchSemaforoHistorico({ busqueda: '', marca: '', color: '', sucursal: '' }, 0, 1);
        return parts(id, await partsRequest);
      }
      if (id === 'maquinas_proyeccion') return await projected(asOf);
      if (id === 'maquinas_stock') return await machineStock();
      if (id === 'maquinas_pedidos') return await machineOrders();
      return await serviceOrders(asOf);
    } catch (error) {
      const migrationMissing = id === 'repuestos_stock' && typeof error === 'object' && error !== null && 'code' in error && error.code === 'PGRST202';
      return { ...base(id), status: 'error' as const, message: migrationMissing
        ? 'La lectura de stock antiguo aún no está activa en la base.'
        : 'No se pudo verificar la fuente completa. Abrí la sección de origen o volvé a intentar.' };
    }
  }));
};


type Order = { id: string; unidad_id: string | null; cantidad: number; operacion_id: string; np_numero: string | null; marca: string | null; modelo: string | null; estado_fuente: string | null; estado_operacion: string | null; factura_venta: string | null; factura_fecha: string | null; es_historico: boolean };
/** Matches Operaciones' simpleOrderState/orderBillingState, including historical evidence. */
export function pendingMachineOrder(row: Order, unitState: string, confirmed: boolean): boolean {
  const state = (value: string | null) => {
    const s = (value ?? '').trim().toUpperCase();
    if (s.includes('CANCEL')) return 'cancelled';
    if (s === 'FACTURADA' || s === 'CERRADA' || s.includes('COMPLET')) return 'complete';
    return 'pending';
  };
  if (unitState === 'CANCELADA' || state(row.estado_fuente) === 'cancelled' || state(row.estado_operacion) === 'cancelled') return false;
  if (!row.es_historico) return !confirmed;
  const invoice = row.factura_venta?.trim();
  if ((invoice && invoice.toLowerCase() !== 'null') || row.factura_fecha || ['FACTURADA', 'EN_PARQUE', 'TRANSFERIDA'].includes(unitState)) return false;
  return state(row.estado_fuente) === 'pending' && state(row.estado_operacion) === 'pending';
}

async function machineOrders() {
  const story = base('maquinas_pedidos');
  // Existing Operaciones view/RPC are not all present in generated Supabase types.
  type ReadResult = { data: Record<string, unknown>[] | null; count: number | null; error: unknown };
  type ReadQuery = PromiseLike<ReadResult> & { select: (columns: string, options?: { count: 'exact' }) => ReadQuery; order: (column: string) => ReadQuery; range: (from: number, to: number) => ReadQuery; in: (column: string, values: string[]) => ReadQuery };
  const db = supabase as unknown as { from: (table: string) => ReadQuery; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
  const rows: Order[] = [];
  let total: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('maquinaria_pedidos_lineas_estado_actual').select('id,unidad_id,cantidad,operacion_id,np_numero,marca,modelo,estado_fuente,estado_operacion,factura_venta,factura_fecha,es_historico', { count: 'exact' }).order('id').range(offset, offset + 499);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error('Pedidos incompletos.');
    const count = required(result.count);
    total ??= count;
    if (count !== total || total > 2000) throw new Error('Universo cambiado o demasiado amplio para el resumen.');
    rows.push(...result.data as unknown as Order[]);
    if (rows.length === total) break;
    if (result.data.length !== 500 || rows.length > total) throw new Error('Pedidos incompletos.');
  }
  // View grain: coalesce(unidad.id, linea.id). A repeated unit is not another sale item.
  if (rows.some(r => !r.id || !r.operacion_id || typeof r.es_historico !== 'boolean' || (r.unidad_id != null && r.id !== r.unidad_id)) || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Identidad de pedidos inválida.');
  const pending: Order[] = [];
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200);
    const ids = [...new Set(batch.flatMap(r => r.unidad_id ? [r.unidad_id] : []))];
    batch.forEach(r => { if (required(r.cantidad) < 0) throw new Error('Cantidad inválida.'); });
    const [units, billing] = await Promise.all([
      ids.length ? db.from('maquinaria_unidades_operacion').select('id,estado').in('id', ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.rpc('maquinaria_unidades_facturadas_confirmadas', { p_unidad_ids: ids }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (units.error || billing.error) throw units.error || billing.error;
    if (!Array.isArray(units.data) || !Array.isArray(billing.data)) throw new Error('Conciliación incompleta.');
    const states = new Map<string,string>();
    for (const unit of units.data) {
      if (typeof unit.id !== 'string' || typeof unit.estado !== 'string' || !ids.includes(unit.id) || states.has(unit.id)) throw new Error('Estado de unidad inválido.');
      states.set(unit.id, unit.estado);
    }
    if (states.size !== ids.length) throw new Error('Faltan estados de unidades.');
    const confirmed = new Set<string>();
    for (const item of billing.data) {
      if (!item || typeof item !== 'object' || !('unidad_id' in item) || typeof item.unidad_id !== 'string' || !ids.includes(item.unidad_id)) throw new Error('Facturación inválida.');
      confirmed.add(item.unidad_id);
    }
    pending.push(...batch.filter(r => pendingMachineOrder(r, r.unidad_id ? states.get(r.unidad_id)! : '', r.unidad_id ? confirmed.has(r.unidad_id) : false)));
  }
  const models = new Map<string, number>();
  pending.forEach(r => { const key = `${r.marca || 'Sin marca'} · ${r.modelo || 'Sin modelo'}`; models.set(key, (models.get(key) ?? 0) + r.cantidad); });
  const grouped = [...models].map(([label,value]) => ({label,value})).sort((a,b) => b.value-a.value);
  const orders = new Map<string, { label: string; value: number; historical: number }>();
  pending.forEach(r => {
    const current = orders.get(r.operacion_id) ?? { label: r.np_numero?.trim() || 'Pedido sin NP', value: 0, historical: 0 };
    current.value += r.cantidad;
    if (r.es_historico) current.historical += r.cantidad;
    orders.set(r.operacion_id, current);
  });
  story.status = pending.length ? 'ready' : 'empty';
  story.scope = 'Unidades de pedidos actuales e históricos · excluye canceladas y facturadas según Operaciones';
  story.message = 'Unidades pendientes de facturar, con conciliación por chasis en pedidos actuales.';
  story.primary = { label: 'Unidades pendientes', value: pending.reduce((n,r) => n + r.cantidad, 0), unit: 'count' };
  story.supporting = [{ label: 'Pedidos con pendientes', value: new Set(pending.map(r => r.operacion_id)).size, unit: 'count' }, { label: 'Pendientes históricos', value: pending.filter(r => r.es_historico).reduce((n,r) => n + r.cantidad, 0), unit: 'count' }, { label: 'Modelos pendientes', value: models.size, unit: 'count' }];
  story.chart = { kind: 'bars', title: 'Unidades pendientes por modelo', rows: grouped.slice(0,10), unit: 'count' };
  story.breakdown = [...orders].map(([id, order]) => ({ label: order.label, value: order.value, unit: 'count' as const, route: `/parque-operaciones?operacion=${encodeURIComponent(id)}`, note: order.historical ? `${order.historical} pendiente${order.historical === 1 ? '' : 's'} histórico${order.historical === 1 ? '' : 's'}` : undefined })).sort((a,b) => b.value - a.value || a.label.localeCompare(b.label));
  story.details = ['Una unidad actual requiere venta positiva confirmada por su chasis; un PDF o estado agregado de la NP no factura a sus otras unidades.', 'Históricos conservan la evidencia documental y de estado del módulo Operaciones. Pendiente no significa no entregada.', 'La fecha de NP acredita cuándo se registró el pedido; ETA estima llegada de importación. Ninguna es una fecha comprometida de entrega al cliente. No se clasifican atrasos sin ese dato.', 'Monto pendiente no consolidado: valor_venta mezcla valores de unidad, documento histórico y valor acordado; moneda_valor puede asumir USD. No se suman como un monto pendiente ni como facturación.', 'El gráfico muestra hasta 10 modelos; el desglose incluye todos los pedidos pendientes y abre cada NP.', 'Lectura completa paginada y conciliación en lotes de 200; cualquier fallo invalida el resumen. Máximo 2.000 unidades: superar ese límite produce error explícito, no un subtotal.'];
  return story;
}
