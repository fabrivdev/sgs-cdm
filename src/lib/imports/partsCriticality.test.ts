import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { leerCriticidadesDesdeExcel } from "./partsCriticality";

describe("leerCriticidadesDesdeExcel", () => {
  it("extrae y normaliza criticidades de la hoja MATRIZ", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Parámetros"],
      [],
      ["Cód. Merc", "Cód. Fabr.", "CRITICIDAD", "MARCA"],
      [8149, "07647391", "VITAL", "CLAAS"],
      [5000, "ABC-10", "Esencial", "CLAAS"],
      [6000, "XYZ-20", "DESEABLE", "CLAAS"],
      [7000, "XYZ-30", "Sin definir", "CLAAS"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "MATRIZ");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => bytes } as File;

    const result = await leerCriticidadesDesdeExcel(file);

    expect(result.items).toEqual([
      { codigo_interno: "8149", codigo_fabricante: "07647391", criticidad: "V" },
      { codigo_interno: "5000", codigo_fabricante: "ABC-10", criticidad: "E" },
      { codigo_interno: "6000", codigo_fabricante: "XYZ-20", criticidad: "D" },
    ]);
    expect(result.filasInvalidas).toBe(1);
    expect(result.marcas).toEqual(["CLAAS"]);
  });
});
