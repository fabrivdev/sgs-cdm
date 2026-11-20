import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readPlanterUpload } from "./planterImport";

function file(name: string, sheets: Record<string, XLSX.WorkSheet>) {
  const workbook = XLSX.utils.book_new();
  for (const [title, sheet] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, sheet, title);
  }
  return { name, arrayBuffer: async () => XLSX.write(workbook, { type: "array", bookType: "xlsx" }) };
}
const ocit = {
  Despacho: "historico",
  "Fecha Canc.": "2025-09-15",
  LINEAS: 12,
  TIPO: "G. GRUESO",
  DESPLAZAMIENTO: "LATERAL",
  "Marca Subitem": "JOHN DEERE",
  "Descripción Subitem": "1212",
  "Estado Mercadería": "NUEVO",
  "Código NCM": "84323110000J",
  "U$S FOB": 60_000,
  Cantidad: 1,
};
const penta = {
  Despacho: "nuevo",
  Item: 1,
  Subitem: 0,
  "Régimen Código": "IC04",
  "Fecha Canc.": "2025-10-10",
  "Código NCM": "84323910000E",
  "Marca Subitem": "HORSCH",
  "Descripción Subitem": "UNA UNIDAD DE SEMBRADORA MODELO MAESTRO 9 CF (18.45)",
  "Estado Mercadería": "NUEVO",
  "U$S FOB": 108_000,
  "Probable Importador": "EMPRESA",
  Cantidad: 1,
};
const history = file("OCIT_Plantadoras.xlsx", {
  base: XLSX.utils.json_to_sheet([ocit, { ...ocit, "Código NCM": "84329000000X" }]),
});
function extract(rows: Record<string, unknown>[]) {
  return file("Penta.xlsx", {
    SubItems: XLSX.utils.json_to_sheet(rows),
    "Parámetros": XLSX.utils.aoa_to_sheet([
      ["Período: 10/2025 - 10/2025"],
      ["Código NCM: 84323110000J, 84323910000E, 84329000000X"],
    ]),
  });
}
describe("Carga de sembradoras", () => {
  it("combina el histórico y Penta con líneas, grano y transporte", async () => {
    const imported = await readPlanterUpload([history, extract([
      penta,
      { ...penta, Subitem: 1, "Código NCM": "84329000000X" },
      { ...penta, Subitem: 2, "Descripción Subitem": "100 SEMBRADORAS MATRACA BICO ANCHO" },
      { ...penta, Subitem: 3, "Régimen Código": "IDA3" },
      { ...penta, Subitem: 4, "Descripción Subitem": "SEMBRADORA-ABONADORA EN: 1 UNI. DE BARRA SEMBRADORA MODELO DAKAR 10 CF" },
    ])]);
    expect(imported.rows.map((row) => [row[3], row[4], row[5], ...row.slice(11)]))
      .toEqual([
        ["JOHN DEERE", "1212", "11–12 líneas", 12, "Grano grueso", "Lateral"],
        ["HORSCH", "MAESTRO 18.45 CF", "17–18 líneas", 18, "Grano grueso", "Autotransportable"],
      ]);
  });
  it("procesa solo el mes de un Penta mensual y usa la configuración guardada", async () => {
    const original = await readPlanterUpload([history]);
    const update = await readPlanterUpload([extract([{
      ...penta, "Marca Subitem": "JOHN DEERE",
      "Descripción Subitem": "UNA UNIDAD DE SEMBRADORA MODELO 1212",
    }])], original.rows);
    expect(update.period).toEqual({ start: 2025 * 12 + 9, end: 2025 * 12 + 9 });
    expect(update.rows).toHaveLength(1);
    expect(update.rows[0].slice(11)).toEqual([12, "Grano grueso", "Lateral"]);
  });
});
