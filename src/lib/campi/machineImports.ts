import { importArrivalState, type ImportArrivalState } from '@/lib/machineImportStatus';
import { visibleMachineBrand } from '@/lib/machineBrands';
import { validDay } from './panoramaDates';
import type { PanoramaStory } from './panoramaStoryTypes';

export type MachineImportState = Exclude<ImportArrivalState, 'CANCELADO'>;
export const MACHINE_IMPORT_STATES: readonly { state: MachineImportState; label: string }[] = [
  { state: 'PLANIFICADO', label: 'Planificado' }, { state: 'EN_TRANSITO', label: 'En tránsito' },
  { state: 'ARRIBADO', label: 'Arribado' }, { state: 'COMPLETADO', label: 'Completado' },
];
export type MachineImportUnit = {
  id: string | null; importacion_linea_id: string | null; numero_unidad: number | null;
  chasis: string | null; eta: string | null; ata: string | null; estado_fuente: string | null;
  stock_fisico_confirmado: boolean | null; parque_confirmado: boolean | null;
  chasis_ambiguo: boolean | null; costo_stock_habilitado: boolean | null; estado_disponibilidad: string | null;
  marca?: string | null; proveedor?: string | null;
};
export type MachineImports = {
  observedAt: string; year: number; total: number; completed: number; completionPercent: number | null;
  states: Record<MachineImportState, number>;
  brands: { label: string; total: number; completed: number }[];
  excludedMissingETA: number; excludedOtherYears: number; excludedCancelled: number;
};

/** One operative unit. The same effective ETA defines the cohort in EVERY state. */
export function summarizeMachineImports(units: readonly MachineImportUnit[], asOf: string): MachineImports {
  if (!validDay(asOf)) throw new Error('Fecha de lectura inválida.');
  const year = Number(asOf.slice(0, 4));
  const result: MachineImports = { observedAt: asOf, year, total: 0, completed: 0, completionPercent: null,
    states: { PLANIFICADO: 0, EN_TRANSITO: 0, ARRIBADO: 0, COMPLETADO: 0 }, brands: [],
    excludedMissingETA: 0, excludedOtherYears: 0, excludedCancelled: 0 };
  const identities = new Map<string, string>();
  const cancelledIds = new Set<string>();
  const brands = new Map<string, { label: string; total: number; completed: number }>();
  for (const row of units) {
    const state = importArrivalState({ ...row, stock_fisico_confirmado: row.stock_fisico_confirmado ?? undefined,
      parque_confirmado: row.parque_confirmado ?? undefined, chasis_ambiguo: row.chasis_ambiguo ?? undefined,
      costo_stock_habilitado: row.costo_stock_habilitado ?? undefined });
    // Cancelled records do not compete for the chassis of an active unit.
    if (state === 'CANCELADO') { cancelledIds.add(row.id ?? `${row.importacion_linea_id}:${row.numero_unidad}`); continue; }
    const keys = [row.id ? `id:${row.id}` : '', row.importacion_linea_id && Number.isInteger(row.numero_unidad) && row.numero_unidad! > 0
      ? `unit:${row.importacion_linea_id}:${row.numero_unidad}` : ''].filter(Boolean);
    if (!keys.length) throw new Error('Unidad de importación sin identidad.');
    const chassis = String(row.chasis ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (chassis) keys.push(`chassis:${chassis}`);
    const brand = visibleMachineBrand(row.marca || row.proveedor);
    const fingerprint = JSON.stringify([row.id, row.importacion_linea_id, row.numero_unidad, chassis, state, row.ata, row.eta, brand]);
    const prior = keys.map(key => identities.get(key)).filter(Boolean);
    if (prior.some(value => value !== fingerprint)) throw new Error('Identidad de importación duplicada o contradictoria.');
    keys.forEach(key => identities.set(key, fingerprint));
    if (prior.length) continue;
    if (!row.eta || !validDay(row.eta)) { result.excludedMissingETA++; continue; }
    if (Number(row.eta.slice(0, 4)) !== year) { result.excludedOtherYears++; continue; }
    result.total++;
    result.states[state]++;
    const item = brands.get(brand) ?? { label: brand, total: 0, completed: 0 };
    item.total++;
    if (state === 'COMPLETADO') { result.completed++; item.completed++; }
    brands.set(brand, item);
  }
  result.excludedCancelled = cancelledIds.size;
  result.brands = [...brands.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'es'));
  result.completionPercent = result.total ? result.completed / result.total * 100 : null;
  return result;
}

export function machineImportsStory(data: MachineImports): PanoramaStory {
  return {
    id: 'maquinas_importacion', title: 'Importaciones de máquinas', question: '¿Qué proporción de las máquinas previstas para este año está completada?',
    sections: ['parque.importaciones'], route: '/parque-importaciones', source: 'maquinaria_importacion_unidades_operativas',
    status: data.total ? 'ready' : 'empty', message: data.total ? '' : `No hay máquinas con embarque estimado válido en ${data.year}.`,
    scope: `Máquinas previstas por embarque estimado efectivo de ${data.year}`, cutoff: null,
    time: { observedAt: data.observedAt }, periodLabel: `Previstas en ${data.year}`, machineImports: data,
    primary: { label: `Completadas sobre previstas en ${data.year}`, value: data.completionPercent, unit: 'percent' },
    supporting: [{ label: 'Máquinas previstas', value: data.total, unit: 'count' }, { label: 'Completadas', value: data.completed, unit: 'count' },
      { label: 'Sin embarque estimado válido', value: data.excludedMissingETA, unit: 'count' }, { label: 'Otros años de embarque', value: data.excludedOtherYears, unit: 'count' }],
    chart: { kind: 'bars', title: `Estado actual de las máquinas previstas en ${data.year}`, unit: 'count',
      rows: MACHINE_IMPORT_STATES.map(({ state, label }) => ({ label, value: data.states[state] })) },
    breakdown: data.brands.map(brand => ({ label: brand.label, value: brand.total, unit: 'count', note: `${brand.completed} completadas` })),
    details: [`Cohorte: embarque estimado efectivo (ETA) entre el 1 de enero y el 31 de diciembre de ${data.year}, para TODOS los estados. No se sustituye por ATA al completar.`,
      `${data.completed} completadas de ${data.total} previstas. Los cuatro estados son excluyentes y concilian con el mismo total y las mismas marcas.`,
      `Fuera del denominador: ${data.excludedMissingETA} sin ETA válida, ${data.excludedOtherYears} de otros años y ${data.excludedCancelled} canceladas.`,
      'Una unidad por identidad, sin sumar cantidades de lote ni duplicar evidencia de Stock/Parque. Completado exige confirmación física; ATA ausente no impide contar una completada con ETA del año.',
      'Estado actual de la programación vigente: reprogramar ETA puede cambiar la cohorte. No reconstruye el plan anual original ni mide fecha de finalización. La lectura no acredita actualización del origen.'],
  };
}
