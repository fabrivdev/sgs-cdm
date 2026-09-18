/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { matchesServiceSalesSearch, type ServiceSalesSearchLine } from "@/lib/serviceSalesSearch";
import { supabase } from "@/integrations/supabase/client";
import { MachineHistorySheet } from "@/components/ventas/MachineHistorySheet";
import { TableScroll, scrollHead, salesHeader } from "./TableScroll";
import { useSalesSectionExport } from "./SalesSectionExports";
import { useAuth } from "@/hooks/useAuth";
import { SalesSortButton } from "./SalesTableControls";
import { useSalesTableSort, type SalesColumn } from "./salesTableInteraction";
import type { IndicadoresFiltros } from "./useServiciosIndicadores";
import { serviceFiltersKey, serviceFilteredRequest } from "./serviceSalesFilters";

type InvoiceLine = ServiceSalesSearchLine & {
  id: string; fecha: string; factura: string; os: string | null; chasis: string | null;
  cliente: string; propietario?: string; propietario_os?: string;
  sucursal: string | null; tipo_tiempo: string; componente: string;
  descripcion: string | null; cantidad: number | null; total_venta: number;
  cantidad_os?: number | null;
  codigo?: string | null;
  es_nota_credito?: boolean;
};
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 });
const moneyAmount = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = { format: (value: number) => `$ ${moneyAmount.format(value)}` };
// One visual line per financial line: no stacked metadata, wrapping or forced
// minimum width. Native titles preserve full values when a column truncates.
const columns = "grid-cols-[minmax(0,.65fr)_minmax(0,1.15fr)_minmax(0,.6fr)_minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,.65fr)_minmax(0,.75fr)_minmax(0,1.75fr)_minmax(0,.45fr)_minmax(0,1fr)]";
const cell = "min-w-0 truncate";
const quantityValue = (row: InvoiceLine) => row.componente === "Mano de obra" || row.componente === "Kilometraje" ? row.cantidad_os : row.cantidad;
const owner = (row: InvoiceLine) => row.propietario && row.propietario !== "Propietario no informado" ? row.propietario : null;
const time = (row: InvoiceLine) => row.tipo_tiempo === "Garantia" ? "Garantía" : row.tipo_tiempo || null;
const detailColumns: readonly SalesColumn<InvoiceLine>[] = [
  {key:"fecha",label:"Fecha",kind:"date",value:row=>row.fecha},
  {key:"factura",label:"Factura",kind:"text",value:row=>row.factura === "Sin numero" ? null : row.factura,exportValue:row=>`${row.es_nota_credito ? "NC " : ""}${row.factura || "Sin número"}`},
  {key:"sucursal",label:"Sucursal",kind:"text",value:row=>row.sucursal === "Sin sucursal" ? null : row.sucursal},
  {key:"cliente",label:"Cliente facturado",kind:"text",value:row=>row.cliente === "Sin cliente" ? null : row.cliente},
  {key:"propietario",label:"Propietario",kind:"text",value:owner,exportValue:row=>owner(row) || "No informado"},
  {key:"os",label:"OS",kind:"text",value:row=>row.os},
  {key:"chasis",label:"Chasis",kind:"text",value:row=>row.chasis},
  {key:"tiempo",label:"Tiempo",kind:"text",value:row=>row.tipo_tiempo === "No informado" ? null : time(row),exportValue:row=>time(row) || "No informado"},
  {key:"codigo",label:"Código",kind:"text",value:row=>row.codigo},
  {key:"descripcion",label:"Descripción",kind:"text",value:row=>row.descripcion},
  {key:"cantidad",label:"Cant.",kind:"number",value:quantityValue,align:"center"},
  {key:"facturado",label:"Facturado",kind:"number",value:row=>Number(row.total_venta || 0),align:"right",excelFormat:'"$" #,##0.00;"$" -#,##0.00'},
];
function quantity(row: InvoiceLine): { label: string; title: string } {
  const operational = row.componente === "Mano de obra" || row.componente === "Kilometraje";
  const value = quantityValue(row);
  const source = row.componente === "Mano de obra" ? "Horas de la OS" : row.componente === "Kilometraje" ? "Kilómetros de la OS" : "Cantidad facturada";
  if (value == null) return { label: "—", title: `${source}: no informada${operational && row.cantidad_os === undefined ? " (requiere SQL de cantidad operacional)" : ""}` };
  const label = decimal.format(Number(value));
  return { label, title: `${source}: ${label}` };
}

// Keep the name for existing callers, but represent financial lines, not OS
// aggregates. Same population and normalized search as the Clients tab.
export function ServiciosDetalleOS({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros }: IndicadoresFiltros) {
  const filterKey = serviceFiltersKey(filtros);
  const { can } = useAuth();
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ chassis: string | null; os: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) {
      setLines([]); setError("Seleccioná un rango de fechas válido."); setLoading(false);
      return;
    }
    setLines([]); setLoading(true); setError(null);
    void (async () => {
      try {
        const request = serviceFilteredRequest("ventas_servicios_lineas_v2", filterKey);
        const { data, error: rpcError } = await (supabase as any).rpc(request.name, {
          ...request.params,
          p_marca: marca || null, p_tipo_maquina: tipoMaquina || null,
          p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
          p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
        });
        if (!alive) return;
        if (rpcError) { setError(serviceSalesError(rpcError, filterKey)); return; }
        if (data != null && !Array.isArray(data)) throw new Error("Respuesta de facturación inválida.");
        setLines(data ?? []);
      } catch (failure) {
        if (alive) setError(serviceSalesError(failure instanceof Error ? failure : { message: "No se pudo consultar la facturación." }, filterKey));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo, marca, tipoMaquina, filterKey]);

  const filtered = useMemo(() => lines.filter(line => matchesServiceSalesSearch(line, buscar)), [lines, buscar]);
  const { ordered: rows, sort, toggleSort } = useSalesTableSort(filtered, detailColumns, { key:"fecha", direction:"desc" });
  const documents = useMemo(() => new Set(rows.map(row => JSON.stringify([
    row.factura, row.fecha, row.cliente, row.sucursal, Boolean(row.es_nota_credito),
    !row.factura || row.factura === "Sin numero" ? row.id : null,
  ]))).size, [rows]);

  useSalesSectionExport({ id: "services-detail", label: "Exportar Detalle de facturación", disabled: loading || Boolean(error) || !rows.length, onSelect: async () => {
    const snapshot = rows;
    const { exportSalesTable } = await import("./salesTableExport");
    exportSalesTable({rows:snapshot,columns:detailColumns,sheetName:"Detalle Servicios",fileName:`ventas-servicios-detalle-${desde}-${hasta}.xlsx`});
  } }, can("datos:exportar"));

  return <>
    <section aria-label="Detalle de facturación de Servicios" className="mt-3 min-w-0 max-w-full rounded-md border">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="truncate text-[12px] font-semibold">Detalle de facturación</h3>
      </div>
      <div role="table" aria-label="Líneas facturadas de Servicios" aria-colcount={detailColumns.length}>
      <TableScroll rows={rows.length} className="min-w-0 max-w-full">
        <div role="row" className={`grid ${columns} ${scrollHead} gap-x-2 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>
          {detailColumns.map(column => <div role="columnheader" key={column.key} aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className={cell}>
            <SalesSortButton label={column.label} kind={column.kind} align={column.align} active={sort.key === column.key} direction={sort.direction} onClick={()=>toggleSort(column.key)} />
          </div>)}
        </div>
        {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
          : error ? <div role="alert" className="px-3 py-12 text-center text-[12px] text-destructive">No se pudo cargar el detalle. {error}</div>
          : !rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay líneas facturadas para estos filtros.</div>
          : rows.map(row => <div role="row" key={row.id} data-invoice-line={row.id} className={`grid ${columns} h-9 items-center gap-x-2 border-t px-3 text-[12px] hover:bg-muted/30`}>
            <div role="cell" className={`${cell} text-muted-foreground`} title={row.fecha}>{row.fecha ? shortDate.format(new Date(`${row.fecha}T00:00:00`)) : "—"}</div>
            <div role="cell" className={`${cell} font-mono font-semibold`} title={`${row.es_nota_credito ? "Nota de crédito: " : ""}${row.factura || "Sin número"}`}>{row.es_nota_credito ? "NC " : ""}{row.factura || "Sin número"}</div>
            <div role="cell" className={`${cell} text-muted-foreground`} title={row.sucursal || "Sin sucursal"}>{row.sucursal || "—"}</div>
            <div role="cell" className={`${cell} font-medium`} title={row.cliente || "Sin cliente"}>{row.cliente || "—"}</div>
            <div role="cell" className={cell} title={`Propietario actual: ${row.propietario || "No informado"}${row.propietario_os ? ` · En la OS: ${row.propietario_os}` : ""}`}>{row.propietario && row.propietario !== "Propietario no informado" ? row.propietario : "No informado"}</div>
            <div role="cell" className={`${cell} font-mono`} title={row.os || "Sin OS vinculada"}>{row.os || "Sin OS vinculada"}</div>
            <div role="cell" className={cell}>{row.chasis ? <button type="button" className="block w-full truncate text-left font-mono text-[11px] text-primary hover:underline" onClick={() => setDetailTarget({ chassis: row.chasis, os: null })} title={`${row.chasis} · Ver historial de esta máquina`}>{row.chasis}</button> : "—"}</div>
            <div role="cell" className={cell} title={row.tipo_tiempo || "No informado"}>{row.tipo_tiempo === "Garantia" ? "Garantía" : row.tipo_tiempo || "No informado"}</div>
            <div role="cell" className={`${cell} font-mono text-[11px]`} title={`${row.codigo?.trim() || "Código no informado"} · ${row.componente}`}>{row.codigo?.trim() || "—"}</div>
            <div role="cell" className={cell} title={row.descripcion || "Sin descripción de origen"}>{row.descripcion || "—"}</div>
            <div role="cell" className={`${cell} text-center tabular-nums`} title={quantity(row).title}>{quantity(row).label}</div>
            <div role="cell" className={`${cell} text-right font-semibold tabular-nums`} title={usd.format(Number(row.total_venta || 0))}>{usd.format(Number(row.total_venta || 0))}</div>
          </div>)}
      </TableScroll>
      </div>
      {!error && !loading && rows.length > 0 && <div className="flex h-7 items-center justify-end border-t px-3 text-[11px] text-muted-foreground">
        <span>{rows.length.toLocaleString("es-PY")} líneas · {documents.toLocaleString("es-PY")} documentos</span>
      </div>}
    </section>
    {detailTarget && <MachineHistorySheet target={detailTarget} onOpenChange={open => { if (!open) setDetailTarget(null); }} />}
  </>;
}
