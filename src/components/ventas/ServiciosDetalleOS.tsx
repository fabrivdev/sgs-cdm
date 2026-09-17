/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { matchesServiceSalesSearch, type ServiceSalesSearchLine } from "@/lib/serviceSalesSearch";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
// Flexible tracks and wrapping keep all columns within the available width.
// Narrow screens show the same lines as labeled cards, without hidden columns.
const columns = "md:grid-cols-[minmax(0,.65fr)_minmax(0,1.2fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_minmax(0,.85fr)_minmax(0,2fr)_minmax(0,.55fr)_minmax(0,1fr)]";
const cell = "min-w-0 [overflow-wrap:anywhere]";
function MobileLabel({ children }: { children: string }) {
  return <span className="mb-0.5 block text-[10px] font-medium text-muted-foreground md:hidden">{children}</span>;
}

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
        <p className="text-[11px] text-muted-foreground">Una fila por línea facturada. La factura y la OS pueden repetirse.</p>
      </div>
      <TableScroll rows={rows.length} className="min-w-0 max-w-full">
        <div className={`hidden md:grid ${columns} ${scrollHead} gap-x-2 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>
          {["Fecha", "Factura", "Cliente facturado", "OS / chasis", "Tipo de tiempo", "Concepto / descripción", "Cantidad", "Facturado"].map((label, index) =>
            <div key={label} className={`${cell} ${index === 6 ? "text-center" : index === 7 ? "text-right" : "text-left"}`}>{label}</div>)}
        </div>
        {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
          : error ? <div role="alert" className="px-3 py-12 text-center text-[12px] text-destructive">No se pudo cargar el detalle. {error}</div>
          : !rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay líneas facturadas para estos filtros.</div>
          : rows.map(row => <div key={row.id} data-invoice-line={row.id} className={`grid grid-cols-2 ${columns} items-start gap-x-2 gap-y-3 border-t px-3 py-2 text-[12px] hover:bg-muted/30 md:gap-y-0`}>
            <div className={`${cell} text-muted-foreground`}><MobileLabel>Fecha</MobileLabel>{row.fecha ? shortDate.format(new Date(`${row.fecha}T00:00:00`)) : "—"}</div>
            <div className={cell}>
              <MobileLabel>Factura</MobileLabel>
              <div className="font-mono font-semibold">{row.factura || "Sin número"}</div>
              {row.es_nota_credito && <Badge variant="outline" className="mt-1 max-w-full whitespace-normal text-[10px]">Nota de crédito</Badge>}
              <div className="mt-0.5 text-[11px] text-muted-foreground">{row.sucursal || "Sin sucursal"}</div>
            </div>
            <div className={cell}>
              <MobileLabel>Cliente facturado</MobileLabel>
              <div className="font-medium">{row.cliente || "Sin cliente"}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Propietario: {row.propietario || "No informado"}</div>
              {(!row.propietario || row.propietario === "Propietario no informado") && row.propietario_os &&
                <div className="text-[10px] text-muted-foreground">En la OS: {row.propietario_os}</div>}
            </div>
            <div className={cell}>
              <MobileLabel>OS / chasis</MobileLabel>
              <div className="font-mono">{row.os || "Sin OS vinculada"}</div>
              {row.chasis && <button type="button" className="mt-0.5 max-w-full text-left font-mono text-[11px] text-primary [overflow-wrap:anywhere] hover:underline" onClick={() => setDetailTarget({ chassis: row.chasis, os: null })} title="Ver historial de esta máquina">{row.chasis}</button>}
            </div>
            <div className={cell}><MobileLabel>Tipo de tiempo</MobileLabel>{row.tipo_tiempo === "Garantia" ? "Garantía" : row.tipo_tiempo || "No informado"}</div>
            <div className={`${cell} col-span-2 md:col-span-1`}>
              <MobileLabel>Concepto / descripción</MobileLabel>
              <div className="text-[11px] font-medium text-muted-foreground">{row.componente}</div>
              <div>{row.descripcion || "Sin descripción de origen"}</div>
            </div>
            <div className={`${cell} text-center tabular-nums`}><MobileLabel>Cantidad</MobileLabel>{row.cantidad == null ? "—" : decimal.format(Number(row.cantidad))}</div>
            <div className={`${cell} text-right font-semibold tabular-nums`}><MobileLabel>Facturado</MobileLabel>{usd.format(Number(row.total_venta || 0))}</div>
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
