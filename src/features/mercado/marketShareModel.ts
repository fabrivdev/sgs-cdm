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

export const parseSalesPeriods = (value: unknown) => z.array(salesPeriod).parse(value);
export type SalesPeriod = z.infer<typeof salesPeriod>;
export type SalesFamily = keyof typeof salesFamilies;
export type Sale = z.infer<typeof sale>;

export function salesTotal(periods: SalesPeriod[]) {
  return periods.reduce((sum, period) => sum + period.total, 0);
}
