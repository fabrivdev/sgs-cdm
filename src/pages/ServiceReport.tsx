import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleHelp } from "lucide-react";
import { PageShell, PageHeader, Panel, SectionHeader, KpiItem, KpiStrip } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadUnifiedCoverage, unifiedCoverageProjection } from "@/lib/unifiedCoverage";
import { cn } from "@/lib/utils";
import { loadReportBilling, loadReportOrders, MIN_YEAR, MONTHS, summarizeReport, TIME_LABELS, TIME_TYPES, yearWindow } from "@/features/service-report/model";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const dollar = (value: number) => value < 0 ? "−$" + integer.format(-value) : "$" + integer.format(value);
const moneyAxis = (value: number) => value ? "$" + number.format(value / 1000) + " mil" : "$0";
const percent = (value: number | null | undefined) => value == null ? "—" : number.format(value) + " %";
const change = (current: number, previous: number) => previous > 0 ? (current / previous - 1) * 100 : null;
const deltaText = (value: number | null) => value == null ? "—" : (value > 0 ? "+" : "") + percent(value);
const tone = (value: number | null) => value == null || value === 0 ? "default" : value > 0 ? "positive" : "danger";
const priorBar = "hsl(var(--muted-foreground) / 0.58)";
const actualBar = "hsl(var(--primary))";
const priorInternal = "hsl(var(--muted-foreground) / 0.24)";
const actualInternal = "hsl(var(--primary) / 0.28)";
const panelGrid = "grid min-w-0 gap-3 xl:grid-cols-2";
type Summary = ReturnType<typeof summarizeReport>;
type Period = Summary["current"];

function plotTitle(title: string) {
  return <SectionHeader title={title} />;
}

function Chart({ title, rows, current, previous, money = false, history = false, singleLabel }: {
  title: string;
  rows: Array<{ name: string; current: number; previous?: number; currentInternal?: number; previousInternal?: number }>;
  current?: number; previous?: number; money?: boolean; history?: boolean; singleLabel?: string;
}) {
  const hasInternal = rows.some(row => row.currentInternal || row.previousInternal);
  const format = money ? dollar : integer.format;
  return <Panel>
    {plotTitle(title)}
    {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para el período.</p> :
      <div className="mt-1 h-[236px] min-w-0" role="img" aria-label={title + ". " + rows.map(row =>
        row.name + ": " + (previous === undefined || row.previous === undefined ? "" : (previous + " " + format(row.previous + (row.previousInternal ?? 0)) + ", ")) +
        (current ?? "") + " " + format(row.current + (row.currentInternal ?? 0))).join("; ")}>
        <ResponsiveContainer width="100%" height="100%" debounce={80}>
          <BarChart data={rows} barGap={3} margin={{ top: 10, right: 4, left: 0, bottom: 0 }} stackOffset="sign">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={5} />
            <YAxis width={money ? 61 : 33} tickFormatter={money ? moneyAxis : integer.format} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip formatter={value => format(Number(value))} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
            <Legend content={() => <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              {previous !== undefined && <span><i className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: priorBar }} />{previous}</span>}
              <span><i className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: actualBar }} />{current ?? singleLabel ?? "Facturado"}</span>
              {hasInternal && <span><i className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: actualInternal }} />Interno sin facturar</span>}
            </div>} />
            {previous !== undefined && <Bar dataKey="previous" name={String(previous)} stackId="previous" fill={priorBar} maxBarSize={34} isAnimationActive={false} />}
            {previous !== undefined && hasInternal && <Bar dataKey="previousInternal" name={"Interno " + previous} stackId="previous" fill={priorInternal} maxBarSize={34} isAnimationActive={false} />}
            <Bar dataKey="current" name={history ? "Facturado" : String(current ?? singleLabel)} stackId="current" fill={actualBar} maxBarSize={34} isAnimationActive={false} />
            {hasInternal && <Bar dataKey="currentInternal" name={history ? "Interno sin facturar" : "Interno " + current} stackId="current" fill={actualInternal} maxBarSize={34} isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      </div>}
  </Panel>;
}

function ComparisonTable({ summary }: { summary: Summary }) {
  const { current, previous } = summary;
  const types = TIME_TYPES.filter(type => type === "Cliente" || type === "Garantia" || type === "Interno" || current.billedType[type] || previous.billedType[type]);
  const rows = [
    ...types.map(type => ({ label: TIME_LABELS[type] + (type === "Garantia" ? " facturada" : ["Cliente", "Interno"].includes(type) ? " facturado" : ""), value: (p: Period) => dollar(p.billedType[type]) })),
    { label: "% facturado a Cliente", value: (p: Period) => percent(p.invoiced ? p.billedType.Cliente / p.invoiced * 100 : null) },
    { label: "Total facturado", value: (p: Period) => dollar(p.invoiced), strong: true },
    { label: "Garantía valorizada en OS", value: (p: Period) => dollar(p.warranty) },
    { label: "Interno valorizado en OS", value: (p: Period) => dollar(p.internal) },
    { label: "Total con interno valorizado", value: (p: Period) => dollar(p.total), strong: true },
  ];
  return <Panel>
    {plotTitle("MO + KM por tipo de tiempo")}
    <table className="mt-1 w-full table-fixed text-xs sm:text-[13px]">
      <thead className="border-b text-muted-foreground"><tr><th scope="col" className="w-1/2 py-2 text-left">Concepto</th><th scope="col" className="text-right">{previous.year}</th><th scope="col" className="pr-1 text-right">{current.year}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className={cn("border-b last:border-0", "strong" in row && row.strong && "bg-primary/10 font-semibold")}>
        <th scope="row" className="px-1 py-1.5 text-left font-medium">{row.label}</th>
        <td className="text-right tabular-nums">{row.value(previous)}</td>
        <td className="pr-1 text-right font-medium tabular-nums">{row.value(current)}</td>
      </tr>)}</tbody>
    </table>
  </Panel>;
}

function HoursTable({ summary }: { summary: Summary }) {
  const { current, previous } = summary;
  const types = TIME_TYPES.filter(type => type === "Cliente" || type === "Garantia" || type === "Interno" || current.hours[type] || previous.hours[type]);
  const maximum = Math.max(1, ...[previous, current].flatMap(period => period.monthly.flatMap(month => types.map(type => month.hours[type]))));
  const color = (hours: number) => hours > 0 ? { backgroundColor: "hsl(var(--primary) / " + (0.04 + (hours / maximum) ** 0.65 * 0.23) + ")" } : undefined;
  const total = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const variance = change(current.totalHours, previous.totalHours);
  return <Panel>
    <SectionHeader title="Horas de OS por mes y tipo de tiempo" actions={<span className={cn("text-xs font-semibold", variance != null && variance > 0 && "text-emerald-700 dark:text-emerald-400", variance != null && variance < 0 && "text-destructive")}>{deltaText(variance)}</span>} />
    {[previous, current].map(period => <div key={period.year} className="mt-3">
      <h3 className="rounded bg-muted px-2 py-1 text-xs font-semibold">{period.year}</h3>
      <table className="hidden w-full table-fixed text-xs tabular-nums lg:table">
        <thead className="text-muted-foreground"><tr><th scope="col" className="w-28 py-2 text-left">Tipo de tiempo</th>{period.monthly.map(month => <th scope="col" key={month.name} className="text-right">{month.name}</th>)}<th scope="col" className="text-right">Total h</th></tr></thead>
        <tbody>{types.map(type => <tr key={type} className="border-t"><th scope="row" className="py-1.5 text-left font-medium">{TIME_LABELS[type]}</th>
          {period.monthly.map(month => <td key={month.name} style={color(month.hours[type])} className="px-1 text-right">{number.format(month.hours[type])}</td>)}
          <td className="px-1 text-right font-semibold">{number.format(period.hours[type])}</td></tr>)}
          <tr className="border-t bg-muted/60 font-semibold"><th scope="row" className="py-1.5 text-left">Total</th>{period.monthly.map(month => <td key={month.name} className="px-1 text-right">{number.format(total(Object.values(month.hours)))}</td>)}<td className="px-1 text-right">{number.format(period.totalHours)}</td></tr>
        </tbody>
      </table>
      <table className="w-full table-fixed text-xs tabular-nums lg:hidden">
        <thead className="text-muted-foreground"><tr><th scope="col" className="py-2 text-left">Mes</th>{types.map(type => <th scope="col" key={type} className="break-words text-right">{TIME_LABELS[type]}</th>)}<th scope="col" className="text-right">Total h</th></tr></thead>
        <tbody>{period.monthly.map(month => <tr key={month.name} className="border-t"><th scope="row" className="py-1.5 text-left font-medium">{month.name}</th>
          {types.map(type => <td key={type} style={color(month.hours[type])} className="text-right">{number.format(month.hours[type])}</td>)}
          <td className="text-right font-medium">{number.format(total(Object.values(month.hours)))}</td></tr>)}
          <tr className="border-t bg-muted/60 font-semibold"><th scope="row" className="py-1.5 text-left">Total</th>{types.map(type => <td key={type} className="text-right">{number.format(period.hours[type])}</td>)}<td className="text-right">{number.format(period.totalHours)}</td></tr>
        </tbody>
      </table>
    </div>)}
  </Panel>;
}

function QueryState({ error, retry }: { error?: boolean; retry: () => void }) {
  return <Panel className="flex flex-col items-center gap-2 py-8 text-center text-sm" >
    {error ? <><p role="alert">No se pudieron cargar los datos del informe.</p><Button variant="outline" size="sm" onClick={retry}>Reintentar</Button></> : <p role="status" className="text-muted-foreground">Cargando informe…</p>}
  </Panel>;
}

function Coverage({ coverage, loading, error, retry, canSeeParts }: {
  coverage?: { service: number | null; parts: number | null; both: number | null; owners: number };
  loading: boolean; error: boolean; retry: () => void; canSeeParts: boolean;
}) {
  if (!coverage && (loading || error)) return <QueryState error={error} retry={retry} />;
  const rows = [{ label: "Servicio", value: coverage?.service }, ...(canSeeParts ? [
    { label: "Repuestos", value: coverage?.parts }, { label: "Servicio o repuestos", value: coverage?.both },
  ] : [])];
  return <Panel>
    <SectionHeader title="Cobertura de posventa" actions={coverage && <span className="text-xs text-muted-foreground">{coverage.owners} clientes del parque</span>} />
    <dl className="mt-2 space-y-4 pb-2">
      {rows.map(row => <div key={row.label}>
        <div className="flex justify-between gap-2 text-sm"><dt>{row.label}</dt><dd className="font-semibold tabular-nums">{percent(row.value)}</dd></div>
        {row.value != null && <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: row.value + "%" }} /></div>}
      </div>)}
    </dl>
  </Panel>;
}

const localNow = () => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit" }).formatToParts();
  return { year: Number(parts.find(part => part.type === "year")?.value), month: Number(parts.find(part => part.type === "month")?.value) };
};

export default function ServiceReport() {
  const { user, hasSectionAccess } = useAuth();
  const now = localNow();
  const lastYear = now.month === 1 ? now.year - 1 : now.year;
  const lastMonth = now.month === 1 ? 12 : now.month - 1;
  const [year, setYear] = useState(lastYear);
  const [month, setMonth] = useState(lastMonth);
  const canBill = hasSectionAccess("servicios.ventas");
  const canCover = hasSectionAccess("parque.maquinas");
  const canSeeParts = hasSectionAccess("repuestos.ventas");
  const [view, setView] = useState(canBill ? "servicios" : "posventa");
  const dates = yearWindow(year, month);
  const orders = useQuery({
    queryKey: ["servicios-informe-os", user?.id, year, month],
    queryFn: ({ signal }) => loadReportOrders(yearWindow(Math.max(MIN_YEAR, year - 2)).from, dates.to, signal),
    staleTime: 60_000,
  });
  const billing = useQuery({
    queryKey: ["servicios-informe-ventas", user?.id, year, month],
    queryFn: ({ signal }) => loadReportBilling(year, month, signal),
    enabled: canBill && view === "servicios",
    staleTime: 60_000,
  });
  const technicians = useQuery({
    queryKey: ["servicios-informe-tecnicos", user?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("servicios_listar_tecnicos_activos").abortSignal(signal);
      if (error) throw error;
      return new Set(data.map(row => row.id)).size;
    },
    enabled: view === "servicios",
    staleTime: 60_000,
  });
  const coverage = useQuery({
    queryKey: ["servicios-informe-cobertura", user?.id, year, month, canSeeParts],
    queryFn: async ({ signal }) => {
      const source = await loadUnifiedCoverage(dates.from, dates.to, signal);
      const project = (parts: ("services" | "parts")[]) => unifiedCoverageProjection(source, dates.from, dates.to, parts)?.percent ?? null;
      return { service: project(["services"]), parts: canSeeParts ? project(["parts"]) : null,
        both: canSeeParts ? project(["services", "parts"]) : null, owners: source.owners.length };
    },
    enabled: canCover && view === "posventa",
    staleTime: 60_000,
  });
  const summary = useMemo(() => summarizeReport(orders.data ?? [], canBill ? billing.data : undefined, year, month),
    [orders.data, canBill, billing.data, year, month]);
  const { current, previous } = summary;
  const monthOptions = MONTHS.slice(0, year === lastYear ? lastMonth : 12)
    .map((label, i) => ({ label, value: String(i + 1) }));
  const years = Array.from({ length: Math.max(1, lastYear - MIN_YEAR + 1) }, (_, i) => lastYear - i);
  const progressRows = (key: "machines" | "customers") => current.monthly.map((m, i) => ({ name: m.name, current: m[key], previous: previous.monthly[i][key] }));
  const totalChange = change(current.total, previous.total);
  const machineChange = change(current.machines, previous.machines);
  const customerChange = change(current.customers, previous.customers);
  const billingView = canBill ? view : "posventa";
  return <Tabs value={billingView} onValueChange={setView} className="min-w-0">
    <PageShell>
      <PageHeader title="Informe" tabs={<TabsList aria-label="Vistas del informe de servicios">
        {canBill && <TabsTrigger value="servicios">Servicios</TabsTrigger>}
        <TabsTrigger value="posventa">Atención de posventa</TabsTrigger>
      </TabsList>} />
      <FiltersBar mobileContext={year + " · Ene–" + MONTHS[month - 1]}>
        <FilterSelect label="Año" placeholder="Año" value={String(year)} options={years.map(y => ({ label: String(y), value: String(y) }))}
          onChange={value => { const selected = Number(value); setYear(selected); if (selected === lastYear) setMonth(m => Math.min(m, lastMonth)); }} />
        <FilterSelect label="Acumulado hasta" placeholder="Mes" value={String(month)} options={monthOptions} onChange={value => setMonth(Number(value))} />
      </FiltersBar>
      {canBill && <TabsContent value="servicios" className="mt-0 space-y-3">
        {!orders.data || !billing.data ? <QueryState error={orders.isError || billing.isError} retry={() => { void orders.refetch(); void billing.refetch(); }} /> : <>
          <KpiStrip>
            <KpiItem label={"Total MO + KM · " + previous.year} value={dollar(previous.total)} />
            <KpiItem label={"Total MO + KM · " + current.year} value={dollar(current.total)} />
            <KpiItem label="Variación interanual" value={deltaText(totalChange)} tone={tone(totalChange)} />
            <KpiItem label="Técnicos activos hoy" value={technicians.data ?? (technicians.isPending ? "…" : "—")}
              detail={technicians.isError ? <button className="underline" onClick={() => void technicians.refetch()}>Reintentar</button> : undefined} />
          </KpiStrip>
          <div className={panelGrid}>
            <Chart title="MO + KM por mes" money current={year} previous={year - 1} rows={current.monthly.map((row, i) => ({
              name: row.name, current: row.invoiced, currentInternal: row.internal,
              previous: previous.monthly[i].invoiced, previousInternal: previous.monthly[i].internal,
            }))} />
            <ComparisonTable summary={summary} />
          </div>
          <HoursTable summary={summary} />
          <div className={panelGrid}>
            <Chart title="Evolución anual" money history rows={summary.history.map(row => ({ name: row.name, current: row.invoiced, currentInternal: row.internal }))} />
            <Panel><SectionHeader title="Técnicos con horas en OS" /><dl className="mt-4 grid grid-cols-2 gap-3 text-center">
              {[previous, current].map(period => <div key={period.year} className="rounded-lg bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">{period.year}</dt><dd className="mt-1 text-xl font-semibold">{period.technicians}</dd>
              </div>)}
            </dl></Panel>
          </div>
        </>}
      </TabsContent>}
      <TabsContent value="posventa" className="mt-0 space-y-3">
        {!orders.data ? <QueryState error={orders.isError} retry={() => void orders.refetch()} /> : <>
          <KpiStrip>
            <KpiItem label="Máquinas atendidas" value={current.machines} detail={deltaText(machineChange) + " interanual"} tone={tone(machineChange)} />
            <KpiItem label="Clientes externos atendidos" value={current.customers} detail={deltaText(customerChange) + " interanual"} tone={tone(customerChange)} />
            <KpiItem label="Clientes nuevos en servicio" value={current.newCustomers ?? "—"}
              detail={current.newCustomers !== null ? "Sin OS registrada en " + previous.year : "Sin base de comparación"} icon={<CircleHelp aria-hidden />} />
            {canCover && <KpiItem label="Cobertura de servicio" value={coverage.isPending ? "…" : percent(coverage.data?.service)} />}
          </KpiStrip>
          <div className={panelGrid}>
            <Chart title="Máquinas atendidas · acumulado" rows={progressRows("machines")} current={year} previous={previous.hasOrders ? year - 1 : undefined} />
            <Chart title="Clientes atendidos · acumulado" rows={progressRows("customers")} current={year} previous={previous.hasOrders ? year - 1 : undefined} />
            <Chart title="Clientes nuevos en servicio" singleLabel={String(year)}
              rows={current.newCustomers === null ? [] : current.monthly.map(row => ({ name: row.name, current: row.newCustomers }))} />
            {canCover && <Coverage coverage={coverage.data} error={coverage.isError} loading={coverage.isPending}
              retry={() => void coverage.refetch()} canSeeParts={canSeeParts} />}
          </div>
        </>}
      </TabsContent>
    </PageShell>
  </Tabs>;
}
