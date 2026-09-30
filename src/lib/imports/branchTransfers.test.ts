import { describe, expect, it } from "vitest";
import { mapBranchTransferSheet } from "@/lib/imports/branchTransfers";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const row = {
  ORIGEN: "03 - Campo 9", DESTINO: "01 - Santa Rita", "Fch Emision": "2026-07-10T00:00:00.000",
  "Serie Docto.": "RE1", "Num. Doc.": "0030010001847", Item: "01", Producto: "REPIN005024",
  Descripcion: "CRUCETA 0933334.0", Cantidad: "2", Observacion: "",
};
const sheet: SpreadsheetXmlSheet = { name: "Transferencia Entre Sucursales", headers: Object.keys(row), rows: [row] };

describe("transferencias entre sucursales TOTVS", () => {
  it("mapea origen, destino, documento e inventario sin inferir recepción", () => {
    expect(mapBranchTransferSheet("transferencias.xml", sheet).rows[0]).toMatchObject({ originBranch: "03 - Campo 9", destinationBranch: "01 - Santa Rita", productCode: "REPIN005024", quantity: 2 });
  });
});
