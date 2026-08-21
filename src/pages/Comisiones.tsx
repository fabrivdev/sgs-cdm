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
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type View = "cerradas" | "abiertas" | "revisar" | "liquidaciones";

interface CommissionRow {
  id: string;
  sucursal: string | null;
  os_numero: string;
  estado_os: string | null;
  fecha_cierre: string | null;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  fecha_fin: string | null;
  hora_fin: string | null;
  tecnico_codigo: string | null;
  tecnico_nombre: string;
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
  branch: string;
  cliente: number;
  garantia: number;
  interno: number;
  desconocido: number;
  total: number;
  lines: number;
}

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const todayIso = () => format(new Date(), "yyyy-MM-dd");
const monthStartIso = () => format(startOfMonth(new Date()), "yyyy-MM-dd");
const hours = (value: number | null | undefined) => value == null ? "—" : `${number.format(value)} h`;
const dateLabel = (value: string | null) => value ? format(new Date(`${value}T12:00:00`), "dd/MM/yyyy") : "—";

function isClosed(row: CommissionRow) {
  return String(row.estado_os ?? "").toLowerCase().includes("cerrad") || Boolean(row.fecha_cierre);
}

function summarize(rows: CommissionRow[], paidIds: Set<string>) {
  const grouped = new Map<string, TechnicianSummary>();
  for (const row of rows) {
    const key = `${row.tecnico_nombre}|${row.sucursal ?? ""}`;
    const current = grouped.get(key) ?? {
      key,
      technician: row.tecnico_nombre,
      branch: row.sucursal ?? "Sin sucursal",
      cliente: 0,
      garantia: 0,
      interno: 0,
      desconocido: 0,
      total: 0,
      lines: 0,
    };
    const value = Number((paidIds.has(row.id) ? row.horas_validas : row.horas_calculadas ?? row.horas_validas) ?? 0);
    if (row.tipo_tiempo === "Cliente") current.cliente += value;
    else if (row.tipo_tiempo === "Garantia") current.garantia += value;
    else if (row.tipo_tiempo === "Interno") current.interno += value;
    else current.desconocido += value;
    current.total += value;
    current.lines += 1;
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total || a.technician.localeCompare(b.technician));
}

function SummaryTable({ rows, onTechnician }: { rows: TechnicianSummary[]; onTechnician: (name: string) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Técnico</TableHead>
          <TableHead>Sucursal</TableHead>
          <TableHead className="text-right">Cliente</TableHead>
          <TableHead className="text-right">Garantía</TableHead>
          <TableHead className="text-right">Interno</TableHead>
          <TableHead className="text-right">Sin tipo</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No hay horas para el período seleccionado.</TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.key} className="cursor-pointer" onClick={() => onTechnician(row.technician)}>
            <TableCell><div className="font-medium">{row.technician}</div><div className="text-[10px] text-muted-foreground">{row.lines} jornadas</div></TableCell>
            <TableCell>{row.branch}</TableCell>
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
  const [view, setView] = useState<View>("cerradas");
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [journeys, detailResult, settlementResult, initialResult] = await Promise.all([
        cargarTodo<CommissionRow>(
          (supabase.from("comisiones_jornadas" as any) as any)
            .select("id,sucursal,os_numero,estado_os,fecha_cierre,fecha_inicio,hora_inicio,fecha_fin,hora_fin,tecnico_codigo,tecnico_nombre,rol_tecnico,tipo_tiempo,horas_reportadas,horas_calculadas,horas_validas,estado_validacion,motivos_validacion")
            .eq("vigente", true)
            .order("fecha_inicio", { ascending: false }),
        ),
        cargarTodo<{ jornada_id: string }>((supabase.from("comisiones_liquidacion_detalle" as any) as any).select("jornada_id")),
        cargarTodo<Settlement>((supabase.from("comisiones_liquidaciones" as any) as any).select("id,periodo_desde,periodo_hasta,estado,total_horas,observacion,pagado_en").order("pagado_en", { ascending: false })),
        (supabase.from("importaciones") as any).select("id").eq("origen_sistema", "comisiones_os_backfill").gt("insertados", 0).limit(1),
      ]);
      setRows(journeys);
      setPaidIds(new Set(detailResult.map((row) => row.jornada_id)));
      setSettlements(settlementResult);
      setInitialLoadDone(Boolean(initialResult.data?.length));
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

  const periodRows = useMemo(() => rows.filter((row) => {
    if (technicianFilter && row.tecnico_nombre !== technicianFilter) return false;
    if (view === "abiertas") {
      return !isClosed(row) && (!row.fecha_inicio || row.fecha_inicio <= to);
    }
    if (view === "revisar") {
      return row.estado_validacion !== "VALIDA" && (!row.fecha_inicio || row.fecha_inicio <= to);
    }
    if (!isClosed(row) || !row.fecha_cierre) return false;
    return row.fecha_cierre >= from && row.fecha_cierre <= to;
  }), [from, rows, technicianFilter, to, view]);

  const unpaidClosedRows = useMemo(() => periodRows.filter((row) => !paidIds.has(row.id)), [paidIds, periodRows]);
  const payableRows = useMemo(() => unpaidClosedRows.filter((row) => row.estado_validacion === "VALIDA" && Number(row.horas_validas ?? 0) > 0), [unpaidClosedRows]);
  const reviewRows = useMemo(() => periodRows.filter((row) => row.estado_validacion !== "VALIDA"), [periodRows]);
  const summaryRows = useMemo(() => summarize(periodRows, paidIds), [paidIds, periodRows]);
  const closedAll = useMemo(() => rows.filter((row) => isClosed(row) && row.fecha_cierre && row.fecha_cierre >= from && row.fecha_cierre <= to), [from, rows, to]);
  const openAll = useMemo(() => rows.filter((row) => !isClosed(row) && (!row.fecha_inicio || row.fecha_inicio <= to)), [rows, to]);
  const totalClosed = closedAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalOpen = openAll.reduce((sum, row) => sum + Number(row.horas_calculadas ?? 0), 0);
  const totalPendingPayment = closedAll.filter((row) => !paidIds.has(row.id) && row.estado_validacion === "VALIDA").reduce((sum, row) => sum + Number(row.horas_validas ?? 0), 0);
  const totalReview = rows.filter((row) => row.estado_validacion !== "VALIDA").length;

  const toggle = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });

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
      toast.error(String((error as { message?: string })?.message ?? error));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const detailRows = view === "cerradas" ? unpaidClosedRows : view === "revisar" ? reviewRows : periodRows;
  const selectableIds = view === "cerradas" ? payableRows.map((row) => row.id) : view === "revisar" ? reviewRows.filter((row) => Number(row.horas_calculadas ?? 0) > 0 && row.estado_validacion !== "INVALIDA").map((row) => row.id) : [];
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  return (
    <PageShell>
      <PageHeader
        title="Comisiones"
        meta="Horas de técnicos recalculadas desde las marcas de tiempo de cada OS. Acceso exclusivo para administradores."
        actions={<>
          <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={(event) => event.target.files?.[0] && void uploadInitialXml(event.target.files[0])} />
          <Button variant="outline" size="sm" disabled={busy || initialLoadDone} onClick={() => fileRef.current?.click()} title={initialLoadDone ? "La carga histórica inicial ya fue realizada" : "Solo completa el ledger de comisiones; no reimporta otras tablas"}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : initialLoadDone ? <FileCheck2 className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
            {initialLoadDone ? "Carga inicial realizada" : "Carga inicial de OS"}
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
          <KpiItem label="Horas cerradas" value={hours(totalClosed)} detail={`${closedAll.length} jornadas en el rango`} tone="info" icon={<CheckCircle2 />} />
          <KpiItem label="Pendientes de pago" value={hours(totalPendingPayment)} detail="Validadas y todavía no liquidadas" tone="positive" icon={<WalletCards />} />
          <KpiItem label="Horas abiertas" value={hours(totalOpen)} detail={`${openAll.length} jornadas al corte`} tone="warning" icon={<Clock3 />} />
          <KpiItem label="Requieren revisión" value={number.format(totalReview)} detail="Diferencia, falta o error de horario" tone={totalReview ? "danger" : "default"} icon={<AlertTriangle />} />
        </KpiStrip>

        <Panel className="flex flex-wrap items-end gap-3 py-2.5">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Desde<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 w-40" /></label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Hasta / corte<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 w-40" /></label>
          {technicianFilter && <Button variant="secondary" size="sm" onClick={() => setTechnicianFilter("")}>Técnico: {technicianFilter} ×</Button>}
          <span className="ml-auto text-[11px] text-muted-foreground">Las cerradas usan fecha de cierre; las abiertas son una fotografía al corte.</span>
        </Panel>

        <Tabs value={view} onValueChange={(value) => { setView(value as View); setTechnicianFilter(""); }}>
          <TabsList>
            <TabsTrigger value="cerradas">Cerradas</TabsTrigger>
            <TabsTrigger value="abiertas">Abiertas</TabsTrigger>
            <TabsTrigger value="revisar">Revisar <Badge variant="secondary" className="ml-2">{totalReview}</Badge></TabsTrigger>
            <TabsTrigger value="liquidaciones">Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="cerradas" className="space-y-3">
            <Panel className="p-0"><div className="px-3 py-2"><SectionHeader title="Horas cerradas por técnico y tipo" meta="Seleccioná un técnico para filtrar el detalle." /></div><SummaryTable rows={summaryRows} onTechnician={setTechnicianFilter} /></Panel>
          </TabsContent>
          <TabsContent value="abiertas" className="space-y-3">
            <Panel className="p-0"><div className="px-3 py-2"><SectionHeader title="Horas abiertas por técnico y tipo" meta={`OS abiertas al ${dateLabel(to)}.`} /></div><SummaryTable rows={summaryRows} onTechnician={setTechnicianFilter} /></Panel>
          </TabsContent>
          <TabsContent value="revisar" className="space-y-3">
            <Panel className="border-amber-200 bg-amber-50/40 text-[12px]">Las horas mostradas fueron recalculadas con inicio y fin. Validar confirma ese cálculo; las jornadas inválidas deben corregirse en el origen.</Panel>
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
          <Panel className="p-0">
            <div className="px-3 py-2"><SectionHeader
                title={view === "revisar" ? "Jornadas por validar" : view === "abiertas" ? "Detalle de horas abiertas" : "Detalle pendiente de liquidación"}
                meta={`${detailRows.length} registros`}
                actions={view === "cerradas" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void markPaid()}><WalletCards className="mr-2 h-4 w-4" />Marcar pagadas ({selected.size})</Button> : view === "revisar" ? <Button size="sm" disabled={busy || selected.size === 0} onClick={() => void validateSelected()}><CheckCircle2 className="mr-2 h-4 w-4" />Validar cálculo ({selected.size})</Button> : undefined}
              /></div>
            <Table>
              <TableHeader><TableRow>
                {view !== "abiertas" && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(selectableIds) : new Set())} /></TableHead>}
                <TableHead>OS / técnico</TableHead><TableHead>Estado</TableHead><TableHead>Tipo</TableHead><TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead className="text-right">Reportada</TableHead><TableHead className="text-right">Calculada</TableHead><TableHead>Pago</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="h-24 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : detailRows.length === 0 ? <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No hay registros para mostrar.</TableCell></TableRow> : detailRows.slice(0, 500).map((row) => {
                  const selectable = selectableIds.includes(row.id);
                  return <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                    {view !== "abiertas" && <TableCell><Checkbox disabled={!selectable} checked={selected.has(row.id)} onCheckedChange={(checked) => toggle(row.id, Boolean(checked))} /></TableCell>}
                    <TableCell><div className="font-medium">OS {row.os_numero}</div><div className="text-[10px] text-muted-foreground">{row.tecnico_nombre} · {row.rol_tecnico} · {row.sucursal ?? "Sin sucursal"}</div></TableCell>
                    <TableCell><Badge variant={row.estado_validacion === "VALIDA" ? "secondary" : row.estado_validacion === "INVALIDA" ? "destructive" : "outline"}>{row.estado_validacion}</Badge>{row.motivos_validacion?.length ? <div className="mt-1 max-w-56 text-[10px] text-muted-foreground">{row.motivos_validacion.join(", ")}</div> : null}</TableCell>
                    <TableCell>{row.tipo_tiempo}</TableCell>
                    <TableCell>{dateLabel(row.fecha_inicio)} {row.hora_inicio?.slice(0, 5) ?? ""}</TableCell>
                    <TableCell>{dateLabel(row.fecha_fin)} {row.hora_fin?.slice(0, 5) ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours(row.horas_reportadas)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{hours(row.horas_calculadas)}</TableCell>
                    <TableCell>{paidIds.has(row.id) ? <Badge className="bg-emerald-600">Pagada</Badge> : <span className="text-muted-foreground">Pendiente</span>}</TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
            {detailRows.length > 500 && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">Se muestran los primeros 500 registros. Filtrá por técnico para revisar el resto.</div>}
          </Panel>
        )}
      </>}
    </PageShell>
  );
}
