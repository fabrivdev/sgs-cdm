/* eslint-disable @typescript-eslint/no-explicit-any -- las tablas/RPC de esta migración aún no están en los tipos generados de Supabase */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cardLabel, iconSm, kpiValue, metaText, tableHeadText, tableText } from "@/lib/ui-classes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FiltersBar, FilterCustom, FilterDate } from "@/components/filters/FiltersBar";

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
    <Table className={tableText}>
      <TableHeader>
        <TableRow>
          <TableHead className={tableHeadText}>Técnico</TableHead>
          <TableHead className={tableHeadText}>Sucursal</TableHead>
          <TableHead className={cn(tableHeadText, "text-right")}>Cliente</TableHead>
          <TableHead className={cn(tableHeadText, "text-right")}>Garantía</TableHead>
          <TableHead className={cn(tableHeadText, "text-right")}>Interno</TableHead>
          <TableHead className={cn(tableHeadText, "text-right")}>Sin tipo</TableHead>
          <TableHead className={cn(tableHeadText, "text-right")}>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="h-20 p-0"><EmptyState title="Sin horas en el período" className="border-0 bg-transparent" /></TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.key} className="cursor-pointer hover:bg-muted/40" onClick={() => onTechnician(row.technician)}>
            <TableCell className="py-1.5"><div className="font-medium">{row.technician}</div><div className={metaText}>{row.orders.size} OS · {row.lines} jornadas</div></TableCell>
            <TableCell className="py-1.5"><div className="flex flex-wrap gap-1">{row.branches.sort().map((branch) => <Badge key={branch} variant="outline" title={branch}>{branchInitials(branch)}</Badge>)}</div></TableCell>
            <TableCell className="text-right tabular-nums">{hours(row.cliente)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(row.garantia)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(row.interno)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(row.desconocido)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{hours(row.total)}</TableCell>
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

  const eligibleRows = useMemo(() => rows.filter(isActiveTechnician), [isActiveTechnician, rows]);
  const periodRows = useMemo(() => (view === "revisar" ? rows : eligibleRows).filter((row) => {
    if (technicianFilter && row.tecnico_nombre !== technicianFilter) return false;
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
  }), [eligibleRows, from, isActiveTechnician, paidIds, rows, technicianFilter, to, view]);

  const unpaidClosedRows = useMemo(() => periodRows.filter((row) => !paidIds.has(row.id)), [paidIds, periodRows]);
  const payableRows = useMemo(() => unpaidClosedRows.filter((row) => row.estado_validacion === "VALIDA" && Number(row.horas_validas ?? 0) > 0), [unpaidClosedRows]);
  const reviewRows = useMemo(() => periodRows.filter((row) => row.estado_validacion !== "VALIDA"), [periodRows]);
  const summaryRows = useMemo(() => summarize(periodRows, paidIds), [paidIds, periodRows]);
  const closedAll = useMemo(() => eligibleRows.filter((row) => isClosed(row) && row.fecha_cierre && row.fecha_cierre >= from && row.fecha_cierre <= to), [eligibleRows, from, to]);
  const openAll = useMemo(() => eligibleRows.filter((row) => !isClosed(row) && (!row.fecha_inicio || row.fecha_inicio <= to)), [eligibleRows, to]);
  const totalClosed = closedAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalOpen = openAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalPendingPayment = closedAll.filter((row) => !paidIds.has(row.id) && row.estado_validacion === "VALIDA").reduce((sum, row) => sum + Number(row.horas_validas ?? 0), 0);
  const totalReview = rows.filter((row) => !paidIds.has(row.id) && (!isActiveTechnician(row) || row.estado_validacion !== "VALIDA")).length;
  const closedOrderCount = new Set(closedAll.map((row) => row.os_numero)).size;
  const openOrderCount = new Set(openAll.map((row) => row.os_numero)).size;
  const reviewOrderCount = new Set(rows.filter((row) => !paidIds.has(row.id) && (!isActiveTechnician(row) || row.estado_validacion !== "VALIDA")).map((row) => row.os_numero)).size;
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

  const toggleOrder = (order: CommissionOsSummary, checked: boolean) => {
    const orderIds = order.rows.filter((row) => selectableIdSet.has(row.id)).map((row) => row.id);
    setSelected((current) => {
      const next = new Set(current);
      orderIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  return (
    <PageShell>
      <PageHeader
        title="Comisiones"
        meta="Control de horas, validación y liquidación por técnico y orden de servicio."
        actions={<>
          <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={(event) => event.target.files?.[0] && void uploadInitialXml(event.target.files[0])} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()} title="Actualiza únicamente las jornadas de Comisiones; no reimporta clientes, productos, facturación ni el resumen de la OS">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : initialLoadDone ? <FileCheck2 className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
            {initialLoadDone ? "Actualizar jornadas desde XML" : "Carga inicial de OS"}
          </Button>
          <Button variant="outline" size="icon" disabled={loading} onClick={() => void load()} title="Actualizar datos"><RefreshCw className="h-4 w-4" /></Button>
        </>}
      />

      {schemaMissing ? (
        <Panel className="border-amber-300 bg-amber-50 text-amber-950">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5" /><div><div className="font-semibold">Falta aplicar la migración de Comisiones</div><p className="mt-1 text-[12px]">Aplicá el SQL entregado con esta versión y luego presioná actualizar. Ningún dato existente fue modificado.</p></div></div>
        </Panel>
      ) : <>
        <KpiStrip>
          <KpiItem label="Horas cerradas" value={hours(totalClosed)} detail={`${closedOrderCount} OS · ${closedAll.length} jornadas`} tone="info" icon={<CheckCircle2 />} />
          <KpiItem label="Pendientes de pago" value={hours(totalPendingPayment)} detail="Validadas y todavía no liquidadas" tone="positive" icon={<WalletCards />} />
          <KpiItem label="Horas abiertas" value={hours(totalOpen)} detail={`${openOrderCount} OS · ${openAll.length} jornadas`} tone="warning" icon={<Clock3 />} />
          <KpiItem label="Requieren revisión" value={number.format(totalReview)} detail={`${reviewOrderCount} OS, incluida nómina inactiva`} tone={totalReview ? "danger" : "default"} icon={<AlertTriangle />} />
        </KpiStrip>

        <Panel className="flex flex-wrap items-end gap-2.5 py-2.5">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 w-40" /></label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Hasta / corte<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 w-40" /></label>
          {technicianFilter && <Button variant="secondary" size="sm" onClick={() => setTechnicianFilter("")}>Técnico: {technicianFilter} ×</Button>}
          <span className="ml-auto hidden text-[10px] text-muted-foreground lg:block">Cerradas por fecha de cierre · abiertas al corte.</span>
        </Panel>

        <Tabs value={view} onValueChange={(value) => { setView(value as View); setTechnicianFilter(""); }}>
          <TabsList>
            <TabsTrigger value="cerradas">Cerradas</TabsTrigger>
            <TabsTrigger value="abiertas">Abiertas</TabsTrigger>
            <TabsTrigger value="revisar">Revisar <Badge variant="secondary" className="ml-2">{totalReview}</Badge></TabsTrigger>
            <TabsTrigger value="liquidaciones">Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="cerradas" className="space-y-3">
            <Panel className="overflow-hidden p-0"><div className="border-b px-3 py-2"><SectionHeader title="Horas cerradas por técnico y tipo" meta="Seleccioná un técnico para ver sus OS consolidadas." /></div><div className="max-h-[360px] overflow-auto"><SummaryTable rows={summaryRows} onTechnician={setTechnicianFilter} /></div></Panel>
          </TabsContent>
          <TabsContent value="abiertas" className="space-y-3">
            <Panel className="overflow-hidden p-0"><div className="border-b px-3 py-2"><SectionHeader title="Horas abiertas por técnico y tipo" meta={`OS abiertas al ${dateLabel(to)}.`} /></div><div className="max-h-[360px] overflow-auto"><SummaryTable rows={summaryRows} onTechnician={setTechnicianFilter} /></div></Panel>
          </TabsContent>
          <TabsContent value="revisar" className="space-y-3">
            <Panel className="border-amber-200 bg-amber-50/40 text-[12px]">Las horas mostradas fueron recalculadas con inicio y fin. Los técnicos fuera de la nómina activa quedan visibles para auditoría, pero no pueden validarse ni pagarse.</Panel>
          </TabsContent>
          <TabsContent value="liquidaciones">
            <Panel className="p-0">
              <div className="px-3 py-2"><SectionHeader title="Liquidaciones registradas" meta="Cada jornada puede pertenecer a una sola liquidación." /></div>
              <Table><TableHeader><TableRow><TableHead>Período</TableHead><TableHead>Estado</TableHead><TableHead>Fecha de pago</TableHead><TableHead>Observación</TableHead><TableHead className="text-right">Horas</TableHead></TableRow></TableHeader><TableBody>
                {settlements.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Todavía no hay pagos registrados.</TableCell></TableRow> : settlements.map((row) => <TableRow key={row.id}><TableCell>{dateLabel(row.periodo_desde)} — {dateLabel(row.periodo_hasta)}</TableCell><TableCell><Badge variant="outline">{row.estado}</Badge></TableCell><TableCell>{row.pagado_en ? format(new Date(row.pagado_en), "dd/MM/yyyy HH:mm") : "—"}</TableCell><TableCell>{row.observacion ?? "—"}</TableCell><TableCell className="text-right font-semibold">{hours(Number(row.total_horas))}</TableCell></TableRow>)}
              </TableBody></Table>
            </Panel>
          </TabsContent>
        </Tabs>

        {view !== "liquidaciones" && (
          <Panel className="overflow-hidden p-0">
            <div className="border-b px-3 py-2"><SectionHeader
                title={view === "revisar" ? "OS por validar" : view === "abiertas" ? "OS abiertas" : "OS pendientes de liquidación"}
                meta={`${detailOrders.length} OS · ${detailRows.length} jornadas`}
                actions={view === "cerradas" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void markPaid()}><WalletCards className="mr-2 h-4 w-4" />Marcar pagadas ({selected.size})</Button> : view === "revisar" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void validateSelected()}><CheckCircle2 className="mr-2 h-4 w-4" />Validar cálculo ({selected.size})</Button> : undefined}
              /></div>
            <div className="max-h-[480px] overflow-auto"><Table className="min-w-[1080px] text-[11px]">
              <TableHeader><TableRow>
                {view !== "abiertas" && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(selectableIds) : new Set())} /></TableHead>}
                <TableHead className="w-36">Orden</TableHead><TableHead className="min-w-52">Cliente / chasis</TableHead><TableHead className="min-w-48">Equipo técnico</TableHead><TableHead className="w-24">Suc.</TableHead><TableHead className="w-28">Tipo</TableHead><TableHead className="w-40">Período</TableHead><TableHead className="w-20 text-right">Horas</TableHead><TableHead className="w-28">Estado</TableHead><TableHead className="w-24">Pago</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={10} className="h-24 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : detailOrders.length === 0 ? <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No hay órdenes para mostrar.</TableCell></TableRow> : detailOrders.slice(0, 500).map((order) => {
                  const orderIds = order.rows.filter((row) => selectableIdSet.has(row.id)).map((row) => row.id);
                  const orderSelected = orderIds.length > 0 && orderIds.every((id) => selected.has(id));
                  const inactiveTechnician = order.rows.some((row) => !isActiveTechnician(row));
                  const period = order.dateFrom === order.dateTo ? dateLabel(order.dateFrom) : `${dateLabel(order.dateFrom)} – ${dateLabel(order.dateTo)}`;
                  const payment = order.paidCount === order.rows.length ? "Pagada" : order.paidCount > 0 ? "Parcial" : "Pendiente";
                  return <TableRow key={order.key} data-state={orderSelected ? "selected" : undefined} className="h-12">
                    {view !== "abiertas" && <TableCell className="py-1.5"><Checkbox disabled={orderIds.length === 0} checked={orderSelected} onCheckedChange={(checked) => toggleOrder(order, Boolean(checked))} /></TableCell>}
                    <TableCell className="py-1.5"><button type="button" className="font-semibold hover:text-primary hover:underline" onClick={() => setSelectedOsKey(order.key)}>OS {order.osNumber}</button><div className="text-[10px] text-muted-foreground">{order.rows.length} jornadas</div></TableCell>
                    <TableCell className="max-w-64 py-1.5"><div className="truncate font-medium" title={order.client}>{order.client}</div><div className="truncate font-mono text-[10px] text-muted-foreground" title={order.chassis ?? undefined}>Chasis {order.chassis ?? "—"}</div></TableCell>
                    <TableCell className="max-w-56 py-1.5"><div className="truncate font-medium" title={order.technicians.join(", ")}>{order.technicians[0]}{order.technicians.length > 1 ? ` +${order.technicians.length - 1}` : ""}</div>{inactiveTechnician && <div className="text-[10px] text-amber-700">Incluye técnico inactivo</div>}</TableCell>
                    <TableCell className="py-1.5"><div className="flex flex-wrap gap-1">{order.branches.map((branch) => <Badge key={branch} variant="outline" className="px-1.5 py-0 text-[9px]" title={branch}>{branchInitials(branch)}</Badge>)}</div></TableCell>
                    <TableCell className="py-1.5"><div className="truncate" title={order.timeTypes.join(", ")}>{order.timeTypes.join(", ")}</div></TableCell>
                    <TableCell className="py-1.5 tabular-nums">{period}</TableCell>
                    <TableCell className="py-1.5 text-right font-semibold tabular-nums">{hours(order.totalHours)}</TableCell>
                    <TableCell className="py-1.5"><Badge variant={order.validation === "VALIDA" ? "secondary" : order.validation === "INVALIDA" ? "destructive" : "outline"} className="text-[9px]">{order.validation}</Badge></TableCell>
                    <TableCell className="py-1.5">{payment === "Pagada" ? <Badge className="bg-emerald-600 text-[9px]">Pagada</Badge> : payment === "Parcial" ? <Badge variant="outline" className="border-amber-300 text-[9px] text-amber-700">Parcial</Badge> : <span className="text-muted-foreground">Pendiente</span>}</TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table></div>
            {detailOrders.length > 500 && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">Se muestran las primeras 500 OS. Filtrá por técnico para revisar el resto.</div>}
          </Panel>
        )}
      </>}

      <Sheet open={Boolean(selectedOsKey)} onOpenChange={(open) => { if (!open) setSelectedOsKey(null); }}>
        <SheetContent className="w-[min(94vw,680px)] overflow-y-auto p-0 sm:max-w-[680px]">
          {selectedOs && <>
            <SheetHeader className="border-b px-4 py-3 pr-12">
              <SheetTitle>OS {selectedOs.os_numero}</SheetTitle>
              <SheetDescription>{selectedOs.estado_os ?? "Estado no informado"} · {selectedOs.sucursal ?? "Sin sucursal"}</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 p-4 text-[12px]">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-2.5"><div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cliente</div><div className="mt-0.5 font-semibold">{selectedOs.cliente_nombre ?? "No informado"}</div></div>
                <div className="rounded-md border p-2.5"><div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Chasis</div><div className="mt-0.5 font-mono font-semibold">{selectedOs.nro_chasis ?? "No informado"}</div></div>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border">
                <div className="border-r p-2.5"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Horas de la OS</div><div className="mt-0.5 text-lg font-semibold tabular-nums">{hours(selectedOsTotal)}</div></div>
                <div className="border-r p-2.5"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Bloques</div><div className="mt-0.5 text-lg font-semibold tabular-nums">{selectedOsBlocks}</div></div>
                <div className="p-2.5"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Técnicos</div><div className="mt-0.5 text-lg font-semibold tabular-nums">{selectedOsTechnicians}</div></div>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 rounded-md border p-2.5">
                <span className="text-muted-foreground">Cierre de OS</span><span className="font-medium">{dateLabel(selectedOs.fecha_cierre)}</span>
                <span className="text-muted-foreground">Estado</span><span>{selectedOs.estado_os ?? "No informado"}</span>
                <span className="text-muted-foreground">Sucursal</span><span>{selectedOs.sucursal ?? "Sin sucursal"}</span>
              </div>
              <div>
                <div className="mb-2"><div className="font-semibold">Desglose por día</div><p className="text-[11px] text-muted-foreground">Cada bloque horario se cuenta una sola vez; todos los participantes comparten esas horas.</p></div>
                <div className="space-y-2">
                  {selectedOsDays.map((day) => <div key={day.date} className="overflow-hidden rounded-md border">
                    <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                      <span className="font-medium">{day.date === "sin-fecha" ? "Sin fecha" : dateLabel(day.date)}</span>
                      <span className="font-semibold tabular-nums">{hours(day.total)}</span>
                    </div>
                    <div className="divide-y">
                      {day.rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{row.tecnico_nombre} <span className="font-normal text-muted-foreground">· {row.rol_tecnico}</span></div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{row.hora_inicio?.slice(0, 5) ?? "—"}–{row.hora_fin?.slice(0, 5) ?? "—"} · {row.tipo_tiempo} · {paidIds.has(row.id) ? "Pagada" : "Pendiente"}</div>
                          {row.motivos_validacion?.length ? <div className="mt-1 text-[10px] text-amber-700">{row.motivos_validacion.join(", ")}</div> : null}
                        </div>
                        <div className="text-right"><div className="font-semibold tabular-nums">{hours(row.horas_calculadas)}</div><Badge variant={row.estado_validacion === "VALIDA" ? "secondary" : row.estado_validacion === "INVALIDA" ? "destructive" : "outline"} className="mt-1">{row.estado_validacion}</Badge></div>
                      </div>)}
                    </div>
                  </div>)}
                </div>
              </div>
            </div>
          </>}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
