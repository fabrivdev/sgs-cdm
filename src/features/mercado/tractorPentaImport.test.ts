import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTractorUpload } from "./tractorPentaImport";
import { findTractorPowerModel, sourceTractorPowerBand } from "./power";
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
  it("distingue la potencia declarada de los límites del arancel", () => {
    const tariff = "SUPERIOR A 37 KW PERO INFERIOR O IGUAL A 75 KW";
    expect(sourceTractorPowerBand(tariff, "87019300")).toBeUndefined();
    expect(sourceTractorPowerBand(tariff, "87019200")).toBeUndefined();
    expect(sourceTractorPowerBand(tariff, "87019300", 93)).toBe("81–120 HP");
    expect(sourceTractorPowerBand(tariff + "; TRACTOR DE 47,7 KW", "87019300")).toBe("Hasta 80 HP");
    expect(sourceTractorPowerBand("TRACTOR SIN MODELO", "87019200")).toBe("Hasta 80 HP");
  });

  it("identifica modelos declarados con el prefijo pegado o con varios términos", () => {
    expect(findTractorPowerModel("JOHN DEERE", "TRACTOR MODELO7M230, ANO 2026")).toBe("7M230");
    expect(findTractorPowerModel("CASE IH", "MODELO: FARMALL JXM 75 SINGLE")).toBe("FARMALL JXM 75");
    expect(findTractorPowerModel("CASE IH", "MODELO: FARMALL JXM 750")).toBeUndefined();
    expect(findTractorPowerModel("ZOOMLION", "TRACTOR RN1104-1 CHASIS")).toBe("RN1104-1");
  });

  it("completa el informe histórico con los subítems originales por clave", async () => {
    const book = XLSX.utils.book_new();
    const base = {
      Año: 2026, Mes: 10, Marca: "CASE IH", Modelo: "Sin identificar",
      Potencia: "Sin potencia informada", "Nivel de precio": "Menos de USD 25.000",
      Importador: "Automaq", Estado: "NUEVO", Unidades: 1, "FOB USD": 10_000,
    };
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { ...base, Clave: "despacho|1|0" },
      { ...base, Clave: "despacho|2|0", Potencia: "121–170 HP" },
      { ...base, Clave: "otro|1|0" },
    ]), "Base analítica");
    const declaration = { ...tractor, "Descripción Subitem": "TRACTOR MODELO FARMALL JXM 75" };
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      declaration, { ...declaration, Item: 2 },
    ]), "Original SubItems");
    const { rows, period } = await readTractorUpload({
      name: "informe.xlsx",
      arrayBuffer: async () => XLSX.write(book, { type: "array", bookType: "xlsx" }),
    }, []);
    expect(period).toBeUndefined();
    expect(rows.map((row) => row.slice(4, 6))).toEqual([
      ["FARMALL JXM 75", "Hasta 80 HP"],
      ["Sin identificar", "121–170 HP"],
      ["Sin identificar", "Sin potencia informada"],
    ]);
    expect(rows.map((row) => row.slice(9))).toEqual([[1, 10_000], [1, 10_000], [1, 10_000]]);
  });

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
