/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { supabase } from "@/integrations/supabase/client";
import { matchesServiceSalesSearch, type ServiceSalesSearchLine } from "@/lib/serviceSalesSearch";
import { canonicalClientName } from "@/lib/clientIdentity";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceMoneyColumn, serviceNumberColumn, serviceShareColumn } from "./serviceSalesColumns";
import type { IndicadoresFiltros } from "./useServiciosIndicadores";
import { serviceFiltersKey, serviceFilteredRequest } from "./serviceSalesFilters";

type Line = ServiceSalesSearchLine & { id: string; factura: string; os: string | null; cliente: string; propietario: string; componente: string; total_venta: number; es_nota_credito?: boolean };
type Summary = { cliente: string; total: number; facturas: Set<string>; notas: Set<string>; os: Set<string>; mo: number; km: number; repuestos: number; terceros: number };

export function ServiciosClientes({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros }: IndicadoresFiltros) {
  const filterKey = serviceFiltersKey(filtros);
  const [perspective, setPerspective] = useState<"propietario" | "cliente">("propietario");
  const [current, setCurrent] = useState<Line[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) {
      setCurrent([]);
      setError("Seleccioná un rango de fechas válido.");
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    const params = (from: string, to: string) => ({ p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_desde: from, p_hasta: to, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo });
    const request = serviceFilteredRequest("ventas_servicios_lineas_v2", filterKey);
    (supabase as any).rpc(request.name, { ...params(desde, hasta), ...request.params }).then((nowResult: any) => {
      if (!alive) return;
      const rpcError = nowResult.error;
      if (rpcError) { setError(serviceSalesError(rpcError, filterKey)); setCurrent([]); }
      else setCurrent(nowResult.data ?? []);
      setLoading(false);
    }).catch((failure: { message?: string }) => {
      if (!alive) return;
      setError(serviceSalesError(failure, filterKey)); setCurrent([]); setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo, marca, tipoMaquina, filterKey]);

  const rows = useMemo(() => {
    const map = new Map<string, Summary>();
    const get = (name: string) => { const key = canonicalClientName(name) || "Sin cliente"; const value = map.get(key) ?? { cliente: key, total: 0, facturas: new Set<string>(), notas: new Set<string>(), os: new Set<string>(), mo: 0, km: 0, repuestos: 0, terceros: 0 }; map.set(key, value); return value; };
    current.filter((line) => matchesServiceSalesSearch(line, buscar)).forEach((line) => { const row = get(line[perspective]); row.total += Number(line.total_venta || 0); row.facturas.add(line.factura); if (line.es_nota_credito) row.notas.add(line.factura); if (line.os) row.os.add(line.os); if (line.componente === "Mano de obra") row.mo += Number(line.total_venta || 0); else if (line.componente === "Kilometraje") row.km += Number(line.total_venta || 0); else if (line.componente === "Repuestos") row.repuestos += Number(line.total_venta || 0); else if (line.componente === "Terceros") row.terceros += Number(line.total_venta || 0); });
    return [...map.values()]
      .filter((row) => row.facturas.size > 0 || row.os.size > 0 || row.total !== 0)
      .sort((a, b) => Number(/^(?:sin|no) (?:cliente|identificar|identificado|informar|informado)/i.test(a.cliente)) - Number(/^(?:sin|no) (?:cliente|identificar|identificado|informar|informado)/i.test(b.cliente)) || b.total - a.total);
  }, [buscar, current, perspective]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Comparando clientes…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;
  const totalPeriodo = rows.reduce((sum, row) => sum + row.total, 0);
  const columns: SalesDisplayColumn<Summary>[] = [
    { key: "cliente", label: perspective === "propietario" ? "Cliente" : "Cliente facturado", kind: "text", value: row => row.cliente, weight: 2.2, className: "font-medium" },
    serviceNumberColumn("os", "OS", row => row.os.size),
    serviceNumberColumn("facturas", "Facturas", row => row.facturas.size),
    serviceNumberColumn("notas", "Notas de crédito", row => row.notas.size),
    ...([ ["mo", "Mano de obra"], ["km", "Kilometraje"], ["repuestos", "Repuestos"], ["terceros", "Terceros"], ["total", "Neto"] ] as const)
      .map(([key, label]) => serviceMoneyColumn<Summary>(key, label, row => row[key])),
    serviceShareColumn<Summary>(row => totalPeriodo ? row.total / totalPeriodo : null),
  ];
  return <div className="mt-3 min-w-0 space-y-2">
    <label className="flex items-center gap-2 text-[11px]">Agrupar por<select aria-label="Agrupar clientes por" value={perspective} onChange={e=>setPerspective(e.target.value as "propietario" | "cliente")} className="h-8 rounded-md border bg-background px-2 text-[11px]"><option value="propietario">Propietarios actuales</option><option value="cliente">Clientes facturados</option></select></label>
    <SalesDataTable title={perspective === "propietario" ? "Facturación por propietario" : "Facturación por cliente"} rows={rows} columns={columns}
      initialSort={{key:"total",direction:"desc"}} rowKey={row => row.cliente}
      fileName={`ventas-servicios-${perspective}-${desde}-${hasta}.xlsx`} countLabel="clientes"
      empty="No hay clientes para el período." />
  </div>;
}
