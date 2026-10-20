import type { SectionKey } from '@/lib/permissions';
import type { StoryTopicId } from './panoramaStoryTypes';
import { PANORAMA_CONTRACTS, type EnabledTopicId, type TopicContract } from './panoramaTopicContracts';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

export type PanoramaTopicId = StoryTopicId | 'repuestos_demanda' | 'servicios_trabajo' | 'servicios_agenda' | 'maquinas_importacion' | 'maquinas_parque' | 'repuestos_reposicion' | 'servicios_comisiones';
export type PanoramaTopic = { id: StoryTopicId; label: string; title: string; question: string; preview: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; definitionVersion: string; adminOnly?: boolean; contract?: TopicContract };
export const MAX_PANORAMA_TOPICS = 4;

const TOPIC_LABELS: readonly (Omit<PanoramaTopic, 'id' | 'contract'> & { id: EnabledTopicId })[] = [
  { id: 'ventas_evolucion', label: 'Evolución de ventas', title: 'Evolución de ventas', question: '¿Estamos vendiendo más o menos?', preview: 'Ventas antes de NC, mes y acumulado comparables.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'], definitionVersion: 'ventas-antes-nc-v1' },
  { id: 'ventas_facturacion', label: 'Facturación y notas de crédito', title: 'Facturación neta', question: '¿Cuánto quedó facturado después de las NC?', preview: 'Neto, ventas y NC por área autorizada.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'], definitionVersion: 'ventas-netas-nc-separadas-v3' },
  { id: 'maquinas_pedidos', label: 'Pedidos pendientes', title: 'Pedidos pendientes', question: '¿Cuántos pedidos tienen stock para facturar y cómo se abastece el resto?', preview: 'Total pendiente, proporción con stock, importaciones y unidades sin vínculo.', group: 'Compromisos', sections: ['parque.operaciones'], definitionVersion: 'pedidos-abastecimiento-v2' },
  { id: 'servicios_pendientes', label: 'Resolución de órdenes de servicio', title: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron en resolverse las OS cerradas?', preview: 'Mediana de cierres y resguardo de abiertas.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'resolucion-v1' },
  { id: 'servicios_abiertas', label: 'Órdenes de servicio abiertas', title: 'Órdenes de servicio abiertas', question: '¿Cuántas OS siguen abiertas y qué edad tienen?', preview: 'Volumen abierto y edad del 90% de las OS.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'cola-abierta-v1' },
  { id: 'repuestos_stock', label: 'Stock antiguo de repuestos', title: 'Stock antiguo de repuestos', question: '¿Qué valor de repuestos está en gris o rojo?', preview: 'Valor, proporción y cambios próximos de color.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'exposicion-valor-positivo-v1' },
  { id: 'repuestos_alertas', label: 'Cambios próximos de clasificación', title: 'Cambios próximos de clasificación', question: '¿Qué valor podría pasar a gris o rojo en 30 días?', preview: 'Importe y códigos, si no hay movimientos nuevos.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'transicion-30d-v1' },
  { id: 'repuestos_concentracion', label: 'Concentración del stock antiguo', title: 'Concentración del stock antiguo', question: '¿Qué familias concentran el valor antiguo?', preview: 'Participación de las tres familias principales.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'familias-top3-v1' },
  { id: 'repuestos_sucursales', label: 'Antigüedad de compra por sucursal', title: 'Antigüedad de repuestos por sucursal', question: '¿Cuánto tiempo hace desde la última compra por sucursal?', preview: 'Días ponderados por valor con compra fechada.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'antiguedad-ponderada-v3' },
];
export const PANORAMA_TOPICS: readonly PanoramaTopic[] = TOPIC_LABELS.map(topic => ({ ...topic, contract: PANORAMA_CONTRACTS[topic.id] }));
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
  const migrated = (saved ?? []).map(id => id === 'repuestos_clientes' ? 'ventas_facturacion' : id === 'maquinas_proyeccion' || id === 'maquinas_stock' ? 'maquinas_pedidos' : id);
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
