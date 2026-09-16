import { addDays, endOfYear, format, isValid, parseISO, startOfDay } from 'date-fns';
import { normalizarFacturacionDashboard, type DashboardFacturacionMovimiento } from './facturacionSource';

export type RangoFacturacion = { desde: string; hasta: string };
export type LoteFacturacion = { rows: DashboardFacturacionMovimiento[]; count: number };
type LeerLote = (rango: RangoFacturacion, signal: AbortSignal) => Promise<LoteFacturacion>;

export function rangosFacturacion(desde: string, hasta: string): RangoFacturacion[] {
  const inicio = parseISO(desde), fin = parseISO(hasta);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)
    || !isValid(inicio) || !isValid(fin) || desde > hasta) {
    throw new Error('Seleccioná un rango de fechas válido.');
  }
  const rangos: RangoFacturacion[] = [];
  for (let cursor = inicio; cursor <= fin;) {
    const cierre = endOfYear(cursor) < fin ? endOfYear(cursor) : fin;
    rangos.push({ desde: format(cursor, 'yyyy-MM-dd'), hasta: format(cierre, 'yyyy-MM-dd') });
    cursor = startOfDay(addDays(cierre, 1));
  }
  return rangos;
}

// Una evaluación por año, no una por cada página de 1.000 movimientos.
// El JSON escalar no está sujeto al límite de filas REST de Supabase.
export async function cargarFacturacionDashboard(
  desde: string, hasta: string, leer: LeerLote, signal: AbortSignal, timeoutMs = 45_000,
) {
  const rangos = rangosFacturacion(desde, hasta);
  const controller = new AbortController();
  const cancelar = () => controller.abort(signal.reason ?? new Error('Carga cancelada.'));
  signal.addEventListener('abort', cancelar, { once: true });
  if (signal.aborted) cancelar();
  const timer = setTimeout(() => controller.abort(new Error(
    'La consulta de facturación superó el tiempo de espera. No se muestran importes parciales.',
  )), timeoutMs);
  let rechazar: (reason: unknown) => void = () => {};
  const cancelacion = new Promise<never>((_, reject) => { rechazar = reject; });
  const interrumpir = () => rechazar(controller.signal.reason);
  controller.signal.addEventListener('abort', interrumpir, { once: true });
  const lotes: DashboardFacturacionMovimiento[][] = new Array(rangos.length);
  const comprobarCancelacion = () => {
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Carga cancelada.');
  };
  let siguiente = 0;
  const worker = async () => {
    while (siguiente < rangos.length) {
      comprobarCancelacion();
      const index = siguiente++;
      const lote = await leer(rangos[index], controller.signal);
      comprobarCancelacion();
      if (!lote || !Array.isArray(lote.rows) || !Number.isSafeInteger(lote.count)
        || lote.count !== lote.rows.length) {
        throw new Error('La facturación recibida está incompleta. No se muestran importes parciales.');
      }
      lotes[index] = lote.rows;
    }
  };
  try {
    comprobarCancelacion();
    await Promise.race([Promise.all(Array.from({ length: Math.min(2, rangos.length) }, worker)), cancelacion]);
    return lotes.flat().map(normalizarFacturacionDashboard);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancelar);
    controller.signal.removeEventListener('abort', interrumpir);
    controller.abort();
  }
}
