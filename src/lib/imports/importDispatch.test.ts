import { describe, expect, it } from "vitest";
import { mapImportDispatchSheet } from "@/lib/imports/importDispatch";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const baseRow = {
  Sucursal: "01",
  Proceso: "26005IM05021021Z",
  "Fch Proceso": "2026-08-07T00:00:00",
  DESPACHANT: "MIGUEL BOGADO BENITEZ",
  Finalizacion: "2026-08-11T00:00:00",
  Item: "001",
  Proveedor: "220246720001",
  PROVEEDOR: "TRITON COMERCIO",
  Serie: "IMP",
  "Fecha Emis.": "2026-08-11T00:00:00",
  CNDPAG: "002 - CREDITO 30 DIAS",
  MONEDA: "Dolares",
  Timbrado: "",
  "Numero Docto": "0000000017179",
  Item_2: "0001",
  Producto: "REPIN012978",
  PRODUCTO: "ENGATE RAPIDO HIDRAULICO",
  CODFAB: "00110194",
  Cantidad: "8",
  "Prc Unitario": "26.14",
  GENERADA: "SI",
  TIPENT: "003 - EXENTO C/STOCK",
  PORDER: "01 - 000055 - 0001",
};

const sheet = (rows: Record<string, unknown>[]): SpreadsheetXmlSheet => ({
  name: "Importaciones - Despacho",
  headers: Object.keys(baseRow),
  rows,
});

describe("Importaciones - Despacho TOTVS", () => {
  it("mapea por posici\u00f3n ambos Item y conserva la fuente como repuestos agregados", () => {
    const result = mapImportDispatchSheet("importaciones---despacho.xml", sheet([baseRow]));
    expect(result.rows[0]).toMatchObject({
      processItem: "001",
      documentItem: "0001",
      productCode: "REPIN012978",
      productDescription: "ENGATE RAPIDO HIDRAULICO",
      quantity: 8,
      unitPrice: 26.14,
    });
    expect(result.diagnostics).toMatchObject({ rows: 1, processes: 1, quantity: 8, duplicateKeys: 0 });
  });

  it("no confunde el Item de proceso repetido con el grano de l\u00ednea", () => {
    const second = { ...baseRow, Item_2: "0002", Producto: "REPIN007409", CODFAB: "60122760" };
    expect(mapImportDispatchSheet("despacho.xml", sheet([baseRow, second])).rows).toHaveLength(2);
  });

  it("bloquea cambios de estructura posicional", () => {
    const invalid = sheet([baseRow]);
    invalid.headers = invalid.headers.filter((header) => header !== "Item_2");
    expect(() => mapImportDispatchSheet("despacho.xml", invalid)).toThrow(/estructura inesperada/);
  });
});
