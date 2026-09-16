import { describe, expect, it } from 'vitest';
import { esPostventaDashboard, normalizarFacturacionDashboard } from './facturacionSource';
import { concept } from './utils';
import type { DashboardFacturacionMovimiento } from './facturacionSource';

const movimiento: DashboardFacturacionMovimiento = {
  fecha: '2026-08-31', sucursal: 'Santa Rita', tipo: 'Servicio', cliente_id: null,
  entidad_nombre: 'CAMPOS DEL MAÑANA S.A.', total_venta: '-25.50', cantidad: '-1',
  grupo: 'Servicio', grupo_fx: 'Terceros', concepto: 'Terceros', cod_factura: 'F1',
  tipo_tiempo: null, area_calculada: 'servicios',
  raw_data: { dashboard_time_type_source: 'no_informado' },
};

describe('fuente conciliada del Dashboard', () => {
  it('postventa incluye ambos módulos, no Máquinas, Otros o movimientos en revisión', () => {
    const row=normalizarFacturacionDashboard(movimiento);
    expect(esPostventaDashboard(row)).toBe(true);
    expect(esPostventaDashboard({ ...row, area_calculada: 'repuestos' })).toBe(true);
    for (const area_calculada of ['revision','maquinas','otros']) {
      expect(esPostventaDashboard({ ...row, area_calculada })).toBe(false);
    }
  });
  it('conserva signo de NC y no inventa Cliente para tipos desconocidos', () => {
    const row = normalizarFacturacionDashboard(movimiento);
    expect(row.total_venta).toBe(-25.5);
    expect(row.cantidad).toBe(-1);
    expect(row.tipo_tiempo).toBe('No informado');
    expect(row.area_calculada).toBe('servicios');
  });
  it.each(['Garantia', 'Garantía', 'GARANTÍA'])('normaliza %s sin sumar tipos diferentes', (tipo_tiempo) => {
    expect(normalizarFacturacionDashboard({ ...movimiento, tipo_tiempo }).tipo_tiempo).toBe('Garantia');
  });
  it('no convierte una OS de tipos múltiples en una categoría inventada', () => {
    expect(normalizarFacturacionDashboard({ ...movimiento, tipo_tiempo: 'Cliente;Interno' }).tipo_tiempo).toBe('No informado');
  });
  it('conserva la procedencia de los tipos inferidos desde GRID', () => {
    const row = normalizarFacturacionDashboard({ ...movimiento, tipo_tiempo: 'Interno',
      raw_data: { dashboard_time_type_source: 'grid_inferido' } });
    expect(row.tipo_tiempo).toBe('Interno');
    expect(row.raw_data?.dashboard_time_type_source).toBe('grid_inferido');
  });
  it('Terceros no se mezcla con MO ni con Repuestos', () => {
    expect(concept(normalizarFacturacionDashboard({ ...movimiento, tipo: 'Repuesto' }))).toBe('Terceros');
  });
  it('la clasificación monetaria explícita prevalece sobre la descripción', () => {
    expect(concept(normalizarFacturacionDashboard({ ...movimiento, concepto: 'Kilometraje',
      tipo: 'Repuesto', grupo: 'Repuestos' }))).toBe('Kilometraje');
  });
  it.each(['COSTO DE ENVIO', 'INTERESES COBRADOS', 'GAFAS DE SOL TERRA TRAC'])(
    '%s permanece en Otros aunque el importador lo haya llamado Servicio o Repuesto', (mercaderia) => {
      const row = normalizarFacturacionDashboard({ ...movimiento,
        concepto: 'Otros', area_calculada: 'otros', tipo: 'Repuesto',
        grupo: 'SERVICIOS - OTROS', grupo_fx: 'Otros', mercaderia,
        raw_data: { linked_service_order: '01-00000165' },
      });
      expect(concept(row)).toBe('Otros');
      expect(esPostventaDashboard(row)).toBe(false);
      expect(row.total_venta).toBe(-25.5);
      expect(row.raw_data?.linked_service_order).toBe('01-00000165');
    });
});
