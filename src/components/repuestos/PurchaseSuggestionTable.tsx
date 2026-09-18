import type { ResultadoSugerencia } from "@/hooks/useSugerenciasCompra";
import { suggestionColumns, suggestionCoverage } from "@/lib/suggestionTableOrder";
import type { SalesSort } from "@/components/ventas/salesTableInteraction";
import { SalesSortButton } from "@/components/ventas/SalesTableControls";
import { MarcaBadge } from "@/components/StatusBadges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { tableHeadText } from "@/lib/ui-classes";
import { AlertTriangle } from "lucide-react";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
// Keep useful identifiers and quantities readable on phones. Secondary fields
// stay in the detail/export; never squeeze twelve columns into illegible values.
const widthClasses = [
  "w-[18%] md:w-[6%]", "w-[23%] md:w-[8%]", "hidden md:table-column md:w-[8%]",
  "w-[27%] md:w-[18%]", "hidden md:table-column md:w-[5%]", "hidden md:table-column md:w-[11%]",
  "w-[14%] md:w-[5%]", "hidden md:table-column md:w-[8%]", "hidden md:table-column md:w-[9%]",
  "hidden md:table-column md:w-[8%]", "hidden md:table-column md:w-[7%]", "w-[18%] md:w-[7%]",
];
const phoneColumns = new Set(["marca", "producto_codigo", "descripcion", "stock_global", "sugerencia_unidades"]);

function qualityWarnings(row: ResultadoSugerencia) {
  const warnings: string[] = [];
  if (row.confianza_datos === "BAJA") warnings.push("Confianza baja");
  if (row.tipo_stock_seguridad === "ESTIMADA") warnings.push("Stock de seguridad estimado");
  if (row.estado_datos === "CODIGO_NUEVO_SIN_HISTORIAL") warnings.push("Código nuevo sin historial");
  if (row.estado_datos === "SIN_VENTAS_RECIENTES") warnings.push("Sin ventas en 24 meses");
  if (row.stock_minimo_estrategico > 0) warnings.push(`Mínimo estratégico ${decimal.format(row.stock_minimo_estrategico)}`);
  return warnings;
}

export function PurchaseSuggestionTable({ rows, sort, onSort, onSelect, leadTimeMonths }: {
  rows: ResultadoSugerencia[];
  sort: SalesSort;
  onSort: (key: string) => void;
  onSelect: (row: ResultadoSugerencia) => void;
  leadTimeMonths: number;
}) {
  return <Table className="table-fixed" aria-label="Sugerencia de compra">
    <colgroup>{suggestionColumns.map((column, index) => <col key={column.key} className={widthClasses[index]} />)}</colgroup>
    <TableHeader><TableRow>{suggestionColumns.map(column => <TableHead key={column.key}
      className={cn(tableHeadText, "h-8 whitespace-nowrap px-1 md:px-2", !phoneColumns.has(column.key) && "hidden md:table-cell", column.align === "center" ? "text-center" : "text-left")}
      aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
      <SalesSortButton label={column.label} kind={column.kind} align={column.align} active={sort.key === column.key}
        direction={sort.direction} onClick={() => onSort(column.key)} />
    </TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(row => {
      const coverage = suggestionCoverage(row);
      const warnings = qualityWarnings(row);
      const coverageTone = coverage === null ? "text-muted-foreground" : coverage < leadTimeMonths
        ? "text-destructive" : coverage < leadTimeMonths + 1 ? "text-amber-600" : "text-foreground";
      const values: Record<string, { text: string; title?: string }> = {
        producto_codigo: { text: row.producto_codigo },
        codigo_fabricante: { text: row.codigo_fabricante || "—" },
        descripcion: { text: row.descripcion, title: `${row.descripcion} · Familia: ${row.familia || "No informada"}` },
        clase: { text: `${row.abc}${row.fsn}${row.xyz}`, title: `ABC (participación económica): ${row.abc} · FSN (rotación): ${row.fsn} · XYZ (variabilidad): ${row.xyz}` },
        segmento: { text: row.segmento, title: [row.segmento, ...warnings].join(" · ") },
        stock_global: { text: decimal.format(row.stock_global) },
        demanda_ponderada_mensual: { text: decimal.format(row.demanda_ponderada_mensual), title: "Demanda mensual ponderada del modelo de compra" },
        cobertura: { text: coverage === null ? "—" : decimal.format(coverage), title: "Meses de cobertura: stock / promedio mensual real de los últimos 12 meses; no usa la demanda ponderada" },
        ultima_venta: { text: row.ultima_venta ? new Intl.DateTimeFormat("es-PY").format(new Date(`${row.ultima_venta.slice(0, 10)}T12:00:00`)) : "—",
          title: row.dias_ultima_venta == null ? undefined : `${integer.format(row.dias_ultima_venta)} días desde la última venta al corte del análisis` },
        stock_objetivo: { text: decimal.format(row.stock_objetivo) },
        sugerencia_unidades: { text: integer.format(row.sugerencia_unidades) },
      };
      return <TableRow key={row.producto_codigo} className="cursor-pointer" onClick={() => onSelect(row)}>
        {suggestionColumns.map(column => <TableCell key={column.key}
          className={cn("overflow-hidden whitespace-nowrap px-1 py-2 text-[13px] leading-5 md:px-2",
            !phoneColumns.has(column.key) && "hidden md:table-cell",
            column.align === "center" ? "text-center tabular-nums" : "text-left",
            column.key === "cobertura" && coverageTone)}>
          {column.key === "marca" ? <MarcaBadge marca={row.marca} className="px-1.5 text-[10px]" />
            : <span className="flex min-w-0 items-center gap-1" title={values[column.key].title || values[column.key].text}>
              {column.key === "segmento" && warnings.length > 0 && <AlertTriangle aria-label={warnings.join(" · ")} className="hidden h-3 w-3 shrink-0 text-amber-600 md:block" />}
              {column.key === "descripcion" && warnings.length > 0 && <AlertTriangle aria-label={warnings.join(" · ")} className="h-3 w-3 shrink-0 text-amber-600 md:hidden" />}
              <span className={cn("block min-w-0 flex-1 truncate", column.key === "descripcion" && "font-medium",
                column.key === "sugerencia_unidades" && row.sugerencia_unidades > 0 && "font-semibold text-primary")}>{values[column.key].text}</span>
            </span>}
        </TableCell>)}
      </TableRow>;
    })}{rows.length === 0 && <TableRow><TableCell colSpan={suggestionColumns.length} className="h-32 text-center text-[13px] text-muted-foreground">No hay piezas que coincidan con los filtros.</TableCell></TableRow>}</TableBody>
  </Table>;
}
