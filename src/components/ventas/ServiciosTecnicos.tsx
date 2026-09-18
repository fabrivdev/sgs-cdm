/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { displayImportedTechnicianName, matchTechnicianProfile, type TechnicianProfileReference } from "@/lib/technicianMatching";
import type { IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceNumberColumn, serviceMoneyColumn } from "./serviceSalesColumns";
import { serviceFiltersKey, serviceFilteredRequest } from "./serviceSalesFilters";

type Fila = {
  tecnico_clave: string; tecnico: string;
  horas_cliente: number; horas_garantia: number; horas_interno: number; horas_otros: number; total_horas: number;
  mo_cliente: number; mo_garantia: number; mo_interno: number; mo_otros: number; mo_total: number;
};

const unknown = (value: string) => /sin (tecnico|técnico|identificar|informar|atribuir)/i.test(value);

export function ServiciosTecnicos({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros }: IndicadoresFiltros) {
  const filterKey = serviceFiltersKey(filtros);
  const [technicianSearch, setTechnicianSearch] = useState("");
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: tecnicos } = useServicioTecnicos();

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) {
      setRows([]);
      setError("Seleccioná un rango de fechas válido.");
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    const request = serviceFilteredRequest("ventas_servicios_tecnicos_v1", filterKey);
    (supabase as any).rpc(request.name, {
      ...request.params,
      p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_buscar: buscar.trim() || null,
    }).then(({ data, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(serviceSalesError(rpcError, filterKey)); setRows([]); }
      else setRows((data as Fila[]) ?? []);
      setLoading(false);
    }).catch((failure: { message?: string }) => {
      if (!alive) return;
      setError(serviceSalesError(failure, filterKey)); setRows([]); setLoading(false);
    });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, buscar, tipoTiempo, marca, tipoMaquina, filterKey]);

  // Mismo criterio de nombres que el historial de la máquina: un técnico, un nombre.
  const unified = useMemo(() => {
    const profiles = (tecnicos ?? []) as TechnicianProfileReference[];
    const map = new Map<string, Fila>();
    rows.forEach((row) => {
      const nombre = row.tecnico_clave === "SIN_TECNICO_ATRIBUIDO"
        ? "Sin técnico atribuido"
        : matchTechnicianProfile(row.tecnico, profiles)?.nombre ?? displayImportedTechnicianName(row.tecnico);
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
    return [...map.values()].sort((a, b) => Number(unknown(a.tecnico)) - Number(unknown(b.tecnico)) || b.total_horas - a.total_horas || a.tecnico.localeCompare(b.tecnico, "es"));
  }, [rows, tecnicos]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando técnicos…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;

  const filtered = unified.filter(row => row.tecnico.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().includes(technicianSearch.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim()));
  const columns: SalesDisplayColumn<Fila>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", value: row => row.tecnico, weight: 2.4, className: "font-medium" },
    ...([ ["horas_cliente", "Horas Cliente"], ["horas_garantia", "Horas Garantía"], ["horas_interno", "Horas Interno"],
      ["horas_otros", "Horas sin clasificar"], ["total_horas", "Total horas"] ] as const)
      .map(([key, label]) => serviceNumberColumn<Fila>(key, label, row => row[key])),
    ...([ ["mo_cliente", "MO Cliente asociada"], ["mo_garantia", "MO Garantía asociada"], ["mo_interno", "MO Interno asociada"],
      ["mo_otros", "MO sin clasificar"], ["mo_total", "MO total asociada"] ] as const)
      .map(([key, label]) => serviceMoneyColumn<Fila>(key, label, row => row[key])),
  ];
  return <div className="mt-3 min-w-0 space-y-2">
    <input type="search" aria-label="Filtrar técnico en esta tabla" placeholder="Técnico…" value={technicianSearch} onChange={event=>setTechnicianSearch(event.target.value)} className="h-8 w-full max-w-xs rounded-md border bg-background px-2 text-[12px]" />
    <SalesDataTable title="Facturación por técnico" rows={filtered} columns={columns}
      initialSort={{key:"total_horas",direction:"desc"}} rowKey={row => row.tecnico} countLabel="técnicos"
      fileName={`ventas-servicios-tecnicos-${desde}-${hasta}.xlsx`} empty="No hay jornadas cargadas para las OS del período." />
  </div>;
}
