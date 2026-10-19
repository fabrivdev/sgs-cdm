import { SEMAFORO_COLORES } from '@/hooks/useSemaforoHistorico';
import type { PanoramaStory } from './panoramaStoryTypes';

type Group = { nombre: string; valor_total_usd: number; valor_antiguo_usd: number; codigos_antiguos: number };
type Color = { color: string; codigos: number; valor_usd: number };
type Alert = { destino: 'GRIS' | 'ROJO'; umbral_dias: number; codigos: number; valor_usd: number };
type Exposure = {
  fecha_analisis: string; codigos_stock: number; ubicaciones_stock: number;
  ubicaciones_sin_valor: number; ubicaciones_valor_no_positivo: number;
  ubicaciones_sin_saldo_kardex: number; ubicaciones_saldo_distinto: number;
  valor_total_usd: number; valor_antiguo_usd: number; codigos_antiguos: number;
  valor_sin_fecha_usd: number; valor_residual_sin_stock_usd: number;
  colores: Color[]; avisos: Alert[]; sucursales: Group[]; familias: Group[];
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El resumen de stock antiguo es inválido.');
  return value as Record<string, unknown>;
};
const numeric = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('El resumen de stock antiguo contiene valores incompletos.');
  return value;
};
const integer = (value: unknown): number => {
  const n = numeric(value);
  if (!Number.isInteger(n)) throw new Error('El resumen de stock antiguo contiene cantidades inválidas.');
  return n;
};
const groups = (value: unknown): Group[] => {
  if (!Array.isArray(value)) throw new Error('Falta el desglose de stock antiguo.');
  return value.map(item => {
    const row = record(item);
    if (typeof row.nombre !== 'string' || !row.nombre) throw new Error('Grupo de stock antiguo inválido.');
    return { nombre: row.nombre, valor_total_usd: numeric(row.valor_total_usd), valor_antiguo_usd: numeric(row.valor_antiguo_usd), codigos_antiguos: integer(row.codigos_antiguos) };
  });
};
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-8);

export function parsePartsExposure(input: unknown): Exposure {
  const data = record(input);
  if (typeof data.fecha_analisis !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_analisis)) throw new Error('Falta la fecha de clasificación.');
  if (!Array.isArray(data.colores) || !Array.isArray(data.avisos)) throw new Error('Falta la distribución de stock antiguo.');
  const colors = data.colores.map(item => {
    const row = record(item);
    if (!SEMAFORO_COLORES.some(color => color.id === row.color)) throw new Error('Color histórico desconocido.');
    return { color: String(row.color), codigos: integer(row.codigos), valor_usd: numeric(row.valor_usd) };
  });
  if (new Set(colors.map(row => row.color)).size !== colors.length) throw new Error('Colores históricos repetidos.');
  const alerts = data.avisos.map(item => {
    const row = record(item);
    if (row.destino !== 'GRIS' && row.destino !== 'ROJO') throw new Error('Aviso de color desconocido.');
    return { destino: row.destino, umbral_dias: integer(row.umbral_dias), codigos: integer(row.codigos), valor_usd: numeric(row.valor_usd) };
  });
  if (alerts.length !== 2 || new Set(alerts.map(row => row.destino)).size !== 2 || alerts.some(row => row.umbral_dias !== (row.destino === 'GRIS' ? 366 : 1001))) throw new Error('Avisos de color incompletos.');
  const parsed: Exposure = {
    fecha_analisis: data.fecha_analisis,
    codigos_stock: integer(data.codigos_stock), ubicaciones_stock: integer(data.ubicaciones_stock),
    ubicaciones_sin_valor: integer(data.ubicaciones_sin_valor), ubicaciones_valor_no_positivo: integer(data.ubicaciones_valor_no_positivo),
    ubicaciones_sin_saldo_kardex: integer(data.ubicaciones_sin_saldo_kardex), ubicaciones_saldo_distinto: integer(data.ubicaciones_saldo_distinto),
    valor_total_usd: numeric(data.valor_total_usd), valor_antiguo_usd: numeric(data.valor_antiguo_usd),
    codigos_antiguos: integer(data.codigos_antiguos), valor_sin_fecha_usd: numeric(data.valor_sin_fecha_usd),
    valor_residual_sin_stock_usd: numeric(data.valor_residual_sin_stock_usd),
    colores: colors, avisos: alerts, sucursales: groups(data.sucursales), familias: groups(data.familias),
  };
  if (parsed.valor_antiguo_usd > parsed.valor_total_usd + 0.02 ||
      !close(colors.reduce((sum, row) => sum + row.valor_usd, 0), parsed.valor_total_usd) ||
      !close(colors.filter(row => row.color === 'GRIS' || row.color === 'ROJO').reduce((sum, row) => sum + row.valor_usd, 0), parsed.valor_antiguo_usd) ||
      !close(parsed.sucursales.reduce((sum, row) => sum + row.valor_total_usd, 0), parsed.valor_total_usd) ||
      !close(parsed.familias.reduce((sum, row) => sum + row.valor_total_usd, 0), parsed.valor_total_usd) ||
      alerts.some(row => row.valor_usd > parsed.valor_total_usd + 0.02)) throw new Error('La distribución de stock antiguo no concilia.');
  return parsed;
}

export function partsExposureStory(data: Exposure): PanoramaStory {
  const pct = data.valor_total_usd > 0 ? data.valor_antiguo_usd / data.valor_total_usd * 100 : null;
  const labels = new Map(SEMAFORO_COLORES.map(color => [color.id, color.label]));
  const activeAlerts = data.avisos.filter(row => row.codigos > 0 && row.valor_usd > 0).sort((a, b) => a.destino === 'ROJO' ? -1 : b.destino === 'ROJO' ? 1 : 0);
  const link = (row: Alert) => row.destino === 'ROJO'
    ? '/repuestos/analisis?color=GRIS&compra_dias_min=971&compra_dias_max=1000&vista=detalle'
    : '/repuestos/analisis?color=LILA&compra_dias_min=336&compra_dias_max=365&vista=detalle';
  return {
    id: 'repuestos_stock', visitKey: `repuestos_stock:exposicion-v1:${data.fecha_analisis}`,
    title: 'Stock antiguo de repuestos', question: '¿Qué valor de repuestos está en gris o rojo?',
    status: data.codigos_stock ? 'ready' : 'empty',
    message: data.codigos_stock ? `${data.codigos_antiguos} códigos en gris o rojo; ${pct === null ? 'sin porcentaje verificable' : `${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(pct)}% del valor positivo valorizado`}.` : 'No hay repuestos con stock físico positivo.',
    scope: 'Códigos REP con stock físico positivo; valor positivo referencial del Kardex por ubicación',
    sections: ['repuestos.analisis'], cutoff: null, periodLabel: `Clasificación ${data.fecha_analisis}`,
    primary: { label: 'Valor de stock gris y rojo', value: data.valor_antiguo_usd, unit: 'USD' },
    supporting: [
      { label: 'Valor positivo valorizado', value: data.valor_total_usd, unit: 'USD' },
      { label: 'Participación de stock antiguo', value: pct, unit: 'percent' },
      { label: 'Códigos en gris y rojo', value: data.codigos_antiguos, unit: 'count' },
      { label: 'Valor sin fecha de compra', value: data.valor_sin_fecha_usd, unit: 'USD' },
      { label: 'Ubicaciones sin valor', value: data.ubicaciones_sin_valor, unit: 'count' },
    ],
    chart: { kind: 'bars', title: 'Valor de stock antiguo por color', unit: 'USD', rows: ['ROJO', 'GRIS'].map(color => ({ label: labels.get(color as typeof SEMAFORO_COLORES[number]['id']) ?? color, value: data.colores.find(row => row.color === color)?.valor_usd ?? 0 })) },
    breakdown: [
      ...activeAlerts.map(row => ({ label: `Próximo a ${row.destino.toLowerCase()} · ${row.codigos} códigos`, value: row.valor_usd, unit: 'USD' as const, route: link(row), note: 'Cambio posible en 1–30 días si no hay nuevas compras ni ventas.' })),
      ...data.colores.filter(row => row.valor_usd > 0).map(row => ({ label: `${labels.get(row.color as typeof SEMAFORO_COLORES[number]['id']) ?? row.color} · ${row.codigos} códigos`, value: row.valor_usd, unit: 'USD' as const, route: `/repuestos/analisis?color=${row.color}&vista=detalle` })),
      ...data.sucursales.filter(row => row.valor_antiguo_usd > 0).map(row => ({ label: `${row.nombre} · stock antiguo`, value: row.valor_antiguo_usd, unit: 'USD' as const, route: `/repuestos/analisis?sucursal=${encodeURIComponent(row.nombre)}&vista=detalle`, note: `${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(row.valor_antiguo_usd / row.valor_total_usd * 100)}% del valor positivo de la sucursal; filtrá gris y rojo en el análisis` })),
      ...data.familias.filter(row => row.valor_antiguo_usd > 0).map(row => ({ label: `${row.nombre} · stock antiguo`, value: row.valor_antiguo_usd, unit: 'USD' as const, route: `/repuestos/analisis?familia=${encodeURIComponent(row.nombre)}&vista=detalle`, note: `${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(row.valor_antiguo_usd / row.valor_total_usd * 100)}% del valor positivo de la familia; filtrá gris y rojo en el análisis` })),
    ],
    details: [
      'Gris: sin ventas en los tres años evaluados y última compra hace 366–1.000 días. Rojo: misma ausencia de ventas y última compra hace más de 1.000 días.',
      'La proporción usa solo valor USD positivo en ubicaciones con stock físico positivo. El Kardex es referencial, no una valoración contable.',
      `Cobertura: ${data.ubicaciones_stock} ubicaciones con stock; ${data.ubicaciones_sin_valor} sin valor, ${data.ubicaciones_valor_no_positivo} con valor no positivo, ${data.ubicaciones_sin_saldo_kardex} sin saldo Kardex y ${data.ubicaciones_saldo_distinto} con saldo distinto. Valor positivo en ubicaciones sin stock: USD ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(data.valor_residual_sin_stock_usd)}; excluido.`,
      'La fecha de clasificación no acredita el corte del inventario. Los avisos se recalculan al abrir Panorama y solo proyectan el paso de color si no hay nuevos movimientos.',
    ],
    source: 'campi_repuestos_exposicion_v1 · semáforo histórico, stock y Kardex', route: '/repuestos/analisis',
    notices: activeAlerts.map(row => ({ text: `${row.codigos} códigos, USD ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(row.valor_usd)}, podrían pasar a ${row.destino.toLowerCase()} en 1–30 días`, route: link(row) })),
  };
}
