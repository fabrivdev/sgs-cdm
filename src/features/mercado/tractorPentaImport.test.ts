import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTractorUpload } from "./tractorPentaImport";
import type { Movement } from "./model";

const tractor = {
  Despacho: "despacho",
  Item: 1,
  Subitem: 0,
  "Fecha Canc.": "2026-10-04",
  "Código NCM": "87019590000J",
  "Régimen Código": "IC09",
  "Marca Subitem": "KUBOCA",
  "Descripción Subitem": "UNA UNIDAD TRACTOR MODELO M8540 DE 85 HP",
  "Estado Mercadería": "NUEVO",
  "Probable Importador": "AUTOMOTORES Y MAQUINARIA SAECA",
  Cantidad: 7,
  "U$S FOB": 45_000,
};

function nativeWorkbook(ncm = "87019590000J") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet([
      tractor,
      tractor,
      { ...tractor, Item: 2, "Régimen Código": "IDA3" },
      { ...tractor, Item: 3, "Fecha Canc.": "2026-09-30" },
    ]),
    "SubItems",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Paraguay - Importaciones"],
      ["Período: 10/2026 - 10/2026"],
      ["Código NCM: " + ncm],
    ]),
    "Parámetros",
  );
  return {
    name: "octubre.xlsx",
    arrayBuffer: async () =>
      XLSX.write(book, { type: "array", bookType: "xlsx" }),
  };
}

describe("Carga original de tractores", () => {
  it("lee solo el período declarado y concilia las claves del informe anterior", async () => {
    const original: Movement = [
      "despacho|1|0",
      2026,
      10,
      "KUBOTA",
      "M 8540",
      "81–120 HP",
      "USD 25.000 a <50.000",
      "Automaq",
      "NUEVO",
      1,
      40_000,
    ];
    const { period, rows } = await readTractorUpload(nativeWorkbook(), [
      original,
    ]);
    expect(period).toEqual({ start: 2026 * 12 + 9, end: 2026 * 12 + 9 });
    expect(rows).toEqual([[...original.slice(0, 10), 45_000]]);
  });

  it("rechaza un extracto de otra familia de máquinas", async () => {
    await expect(
      readTractorUpload(nativeWorkbook("84335100000W"), []),
    ).rejects.toThrow(/familia/);
  });
});
