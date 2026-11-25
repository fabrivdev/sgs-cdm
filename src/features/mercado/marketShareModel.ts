import { z } from "zod";

export const salesFamilies = {
  tractores: "Tractores",
  cosechadoras: "Cosechadoras",
  pulverizadores: "Pulverizadores",
} as const;

const sale = z.object({
  marca: z.string().min(1),
  distribuidor: z.string().min(1).nullable(),
  unidades: z.number().int().positive(),
});
const salesPeriod = z.object({
  familia: z.enum(["tractores", "cosechadoras", "pulverizadores"]),
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
  total: z.number().int().nonnegative(),
  detalle: z.array(sale).nullable(),
});

export type SalesPeriod = z.infer<typeof salesPeriod>;
export type SalesFamily = keyof typeof salesFamilies;
export type Sale = z.infer<typeof sale>;

export const camposDealer = "Campos del Mañana";

function isCamposDealer(name: string | null) {
  const key = name?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim();
  return key === "CAMPOS DEL MANANA" || key === "CAMPOS DEL MANANA SA"
    || key === "CAMPOS DEL MANANA S A" || key === "CAMPOS D M" || key === "CDM";
}

export function parseSalesPeriods(value: unknown): SalesPeriod[] {
  return z.array(salesPeriod).parse(value).map((period) => {
    if (period.familia !== "pulverizadores" || !period.detalle) return period;

    const detalle: Sale[] = [];
    let unidades = 0;
    for (const row of period.detalle) {
      if ((row.marca === "CLAAS" || row.marca === "HORSCH") && isCamposDealer(row.distribuidor)) {
        unidades += row.unidades;
      } else {
        detalle.push(row);
      }
    }
    if (!unidades) return period;
    detalle.push({ marca: "HORSCH", distribuidor: camposDealer, unidades });
    return { ...period, detalle };
  });
}

export function salesTotal(periods: SalesPeriod[]) {
  return periods.reduce((sum, period) => sum + period.total, 0);
}
