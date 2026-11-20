import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readHarvesterReport } from "./harvesterImport";

function workbook(name: string, sheets: Record<string, XLSX.WorkSheet>) {
  const book = XLSX.utils.book_new();
  for (const [title, sheet] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(book, sheet, title);
  return {
    name,
    arrayBuffer: async () =>
      XLSX.write(book, { type: "array", bookType: "xlsx" }),
  };
}
const historical = {
  Despacho: "histórico",
  "FECHA\r\n DESPACHO": "2025-09-30",
  " CANTIDAD ": 1,
  " U$S FOB ": 300000,
  MARCA: "CLAAS",
  MODELO: "LEXION 7600",
  TIPO: "COS. GRANOS",
  CLASE: "CLASE 8",
  IMPORTADOR: "No disponible",
  ESTADO: "NUEVO",
};
const recent = {
  Despacho: "reciente",
  Item: 1,
  Subitem: 0,
  "Fecha Canc.": "2025-10-04",
  "Código NCM": "84335100000W",
  Cantidad: 7,
  "U$S FOB": 350000,
  "Marca Subitem": "CLASS",
  "Descripción Subitem": "UNA COSECHADORA MODELO LEXION 7600 ARROCERA",
  Régimen: "IMPORTACION A CONSUMO CON DOCUMENTO DE TRANSPORTE",
  "Estado Mercadería": "USADO",
  "Probable Importador": "AUTOMOTORES Y MAQUINARIA SAECA",
};

function exportFile(
  rows: Record<string, unknown>[],
  range = "10/2025 - 10/2025",
) {
  return workbook("export.xlsx", {
    SubItems: XLSX.utils.json_to_sheet(rows),
    Parámetros: XLSX.utils.aoa_to_sheet([
      ["Paraguay - Importaciones"],
      ["Período: " + range],
      ["Código NCM: 84335100000W"],
    ]),
  });
}

describe("Carga de cosechadoras", () => {
  const base = workbook("histórico.xlsx", {
    BASE: XLSX.utils.json_to_sheet([
      historical,
      historical,
      { ...historical, Despacho: "cabezal", TIPO: "PLAT. CORTE" },
    ]),
  });

  it("incorpora máquinas únicas con el FOB total y conserva la clase observada", async () => {
    const source = exportFile([
      recent,
      { ...recent, Despacho: "partes", "Código NCM": "84339090000D" },
      {
        ...recent,
        Despacho: "picadora",
        "Descripción Subitem": "COSECHADORA FORRAJERA JAGUAR 950",
      },
      {
        ...recent,
        Despacho: "depósito",
        Régimen: "INGRESO A DEPOSITO ADUANERO",
      },
    ]);
    const data = await readHarvesterReport([source, base, source]);
    expect(data).toHaveLength(2);
    expect(data[0].slice(1, 6)).toEqual([
      2025,
      9,
      "CLAAS",
      "LEXION 7600",
      "Clase 8",
    ]);
    expect(data[1].slice(1)).toEqual([
      2025,
      10,
      "CLAAS",
      "LEXION 7600",
      "Clase 8",
      "$300.000 o más",
      "AUTOMAQ",
      "USADO",
      1,
      350000,
    ]);
  });

  it("conserva los lotes explícitos y deja sin clase los modelos sin evidencia", async () => {
    const data = await readHarvesterReport([
      base,
      exportFile([
        {
          ...recent,
          Cantidad: 2,
          "Descripción Subitem":
            "2 UNIDADES DE COSECHADORA CLAAS MODELO TRION 745",
        },
      ]),
    ]);
    expect(data[1].slice(4, 7)).toEqual([
      "TRION 745",
      "Sin clase informada",
      "$100.000 a <$200.000",
    ]);
    expect(data[1].slice(9)).toEqual([2, 350000]);
  });

  it("rechaza una actualización con meses faltantes", async () => {
    await expect(
      readHarvesterReport([base, exportFile([recent], "11/2025 - 11/2025")]),
    ).rejects.toThrow(/Falta un período/);
  });
});
