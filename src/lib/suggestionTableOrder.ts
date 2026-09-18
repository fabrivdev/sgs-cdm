import type { ResultadoSugerencia } from "@/hooks/useSugerenciasCompra";
import { sortSalesRows, type SalesColumn, type SalesSort } from "@/components/ventas/salesTableInteraction";

export const suggestionColumns: SalesColumn<ResultadoSugerencia>[] = [
  { key: "marca", label: "Marca", kind: "text", value: r => r.marca },
  { key: "producto_codigo", label: "Código", kind: "text", value: r => r.producto_codigo },
  { key: "codigo_fabricante", label: "Cód. fabr.", kind: "text", value: r => r.codigo_fabricante },
  { key: "descripcion", label: "Descripción", kind: "text", value: r => r.descripcion },
  { key: "clase", label: "Clase", kind: "text", align: "center", value: r => `${r.abc}${r.fsn}${r.xyz}` },
  { key: "segmento", label: "Segmento", kind: "text", value: r => r.segmento },
  { key: "stock_global", label: "Stock", kind: "number", align: "center", value: r => r.stock_global },
  { key: "demanda_ponderada_mensual", label: "Dem. pond.", kind: "number", align: "center", value: r => r.demanda_ponderada_mensual },
  { key: "cobertura", label: "Cobertura 12m", kind: "number", align: "center", value: suggestionCoverage },
  { key: "ultima_venta", label: "Última venta", kind: "date", value: r => r.ultima_venta?.slice(0, 10) },
  { key: "stock_objetivo", label: "Objetivo", kind: "number", align: "center", value: r => r.stock_objetivo },
  { key: "sugerencia_unidades", label: "Sugerencia", kind: "number", align: "center", value: r => r.sugerencia_unidades },
];

/** Descriptive stock coverage, not the weighted forecast used for purchasing. */
export function suggestionCoverage(row: ResultadoSugerencia) {
  const monthly = Math.max(0, row.unidades_12m) / 12;
  return monthly > 0 ? Math.max(0, row.stock_global / monthly) : null;
}

/** Each server partition must use this same primary order BEFORE its LIMIT. */
export function orderSuggestions(rows: ResultadoSugerencia[], sort?: SalesSort) {
  const ties = sortSalesRows(rows, suggestionColumns, { key: "producto_codigo", direction: "asc" });
  return sortSalesRows(ties, suggestionColumns, sort ?? { key: "sugerencia_unidades", direction: "desc" });
}
