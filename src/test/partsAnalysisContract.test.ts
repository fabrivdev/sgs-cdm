import { beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: client }));
import { fetchSemaforoHistorico } from '@/hooks/useSemaforoHistorico';
const filters = { busqueda: ' REP ', marca: '', color: '', sucursal: 'Katuete', familia: 'Filtros', deposito: '01', usd_min: '10' };
beforeEach(() => vi.clearAllMocks());
describe('contrato del análisis valorizado', () => {
  it('conserva el receptor del cliente y envía todo el filtro al servidor', async () => {
    client.rpc.mockImplementation(function (this: unknown) {
      expect(this).toBe(client);
      return { data: { rows: [], por_color: [], sucursales: [], grupos: [], franjas: [], facetas: { familias: [], depositos: [], sucursales: [] }, version: "test" }, error: null };
    });
    await fetchSemaforoHistorico(filters, 2, 200, 'familia');
    expect(client.rpc).toHaveBeenCalledWith('repuestos_analisis_valorizado', { p_filtros: { ...filters, busqueda:'REP' },p_agrupacion:'familia',p_limite:200,p_offset:400 });
  });
  it('no recurre al informe global viejo si falta la migración', async () => {
    client.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
    await expect(fetchSemaforoHistorico(filters,0)).rejects.toThrow('Falta aplicar');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('rechaza respuestas antiguas o incompletas', async () => {
    client.rpc.mockResolvedValue({data:{rows:[],por_color:[],sucursales:[]},error:null});
    await expect(fetchSemaforoHistorico(filters,0)).rejects.toThrow('formato inválido');
  });
});
