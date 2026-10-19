import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), parts: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/hooks/useSemaforoHistorico', () => ({ fetchSemaforoHistorico: mocks.parts, SEMAFORO_COLORES: [{ id: 'GRIS', label: 'Gris' }, { id: 'ROJO', label: 'Rojo' }] }));
import { loadOperationsStories } from './operationsStories';

const asOf = '2026-10-19';
const supply = () => ({
  fecha_analisis: asOf, filas: 17, identidades: 17, unidades_identificadas: 17,
  estados_desconocidos: 0, cantidades_invalidas: 0, unidades: 17, sin_unidad: 0,
  conflicto: 0, sin_vinculo: 7, stock: 6, importacion_arribada: 1,
  importacion_transito: 3, pedidos: 5,
  pendientes: [{ operacion_id: 'abc', np_numero: 'NP-1', unidades: 7, sin_vinculo: 7, sin_identidad_o_conflicto: 0 }],
});
const resolution = () => ({
  fecha_analisis: asOf, ultimo_mes: '2026-09-01', mes_anterior: '2026-08-01',
  cierres_ultimo_mes: 84, cierres_mes_anterior: 66, invalidas_ultimo_mes: 0,
  invalidas_mes_anterior: 0, mediana_ultimo_mes: 14, mediana_mes_anterior: 16.5,
  historicas_sin_cierre: 1301, abiertas: 76, apertura_invalida: 0, p90_edad_abiertas: 60,
});
const chain = (result: unknown) => { const q: Record<string, unknown> = {}; for (const key of ['select','order','range']) q[key] = vi.fn(() => q); q.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve); return q; };
beforeEach(() => vi.resetAllMocks());

describe('operational Panorama loaders', () => {
  it('requires the exact authorized sections before contacting any source', async () => {
    expect(await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.stock', 'servicios.ventas'], asOf)).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses complete protected aggregates for active machine supply and service resolution', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_pedidos_abastecimiento_v1' ? supply() : resolution(), error: null }));
    const stories = await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.operaciones', 'servicios.ordenes'], asOf);
    expect(stories.map(s => s.primary?.value)).toEqual([7, 14]);
    expect(stories[0].breakdown[0].route).toBe('/parque-operaciones?operacion=abc');
    expect(stories[1].primary?.comparison?.value).toBe(16.5);
    expect(stories[1].details.join(' ')).toContain('1301');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('fails closed on a partial aggregate or unavailable source', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...supply(), unidades: 16 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    const stories = await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.operaciones', 'servicios.ordenes'], asOf);
    expect(stories.every(s => s.status === 'error' && s.primary === null)).toBe(true);
  });
  it('preserves complete physical stock and refuses a truncated page', async () => {
    mocks.from.mockReturnValueOnce(chain({ data: [{ id: 'a', estado: 'Nuevo', sucursal: 'A', saldo_actual: 2 }], count: 1, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].primary?.value).toBe(2);
    mocks.from.mockReturnValueOnce(chain({ data: [], count: 1, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].status).toBe('error');
  });
});
