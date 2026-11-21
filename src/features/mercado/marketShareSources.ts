import type { Sale, SalesPeriod } from "./marketShareModel";

const id = ({ familia, anio, mes }: SalesPeriod) => `${familia}:${anio}:${mes}`;

function byBrand(rows: Sale[]) {
  const grouped = new Map<string, Sale[]>();
  for (const row of rows) {
    const group = grouped.get(row.marca);
    if (group) group.push(row);
    else grouped.set(row.marca, [row]);
  }
  return grouped;
}

function completeDistributors(period: SalesPeriod, historical?: SalesPeriod): SalesPeriod {
  if (!period.detalle || !historical?.detalle || !period.detalle.some((sale) => sale.distribuidor === null)) return period;
  const historicalBrands = byBrand(historical.detalle);
  const details = [...byBrand(period.detalle)].flatMap(([brand, current]) => {
    if (!current.some((sale) => sale.distribuidor === null)) return current;
    const candidate = historicalBrands.get(brand);
    if (!candidate || candidate.some((sale) => sale.distribuidor === null)) return current;
    const candidateTotal = candidate.reduce((sum, sale) => sum + sale.unidades, 0);
    if (candidateTotal !== current.reduce((sum, sale) => sum + sale.unidades, 0)) return current;
    const agrees = current.every((sale) => sale.distribuidor === null || candidate.some((historicalSale) =>
      historicalSale.distribuidor === sale.distribuidor && historicalSale.unidades >= sale.unidades));
    return agrees ? candidate : current;
  });
  return { ...period, detalle: details };
}

export function combineMarketShareSources(report: SalesPeriod[], cadam: SalesPeriod[]) {
  const periods = new Map(cadam.map((period) => [id(period), period]));
  for (const period of report) {
    const key = id(period);
    const historical = periods.get(key);
    if (historical && (period.anio < 2025 || (period.detalle === null && period.total === historical.total))) continue;
    periods.set(key, completeDistributors(period, historical));
  }
  return [...periods.values()];
}
