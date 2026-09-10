/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { money } from "@/components/dashboard/utils";

type FilaOS = {
  id: string; fecha: string; os: string; os_numero: string | null; chasis: string | null;
  cliente: string; sucursal: string | null; tipo_tiempo: string; facturas: number;
  horas: number; km_cantidad: number; mo: number; km: number; repuestos: number;
  terceros_os: number; total: number;
};
type HistoryRow = {
  os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null;
  fecha_emision_factura: string | null; factura: string | null; tipo_tiempo: string | null;
  problema: string | null; servicios_cantidad: number | null; servicios_valor: number | null;
  km_cantidad: number | null; kilometro_valor: number | null; repuesto_valor: number | null;
  terceros_valor: number | null; situacion_os: string | null;
};

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });

function MachineHistory({ chassis, open, onOpenChange }: { chassis: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !chassis) return;
    let alive = true;
    setLoading(true);
    (supabase.from("ordenes_servicio_importadas" as any) as any)
      .select("os_numero,fecha_abierta_os,fecha_cierre_os,fecha_emision_factura,factura,tipo_tiempo,problema,servicios_cantidad,servicios_valor,km_cantidad,kilometro_valor,repuesto_valor,terceros_valor,situacion_os")
      .ilike("nro_chasis", chassis)
      .order("fecha_abierta_os", { ascending: false })
      .then(({ data }: { data: HistoryRow[] | null }) => {
        if (alive) { setRows(data ?? []); setLoading(false); }
      });
    return () => { alive = false; };
  }, [chassis, open]);

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader><SheetTitle>Historial de la máquina</SheetTitle><SheetDescription>Chasis {chassis}</SheetDescription></SheetHeader>
      <div className="mt-5 space-y-2">
        {loading ? <p className="py-10 text-center text-[12px] text-muted-foreground">Cargando historial…</p>
          : !rows.length ? <p className="py-10 text-center text-[12px] text-muted-foreground">No se encontraron órdenes de servicio para este chasis.</p>
          : rows.map((row) => {
            const total = Number(row.servicios_valor || 0) + Number(row.kilometro_valor || 0) + Number(row.repuesto_valor || 0) + Number(row.terceros_valor || 0);
            const rowDate = row.fecha_cierre_os || row.fecha_emision_factura || row.fecha_abierta_os;
            return <div key={row.os_numero} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-mono text-[12px] font-semibold">OS {row.os_numero}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{rowDate ? dateFormatter.format(new Date(rowDate)) : "Fecha no informada"} · {row.factura ? `Factura ${row.factura}` : "Sin factura"}</div></div>
                <div className="flex gap-1"><Badge variant="outline">{row.tipo_tiempo || "No informado"}</Badge><Badge variant="secondary">{row.situacion_os || "Sin estado"}</Badge></div>
              </div>
              {row.problema && <p className="mt-2 text-[12px]">{row.problema}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-2 text-[11px] sm:grid-cols-4">
                <div><span className="text-muted-foreground">Horas</span><div className="font-medium">{decimal.format(Number(row.servicios_cantidad || 0))}</div></div>
                <div><span className="text-muted-foreground">Km</span><div className="font-medium">{decimal.format(Number(row.km_cantidad || 0))}</div></div>
                <div><span className="text-muted-foreground">Valor OS</span><div className="font-medium">{money(total)}</div></div>
                <div><span className="text-muted-foreground">Terceros</span><div className="font-medium">{money(Number(row.terceros_valor || 0))}</div></div>
              </div>
            </div>;
          })}
      </div>
    </SheetContent>
  </Sheet>;
}

export function ServiciosDetalleOS({ desde, hasta, sucursal, buscar, tipoTiempo }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string }) {
  const [rows, setRows] = useState<FilaOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyChassis, setHistoryChassis] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    (supabase as any).rpc("ventas_servicios_detalle_os", {
      p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
    }).then(({ data, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(rpcError.message ?? "No se pudo cargar el detalle por OS."); setRows([]); }
      else setRows((data as FilaOS[]) ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, buscar, tipoTiempo]);

  const total = useMemo(() => rows.reduce((acc, row) => acc + Number(row.total || 0), 0), [rows]);
  const columns = "grid-cols-[125px_110px_minmax(190px,1fr)_95px_55px_60px_repeat(4,100px)_125px]";

  return <>
    <div className="mt-3 overflow-hidden rounded-md border">
      <div className="overflow-x-auto"><div className="min-w-[1250px]">
        <div className={`grid ${columns} gap-x-3 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
          <div>OS</div><div>Chasis</div><div>Cliente / sucursal</div><div>Tipo</div><div className="text-right">Fact.</div><div className="text-right">Horas</div><div className="text-right">Mano de obra</div><div className="text-right">Km</div><div className="text-right">Repuestos</div><div className="text-right">Terceros</div><div className="text-right">Facturado</div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
            : !rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay OS con facturación en el período.</div>
            : rows.map((row) => <div key={row.id} className={`grid ${columns} items-center gap-x-3 border-t px-3 py-2 text-[12px]`}>
              <div className="truncate font-mono font-semibold">{row.os}</div>
              <div>{row.chasis ? <button type="button" className="flex max-w-full items-center gap-1 truncate font-mono text-primary hover:underline" onClick={() => setHistoryChassis(row.chasis)} title="Ver historial de esta máquina"><span className="truncate">{row.chasis}</span><ExternalLink className="h-3 w-3 shrink-0" /></button> : "—"}</div>
              <div className="min-w-0"><div className="truncate font-medium">{row.cliente}</div><div className="truncate text-[10px] text-muted-foreground">{row.sucursal || "Sin sucursal"}</div></div><div><Badge variant="outline" className="text-[10px]">{row.tipo_tiempo}</Badge></div><div className="text-right tabular-nums">{row.facturas}</div><div className="text-right tabular-nums">{decimal.format(row.horas)}</div>
              <div className="text-right tabular-nums">{money(row.mo)}</div><div className="text-right tabular-nums"><div>{money(row.km)}</div>{row.km_cantidad > 0 && <div className="text-[10px] text-muted-foreground">{decimal.format(row.km_cantidad)} km</div>}</div><div className="text-right tabular-nums">{money(row.repuestos)}</div><div className="text-right tabular-nums">{money(row.terceros_os)}</div>
              <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
            </div>)}
        </div>
      </div></div>
      {error && <div className="border-t px-3 py-2 text-[11px] text-destructive">{error}</div>}
      {!error && !loading && rows.length > 0 && <div className="border-t px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">Total del período: <span className="text-foreground">{money(total)}</span></div>}
    </div>
    <MachineHistory chassis={historyChassis} open={Boolean(historyChassis)} onOpenChange={(open) => { if (!open) setHistoryChassis(null); }} />
  </>;
}
