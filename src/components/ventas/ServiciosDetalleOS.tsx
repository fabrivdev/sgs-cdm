/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { matchesServiceSalesSearch, type ServiceSalesSearchLine } from "@/lib/serviceSalesSearch";
import { supabase } from "@/integrations/supabase/client";
import { MachineHistorySheet } from "@/components/ventas/MachineHistorySheet";
import { TableScroll, scrollHead, salesHeader } from "./TableScroll";

type InvoiceLine = ServiceSalesSearchLine & {
  id: string; fecha: string; factura: string; os: string | null; chasis: string | null;
  cliente: string; propietario?: string; propietario_os?: string;
  sucursal: string | null; tipo_tiempo: string; componente: string;
  descripcion: string | null; cantidad: number | null; total_venta: number;
  es_nota_credito?: boolean;
};
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// One visual line per financial line: no stacked metadata, wrapping or forced
// minimum width. Native titles preserve full values when a column truncates.
const columns = "grid-cols-[minmax(0,.65fr)_minmax(0,1.15fr)_minmax(0,.6fr)_minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,.65fr)_minmax(0,.75fr)_minmax(0,1.75fr)_minmax(0,.45fr)_minmax(0,1fr)]";
const cell = "min-w-0 truncate";

// Keep the name for existing callers, but represent financial lines, not OS
// aggregates. Same population and normalized search as the Clients tab.
export function ServiciosDetalleOS({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "" }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string }) {
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
        const { data, error: rpcError } = await (supabase as any).rpc("ventas_servicios_lineas_v2", {
          p_marca: marca || null, p_tipo_maquina: tipoMaquina || null,
          p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
          p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
        });
        if (!alive) return;
        if (rpcError) { setError(serviceSalesError(rpcError)); return; }
        if (data != null && !Array.isArray(data)) throw new Error("Respuesta de facturación inválida.");
        setLines(data ?? []);
      } catch (failure) {
        if (alive) setError(serviceSalesError(failure instanceof Error ? failure : { message: "No se pudo consultar la facturación." }));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo, marca, tipoMaquina]);

  const rows = useMemo(() => lines.filter(line => matchesServiceSalesSearch(line, buscar)), [lines, buscar]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.total_venta || 0), 0), [rows]);
  const documents = useMemo(() => new Set(rows.map(row => JSON.stringify([
    row.factura, row.fecha, row.cliente, row.sucursal, Boolean(row.es_nota_credito),
    !row.factura || row.factura === "Sin numero" ? row.id : null,
  ]))).size, [rows]);

  return <>
    <section aria-label="Detalle de facturación de Servicios" className="mt-3 min-w-0 max-w-full rounded-md border">
      <div className="border-b px-3 py-2">
        <h3 className="text-[12px] font-semibold">Detalle de facturación</h3>
      </div>
      <TableScroll rows={rows.length} className="min-w-0 max-w-full">
        <div className={`grid ${columns} ${scrollHead} gap-x-2 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>
          {["Fecha", "Factura", "Sucursal", "Cliente facturado", "Propietario", "OS", "Chasis", "Tipo de tiempo", "Concepto", "Descripción", "Cant.", "Facturado"].map((label, index) =>
            <div key={label} title={label} className={`${cell} ${index === 10 ? "text-center" : index === 11 ? "text-right" : "text-left"}`}>{label}</div>)}
        </div>
        {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
          : error ? <div role="alert" className="px-3 py-12 text-center text-[12px] text-destructive">No se pudo cargar el detalle. {error}</div>
          : !rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay líneas facturadas para estos filtros.</div>
          : rows.map(row => <div key={row.id} data-invoice-line={row.id} className={`grid ${columns} h-9 items-center gap-x-2 border-t px-3 text-[12px] hover:bg-muted/30`}>
            <div className={`${cell} text-muted-foreground`} title={row.fecha}>{row.fecha ? shortDate.format(new Date(`${row.fecha}T00:00:00`)) : "—"}</div>
            <div className={`${cell} font-mono font-semibold`} title={`${row.es_nota_credito ? "Nota de crédito: " : ""}${row.factura || "Sin número"}`}>{row.es_nota_credito ? "NC " : ""}{row.factura || "Sin número"}</div>
            <div className={`${cell} text-muted-foreground`} title={row.sucursal || "Sin sucursal"}>{row.sucursal || "—"}</div>
            <div className={`${cell} font-medium`} title={row.cliente || "Sin cliente"}>{row.cliente || "—"}</div>
            <div className={cell} title={`Propietario actual: ${row.propietario || "No informado"}${row.propietario_os ? ` · En la OS: ${row.propietario_os}` : ""}`}>{row.propietario && row.propietario !== "Propietario no informado" ? row.propietario : "No informado"}</div>
            <div className={`${cell} font-mono`} title={row.os || "Sin OS vinculada"}>{row.os || "Sin OS vinculada"}</div>
            <div className={cell}>{row.chasis ? <button type="button" className="block w-full truncate text-left font-mono text-[11px] text-primary hover:underline" onClick={() => setDetailTarget({ chassis: row.chasis, os: null })} title={`${row.chasis} · Ver historial de esta máquina`}>{row.chasis}</button> : "—"}</div>
            <div className={cell} title={row.tipo_tiempo || "No informado"}>{row.tipo_tiempo === "Garantia" ? "Garantía" : row.tipo_tiempo || "No informado"}</div>
            <div className={cell} title={row.componente}>{row.componente}</div>
            <div className={cell} title={row.descripcion || "Sin descripción de origen"}>{row.descripcion || "—"}</div>
            <div className={`${cell} text-center tabular-nums`} title={row.cantidad == null ? "Cantidad no informada" : decimal.format(Number(row.cantidad))}>{row.cantidad == null ? "—" : decimal.format(Number(row.cantidad))}</div>
            <div className={`${cell} text-right font-semibold tabular-nums`} title={usd.format(Number(row.total_venta || 0))}>{usd.format(Number(row.total_venta || 0))}</div>
          </div>)}
      </TableScroll>
      {!error && !loading && rows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>{rows.length.toLocaleString("es-PY")} líneas · {documents.toLocaleString("es-PY")} documentos</span>
        <span>Total facturado en el período: <span className="font-semibold text-foreground">{usd.format(total)}</span></span>
      </div>}
    </section>
    {detailTarget && <MachineHistorySheet target={detailTarget} onOpenChange={open => { if (!open) setDetailTarget(null); }} />}
  </>;
}
