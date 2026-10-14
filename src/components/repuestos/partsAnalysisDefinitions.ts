export const STOCK_BANDS = [
  { id: "RECIENTE", label: "Venta ≤365 días", className: "bg-emerald-600", colors: ["VERDE_OSCURO", "VERDE_CLARO"] },
  { id: "ANTIGUA", label: "Venta >365 días", className: "bg-amber-500", colors: ["AMARILLO", "NARANJA", "LILA", "GRIS"] },
  { id: "SIN_VENTA", label: "Sin venta confirmada", className: "bg-red-500", colors: ["ROJO", "SIN_DATOS"] },
] as const;

export const GROUP_LABELS = { marca: "Marca", familia: "Familia", sucursal: "Sucursal", deposito: "Depósito" } as const;

export const ROTATION_REQUIREMENTS = [
  ["Estado", "No calculable con las fuentes actuales"],
  ["Fórmula", "Costo de ventas del período / inventario promedio valorizado del mismo período"],
  ["Costo de ventas", "Falta historial analítico con salidas por venta y devoluciones identificadas, moneda USD confirmada y cobertura conciliada"],
  ["Inventario promedio", "Faltan saldos valorizados con fecha de corte o saldo inicial y movimientos completos para reconstruirlos"],
  ["Sucursal y familia", "Ambos términos deben cubrir los mismos productos, ubicaciones y fechas; se dividen sumas, no se promedian ratios"],
  ["Semáforos", "Clasifican por la última venta global confirmada. No miden la edad física de las unidades ni la rotación"],
] as const;
