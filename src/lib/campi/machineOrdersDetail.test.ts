import { describe, expect, it } from 'vitest';
import { buildMachineOrdersDetail } from './machineOrdersDetail';

const scope = {
  asOf: '2026-10-20', orders: 3, units: 4, stock: 2, arrived: 1, transit: 0, unlinked: 1,
  readyUnits: 2, billedUnits: 0, ready: [{ id: 'a', units: 2 }], unresolved: [{ id: 'c', units: 1 }],
};
const row = (id: string, order: string, day: string | null, importId: string | null = null, ata: string | null = null) => ({
  id, operacion_id: order, np_numero: `NP-${order}`, np_fecha: day, cliente_nombre: `Cliente ${order}`,
  cantidad: 1, estado_operacion: 'DISPONIBLE', estado_fuente: null,
  importacion_linea_id: importId, ata,
});
const rows = [row('a1', 'a', '2026-10-18'), row('a2', 'a', '2026-10-18'),
  row('b1', 'b', '2026-09-10', 'imp', '2026-10-10'), row('c1', 'c', null)];

describe('machine order detail', () => {
  it('uses real NP dates and clients; reconciles the summary', () => {
    const detail = buildMachineOrdersDetail(rows, scope);
    expect(detail.orders.map(order => [order.number, order.client, order.units, order.status]))
      .toEqual([['NP-a', 'Cliente a', 2, 'stock'], ['NP-b', 'Cliente b', 1, 'arrived'], ['NP-c', 'Cliente c', 1, 'unlinked']]);
    expect(detail.ages).toEqual([{ label: '0–30 días', count: 1 }, { label: '31–60 días', count: 1 }, { label: 'Sin fecha', count: 1 }]);
  });
  it('does not mistake cancelled orders for pending units', () => {
    expect(buildMachineOrdersDetail([...rows, { ...row('cancelled', 'd', '2026-10-01'), estado_operacion: 'CANCELADA' }], scope).orders).toHaveLength(3);
  });
  it('keeps the orders visible when a source date is future or a client differs within one NP', () => {
    const detail = buildMachineOrdersDetail([{ ...rows[0], np_fecha: '2026-10-21', cliente_nombre: 'Uno' },
      { ...rows[1], cliente_nombre: 'Dos' }, rows[2], rows[3]], scope);
    expect(detail.orders[0]).toMatchObject({ age: null, client: 'Cliente por revisar' });
    expect(detail.ages.find(bucket => bucket.label === 'Sin fecha')?.count).toBe(2);
  });
  it('rejects truncated or duplicate identities instead of rendering an incomplete table', () => {
    expect(() => buildMachineOrdersDetail(rows.slice(0, -1), scope)).toThrow('cambió');
    expect(() => buildMachineOrdersDetail([rows[0], rows[0], rows[2], rows[3]], scope)).toThrow('incompletas');
  });
});
