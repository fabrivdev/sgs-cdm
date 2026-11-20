import { z } from "zod";

// One observation per source line, keeping only fields needed for the report.
export const movements = z
  .array(
    z.tuple([
      z.string().min(1),
      z.number().int().min(2000).max(2100),
      z.number().int().min(1).max(12),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.number().int().positive(),
      z.number().finite().nonnegative(),
    ]),
  )
  .nonempty();
export type Movement = [
  string,
  number,
  number,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
];
export const parseMovements = (value: unknown): Movement[] =>
  movements
    .parse(value)
    .map(
      ([
        id,
        year,
        month,
        brand,
        model,
        power,
        price,
        importer,
        state,
        units,
        fob,
      ]) => [
        id,
        year,
        month,
        brand,
        model,
        power,
        price,
        importer,
        state,
        units,
        fob,
      ],
    );
export const dimensions = {
  marcas: "Marcas",
  modelos: "Modelos",
  potencia: "Potencia HP",
  precios: "Precios",
  importadores: "Importadores",
} as const;
export type Dimension = keyof typeof dimensions;
export const dimensionKeys = Object.keys(dimensions) as Dimension[];
export const harvestClasses = Array.from(
  { length: 9 },
  (_, i) => `Clase ${i + 3}`,
);
export const unknownHarvestClass = "Sin clase informada";
const harvestPriceThresholds = [50_000, 100_000, 200_000, 300_000];
export const harvestPriceBands = [
  "Menos de $50.000",
  "$50.000 a <$100.000",
  "$100.000 a <$200.000",
  "$200.000 a <$300.000",
  "$300.000 o más",
];
export function harvestPriceBand(fobPerUnit: number) {
  if (fobPerUnit <= 0) return "Sin FOB positivo";
  const index = harvestPriceThresholds.findIndex(
    (threshold) => fobPerUnit < threshold,
  );
  return harvestPriceBands[index < 0 ? harvestPriceBands.length - 1 : index];
}
export function label(r: Movement, d: Dimension) {
  return {
    marcas: r[3],
    modelos: r[3] + " · " + r[4],
    potencia: r[5],
    precios: r[6],
    importadores: r[7],
  }[d];
}
export const months = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
export const number = (n: number) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
export const money = (n: number | null) => (n === null ? "—" : "$" + number(n));
export const percent = (n: number | null) =>
  n === null
    ? "—"
    : (n * 100).toLocaleString("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + " %";
export const ratio = (a: number, b: number) => (b ? a / b : null);
export function totals(rows: Movement[]) {
  return rows.reduce(
    (v, r) => ({ units: v.units + r[9], fob: v.fob + r[10] }),
    { units: 0, fob: 0 },
  );
}
export function pricedAverage(rows: Movement[]) {
  const priced = totals(rows.filter((row) => row[10] > 0));
  return ratio(priced.fob, priced.units);
}
export function compare(
  current: Movement[],
  previous: Movement[],
  by: (r: Movement) => string,
) {
  const groups = new Map<
    string,
    {
      name: string;
      units: number;
      prior: number;
      fob: number;
      priorFob: number;
    }
  >();
  function add(rows: Movement[], currentYear: boolean) {
    for (const r of rows) {
      const name = by(r);
      const g = groups.get(name) ?? {
        name,
        units: 0,
        prior: 0,
        fob: 0,
        priorFob: 0,
      };
      g[currentYear ? "units" : "prior"] += r[9];
      g[currentYear ? "fob" : "priorFob"] += r[10];
      groups.set(name, g);
    }
  }
  add(current, true);
  add(previous, false);
  return [...groups.values()].sort(
    (a, b) => b.units - a.units || a.name.localeCompare(b.name, "es"),
  );
}
export function leadingBrands(groups: ReturnType<typeof compare>) {
  const top = groups.slice(0, 6),
    claas = groups.find((x) => x.name === "CLAAS");
  return claas && !top.includes(claas) ? [...top, claas] : top;
}
export async function readReport(file: File): Promise<Movement[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), {
    sheets: ["Base analítica"],
  });
  const sheet = book.Sheets["Base analítica"];
  if (!sheet)
    throw new Error("Seleccioná el informe con la hoja Base analítica.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const seen = new Set<string>();
  return parseMovements(
    rows.map((r, i) => {
      const key = String(r.Clave ?? "");
      if (seen.has(key))
        throw new Error("Clave repetida en la fila " + (i + 2) + ".");
      seen.add(key);
      return [
        key,
        r.Año,
        r.Mes,
        r.Marca,
        r.Modelo,
        r.Potencia,
        r["Nivel de precio"],
        r.Importador,
        r.Estado,
        r.Unidades,
        r["FOB USD"],
      ];
    }),
  );
}
