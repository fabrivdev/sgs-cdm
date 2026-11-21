import type { ExportCell } from "@/components/exports/TableExportButton";
import { distributorHistory, salesCalendar, standingGrowth, unknownDealer, type MarketStanding } from "./marketShareAnalytics";
import { months, ratio } from "./model";
import { salesFamilies, salesTotal, type SalesFamily, type SalesPeriod } from "./marketShareModel";

type ExportView = "tablero" | "marcas" | "distribuidores" | "historia";
type ExportOptions = {
  view: ExportView;
  family: SalesFamily;
  year: number;
  cutoff: number;
  dataset: SalesPeriod[];
  current: SalesPeriod[];
  previous: SalesPeriod[];
  brands: MarketStanding[];
  dealers: MarketStanding[];
  shown: MarketStanding[];
  benchmark: string;
};

export async function exportMarketShare({ view, family, year, cutoff, dataset, current, previous, brands, dealers, shown, benchmark }: ExportOptions) {
  const xlsx = await import("xlsx");
  const book = xlsx.utils.book_new();
  const total = salesTotal(current);
  const priorTotal = previous.length ? salesTotal(previous) : null;
  const delta = priorTotal === null ? null : total - priorTotal;
  const yearLabel = `Al corte (${months[cutoff - 1]})`;

  function sheet(name: string, rows: ExportCell[][]) {
    const data = xlsx.utils.aoa_to_sheet(rows);
    data["!cols"] = rows[0].map((header, index) => ({
      wch: Math.min(42, Math.max(10, String(header).length + 3, ...rows.slice(1).map((row) => String(row[index] ?? "").length + 2))),
    }));
    rows[0].forEach((header, column) => {
      const title = String(header);
      const format = title === "Δ %" || title.startsWith("Cuota ") ? "0.0%" : title === "Δ p. p." ? "0.0" : null;
      if (!format) return;
      for (let row = 1; row < rows.length; row++) {
        const cell = data[xlsx.utils.encode_cell({ r: row, c: column })];
        if (cell?.t === "n") cell.z = format;
      }
    });
    xlsx.utils.book_append_sheet(book, data, name);
  }

  function ranking(name: string, entity: string, rows: MarketStanding[]) {
    sheet(name, [
      ["Posición", entity, `Uds. ${year - 1}`, `Uds. ${year}`, "Δ uds.", "Δ %", `Cuota ${year - 1}`, `Cuota ${year}`, "Δ p. p.", "Comparación"],
      ...rows.map((row) => [row.rank, row.name, row.priorUnits, row.units, row.delta, standingGrowth(row),
        row.priorShare, row.share, row.points, row.partialComparison ? "Solo distribuidores identificados" : null]),
      [null, "Total del mercado", priorTotal, total, delta, delta === null ? null : ratio(delta, priorTotal ?? 0),
        priorTotal ? 1 : null, total ? 1 : null, null],
    ]);
  }

  if (view === "historia") {
    const years = [...new Set(dataset.map((period) => period.anio))].sort((a, b) => b - a);
    const { periods, rows, aggregateOnly } = distributorHistory(dataset, years, cutoff);
    const totals = periods.map((period) => period.units);
    const sum = (values: (number | null)[]) => values.some((value) => value !== null)
      ? values.reduce<number>((count, value) => count + (value ?? 0), 0) : null;
    sheet("Ranking histórico", [
      ["Distribuidor", ...periods.map((period) => period.year), "Total"],
      ...[...rows.filter((row) => row.name !== unknownDealer), ...rows.filter((row) => row.name === unknownDealer)]
        .map((row) => [row.name, ...row.values, row.total]),
      ...(aggregateOnly.some((units) => units !== null) ? [["Sin desglose disponible", ...aggregateOnly, sum(aggregateOnly)]] : []),
      [`Total al corte (${months[cutoff - 1]})`, ...totals, sum(totals)],
    ]);
    sheet("Calendario de ventas", [
      ["Año", ...months, yearLabel, "Δ %", "Año completo"],
      ...salesCalendar(dataset, years, cutoff).map((row) => [row.year, ...row.values, row.total, row.growth, row.fullYear]),
    ]);
  } else if (view === "marcas") {
    ranking("Marcas", "Marca", shown);
  } else if (view === "distribuidores") {
    ranking("Distribuidores", "Distribuidor", shown);
  } else {
    const reference = brands.find((row) => row.name === benchmark);
    sheet("Resumen", [
      ["Equipo", "Año", "Acumulado hasta", "Total vendido", `Cuota ${benchmark}`, "Δ p. p."],
      [salesFamilies[family], year, months[cutoff - 1], total, reference?.share, reference?.points],
    ]);
    ranking("Marcas", "Marca", brands);
    ranking("Distribuidores", "Distribuidor", dealers);
  }

  xlsx.writeFile(book, `market-share-${family}-${view}-${year}-${String(cutoff).padStart(2, "0")}.xlsx`);
}
