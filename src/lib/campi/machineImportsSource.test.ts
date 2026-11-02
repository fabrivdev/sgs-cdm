import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), range: vi.fn(), order: vi.fn(), select: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
import { loadMachineImports } from './machineImportsSource';
import { loadOperationsStories } from './operationsStories';

const row = (id: number) => ({ id: String(id), importacion_linea_id: 'lot', numero_unidad: id, chasis: null,
  ata: null, eta: '2026-12-15', stock_fisico_confirmado: false, parque_confirmado: false, estado_fuente: 'PLANIFICADO' });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ order: mocks.order }); mocks.order.mockReturnValue({ range: mocks.range });
});
describe('machine import source', () => {
  it('loads every page with exact count and stable unit order', async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => row(i + 1)), count: 501, error: null })
      .mockResolvedValueOnce({ data: [row(501)], count: 501, error: null });
    const story = await loadMachineImports('2026-11-02');
    expect(story.supporting[0].value).toBe(501);
    expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(mocks.order).toHaveBeenCalledWith('id');
    expect(mocks.select.mock.calls[0][0]).not.toMatch(/cantidad_lote|costo_final/);
    expect(mocks.from).toHaveBeenCalledWith('maquinaria_importacion_unidades_operativas');
  });
  it.each([
    { data: [row(1)], count: null, error: null },
    { data: [row(1)], count: 2, error: null },
    { data: [row(1), row(1)], count: 2, error: null },
    { data: null, count: null, error: { message: 'permission denied' } },
  ])('rejects partial, duplicated or failed reads', async response => {
    mocks.range.mockResolvedValue(response);
    await expect(loadMachineImports('2026-11-02')).rejects.toBeTruthy();
  });
  it('rejects a changing count across pages', async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => row(i + 1)), count: 501, error: null })
      .mockResolvedValueOnce({ data: [row(501)], count: 502, error: null });
    await expect(loadMachineImports('2026-11-02')).rejects.toThrow(/cambió/);
  });
  it('does not query without selection or current import permission', async () => {
    expect(await loadOperationsStories(['maquinas_importacion'], [], '2026-11-02')).toEqual([]);
    expect(await loadOperationsStories([], ['parque.importaciones'], '2026-11-02')).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns a retryable error story instead of fabricated zeroes on source failure', async () => {
    mocks.range.mockResolvedValue({ data: null, count: null, error: { message: 'denied' } });
    const [story] = await loadOperationsStories(['maquinas_importacion'], ['parque.importaciones'], '2026-11-02');
    expect(story.status).toBe('error'); expect(story.primary).toBeNull(); expect(story.chart).toBeNull();
  });
});
