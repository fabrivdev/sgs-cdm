import { SECTION_ROUTES, type SectionKey } from '@/lib/permissions';

export type PanoramaTopicId = Exclude<SectionKey, `admin.${string}`>;
export type PanoramaTopicGroup = 'Ventas' | 'Servicios' | 'Parque' | 'Repuestos';

export interface PanoramaTopic {
  id: PanoramaTopicId;
  label: string;
  group: PanoramaTopicGroup;
  module: string;
  path: string;
  adminOnly?: boolean;
}

export const MAX_PANORAMA_PRIORITIES = 3;

const TOPIC_LABELS: Record<PanoramaTopicId, { label: string; group: PanoramaTopicGroup; adminOnly?: boolean }> = {
  'servicios.ventas': { label: 'Ventas de servicios', group: 'Ventas' },
  'servicios.planificador': { label: 'Planificación de servicios', group: 'Servicios' },
  'servicios.trabajos': { label: 'Trabajos de servicios', group: 'Servicios' },
  'servicios.calendario': { label: 'Calendario de servicios', group: 'Servicios' },
  'servicios.ordenes': { label: 'Órdenes de servicio', group: 'Servicios' },
  'servicios.flota': { label: 'Flota de servicios', group: 'Servicios' },
  'servicios.comisiones': { label: 'Comisiones de servicios', group: 'Servicios', adminOnly: true },
  'parque.ventas': { label: 'Ventas de máquinas', group: 'Ventas' },
  'parque.clientes': { label: 'Clientes de máquinas', group: 'Parque' },
  'parque.maquinas': { label: 'Parque de máquinas', group: 'Parque' },
  'parque.stock': { label: 'Stock de máquinas', group: 'Parque' },
  'parque.stock_proyectado': { label: 'Stock proyectado', group: 'Parque' },
  'parque.operaciones': { label: 'Pedidos y operaciones', group: 'Parque' },
  'parque.importaciones': { label: 'Importaciones de máquinas', group: 'Parque' },
  'repuestos.ventas': { label: 'Ventas de repuestos', group: 'Ventas' },
  'repuestos.stock': { label: 'Stock de repuestos', group: 'Repuestos' },
  'repuestos.analisis': { label: 'Análisis de repuestos', group: 'Repuestos' },
  'repuestos.compras': { label: 'Compras de repuestos', group: 'Repuestos' },
  'repuestos.sugerencias': { label: 'Sugerencias de compra', group: 'Repuestos' },
};

export const PANORAMA_TOPICS: readonly PanoramaTopic[] = SECTION_ROUTES
  .filter((section): section is typeof section & { id: PanoramaTopicId } => !section.id.startsWith('admin.'))
  .map(section => ({ ...TOPIC_LABELS[section.id], id: section.id, module: section.module, path: section.route }));

export const panoramaStorageKey = (userId: string) => `sig-cdm:panorama:v3:${userId}`;

export function availablePanoramaTopics(
  hasModule: (module: string) => boolean,
  hasSection: (section: string) => boolean,
  isAdmin: boolean,
) {
  return PANORAMA_TOPICS.filter(topic => hasModule(topic.module) && hasSection(topic.id) && (!topic.adminOnly || isAdmin));
}

export function reconcilePanoramaOrder(saved: readonly string[] | null, available: readonly PanoramaTopic[]) {
  const permitted = new Set(available.map(topic => topic.id));
  return (saved ?? []).filter((id, index, all): id is PanoramaTopicId =>
    permitted.has(id as PanoramaTopicId) && all.indexOf(id) === index,
  ).slice(0, MAX_PANORAMA_PRIORITIES);
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
  try { localStorage.setItem(panoramaStorageKey(userId), JSON.stringify(topics.slice(0, MAX_PANORAMA_PRIORITIES))); }
  catch { /* The page remains usable when browser storage is unavailable. */ }
}
