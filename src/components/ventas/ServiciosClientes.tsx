/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/components/dashboard/utils";

type Line = { id: string; factura: string; os: string | null; cliente: string; propietario: string; componente: string; total_venta: number; es_nota_credito?: boolean };
const usd = { format: (value: number) => money(value) };
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

export function ServiciosClientes({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "" }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string }) {
  const [perspective, setPerspective] = useState<"propietario" | "cliente">("propietario");
  const [current, setCurrent] = useState<Line[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    const params = (from: string, to: string) => ({ p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_desde: from, p_hasta: to, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo });
    (supabase as any).rpc("ventas_servicios_lineas_v2", params(desde, hasta)).then((nowResult: any) => {
      if (!alive) return;
      const rpcError = nowResult.error;
      if (rpcError) { setError(serviceSalesError(rpcError)); setCurrent([]); }
      else setCurrent(nowResult.data ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo, marca, tipoMaquina]);

  const rows = useMemo(() => {
    type Summary = { cliente: string; total: number; facturas: Set<string>; notas: Set<string>; os: Set<string>; mo: number; km: number; repuestos: number; terceros: number };
    const map = new Map<string, Summary>();
    const get = (name: string) => { const key = name || "Sin cliente"; const value = map.get(key) ?? { cliente: key, total: 0, facturas: new Set<string>(), notas: new Set<string>(), os: new Set<string>(), mo: 0, km: 0, repuestos: 0, terceros: 0 }; map.set(key, value); return value; };
    current.forEach((line) => { const row = get(line[perspective]); row.total += Number(line.total_venta || 0); row.facturas.add(line.factura); if (line.es_nota_credito) row.notas.add(line.factura); if (line.os) row.os.add(line.os); if (line.componente === "Mano de obra") row.mo += Number(line.total_venta || 0); else if (line.componente === "Kilometraje") row.km += Number(line.total_venta || 0); else if (line.componente === "Repuestos") row.repuestos += Number(line.total_venta || 0); else if (line.componente === "Terceros") row.terceros += Number(line.total_venta || 0); });
    const term = buscar.trim().toLowerCase();
    return [...map.values()]
      .filter((row) => row.facturas.size > 0 || row.os.size > 0 || row.total !== 0)
      .filter((row) => !term || row.cliente.toLowerCase().includes(term))
      .sort((a, b) => Number(/^(?:sin|no) (?:cliente|identificar|identificado|informar|informado)/i.test(a.cliente)) - Number(/^(?:sin|no) (?:cliente|identificar|identificado|informar|informado)/i.test(b.cliente)) || b.total - a.total);
  }, [buscar, current, perspective]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Comparando clientes…</div>;
  if (error) return <div className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  const totalPeriodo = rows.reduce((sum, row) => sum + row.total, 0);
  const grid = "grid-cols-[minmax(220px,1fr)_60px_70px_70px_repeat(4,minmax(88px,1fr))_110px_95px]";
  return <><label className="mt-3 flex items-center gap-2 text-[11px]">Agrupar por<select aria-label="Agrupar clientes por" value={perspective} onChange={e=>setPerspective(e.target.value as "propietario" | "cliente")} className="h-8 rounded-md border bg-background px-2 text-[11px]"><option value="propietario">Propietarios actuales</option><option value="cliente">Clientes facturados</option></select></label><div className="mt-2 overflow-x-auto rounded-md border"><div className="min-w-[1100px]">
    <div className={`grid ${grid} items-center bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>{perspective === "propietario" ? "Cliente" : "Cliente facturado"}</div><div className="text-right">OS</div><div className="text-right">Facturas</div><div className="text-right">Nota Cr.</div><div className="text-right">MO</div><div className="text-right">Km</div><div className="text-right">Repuestos</div><div className="text-right">Terceros</div><div className="text-right">Neto</div><div className="text-right">Participación</div></div>
    <div className="max-h-[480px] overflow-y-auto">{!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes para el período.</div> : rows.map((row) => <div key={row.cliente} className={`grid ${grid} items-center border-t px-3 py-1.5 text-[12px]`}><div className="truncate font-medium">{row.cliente}</div><div className="text-right tabular-nums">{integer.format(row.os.size)}</div><div className="text-right tabular-nums">{integer.format(row.facturas.size)}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(row.notas.size)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.mo)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.km)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.repuestos)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.terceros)}</div><div className="text-right font-semibold tabular-nums">{usd.format(row.total)}</div><div className="text-right tabular-nums text-muted-foreground">{totalPeriodo ? `${Math.round((row.total / totalPeriodo) * 100)}%` : "—"}</div></div>)}</div>
  </div></div></>;
}
