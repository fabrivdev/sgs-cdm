export const STOCK_BANDS = [
  { id: "HASTA_365", label: "Hasta 365 días", className: "bg-emerald-600" },
  { id: "DE_366_A_730", label: "De 366 a 730 días", className: "bg-amber-500" },
  { id: "MAS_730", label: "Más de 730 días", className: "bg-red-500" },
  { id: "SIN_FECHA", label: "Sin fecha", className: "bg-slate-300" },
] as const;
export const GROUP_LABELS = { marca: "Marca", familia: "Familia", sucursal: "Sucursal", deposito: "Depósito" } as const;
