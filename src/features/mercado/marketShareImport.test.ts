import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readMarketShareUpload } from "./marketShareImport";

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sept", "Oct", "Nov", "Dic"];

function fixture(total: number) {
  const book = XLSX.utils.book_new();
  const header = ["Marca", "Dealer", ...months.flatMap((month) => [month, "%"])];
  const sheet = XLSX.utils.aoa_to_sheet([
    ["VENTAS DE TRACTORES AÑO 2026"], header,
    ["JOHN DEERE", "KUROSU", 4, 999, 0, 0],
    ["CASE", "CIABAY", 2, 999, 0, 0],
    ["Total", null, total, 1, 0, 1, 0, 1],
    ["Mercado 2025", null, 5, null, 7],
  ]);
  XLSX.utils.book_append_sheet(book, sheet, "2026");
  XLSX.utils.book_append_sheet(book, sheet, "2026 (2)");
  return { name: "ventas.xlsx", arrayBuffer: async () => XLSX.write(book, { type: "array", bookType: "xlsx" }) };
}

describe("Importación de Market Share", () => {
  it("lee unidades, evita duplicados y preserva la cobertura de meses", async () => {
    const months = await readMarketShareUpload(fixture(6));
    expect(months.map((row) => [row.anio, row.mes, row.total])).toEqual([
      [2026, 1, 6], [2026, 2, 0], [2025, 1, 5], [2025, 2, 7],
    ]);
    expect(months[0].detalle).toEqual([
      { marca: "JOHN DEERE", distribuidor: "Kurosu", unidades: 4 },
      { marca: "CASE IH", distribuidor: "Ciabay", unidades: 2 },
    ]);
    expect(months[2].detalle).toBeNull();
  });

  it("rechaza un total mensual incompatible con las unidades detalladas", async () => {
    await expect(readMarketShareUpload(fixture(7))).rejects.toThrow(/no coinciden/);
  });
});
