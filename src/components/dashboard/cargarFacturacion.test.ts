import { afterEach, describe, expect, it, vi } from 'vitest';
import { cargarFacturacionDashboard, rangosFacturacion, type LoteFacturacion } from './cargarFacturacion';
import type { DashboardFacturacionMovimiento } from './facturacionSource';

const row: DashboardFacturacionMovimiento = {
  fecha: '2026-08-31', sucursal: 'Santa Rita', tipo: 'Servicio', cliente_id: null,
  entidad_nombre: 'Cliente', total_venta: '-10.50', cantidad: '-1', grupo: 'Servicio',
  grupo_fx: 'Servicio', cod_factura: 'NC1', tipo_tiempo: 'Garantía', concepto: 'Servicio',
};
afterEach(() => vi.useRealTimers());
describe('carga de facturación sin paginar el reporte anual', () => {
  it('consulta cada año una sola vez aunque tenga más de 1.000 filas', async () => {
    const leer = vi.fn(async ({ desde }) => ({ rows: Array.from({ length: 1_501 }, () => ({ ...row, fecha: desde })), count: 1_501 }));
    const result = await cargarFacturacionDashboard('2025-01-01', '2026-12-31', leer, new AbortController().signal);
    expect(leer).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(3_002);
    expect(result.reduce((sum, r) => sum + r.total_venta, 0)).toBe(-31_521);
    expect(result.every(r => r.cantidad === -1 && r.tipo_tiempo === 'Garantia')).toBe(true);
  });
  it('no incluye el 1 de septiembre cuando se solicita agosto', () => {
    expect(rangosFacturacion('2026-08-01','2026-08-31')).toEqual([{ desde: '2026-08-01', hasta: '2026-08-31' }]);
    expect(rangosFacturacion('2024-12-31','2026-01-01')).toEqual([
      { desde: '2024-12-31', hasta: '2024-12-31' },
      { desde: '2025-01-01', hasta: '2025-12-31' },
      { desde: '2026-01-01', hasta: '2026-01-01' },
    ]);
  });
  it.each([['','2026-08-31'],['2026-09-01','2026-08-31']])('rechaza un rango inválido sin consultar', async (desde, hasta) => {
    const leer = vi.fn();
    await expect(cargarFacturacionDashboard(desde, hasta, leer, new AbortController().signal)).rejects.toThrow('rango');
    expect(leer).not.toHaveBeenCalled();
  });
  it('un lote incompleto no publica un total parcial', async () => {
    await expect(cargarFacturacionDashboard('2026-01-01','2026-12-31', async () => ({ rows: [row], count: 2 }),
      new AbortController().signal)).rejects.toThrow('incompleta');
  });
  it('un fallo en otro año tampoco publica sólo el año exitoso', async () => {
    const leer = vi.fn(async ({ desde }) => {
      if (desde.startsWith('2026')) throw new Error('statement timeout');
      return { rows: [row], count: 1 };
    });
    await expect(cargarFacturacionDashboard('2025-01-01','2026-12-31', leer,
      new AbortController().signal)).rejects.toThrow('statement timeout');
  });
  it('vence el plazo y aborta el transporte aunque éste no responda', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const result = cargarFacturacionDashboard('2026-01-01','2026-12-31', async (_, signal) => {
      requestSignal = signal; return new Promise<LoteFacturacion>(() => {});
    }, new AbortController().signal, 45_000);
    const assertion = expect(result).rejects.toThrow('tiempo de espera');
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cambiar filtros cancela la carga anterior sin esperar a la red', async () => {
    const controller = new AbortController();
    const result = cargarFacturacionDashboard('2026-01-01','2026-12-31', () => new Promise(() => {}), controller.signal);
    const assertion = expect(result).rejects.toThrow('filtro cambiado');
    controller.abort(new Error('filtro cambiado'));
    await assertion;
  });
  it('limita a dos consultas simultáneas para rangos de varios años', async () => {
    let activas = 0, maximo = 0;
    const leer = vi.fn(async () => {
      activas++; maximo = Math.max(activas, maximo);
      await new Promise(resolve => setTimeout(resolve, 1));
      activas--; return { rows: [], count: 0 };
    });
    expect(await cargarFacturacionDashboard('2020-01-01','2026-12-31', leer, new AbortController().signal)).toEqual([]);
    expect(leer).toHaveBeenCalledTimes(7);
    expect(maximo).toBe(2);
  });
});
