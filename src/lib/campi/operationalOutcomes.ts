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
    sections: ['parque.operaciones'], cutoff: null, periodLabel: `Lectura ${data.fecha_analisis}`,
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
  if (nextMonth(result.mes_anterior) !== result.ultimo_mes || nextMonth(result.ultimo_mes) > result.fecha_analisis ||
      result.invalidas_ultimo_mes || result.invalidas_mes_anterior || result.apertura_invalida ||
      (result.cierres_ultimo_mes > 0) !== (result.mediana_ultimo_mes !== null) ||
      (result.cierres_mes_anterior > 0) !== (result.mediana_mes_anterior !== null) ||
      (result.abiertas > 0) !== (result.p90_edad_abiertas !== null)) throw new Error('La cohorte de resolución de OS no está completa.');
  return result;
}

export function serviceResolutionStory(data: Resolution): PanoramaStory {
  const period = formatDate(data.ultimo_mes);
  const previous = formatDate(data.mes_anterior);
  return { id: 'servicios_pendientes', visitKey: `servicios_pendientes:resolucion-v1:${data.ultimo_mes}`,
    title: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron en resolverse las OS cerradas?',
    status: data.cierres_ultimo_mes ? 'ready' : 'empty',
    message: data.cierres_ultimo_mes ? `Mediana de ${data.cierres_ultimo_mes} OS cerradas con apertura y cierre operativo en ${period}.` : `Sin OS con cierre operativo registrado en ${period}.`,
    scope: 'OS con cierre operativo registrado en el último mes calendario transcurrido; histórico sin fecha separado',
    sections: ['servicios.ordenes'], cutoff: null, periodLabel: period,
    primary: { label: 'Mediana de resolución', value: data.mediana_ultimo_mes, unit: 'days',
      ...(data.mediana_mes_anterior !== null ? { comparison: { value: data.mediana_mes_anterior, label: previous } } : {}) },
    supporting: [{ label: `OS cerradas en ${period}`, value: data.cierres_ultimo_mes, unit: 'count' },
      { label: `OS cerradas en ${previous}`, value: data.cierres_mes_anterior, unit: 'count' },
      { label: 'OS abiertas registradas', value: data.abiertas, unit: 'count' },
      { label: 'Percentil 90 de edad abierta', value: data.p90_edad_abiertas, unit: 'days' },
      { label: 'Cerradas históricas sin fecha', value: data.historicas_sin_cierre, unit: 'count' }],
    chart: { kind: 'bars', title: 'OS cerradas por mes', unit: 'count', rows: [{ label: previous, value: data.cierres_mes_anterior }, { label: period, value: data.cierres_ultimo_mes }] },
    breakdown: [{ label: `Cerradas en ${period}`, value: data.cierres_ultimo_mes, unit: 'count', route: `/servicios/ordenes?desde=${data.ultimo_mes}&hasta=${lastDay(data.ultimo_mes)}&estado=cerrada` },
      { label: `Cerradas en ${previous}`, value: data.cierres_mes_anterior, unit: 'count', route: `/servicios/ordenes?desde=${data.mes_anterior}&hasta=${lastDay(data.mes_anterior)}&estado=cerrada` },
      { label: 'Abiertas registradas', value: data.abiertas, unit: 'count', route: '/servicios/ordenes?estado=abierta' }],
    details: [`La mediana usa fecha de cierre operativo menos fecha de apertura. ${data.historicas_sin_cierre} OS cerradas históricas carecen de fecha de cierre y quedan fuera, no cuentan como cero.`,
      'El mes indica cierres registrados en ese intervalo; no se acredita que la fuente esté completa hasta hoy. La variación observada de la mediana no demuestra por sí sola una mejora del servicio.',
      'Las OS abiertas y el percentil 90 de su edad son un resguardo: cerrar casos rápidos podría bajar la mediana mientras envejecen casos abiertos. Sin fecha prometida no se declara atraso.'],
    source: 'campi_resolucion_os_v1 · estado y fechas operativas de OS', route: '/servicios/ordenes',
  };
}

export function serviceOpenStory(data: Resolution): PanoramaStory {
  return { id: 'servicios_abiertas', visitKey: `servicios_abiertas:cola-v1:${data.fecha_analisis}`,
    title: 'Órdenes de servicio abiertas', question: '¿Cuántas OS siguen abiertas y qué edad tienen?',
    status: 'ready', message: data.abiertas ? `${data.abiertas} OS figuran abiertas; el percentil 90 de edad es ${data.p90_edad_abiertas} días.` : 'No hay OS abiertas en la fuente consultada.',
    scope: 'OS con estado abierto y fecha de apertura operativa válida', sections: ['servicios.ordenes'], cutoff: null,
    periodLabel: `Lectura ${formatDate(data.fecha_analisis)}`,
    primary: { label: 'OS abiertas', value: data.abiertas, unit: 'count' },
    supporting: [{ label: 'Percentil 90 de edad', value: data.p90_edad_abiertas, unit: 'days' }],
    chart: data.abiertas ? { kind: 'bars', title: 'Cola abierta', unit: 'count', rows: [{ label: 'Abiertas', value: data.abiertas }] } : null,
    breakdown: [{ label: 'Órdenes abiertas', value: data.abiertas, unit: 'count', route: '/servicios/ordenes?estado=abierta' }],
    details: ['La edad se calcula desde la apertura operativa hasta la fecha de análisis. El percentil 90 indica que nueve de cada diez OS abiertas tienen esa edad o menos.',
      'La fecha de análisis no acredita por sí sola que la fuente esté completa hasta hoy. La edad de una OS no acredita atraso sin una fecha comprometida verificable. Las aperturas inválidas bloquean el indicador en lugar de contarse como cero.'],
    source: 'campi_resolucion_os_v1 · estado y fechas operativas de OS', route: '/servicios/ordenes' };
}
