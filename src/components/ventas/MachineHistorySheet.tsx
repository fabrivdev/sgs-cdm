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

type Row = { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null; tipo_tiempo: string | null; servicios_cantidad: number | null; km_cantidad: number | null; responsable: string | null; situacion_os: string | null; factura: string | null; raw_data: Record<string, unknown> | null; servicios_valor: number | null; repuesto_valor: number | null; kilometro_valor: number | null; terceros_valor: number | null };
type Part = { id: string; fecha_factura: string; factura: string; cod_mercaderia: string; codigo_fabricante: string; mercaderia: string; observacion: string; cantidad: number; total_venta: number; grupo_normalizado: string; subgrupo_original: string; raw_data: Record<string, unknown> };
type Machine = { modelo_tipo: string; clientes: { nombre: string } | null };
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const date = (value: string | null) => value ? value.slice(0,10).split("-").reverse().join("/") : "—";
const typeLabel = (value: string) => value === "Garantia" ? "Garantía" : value;
// Sentence-case so imported rows in ALL CAPS and mixed case render the same way.
const estadoLabel = (value: string | null) => {
  if (!value?.trim()) return "—";
  const lower = value.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
const facturaList = (value: string | null) => (value ?? "").split(/[;,]/).map(v => v.trim()).filter(Boolean);
// Same total as TrabajosOSTab: servicios + repuestos + kilometraje + terceros.
function osTotal(row: Row): number | null {
  const values = [row.servicios_valor, row.repuesto_valor, row.kilometro_valor, row.terceros_valor];
  return values.every(v => v == null) ? null : values.reduce((sum, v) => sum + (v ?? 0), 0);
}
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
// Unified crew naming, same rule as Dashboard / Servicios: all participants, canonical name when the technician exists.
function crewNames(row: Row, profiles: TechnicianProfileReference[]): string[] {
  const sources = importedServiceOrderParticipants(row.raw_data, row.responsable);
  const unique = new Map<string, string>();
  for (const source of sources) {
    const name = matchTechnicianProfile(source, profiles)?.nombre ?? displayImportedTechnicianName(source);
    if (name) unique.set(name.toLowerCase(), name);
  }
  return unique.size ? [...unique.values()] : ["Sin técnico asignado"];
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
  const { data: tecnicos } = useServicioTecnicos();
  const profiles = useMemo<TechnicianProfileReference[]>(() => (tecnicos ?? []).map(t => ({ id: t.id, nombre: t.nombre })), [tecnicos]);
  const crewByOs = useMemo(() => new Map(rows.map(row => [row.os_numero, crewNames(row, profiles)])), [rows, profiles]);
  const term = search.trim().toLowerCase();
  const inRange = (value: string | null) => (!from || (value ?? "") >= from) && (!to || (value ?? "").slice(0,10) <= to);
  const matchesText = (row: Row) => [row.os_numero, ...(crewByOs.get(row.os_numero) ?? [])].join(" ").toLowerCase().includes(term);
  const filtered = rows.filter(row => inRange(row.fecha_abierta_os) && matchesText(row));
  const participation = useMemo(() => {
    const result: Record<string, number> = { Cliente: 0, Garantia: 0, Interno: 0 };
    for (const row of rows.filter(row => (!from || (row.fecha_abierta_os ?? "") >= from) && (!to || (row.fecha_abierta_os ?? "").slice(0,10) <= to) && [row.os_numero, ...(crewByOs.get(row.os_numero) ?? [])].join(" ").toLowerCase().includes(term))) {
      for (const [type,hours] of Object.entries(hoursByType(row))) result[type] = (result[type] ?? 0) + hours;
    }
    return result;
  }, [rows,from,to,term,crewByOs]);
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
        <div className="grid gap-2 sm:grid-cols-[minmax(150px,1fr)_repeat(3,minmax(0,1fr))]">
          <div className="rounded-md border bg-muted/40 p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Órdenes de servicio</div><div className="text-[15px] font-semibold leading-5">{filtered.length} OS</div><div className="text-[11px] text-muted-foreground">{decimal.format(totalHours)} h OS en total</div></div>
          {Object.entries(participation).map(([type,hours]) => <div key={type} className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><span className={"h-1.5 w-1.5 rounded-full " + (type === "Cliente" ? "bg-primary" : type === "Garantia" ? "bg-blue-500" : "bg-amber-500")} />{typeLabel(type)}</div>
            <div className="text-[15px] font-semibold leading-5">{decimal.format(hours)} h</div>
            <div className="text-[11px] text-muted-foreground">{totalHours > 0 ? decimal.format(hours/totalHours*100)+"% del total" : "Sin horas en el período"}</div>
          </div>)}
        </div>
        <div className="overflow-x-auto rounded-md border"><table className={tableClass+" min-w-[920px]"}><thead className="bg-muted/50 text-left"><tr>{["Apertura","OS","Estado","Técnicos","Tipo de tiempo","Horas OS","Km OS","Factura registrada","Total OS"].map(h=><th key={h} className={h === "Horas OS" || h === "Km OS" || h === "Total OS" ? "text-right" : undefined}>{h}</th>)}</tr></thead><tbody>{filtered.map(row=>{const breakdown=Object.entries(hoursByType(row));const names=crewByOs.get(row.os_numero) ?? ["Sin técnico asignado"];const techs=names.join(", ");const types=breakdown.map(([type])=>typeLabel(type)).join(" · ");const hours=breakdown.map(([type,h])=>`${typeLabel(type)}: ${decimal.format(h)} h`).join(" · ");const facturas=facturaList(row.factura);const total=osTotal(row);return <tr key={row.os_numero} className="border-t"><td className="whitespace-nowrap">{date(row.fecha_abierta_os)}</td><td className="font-mono whitespace-nowrap">{row.os_numero}</td><td className="whitespace-nowrap">{estadoLabel(row.situacion_os)}</td><td className="max-w-[240px]"><div className="truncate" title={techs}>{techs}</div></td><td className="whitespace-nowrap">{types}</td><td className="text-right whitespace-nowrap" title={hours}>{hours}</td><td className="text-right">{row.km_cantidad == null ? "—" : decimal.format(row.km_cantidad)}</td><td className="font-mono whitespace-nowrap">{facturas.length ? <span title={facturas.join("; ")}>{facturas[0]}{facturas.length > 1 && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">+{facturas.length-1}</span>}</span> : <span className="text-muted-foreground">—</span>}</td><td className="text-right whitespace-nowrap">{total == null ? <span className="text-muted-foreground">—</span> : money(total)}</td></tr>;})}</tbody></table>{!filtered.length && <p className="p-6 text-center text-sm">No hay OS para estos filtros.</p>}</div>
      </> : partsLoading ? <p>Cargando repuestos…</p> : partsError ? <p role="alert" className="text-destructive">No se pudieron consultar los repuestos. {partsError} No se muestran resultados parciales.</p> : <div className="overflow-x-auto rounded-md border"><table className={tableClass+" min-w-[850px]"}><thead className="bg-muted/50 text-left"><tr>{["Fecha","OS","Cód. repuesto","Cód. fabricante","Descripción","Cantidad","Facturado"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visibleParts.map(part=><tr key={part.id} className="border-t"><td>{date(part.fecha_factura)}</td><td className="font-mono">{String(part.raw_data?.linked_service_order ?? "—")}</td><td className="font-mono">{part.cod_mercaderia || "—"}</td><td className="font-mono">{part.codigo_fabricante || "—"}</td><td>{part.mercaderia || part.observacion}</td><td className="text-right">{decimal.format(part.cantidad)}</td><td className="text-right whitespace-nowrap">{money(part.total_venta)}</td></tr>)}</tbody></table>{!visibleParts.length && <p className="p-6 text-sm">Sin líneas de repuestos facturados disponibles para estos filtros. No implica ausencia de consumos en la OS.</p>}</div>}
    </div>
  </SheetContent></Sheet>;
}
