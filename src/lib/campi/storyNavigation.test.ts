import { describe, expect, it } from 'vitest';
import type { PanoramaStory } from './panoramaStoryTypes';
import { storyDestinations } from './storyNavigation';

const base: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación neta', question: '', status: 'ready', message: '', scope: '', sections: ['repuestos.ventas', 'servicios.ventas'], cutoff: null, periodLabel: '', primary: null, supporting: [], chart: null, breakdown: [], details: [], source: '', route: '', navigationPeriod: { from: '2026-10-01', to: '2026-10-20' } };

describe('Panorama destinations', () => {
  it('offers only authorized sales areas and applies the same visible period in each', () => {
    expect(storyDestinations(base)).toEqual([
      { label: 'Ventas de repuestos', route: '/repuestos/ventas?desde=2026-10-01&hasta=2026-10-20' },
      { label: 'Ventas de servicios', route: '/servicios/ventas?desde=2026-10-01&hasta=2026-10-20' },
    ]);
    expect(storyDestinations({ ...base, sections: ['servicios.ventas'] })).toHaveLength(1);
    expect(storyDestinations({ ...base, status: 'error' })).toEqual([]);
  });
  it('opens old OS and stocked machine orders with their exact verified cohorts', () => {
    const old = { ...base, id: 'servicios_os_antiguas' as const, navigationPeriod: undefined, sections: ['servicios.ordenes' as const], route: '/servicios/ordenes?estado=abierta&cohorte=open&desde=2000-01-01&hasta=2026-10-20&antiguedad_min=91' };
    expect(storyDestinations(old)[0].route).toContain('antiguedad_min=91');
    const machines: PanoramaStory = { ...base, id: 'maquinas_pedidos_stock', navigationPeriod: undefined, sections: ['parque.operaciones'], machineOrders: { asOf: '2026-10-20', orders: 2, units: 2, stock: 2, arrived: 0, transit: 0, unlinked: 0, readyUnits: 2, billedUnits: 0, ready: [{ id: 'a', units: 1 }, { id: 'b', units: 1 }], unresolved: [] } };
    expect(storyDestinations(machines)[0].route).toBe('/parque-operaciones?operaciones=a%2Cb');
  });
});
