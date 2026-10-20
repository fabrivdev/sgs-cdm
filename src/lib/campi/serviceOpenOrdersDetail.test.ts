import { describe, expect, it } from 'vitest';
import { buildServiceOpenOrdersDetail, type SourceOrder } from './serviceOpenOrdersDetail';

const scope = { asOf: '2026-10-20', count: 2, brands: [{ name: 'CLAAS', count: 1 }, { name: 'HORSCH', count: 1 }],
  ages: [{ label: '0–7 días', count: 1 }, { label: '8–30 días', count: 1 }] };
const rows: SourceOrder[] = [
  { os_numero: '01-000001', cliente_nombre: 'Cliente A', marca: 'CLAAS', fecha_abierta_os: '2026-10-20', situacion_os: 'Abierta', tipo_tiempo: 'Cliente', raw_data: { MODELO: 'AXION 870' } },
  { os_numero: '02-000002', cliente_nombre: 'Cliente B', marca: 'HORSCH', fecha_abierta_os: '2026-10-10', situacion_os: 'Abierta', tipo_tiempo: 'Garantía', raw_data: {} },
];

describe('detalle de OS abiertas', () => {
  it('concilia el resumen y deriva sucursal, modelo, clientes y edad sin horas inventadas', () => {
    const result = buildServiceOpenOrdersDetail(rows, scope);
    expect(result.clients).toBe(2);
    expect(result.averageAge).toBe(5);
    expect(result.branches).toEqual([{ name: 'Katuete', count: 1 }, { name: 'Santa Rita', count: 1 }]);
    expect(result.orders[0]).toMatchObject({ model: 'AXION 870', branch: 'Santa Rita', age: 0 });
    expect(result.orders[1]).toMatchObject({ branch: 'Katuete', age: 10 });
  });
  it('rechaza desgloses incompletos o una OS cerrada en la cohorte', () => {
    expect(() => buildServiceOpenOrdersDetail(rows.slice(0, 1), scope)).toThrow('cambió desde el resumen');
    expect(() => buildServiceOpenOrdersDetail([{ ...rows[0], situacion_os: 'Cerrada' }, rows[1]], scope)).toThrow('no concilian');
    expect(() => buildServiceOpenOrdersDetail(rows, { ...scope, ages: [{ label: '0–7 días', count: 2 }] })).toThrow('desgloses');
  });
  it('no presenta promedios ni clientes como completos si faltan datos', () => {
    const partial = buildServiceOpenOrdersDetail([{ ...rows[0], cliente_nombre: null, fecha_abierta_os: null }, rows[1]],
      { ...scope, ages: [{ label: 'Sin fecha válida', count: 1 }, { label: '8–30 días', count: 1 }] });
    expect(partial.clients).toBeNull();
    expect(partial.averageAge).toBeNull();
  });
});
