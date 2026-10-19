import type { SectionKey } from '@/lib/permissions';
import type { StoryTopicId } from './panoramaStoryTypes';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

export type PanoramaTopicId = StoryTopicId | 'repuestos_demanda' | 'servicios_trabajo' | 'servicios_agenda' | 'maquinas_importacion' | 'maquinas_parque' | 'repuestos_reposicion' | 'servicios_comisiones';
export type PanoramaTopic = { id: StoryTopicId; label: string; question: string; preview: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; adminOnly?: boolean };
export const MAX_PANORAMA_TOPICS = 4;

export const PANORAMA_TOPICS: readonly PanoramaTopic[] = [
  { id: 'ventas_facturacion', label: 'Facturación y notas de crédito', question: '¿Cuánto quedó neto después de las NC?', preview: 'Neto, ventas y NC por área autorizada.', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'] },
  { id: 'maquinas_pedidos', label: 'Abastecimiento de pedidos activos', question: '¿Qué unidades activas no tienen vínculo único?', preview: 'Vínculos con stock e importaciones; no mide atraso.', group: 'Compromisos', sections: ['parque.operaciones'] },
  { id: 'servicios_pendientes', label: 'Resolución de órdenes de servicio', question: '¿Cuánto tardaron las OS cerradas?', preview: 'Mediana de cierres y resguardo de abiertas.', group: 'Operación', sections: ['servicios.ordenes'] },
  { id: 'repuestos_stock', label: 'Stock antiguo de repuestos', question: '¿Qué valor está en gris o rojo?', preview: 'Valor USD, proporción y cambios próximos de color.', group: 'Disponibilidad', sections: ['repuestos.analisis'] },
  { id: 'repuestos_sucursales', label: 'Antigüedad de compra por sucursal', question: '¿Dónde se concentra el tiempo desde la última compra?', preview: 'Días ponderados por valor USD con compra fechada.', group: 'Disponibilidad', sections: ['repuestos.analisis'] },
  { id: 'maquinas_stock', label: 'Composición del stock físico', question: '¿Cuántas máquinas nuevas y usadas hay?', preview: 'Existencias físicas; corte de fuente no acreditado.', group: 'Disponibilidad', sections: ['parque.stock'] },
];

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
  const migrated = (saved ?? []).map(id => id === 'repuestos_clientes' ? 'ventas_facturacion' : id === 'maquinas_proyeccion' ? 'maquinas_stock' : id);
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
  if (!userId) return;
  try { localStorage.setItem(panoramaStorageKey(userId), JSON.stringify(topics.slice(0, MAX_PANORAMA_TOPICS))); }
  catch { /* The page remains usable when browser storage is unavailable. */ }
}
