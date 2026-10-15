export const STOCK_BANDS = [
  { id: "HASTA_365", label: "Hasta 365 días", className: "bg-emerald-600" },
  { id: "DE_366_A_730", label: "De 366 a 730 días", className: "bg-amber-500" },
  { id: "MAS_730", label: "Más de 730 días", className: "bg-red-500" },
  { id: "SIN_FECHA", label: "Sin fecha", className: "bg-slate-300" },
] as const;
export const GROUP_LABELS = { marca: "Marca", familia: "Familia", sucursal: "Sucursal", deposito: "Depósito" } as const;

export function purchaseAgeBand(days: number | null | undefined) {
  if (days == null || !Number.isFinite(days) || days < 0) return STOCK_BANDS[3];
  return days <= 365 ? STOCK_BANDS[0] : days <= 730 ? STOCK_BANDS[1] : STOCK_BANDS[2];
}
