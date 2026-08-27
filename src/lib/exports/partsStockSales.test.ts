import { describe, expect, it } from "vitest";
import { buildPartsStockSalesExport, type FullPartsStockSalesRow } from "./partsStockSales";

const row = (patch: Partial<FullPartsStockSalesRow> = {}): FullPartsStockSalesRow => ({
  codigo: "REP001",
  codigos_anteriores: null,
  codigo_fabricante: null,
  descripcion: "Filtro",
  marca: "CLAAS",
  familia: null,
  unidad: "UN",
  santa_rita: 0,
  santa_rosa: 0,
  campo_9: 0,
  misiones: 0,
  loma_plata: 0,
  katuete: 0,
  stock_total: 0,
  ventas_12m: 0,
  ventas_24m: 0,
  ventas_36m: 0,
  origen: "CATALOGO",
  estado_producto: "ACTIVO",
  estado_vinculo: "NO_APLICA",
  fecha_corte: "2026-08-27",
  ...patch,
});

describe("buildPartsStockSalesExport", () => {
  it("conserva productos con stock y ventas en cero", () => {
    const result = buildPartsStockSalesExport([row()]);
    expect(result.detail).toHaveLength(1);
    expect(result.detail[0]["Stock total"]).toBe(0);
    expect(result.detail[0]["Ventas 36M"]).toBe(0);
    expect(result.control).toContainEqual({ Indicador: "Productos con stock cero", Valor: 1 });
  });

  it("separa codigos historicos no vinculados para revision", () => {
    const historical = row({
      codigo: "A-778",
      origen: "MAESTRO_ANTERIOR",
      estado_producto: "HISTORICO",
      estado_vinculo: "SIN_COINCIDENCIA",
      ventas_12m: 2,
      ventas_24m: 8,
      ventas_36m: 15,
    });
    const result = buildPartsStockSalesExport([row(), historical]);
    expect(result.detail).toHaveLength(2);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]["Código"]).toBe("A-778");
    expect(result.detail[1]["Ventas 36M"]).toBe(15);
  });
});
