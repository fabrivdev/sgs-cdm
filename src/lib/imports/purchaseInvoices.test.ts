import { describe, expect, it } from "vitest";
import { mapPurchaseInvoiceSheet, mapCanonicalPurchaseInvoiceToRow } from "@/lib/imports/purchaseInvoices";
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


describe("variantes de columnas de compras", () => {
  it("lee por nombre las 34 columnas y conserva chapa/kilometraje sin desplazar usuario", () => {
    const extended = { ...row, "Num. Chapa": "ABC123", Kilometraje: "12000" };
    const headers = [...Object.keys(row).filter(h => h !== "USRALT"), "Num. Chapa", "Kilometraje", "USRALT"];
    const parsed = mapPurchaseInvoiceSheet("compras.xml", { name: "Compras", headers, rows: [extended] }).rows[0];
    expect(parsed.createdBy).toBe(row.USRALT);
    expect(mapCanonicalPurchaseInvoiceToRow(parsed).datos_fuente).toMatchObject({ "Num. Chapa": "ABC123", Kilometraje: "12000" });
    const changed = mapPurchaseInvoiceSheet("compras.xml", { name: "Compras", headers: headers.reverse(), rows: [{ ...extended, Kilometraje: "13000" }] }).rows[0];
    expect(changed.sourceFingerprint).not.toBe(parsed.sourceFingerprint);
    expect(changed.rowId).toBe(parsed.rowId);
  });
  it("conserva la huella anterior cuando las columnas opcionales están vacías", () => {
    const original = mapPurchaseInvoiceSheet("a.xml", sheet([row])).rows[0];
    const extended = { ...row, "Num. Chapa": "", Kilometraje: "" };
    const parsed = mapPurchaseInvoiceSheet("b.xml", { name: "Compras", headers: Object.keys(extended), rows: [extended] }).rows[0];
    expect(parsed.sourceFingerprint).toBe(original.sourceFingerprint);
  });
  it("sigue bloqueando columnas faltantes, desconocidas o duplicadas", () => {
    for (const headers of [Object.keys(row).filter(h => h !== "TOTALUSD"), [...Object.keys(row), "Nuevo"], [...Object.keys(row), "USRALT"]]) {
      expect(() => mapPurchaseInvoiceSheet("x.xml", { name: "Compras", headers, rows: [row] })).toThrow(/estructura inesperada/);
    }
  });
  it("cuenta documentos homónimos de proveedores distintos por separado", () => {
    const result = mapPurchaseInvoiceSheet("x.xml", sheet([row, { ...row, PROVEEDOR: "OTRO" }]));
    expect(result.diagnostics.documents).toBe(2);
  });
});
