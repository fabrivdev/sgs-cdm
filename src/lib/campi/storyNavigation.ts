import type { PanoramaStory } from './panoramaStoryTypes';

const SALES_SECTIONS = {
  'repuestos.ventas': { label: 'Ventas de repuestos', route: '/repuestos/ventas' },
  'servicios.ventas': { label: 'Ventas de servicios', route: '/servicios/ventas' },
  'parque.ventas': { label: 'Ventas de máquinas', route: '/parque-ventas' },
} as const;

export type StoryDestination = { label: string; route: string };

/** The target page must consume every query parameter added here. */
export function storyDestinations(story: PanoramaStory): StoryDestination[] {
  if (story.status === 'error') return [];
  if (story.id === 'servicios_pendientes' && story.navigationPeriod && story.route.startsWith('/servicios/ordenes?')) {
    return [{ label: 'OS cerradas del período', route: story.route }];
  }
  if (story.navigationPeriod) {
    const query = new URLSearchParams({ desde: story.navigationPeriod.from, hasta: story.navigationPeriod.to });
    return story.sections.flatMap(section => section in SALES_SECTIONS
      ? [{ label: SALES_SECTIONS[section as keyof typeof SALES_SECTIONS].label, route: `${SALES_SECTIONS[section as keyof typeof SALES_SECTIONS].route}?${query}` }]
      : section === 'servicios.ordenes' && story.route === '/servicios/ordenes'
        ? [{ label: story.title, route: `${story.route}?${query}` }] : []);
  }
  if (story.id === 'repuestos_alertas') return story.breakdown.filter(row => row.group === 'Avisos' && row.route).map(row => ({ label: row.label, route: row.route! }));
  if (story.id === 'servicios_pendientes') {
    const closed = story.breakdown.find(row => row.label.startsWith('Cerradas en ') && row.route);
    return closed ? [{ label: 'OS cerradas del último mes', route: closed.route! }] : [];
  }
  if (story.id === 'servicios_abiertas') {
    const asOf = story.openOrders?.asOf;
    return asOf ? [{ label: 'OS abiertas', route: `/servicios/ordenes?estado=abierta&cohorte=open&desde=2000-01-01&hasta=${asOf}` }] : [];
  }
  if (story.id === 'maquinas_pedidos_stock') {
    const ids = story.machineOrders?.ready.map(order => order.id) ?? [];
    return ids.length ? [{ label: 'Pedidos con stock', route: `/parque-operaciones?operaciones=${encodeURIComponent(ids.join(','))}` }] : [];
  }
  return story.route ? [{ label: story.title, route: story.route }] : [];
}
