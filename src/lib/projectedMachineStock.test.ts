import { describe, expect, it } from "vitest";
import { parseProjectedMachineStock, projectedStockTotals } from "./projectedMachineStock";

describe("projected machine stock", () => {
  it("normaliza números serializados por Postgres y calcula los cuatro saldos", () => {
    const parsed = parseProjectedMachineStock({
      fecha_corte: "2026-08-31",
      disponible_desde: "2026-08-31",
      filas: [{ programa: "CLAAS", marca: "CLAAS", tipo: "COSECHADORAS", modelo: "TRION 740",
        stock: "2", pedidos_compra: "3", disponibilidad: "5", ventas_pendientes: "1", stock_proyectado: "4",
        arribos_periodo: "0", ventas_netas_periodo: "0" }],
    });
    expect(projectedStockTotals(parsed.filas)).toEqual({ stock: 2, pedidosCompra: 3, ventasPendientes: 1, stockProyectado: 4 });
  });

  it("no propaga valores ausentes como NaN", () => {
    const parsed = parseProjectedMachineStock({ filas: [{}] });
    expect(parsed.filas[0].stock_proyectado).toBe(0);
  });
});
