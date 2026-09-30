import { describe, expect, it } from "vitest";
import { mapPurchaseInvoiceSheet } from "@/lib/imports/purchaseInvoices";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const row = {
  FILIAL: "01 - Santa Rita", "Fch Emision": "2026-06-30T00:00:00.000", "Fecha Digit.": "2026-06-30T00:00:00.000",
  PROVEEDOR: "80102851-5", LOJA: "01", NOMBRE: "LARGIL S.A.", MONORI: "Dolares", ESPECIE: "NF",
  MODALIDAD: "004 - COMPRAS", DOCELEC: "Manual", TIMBRADO: "11111111", SERIE: "SM", DOCUMENTO: "C00210363002M",
  ITEM: "0001", CODIGO: "SLDMIGRA", PRODUCTO: "CUENTA POR PAGAR / COBRAR", CANTIDAD: "1", VUNITGS: "4863987",
  TOTALGS: "4863987", VUNITUSD: "798", TOTALUSD: "798", TIPOES: "004 - IVA 10% INCL S/STOCK",
  CUENTA: "51313004 - PEAJES", CCOSTO: "-", TIPCAM: "6093", PEDIDO: "", ITEMPC: "", FCHVEN: "20260630",
  OBSERV: "INTERES", NROREI: "", REINTEGRO: "", USRALT: "Bryan Marecos",
};
const sheet = (rows: Record<string, unknown>[]): SpreadsheetXmlSheet => ({ name: "Facturas - NCP - NDP - Compras", headers: Object.keys(row), rows });

describe("facturas de compra TOTVS", () => {
  it("conserva simultáneamente importes Gs, USD, moneda fuente y tipo de cambio", () => {
    const result = mapPurchaseInvoiceSheet("compras.xml", sheet([row]));
    expect(result.rows[0]).toMatchObject({ sourceCurrency: "Dolares", unitValueGs: 4863987, totalValueUsd: 798, exchangeRate: 6093 });
    expect(result.diagnostics).toMatchObject({ rows: 1, suppliers: 1, documents: 1, documentKinds: ["NF"] });
  });

  it("bloquea claves repetidas dentro del mismo informe", () => {
    expect(() => mapPurchaseInvoiceSheet("compras.xml", sheet([row, row]))).toThrow(/repetida/);
  });
});
