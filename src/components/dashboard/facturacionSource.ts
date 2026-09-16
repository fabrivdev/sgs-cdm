import type { Facturacion } from './types';
import { clasificarMarcaFacturacion } from '@/lib/facturacionReglas';

export type DashboardFacturacionMovimiento = Omit<Facturacion, 'tipo_tiempo' | 'total_venta' | 'cantidad'> & {
  tipo_tiempo: string | null;
  total_venta: number | string;
  cantidad: number | string | null;
};

export function esPostventaDashboard(row: Facturacion) {
  // Compatibilidad con filas sin área; la fuente nueva siempre la informa.
  return !row.area_calculada || row.area_calculada === 'servicios' || row.area_calculada === 'repuestos';
}

export function normalizarFacturacionDashboard(row: DashboardFacturacionMovimiento): Facturacion {
  const tipo = String(row.tipo_tiempo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return {
    ...row,
    total_venta: Number(row.total_venta ?? 0),
    cantidad: Number(row.cantidad ?? 0),
    tipo_tiempo: tipo === 'cliente' ? 'Cliente' : tipo === 'garantia' ? 'Garantia'
      : tipo === 'interno' ? 'Interno' : 'No informado',
    marca: row.marca ?? clasificarMarcaFacturacion(row.grupo),
  };
}
