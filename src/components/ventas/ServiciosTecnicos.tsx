/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { displayImportedTechnicianName, matchTechnicianProfile, type TechnicianProfileReference } from "@/lib/technicianMatching";
import type { IndicadoresFiltros } from "@/components/ventas/useServiciosIndicadores";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceNumberColumn, serviceMoneyColumn } from "./serviceSalesColumns";
import { serviceFiltersKey } from "./serviceSalesFilters";
import { ServiceTechnicianDetail, ServiceTechnicianDetailExport } from "./ServiceTechnicianDetail";
import { addNullableHours, mergeTechnicianDetails, type ServiceTechnicianRow as Fila } from "./serviceTechnicianModel";

const requestError = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" || error.message?.includes("Could not find the function")
    ? "Actualización de técnicos pendiente: ejecutá el SQL 20260928150000 y recargá la página."
    : error.message || "No se pudo completar la consulta.";

const unknown = (value: string) => /sin (tecnico|técnico|identificar|informar|atribuir)/i.test(value);

export function ServiciosTecnicos({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros }: IndicadoresFiltros) {
  const filterKey = serviceFiltersKey(filtros);
  const [technicianSearch, setTechnicianSearch] = useState("");
  const [rows, setRows] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: tecnicos } = useServicioTecnicos();

  useEffect(() => {
    let alive = true;
    setSelected(null);
    if (!desde || !hasta || desde > hasta) {
      setRows([]);
      setError("Seleccioná un rango de fechas válido.");
      setLoading(false);
      return;
    }
    setLoading(true); setError(null); setRows([]);
    (supabase as any).rpc("ventas_servicios_tecnicos_v2", {
      p_filtros: JSON.parse(filterKey),
      p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo,
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_buscar: buscar.trim() || null,
    }).then(({ data, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(requestError(rpcError)); setRows([]); }
      else setRows((data as Fila[]) ?? []);
      setLoading(false);
    }).catch((failure: { message?: string }) => {
      if (!alive) return;
      setError(requestError(failure)); setRows([]); setLoading(false);
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
        horas_cliente: addNullableHours(current.horas_cliente, row.horas_cliente),
        horas_garantia: addNullableHours(current.horas_garantia, row.horas_garantia),
        horas_interno: addNullableHours(current.horas_interno, row.horas_interno),
        horas_otros: addNullableHours(current.horas_otros, row.horas_otros),
        total_horas: addNullableHours(current.total_horas, row.total_horas),
        mo_cliente: current.mo_cliente + row.mo_cliente,
        mo_garantia: current.mo_garantia + row.mo_garantia,
        mo_interno: current.mo_interno + row.mo_interno,
        mo_otros: current.mo_otros + row.mo_otros,
        mo_total: current.mo_total + row.mo_total,
        detalle_os: mergeTechnicianDetails([...current.detalle_os, ...row.detalle_os]),
      });
    });
    return [...map.values()].sort((a, b) => Number(unknown(a.tecnico)) - Number(unknown(b.tecnico)) || (b.total_horas ?? 0) - (a.total_horas ?? 0) || a.tecnico.localeCompare(b.tecnico, "es"));
  }, [rows, tecnicos]);

  if (loading) return <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando técnicos…</div>;
  if (error) return <div role="alert" className="py-12 text-center text-[12px] text-destructive">{error}</div>;

  const filtered = unified.filter(row => row.tecnico.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().includes(technicianSearch.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim()));
  const columns: SalesDisplayColumn<Fila>[] = [
    { key: "tecnico", label: "Técnico", kind: "text", value: row => row.tecnico, weight: 2.4, className: "font-medium" },
    ...([ ["horas_cliente", "Horas Cliente"], ["horas_garantia", "Horas Garantía"], ["horas_interno", "Horas Interno"],
      ["total_horas", "Total horas"] ] as const)
      .map(([key, label]) => {
        const column = serviceNumberColumn<Fila>(key, label, row => row[key]);
        return { ...column, render: (row: Fila) => <span title="Horas registradas de OS con mano de obra en el período y filtros actuales; no son horas facturadas">{column.render?.(row)}</span> };
      }),
    ...([ ["mo_cliente", "MO Cliente"], ["mo_garantia", "MO Garantía"], ["mo_interno", "MO Interno"],
      ["mo_total", "MO total"] ] as const)
      .map(([key, label]) => serviceMoneyColumn<Fila>(key, label, row => row[key])),
  ];
  return <div className="mt-3 min-w-0 space-y-2">
    <input type="search" aria-label="Filtrar técnico en esta tabla" placeholder="Técnico…" value={technicianSearch} onChange={event=>setTechnicianSearch(event.target.value)} className="h-8 w-full max-w-xs rounded-md border bg-background px-2 text-[12px]" />
    {filtered.some(row => Number(row.horas_otros || 0) !== 0 || Number(row.mo_otros || 0) !== 0 || row.detalle_os.some(detail => !["Cliente", "Garantia", "Interno"].includes(detail.tipo_tiempo))) &&
      <div role="alert" className="text-[12px] text-destructive">Hay datos con tipo de tiempo pendiente de revisión.</div>}
    <SalesDataTable title="Facturación por técnico" rows={filtered} columns={columns} desktopBreakpoint={1280}
      initialSort={{key:"total_horas",direction:"desc"}} rowKey={row => row.tecnico} countLabel="técnicos"
      onRowClick={row => setSelected(row.tecnico)} onDetailClick={row => setSelected(row.tecnico)}
      fileName={`ventas-servicios-tecnicos-${desde}-${hasta}.xlsx`} empty="Sin técnicos ni mano de obra para los filtros seleccionados." />
    <ServiceTechnicianDetailExport rows={filtered} desde={desde} hasta={hasta} />
    <ServiceTechnicianDetail row={filtered.find(row => row.tecnico === selected)} onClose={() => setSelected(null)} desde={desde} hasta={hasta} />
  </div>;
}
