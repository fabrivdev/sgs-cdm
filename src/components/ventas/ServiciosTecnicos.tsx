/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { money } from "@/components/dashboard/utils";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { displayImportedTechnicianName, matchTechnicianProfile, type TechnicianProfileReference } from "@/lib/technicianMatching";
import type { IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";

type Fila = {
  tecnico_clave: string; tecnico: string;
  horas_cliente: number; horas_garantia: number; horas_interno: number; horas_otros: number; total_horas: number;
  mo_cliente: number; mo_garantia: number; mo_interno: number; mo_otros: number; mo_total: number;
};

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const COLUMNS = "grid-cols-[minmax(200px,1.4fr)_repeat(4,72px)_repeat(4,minmax(96px,1fr))_minmax(104px,1fr)]";

export function ServiciosTecnicos({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "" }: IndicadoresFiltros) {
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: tecnicos } = useServicioTecnicos();

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    (supabase as any).rpc("ventas_servicios_tecnicos_v1", {
      p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_buscar: buscar.trim() || null,
    }).then(({ data, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(serviceSalesError(rpcError)); setRows([]); }
      else setRows((data as Fila[]) ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, buscar, tipoTiempo, marca, tipoMaquina]);

  // Mismo criterio de nombres que el historial de la máquina: un técnico, un nombre.
  const unified = useMemo(() => {
    const profiles = (tecnicos ?? []) as TechnicianProfileReference[];
    const map = new Map<string, Fila>();
    rows.forEach((row) => {
      const nombre = matchTechnicianProfile(row.tecnico, profiles)?.nombre ?? displayImportedTechnicianName(row.tecnico);
      const current = map.get(nombre);
      if (!current) { map.set(nombre, { ...row, tecnico: nombre }); return; }
      map.set(nombre, {
        ...current,
        horas_cliente: current.horas_cliente + row.horas_cliente,
        horas_garantia: current.horas_garantia + row.horas_garantia,
        horas_interno: current.horas_interno + row.horas_interno,
        horas_otros: current.horas_otros + row.horas_otros,
        total_horas: current.total_horas + row.total_horas,
        mo_cliente: current.mo_cliente + row.mo_cliente,
        mo_garantia: current.mo_garantia + row.mo_garantia,
        mo_interno: current.mo_interno + row.mo_interno,
        mo_otros: current.mo_otros + row.mo_otros,
        mo_total: current.mo_total + row.mo_total,
      });
    });
    return [...map.values()].sort((a, b) => b.total_horas - a.total_horas || a.tecnico.localeCompare(b.tecnico, "es"));
  }, [rows, tecnicos]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando técnicos…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;

  return (
    <div className="mt-3 space-y-2">
      
      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[1080px]">
          <div className={`grid ${COLUMNS} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
            <div>Técnico</div>
            {["Hs cliente", "Hs garantía", "Hs interno", "Total hs"].map((label) => <div key={label} className="text-right">{label}</div>)}
            {["MO cliente", "MO garantía", "MO interno", "MO total"].map((label) => <div key={label} className="text-right" title="Mano de obra de cada OS repartida en partes iguales entre los técnicos que participaron. Es una atribución, no facturación propia del técnico.">{label}</div>)}
            <div className="text-right">Part. horas</div>
          </div>
          {!unified.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay jornadas cargadas para las OS del período.</div>
            : unified.map((row) => {
              const totalHoras = unified.reduce((sum, item) => sum + item.total_horas, 0);
              return (
                <div key={row.tecnico} className={`grid ${COLUMNS} items-center border-t px-3 py-2 text-[12px]`}>
                  <div className="truncate font-medium" title={row.tecnico}>{row.tecnico}</div>
                  {[row.horas_cliente, row.horas_garantia, row.horas_interno].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{decimal.format(value)}</div>)}
                  <div className="text-right font-semibold tabular-nums">{decimal.format(row.total_horas)}</div>
                  {[row.mo_cliente, row.mo_garantia, row.mo_interno].map((value, index) => <div key={index} className="text-right tabular-nums text-muted-foreground">{money(value)}</div>)}
                  <div className="text-right font-semibold tabular-nums">{money(row.mo_total)}</div>
                  <div className="text-right tabular-nums text-muted-foreground">{totalHoras ? `${Math.round((row.total_horas / totalHoras) * 100)}%` : "—"}</div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
