/* eslint-disable @typescript-eslint/no-explicit-any -- tablas importadas. */
import { useEffect, useMemo, useState } from "react";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { FiltersBar } from "@/components/filters/FiltersBar";
import type { SalesColumn } from "./salesTableInteraction";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { serviceTypes } from "@/lib/serviceHistory";
import { displayImportedTechnicianName, importedServiceOrderParticipants, matchTechnicianProfile, type TechnicianProfileReference } from "@/lib/technicianMatching";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { canonicalClientName } from "@/lib/clientIdentity";

type Row = { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null; tipo_tiempo: string | null; servicios_cantidad: number | null; km_cantidad: number | null; responsable: string | null; situacion_os: string | null; factura: string | null; raw_data: Record<string, unknown> | null; servicios_valor: number | null; repuesto_valor: number | null; kilometro_valor: number | null; terceros_valor: number | null };
type Part = { id: string; fecha_factura: string; factura: string; cod_mercaderia: string; codigo_fabricante: string; mercaderia: string; observacion: string; cantidad: number; total_venta: number; grupo_normalizado: string; subgrupo_original: string; raw_data: Record<string, unknown> };
type Machine = { modelo_tipo: string; clientes: { nombre: string | null } | null; fuente_propietario?: string };
type EntryKind = "Servicio" | "Kilometraje" | "Terceros" | "Repuesto";
type HistoryEntry = {
  id: string;
  date: string | null;
  closeDate: string | null;
  kind: EntryKind;
  os: string;
  state: string;
  technicians: string;
  timeType: string;
  code: string;
  manufacturerCode: string;
  description: string;
  quantity: number | null;
  invoice: string;
  amount: number | null;
};

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const money = (value: number) => `$ ${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const typeLabel = (value: string) => value === "Garantia" ? "Garantía" : value;
const estadoLabel = (value: string | null) => {
  if (!value?.trim()) return "—";
  const lower = value.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

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
  // Un total legado mixto no puede repartirse entre tipos sin evidencia.
  return { [types.length === 1 ? types[0] : "Sin desglose"]: Number(row.servicios_cantidad ?? 0) };
}

function crewNames(row: Row, profiles: TechnicianProfileReference[]): string[] {
  const sources = importedServiceOrderParticipants(row.raw_data, row.responsable);
  const unique = new Map<string, string>();
  for (const source of sources) {
    const name = matchTechnicianProfile(source, profiles)?.nombre ?? displayImportedTechnicianName(source);
    if (name) unique.set(name.toLowerCase(), name);
  }
  return unique.size ? [...unique.values()] : ["Sin técnico asignado"];
}

function realSourceCode(raw: Record<string, unknown> | null, accepted: readonly string[]): string {
  const candidates = [raw?.source_product_code, raw?.codigo_producto, raw?.CODIGO, raw?.PRODUCTO];
  for (const candidate of candidates) {
    const code = String(candidate ?? "").trim().toUpperCase();
    if (accepted.includes(code)) return code;
  }
  return "";
}

function historyEntries(rows: Row[], parts: Part[], profiles: TechnicianProfileReference[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  rows.forEach((row, rowIndex) => {
    const common = {
      date: row.fecha_abierta_os,
      closeDate: row.fecha_cierre_os,
      os: row.os_numero,
      state: estadoLabel(row.situacion_os),
      technicians: crewNames(row, profiles).join(", "),
      invoice: row.factura ?? "",
      manufacturerCode: "",
    };
    const types = Object.entries(hoursByType(row));
    types.forEach(([timeType, hours], typeIndex) => entries.push({
      ...common,
      id: `servicio:${rowIndex}:${typeIndex}:${row.os_numero}:${timeType}`,
      kind: "Servicio",
      timeType: typeLabel(timeType),
      code: realSourceCode(row.raw_data, ["MA01"]),
      description: "Mano de obra",
      quantity: hours,
      // El valor total de una OS mixta no se reparte sin una fuente por tipo.
      amount: types.length === 1 ? row.servicios_valor : null,
    }));
    if (Number(row.km_cantidad ?? 0) !== 0 || row.kilometro_valor != null) entries.push({
      ...common,
      id: `kilometraje:${rowIndex}:${row.os_numero}`,
      kind: "Kilometraje",
      timeType: "",
      code: realSourceCode(row.raw_data, ["KM", "KM01"]),
      description: "Kilometraje",
      quantity: row.km_cantidad,
      amount: row.kilometro_valor,
    });
    if (row.terceros_valor != null && Number(row.terceros_valor) !== 0) entries.push({
      ...common,
      id: `terceros:${rowIndex}:${row.os_numero}`,
      kind: "Terceros",
      timeType: "",
      code: realSourceCode(row.raw_data, ["SE"]),
      description: "Servicio de terceros",
      quantity: null,
      amount: row.terceros_valor,
    });
  });
  parts.forEach(part => entries.push({
    id: `repuesto:${part.id}`,
    date: part.fecha_factura,
    closeDate: null,
    kind: "Repuesto",
    os: String(part.raw_data?.linked_service_order ?? ""),
    state: "",
    technicians: "",
    timeType: "",
    code: part.cod_mercaderia ?? "",
    manufacturerCode: part.codigo_fabricante ?? "",
    description: part.mercaderia || part.observacion || "",
    quantity: part.cantidad,
    invoice: part.factura ?? "",
    amount: part.total_venta,
  }));
  return entries;
}

async function history(chassis: string, view: string) {
  const { data, error } = await (supabase as any).rpc("ventas_servicios_historial", { p_chasis: chassis, p_vista: view });
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
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!chassis) return;
    let alive = true;
    setRows([]); setParts([]); setMachine(null); setError(""); setMachineError(""); setLoading(true); setSearch(""); setFrom(""); setTo("");
    Promise.all([history(chassis, "os"), history(chassis, "repuestos")])
      .then(([orders, billedParts]) => {
        if (!alive) return;
        setRows(orders ?? []);
        setParts(billedParts ?? []);
      })
      .catch(e => {
        if (!alive) return;
        setRows([]);
        setParts([]);
        setError(e.message);
      })
      .finally(() => { if (alive) setLoading(false); });
    history(chassis, "maquina")
      .then(data => { if (alive) setMachine(data); })
      .catch(e => { if (alive) setMachineError(e.message); });
    return () => { alive = false; };
  }, [chassis]);

  const { data: tecnicos } = useServicioTecnicos(Boolean(chassis));
  const profiles = useMemo<TechnicianProfileReference[]>(() => (tecnicos ?? []).map(t => ({ id: t.id, nombre: t.nombre })), [tecnicos]);
  const entries = useMemo(() => historyEntries(rows, parts, profiles), [rows, parts, profiles]);
  const term = search.trim().toLowerCase();
  const visible = entries.filter(entry => {
    const entryDate = entry.date?.slice(0, 10) ?? "";
    const inRange = (!from || entryDate >= from) && (!to || entryDate <= to);
    const haystack = [entry.kind, entry.os, entry.state, entry.technicians, entry.timeType, entry.code, entry.manufacturerCode, entry.description, entry.invoice].join(" ").toLowerCase();
    return inRange && haystack.includes(term);
  });

  const columns: SalesColumn<HistoryEntry>[] = [
    { key: "fecha", label: "Fecha", kind: "date", value: row => row.date?.slice(0, 10) },
    { key: "tipo", label: "Tipo", kind: "text", value: row => row.kind === "Servicio" ? row.timeType || row.kind : row.kind },
    { key: "os", label: "OS", kind: "text", value: row => row.os },
    { key: "estado", label: "Estado", kind: "text", value: row => row.state },
    { key: "tecnicos", label: "Técnicos", kind: "text", value: row => row.technicians },
    { key: "codigo", label: "Código", kind: "text", value: row => row.code },
    { key: "fabricante", label: "Cód. fabr.", kind: "text", value: row => row.manufacturerCode },
    { key: "descripcion", label: "Descripción", kind: "text", value: row => row.description },
    { key: "cantidad", label: "Cant.", kind: "number", align: "center", value: row => row.quantity },
    { key: "factura", label: "Factura", kind: "text", value: row => row.invoice },
    { key: "facturado", label: "Facturado", kind: "number", align: "right", value: row => row.amount, excelFormat: '"$" #,##0.00' },
  ];
  const table = useSectionTable({
    rows: visible,
    columns,
    initialSort: { key: "fecha", direction: "desc" },
    title: "Historial completo de la máquina",
    fileName: "historial-completo-maquina.xlsx",
    disabled: loading || !!error,
    register: false,
  });
  const visibleKeys = ["fecha", "tipo", "os", "codigo", "descripcion", "cantidad", "factura", "facturado"];
  const view: CompactListColumn<HistoryEntry>[] = columns.filter(column => visibleKeys.includes(column.key)).map(column => {
    const layout: Record<string, Pick<CompactListColumn<HistoryEntry>, "width" | "hiddenBelow">> = {
      fecha: { width: "md:w-[10%] lg:w-[10%]", hiddenBelow: "md" },
      tipo: { width: "w-[23%] md:w-[16%] lg:w-[11%]" },
      os: { width: "md:w-[14%] lg:w-[13%]", hiddenBelow: "md" },
      codigo: { width: "lg:w-[11%]", hiddenBelow: "lg" },
      descripcion: { width: "w-[33%] md:w-[34%] lg:w-[26%]" },
      cantidad: { width: "w-[17%] md:w-[12%] lg:w-[8%]" },
      factura: { width: "lg:w-[12%]", hiddenBelow: "lg" },
      facturado: { width: "w-[27%] md:w-[14%] lg:w-[9%]" },
    };
    return {
      ...column,
      ...layout[column.key],
      className: ["os", "codigo", "factura"].includes(column.key) ? "font-mono" : undefined,
      render: row => {
        if (column.key === "fecha") return date(row.date);
        if (column.key === "descripcion") return <CompactListInfo label={row.description || "—"} fields={[
          ["Ítem", row.kind], ["OS", row.os || "—"], ["Estado", row.state || "—"], ["Técnicos", row.technicians || "—"],
          ["Tiempo", row.timeType || "—"], ["Código", row.code || "—"], ["Cód. fabr.", row.manufacturerCode || "—"],
          ["Factura", row.invoice || "—"], ["Cierre", date(row.closeDate)],
        ]} />;
        if (column.key === "cantidad") return row.quantity == null ? "—" : decimal.format(row.quantity);
        if (column.key === "facturado") return row.amount == null ? "—" : money(row.amount);
        return String(column.value(row) || "—");
      },
    };
  });

  return <Sheet open={Boolean(target)} onOpenChange={onOpenChange}><SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]">
    <SheetHeader className="border-b p-5 pr-12"><SheetTitle>Historial de la máquina</SheetTitle><SheetDescription>{machine?.modelo_tipo ?? "Máquina"} · Chasis {chassis}<span className="mt-1 block">Propietario actual: {machineError ? "No disponible: error de consulta" : canonicalClientName(machine?.clientes?.nombre) || "No informado"}{machine?.fuente_propietario === "stock" && <span className="text-muted-foreground"> · Stock propio</span>}</span></SheetDescription></SheetHeader>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
      <FiltersBar search={{ value: search, onChange: setSearch, ariaLabel: "Buscar en historial", placeholder: "Buscar OS, factura, técnico, código o descripción…" }}
        activeCount={Number(!!from) + Number(!!to)} onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
        expanded={<><Input aria-label="Desde" type="date" value={from} onChange={event => setFrom(event.target.value)} /><Input aria-label="Hasta" type="date" value={to} onChange={event => setTo(event.target.value)} /></>}
        secondaryActions={<SectionActionsMenu options={table.action ? [table.action] : []} />} />
      {machineError && <p role="alert" className="text-xs text-destructive">{machineError}</p>}
      {loading ? <p>Cargando historial…</p> : error ? <p role="alert" className="text-destructive">No se pudo cargar el historial completo. {error} No se muestran resultados parciales.</p> :
        <div className="overflow-hidden rounded-md border"><CompactListTable rows={table.ordered} columns={view} id={row => row.id} label="Historial completo de la máquina" sort={table.sort} heading={table.heading}
          status={!visible.length ? "No hay movimientos para estos filtros." : undefined} /></div>}
    </div>
  </SheetContent></Sheet>;
}
