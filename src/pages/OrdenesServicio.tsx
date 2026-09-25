import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, startOfMonth } from "date-fns";
import { ClipboardList, Clock3, CircleCheck, CircleAlert, Target } from "lucide-react";
import { PageHeader, PageShell, KpiStrip, KpiItem } from "@/components/layout/AppPrimitives";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Button } from "@/components/ui/button";
import { SalesSectionExportsProvider, SalesSectionExportMenu } from "@/components/ventas/SalesSectionExports";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { MARCAS, SUCURSALES } from "@/lib/constants";
import { ESTADOS_TRABAJO } from "@/lib/trabajos";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";
import { useServiceOrders } from "@/features/service-orders/useServiceOrders";
import { validOperationsRange } from "@/features/service-orders/data";
import { emptyOperationsData, useOperationsModel, type OperationsFilters, type OperationsModel } from "@/features/service-orders/useOperationsModel";
import { OrdersTable } from "@/features/service-orders/OrdersTable";
import { ProductivityTable } from "@/features/service-orders/ProductivityTable";
import { ActivityTable } from "@/features/service-orders/ActivityTable";
import { OperationalDistribution, OperationalEvolution } from "@/features/service-orders/OperationalSummary";
import { TecnicosNoRealizadosRanking, MatrizTécnicosDías, EstadoCompacto, CargaSucursalTabla, DistribucionMarca, TrabajosAbiertosList } from "@/components/analytics/OperationalCharts";
import { OperationsPanel } from "@/features/service-orders/OperationsPresentation";
import { ComplianceOverview } from "@/features/service-orders/ComplianceOverview";
import "@/features/service-orders/service-orders.css";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
function Block({ title, children }: { title: string; children: ReactNode }) {
  return <OperationsPanel title={title} padded>{children}</OperationsPanel>;
}
function JobFollowup({ model }: { model: OperationsModel }) {
  const navigate = useNavigate();
  const { hasSectionAccess } = useAuth();
  type Row = OperationsModel["trabajosResumen"][number];
  const columns: CompactListColumn<Row>[] = [
    { key: "ref", label: "OS/TR", kind: "text", width: "w-[15%]", value: r => r.ref, render: r => hasSectionAccess("servicios.trabajos") ? <button type="button" className="min-h-11 text-left hover:text-primary sm:min-h-0" onClick={() => navigate(`/trabajos?trabajo=${encodeURIComponent(r.id)}`)}>{r.ref}</button> : r.ref },
    { key: "cliente", label: "Cliente", kind: "text", width: "w-[30%]", value: r => r.cliente },
    { key: "trabajo", label: "Trabajo", kind: "text", width: "w-[25%]", value: r => r.descripcion },
    { key: "sucursal", label: "Sucursal", kind: "text", width: "w-[15%]", value: r => r.sucursal },
    { key: "estado", label: "Estado", kind: "text", width: "w-[15%]", value: r => r.estado },
    { key: "marca", label: "Marca", kind: "text", width: "w-auto", value: r => r.marca },
    { key: "realizadas", label: "Jornadas realizadas en período", kind: "number", width: "w-auto", value: r => r.realizadasPeriodo },
    { key: "pendientes", label: "Jornadas pendientes en período", kind: "number", width: "w-auto", value: r => r.pendientesPeriodo },
    { key: "total", label: "Jornadas en período", kind: "number", width: "w-auto", value: r => r.totalJornadasPeriodo },
    { key: "horas", label: "Horas realizadas en período", kind: "number", width: "w-auto", value: r => r.horasPeriodo },
    { key: "ultima", label: "Última jornada en período", kind: "date", width: "w-auto", value: r => r.ultimaFechaPeriodo || null },
  ];
  const table = useSectionTable({ rows: model.trabajosResumen, columns, initialSort: { key: "cliente", direction: "asc" }, title: "Seguimiento OS y TR", fileName: "seguimiento-os-tr.xlsx" });
  return <CompactListTable rows={table.ordered} columns={columns.slice(0, 5)} mobileColumns={[
    { ...columns[0], width: "w-[75%]", render: r => <MobileRecord primary={r.cliente} secondary={r.descripcion} context={columns[0].render?.(r)} /> },
    { ...columns[4], width: "w-[25%]" },
  ]} id={r => r.id} label="Seguimiento OS y TR" heading={table.heading} sort={table.sort} status={!table.ordered.length ? "Sin trabajos." : undefined} />;
}

export default function OrdenesServicio() {
  return <SalesSectionExportsProvider><OrdersWorkspace /></SalesSectionExportsProvider>;
}

export function OrdersWorkspace() {
  const phone = useIsMobile(640);
  const navigate = useNavigate();
  const { hasSectionAccess } = useAuth();
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
  const [today] = useState(() => new Date());
  const [tab, setTab] = useState("ordenes");
  const [matrixMetric, setMatrixMetric] = useState<"trabajos" | "horas">("trabajos");
  const defaults = useMemo<OperationsFilters>(() => ({ dateFrom: format(startOfMonth(today), "yyyy-MM-dd"), dateTo: format(today, "yyyy-MM-dd"), periodMode: "mes", q: "", fSucursales: [], fMarcas: [], fTiposTiempo: [], fEstadosTrabajo: [], fTécnicos: [], fResponsablesOS: [], fEstadosOS: [], fOSRubros: [] }), [today]);
  const [filters, setFilters] = useState(defaults);
  const change = <K extends keyof OperationsFilters>(key: K, value: OperationsFilters[K]) => setFilters(previous => ({ ...previous, [key]: value }));
  const valid = validOperationsRange(filters.dateFrom, filters.dateTo);
  const query = useServiceOrders(filters.dateFrom, filters.dateTo);
  // Never render cached figures/exports while refreshing or when a required source failed.
  const blocked = !valid || query.isPending || query.isFetching || query.isError;
  const model = useOperationsModel(blocked ? emptyOperationsData : query.data?.data ?? emptyOperationsData,
    valid ? filters : { ...filters, dateFrom: defaults.dateFrom, dateTo: defaults.dateTo }, matrixMetric, today);
  const data = model.serviciosDashboardData;
  const dates = valid ? `${format(new Date(`${filters.dateFrom}T12:00:00`), "dd/MM/yyyy")} — ${format(new Date(`${filters.dateTo}T12:00:00`), "dd/MM/yyyy")}` : "Período inválido";
  const active = [filters.q, ...filters.fSucursales, ...filters.fMarcas,
    ...(tab === "cumplimiento" ? [...filters.fEstadosTrabajo, ...filters.fTécnicos] : [...filters.fTiposTiempo, ...filters.fEstadosOS, ...filters.fResponsablesOS, ...filters.fOSRubros])].filter(Boolean).length;
  useEffect(() => {
    setPageFilters({ seccion: tab, fecha_desde: filters.dateFrom, fecha_hasta: filters.dateTo, agrupacion: filters.periodMode, busqueda: filters.q,
      sucursales: filters.fSucursales, marcas: filters.fMarcas,
      tecnicos: tab === "cumplimiento" ? filters.fTécnicos : filters.fResponsablesOS,
      estados: tab === "cumplimiento" ? filters.fEstadosTrabajo : filters.fEstadosOS,
      tipo_tiempo: tab === "cumplimiento" ? undefined : filters.fTiposTiempo, rubros: tab === "cumplimiento" ? undefined : filters.fOSRubros });
    return clearPageFilters;
  }, [filters, tab, setPageFilters, clearPageFilters]);
  const selectTechnician = (name: string) => { change("fResponsablesOS", [name]); setTab("ordenes"); };
  const openJob = (id: string) => { if (hasSectionAccess("servicios.trabajos")) navigate(`/trabajos?trabajo=${encodeURIComponent(id)}`); };

  return <PageShell className="service-orders-workspace">
    <PageHeader title="Órdenes de servicio" meta={dates} actions={phone && !blocked ? <SalesSectionExportMenu /> : undefined} />
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-3">
      <TabsList className="flex w-full justify-start overflow-hidden sm:justify-start" aria-label="Vistas de órdenes de servicio"><TabsTrigger value="ordenes">Órdenes</TabsTrigger><TabsTrigger value="productividad">Productividad</TabsTrigger><TabsTrigger value="cumplimiento">Cumplimiento</TabsTrigger></TabsList>
      {!blocked && <KpiStrip>
        {tab === "ordenes" ? [
          <KpiItem key="total" label="Órdenes" value={data.totalOS} icon={<ClipboardList />} />,
          <KpiItem key="abiertas" label={phone ? "Abiertas" : "Abiertas / sin cierre"} value={data.abiertas} tone="info" icon={<Clock3 />} />,
          <KpiItem key="cerradas" label="Cerradas" value={data.cerradas} tone="positive" icon={<CircleCheck />} />,
        ] : tab === "productividad" ? [
          <KpiItem key="horas" label="Horas-persona" value={decimal.format(data.horasPersona)} icon={<Clock3 />} />,
          <KpiItem key="meta" label="Meta disponible" value={data.capacidad.horasDisponibles > 0 ? decimal.format(data.capacidad.horasDisponibles) : "—"} icon={<Target />} />,
          <KpiItem key="porcentaje" label="% de meta" value={data.capacidad.horasDisponibles > 0 ? `${decimal.format(data.capacidad.porcentaje)}%` : "—"} icon={<CircleCheck />} />,
        ] : [
          <KpiItem key="realizadas" label="Realizadas" value={model.jornadasResultadoResumen.realizadas} tone="positive" icon={<CircleCheck />} />,
          <KpiItem key="no-realizadas" label="No realizadas" value={model.jornadasResultadoResumen.noRealizadas} tone="warning" icon={<CircleAlert />} />,
          <KpiItem key="pendientes" label="Pendientes" value={model.jornadasResultadoResumen.pendientes} icon={<Clock3 />} />,
        ]}
      </KpiStrip>}
      <FiltersBar search={{ value: filters.q, onChange: v => change("q", v), placeholder: tab === "cumplimiento" ? "Cliente, trabajo o TR…" : "OS, cliente o chasis…" }} activeCount={active} onClear={() => setFilters(defaults)} secondaryActions={!phone ? <SalesSectionExportMenu /> : undefined} expanded={<>
        <FilterMultiSelect label="Marca" values={filters.fMarcas} onChange={v => change("fMarcas", v)} options={MARCAS.map(value => ({ value, label: value }))} />
        <FilterSelect label="Agrupar" placeholder="Período" value={filters.periodMode} onChange={v => change("periodMode", v as OperationsFilters["periodMode"])} options={[{ value: "dia", label: "Día" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }, { value: "anio", label: "Año" }]} />
        {tab === "cumplimiento" ? <>
          <FilterMultiSelect label="Estado del trabajo" values={filters.fEstadosTrabajo} onChange={v => change("fEstadosTrabajo", v)} options={ESTADOS_TRABAJO.map(e => ({ value: e.key, label: e.label }))} />
          <FilterMultiSelect label="Técnico" values={filters.fTécnicos} onChange={v => change("fTécnicos", v)} options={(query.data?.data.profiles ?? []).map(p => ({ value: p.id, label: p.nombre }))} />
        </> : <>
          <FilterMultiSelect label="Estado OS" values={filters.fEstadosOS} onChange={v => change("fEstadosOS", v as OperationsFilters["fEstadosOS"])} options={[{ value: "abierta", label: "Abiertas / sin cierre" }, { value: "cerrada", label: "Cerradas" }, { value: "otra", label: "Anuladas / canceladas" }]} />
          <FilterMultiSelect label="Técnico" values={filters.fResponsablesOS} onChange={v => change("fResponsablesOS", v)} options={model.responsablesOSOptions.map(value => ({ value, label: value }))} />
          <FilterMultiSelect label="Tipo de tiempo" values={filters.fTiposTiempo} onChange={v => change("fTiposTiempo", v)} options={["Cliente", "Garantia", "Interno", "Mixto", "Sin tipo"].map(value => ({ value, label: value === "Garantia" ? "Garantía" : value }))} />
          <FilterMultiSelect label="Rubro OS" values={filters.fOSRubros} onChange={v => change("fOSRubros", v as OperationsFilters["fOSRubros"])} options={["Servicio", "Repuestos", "Kilometraje"].map(value => ({ value, label: value }))} />
        </>}
      </>}>
        <FilterDate label="Desde" value={filters.dateFrom} onChange={v => change("dateFrom", v)} max={filters.dateTo} />
        <FilterDate label="Hasta" value={filters.dateTo} onChange={v => change("dateTo", v)} min={filters.dateFrom} />
        <FilterMultiSelect label="Sucursal" values={filters.fSucursales} onChange={v => change("fSucursales", v)} options={SUCURSALES.map(value => ({ value, label: value }))} />
      </FiltersBar>
      {!valid ? <p role="alert" className="text-sm text-destructive">Seleccioná un rango de fechas válido.</p> : query.isError ? <div role="alert" className="space-y-2 text-sm"><p>No se pudieron cargar todas las fuentes. No se muestran resultados parciales.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Reintentar</Button></div> : blocked ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Cargando órdenes y actividad…</p> : <>
        <TabsContent value="ordenes" className="min-w-0 space-y-3">
          <OrdersTable rows={data.ordenes} />
          <OperationalDistribution data={data} />
        </TabsContent>
        <TabsContent value="productividad" className="min-w-0 space-y-3">
          {query.data?.capacityWarning && <p role="alert" title={query.data.capacityWarning} className="flex items-center gap-2 text-[12px] text-amber-700"><CircleAlert className="h-3.5 w-3.5" />Meta de productividad no disponible.</p>}
          <ProductivityTable rows={data.tecnicos} onSelect={selectTechnician} />
          <OperationalEvolution rows={data.evolucion} onPeriod={(from, to) => setFilters(previous => ({ ...previous, dateFrom: from, dateTo: to }))} />
        </TabsContent>
        <TabsContent value="cumplimiento" className="min-w-0 space-y-4">
          <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2"><ComplianceOverview model={model} /><Block title="No realizadas por técnico"><TecnicosNoRealizadosRanking rows={model.tecnicosNoRealizados} onSelect={id => change("fTécnicos", [id])} /></Block></div>
          {!phone && <Block title="Matriz de técnicos por período"><MatrizTécnicosDías concise key={`${filters.dateFrom}:${filters.dateTo}:${filters.periodMode}:${model.matrizTécnicosDías.overLimit}:${model.matrizTécnicosDías.blocks.length}`} data={model.matrizTécnicosDías} currentBucketKey={model.matrizTécnicosDías.currentBucketKey} metric={matrixMetric} onMetricChange={setMatrixMetric} onSelectTecnico={id => change("fTécnicos", [id])} onSelectSucursal={s => change("fSucursales", [s])} /></Block>}
          <ActivityTable model={model} />
          <div className="grid min-w-0 gap-4 lg:grid-cols-2"><Block title="Estado de trabajos"><EstadoCompacto flujo={model.flujo} onSelect={s => change("fEstadosTrabajo", s === "all" ? [] : [s])} planificados={model.trabajosPlanificadosPróximoPeriodo} técnicosAsignados={model.técnicosPróximoPeriodo} jornadasPlanificadas={model.jornadasPlanificacion.length} planificacionRango={model.planificacionRango} jornadasPrev={model.jornadasRealizadasPrev.length} horasPrev={model.horasPrev} tecnicosCierreAnterior={model.tecnicosCierreAnterior} cierreAnteriorRango={model.cierreAnteriorRango} /></Block><Block title="Carga por sucursal"><CargaSucursalTabla rows={model.cargaSucursal} onSelect={s => change("fSucursales", [s])} /></Block></div>
          <Block title="Seguimiento OS/TR"><JobFollowup model={model} /></Block>
          <Block title="Trabajos abiertos sin cierre"><TrabajosAbiertosList rows={model.trabajosAbiertosSinCierre} onSelect={row => openJob(row.id)} /></Block>
          <Block title="Distribución por marca"><DistribucionMarca data={model.cargaMarca} selected={filters.fMarcas} onSelect={m => change("fMarcas", [m])} /></Block>
          {hasSectionAccess("servicios.trabajos") && <Link className="inline-flex min-h-11 items-center text-[13px] text-primary" to="/trabajos">Abrir Trabajos</Link>}
        </TabsContent>
      </>}
    </Tabs>
  </PageShell>;
}
