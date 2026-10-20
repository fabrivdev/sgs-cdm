import type { PanoramaStory } from './panoramaStoryTypes';

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El resumen operativo es inválido.');
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('El resumen operativo contiene valores incompletos.');
  return value;
};
const integer = (value: unknown): number => {
  const result = number(value);
  if (!Number.isInteger(result)) throw new Error('El resumen operativo contiene cantidades inválidas.');
  return result;
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('El período operativo es inválido.');
  return value;
};
const nextMonth = (month: string) => new Date(Date.parse(month + 'T00:00:00Z') + 36 * 86400000).toISOString().slice(0, 7) + '-01';
const lastDay = (month: string) => new Date(Date.parse(nextMonth(month) + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const formatDate = (value: string) => new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
const formatDay = (value: string) => new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));

type SupplyOrder = { operacion_id: string; np_numero: string | null; unidades: number; sin_vinculo: number; sin_identidad_o_conflicto: number };
type Supply = { fecha_analisis: string; filas: number; identidades: number; unidades_identificadas: number; estados_desconocidos: number; cantidades_invalidas: number; unidades: number; sin_unidad: number; conflicto: number; sin_vinculo: number; stock: number; importacion_arribada: number; importacion_transito: number; pedidos: number; pendientes: SupplyOrder[] };

export function parseMachineSupply(input: unknown): Supply {
  const row = record(input);
  if (!Array.isArray(row.pendientes)) throw new Error('Falta el desglose de pedidos.');
  const pending = row.pendientes.map(item => {
    const order = record(item);
    if (typeof order.operacion_id !== 'string' || !order.operacion_id || (order.np_numero !== null && typeof order.np_numero !== 'string')) throw new Error('Pedido sin identidad verificable.');
    return { operacion_id: order.operacion_id, np_numero: order.np_numero as string | null,
      unidades: integer(order.unidades), sin_vinculo: integer(order.sin_vinculo), sin_identidad_o_conflicto: integer(order.sin_identidad_o_conflicto) };
  });
  const data: Supply = { fecha_analisis: date(row.fecha_analisis), filas: integer(row.filas), identidades: integer(row.identidades),
    unidades_identificadas: integer(row.unidades_identificadas), estados_desconocidos: integer(row.estados_desconocidos), cantidades_invalidas: integer(row.cantidades_invalidas),
    unidades: integer(row.unidades), sin_unidad: integer(row.sin_unidad), conflicto: integer(row.conflicto), sin_vinculo: integer(row.sin_vinculo),
    stock: integer(row.stock), importacion_arribada: integer(row.importacion_arribada), importacion_transito: integer(row.importacion_transito), pedidos: integer(row.pedidos), pendientes: pending };
  const risk = data.sin_vinculo + data.sin_unidad + data.conflicto;
  if (data.estados_desconocidos || data.cantidades_invalidas || data.identidades !== data.filas ||
      data.unidades !== risk + data.stock + data.importacion_arribada + data.importacion_transito ||
      pending.reduce((sum, item) => sum + item.unidades, 0) !== risk ||
      pending.some(item => item.unidades !== item.sin_vinculo + item.sin_identidad_o_conflicto) ||
      new Set(pending.map(item => item.operacion_id)).size !== pending.length) throw new Error('La cobertura de pedidos no concilia.');
  return data;
}

export function machineSupplyStory(data: Supply): PanoramaStory {
  const risk = data.sin_vinculo + data.sin_unidad + data.conflicto;
  return { id: 'maquinas_pedidos', visitKey: `maquinas_pedidos:abastecimiento-v1:${data.fecha_analisis}`,
    title: 'Abastecimiento de pedidos activos', question: '¿Qué pedidos activos no tienen abastecimiento vinculado?',
    status: data.unidades ? 'ready' : 'empty',
    message: data.unidades ? `${risk} de ${data.unidades} unidades de operaciones activas no tienen un vínculo único de abastecimiento comprobado.` : 'No hay unidades en operaciones activas.',
    scope: 'Unidades de operaciones no cerradas, facturadas ni canceladas; vínculo por identidad de unidad',
    sections: ['parque.operaciones'], cutoff: null, periodLabel: formatDay(data.fecha_analisis),
    primary: { label: 'Unidades en pedidos activos', value: data.unidades, unit: 'count' },
    supporting: [{ label: 'Unidades activas', value: data.unidades, unit: 'count' }, { label: 'Sin vínculo', value: data.sin_vinculo, unit: 'count' },
      { label: 'Sin unidad individual', value: data.sin_unidad, unit: 'count' }, { label: 'Vínculo ambiguo', value: data.conflicto, unit: 'count' },
      { label: 'Participación sin vínculo válido', value: data.unidades ? risk / data.unidades * 100 : null, unit: 'percent' }],
    chart: { kind: 'bars', title: 'Estado del vínculo de abastecimiento', unit: 'count', rows: [
      { label: 'Sin vínculo válido', value: risk }, { label: 'Stock identificado', value: data.stock },
      { label: 'Importación en tránsito', value: data.importacion_transito }, { label: 'Importación arribada', value: data.importacion_arribada },
    ] },
    breakdown: data.pendientes.map(order => ({ label: order.np_numero?.trim() || 'Pedido sin NP', value: order.unidades, unit: 'count' as const,
      route: `/parque-operaciones?operacion=${encodeURIComponent(order.operacion_id)}`,
      note: `${order.sin_vinculo} sin vínculo; ${order.sin_identidad_o_conflicto} sin identidad o con conflicto` })),
    details: ['El vínculo exige la misma unidad de pedido: una importación activa única o stock positivo asignado explícitamente. Si la importación ya llegó a stock, cuenta como stock una sola vez.',
      'La cifra no significa pedidos sin entregar ni entregas atrasadas: no hay estado de entrega ni fecha prometida acreditados para todo el universo.',
      'Un vínculo de importación en tránsito tampoco equivale a disponibilidad inmediata. No se cruzan modelos por suma algebraica.',
      'La fecha de lectura no acredita el corte de todas las fuentes. Las operaciones cerradas, facturadas y canceladas se excluyen; un estado nuevo o cantidades inválidas bloquean el resumen.'],
    source: 'campi_pedidos_abastecimiento_v1 · pedidos, unidades, stock e importaciones', route: '/parque-operaciones',
    notices: risk ? [{ text: `${risk} de ${data.unidades} unidades activas sin vínculo único de abastecimiento`, route: '/parque-operaciones' }] : [],
  };
}

type ReadyOrder = { operacion_id: string; np_numero: string | null; unidades_con_stock: number; unidades_activas: number };
type ReadyOrders = { fecha_analisis: string; unidades_activas: number; unidades_con_stock: number; pedidos_con_stock: number; unidades_facturadas_detectadas: number; identidades: number; pedidos: ReadyOrder[] };
export function parseReadyOrders(input: unknown): ReadyOrders {
  const raw = record(input);
  if (!Array.isArray(raw.pedidos)) throw new Error('Falta el detalle de pedidos con stock.');
  const pedidos = raw.pedidos.map(item => {
    const order = record(item);
    if (typeof order.operacion_id !== 'string' || !order.operacion_id || (order.np_numero !== null && typeof order.np_numero !== 'string')) throw new Error('Pedido sin identidad.');
    return { operacion_id: order.operacion_id, np_numero: order.np_numero as string | null,
      unidades_con_stock: integer(order.unidades_con_stock), unidades_activas: integer(order.unidades_activas) };
  });
  const data = { fecha_analisis: date(raw.fecha_analisis), unidades_activas: integer(raw.unidades_activas),
    unidades_con_stock: integer(raw.unidades_con_stock), pedidos_con_stock: integer(raw.pedidos_con_stock),
    unidades_facturadas_detectadas: integer(raw.unidades_facturadas_detectadas), identidades: integer(raw.identidades), pedidos };
  if (data.identidades !== data.unidades_activas || data.unidades_con_stock > data.unidades_activas ||
      data.pedidos_con_stock !== pedidos.length || new Set(pedidos.map(p => p.operacion_id)).size !== pedidos.length ||
      pedidos.some(p => p.unidades_con_stock <= 0 || p.unidades_con_stock > p.unidades_activas) ||
      pedidos.reduce((sum, p) => sum + p.unidades_con_stock, 0) !== data.unidades_con_stock) throw new Error('Los pedidos con stock no concilian.');
  return data;
}
export function readyOrdersStory(data: ReadyOrders, supply: Supply): PanoramaStory {
  const unlinked = supply.sin_vinculo + supply.sin_unidad + supply.conflicto;
  if (data.fecha_analisis !== supply.fecha_analisis || data.pedidos_con_stock > supply.pedidos ||
      data.unidades_con_stock > supply.stock || data.unidades_con_stock > supply.unidades) throw new Error('Los pedidos pendientes y su abastecimiento no concilian.');
  return { id: 'maquinas_pedidos', visitKey: `maquinas_pedidos:abastecimiento-v2:${data.fecha_analisis}`,
    title: 'Pedidos pendientes', question: '¿Cuántos pedidos pendientes tienen stock para facturar y cómo se abastece el resto?',
    status: 'ready', message: `${data.pedidos_con_stock} de ${supply.pedidos} pedidos pendientes tienen al menos una unidad con stock para facturar.`,
    scope: 'Pedidos activos y su abastecimiento por unidad',
    sections: ['parque.operaciones'], cutoff: null, periodLabel: formatDay(data.fecha_analisis),
    primary: { label: 'Pedidos pendientes', value: supply.pedidos, unit: 'count' },
    supporting: [{ label: 'Pedidos con stock', value: data.pedidos_con_stock, unit: 'count', note: `${supply.pedidos ? new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(data.pedidos_con_stock / supply.pedidos * 100) : 0}% · ${data.unidades_con_stock} unidades` },
      { label: 'Unidades pendientes', value: supply.unidades, unit: 'count' },
      { label: 'Unidades con stock para facturar', value: data.unidades_con_stock, unit: 'count' }],
    chart: { kind: 'bars', title: 'Abastecimiento de unidades pendientes', unit: 'count', rows: [
      { label: 'Stock', value: supply.stock },
      { label: 'Importación arribada', value: supply.importacion_arribada },
      { label: 'Importación en tránsito', value: supply.importacion_transito },
      { label: 'Sin vínculo', value: unlinked },
    ] },
    breakdown: [
      ...data.pedidos.map(order => ({ label: order.np_numero?.trim() || 'Pedido sin NP', value: order.unidades_con_stock,
        unit: 'count' as const, group: 'Con stock para facturar', route: `/parque-operaciones?operacion=${encodeURIComponent(order.operacion_id)}` })),
      ...supply.pendientes.map(order => ({ label: order.np_numero?.trim() || 'Pedido sin NP', value: order.unidades,
        unit: 'count' as const, group: 'Sin vínculo', route: `/parque-operaciones?operacion=${encodeURIComponent(order.operacion_id)}` })),
    ],
    details: ['El stock está asignado a la misma unidad del pedido y tiene saldo positivo. Se excluyen ventas de la misma máquina confirmadas por chasis. La facturación final requiere la revisión comercial habitual.'],
    source: 'campi_pedidos_abastecimiento_v1 + campi_pedidos_con_stock_v1', route: '/parque-operaciones' };
}

type OpenDetail = { fecha_analisis: string; abiertas: number; marcas: { nombre: string; cantidad: number }[]; edades: { rango: string; cantidad: number }[]; cortes: { fecha: string; abiertas: number }[] };
export function parseOpenDetail(input: unknown): OpenDetail {
  const raw = record(input);
  if (!Array.isArray(raw.marcas) || !Array.isArray(raw.edades) || !Array.isArray(raw.cortes)) throw new Error('Falta el desglose de OS abiertas.');
  const brands = raw.marcas.map(item => { const row = record(item); if (typeof row.nombre !== 'string' || !row.nombre) throw new Error('Marca inválida.'); return { nombre: row.nombre, cantidad: integer(row.cantidad) }; });
  const ages = raw.edades.map(item => { const row = record(item); if (typeof row.rango !== 'string' || !row.rango) throw new Error('Rango inválido.'); return { rango: row.rango, cantidad: integer(row.cantidad) }; });
  const cuts = raw.cortes.map(item => { const row = record(item); return { fecha: date(row.fecha), abiertas: integer(row.abiertas) }; });
  const data = { fecha_analisis: date(raw.fecha_analisis), abiertas: integer(raw.abiertas), marcas: brands, edades: ages, cortes: cuts };
  if (brands.reduce((s,b) => s+b.cantidad,0) !== data.abiertas || ages.reduce((s,a) => s+a.cantidad,0) !== data.abiertas ||
      new Set(brands.map(b => b.nombre)).size !== brands.length || new Set(ages.map(a => a.rango)).size !== ages.length ||
      new Set(cuts.map(c => c.fecha)).size !== cuts.length || cuts.some(c => c.fecha > data.fecha_analisis)) throw new Error('El desglose de OS no concilia.');
  return data;
}

type Resolution = { fecha_analisis: string; ultimo_mes: string; mes_anterior: string; cierres_ultimo_mes: number; cierres_mes_anterior: number; invalidas_ultimo_mes: number; invalidas_mes_anterior: number; mediana_ultimo_mes: number | null; mediana_mes_anterior: number | null; historicas_sin_cierre: number; abiertas: number; apertura_invalida: number; p90_edad_abiertas: number | null };
export function parseServiceResolution(input: unknown): Resolution {
  const row = record(input);
  const optional = (value: unknown) => value === null ? null : number(value);
  const result: Resolution = { fecha_analisis: date(row.fecha_analisis), ultimo_mes: date(row.ultimo_mes), mes_anterior: date(row.mes_anterior),
    cierres_ultimo_mes: integer(row.cierres_ultimo_mes), cierres_mes_anterior: integer(row.cierres_mes_anterior),
    invalidas_ultimo_mes: integer(row.invalidas_ultimo_mes), invalidas_mes_anterior: integer(row.invalidas_mes_anterior),
    mediana_ultimo_mes: optional(row.mediana_ultimo_mes), mediana_mes_anterior: optional(row.mediana_mes_anterior),
    historicas_sin_cierre: integer(row.historicas_sin_cierre), abiertas: integer(row.abiertas), apertura_invalida: integer(row.apertura_invalida),
    p90_edad_abiertas: optional(row.p90_edad_abiertas) };
  if (nextMonth(result.mes_anterior) !== result.ultimo_mes || nextMonth(result.ultimo_mes) > result.fecha_analisis) throw new Error('El período de resolución de OS no está completo.');
  return result;
}

export function serviceResolutionStory(data: Resolution): PanoramaStory {
  if (data.invalidas_ultimo_mes || data.invalidas_mes_anterior ||
      (data.cierres_ultimo_mes > 0) !== (data.mediana_ultimo_mes !== null) ||
      (data.cierres_mes_anterior > 0) !== (data.mediana_mes_anterior !== null)) throw new Error('La cohorte de resolución de OS no está completa.');
  const period = formatDate(data.ultimo_mes);
  const previous = formatDate(data.mes_anterior);
  return { id: 'servicios_pendientes', visitKey: `servicios_pendientes:resolucion-v1:${data.ultimo_mes}`,
    title: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron en resolverse las OS cerradas?',
    status: data.cierres_ultimo_mes ? 'ready' : 'empty',
    message: data.cierres_ultimo_mes ? `Mediana de ${data.cierres_ultimo_mes} OS cerradas en ${period}, con fechas válidas de apertura y cierre.` : `Sin OS con cierre operativo registrado en ${period}.`,
    scope: 'OS con cierre operativo registrado en el último mes calendario transcurrido; histórico sin fecha separado',
    sections: ['servicios.ordenes'], cutoff: null, periodLabel: period,
    primary: { label: 'Mediana de resolución', value: data.mediana_ultimo_mes, unit: 'days',
      ...(data.mediana_mes_anterior !== null ? { comparison: { value: data.mediana_mes_anterior, label: previous } } : {}) },
    supporting: [{ label: `OS cerradas en ${period}`, value: data.cierres_ultimo_mes, unit: 'count' },
      { label: `OS cerradas en ${previous}`, value: data.cierres_mes_anterior, unit: 'count' },
      { label: 'OS abiertas registradas', value: data.abiertas, unit: 'count' },
      { label: 'Percentil 90 de edad abierta', value: data.apertura_invalida ? null : data.p90_edad_abiertas, unit: 'days', note: data.apertura_invalida ? 'Edad no disponible: hay aperturas inválidas.' : undefined },
      { label: 'Cerradas históricas sin fecha', value: data.historicas_sin_cierre, unit: 'count' }],
    chart: data.mediana_ultimo_mes === null ? null : { kind: 'bars', title: 'Mediana de resolución por mes', unit: 'days', rows: [
      ...(data.mediana_mes_anterior === null ? [] : [{ label: previous, value: data.mediana_mes_anterior }]),
      { label: period, value: data.mediana_ultimo_mes },
    ] },
    breakdown: [{ label: `Cerradas en ${period}`, value: data.cierres_ultimo_mes, unit: 'count', route: `/servicios/ordenes?desde=${data.ultimo_mes}&hasta=${lastDay(data.ultimo_mes)}&estado=cerrada&cohorte=resolution` },
      { label: `Cerradas en ${previous}`, value: data.cierres_mes_anterior, unit: 'count', route: `/servicios/ordenes?desde=${data.mes_anterior}&hasta=${lastDay(data.mes_anterior)}&estado=cerrada&cohorte=resolution` },
      { label: 'Abiertas registradas', value: data.abiertas, unit: 'count', route: `/servicios/ordenes?estado=abierta&cohorte=open&desde=2000-01-01&hasta=${data.fecha_analisis}` }],
    details: [`La mediana usa fecha de cierre operativo menos fecha de apertura. ${data.historicas_sin_cierre} OS cerradas históricas carecen de fecha de cierre y quedan fuera, no cuentan como cero.`,
      'El mes indica cierres registrados en ese intervalo; no se acredita que la fuente esté completa hasta hoy. La variación observada de la mediana no demuestra por sí sola una mejora del servicio.',
      'Las OS abiertas y el percentil 90 de su edad son un resguardo: cerrar casos rápidos podría bajar la mediana mientras envejecen casos abiertos. Sin fecha prometida no se declara atraso.'],
    source: 'campi_resolucion_os_v1 · estado y fechas operativas de OS', route: '/servicios/ordenes',
  };
}

export function serviceOpenStory(data: Resolution, detail?: OpenDetail): PanoramaStory {
  if (data.apertura_invalida || (data.abiertas > 0) !== (data.p90_edad_abiertas !== null)) throw new Error('La cohorte de OS abiertas no está completa.');
  if (detail && (detail.abiertas !== data.abiertas || detail.fecha_analisis !== data.fecha_analisis)) throw new Error('El detalle de OS no corresponde al resumen.');
  return { id: 'servicios_abiertas', visitKey: `servicios_abiertas:cola-v1:${data.fecha_analisis}`,
    title: 'Órdenes de servicio abiertas', question: '¿Cuántas OS siguen abiertas y qué edad tienen?',
    status: 'ready', message: data.abiertas ? `${data.abiertas} OS figuran abiertas; el percentil 90 de edad es ${data.p90_edad_abiertas} días.` : 'No hay OS abiertas en la fuente consultada.',
    scope: 'OS con estado abierto y fecha de apertura operativa válida', sections: ['servicios.ordenes'], cutoff: null,
    periodLabel: formatDay(data.fecha_analisis),
    primary: { label: 'OS abiertas', value: data.abiertas, unit: 'count' },
    supporting: [{ label: 'Percentil 90 de edad', value: data.p90_edad_abiertas, unit: 'days' }],
    chart: detail?.edades.length ? { kind: 'bars', title: 'Edad de las órdenes abiertas', unit: 'count', rows: detail.edades.map(row => ({ label: row.rango, value: row.cantidad })) } : null,
    detailChart: detail && detail.cortes.length >= 2 ? { kind: 'trend', title: 'Evolución de OS abiertas en cortes importados', unit: 'count', rows: detail.cortes.map(row => ({ label: row.fecha.slice(5), value: row.abiertas })) } : null,
    secondaryCharts: detail?.marcas.length ? [{ kind: 'bars', title: 'OS abiertas por marca', unit: 'count', rows: detail.marcas.map(row => ({ label: row.nombre, value: row.cantidad })) }] : [],
    breakdown: detail ? [
      ...detail.marcas.map(row => ({ label: row.nombre, value: row.cantidad, unit: 'count' as const, group: 'Marcas' })),
      ...detail.edades.map(row => ({ label: row.rango, value: row.cantidad, unit: 'count' as const, group: 'Antigüedad' })),
    ] : [],
    details: ['La edad se calcula desde la apertura operativa hasta la fecha de análisis. El percentil 90 indica que nueve de cada diez OS abiertas tienen esa edad o menos.',
      'La fecha de análisis no acredita por sí sola que la fuente esté completa hasta hoy. La edad de una OS no acredita atraso sin una fecha comprometida verificable. Las aperturas inválidas bloquean el indicador en lugar de contarse como cero.'],
    source: 'campi_resolucion_os_v1 · estado y fechas operativas de OS', route: '/servicios/ordenes' };
}
