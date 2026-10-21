import type { SectionKey } from '@/lib/permissions';
import type { StoryTopicId } from './panoramaStoryTypes';
import { PANORAMA_CONTRACTS, type EnabledTopicId, type TopicContract } from './panoramaTopicContracts';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

export type PanoramaTopicId = StoryTopicId;
export type PanoramaTopic = { id: StoryTopicId; label: string; title: string; question: string; preview: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; requiresAllSections?: boolean; definitionVersion: string; adminOnly?: boolean; contract?: TopicContract };
export const MAX_PANORAMA_TOPICS = 4;

const TOPIC_LABELS: readonly (Omit<PanoramaTopic, 'id' | 'contract'> & { id: EnabledTopicId })[] = [
  { id: 'ventas_evolucion', label: 'Evolución de ventas', title: 'Evolución de ventas', question: '¿Estamos vendiendo más o menos?', preview: 'Variación de ventas antes de NC frente al mismo tramo LY.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'], definitionVersion: 'ventas-variacion-v2' },
  { id: 'ventas_facturacion', label: 'Facturación y notas de crédito', title: 'Facturación neta', question: '¿Cuánto quedó facturado después de las NC?', preview: 'Neto, ventas y NC por área autorizada.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'], definitionVersion: 'ventas-netas-nc-separadas-v3' },
  { id: 'maquinas_pedidos', label: 'Pedidos pendientes', title: 'Pedidos pendientes', question: '¿Cuántos pedidos pendientes tienen stock vinculado y cómo se abastece el resto?', preview: 'Total pendiente, proporción con stock, importaciones y unidades sin vínculo.', group: 'Compromisos', sections: ['parque.operaciones'], definitionVersion: 'pedidos-abastecimiento-v2' },
  { id: 'servicios_pendientes', label: 'Resolución de órdenes de servicio', title: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron en resolverse las OS cerradas?', preview: 'Mediana de cierres y resguardo de abiertas.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'resolucion-v1' },
  { id: 'servicios_os_facturadas', label: 'OS facturadas a clientes', title: 'OS facturadas a clientes', question: '¿Qué porcentaje de las OS cerradas se facturó a clientes?', preview: 'OS cerradas con tipo Cliente y factura positiva vinculada.', group: 'Operación', sections: ['servicios.ordenes', 'servicios.ventas'], requiresAllSections: true, definitionVersion: 'os-facturadas-cliente-v1' },
  { id: 'repuestos_stock', label: 'Stock antiguo de repuestos', title: 'Stock antiguo de repuestos', question: '¿Qué valor de repuestos está en gris o rojo?', preview: 'Valor, proporción y cambios próximos de color.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'exposicion-valor-positivo-v1' },
  { id: 'repuestos_alertas', label: 'Cambios próximos de clasificación', title: 'Cambios próximos de clasificación', question: '¿Qué valor podría pasar a gris o rojo en 30 días?', preview: 'Importe y códigos, si no hay movimientos nuevos.', group: 'Disponibilidad', sections: ['repuestos.analisis'], definitionVersion: 'transicion-30d-v1' },
  { id: 'agenda_cumplimiento', label: 'Cumplimiento de agenda', title: 'Cumplimiento de agenda', question: '¿Estamos cumpliendo la agenda de trabajos?', preview: 'Compromisos evaluables completados en el período.', group: 'Operación', sections: ['servicios.planificador'], definitionVersion: 'agenda-cumplimiento-v1' },
  { id: 'servicios_productividad', label: 'Productividad de servicios', title: 'Productividad de servicios', question: '¿Qué proporción de las horas disponibles estamos trabajando?', preview: 'Horas trabajadas frente a capacidad disponible.', group: 'Operación', sections: ['servicios.ordenes'], definitionVersion: 'servicios-productividad-v1' },
  { id: 'servicios_eficiencia', label: 'Eficiencia de servicios', title: 'Eficiencia de servicios', question: '¿Cuántas horas facturamos por cada hora trabajada?', preview: 'Horas facturadas frente a horas de OS cerradas conciliadas.', group: 'Operación', sections: ['servicios.ordenes', 'servicios.ventas'], requiresAllSections: true, definitionVersion: 'servicios-eficiencia-v1' },
  { id: 'clientes_retencion', label: 'Retención de clientes', title: 'Retención de clientes', question: '¿Qué proporción de nuestros clientes vuelve a comprarnos?', preview: 'Compradores retenidos de una cohorte comparable.', group: 'Resultados', sections: ['parque.maquinas'], definitionVersion: 'clientes-retencion-v1' },
  { id: 'clientes_cobertura_posventa', label: 'Cobertura de posventa', title: 'Cobertura de posventa', question: '¿A qué proporción de los clientes del parque llegamos con servicios o repuestos?', preview: 'Propietarios del parque con compra de posventa.', group: 'Resultados', sections: ['parque.maquinas'], definitionVersion: 'clientes-cobertura-v1' },
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
    const permitted = topic.sections.map(section => hasModule(section.split('.')[0]) && hasSection(section));
    return topic.requiresAllSections ? permitted.every(Boolean) : permitted.some(Boolean);
  });
}

export function reconcilePanoramaOrder(saved: readonly string[] | null, available: readonly PanoramaTopic[]) {
  const permitted = new Set<string>(available.map(topic => topic.id));
  const migrated = (saved ?? []).map(id => id === 'servicios_os_antiguas' ? 'servicios_os_facturadas' : id);
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
