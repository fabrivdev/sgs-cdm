import { appendMarketSheet, excelMoney, excelPercent, type MarketExcelRow } from "./marketExcel";
import { marketFamilies, plantingSummaryBand, type MarketFamily } from "./marketFamily";
import { ratio, type Movement } from "./model";

const fob = "Valor FOB";
const average = "FOB unitario";

export async function exportMarketImports({ family, view, year, end, month, title, summary, detail }: {
  family: MarketFamily; view: string; year: number; end: number; month: number;
  title: string; summary: MarketExcelRow[]; detail: Movement[];
}) {
  const xlsx = await import("xlsx");
  const book = xlsx.utils.book_new();
  const extraColumns = family === "sembradoras" ? ["Líneas", "Tipo de grano", "Transporte"]
    : family === "pulverizadores" ? ["Litros del tanque", "Ancho de barra", "Potencia HP"] : [];
  appendMarketSheet(xlsx, book, title, summary, {
    [fob]: excelMoney, "Valor FOB anterior": excelMoney, [average]: excelMoney, "FOB unitario anterior": excelMoney,
    "Variación interanual": excelPercent, "Δ cuota (pp)": "0.0",
  });
  appendMarketSheet(xlsx, book, "Detalle", [
    ["Año", "Mes", "Marca", "Modelo", marketFamilies[family].segmentHeader, "Tramo FOB", "Importador", "Estado", "Unidades", fob, average, ...extraColumns],
    ...detail.map((row) => [
      row[1], row[2], row[3], row[4], family === "sembradoras" ? plantingSummaryBand(row) : row[5],
      row[6].replace("USD ", "$"), row[7], row[8], row[9], row[10], ratio(row[10], row[9]),
      ...(extraColumns.length ? [row[11], row[12], row[13]] : []),
    ]),
  ], { [fob]: excelMoney, [average]: excelMoney });
  const cutoff = String(month || end).padStart(2, "0");
  xlsx.writeFile(book, `importaciones-${family}-${view}-${year}-${month ? "mes" : "corte"}-${cutoff}.xlsx`);
}
