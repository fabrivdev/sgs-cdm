import { describe, expect, it } from "vitest";
import {
  buildPartsStockSalesExport,
  buildStockSalesReport,
  filterPartsStockSalesByBrands,
  type FullPartsStockSalesRow,
} from "./partsStockSales";

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

describe("buildStockSalesReport", () => {
  it("produce el mismo formato para cualquier marca y conserva el origen historico", () => {
    const result = buildStockSalesReport([row({
      codigo: "000778",
      codigo_fabricante: "778.1",
      descripcion: "FILTRO DE COMBUSTIBLE",
      marca: "HORSCH",
      stock_total: 0,
      ventas_12m: 1,
      ventas_24m: 4,
      ventas_36m: 9,
      origen: "MAESTRO_ANTERIOR",
    })]);
    expect(result).toEqual([{
      "Código interno": "000778",
      "Código fabricante": "778.1",
      "Descripción": "FILTRO DE COMBUSTIBLE",
      "Marca": "HORSCH",
      "Stock": 0,
      "Ventas 12M": 1,
      "Ventas 24M": 4,
      "Ventas 36M": 9,
      "Origen sistema": "SISTEMA VIEJO",
    }]);
  });

  it("filtra cualquier combinacion de marcas y deja todo cuando no se selecciona ninguna", () => {
    const rows = [row({ marca: "CLAAS" }), row({ codigo: "REP002", marca: "HORSCH" })];
    expect(filterPartsStockSalesByBrands(rows, ["HORSCH"])).toEqual([rows[1]]);
    expect(filterPartsStockSalesByBrands(rows, ["CLAAS", "HORSCH"])).toEqual(rows);
    expect(filterPartsStockSalesByBrands(rows, [])).toEqual(rows);
  });

  it("identifica productos actuales con ventas del sistema viejo", () => {
    const [result] = buildStockSalesReport([row({ origen: "CATALOGO_MIXTO" })]);
    expect(result["Origen sistema"]).toBe("SISTEMA NUEVO + SISTEMA VIEJO");
  });
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
