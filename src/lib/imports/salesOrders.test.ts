import { describe, expect, it } from "vitest";
import { mapSalesOrderSheet } from "@/lib/imports/salesOrders";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const baseRow = {
  FILIAL: "01 - Santa Rita",
  "Fch Emision": "2026-07-06T00:00:00",
  Cliente: "80024871-6",
  Nombre: "LUCERO S.A",
  VENDEDOR: "AR0001 - FERNANDO PETTER",
  CNDPAG: "001 - CONTADO",
  NATURALEZA: "003 - VENTAS",
  GENERA: "Factura",
  MONEDA: "USD",
  "Nro Pedido": "000001",
  Item: "01",
  Producto: "REPIN012398",
  "Cod Faricant": "713290",
  Descripcion: "VALVULA - MAGNETICA",
  Unidad: "UN",
  Cantidad: "1",
  "Prc Unitario": "302.77",
  "Vlr.Total": "302.77",
  "Ctd.Entregad": "0",
  PENDIENTE: "1",
  ESTADO: "-------",
  NUMPRESU: "",
  ITEMPRESU: "",
  "Serie Fact.": "",
  Factura: "",
  TIPENT: "501 - IVA 10% INCL C/STOCK",
};

const sheet = (rows: Record<string, unknown>[]): SpreadsheetXmlSheet => ({
  name: "Pedidos de Venta",
  headers: Object.keys(baseRow),
  rows,
});

describe("Pedidos de venta TOTVS", () => {
  it("mapea la l\u00ednea sin inferir IVA ni moneda contable", () => {
    const result = mapSalesOrderSheet("pedidos-de-venta.xml", sheet([baseRow]));
    expect(result.rows[0]).toMatchObject({
      rowId: "01-SANTARITA|000001|01",
      currency: "USD",
      pendingQuantity: 1,
      entryType: "501 - IVA 10% INCL C/STOCK",
    });
    expect(result.diagnostics).toMatchObject({ pendingRows: 1, pendingQuantity: 1, duplicateKeys: 0 });
  });

  it("bloquea claves FILIAL + Nro Pedido + Item repetidas", () => {
    expect(() => mapSalesOrderSheet("ventas.xml", sheet([baseRow, { ...baseRow }]))).toThrow(/claves FILIAL/);
  });

  it("bloquea importes no num\u00e9ricos", () => {
    expect(() => mapSalesOrderSheet("ventas.xml", sheet([{ ...baseRow, PENDIENTE: "sin dato" }]))).toThrow(/PENDIENTE no num/);
  });
});
