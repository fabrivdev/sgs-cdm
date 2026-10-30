import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), parts: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/hooks/useSemaforoHistorico', () => ({ fetchSemaforoHistorico: mocks.parts, SEMAFORO_COLORES: [{ id: 'GRIS', label: 'Gris' }, { id: 'ROJO', label: 'Rojo' }] }));
import { loadOperationsStories } from './operationsStories';

const asOf = '2026-10-19';
const ready = () => ({ fecha_analisis: asOf, unidades_activas: 17, unidades_con_stock: 6, pedidos_con_stock: 2,
  unidades_facturadas_detectadas: 0, identidades: 17, pedidos: [
    { operacion_id: 'abc', np_numero: 'NP-1', unidades_con_stock: 4, unidades_activas: 6 },
    { operacion_id: 'def', np_numero: 'NP-2', unidades_con_stock: 2, unidades_activas: 3 },
  ] });
const supply = () => ({ fecha_analisis: asOf, filas: 17, identidades: 17, unidades_identificadas: 17,
  estados_desconocidos: 0, cantidades_invalidas: 0, unidades: 17, sin_unidad: 0, conflicto: 0,
  sin_vinculo: 4, stock: 6, importacion_arribada: 4, importacion_transito: 3, pedidos: 7,
  pendientes: [{ operacion_id: 'ghi', np_numero: 'NP-3', unidades: 4, sin_vinculo: 4, sin_identidad_o_conflicto: 0 }] });
const openDetail = () => ({ fecha_analisis: asOf, abiertas: 76,
  os_numeros: Array.from({ length: 76 }, (_, i) => `01-${String(i + 1).padStart(8, '0')}`),
  marcas: [{ nombre: 'CLAAS', cantidad: 50 }, { nombre: 'HORSCH', cantidad: 26 }],
  edades: [{ rango: '0–7 días', cantidad: 30 }, { rango: 'Más de 90 días', cantidad: 46 }],
  cortes: [{ fecha: '2026-10-18', abiertas: 75 }, { fecha: asOf, abiertas: 76 }] });
const resolution = () => ({
  fecha_analisis: asOf, ultimo_mes: '2026-09-01', mes_anterior: '2026-08-01',
  cierres_ultimo_mes: 84, cierres_mes_anterior: 66, invalidas_ultimo_mes: 0,
  invalidas_mes_anterior: 0, mediana_ultimo_mes: 14, mediana_mes_anterior: 16.5,
  historicas_sin_cierre: 1301, abiertas: 76, apertura_invalida: 0, p90_edad_abiertas: 60,
});
const chain = (result: unknown) => { const q: Record<string, unknown> = {}; for (const key of ['select','order','range','gte','lte']) q[key] = vi.fn(() => q); q.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve); return q; };
const closure=()=>({os_numero:'1',fecha_abierta_os:'2026-09-21',fecha_cierre_os:'2026-10-05',situacion_os:'Cerrada'});
beforeEach(() => {vi.resetAllMocks();mocks.from.mockReturnValue(chain({data:[closure()],count:1,error:null}));});

describe('operational Panorama loaders', () => {
  it('requires the exact authorized sections before contacting any source', async () => {
    expect(await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.stock', 'servicios.ventas'], asOf)).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses complete protected aggregates for active machine supply and service resolution', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_pedidos_con_stock_v1' ? ready() : name === 'campi_pedidos_abastecimiento_v1' ? supply() : resolution(), error: null }));
    const stories = await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.operaciones', 'servicios.ordenes'], asOf);
    expect(stories.map(s => s.primary?.value)).toEqual([7, 14]);
    expect(stories[0].breakdown[0].route).toBe('/parque-operaciones?operacion=abc');
    expect(stories[0].supporting.find(item => item.label === 'Pedidos con stock')?.value).toBe(2);
    expect(stories[0].supporting.find(item => item.label === 'Pedidos con stock completo')?.value).toBe(0);
    expect(stories[0].chart).toBeNull();
    expect(stories[1].primary?.comparison).toBeUndefined();
    expect(stories[1].closureDistribution).toEqual({total:1,bins:[0,1,0,0]});
    expect(stories[1].time?.window).toEqual({from:'2026-10-01',to:asOf});
    expect(mocks.from).toHaveBeenCalledWith('ordenes_servicio_importadas');
  });
  it('does not turn an absent resolution cohort into zero days on the chart', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...resolution(), cierres_mes_anterior: 0, mediana_mes_anterior: null }, error: null });
    const [story] = await loadOperationsStories(['servicios_pendientes'], ['servicios.ordenes'], asOf);
    expect(story.primary?.comparison).toBeUndefined();
    expect(story.chart).toBeNull();
  });
  it('separates the open OS queue from resolution and reads the same verified source once', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_os_abiertas_detalle_v1' ? openDetail() : resolution(), error: null }));
    const [closed, open] = await loadOperationsStories(['servicios_pendientes', 'servicios_abiertas'], ['servicios.ordenes'], asOf);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(closed.primary?.value).toBe(14);
    expect(open.primary?.value).toBe(76);
    expect(open.supporting[0].value).toBe(60);
    expect(open.detailChart?.rows).toEqual([{ label: '10-18', value: 75 }, { label: '10-19', value: 76 }]);
    expect(open.secondaryCharts?.[0].rows).toEqual([{ label: 'CLAAS', value: 50 }, { label: 'HORSCH', value: 26 }]);
    expect(open.message).not.toContain('atraso');
  });
  it('isolates an invalid cohort rather than hiding a valid independent indicator', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_os_abiertas_detalle_v1' ? openDetail() : { ...resolution(), apertura_invalida: 1 }, error: null }));
    const topics = ['servicios_pendientes', 'servicios_abiertas'] as const;
    const [closed, open] = await loadOperationsStories(topics, ['servicios.ordenes'], asOf);
    expect(closed.status).toBe('ready');
    expect(closed.primary?.comparison).toBeUndefined();
    expect(open.status).toBe('error');
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_os_abiertas_detalle_v1' ? openDetail() : { ...resolution(), invalidas_ultimo_mes: 1 }, error: null }));
    mocks.from.mockReturnValue(chain({data:[{...closure(),fecha_abierta_os:null}],count:1,error:null}));
    const [invalidClosed, validOpen] = await loadOperationsStories(topics, ['servicios.ordenes'], asOf);
    expect(invalidClosed.status).toBe('error');
    expect(validOpen.status).toBe('ready');
  });
  it('fails closed on a partial aggregate or unavailable source', async () => {
    mocks.rpc.mockImplementation(async name => name === 'campi_pedidos_con_stock_v1'
      ? { data: { ...ready(), unidades_con_stock: 7 }, error: null }
      : name === 'campi_pedidos_abastecimiento_v1' ? { data: supply(), error: null }
      : { data: null, error: { code: 'PGRST202' } });
    mocks.from.mockReturnValue(chain({data:null,count:null,error:{code:'denied'}}));
    const stories = await loadOperationsStories(['maquinas_pedidos', 'servicios_pendientes'], ['parque.operaciones', 'servicios.ordenes'], asOf);
    expect(stories.every(s => s.status === 'error' && s.primary === null)).toBe(true);
  });
  it('preserves complete physical stock and refuses a truncated page', async () => {
    mocks.from.mockReturnValueOnce(chain({ data: [{ id: 'a', estado: 'Nuevo', sucursal: 'A', saldo_actual: 2 }], count: 1, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].primary?.value).toBe(2);
    mocks.from.mockReturnValueOnce(chain({ data: [], count: 1, error: null }));
    expect((await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf))[0].status).toBe('error');
  });
  it('shows stock composition when a sole branch would just repeat the total', async () => {
    mocks.from.mockReturnValueOnce(chain({ data: [
      { id: 'a', estado: 'Nuevo', sucursal: 'Santa Rita', saldo_actual: 36 },
      { id: 'b', estado: 'Usado', sucursal: 'Santa Rita', saldo_actual: 51 },
    ], count: 2, error: null }));
    const [story] = await loadOperationsStories(['maquinas_stock'], ['parque.stock'], asOf);
    expect(story.primary?.value).toBe(87);
    expect(story.periodLabel).toBe('Foto física');
    expect(story.cutoff).toBeNull();
    expect(story.chart?.rows).toEqual([{ label: 'Nuevas', value: 36 }, { label: 'Usadas', value: 51 }]);
    expect(story.breakdown).toEqual([{ label: 'Santa Rita', value: 87, unit: 'count' }]);
  });
  it('answers ready-to-bill orders and old open OS as separate questions with filtered destinations', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'campi_pedidos_con_stock_v1' ? ready() : name === 'campi_pedidos_abastecimiento_v1' ? supply() : name === 'campi_os_abiertas_detalle_v1' ? openDetail() : resolution(), error: null }));
    const [pending, readyStory, open, old] = await loadOperationsStories(['maquinas_pedidos', 'maquinas_pedidos_stock', 'servicios_abiertas', 'servicios_os_antiguas'], ['parque.operaciones', 'servicios.ordenes'], asOf);
    expect([pending.primary?.value, readyStory.primary?.value, open.primary?.value, old.primary?.value]).toEqual([7, 2, 76, 46]);
    expect(readyStory.supporting.find(row => row.label === 'Participación con stock')?.value).toBeCloseTo(2 / 7 * 100);
    expect(old.route).toContain('antiguedad_min=91');
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });
});
