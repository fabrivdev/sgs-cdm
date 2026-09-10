/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { subYears } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type Line = { id: string; factura: string; os: string | null; cliente: string; componente: string; total_venta: number };
const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function ServiciosClientes({ desde, hasta, sucursal, buscar, tipoTiempo }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string }) {
  const [current, setCurrent] = useState<Line[]>([]); const [previous, setPrevious] = useState<Line[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    const params = (from: string, to: string) => ({ p_desde: from, p_hasta: to, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo });
    Promise.all([
      (supabase as any).rpc("ventas_servicios_lineas", params(desde, hasta)),
      (supabase as any).rpc("ventas_servicios_lineas", params(iso(subYears(new Date(`${desde}T00:00:00`), 1)), iso(subYears(new Date(`${hasta}T00:00:00`), 1)))),
    ]).then(([nowResult, previousResult]: any[]) => {
      if (!alive) return;
      const rpcError = nowResult.error || previousResult.error;
      if (rpcError) { setError(rpcError.message ?? "No se pudo comparar clientes."); setCurrent([]); setPrevious([]); }
      else { setCurrent(nowResult.data ?? []); setPrevious(previousResult.data ?? []); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo]);

  const rows = useMemo(() => {
    type Summary = { cliente: string; total: number; previous: number; facturas: Set<string>; os: Set<string>; mo: number; km: number; repuestos: number };
    const map = new Map<string, Summary>();
    const get = (name: string) => { const key = name || "Sin cliente"; const value = map.get(key) ?? { cliente: key, total: 0, previous: 0, facturas: new Set<string>(), os: new Set<string>(), mo: 0, km: 0, repuestos: 0 }; map.set(key, value); return value; };
    current.forEach((line) => { const row = get(line.cliente); row.total += Number(line.total_venta || 0); row.facturas.add(line.factura); if (line.os) row.os.add(line.os); if (line.componente === "Servicio") row.mo += Number(line.total_venta || 0); else if (line.componente === "Kilometraje") row.km += Number(line.total_venta || 0); else if (line.componente === "Repuestos") row.repuestos += Number(line.total_venta || 0); });
    previous.forEach((line) => { get(line.cliente).previous += Number(line.total_venta || 0); });
    const term = buscar.trim().toLowerCase();
    return [...map.values()].filter((row) => !term || row.cliente.toLowerCase().includes(term)).sort((a, b) => b.total - a.total);
  }, [buscar, current, previous]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Comparando clientes…</div>;
  if (error) return <div className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  return <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[980px]">
    <div className="grid grid-cols-[minmax(230px,1fr)_70px_70px_repeat(3,115px)_130px_105px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"><div>Cliente</div><div className="text-right">OS</div><div className="text-right">Fact.</div><div className="text-right">MO</div><div className="text-right">Km</div><div className="text-right">Repuestos</div><div className="text-right">Facturación</div><div className="text-right">vs. año ant.</div></div>
    <div className="max-h-[480px] overflow-y-auto">{!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes para el período.</div> : rows.map((row) => { const variation = row.previous !== 0 ? ((row.total - row.previous) / Math.abs(row.previous)) * 100 : null; return <div key={row.cliente} className="grid grid-cols-[minmax(230px,1fr)_70px_70px_repeat(3,115px)_130px_105px] items-center border-t px-3 py-2 text-[12px]"><div className="truncate font-medium">{row.cliente}</div><div className="text-right tabular-nums">{integer.format(row.os.size)}</div><div className="text-right tabular-nums">{integer.format(row.facturas.size)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.mo)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.km)}</div><div className="text-right tabular-nums text-muted-foreground">{usd.format(row.repuestos)}</div><div className="text-right font-semibold tabular-nums">{usd.format(row.total)}</div><div className="text-right tabular-nums">{variation == null ? "—" : `${variation > 0 ? "+" : ""}${Math.round(variation)}%`}</div></div>; })}</div>
  </div></div>;
}
