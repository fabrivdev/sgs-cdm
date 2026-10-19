import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), parts: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/hooks/useSemaforoHistorico', () => ({ fetchSemaforoHistorico: mocks.parts, SEMAFORO_COLORES: [{ id: 'ROJO', label: 'Rojo', descripcion: 'Sin ventas trianuales y compra antigua' }, { id: 'SIN_DATOS', label: 'Sin datos' }] }));
import { loadOperationsStories, pendingMachineOrder } from './operationsStories';
const asOf = '2026-10-16';
const partData = () => ({ lineas: 12000, valor_kardex_usd: 100, unidades_stock: 400, ubicaciones_sin_valor: 3, fecha_analisis: asOf, kardex_cargado_en: asOf, rows: [{ codigo_interno: 'one' }], por_color: [{ color: 'ROJO', lineas: 20, valor_kardex_usd: 110 }, { color: 'SIN_DATOS', lineas: 2, valor_kardex_usd: -10 }], sucursales: [{ nombre: 'Santa Rita', unidades: 40, valor_kardex_usd: 100, dias_compra_promedio: 400, valor_compra_con_fecha_usd: 60, valor_positivo_usd: 100 }, { nombre: 'Katuete', unidades: 2, valor_kardex_usd: null, dias_compra_promedio: null, valor_compra_con_fecha_usd: 0, valor_positivo_usd: 0 }] });
const chain = (result: unknown) => { const q: Record<string, unknown> = {}; for (const key of ['select','order','range','in','ilike','gte','lt']) q[key] = vi.fn(() => q); q.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve); return q; };
beforeEach(() => vi.resetAllMocks());
describe('operations stories', () => {
  it('checks exact section before any request', async () => {
    expect(await loadOperationsStories(['repuestos_stock', 'maquinas_stock', 'maquinas_pedidos', 'servicios_pendientes', 'maquinas_proyeccion'], ['repuestos.stock', 'parque.maquinas', 'servicios.ventas'], asOf)).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.parts).not.toHaveBeenCalled();
  });
  it('shares one aggregate, never treats the one-row page as universe or analysis/load date as inventory cutoff', async () => {
    mocks.parts.mockResolvedValue(partData());
    const stories = await loadOperationsStories(['repuestos_stock', 'repuestos_sucursales'], ['repuestos.analisis'], asOf);
    expect(mocks.parts).toHaveBeenCalledTimes(1);
    expect(stories[0].supporting[0].value).toBe(12000);
    expect(stories.every(s => s.cutoff === null)).toBe(true);
    expect(stories[0].chart?.rows.map(r => r.value)).toEqual([110,-10]);
    expect(stories[1].primary).toMatchObject({ label: 'Días desde última compra', value: 400, unit: 'days' });
    expect(stories[1].supporting.find(r => r.label === 'Cobertura del valor positivo')?.value).toBe(60);
    expect(stories[1].breakdown[0].note).toContain('60%');
    expect(stories[0].details.join(' ')).toContain('Sin equivalencia no significa sin movimiento');
  });
  it('weights branch purchase age by USD with a dated purchase, not by branch ranking', async () => {
    const data = partData();
    mocks.parts.mockResolvedValue({ ...data, sucursales: [{ nombre: 'Santa Rita', unidades: 40, valor_kardex_usd: 60, dias_compra_promedio: 100, valor_compra_con_fecha_usd: 60, valor_positivo_usd: 60 }, { nombre: 'Katuete', unidades: 2, valor_kardex_usd: 40, dias_compra_promedio: 500, valor_compra_con_fecha_usd: 20, valor_positivo_usd: 40 }] });
    const story = (await loadOperationsStories(['repuestos_sucursales'], ['repuestos.analisis'], asOf))[0];
    expect(story.primary?.value).toBe(200);
    expect(story.supporting.find(r => r.label === 'Cobertura del valor positivo')?.value).toBe(80);
    expect(story.chart?.rows.map(r => r.value)).toEqual([100,500]);
  });
  it('preserves missing Kardex value and propagates shared errors', async () => {
    mocks.parts.mockResolvedValue({ ...partData(), valor_kardex_usd: null });
    expect((await loadOperationsStories(['repuestos_stock'], ['repuestos.analisis'], asOf))[0].primary?.value).toBeNull();
    mocks.parts.mockRejectedValue(new Error('timeout'));
    const stories = await loadOperationsStories(['repuestos_stock', 'repuestos_sucursales'], ['repuestos.analisis'], asOf);
    expect(stories.map(s => s.status)).toEqual(['error','error']);
    expect(stories.every(s => s.primary === null)).toBe(true);
  });
  it('rejects projected null numerics, validates reconciliation and preserves negative model balances', async () => {
    const data = { fecha_corte: asOf, disponible_desde: '2026-08-31', solo_nuevas: true, filas: [{ marca: 'A', modelo: 'M', stock: 1, pedidos_compra: 0, ventas_pendientes: 3, stock_proyectado: -2 }] };
    mocks.rpc.mockResolvedValue({ data, error: null });
    const story = (await loadOperationsStories(['maquinas_proyeccion'], ['parque.stock_proyectado'], asOf))[0];
    expect(story.primary).toMatchObject({ label: 'Saldo proyectado', value: -2 });
    expect(story.supporting.find(r => r.label === 'Stock calculado')?.value).toBe(1);
    expect(story.attention).toBeUndefined(); expect(story.cutoff).toBe(asOf);
    mocks.rpc.mockResolvedValue({ data: { ...data, filas: [{ ...data.filas[0], stock: null }] }, error: null });
    expect((await loadOperationsStories(['maquinas_proyeccion'], ['parque.stock_proyectado'], asOf))[0].status).toBe('error');
  });
  it('rejects truncated stock, preserves actual zero and unknown cut-off', async () => {
    mocks.from.mockReturnValue(chain({ data: [{ id: 'a', estado: 'Nuevo', sucursal: 'A', saldo_actual: 0 }], count: 2, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].status).toBe('error');
    mocks.from.mockReturnValue(chain({ data: [{ id: 'a', estado: 'Nuevo', sucursal: 'A', saldo_actual: 0 }], count: 1, error: null }));
    const story = (await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0];
    expect(story.primary?.value).toBe(0); expect(story.cutoff).toBeNull();
  });
  it('queries OS state and opening age, never financial state, and fails closed on any count error', async () => {
    const queries = [10,30,2,3,4].map(count => chain({ count, error: null }));
    mocks.from.mockImplementation(() => queries.shift());
    const story = (await loadOperationsStories(['servicios_pendientes'], ['servicios.ordenes'], asOf))[0];
    expect(story.primary?.value).toBe(10); expect(story.chart?.rows.map(r => r.value)).toEqual([2,3,4,1]);
    expect(story.cutoff).toBeNull();
    mocks.from.mockReturnValue(chain({ count: null, error: { message: 'timeout' } }));
    expect((await loadOperationsStories(['servicios_pendientes'], ['servicios.ordenes'], asOf))[0].status).toBe('error');
  });
});
const order = { id: 'u', unidad_id: 'u', cantidad: 1, operacion_id: 'np', marca: 'M', modelo: 'A', estado_fuente: 'PENDIENTE', estado_operacion: 'FACTURADA', factura_venta: 'PDF', factura_fecha: null, es_historico: false };
describe('machine pending billing contract', () => {
  it('does not propagate a PDF or billed NP state to unbilled siblings', () => {
    expect(pendingMachineOrder(order, 'FACTURADA', false)).toBe(true);
    expect(pendingMachineOrder(order, 'PENDIENTE', true)).toBe(false);
    expect(pendingMachineOrder(order, 'CANCELADA', false)).toBe(false);
    expect(pendingMachineOrder({ ...order, es_historico: true }, 'PENDIENTE', false)).toBe(false);
  });
  it('loads full view and reconciles each actual unit without counting cancelled units', async () => {
    const rows = [order, { ...order, id: 'v', unidad_id: 'v' }, { ...order, id: 'w', unidad_id: 'w' }];
    mocks.from.mockImplementation(table => chain(table === 'maquinaria_pedidos_lineas_estado_actual' ? { data: rows, count: 3, error: null } : { data: [{ id:'u', estado:'FACTURADA' }, { id:'v', estado:'PENDIENTE' }, { id:'w', estado:'CANCELADA' }], error: null }));
    mocks.rpc.mockResolvedValue({ data: [{ unidad_id: 'v' }], error: null });
    const story = (await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0];
    expect(story.primary?.value).toBe(1); expect(story.supporting[0].value).toBe(1);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect((await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0].status).toBe('error');
  });
  it('keeps historical line quantities when no individual unit exists', async () => {
    mocks.from.mockReturnValue(chain({ data: [{ ...order, id: 'line', unidad_id: null, cantidad: 4, es_historico: true, factura_venta: null, estado_operacion: 'PENDIENTE' }], count: 1, error: null }));
    const story = (await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0];
    expect(story.primary?.value).toBe(4); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


describe('complete populations only', () => {
  it('sums all stock pages and never exposes first page if the next fails', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i), saldo_actual: 1, estado: 'Nuevo', sucursal: 'A' }));
    mocks.from.mockReturnValueOnce(chain({ data: rows, count: 501, error: null })).mockReturnValueOnce(chain({ data: [{ id: 'last', saldo_actual: 3, estado: 'Usado', sucursal: 'B' }], count: 501, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].primary?.value).toBe(503);
    mocks.from.mockReturnValueOnce(chain({ data: rows, count: 501, error: null })).mockReturnValueOnce(chain({ data: [], count: null, error: { message: 'timeout' } }));
    const story = (await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0];
    expect(story.status).toBe('error'); expect(story.primary).toBeNull(); expect(story.chart).toBeNull();
  });
  it('fails missing unit-state lookup and excessive order universes before reconciliation', async () => {
    mocks.from.mockImplementation(table => chain(table === 'maquinaria_pedidos_lineas_estado_actual' ? { data: [order], count: 1, error: null } : { data: [], error: null }));
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0].status).toBe('error');
    mocks.rpc.mockClear();
    mocks.from.mockReturnValue(chain({ data: [order], count: 2001, error: null }));
    expect((await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0].status).toBe('error');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


it('rejects repeated machine units instead of double-counting them', async () => {
  mocks.from.mockReturnValue(chain({ data: [order, { ...order }], count: 2, error: null }));
  const story = (await loadOperationsStories(['maquinas_pedidos'], ['parque.operaciones'], asOf))[0];
  expect(story.status).toBe('error'); expect(story.primary).toBeNull(); expect(mocks.rpc).not.toHaveBeenCalled();
});
