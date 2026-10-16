export type PanoramaAreaId = 'ventas' | 'repuestos' | 'parque' | 'servicios' | 'importaciones';

export interface PanoramaArea {
  id: PanoramaAreaId;
  label: string;
  routes: readonly { section: string; path: string; label: string }[];
}

export const MAX_PANORAMA_PRIORITIES = 3;

export const PANORAMA_AREAS: readonly PanoramaArea[] = [
  { id: 'ventas', label: 'Ventas y facturación', routes: [
    { section: 'servicios.ventas', path: '/servicios/ventas', label: 'Servicios' },
    { section: 'parque.ventas', path: '/parque-ventas', label: 'Máquinas' },
    { section: 'repuestos.ventas', path: '/repuestos/ventas', label: 'Repuestos' },
  ] },
  { id: 'repuestos', label: 'Stock de repuestos', routes: [
    { section: 'repuestos.analisis', path: '/repuestos/analisis', label: 'Análisis' },
    { section: 'repuestos.stock', path: '/repuestos', label: 'Catálogo y stock' },
    { section: 'repuestos.sugerencias', path: '/repuestos/sugerencias', label: 'Sugerencia de compra' },
  ] },
  { id: 'parque', label: 'Parque y disponibilidad', routes: [
    { section: 'parque.stock', path: '/parque-stock', label: 'Stock' },
    { section: 'parque.maquinas', path: '/parque-maquinas', label: 'Máquinas' },
    { section: 'parque.operaciones', path: '/parque-operaciones', label: 'Operaciones' },
  ] },
  { id: 'servicios', label: 'Órdenes y trabajos', routes: [
    { section: 'servicios.ordenes', path: '/servicios/ordenes', label: 'Órdenes de servicio' },
    { section: 'servicios.trabajos', path: '/trabajos', label: 'Trabajos' },
  ] },
  { id: 'importaciones', label: 'Importaciones', routes: [
    { section: 'parque.importaciones', path: '/parque-importaciones', label: 'Importaciones' },
  ] },
];

export const panoramaStorageKey = (userId: string) => `sig-cdm:panorama:v2:${userId}`;
const legacyStorageKey = (userId: string) => `sig-cdm:panorama:v1:${userId}`;

export function availablePanoramaAreas(hasSection: (section: string) => boolean) {
  return PANORAMA_AREAS.map(area => ({
    ...area,
    routes: area.routes.filter(route => hasSection(route.section)),
  })).filter(area => area.routes.length > 0);
}

export function reconcilePanoramaOrder(saved: readonly string[] | null, available: readonly PanoramaArea[]) {
  const permitted = new Set(available.map(area => area.id));
  return (saved ?? []).filter((id, index, all): id is PanoramaAreaId =>
    permitted.has(id as PanoramaAreaId) && all.indexOf(id) === index,
  ).slice(0, MAX_PANORAMA_PRIORITIES);
}

export function readPanoramaPreferences(userId: string): PanoramaAreaId[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(panoramaStorageKey(userId)) ?? localStorage.getItem(legacyStorageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed as PanoramaAreaId[] : null;
  } catch { return null; }
}

export function savePanoramaPreferences(userId: string, areas: readonly PanoramaAreaId[]) {
  if (!userId) return;
  try { localStorage.setItem(panoramaStorageKey(userId), JSON.stringify(areas.slice(0, MAX_PANORAMA_PRIORITIES))); }
  catch { /* The page remains usable when browser storage is unavailable. */ }
}
