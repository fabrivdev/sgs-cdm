import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readPlanterUpload } from "./planterImport";
import { plantingSummaryBand } from "./marketFamily";
import { completePlantingSegments } from "./planterSpecs";

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
  it("lee configuraciones declaradas y asigna bandas seguras sin inventar líneas exactas", async () => {
    const cases = [
      ["STARA", "SEMBRADORA MOD. PRINCESA 18-20, SERIE N. PRUEBA, C/18 CUERPOS, 50 CM"],
      ["TATU", "SEMBRADORA ABONADORA, MODELO PST PLUS FLEX 11/11E450 TIT ALP III"],
      ["FRAVI", "SEMBRADORA DE GRANO MODELO SFR 27 SENIOR"],
      ["MASSEY FERGUSON", "SEMBRADORA ABONADORA MF509XM"],
      ["MASSEY FERGUSON", "SEMBRADORA ABONADORA MF511XM"],
      ["KF", "UNA UNIDAD DE SEMBRADORA ABONADORA"],
    ];
    const result = await readPlanterUpload([extract(cases.map(([brand, description], Subitem) => ({
      ...penta, Subitem, "Marca Subitem": brand, "Descripción Subitem": description,
    })))]);
    expect(result.rows.map((row) => [row[4], row[5], row[11]])).toEqual([
      ["PRINCESA 18-20", "17–18 líneas", 18],
      ["PST PLUS FLEX 11", "11–12 líneas", 11],
      ["SFR 27 SENIOR", "25–29 surcos", 27],
      ["MF509XM", "Hasta 10 líneas", null],
      ["MF511XM", "Sin segmento informado", null],
      ["Sin identificar", "Sin segmento informado", null],
    ]);
  });

  it("clasifica la Maestro 40.45 GV con su FOB declarado", async () => {
    const result = await readPlanterUpload([extract([{
      ...penta,
      "Descripción Subitem": "SEMBRADORA ABONADORA MODELO MAESTRO 40.45 GV ENG V",
      "U$S FOB": 447_301.39,
    }])]);
    expect(result.rows[0]).toMatchObject({ 4: "MAESTRO 40.45 GV F", 5: "Más de 27 líneas", 10: 447_301.39, 11: 40 });
  });

  it("ubica la Dakar 8 CF en la banda común sin copiar los 60 surcos de OCIT", async () => {
    const baseline = await readPlanterUpload([history]);
    baseline.rows.push(["ocit:DK", 2025, 9, "HORSCH", "DAKAR 8 CF", "Más de 37 surcos", "$100.000 a <$200.000", "A", "NUEVO", 1, 111_518.28, 60, "Grano fino", "Autotransportable"]);
    const result = await readPlanterUpload([extract([
      { ...penta, "Descripción Subitem": "SEMBRADORA MODELO DAKAR 8 CF", "U$S FOB": 155_104.13 },
      { ...penta, Subitem: 2, "Descripción Subitem": "SEMBRADORA MODELO DAKAR 8 CF 34 LINEAS" },
      { ...penta, Subitem: 3, "Marca Subitem": "MASSEY FERGUSON", "Descripción Subitem": "SEMBRADORA ABONADORA MF511XM" },
      { ...penta, Subitem: 4, "Marca Subitem": "AGRI", "Descripción Subitem": "SEMBRADORA DE MAIZ DOS HILERAS" },
    ])], baseline.rows);
    expect(result.rows.map((row) => [row[11], plantingSummaryBand(row)])).toEqual([
      [null, "30 líneas o más"],
      [34, "30 líneas o más"],
      [null, "Hasta 14 líneas"],
      [2, "Hasta 14 líneas"],
    ]);
    const [oldDakar] = completePlantingSegments(baseline.rows.slice(-1));
    expect(oldDakar[11]).toBeNull();
    expect(plantingSummaryBand(oldDakar)).toBe("30 líneas o más");
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
