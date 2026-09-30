import { describe, expect, it } from "vitest";
import { mapSyntheticKardexSheet } from "@/lib/imports/syntheticKardex";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const row = {
  SUCURSAL: "01",
  CODIGO: "VEIC_000102",
  PRODUCTO: "Tipo: SEMBRADORA - Marca: HORSCH - Casis: 24491418",
  DEPOSITO: "MN",
  Chasis: "24491418",
  SALDO: "1",
  PPP1: "1098831257",
  VALOR_1: "1098831257",
  PPP2: "181325.29",
  VALOR_2: "181325.29",
  PPP3: "181325.29",
  VALOR_3: "181325.29",
};

const sheet = (rows: Record<string, unknown>[]): SpreadsheetXmlSheet => ({
  name: "Kardex Sintetico",
  headers: Object.keys(row),
  rows,
});

describe("Kardex sint\u00e9tico TOTVS", () => {
  it("conserva chasis, saldo, PPP y valor de los tres ejes sin inferir moneda", () => {
    const result = mapSyntheticKardexSheet("kardex_sintetico.xml", sheet([row]));
    expect(result.rows[0]).toMatchObject({
      rowId: "01|VEIC_000102|MN|24491418",
      chassis: "24491418",
      balance: 1,
      averageCost1: 1098831257,
      inventoryValue1: 1098831257,
      averageCost2: 181325.29,
    });
    expect(result.diagnostics).toMatchObject({ chassisRows: 1, valuationDate: null });
  });

  it("preserva valores residuales con saldo cero y los marca, sin recalcularlos", () => {
    const result = mapSyntheticKardexSheet("kardex_sintetico.xml", sheet([{ ...row, SALDO: "0", PPP1: "12186000", VALOR_1: "12186000" }]));
    expect(result.rows[0].inventoryValue1).toBe(12186000);
    expect(result.diagnostics.valueFormulaMismatches).toBe(1);
  });

  it("bloquea claves de snapshot repetidas", () => {
    expect(() => mapSyntheticKardexSheet("kardex_sintetico.xml", sheet([row, { ...row }]))).toThrow(/clave.*repetida/);
  });
});
