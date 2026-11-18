import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader, KpiStrip, KpiItem } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesDataTable, type SalesDisplayColumn } from "@/components/ventas/SalesDataTable";
import { SalesSectionExportsProvider, SalesSectionExportMenu } from "@/components/ventas/SalesSectionExports";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { SUCURSALES } from "@/lib/constants";

type Row = { clave: string; nombre: string | null; descripcion: string | null; actual: number | null; anterior: number | null; antiguo: number | null };
type Report = { anio: number; anios_con_datos: number[]; filas: Row[] };
const money = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("es-PY", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value);
const variation = (row: Row) => row.actual == null || row.anterior == null || row.anterior <= 0 ? null : (row.actual-row.anterior)/row.anterior;
const difference = (row: Row) => row.actual == null || row.anterior == null ? null : row.actual-row.anterior;
function trend(row: Row) {
  const delta = difference(row);
  if (delta == null) return null;
  if (row.anterior === 0 && row.actual! > 0) return "Nueva actividad";
  return delta > 0 ? "En alza" : delta < 0 ? "En baja" : "Estable";
}

export default function RepuestosHistorico() {
  return <SalesSectionExportsProvider><HistoricalWorkspace /></SalesSectionExportsProvider>;
}

function HistoricalWorkspace() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const [cutoff, setCutoff] = useState(today);
  const [view, setView] = useState("clientes");
  const [branch, setBranch] = useState("TODAS");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("todas");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(cutoff) && cutoff >= "2002-01-01" && cutoff <= today;
  const query = useQuery({
    queryKey: ["parts-historical", user?.id, cutoff, view, branch],
    queryFn: async ({ signal }) => {
      // RPC pendiente de incorporación a los tipos generados de la base.
      const { data, error } = await (supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => {
          abortSignal: (signal: AbortSignal) => PromiseLike<{ data: Report; error: { message: string } | null }>;
        };
      }).rpc("repuestos_historico_v1", { p_corte: cutoff, p_vista: view, p_sucursal: branch === "TODAS" ? null : branch }).abortSignal(signal);
      if (error) throw new Error(error.message);
      if (!data || !Array.isArray(data.filas)) throw new Error("No se pudo leer el histórico.");
      return data;
    },
    enabled: valid, retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const rows = (query.data?.filas ?? []).filter(row => {
    const term = search.trim().toLowerCase();
    if (term && ![row.nombre, row.descripcion].some(value => value?.toLowerCase().includes(term))) return false;
    return direction === "todas" || trend(row) === direction;
  });
  const year = query.data?.anio ?? Number(cutoff.slice(0,4));
  const columns: SalesDisplayColumn<Row>[] = [
    { key: "nombre", label: view === "clientes" ? "Cliente" : "Código", kind: "text", value: row => row.nombre, weight: view === "clientes" ? 2.5 : 1.2 },
    ...(view === "repuestos" ? [{ key: "descripcion", label: "Descripción", kind: "text" as const, value: (row: Row) => row.descripcion, weight: 2.3 }] : []),
    ...(["actual", "anterior", "antiguo"] as const).map((key,index) => ({
      key, label: "Ventas " + (year-index), kind: "number" as const, align: "right" as const,
      value: (row: Row) => row[key], render: (row: Row) => money(row[key]), excelFormat: '"$" #,##0.00', weight: 1.3,
    })),
    { key: "diferencia", label: "Variación USD", kind: "number", align: "right", value: difference, render: row => money(difference(row)), excelFormat: '"$" #,##0.00', weight: 1.2 },
    { key: "variacion", label: "Variación %", kind: "number", align: "right", value: variation, render: row => percent(variation(row)), excelFormat: "0.0%" },
    { key: "tendencia", label: "Tendencia", kind: "text", value: trend, render: row => <span className={difference(row) == null ? "" : difference(row)! > 0 ? "text-emerald-600" : difference(row)! < 0 ? "text-destructive" : "text-muted-foreground"}>{trend(row) ?? "—"}</span> },
  ];
  const totals = (field: "actual" | "anterior" | "antiguo") => query.data?.anios_con_datos.includes(year-["actual","anterior","antiguo"].indexOf(field))
    ? rows.reduce((sum,row) => sum+(row[field] ?? 0),0) : null;
  const totalRow: Row = { clave: "total", nombre: null, descripcion: null, actual: totals("actual"), anterior: totals("anterior"), antiguo: totals("antiguo") };
  const ready = valid && query.isSuccess;
  return <PageShell>
    <PageHeader title="Histórico" tabs={<Tabs value={view} onValueChange={setView}><TabsList>
      <TabsTrigger value="clientes">Clientes</TabsTrigger><TabsTrigger value="repuestos">Repuestos</TabsTrigger>
    </TabsList></Tabs>} />
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: view === "clientes" ? "Cliente" : "Código o descripción" }}
      activeCount={[search, branch === "TODAS" ? "" : branch, direction === "todas" ? "" : direction].filter(Boolean).length}
      onClear={() => { setSearch(""); setBranch("TODAS"); setDirection("todas"); setCutoff(today); }}
      secondaryActions={<SalesSectionExportMenu />}>
      <FilterDate label="Comparar hasta" value={cutoff} onChange={setCutoff} max={today} min="2002-01-01" />
      <FilterSelect label="Sucursal" value={branch} onChange={setBranch} placeholder="Todas"
        options={[{ value: "TODAS", label: "Todas" }, ...SUCURSALES.map(value => ({ value, label: value }))]} />
      <FilterSelect label="Tendencia" value={direction} onChange={setDirection} placeholder="Todas"
        options={["todas","En alza","En baja","Estable","Nueva actividad"].map(value => ({ value, label: value === "todas" ? "Todas" : value }))} />
    </FiltersBar>
    {!valid ? <p role="alert" className="text-sm text-destructive">Seleccioná una fecha de corte válida.</p>
      : query.isPending ? <LoadingScreen variant="section" />
      : query.isError ? <div role="alert" className="text-sm">No se pudo cargar el histórico. <Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button></div>
      : ready && <>
        <KpiStrip>
          <KpiItem label={"Ventas " + year} value={money(totalRow.actual)} />
          <KpiItem label={"Ventas " + (year-1)} value={money(totalRow.anterior)} />
          <KpiItem label={"Ventas " + (year-2)} value={money(totalRow.antiguo)} />
          <KpiItem label="Variación" value={percent(variation(totalRow))} />
        </KpiStrip>
        <SalesDataTable key={view + cutoff + branch} title={view === "clientes" ? "Clientes" : "Repuestos"}
          rows={rows} columns={columns} initialSort={{ key: "actual", direction: "desc" }}
          rowKey={row => row.clave} fileName={"historico-" + view + ".xlsx"} sheetName="Histórico"
          empty="Sin movimientos para estos filtros." desktopBreakpoint={640} />
      </>}
  </PageShell>;
}
