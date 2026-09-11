/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { money } from "@/components/dashboard/utils";
import { MachineHistorySheet } from "@/components/ventas/MachineHistorySheet";

type FilaOS = {
  id: string; fecha: string; os: string; os_numero: string | null; chasis: string | null;
  cliente: string; propietario?: string; sucursal: string | null; tipo_tiempo: string; facturas: number;
  mo: number; km: number; repuestos: number; terceros: number; total: number;
};
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function ServiciosDetalleOS({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "" }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string }) {
  const [rows, setRows] = useState<FilaOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ chassis: string | null; os: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    (supabase as any).rpc("ventas_servicios_detalle_os_v2", {
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
    }).then(({ data, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(serviceSalesError(rpcError)); setRows([]); }
      else setRows((data as FilaOS[]) ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, buscar, tipoTiempo, marca, tipoMaquina]);

  const total = useMemo(() => rows.reduce((acc, row) => acc + Number(row.total || 0), 0), [rows]);
  const columns = "grid-cols-[72px_115px_110px_minmax(180px,1fr)_90px_100px_40px_85px_75px_85px_75px_95px]";

  return <>
    <div className="mt-3 overflow-hidden rounded-md border">
      <div className="overflow-x-auto"><div className="min-w-[1380px]">
        <div className={`grid ${columns} gap-x-3 bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
          <div>Fecha</div><div>OS</div><div>Chasis</div><div>Propietario actual</div><div>Sucursal</div><div>Tipos facturados</div><div className="text-right">Fact.</div>{["MO","Km","Repuestos","Terceros"].map(label=><div key={label} className="text-right">{label}</div>)}<div className="text-right">Facturado</div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
            : error ? <div role="alert" className="px-3 py-12 text-center text-[12px] text-destructive">No se pudo cargar el detalle. {error}</div>
            : !rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay OS con facturación en el período.</div>
            : rows.map((row) => <div key={row.id} className={`grid ${columns} items-center gap-x-3 border-t px-3 py-2 text-[12px] hover:bg-muted/30`}>
              <div className="whitespace-nowrap text-muted-foreground">{row.fecha ? shortDate.format(new Date(`${row.fecha}T00:00:00`)) : "—"}</div>
              <div className="truncate font-mono font-semibold">{row.os}</div>
              <div>{row.chasis ? <button type="button" className="max-w-full truncate font-mono text-primary hover:underline" onClick={(event) => { event.stopPropagation(); setDetailTarget({ chassis: row.chasis, os: null }); }} title="Ver historial de esta máquina">{row.chasis}</button> : "—"}</div>
              <div className="font-medium break-words">{row.propietario || 'Propietario no disponible'}</div>
              <div className="truncate text-muted-foreground">{row.sucursal || "Sin sucursal"}</div>
              <div className="flex flex-wrap gap-1">{row.tipo_tiempo.split(' / ').map(type => <Badge key={type} variant="outline" className="text-[10px]">{type === 'Garantia' ? 'Garantía' : type}</Badge>)}</div>
              <div className="text-right tabular-nums">{row.facturas}</div>
              {[row.mo,row.km,row.repuestos,row.terceros].map((value,i)=><div key={i} className="text-right tabular-nums">{money(value)}</div>)}
              <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
            </div>)}
        </div>
      </div></div>
      {!error && !loading && rows.length > 0 && <div className="border-t px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">Total facturado en el período: <span className="text-foreground">{money(total)}</span></div>}
    </div>
    <MachineHistorySheet target={detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }} />
  </>;
}
