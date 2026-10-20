import { supabase } from '@/integrations/supabase/client';
import { fetchSemaforoHistorico, SEMAFORO_COLORES, type SemaforoResultado } from '@/hooks/useSemaforoHistorico';
import type { SectionKey } from '@/lib/permissions';
import type { PanoramaStory, StoryLoader, StoryTopicId } from './panoramaStoryTypes';
import { parsePartsExposure, partsAlertsStory, partsConcentrationStory, partsExposureStory } from './partsExposure';
import { machineSupplyStory, parseMachineSupply, parseServiceResolution, serviceOpenStory, serviceResolutionStory } from './operationalOutcomes';

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
  repuestos_alertas: { title: 'Cambios próximos de clasificación', question: '¿Qué valor podría pasar a gris o rojo en 30 días?', section: 'repuestos.analisis', route: '/repuestos/analisis', source: 'campi_repuestos_exposicion_v1' },
  repuestos_concentracion: { title: 'Concentración del stock antiguo', question: '¿Qué familias concentran el valor antiguo?', section: 'repuestos.analisis', route: '/repuestos/analisis', source: 'campi_repuestos_exposicion_v1' },
  maquinas_pedidos: { title: 'Abastecimiento de pedidos activos', question: '¿Qué pedidos activos no tienen abastecimiento vinculado?', section: 'parque.operaciones', route: '/parque-operaciones', source: 'campi_pedidos_abastecimiento_v1' },
  maquinas_stock: { title: 'Stock físico de máquinas', question: '¿Qué existencias informa la última foto?', section: 'parque.stock', route: '/parque-stock', source: 'parque_stock_maquinas · saldo_actual' },
  maquinas_proyeccion: { title: 'Proyección de máquinas nuevas', question: '¿Qué saldo queda después de compras y ventas pendientes?', section: 'parque.stock_proyectado', route: '/parque-stock-proyectado', source: 'parque_stock_proyectado_v1' },
  servicios_pendientes: { title: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron en resolverse las OS cerradas?', section: 'servicios.ordenes', route: '/servicios/ordenes', source: 'campi_resolucion_os_v1' },
  servicios_abiertas: { title: 'Órdenes de servicio abiertas', question: '¿Cuántas OS siguen abiertas y qué edad tienen?', section: 'servicios.ordenes', route: '/servicios/ordenes', source: 'campi_resolucion_os_v1' },
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
  story.scope = 'REP activos con stock global positivo; valor observado en Kardex en dólares';
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
    story.message = average === null ? 'No hay valor positivo con última compra comprobada para calcular la antigüedad.' : 'Antigüedad de la última compra por sucursal, ponderada por valor positivo en dólares con fecha.';
    story.chart = { kind: 'bars', title: 'Días desde última compra por sucursal', unit: 'days', rows: measured.map(r => ({ label: r.name, value: r.days! })) };
    story.breakdown = measured.map(r => ({ label: r.name, value: r.days!, unit: 'days', note: `Cobertura: ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(r.dated! / r.positive! * 100)}% del valor positivo.` }));
    story.details.push('Cada promedio usa el valor positivo en dólares de esa sucursal con fecha de compra comprobada. El promedio general pondera las sucursales por ese mismo valor; sin fecha o sin valor positivo quedan fuera.', 'Los códigos presentes en varias sucursales no son sumables como códigos únicos. Las ventas históricas del semáforo son globales, no ventas locales.');
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
  story.message = 'Existencias físicas informadas, separadas por condición y sucursal.';
  story.primary = { label: 'Saldo físico', value: sum(rows), unit: 'count' };
  story.supporting = [{ label: 'Nuevas', value: sum(rows.filter(r => r.estado === 'Nuevo')), unit: 'count' }, { label: 'Usadas', value: sum(rows.filter(r => r.estado === 'Usado')), unit: 'count' }, { label: 'Otra condición / sin informar', value: sum(rows.filter(r => !['Nuevo', 'Usado'].includes(r.estado ?? ''))), unit: 'count' }];
  const branchRows = [...branches].map(([label, value]) => ({ label, value }));
  const conditionRows = story.supporting.filter(item => item.value !== null && item.value > 0).map(item => ({ label: item.label, value: item.value! }));
  story.chart = branches.size > 1
    ? { kind: 'bars', title: 'Saldo por sucursal', rows: branchRows, unit: 'count' }
    : { kind: 'bars', title: 'Saldo por condición', rows: conditionRows, unit: 'count' };
  story.breakdown = branchRows.map(r => ({ ...r, unit: 'count' }));
  story.details = ['La fecha de importación no acredita la fecha de corte de la foto.', 'Saldo físico no equivale a disponibilidad comercial: reservas, vínculos y conflictos se revisan en Stock. No se agregan máquinas del Parque como existencias.'];
  return story;
}

export const loadOperationsStories: StoryLoader = async (topics, granted, asOf) => {
  if (!day(asOf)) throw new Error('Fecha de análisis inválida.');
  const selected = [...new Set(topics)].filter(id => definitions[id] && granted.includes(definitions[id]!.section));
  let partsRequest: Promise<SemaforoResultado> | undefined;
  let exposureRequest: ReturnType<typeof supabase.rpc> | undefined;
  let serviceRequest: ReturnType<typeof supabase.rpc> | undefined;
  return Promise.all(selected.map(async id => {
    try {
      if (id === 'repuestos_stock' || id === 'repuestos_alertas' || id === 'repuestos_concentracion') {
        exposureRequest ??= supabase.rpc('campi_repuestos_exposicion_v1' as never);
        const response = await exposureRequest;
        if (response.error) throw response.error;
        const data = parsePartsExposure(response.data);
        return id === 'repuestos_alertas' ? partsAlertsStory(data) : id === 'repuestos_concentracion' ? partsConcentrationStory(data) : partsExposureStory(data);
      }
      if (id === 'repuestos_sucursales') {
        partsRequest ??= fetchSemaforoHistorico({ busqueda: '', marca: '', color: '', sucursal: '' }, 0, 1);
        return parts(id, await partsRequest);
      }
      if (id === 'maquinas_proyeccion') return await projected(asOf);
      if (id === 'maquinas_stock') return await machineStock();
      if (id === 'maquinas_pedidos') {
        const response = await supabase.rpc('campi_pedidos_abastecimiento_v1' as never);
        if (response.error) throw response.error;
        return machineSupplyStory(parseMachineSupply(response.data));
      }
      serviceRequest ??= supabase.rpc('campi_resolucion_os_v1' as never);
      const response = await serviceRequest;
      if (response.error) throw response.error;
      const data = parseServiceResolution(response.data);
      return id === 'servicios_abiertas' ? serviceOpenStory(data) : serviceResolutionStory(data);
    } catch (error) {
      const migrationMissing = ['repuestos_stock', 'repuestos_alertas', 'repuestos_concentracion', 'maquinas_pedidos', 'servicios_pendientes', 'servicios_abiertas'].includes(id) && typeof error === 'object' && error !== null && 'code' in error && error.code === 'PGRST202';
      return { ...base(id), status: 'error' as const, message: migrationMissing
        ? 'La lectura de este indicador aún no está activa en la base.'
        : 'No se pudo verificar la fuente completa. Abrí la sección de origen o volvé a intentar.' };
    }
  }));
};
