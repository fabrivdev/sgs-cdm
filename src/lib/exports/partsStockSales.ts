export interface FullPartsStockSalesRow {
  codigo: string;
  codigos_anteriores: string | null;
  codigo_fabricante: string | null;
  descripcion: string;
  marca: string;
  familia: string | null;
  unidad: string | null;
  santa_rita: number;
  santa_rosa: number;
  campo_9: number;
  misiones: number;
  loma_plata: number;
  katuete: number;
  stock_total: number;
  ventas_12m: number;
  ventas_24m: number;
  ventas_36m: number;
  origen: string;
  estado_producto: string;
  estado_vinculo: string;
  fecha_corte: string;
}

export interface ClaasStockSalesRow {
  codigo_interno: string;
  codigo_fabricante: string | null;
  marca: "CLAAS";
  stock: number;
  ventas_12m: number;
  ventas_24m: number;
  ventas_36m: number;
  origen_sistema: "SISTEMA NUEVO" | "SISTEMA VIEJO" | "SISTEMA NUEVO + SISTEMA VIEJO";
}

const number = (value: unknown) => Number(value) || 0;

export function shouldExportClaasReport(brands: string[]) {
  return brands.length === 1 && brands[0] === "CLAAS";
}

export function buildPartsStockSalesExport(rows: FullPartsStockSalesRow[]) {
  const detail = rows.map((row) => ({
    "Código": row.codigo,
    "Códigos anteriores": row.codigos_anteriores ?? "",
    "Código fabricante": row.codigo_fabricante ?? "",
    "Descripción": row.descripcion,
    "Marca": row.marca,
    "Familia": row.familia ?? "",
    "Unidad": row.unidad ?? "",
    "Santa Rita": number(row.santa_rita),
    "Santa Rosa": number(row.santa_rosa),
    "Campo 9": number(row.campo_9),
    "Misiones": number(row.misiones),
    "Loma Plata": number(row.loma_plata),
    "Katuete": number(row.katuete),
    "Stock total": number(row.stock_total),
    "Ventas 12M": number(row.ventas_12m),
    "Ventas 24M": number(row.ventas_24m),
    "Ventas 36M": number(row.ventas_36m),
    "Origen": row.origen,
    "Estado producto": row.estado_producto,
    "Estado vínculo": row.estado_vinculo,
    "Fecha de corte": row.fecha_corte,
  }));

  const pending = detail.filter((_, index) =>
    !["NO_APLICA", "CONSOLIDADO"].includes(rows[index].estado_vinculo),
  );
  const byOrigin = new Map<string, number>();
  rows.forEach((row) => byOrigin.set(row.origen, (byOrigin.get(row.origen) ?? 0) + 1));
  const control: Array<{ Indicador: string; Valor: string | number }> = [
    { Indicador: "Fecha de corte", Valor: rows[0]?.fecha_corte ?? new Date().toISOString().slice(0, 10) },
    { Indicador: "Productos exportados", Valor: rows.length },
    { Indicador: "Productos con stock", Valor: rows.filter((row) => number(row.stock_total) > 0).length },
    { Indicador: "Productos con stock cero", Valor: rows.filter((row) => number(row.stock_total) === 0).length },
    { Indicador: "Códigos con ventas 36M", Valor: rows.filter((row) => number(row.ventas_36m) !== 0).length },
    { Indicador: "Códigos pendientes de revisión", Valor: pending.length },
    { Indicador: "Stock total", Valor: rows.reduce((sum, row) => sum + number(row.stock_total), 0) },
    { Indicador: "Ventas netas 12M", Valor: rows.reduce((sum, row) => sum + number(row.ventas_12m), 0) },
    { Indicador: "Ventas netas 24M", Valor: rows.reduce((sum, row) => sum + number(row.ventas_24m), 0) },
    { Indicador: "Ventas netas 36M", Valor: rows.reduce((sum, row) => sum + number(row.ventas_36m), 0) },
    ...[...byOrigin.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([origin, count]) => ({
      Indicador: `Origen: ${origin}`,
      Valor: count,
    })),
  ];

  return { detail, pending, control };
}

export function buildClaasStockSalesReport(rows: ClaasStockSalesRow[]) {
  return rows.map((row) => ({
    "Código interno": row.codigo_interno,
    "Código fabricante": row.codigo_fabricante ?? "",
    "Marca": "CLAAS",
    "Stock": number(row.stock),
    "Ventas 12M": number(row.ventas_12m),
    "Ventas 24M": number(row.ventas_24m),
    "Ventas 36M": number(row.ventas_36m),
    "Origen sistema": row.origen_sistema,
  }));
}
