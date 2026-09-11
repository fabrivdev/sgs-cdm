/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { subYears } from "date-fns";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/components/dashboard/utils";

type Line = { id: string; factura: string; os: string | null; cliente: string; propietario: string; componente: string; total_venta: number; es_nota_credito?: boolean };
const usd = { format: (value: number) => money(value) };
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function ServiciosClientes({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "" }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string }) {
  const [perspective, setPerspective] = useState<"propietario" | "cliente">("propietario");
  const [current, setCurrent] = useState<Line[]>([]); const [previous, setPrevious] = useState<Line[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  // El período anterior (mismo rango, un año atrás) no es comparable si cae del otro lado
  // del corte legacy/nuevo (01/07/2026) respecto del período actual: son dos formas distintas
  // de clasificar la venta, no una caída o suba real. Mismo criterio que ventas_clientes_comparacion.
  const comparable = useMemo(() => {
    const CORTE = "2026-07-01";
    const previousDesde = iso(subYears(new Date(`${desde}T00:00:00`), 1));
    return hasta < CORTE || previousDesde >= CORTE;
  }, [desde, hasta]);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    const params = (from: string, to: string) => ({ p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_desde: from, p_hasta: to, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo });
    Promise.all([
      (supabase as any).rpc("ventas_servicios_lineas_v2", params(desde, hasta)),
      comparable ? (supabase as any).rpc("ventas_servicios_lineas_v2", params(iso(subYears(new Date(`${desde}T00:00:00`), 1)), iso(subYears(new Date(`${hasta}T00:00:00`), 1)))) : Promise.resolve({ data: [], error: null }),
    ]).then(([nowResult, previousResult]: any[]) => {
      if (!alive) return;
      const rpcError = nowResult.error || previousResult.error;
      if (rpcError) { setError(serviceSalesError(rpcError)); setCurrent([]); setPrevious([]); }
      else { setCurrent(nowResult.data ?? []); setPrevious(previousResult.data ?? []); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo, marca, tipoMaquina, comparable]);

  const rows = useMemo(() => {
    type Summary = { cliente: string; total: number; previous: number; facturas: Set<string>; notas: Set<string>; os: Set<string>; mo: number; km: number; repuestos: number; terceros: number };
    const map = new Map<string, Summary>();
    const get = (name: string) => { const key = name || "Sin cliente"; const value = map.get(key) ?? { cliente: key, total: 0, previous: 0, facturas: new Set<string>(), notas: new Set<string>(), os: new Set<string>(), mo: 0, km: 0, repuestos: 0, terceros: 0 }; map.set(key, value); return value; };
    current.forEach((line) => { const row = get(line[perspective]); row.total += Number(line.total_venta || 0); row.facturas.add(line.factura); if (line.es_nota_credito) row.notas.add(line.factura); if (line.os) row.os.add(line.os); if (line.componente === "Mano de obra") row.mo += Number(line.total_venta || 0); else if (line.componente === "Kilometraje") row.km += Number(line.total_venta || 0); else if (line.componente === "Repuestos") row.repuestos += Number(line.total_venta || 0); else if (line.componente === "Terceros") row.terceros += Number(line.total_venta || 0); });
    previous.forEach((line) => { get(line[perspective]).previous += Number(line.total_venta || 0); });
    const term = buscar.trim().toLowerCase();
    return [...map.values()]
      .filter((row) => row.facturas.size > 0 || row.os.size > 0 || row.total !== 0)
      .filter((row) => !term || row.cliente.toLowerCase().includes(term))
      .sort((a, b) => b.total - a.total);
  }, [buscar, current, previous, perspective]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Comparando clientes…</div>;
  if (error) return <div className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  return <><label className="mt-3 flex items-center gap-3 text-xs">Agrupar por<select aria-label="Agrupar clientes por" value={perspective} onChange={e=>setPerspective(e.target.value as "propietario" | "cliente")} className="rounded-md border bg-background p-2"><option value="propietario">Propietarios actuales</option><option value="cliente">Clientes facturados</option></select></label><div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1080px]">
    <div className="grid grid-cols-[minmax(230px,1fr)_70px_70px_repeat(4,110px)_130px_105px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"><div>{perspective === "propietario" ? "Propietario actual" : "Cliente facturado"}</div><div className="text-right">OS</div><div className="text-right">Fact.</div><div className="text-right">MO</div><div className="text-right">Km</div><div className="text-right">Repuestos</div><div className="text-right">Terceros</div><div className="text-right">Facturación</div><div className="text-right" title={!comparable ? "Período no comparable: el año anterior cae del lado histórico del corte (01/07/2026)." : undefined}>vs. año ant.{!comparable && " *"}</div></div>
    <div className="max-h-[480px] overflow-y-auto">{!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes para el período.</div> : rows.map((row) => { const variation = comparable && row.previous !== 0 ? ((row.total - row.previous) / Math.abs(row.previous)) * 100 : null; return <div key={row.cliente} className="grid grid-cols-[minmax(230px,1fr)_70px_70px_repeat(4,110px)_130px_105px] items-center border-t px-3 py-2 text-[12px]"><div className="truncate font-medium">{row.cliente}</div><div className="text-right tabular-nums">{integer.format(row.os.size)}</div><div className="text-right tabular-nums">{integer.format(row.facturas.size)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.mo)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.km)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.repuestos)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.terceros)}</div><div className="text-right font-semibold tabular-nums">{usd.format(row.total)}</div><div className="text-right tabular-nums">{variation == null ? "—" : `${variation > 0 ? "+" : ""}${Math.round(variation)}%`}</div></div>; })}</div>
  </div></div></>;
}
