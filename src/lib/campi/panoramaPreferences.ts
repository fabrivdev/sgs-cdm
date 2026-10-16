import type { SectionKey } from '@/lib/permissions';

export type PanoramaTopicGroup = 'Resultados' | 'Compromisos' | 'Disponibilidad' | 'Operación' | 'Abastecimiento';

const TOPICS = [
  { id: 'ventas_facturacion', label: 'Evolución de ventas y facturación', group: 'Resultados', sections: ['servicios.ventas', 'parque.ventas', 'repuestos.ventas'] },
  { id: 'repuestos_demanda', label: 'Demanda de repuestos', group: 'Resultados', sections: ['repuestos.ventas', 'repuestos.analisis'] },
  { id: 'maquinas_pedidos', label: 'Pedidos de máquinas por cumplir', group: 'Compromisos', sections: ['parque.operaciones'] },
  { id: 'servicios_pendientes', label: 'Órdenes de servicio pendientes', group: 'Compromisos', sections: ['servicios.ordenes'] },
  { id: 'maquinas_stock', label: 'Disponibilidad de máquinas', group: 'Disponibilidad', sections: ['parque.stock'] },
  { id: 'repuestos_stock', label: 'Stock y antigüedad de repuestos', group: 'Disponibilidad', sections: ['repuestos.stock', 'repuestos.analisis'] },
  { id: 'maquinas_proyeccion', label: 'Cobertura futura de máquinas', group: 'Disponibilidad', sections: ['parque.stock_proyectado'] },
  { id: 'servicios_trabajo', label: 'Trabajo realizado en servicios', group: 'Operación', sections: ['servicios.trabajos'] },
  { id: 'servicios_agenda', label: 'Agenda y capacidad de servicio', group: 'Operación', sections: ['servicios.planificador', 'servicios.calendario', 'servicios.flota'] },
  { id: 'maquinas_importacion', label: 'Importaciones y arribos de máquinas', group: 'Operación', sections: ['parque.importaciones'] },
  { id: 'maquinas_parque', label: 'Parque instalado y clientes', group: 'Operación', sections: ['parque.maquinas', 'parque.clientes'] },
  { id: 'repuestos_reposicion', label: 'Reposición y compras de repuestos', group: 'Abastecimiento', sections: ['repuestos.compras', 'repuestos.sugerencias'] },
  { id: 'servicios_comisiones', label: 'Comisiones del servicio', group: 'Resultados', sections: ['servicios.comisiones'], adminOnly: true },
] as const satisfies readonly { id: string; label: string; group: PanoramaTopicGroup; sections: readonly SectionKey[]; adminOnly?: boolean }[];

export type PanoramaTopicId = (typeof TOPICS)[number]['id'];
export type PanoramaTopic = (typeof TOPICS)[number];
export const PANORAMA_TOPICS: readonly PanoramaTopic[] = TOPICS;

export const panoramaStorageKey = (userId: string) => `sig-cdm:panorama:v4:${userId}`;

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
  return (saved ?? []).filter((id, index, all): id is PanoramaTopicId =>
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
