import type { ResultadoSugerencia } from "@/hooks/useSugerenciasCompra";
import { sortSalesRows, type SalesColumn, type SalesSort } from "@/components/ventas/salesTableInteraction";

export const suggestionColumns: SalesColumn<ResultadoSugerencia>[] = [
  { key: "producto_codigo", label: "Pieza", kind: "text", value: r => r.producto_codigo },
  { key: "clase", label: "Clase", kind: "text", value: r => `${r.abc}${r.fsn}${r.xyz} ${r.segmento}` },
  { key: "stock_global", label: "Stock", kind: "number", align: "right", value: r => r.stock_global },
  { key: "demanda_ponderada_mensual", label: "Demanda mensual", kind: "number", align: "right", value: r => r.demanda_ponderada_mensual },
  { key: "cobertura", label: "Cobertura", kind: "number", align: "right", value: r => r.unidades_12m > 0 ? Math.max(0, r.stock_global / (r.unidades_12m / 12)) : null },
  { key: "ultima_venta", label: "Última venta", kind: "date", align: "right", value: r => r.ultima_venta?.slice(0, 10) },
  { key: "stock_objetivo", label: "Objetivo", kind: "number", align: "right", value: r => r.stock_objetivo },
  { key: "sugerencia_unidades", label: "Sugerencia", kind: "number", align: "right", value: r => r.sugerencia_unidades },
];

/** Each server partition must use this same primary order BEFORE its LIMIT. */
export function orderSuggestions(rows: ResultadoSugerencia[], sort?: SalesSort) {
  const ties = sortSalesRows(rows, suggestionColumns, { key: "producto_codigo", direction: "asc" });
  return sortSalesRows(ties, suggestionColumns, sort ?? { key: "sugerencia_unidades", direction: "desc" });
}
