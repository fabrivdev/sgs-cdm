/* eslint-disable @typescript-eslint/no-explicit-any -- las tablas/RPC de esta migración aún no están en los tipos generados de Supabase */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, startOfMonth } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  Upload,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cargarTodo } from "@/hooks/useCatalogos";
import { importCommissionXmlOnly } from "@/lib/imports";
import { normalizeTechnicianName } from "@/lib/technicianMatching";
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeletonRows } from "@/components/LoadingSkeletons";
import { cn } from "@/lib/utils";
import { iconSm, metaText, tableHeadText, tableText, tableTextDense } from "@/lib/ui-classes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";

type View = "cerradas" | "abiertas" | "revisar" | "liquidaciones";

interface CommissionRow {
  id: string;
  sucursal: string | null;
  os_numero: string;
  cliente_nombre: string | null;
  nro_chasis: string | null;
  estado_os: string | null;
  fecha_cierre: string | null;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  fecha_fin: string | null;
  hora_fin: string | null;
  tecnico_codigo: string | null;
  tecnico_nombre: string;
  tecnico_profile_id: string | null;
  rol_tecnico: "PRINCIPAL" | "AUXILIAR";
  tipo_tiempo: "Cliente" | "Garantia" | "Interno" | "Desconocido";
  horas_reportadas: number | null;
  horas_calculadas: number | null;
  horas_validas: number | null;
  estado_validacion: "VALIDA" | "REVISAR" | "INVALIDA";
  motivos_validacion: string[];
}

interface Settlement {
  id: string;
  periodo_desde: string;
  periodo_hasta: string;
  estado: string;
  total_horas: number;
  observacion: string | null;
  pagado_en: string | null;
}

interface TechnicianSummary {
  key: string;
  technician: string;
  branches: string[];
  cliente: number;
  garantia: number;
  interno: number;
  desconocido: number;
  total: number;
  lines: number;
  orders: Set<string>;
}

interface CommissionOsSummary {
  key: string;
  osNumber: string;
  client: string;
  chassis: string | null;
  branches: string[];
  technicians: string[];
  timeTypes: string[];
  rows: CommissionRow[];
  dateFrom: string | null;
  dateTo: string | null;
  totalHours: number;
  validation: CommissionRow["estado_validacion"];
  paidCount: number;
}

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const todayIso = () => format(new Date(), "yyyy-MM-dd");
const monthStartIso = () => format(startOfMonth(new Date()), "yyyy-MM-dd");
const DATE_RANGE_STORAGE_KEY = "sig:comisiones:date-range";
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function storedDateRange() {
  const fallback = { from: monthStartIso(), to: todayIso() };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DATE_RANGE_STORAGE_KEY) ?? "null") as { from?: unknown; to?: unknown } | null;
    const from = typeof parsed?.from === "string" && isoDatePattern.test(parsed.from) ? parsed.from : fallback.from;
    const to = typeof parsed?.to === "string" && isoDatePattern.test(parsed.to) ? parsed.to : fallback.to;
    return from <= to ? { from, to } : fallback;
  } catch {
    return fallback;
  }
}

const hours = (value: number | null | undefined) => value == null ? "—" : `${number.format(value)} h`;
const dateLabel = (value: string | null) => value ? format(new Date(`${value}T12:00:00`), "dd/MM/yyyy") : "—";
const shortDate = (value: string | null) => value ? format(new Date(`${value}T12:00:00`), "dd/MM") : "—";
const periodLabel = (fromDate: string | null, toDate: string | null) => {
  if (!fromDate && !toDate) return "—";
  if (!fromDate || !toDate || fromDate === toDate) return format(new Date(`${(fromDate ?? toDate) as string}T12:00:00`), "dd/MM/yy");
  return `${shortDate(fromDate)} – ${format(new Date(`${toDate}T12:00:00`), "dd/MM/yy")}`;
};

function branchInitials(value: string) {
  const known: Record<string, string> = {
    "Santa Rita": "SR",
    "Santa Rosa": "SRO",
    Katuete: "KT",
    "Loma Plata": "LP",
    "Campo 9": "C9",
    Misiones: "MI",
    "Sin sucursal": "—",
  };
  return known[value] ?? value.split(/\s+/).map((part) => part[0]).join("").toUpperCase();
}

function isClosed(row: CommissionRow) {
  return String(row.estado_os ?? "").toLowerCase().includes("cerrad") || Boolean(row.fecha_cierre);
}

function normalizeFilterText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function normalizeOrderNumber(value: string | null | undefined) {
  return String(value ?? "")
    .split(/\D+/)
    .filter(Boolean)
    .map((part) => part.replace(/^0+(?=\d)/, ""))
    .join("-");
}

function commissionBlockKey(row: CommissionRow) {
  return [row.fecha_inicio, row.hora_inicio, row.fecha_fin, row.hora_fin, row.tipo_tiempo]
    .map((value) => String(value ?? ""))
    .join("|");
}

function uniqueBlockHours(rows: CommissionRow[]) {
  const blocks = new Map<string, number>();
  for (const row of rows) {
    const key = commissionBlockKey(row);
    const value = Number(row.horas_calculadas ?? 0);
    blocks.set(key, Math.max(blocks.get(key) ?? 0, value));
  }
  return Array.from(blocks.values()).reduce((sum, value) => sum + value, 0);
}

function summarize(rows: CommissionRow[], paidIds: Set<string>) {
  const grouped = new Map<string, TechnicianSummary>();
  for (const row of rows) {
    const key = row.tecnico_profile_id ?? normalizeTechnicianName(row.tecnico_nombre);
    const current = grouped.get(key) ?? {
      key,
      technician: row.tecnico_nombre,
      branches: [],
      cliente: 0,
      garantia: 0,
      interno: 0,
      desconocido: 0,
      total: 0,
      lines: 0,
      orders: new Set<string>(),
    };
    const branch = row.sucursal ?? "Sin sucursal";
    if (!current.branches.includes(branch)) current.branches.push(branch);
    const value = Number((paidIds.has(row.id) ? row.horas_validas : row.horas_calculadas ?? row.horas_validas) ?? 0);
    if (row.tipo_tiempo === "Cliente") current.cliente += value;
    else if (row.tipo_tiempo === "Garantia") current.garantia += value;
    else if (row.tipo_tiempo === "Interno") current.interno += value;
    else current.desconocido += value;
    current.total += value;
    current.lines += 1;
    current.orders.add(row.os_numero);
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total || a.technician.localeCompare(b.technician));
}

function summarizeOrders(rows: CommissionRow[], paidIds: Set<string>): CommissionOsSummary[] {
  const grouped = new Map<string, CommissionRow[]>();
  for (const row of rows) {
    const key = `${row.sucursal ?? ""}|${row.os_numero}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries()).map(([key, orderRows]) => {
    const representative = orderRows.find((row) => row.cliente_nombre || row.nro_chasis) ?? orderRows[0];
    const dates = orderRows
      .flatMap((row) => [row.fecha_inicio, row.fecha_fin])
      .filter((value): value is string => Boolean(value))
      .sort();
    const validation = orderRows.some((row) => row.estado_validacion === "INVALIDA")
      ? "INVALIDA"
      : orderRows.some((row) => row.estado_validacion === "REVISAR")
        ? "REVISAR"
        : "VALIDA";
    return {
      key,
      osNumber: representative.os_numero,
      client: representative.cliente_nombre ?? "Cliente no informado",
      chassis: representative.nro_chasis,
      branches: Array.from(new Set(orderRows.map((row) => row.sucursal ?? "Sin sucursal"))),
      technicians: Array.from(new Set(orderRows.map((row) => row.tecnico_nombre))),
      timeTypes: Array.from(new Set(orderRows.map((row) => row.tipo_tiempo))),
      rows: orderRows,
      dateFrom: dates[0] ?? null,
      dateTo: representative.fecha_cierre ?? dates[dates.length - 1] ?? null,
      totalHours: uniqueBlockHours(orderRows),
      validation,
      paidCount: orderRows.filter((row) => paidIds.has(row.id)).length,
    } satisfies CommissionOsSummary;
  }).sort((a, b) => String(b.dateTo ?? b.dateFrom ?? "").localeCompare(String(a.dateTo ?? a.dateFrom ?? "")) || a.osNumber.localeCompare(b.osNumber));
}

function SummaryTable({ rows, onTechnician }: { rows: TechnicianSummary[]; onTechnician: (name: string) => void }) {
  return (
    <Table className={cn("w-full", tableTextDense)}>
      <TableHeader>
        <TableRow>
          <TableHead className={cn(tableHeadText, "w-auto whitespace-nowrap px-2")}>Técnico</TableHead>
          <TableHead className={cn(tableHeadText, "w-[72px] whitespace-nowrap px-2 text-right")}>OS</TableHead>
          <TableHead className={cn(tableHeadText, "w-[110px] whitespace-nowrap px-2")}>Sucursal</TableHead>
          <TableHead className={cn(tableHeadText, "w-[92px] whitespace-nowrap px-2 text-right")}>Cliente</TableHead>
          <TableHead className={cn(tableHeadText, "w-[92px] whitespace-nowrap px-2 text-right")}>Garantía</TableHead>
          <TableHead className={cn(tableHeadText, "w-[92px] whitespace-nowrap px-2 text-right")}>Interno</TableHead>
          <TableHead className={cn(tableHeadText, "w-[92px] whitespace-nowrap px-2 text-right")}>Sin tipo</TableHead>
          <TableHead className={cn(tableHeadText, "w-[92px] whitespace-nowrap px-2 text-right")}>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="h-20 p-0"><EmptyState title="Sin horas en el período" className="border-0 bg-transparent" /></TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.key} className="h-8 cursor-pointer hover:bg-muted/40" onClick={() => onTechnician(row.technician)}>
            <TableCell className="px-2 py-1"><span className="block truncate font-medium" title={row.technician}>{row.technician}</span></TableCell>
            <TableCell className="px-2 py-1 text-right tabular-nums" title={`${row.lines} jornadas`}>{row.orders.size}</TableCell>
            <TableCell className="px-2 py-1"><span className="block truncate" title={row.branches.join(", ")}>{row.branches.sort().map(branchInitials).join(" ")}</span></TableCell>

            <TableCell className="px-2 py-1 text-right tabular-nums">{hours(row.cliente)}</TableCell>
            <TableCell className="px-2 py-1 text-right tabular-nums">{hours(row.garantia)}</TableCell>
            <TableCell className="px-2 py-1 text-right tabular-nums">{hours(row.interno)}</TableCell>
            <TableCell className="px-2 py-1 text-right tabular-nums">{hours(row.desconocido)}</TableCell>
            <TableCell className="px-2 py-1 text-right font-semibold tabular-nums">{hours(row.total)}</TableCell>

          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}


export default function Comisiones() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [initialDateRange] = useState(storedDateRange);
  const [view, setView] = useState<View>("cerradas");
  const [from, setFrom] = useState(initialDateRange.from);
  const [to, setTo] = useState(initialDateRange.to);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [activeTechnicianIds, setActiveTechnicianIds] = useState<Set<string>>(new Set());
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");
  const [osStateFilter, setOsStateFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [selectedOsKey, setSelectedOsKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [journeys, detailResult, settlementResult, initialResult, technicianResult] = await Promise.all([
        cargarTodo<CommissionRow>(
          (supabase.from("comisiones_jornadas" as any) as any)
            .select("id,sucursal,os_numero,cliente_nombre,nro_chasis,estado_os,fecha_cierre,fecha_inicio,hora_inicio,fecha_fin,hora_fin,tecnico_codigo,tecnico_nombre,tecnico_profile_id,rol_tecnico,tipo_tiempo,horas_reportadas,horas_calculadas,horas_validas,estado_validacion,motivos_validacion")
            .eq("vigente", true)
            .order("fecha_inicio", { ascending: false }),
        ),
        cargarTodo<{ jornada_id: string }>((supabase.from("comisiones_liquidacion_detalle" as any) as any).select("jornada_id")),
        cargarTodo<Settlement>((supabase.from("comisiones_liquidaciones" as any) as any).select("id,periodo_desde,periodo_hasta,estado,total_horas,observacion,pagado_en").order("pagado_en", { ascending: false })),
        (supabase.from("importaciones") as any).select("id").eq("origen_sistema", "comisiones_os_backfill").gt("insertados", 0).limit(1),
        (supabase.rpc as any)("servicios_listar_tecnicos_activos"),
      ]);
      if (initialResult.error) throw initialResult.error;
      if (technicianResult.error) throw technicianResult.error;
      setRows(journeys);
      setPaidIds(new Set(detailResult.map((row) => row.jornada_id)));
      setSettlements(settlementResult);
      setInitialLoadDone(Boolean(initialResult.data?.length));
      setActiveTechnicianIds(new Set((technicianResult.data ?? []).map((row: { id: string }) => row.id)));
      setSchemaMissing(false);
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      if (/comisiones_/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
        setSchemaMissing(true);
      } else {
        toast.error(`No se pudieron cargar las comisiones: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [view, from, to]);
  useEffect(() => {
    window.localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify({ from, to }));
  }, [from, to]);

  const isActiveTechnician = useCallback((row: CommissionRow) => Boolean(
    row.tecnico_profile_id && activeTechnicianIds.has(row.tecnico_profile_id)
  ), [activeTechnicianIds]);

  const technicianOptions = useMemo(() => Array.from(new Set(rows
    .map((row) => row.tecnico_nombre?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, "es")), [rows]);

  const osStateOptions = useMemo(() => {
    const states = new Map<string, string>();
    for (const row of rows) {
      const label = row.estado_os?.trim();
      if (label) states.set(normalizeFilterText(label), label);
    }
    return Array.from(states.entries())
      .sort(([, a], [, b]) => a.localeCompare(b, "es"))
      .map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = normalizeFilterText(searchFilter);
    const queryOrder = normalizeOrderNumber(searchFilter);
    return rows.filter((row) => {
      if (technicianFilter && row.tecnico_nombre !== technicianFilter) return false;
      if (osStateFilter !== "all" && normalizeFilterText(row.estado_os) !== osStateFilter) return false;
      if (!query) return true;

      const matchesText = [
        row.os_numero,
        row.cliente_nombre,
        row.nro_chasis,
        row.estado_os,
        row.tecnico_nombre,
      ].some((value) => normalizeFilterText(value).includes(query));
      const matchesOrder = Boolean(queryOrder) && normalizeOrderNumber(row.os_numero).includes(queryOrder);
      return matchesText || matchesOrder;
    });
  }, [osStateFilter, rows, searchFilter, technicianFilter]);

  const eligibleRows = useMemo(() => filteredRows.filter(isActiveTechnician), [filteredRows, isActiveTechnician]);
  const periodRows = useMemo(() => (view === "revisar" ? filteredRows : eligibleRows).filter((row) => {
    if (view === "abiertas") {
      return !isClosed(row) && (!row.fecha_inicio || row.fecha_inicio <= to);
    }
    if (view === "revisar") {
      return !paidIds.has(row.id)
        && (!isActiveTechnician(row) || row.estado_validacion !== "VALIDA")
        && (!row.fecha_inicio || row.fecha_inicio <= to);
    }
    if (!isClosed(row) || !row.fecha_cierre) return false;
    return row.fecha_cierre >= from && row.fecha_cierre <= to;
  }), [eligibleRows, filteredRows, from, isActiveTechnician, paidIds, to, view]);

  const unpaidClosedRows = useMemo(() => periodRows.filter((row) => !paidIds.has(row.id)), [paidIds, periodRows]);
  const payableRows = useMemo(() => unpaidClosedRows.filter((row) => row.estado_validacion === "VALIDA" && Number(row.horas_validas ?? 0) > 0), [unpaidClosedRows]);
  const reviewRows = useMemo(() => periodRows.filter((row) => row.estado_validacion !== "VALIDA"), [periodRows]);
  const summaryRows = useMemo(() => summarize(periodRows, paidIds), [paidIds, periodRows]);
  const closedAll = useMemo(() => eligibleRows.filter((row) => isClosed(row) && row.fecha_cierre && row.fecha_cierre >= from && row.fecha_cierre <= to), [eligibleRows, from, to]);
  const openAll = useMemo(() => eligibleRows.filter((row) => !isClosed(row) && (!row.fecha_inicio || row.fecha_inicio <= to)), [eligibleRows, to]);
  const totalClosed = closedAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalOpen = openAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalPendingPayment = closedAll.filter((row) => !paidIds.has(row.id) && row.estado_validacion === "VALIDA").reduce((sum, row) => sum + Number(row.horas_validas ?? 0), 0);
  const totalReview = filteredRows.filter((row) => !paidIds.has(row.id) && (!isActiveTechnician(row) || row.estado_validacion !== "VALIDA")).length;
  const closedOrderCount = new Set(closedAll.map((row) => row.os_numero)).size;
  const openOrderCount = new Set(openAll.map((row) => row.os_numero)).size;
  const reviewOrderCount = new Set(filteredRows.filter((row) => !paidIds.has(row.id) && (!isActiveTechnician(row) || row.estado_validacion !== "VALIDA")).map((row) => row.os_numero)).size;
  const selectedOsRows = useMemo(
    () => selectedOsKey ? rows.filter((row) => `${row.sucursal ?? ""}|${row.os_numero}` === selectedOsKey) : [],
    [rows, selectedOsKey],
  );
  const selectedOs = selectedOsRows.find((row) => row.cliente_nombre || row.nro_chasis) ?? selectedOsRows[0] ?? null;
  const selectedOsDays = useMemo(() => {
    const grouped = new Map<string, CommissionRow[]>();
    for (const row of selectedOsRows) {
      const key = row.fecha_inicio ?? "sin-fecha";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return Array.from(grouped.entries())
      .map(([date, dayRows]) => ({
        date,
        rows: dayRows.sort((a, b) => String(a.hora_inicio ?? "").localeCompare(String(b.hora_inicio ?? ""))),
        total: uniqueBlockHours(dayRows),
      }))
      .sort((a, b) => a.date === "sin-fecha" ? 1 : b.date === "sin-fecha" ? -1 : a.date.localeCompare(b.date));
  }, [selectedOsRows]);
  const selectedOsTotal = uniqueBlockHours(selectedOsRows);
  const selectedOsBlocks = new Set(selectedOsRows.map(commissionBlockKey)).size;
  const selectedOsTechnicians = new Set(selectedOsRows.map((row) => row.tecnico_profile_id ?? normalizeTechnicianName(row.tecnico_nombre))).size;

  const validateSelected = async () => {
    if (!selected.size) return;
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("comisiones_validar_jornadas", {
      p_jornada_ids: Array.from(selected),
      p_observacion: "Validación administrativa desde Comisiones",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} jornadas validadas con las horas recalculadas.`);
    setSelected(new Set());
    await load();
  };

  const markPaid = async () => {
    if (!selected.size) return;
    const total = payableRows.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + Number(row.horas_validas ?? 0), 0);
    if (!window.confirm(`¿Registrar como pagadas ${number.format(total)} horas? Esta acción evita que vuelvan a liquidarse.`)) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("comisiones_marcar_pagadas", {
      p_jornada_ids: Array.from(selected),
      p_periodo_desde: from,
      p_periodo_hasta: to,
      p_observacion: `Liquidación ${dateLabel(from)} al ${dateLabel(to)}`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Las jornadas quedaron registradas como pagadas.");
    setSelected(new Set());
    await load();
  };

  const uploadInitialXml = async (file: File) => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await importCommissionXmlOnly({ file, userId: user.id });
      toast.success(`${result.inserted} jornadas cargadas; ${result.review} requieren revisión.`);
      await load();
    } catch (error) {
      toast.error(`No se pudo completar la carga inicial. ${String((error as { message?: string })?.message ?? error)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const detailRows = view === "cerradas" ? unpaidClosedRows : view === "revisar" ? reviewRows : periodRows;
  const selectableIds = view === "cerradas" ? payableRows.map((row) => row.id) : view === "revisar" ? reviewRows.filter((row) => isActiveTechnician(row) && Number(row.horas_calculadas ?? 0) > 0 && row.estado_validacion !== "INVALIDA").map((row) => row.id) : [];
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const detailOrders = useMemo(() => summarizeOrders(detailRows, paidIds), [detailRows, paidIds]);
  const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);
  const activeFilterCount = Number(Boolean(searchFilter.trim()))
    + Number(Boolean(technicianFilter))
    + Number(osStateFilter !== "all");

  const clearFilters = () => {
    setSearchFilter("");
    setTechnicianFilter("");
    setOsStateFilter("all");
  };

  const toggleOrder = (order: CommissionOsSummary, checked: boolean) => {
    const orderIds = order.rows.filter((row) => selectableIdSet.has(row.id)).map((row) => row.id);
    setSelected((current) => {
      const next = new Set(current);
      orderIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const resumenPanel = (
    <Panel className="overflow-hidden p-0">
      <div className="border-b px-3 py-2"><SectionHeader title="Horas por técnico y tipo" /></div>
      <div className="max-h-[320px] overflow-auto"><SummaryTable rows={summaryRows} onTechnician={setTechnicianFilter} /></div>
    </Panel>
  );

  const ordenesPanel = (
    <Panel className="overflow-hidden p-0">
      <div className="border-b px-3 py-2">
        <SectionHeader
          title={view === "revisar" ? "OS por validar" : view === "abiertas" ? "OS abiertas" : "OS pendientes de liquidación"}
          meta={`${detailOrders.length} OS · ${detailRows.length} jornadas`}
          actions={view === "cerradas" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void markPaid()}><WalletCards className={cn(iconSm, "mr-2")} />Marcar pagadas ({selected.size})</Button> : view === "revisar" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void validateSelected()}><CheckCircle2 className={cn(iconSm, "mr-2")} />Validar cálculo ({selected.size})</Button> : undefined}
        />
      </div>
      <div className="w-full overflow-x-auto"><div className="max-h-[480px] overflow-y-auto"><Table className={cn("w-full min-w-[860px] table-fixed", tableTextDense)}>
        <TableHeader><TableRow>
          {view !== "abiertas" && <TableHead className="w-8 px-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(selectableIds) : new Set())} /></TableHead>}
          <TableHead className={cn(tableHeadText, "w-[104px] whitespace-nowrap px-2")}>Orden</TableHead>
          <TableHead className={cn(tableHeadText, "w-auto whitespace-nowrap px-2")}>Cliente</TableHead>
          <TableHead className={cn(tableHeadText, "w-auto whitespace-nowrap px-2")}>Equipo técnico</TableHead>
          <TableHead className={cn(tableHeadText, "w-[68px] whitespace-nowrap px-2")}>Suc.</TableHead>
          <TableHead className={cn(tableHeadText, "w-[96px] whitespace-nowrap px-2")}>Tipo</TableHead>
          <TableHead className={cn(tableHeadText, "w-[112px] whitespace-nowrap px-2")}>Período</TableHead>
          <TableHead className={cn(tableHeadText, "w-[54px] whitespace-nowrap px-2 text-right")}>Jorn.</TableHead>
          <TableHead className={cn(tableHeadText, "w-[76px] whitespace-nowrap px-2 text-right")}>Horas</TableHead>
          <TableHead className={cn(tableHeadText, "w-[86px] whitespace-nowrap px-2")}>Estado</TableHead>
          <TableHead className={cn(tableHeadText, "w-[86px] whitespace-nowrap px-2")}>Pago</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableSkeletonRows columns={view !== "abiertas" ? 11 : 10} rows={6} /> : detailOrders.length === 0 ? <TableRow><TableCell colSpan={11} className="h-20 p-0"><EmptyState title="Sin órdenes para mostrar" className="border-0 bg-transparent" /></TableCell></TableRow> : detailOrders.slice(0, 500).map((order) => {
            const orderIds = order.rows.filter((row) => selectableIdSet.has(row.id)).map((row) => row.id);
            const orderSelected = orderIds.length > 0 && orderIds.every((id) => selected.has(id));
            const inactiveTechnician = order.rows.some((row) => !isActiveTechnician(row));
            const period = periodLabel(order.dateFrom, order.dateTo);
            const payment = order.paidCount === order.rows.length ? "Pagada" : order.paidCount > 0 ? "Parcial" : "Pendiente";
            return <TableRow key={order.key} className="h-8" data-state={orderSelected ? "selected" : undefined}>
              {view !== "abiertas" && <TableCell className="px-2 py-1"><Checkbox disabled={orderIds.length === 0} checked={orderSelected} onCheckedChange={(checked) => toggleOrder(order, Boolean(checked))} /></TableCell>}
              <TableCell className="min-w-0 overflow-hidden px-2 py-1"><button type="button" title={`OS ${order.osNumber}`} className="block w-full truncate text-left font-semibold tabular-nums hover:text-primary hover:underline" onClick={() => setSelectedOsKey(order.key)}>{order.osNumber}</button></TableCell>
              <TableCell className="px-2 py-1"><span className="block truncate" title={`${order.client}${order.chassis ? ` · Chasis ${order.chassis}` : ""}`}>{order.client}</span></TableCell>
              <TableCell className="px-2 py-1"><span className="flex min-w-0 items-center gap-1.5" title={order.technicians.join(", ")}>{inactiveTechnician && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Incluye técnico inactivo" />}<span className="truncate">{order.technicians[0]}{order.technicians.length > 1 ? ` +${order.technicians.length - 1}` : ""}</span></span></TableCell>
              <TableCell className="px-2 py-1"><span className="block truncate" title={order.branches.join(", ")}>{order.branches.map(branchInitials).join(" ")}</span></TableCell>
              <TableCell className="px-2 py-1"><span className="block truncate" title={order.timeTypes.join(", ")}>{order.timeTypes.join(", ")}</span></TableCell>
              <TableCell className="whitespace-nowrap px-2 py-1 tabular-nums">{period}</TableCell>
              <TableCell className="px-2 py-1 text-right tabular-nums">{order.rows.length}</TableCell>
              <TableCell className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{hours(order.totalHours)}</TableCell>
              <TableCell className="px-2 py-1"><Badge variant={order.validation === "VALIDA" ? "secondary" : order.validation === "INVALIDA" ? "destructive" : "outline"} className="whitespace-nowrap">{order.validation === "VALIDA" ? "Válida" : order.validation === "INVALIDA" ? "Inválida" : "Revisar"}</Badge></TableCell>
              <TableCell className="px-2 py-1">{payment === "Pagada" ? <Badge className="whitespace-nowrap bg-emerald-600">Pagada</Badge> : payment === "Parcial" ? <Badge variant="outline" className="whitespace-nowrap border-amber-300 text-amber-700">Parcial</Badge> : <span className="text-muted-foreground">Pendiente</span>}</TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table></div></div>

      {detailOrders.length > 500 && <div className={cn(metaText, "border-t px-3 py-2")}>Se muestran las primeras 500 OS.</div>}
    </Panel>
  );

  return (
    <PageShell>
      <Tabs value={view} onValueChange={(value) => setView(value as View)} className="space-y-3">
        <PageHeader
          title="Comisiones"
          tabs={<TabsList>
            <TabsTrigger value="cerradas">Cerradas</TabsTrigger>
            <TabsTrigger value="abiertas">Abiertas</TabsTrigger>
            <TabsTrigger value="revisar">Revisar{totalReview ? ` (${totalReview})` : ""}</TabsTrigger>
            <TabsTrigger value="liquidaciones">Pagos</TabsTrigger>
          </TabsList>}
          actions={<>
            <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={(event) => event.target.files?.[0] && void uploadInitialXml(event.target.files[0])} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className={cn(iconSm, "mr-2 animate-spin")} /> : initialLoadDone ? <FileCheck2 className={cn(iconSm, "mr-2")} /> : <Upload className={cn(iconSm, "mr-2")} />}
              {initialLoadDone ? "Importar XML" : "Carga inicial"}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={loading} onClick={() => void load()} title="Actualizar"><RefreshCw className={iconSm} /></Button>
          </>}
        />

        {schemaMissing ? (
          <Panel className="border-amber-300 bg-amber-50 text-amber-950">
            <div className="flex items-start gap-3"><AlertTriangle className={iconSm} /><div><div className="font-semibold">Falta aplicar la migración de Comisiones</div><p className={cn(metaText, "mt-1 text-amber-900")}>Aplicá el SQL de esta versión y actualizá.</p></div></div>
          </Panel>
        ) : <>
          <KpiStrip>
            <KpiItem label="Horas cerradas" value={hours(totalClosed)} detail={`${closedOrderCount} OS · ${closedAll.length} jornadas`} tone="info" icon={<CheckCircle2 />} />
            <KpiItem label="Pendientes de pago" value={hours(totalPendingPayment)} detail="Validadas sin liquidar" tone="positive" icon={<WalletCards />} />
            <KpiItem label="Horas abiertas" value={hours(totalOpen)} detail={`${openOrderCount} OS · ${openAll.length} jornadas`} tone="warning" icon={<Clock3 />} />
            <KpiItem label="Requieren revisión" value={number.format(totalReview)} detail={`${reviewOrderCount} OS`} tone={totalReview ? "danger" : "default"} icon={<AlertTriangle />} />
          </KpiStrip>

          <FiltersBar
            search={{
              value: searchFilter,
              onChange: setSearchFilter,
              label: "Buscar",
              placeholder: "OS, cliente, chasis o técnico…",
              width: "w-[280px] min-w-[180px] shrink",
            }}
            activeCount={activeFilterCount}
            onClear={clearFilters}
            meta={`${detailOrders.length} OS`}
          >
            <FilterDate label="Desde" value={from} onChange={setFrom} />
            <FilterDate label="Hasta" value={to} onChange={setTo} />
            <FilterSelect
              label="Estado OS"
              value={osStateFilter}
              onChange={setOsStateFilter}
              placeholder="Todos"
              width="w-[145px]"
              options={[{ value: "all", label: "Todos" }, ...osStateOptions]}
            />
            <FilterSelect
              label="Técnico"
              value={technicianFilter || "all"}
              onChange={(value) => setTechnicianFilter(value === "all" ? "" : value)}
              placeholder="Todos"
              width="w-[210px]"
              options={[
                { value: "all", label: "Todos" },
                ...technicianOptions.map((technician) => ({ value: technician, label: technician })),
              ]}
            />
          </FiltersBar>

          <TabsContent value="cerradas" className="space-y-3">{resumenPanel}{ordenesPanel}</TabsContent>
          <TabsContent value="abiertas" className="space-y-3">{resumenPanel}{ordenesPanel}</TabsContent>
          <TabsContent value="revisar" className="space-y-3">{ordenesPanel}</TabsContent>
          <TabsContent value="liquidaciones">
            <Panel className="overflow-hidden p-0">
              <div className="border-b px-3 py-2"><SectionHeader title="Liquidaciones registradas" /></div>
              <Table className={tableText}>
                <TableHeader><TableRow>
                  <TableHead className={tableHeadText}>Período</TableHead>
                  <TableHead className={tableHeadText}>Estado</TableHead>
                  <TableHead className={tableHeadText}>Fecha de pago</TableHead>
                  <TableHead className={tableHeadText}>Observación</TableHead>
                  <TableHead className={cn(tableHeadText, "text-right")}>Horas</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {settlements.length === 0 ? <TableRow><TableCell colSpan={5} className="h-20 p-0"><EmptyState title="Sin pagos registrados" className="border-0 bg-transparent" /></TableCell></TableRow> : settlements.map((row) => <TableRow key={row.id}><TableCell>{dateLabel(row.periodo_desde)} — {dateLabel(row.periodo_hasta)}</TableCell><TableCell><Badge variant="outline">{row.estado}</Badge></TableCell><TableCell>{row.pagado_en ? format(new Date(row.pagado_en), "dd/MM/yyyy HH:mm") : "—"}</TableCell><TableCell>{row.observacion ?? "—"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{hours(Number(row.total_horas))}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>
        </>}
      </Tabs>

      <Sheet open={Boolean(selectedOsKey)} onOpenChange={(open) => { if (!open) setSelectedOsKey(null); }}>
        <SheetContent className="w-[min(94vw,640px)] overflow-y-auto p-0 sm:max-w-[640px]">
          {selectedOs && <>
            <SheetHeader className="border-b px-4 py-2.5 pr-12 text-left">
              <SheetTitle className="text-[14px] leading-5">OS {selectedOs.os_numero}</SheetTitle>
              <div className={cn(metaText, "truncate")} title={selectedOs.cliente_nombre ?? "Cliente no informado"}>
                {selectedOs.cliente_nombre ?? "Cliente no informado"} · {selectedOs.sucursal ?? "Sin sucursal"} · {selectedOs.estado_os ?? "Sin estado"} · Chasis {selectedOs.nro_chasis ?? "—"}
              </div>
            </SheetHeader>
            <div className="space-y-2.5 p-4">
              <KpiStrip>
                <KpiItem label="Horas" value={hours(selectedOsTotal)} />
                <KpiItem label="Jornadas" value={selectedOsBlocks} />
                <KpiItem label="Técnicos" value={selectedOsTechnicians} />
                <KpiItem label="Cierre" value={dateLabel(selectedOs.fecha_cierre)} />
              </KpiStrip>

              <div className="overflow-hidden rounded-md border">
                <div className="border-b px-3 py-1.5"><SectionHeader title="Desglose por día" /></div>
                <Table className={cn("w-full table-fixed", tableTextDense)}>
                  <TableHeader><TableRow>
                    <TableHead className={cn(tableHeadText, "w-[88px] whitespace-nowrap px-2 pr-3")}>Fecha</TableHead>
                    <TableHead className={cn(tableHeadText, "w-auto whitespace-nowrap px-2")}>Técnico</TableHead>
                    <TableHead className={cn(tableHeadText, "w-[86px] whitespace-nowrap px-2")}>Horario</TableHead>
                    <TableHead className={cn(tableHeadText, "w-[72px] whitespace-nowrap px-2")}>Tipo</TableHead>
                    <TableHead className={cn(tableHeadText, "w-[70px] whitespace-nowrap px-2")}>Estado</TableHead>
                    <TableHead className={cn(tableHeadText, "w-[72px] whitespace-nowrap px-2")}>Pago</TableHead>
                    <TableHead className={cn(tableHeadText, "w-[66px] whitespace-nowrap px-2 text-right")}>Horas</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {selectedOsDays.map((day) => <Fragment key={day.date}>
                      {day.rows.map((row, index) => <TableRow key={row.id} className="h-8">
                        <TableCell className="overflow-hidden px-2 py-1 pr-3 text-muted-foreground"><span className="block truncate tabular-nums" title={day.date === "sin-fecha" ? "Sin fecha" : dateLabel(day.date)}>{index === 0 ? (day.date === "sin-fecha" ? "s/f" : format(new Date(`${day.date}T00:00:00`), "dd/MM/yy")) : ""}</span></TableCell>
                        <TableCell className="min-w-0 overflow-hidden px-2 py-1">
                          <span className="flex min-w-0 items-center gap-1.5" title={`${row.tecnico_nombre} · ${row.rol_tecnico}${row.motivos_validacion?.length ? ` · ${row.motivos_validacion.join(", ")}` : ""}`}>
                            {row.motivos_validacion?.length ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
                            <span className="truncate font-medium">{row.tecnico_nombre}</span>
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 tabular-nums">{row.hora_inicio?.slice(0, 5) ?? "—"}–{row.hora_fin?.slice(0, 5) ?? "—"}</TableCell>
                        <TableCell className="px-2 py-1"><span className="block truncate" title={row.tipo_tiempo}>{row.tipo_tiempo}</span></TableCell>
                        <TableCell className="px-2 py-1"><Badge variant={row.estado_validacion === "VALIDA" ? "secondary" : row.estado_validacion === "INVALIDA" ? "destructive" : "outline"} className="whitespace-nowrap">{row.estado_validacion === "VALIDA" ? "Válida" : row.estado_validacion === "INVALIDA" ? "Inválida" : "Revisar"}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{paidIds.has(row.id) ? <Badge className="whitespace-nowrap bg-emerald-600">Pagada</Badge> : <span className="text-muted-foreground">Pendiente</span>}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{hours(row.horas_calculadas)}</TableCell>
                      </TableRow>)}
                      <TableRow key={`${day.date}-total`} className="h-7 bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={6} className={cn(metaText, "px-2 py-1")}>Total {day.date === "sin-fecha" ? "sin fecha" : dateLabel(day.date)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{hours(day.total)}</TableCell>
                      </TableRow>
                    </Fragment>)}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

