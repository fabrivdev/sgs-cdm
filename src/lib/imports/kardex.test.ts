import { describe, expect, it } from "vitest";
import { mapKardexSheet, mergeKardexRows } from "@/lib/imports/kardex";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const baseRow = {
  FECHA: "20260825",
  FILIAL: "01",
  DEPOSITO: "01",
  Descripcion: "Dep\u00f3sito central",
  PRODUCTO: "PROD001",
  Descripcion_2: "Producto de prueba",
  CANTIDAD: "-2",
  C_U_G: "100000",
  C_U_D_2: "12,50",
  C_U_D_3: "12.5",
  C_T_G: "-200000",
  C_T_D_2: "-25",
  C_T_D_3: "-25",
  TIPO_MOVIMIENTO: "",
  CF: "NF",
  DOCUMENTO: "000123",
  SECUENCIA: "0001",
  MONEDA: "2",
  T_C: "8000",
  TABLA: "SD3",
  TIPO: "S",
  RECNO: "98765",
  SERIE: "1",
  CLIFOR: "000001",
  LOJA: "01",
  Grupo: "01",
  "Cta.Contable": "1.1.01",
};

const sheet = (rows: Record<string, unknown>[]): SpreadsheetXmlSheet => ({
  name: "Kardex Analitico",
  headers: Object.keys(baseRow),
  rows,
});

describe("Kardex anal\u00edtico TOTVS", () => {
  it("conserva grano, signos, c\u00f3digos de moneda y las dos descripciones", () => {
    const result = mapKardexSheet("kardex_analitico.xml", sheet([baseRow]));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowId: "SD3:98765",
      movementDate: "2026-08-25",
      warehouseDescription: "Dep\u00f3sito central",
      productDescription: "Producto de prueba",
      quantity: -2,
      unitCostCurrency2: 12.5,
      currencyCode: "2",
      direction: "S",
    });
    expect(result.diagnostics).toMatchObject({ rows: 1, from: "2026-08-25", to: "2026-08-25", duplicateKeys: 0 });
  });

  it("rechaza una clave TABLA + RECNO repetida dentro del archivo", () => {
    expect(() => mapKardexSheet("duplicado.xml", sheet([baseRow, { ...baseRow }]))).toThrow(/TABLA \+ RECNO repetida/);
  });

  it("deduplica archivos solapados pero bloquea una reescritura contradictoria", () => {
    const first = mapKardexSheet("a.xml", sheet([baseRow])).rows[0];
    const same = mapKardexSheet("b.xml", sheet([{ ...baseRow }])).rows[0];
    expect(mergeKardexRows([first, same])).toMatchObject({ duplicatesSkipped: 1 });

    const changed = mapKardexSheet("c.xml", sheet([{ ...baseRow, CANTIDAD: "-3" }])).rows[0];
    expect(() => mergeKardexRows([first, changed])).toThrow(/versiones contradictorias.*0 cambian solo costos.*1 cambian campos no monetarios.*cantidad.*a\.xml.*c\.xml/);

    const changedCost = mapKardexSheet("d.xml", sheet([{ ...baseRow, C_U_G: "100001" }])).rows[0];
    expect(() => mergeKardexRows([first, changedCost])).toThrow(/1 cambian solo costos.*0 cambian campos no monetarios/);
  });

  it("informa encabezados faltantes sin intentar adivinarlos", () => {
    expect(() => mapKardexSheet("incompleto.xml", { name: "Kardex", headers: ["FECHA"], rows: [] }))
      .toThrow(/faltan columnas requeridas/);
  });

  it("bloquea importes no num\u00e9ricos en vez de convertirlos silenciosamente en cero", () => {
    expect(() => mapKardexSheet("invalido.xml", sheet([{ ...baseRow, C_U_G: "sin dato" }])))
      .toThrow(/C_U_G no num/);
  });
});
