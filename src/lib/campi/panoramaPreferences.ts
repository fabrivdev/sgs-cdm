import type { SectionKey } from '@/lib/permissions';
import type { StoryTopicId } from './panoramaStoryTypes';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

export type PanoramaTopicId = StoryTopicId | 'repuestos_demanda' | 'servicios_trabajo' | 'servicios_agenda' | 'maquinas_importacion' | 'maquinas_parque' | 'repuestos_reposicion' | 'servicios_comisiones';
export type PanoramaTopic = { id: StoryTopicId; label: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; adminOnly?: boolean };

export const PANORAMA_TOPICS: readonly PanoramaTopic[] = [
  { id: 'ventas_facturacion', label: 'Cómo viene la facturación', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'] },
  { id: 'repuestos_clientes', label: 'Clientes con facturación de repuestos', group: 'Resultados', sections: ['repuestos.ventas'] },
  { id: 'maquinas_pedidos', label: 'Cuánto queda pendiente en pedidos de máquinas', group: 'Compromisos', sections: ['parque.operaciones'] },
  { id: 'servicios_pendientes', label: 'Qué órdenes de servicio siguen abiertas', group: 'Compromisos', sections: ['servicios.ordenes'] },
  { id: 'repuestos_sucursales', label: 'Cómo se distribuyen los repuestos por sucursal', group: 'Disponibilidad', sections: ['repuestos.analisis'] },
  { id: 'repuestos_stock', label: 'Qué parte del stock necesita revisión', group: 'Disponibilidad', sections: ['repuestos.analisis'] },
  { id: 'maquinas_stock', label: 'Qué máquinas hay en stock', group: 'Disponibilidad', sections: ['parque.stock'] },
  { id: 'maquinas_proyeccion', label: 'Cómo cambia la disponibilidad de máquinas', group: 'Disponibilidad', sections: ['parque.stock_proyectado'] },
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
  return (saved ?? []).filter((id, index, all): id is StoryTopicId =>
    permitted.has(id) && all.indexOf(id) === index,
  );
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
  try { localStorage.setItem(panoramaStorageKey(userId), JSON.stringify(topics)); }
  catch { /* The page remains usable when browser storage is unavailable. */ }
}
