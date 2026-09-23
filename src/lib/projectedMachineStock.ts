export const PROJECTED_STOCK_START = "2026-08-31";

export type ProjectedMachineStockRow = {
  programa: string;
  marca: string;
  tipo: string;
  modelo: string;
  stock: number;
  pedidos_compra: number;
  disponibilidad: number;
  ventas_pendientes: number;
  stock_proyectado: number;
  arribos_periodo: number;
  ventas_netas_periodo: number;
};

export type ProjectedMachineStockResponse = {
  fecha_corte: string;
  disponible_desde: string;
  solo_nuevas: true;
  filas: ProjectedMachineStockRow[];
};

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function parseProjectedMachineStock(value: unknown): ProjectedMachineStockResponse {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rows = Array.isArray(source.filas) ? source.filas : [];
  return {
    fecha_corte: typeof source.fecha_corte === "string" ? source.fecha_corte : PROJECTED_STOCK_START,
    disponible_desde: typeof source.disponible_desde === "string" ? source.disponible_desde : PROJECTED_STOCK_START,
    solo_nuevas: true,
    filas: rows.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        programa: String(row.programa ?? "OTROS"),
        marca: String(row.marca ?? "OTROS"),
        tipo: String(row.tipo ?? "OTRO"),
        modelo: String(row.modelo ?? "MODELO NO INFORMADO"),
        stock: numberValue(row.stock),
        pedidos_compra: numberValue(row.pedidos_compra),
        disponibilidad: numberValue(row.disponibilidad),
        ventas_pendientes: numberValue(row.ventas_pendientes),
        stock_proyectado: numberValue(row.stock_proyectado),
        arribos_periodo: numberValue(row.arribos_periodo),
        ventas_netas_periodo: numberValue(row.ventas_netas_periodo),
      };
    }),
  };
}

export function projectedStockTotals(rows: readonly ProjectedMachineStockRow[]) {
  return rows.reduce((totals, row) => ({
    stock: totals.stock + row.stock,
    pedidosCompra: totals.pedidosCompra + row.pedidos_compra,
    ventasPendientes: totals.ventasPendientes + row.ventas_pendientes,
    stockProyectado: totals.stockProyectado + row.stock_proyectado,
  }), { stock: 0, pedidosCompra: 0, ventasPendientes: 0, stockProyectado: 0 });
}
