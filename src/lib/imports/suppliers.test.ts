import { describe, expect, it } from "vitest";
import { mapSupplierSheet } from "@/lib/imports/suppliers";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const row = {
  Codigo: "7248333-4", Tienda: "01", "Razon Social": "VOLNEI BACK", RUC: "7248333-4", "N Fantasía": "VOLNEI BACK",
  Direccion: "RUTA 6", DEPART: "ALTO PARANA", Municipio: "SANTA RITA", "E-Mail": "", "Teléfono": "83622470",
  PAIS: "PARAGUAY", "Ag. Ret.IVA?": "S", "Ag. Ret.IVA?_2": "N", ESTADO: "Activo",
};
const sheet: SpreadsheetXmlSheet = { name: "Maestro de Proveedores", headers: Object.keys(row), rows: [row] };

describe("maestro de proveedores TOTVS", () => {
  it("preserva las dos banderas homónimas sin reinterpretarlas", () => {
    expect(mapSupplierSheet("proveedores.xml", sheet).rows[0]).toMatchObject({ supplierCode: "7248333-4", store: "01", withholdingFlag1: "S", withholdingFlag2: "N" });
  });
});
