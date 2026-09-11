/* eslint-disable @typescript-eslint/no-explicit-any -- tablas importadas. */
import { useEffect, useMemo, useState } from "react";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { money } from "@/components/dashboard/utils";
import { serviceTypes } from "@/lib/serviceHistory";
import { displayImportedTechnicianName, importedServiceOrderParticipants, matchTechnicianProfile, type TechnicianProfileReference } from "@/lib/technicianMatching";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";

type Row = { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null; tipo_tiempo: string | null; servicios_cantidad: number | null; km_cantidad: number | null; responsable: string | null; situacion_os: string | null; factura: string | null; raw_data: Record<string, unknown> | null };
type Part = { id: string; fecha_factura: string; factura: string; cod_mercaderia: string; codigo_fabricante: string; mercaderia: string; observacion: string; cantidad: number; total_venta: number; grupo_normalizado: string; subgrupo_original: string; raw_data: Record<string, unknown> };
type Machine = { modelo_tipo: string; clientes: { nombre: string } | null };
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const date = (value: string | null) => value ? value.slice(0,10).split("-").reverse().join("/") : "—";
const typeLabel = (value: string) => value === "Garantia" ? "Garantía" : value;
function hoursByType(row: Row): Record<string, number> {
  const totals = row.raw_data?.totales_por_tipo as Record<string, { horas?: number }> | undefined;
  const result: Record<string, number> = {};
  if (totals && Object.keys(totals).length) {
    for (const [key, value] of Object.entries(totals)) {
      const normalized = serviceTypes({ tipo_tiempo: key, raw_data: null })[0];
      result[normalized] = (result[normalized] ?? 0) + Number(value.horas ?? 0);
    }
    return result;
  }
  const types = serviceTypes(row);
  // A mixed legacy total cannot be allocated to a type without a breakdown.
  return { [types.length === 1 ? types[0] : "Sin desglose"]: Number(row.servicios_cantidad ?? 0) };
}
async function history(chassis: string, view: string) {
  const {data,error} = await (supabase as any).rpc("ventas_servicios_historial", {p_chasis:chassis,p_vista:view});
  if (error) throw new Error(serviceSalesError(error));
  return data;
}
export function MachineHistorySheet({ target, onOpenChange }: { target: { chassis: string | null; os: string | null } | null; onOpenChange: (open: boolean) => void }) {
  const chassis = target?.chassis;
  const [rows, setRows] = useState<Row[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [error, setError] = useState("");
  const [machineError, setMachineError] = useState("");
  const [partsError, setPartsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [partsLoading, setPartsLoading] = useState(false);
  const [tab, setTab] = useState("os");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    if (!chassis) return;
    let alive = true;
    setRows([]); setParts([]); setMachine(null); setError(""); setPartsError(""); setMachineError(""); setLoading(true); setTab("os"); setSearch(""); setFrom(""); setTo("");
    history(chassis, "os")
      .then(data => { if (alive) setRows(data ?? []); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    history(chassis, "maquina")
      .then(data => { if (alive) setMachine(data); })
      .catch(e => { if (alive) setMachineError(e.message); });
    return () => { alive = false; };
  }, [chassis]);
  // Billing is only requested when opening the parts list, never for the OS history.
  useEffect(() => {
    if (tab !== "repuestos" || !chassis || loading) return;
    let alive = true;
    setPartsLoading(true); setPartsError(""); setParts([]);
    history(chassis, "repuestos")
      .then(data => { if (alive) setParts(data ?? []); })
      .catch(e => { if (alive) setPartsError(e.message); })
      .finally(() => { if (alive) setPartsLoading(false); });
    return () => { alive = false; };
  }, [tab, chassis, loading]);
  const term = search.trim().toLowerCase();
  const inRange = (value: string | null) => (!from || (value ?? "") >= from) && (!to || (value ?? "").slice(0,10) <= to);
  const filtered = rows.filter(row => inRange(row.fecha_abierta_os) && [row.os_numero,row.responsable].join(" ").toLowerCase().includes(term));
  const participation = useMemo(() => {
    const result: Record<string, number> = { Cliente: 0, Garantia: 0, Interno: 0 };
    for (const row of rows.filter(row => (!from || (row.fecha_abierta_os ?? "") >= from) && (!to || (row.fecha_abierta_os ?? "").slice(0,10) <= to) && [row.os_numero,row.responsable].join(" ").toLowerCase().includes(term))) {
      for (const [type,hours] of Object.entries(hoursByType(row))) result[type] = (result[type] ?? 0) + hours;
    }
    return result;
  }, [rows,from,to,term]);
  const totalHours = Object.values(participation).reduce((a,b) => a+b,0);
  const visibleParts = parts.filter(part => inRange(part.fecha_factura) && [part.cod_mercaderia,part.codigo_fabricante,part.mercaderia,part.factura,part.raw_data?.linked_service_order].join(" ").toLowerCase().includes(term));
  const tableClass = "w-full text-xs [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_td]:align-top";
  return <Sheet open={Boolean(target)} onOpenChange={onOpenChange}><SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]">
    <SheetHeader className="border-b p-5 pr-12"><SheetTitle>Historial de la máquina</SheetTitle><SheetDescription>{machine?.modelo_tipo ?? "Máquina"} · Chasis {chassis}<span className="block mt-1">Propietario actual: {machineError ? "No disponible: error de consulta" : machine?.clientes?.nombre ?? "No informado"}</span></SheetDescription></SheetHeader>
    <div className="flex gap-5 border-b px-5">{[["os","Historial de OS"],["repuestos","Repuestos"]].map(([key,label]) => <button key={key} onClick={() => { setTab(key); setSearch(""); }} className={"border-b-2 py-3 text-sm " + (tab === key ? "border-primary font-semibold" : "border-transparent text-muted-foreground")}>{label}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px_150px]"><Input aria-label="Buscar en historial" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab === "os" ? "Buscar OS o técnico…" : "Buscar código, fabricante, repuesto u OS…"}/><Input aria-label="Desde" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><Input aria-label="Hasta" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
      {machineError && <p role="alert" className="text-xs text-destructive">{machineError}</p>}
      {loading ? <p>Cargando historial…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : tab === "os" ? <>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-y py-3 text-xs"><span className="font-semibold">{filtered.length} OS · {decimal.format(totalHours)} h OS</span>{Object.entries(participation).map(([type,hours]) => <span key={type}>{typeLabel(type)}: <strong>{decimal.format(hours)} h</strong> · {totalHours > 0 ? decimal.format(hours/totalHours*100)+"%" : "—"}</span>)}</div>
        <div className="overflow-x-auto rounded-md border"><table className={tableClass+" min-w-[760px]"}><thead className="bg-muted/50 text-left"><tr>{["Apertura","OS","Estado","Técnicos","Tipo de tiempo · horas OS","Km OS","Factura registrada"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(row=><tr key={row.os_numero} className="border-t"><td className="whitespace-nowrap">{date(row.fecha_abierta_os)}</td><td className="font-mono whitespace-nowrap">{row.os_numero}</td><td>{row.situacion_os ?? "No informado"}</td><td>{row.responsable ?? "No informado"}</td><td>{Object.entries(hoursByType(row)).map(([type,hours])=><div key={type} className="whitespace-nowrap">{typeLabel(type)} · {decimal.format(hours)} h</div>)}</td><td className="text-right">{row.km_cantidad == null ? "—" : decimal.format(row.km_cantidad)}</td><td className="font-mono">{row.factura || "Sin dato de facturación"}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-6 text-center text-sm">No hay OS para estos filtros.</p>}</div>
      </> : partsLoading ? <p>Cargando repuestos…</p> : partsError ? <p role="alert" className="text-destructive">No se pudieron consultar los repuestos. {partsError} No se muestran resultados parciales.</p> : <div className="overflow-x-auto rounded-md border"><table className={tableClass+" min-w-[850px]"}><thead className="bg-muted/50 text-left"><tr>{["Fecha","OS","Cód. repuesto","Cód. fabricante","Descripción","Cantidad","Facturado"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visibleParts.map(part=><tr key={part.id} className="border-t"><td>{date(part.fecha_factura)}</td><td className="font-mono">{String(part.raw_data?.linked_service_order ?? "—")}</td><td className="font-mono">{part.cod_mercaderia || "—"}</td><td className="font-mono">{part.codigo_fabricante || "—"}</td><td>{part.mercaderia || part.observacion}</td><td className="text-right">{decimal.format(part.cantidad)}</td><td className="text-right whitespace-nowrap">{money(part.total_venta)}</td></tr>)}</tbody></table>{!visibleParts.length && <p className="p-6 text-sm">Sin líneas de repuestos facturados disponibles para estos filtros. No implica ausencia de consumos en la OS.</p>}</div>}
    </div>
  </SheetContent></Sheet>;
}
