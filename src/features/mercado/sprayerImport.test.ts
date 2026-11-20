import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSprayerUpload } from "./sprayerImport";

function file(name: string, sheets: Record<string, XLSX.WorkSheet>) {
  const book = XLSX.utils.book_new();
  for (const [key, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, sheet, key);
  return { name, arrayBuffer: async () => XLSX.write(book, { bookType: "xlsx", type: "array" }) };
}
const row = {
  Despacho: "PRUEBA", Item: 1, Subitem: 0, "Fecha Canc.": "2026-10-03",
  "Código NCM": "84244900000A", "Régimen Código": "IC04", "Marca Subitem": "HORSCH",
  "Descripción Subitem": "PULVERIZADOR AUTOPROPULSADO LEEB 5280 VL",
  "U$S FOB": 340_000, Cantidad: 1, "Estado Mercadería": "NUEVO",
};
const ocit = file("OCIT_Pulverizadores.xlsx", {
  base: XLSX.utils.json_to_sheet([{
    ...row, Despacho: "OCIT", "Fecha Canc.": "2026-09-05", "Descripción Subitem": "LEEB 5.280 VL",
    LINEA: "SEGMENTO D", TANQUE: 5000, HP: 280, BARRA: 36,
  }]),
});
function extract(rows: Record<string, unknown>[]) {
  return file("Penta.xlsx", {
    SubItems: XLSX.utils.json_to_sheet(rows),
    "Parámetros": XLSX.utils.aoa_to_sheet([["Período: 10/2026 - 10/2026"], ["Código NCM: 84244900000A, 84248221000A"]]),
  });
}

describe("Importación de pulverizadores", () => {
  it("incorpora solo autopropulsados y usa la ficha histórica del mismo modelo", async () => {
    const imported = await readSprayerUpload([ocit, extract([
      row,
      { ...row, Subitem: 1, "Descripción Subitem": "PULVERIZADOR DE ARRASTRE CONDOR 600 LITROS" },
      { ...row, Subitem: 2, "Descripción Subitem": "PULVERIZADOR AGRÍCOLA EN: BOQUILLAS PARA LEEB 5280 VL" },
      { ...row, Subitem: 3, "Marca Subitem": "DJI", "Descripción Subitem": "DRON PULVERIZADOR AUTOPROPULSADO" },
      { ...row, Subitem: 4, "Marca Subitem": "JENC", "Código NCM": "84248990000V", "Descripción Subitem": "APARATOS MECANICOS (INCLUSO MANUALES) EN BARRAS COMPLETAS PARA PULVERIZADORES AUTOPROPELIDOS" },
    ])]);
    expect(imported.rows).toHaveLength(2);
    expect(imported.rows[1].slice(3, 6)).toEqual(["HORSCH", "LEEB 5.280 VL", "Más de 4.500 l"]);
    expect(imported.rows[1].slice(11)).toEqual([5000, "Más de 27 a 36 m", "221–280 HP"]);
  });
  it("lee un solo período y distingue el tanque del caudal de la bomba", async () => {
    const imported = await readSprayerUpload([extract([{
      ...row, "Marca Subitem": "KUHN",
      "Descripción Subitem": "PULVERIZADOR AUTOPROPULSADO KUHN FIGHTER 3000; BOMBA 300 L/MIN; TANQUE DE 3.000 LITROS; BOTALONES 36M; MOTOR 145KW",
    }])]);
    expect(imported.period).toEqual({ start: 2026 * 12 + 9, end: 2026 * 12 + 9 });
    expect(imported.rows[0].slice(11)).toEqual([3000, "Más de 27 a 36 m", "151–220 HP"]);
  });
  it("conserva el FOB al corregir la cantidad declarada de un solo chasis", async () => {
    const imported = await readSprayerUpload([extract([{
      ...row, "Marca Subitem": "JOHN DEERE", Cantidad: 7, "Kgs. Netos": 16_330,
      "Estado Mercadería": "USADO", "U$S FOB": 131_332,
      "Descripción Subitem": "PULVERIZADOR AGRICOLA JOHN DEERE, MODELO R4038 2015, USADO CON SUS ACCESORIOS CORRESPONDIENTES",
    }])]);
    expect(imported.rows[0][9]).toBe(1);
    expect(imported.rows[0][10]).toBe(131_332);
    expect(imported.rows[0][6]).toBe("$100.000 a <$150.000");
  });
});
