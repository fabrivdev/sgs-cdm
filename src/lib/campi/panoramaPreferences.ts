import type { SectionKey } from '@/lib/permissions';
import type { StoryTopicId } from './panoramaStoryTypes';
import { PANORAMA_CONTRACTS, type EnabledTopicId, type TopicContract } from './panoramaTopicContracts';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

export type PanoramaTopicId = StoryTopicId | 'repuestos_demanda' | 'servicios_trabajo' | 'servicios_agenda' | 'maquinas_importacion' | 'maquinas_parque' | 'repuestos_reposicion' | 'servicios_comisiones';
export type PanoramaTopic = { id: StoryTopicId; label: string; title: string; question: string; preview: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; definitionVersion: string; adminOnly?: boolean; contract?: TopicContract };
export const MAX_PANORAMA_TOPICS = 4;

const TOPIC_LABELS: readonly (Omit<PanoramaTopic, 'id' | 'contract'> & { id: EnabledTopicId })[] = [
  { id: 'ventas_facturacion', label: 'Facturación y NC', title: 'Facturación y NC', question: '¿Cuánto facturamos y cómo cambió frente al año anterior?', preview: 'Neto, ventas antes de NC, NC y evolución anual comparables.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'], definitionVersion: 'ventas-netas-nc-separadas-v3' },
  { id: 'maquinas_pedidos', label: 'Pedidos de máquinas', title: 'Pedidos pendientes', question: '¿Qué parte de los pedidos pendientes tiene stock para facturar?', preview: 'Pedidos, proporción con stock y abastecimiento de las unidades.', group: 'Compromisos', sections: ['parque.operaciones'], definitionVersion: 'pedidos-abastecimiento-v2' },
  { id: 'servicios_pendientes', label: 'Tiempo de resolución de OS', title: 'Resolución de OS', question: '¿Cuánto tardamos en cerrar las OS?', preview: 'Mediana de cierre frente al mes anterior y volumen resuelto.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'resolucion-v1' },
  { id: 'servicios_abiertas', label: 'OS abiertas', title: 'OS abiertas', question: '¿Cómo se distribuye el trabajo que sigue abierto?', preview: 'OS abiertas, antigüedad, marca y evolución entre cortes.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'cola-abierta-v1' },
  { id: 'repuestos_stock', label: 'Stock antiguo de repuestos', title: 'Stock antiguo de repuestos', question: '¿Qué valor y proporción del stock está en gris o rojo?', preview: 'USD, porcentaje, familias, sucursales y cambios próximos de color.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'exposicion-valor-positivo-v1' },
];
export const PANORAMA_TOPICS: readonly PanoramaTopic[] = TOPIC_LABELS.map(topic => ({ ...topic, contract: PANORAMA_CONTRACTS[topic.id] }));
/** Candidates stay out of the selector until their denominators, dates and grants are verified. */
export const PANORAMA_PENDING_TOPICS = [
  { id: 'clientes_actividad', question: '¿Qué clientes compran, regresan o dejan de comprar?', module: 'Ventas / Clientes',
    kpi: 'Compradores activos y recurrentes de una cohorte comparable',
    comparison: 'Mismo período del año anterior y cohorte base definida',
    missing: 'Identidad canónica entre áreas, ventas positivas netas de anulaciones, historia suficiente y permisos por módulo.' },
  { id: 'maquinas_parque', question: '¿Cómo evoluciona el parque instalado en clientes?', module: 'Parque',
    kpi: 'Altas y bajas netas de máquinas instaladas por período efectivo',
    comparison: 'Altas y bajas del mismo período del año anterior',
    missing: 'Fechas efectivas completas de altas y bajas; transferencias y refacturaciones no pueden contar como altas.' },
] as const;
export const panoramaTopicDefinition = (id: StoryTopicId) => PANORAMA_TOPICS.find(topic => topic.id === id);

export const panoramaStorageKey = (userId: string) => `sig-cdm:panorama:alternativa:v1:${userId}`;

export function availablePanoramaTopics(
  hasModule: (module: string) => boolean,
  hasSection: (section: string) => boolean,
  isAdmin: boolean,
) {
  return PANORAMA_TOPICS.filter(topic => {
    if ('adminOnly' in topic && topic.adminOnly && !isAdmin) return false;
    return topic.sections.some(section => hasModule(section.split('.')[0]) && hasSection(section));
  });
}

export function reconcilePanoramaOrder(saved: readonly string[] | null, available: readonly PanoramaTopic[]) {
  const permitted = new Set<string>(available.map(topic => topic.id));
  const migrated = (saved ?? []).map(id => {
    if (id === 'ventas_evolucion' || id === 'repuestos_clientes') return 'ventas_facturacion';
    if (id === 'repuestos_alertas' || id === 'repuestos_concentracion' || id === 'repuestos_sucursales') return 'repuestos_stock';
    if (id === 'maquinas_proyeccion' || id === 'maquinas_stock') return 'maquinas_pedidos';
    return id;
  });
  return migrated.filter((id, index, all): id is StoryTopicId =>
    permitted.has(id) && all.indexOf(id) === index,
  ).slice(0, MAX_PANORAMA_TOPICS);
}

export function readPanoramaPreferences(userId: string): PanoramaTopicId[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(panoramaStorageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed as PanoramaTopicId[] : null;
  } catch { return null; }
}

export function savePanoramaPreferences(userId: string, topics: readonly PanoramaTopicId[]) {
  if (!userId) return false;
  try {
    const serialized = JSON.stringify(topics.slice(0, MAX_PANORAMA_TOPICS));
    localStorage.setItem(panoramaStorageKey(userId), serialized);
    return localStorage.getItem(panoramaStorageKey(userId)) === serialized;
  } catch { return false; }
}
