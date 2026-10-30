import type { PanoramaStory, PartsAlertCandidate } from './panoramaStoryTypes';

const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Candidato inválido.');
  return input as Record<string, unknown>;
};
const number = (input: unknown): number => {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) throw new Error('Cantidad de candidato inválida.');
  return input;
};
const integer = (input: unknown): number => {
  const result = number(input);
  if (!Number.isInteger(result)) throw new Error('Conteo de candidato inválido.');
  return result;
};
const day = (input: unknown): string => {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
      new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) !== input) throw new Error('Fecha de candidato inválida.');
  return input;
};
const text = (input: unknown): string => {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Identidad de candidato inválida.');
  return input;
};
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-8);

/** Optional per-code evidence from the reviewed RPC. Missing means unavailable, not zero. */
export function validatePartsAlertCandidates(story: PanoramaStory, raw: unknown, transitions?: { codigo: string; destino: string; dias_hasta: number; valor_usd: number }[]): PartsAlertCandidate[] {
  if (story.id !== 'repuestos_alertas' || !Array.isArray(raw)) throw new Error('Fichas de candidatos no disponibles.');
  const asOf = day(story.time?.classificationDate);
  const candidates = raw.map(input => {
    const row = object(input);
    const code = text(row.codigo);
    const currentColor = row.color_actual;
    const destination = row.destino;
    if (!((currentColor === 'LILA' && destination === 'GRIS') || (currentColor === 'GRIS' && destination === 'ROJO'))) throw new Error('Transición inválida.');
    const lastPurchase = day(row.ultima_compra);
    const ageDays = integer(row.dias_compra);
    const daysUntil = integer(row.dias_hasta);
    const actualAge = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${lastPurchase}T00:00:00Z`)) / 86400000;
    if (actualAge !== ageDays || daysUntil < 1 || daysUntil > 30 ||
        daysUntil !== (destination === 'GRIS' ? 366 : 1001) - ageDays) throw new Error('Umbral de candidato inválido.');
    const salesUnits: [number, number, number] = [number(row.unidades_anio_actual), number(row.unidades_anio_anterior), number(row.unidades_hace_dos_anios)];
    if (salesUnits.some(value => value !== 0)) throw new Error('Candidato con venta que modifica el color.');
    const kardexLoadedAt = row.kardex_cargado_en;
    if (kardexLoadedAt !== null && (typeof kardexLoadedAt !== 'string' || !Number.isFinite(Date.parse(kardexLoadedAt)))) throw new Error('Carga Kardex inválida.');
    const candidate: PartsAlertCandidate = {
      code,
      description: typeof row.descripcion === 'string' ? row.descripcion : '',
      currentColor,
      destination,
      lastPurchase,
      purchaseSource: text(row.fuente_compra),
      ageDays,
      daysUntil,
      stockUnits: number(row.stock_unidades),
      eligibleValueUsd: number(row.valor_usd),
      kardexLoadedAt: kardexLoadedAt as string | null,
      missingValueLocations: integer(row.ubicaciones_sin_valor),
      nonpositiveValueLocations: integer(row.ubicaciones_valor_no_positivo),
      mismatchedKardexLocations: integer(row.ubicaciones_saldo_distinto),
      salesUnits,
    };
    if (candidate.stockUnits <= 0) throw new Error('Candidato sin stock físico positivo.');
    return candidate;
  });
  if (new Set(candidates.map(row => row.code)).size !== candidates.length) throw new Error('Códigos de candidato duplicados.');
  if (transitions && (transitions.length !== candidates.length || candidates.some(row => {
    const transition = transitions.find(item => item.codigo === row.code);
    return !transition || transition.destino !== row.destination || transition.dias_hasta !== row.daysUntil || !close(transition.valor_usd, row.eligibleValueUsd);
  }))) throw new Error('Candidatos no concilian con transiciones.');
  const expectedCodes = story.supporting.find(row => row.label === 'Códigos expuestos')?.value;
  if (expectedCodes !== candidates.length || !close(candidates.reduce((sum, row) => sum + row.eligibleValueUsd, 0), story.primary?.value ?? NaN)) throw new Error('Candidatos sin conciliación total.');
  for (const destination of ['GRIS', 'ROJO'] as const) {
    const expected = story.changeBuckets
      ? { count: story.changeBuckets.reduce((sum, bucket) => sum + bucket[destination === 'GRIS' ? 'gris' : 'rojo'].count, 0),
          value: story.changeBuckets.reduce((sum, bucket) => sum + bucket[destination === 'GRIS' ? 'gris' : 'rojo'].value, 0) }
      : story.chart?.rows.find(row => row.label.toUpperCase() === destination);
    const matching = candidates.filter(row => row.destination === destination);
    if (!expected || expected.count !== matching.length || !close(expected.value ?? NaN, matching.reduce((sum, row) => sum + row.eligibleValueUsd, 0))) throw new Error('Candidatos sin conciliación por destino.');
  }
  return candidates;
}

export function withPartsAlertCandidateDetails(story: PanoramaStory, raw: unknown): PanoramaStory {
  if (story.id !== 'repuestos_alertas' || !raw || typeof raw !== 'object') return story;
  const response = raw as { candidatos_30d?: unknown; transiciones?: { codigo: string; destino: string; dias_hasta: number; valor_usd: number }[] };
  if (response.candidatos_30d === undefined) return story;
  try { return { ...story, partsAlertCandidates: validatePartsAlertCandidates(story, response.candidatos_30d, response.transiciones) }; }
  catch { return story; }
}
