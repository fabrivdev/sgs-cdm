import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Clock3, CircleCheck, CircleAlert, Target, Percent, CalendarDays } from "lucide-react";
import { PageHeader, PageShell, KpiStrip, KpiItem } from "@/components/layout/AppPrimitives";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { QuickPeriodFilter } from "@/components/filters/QuickPeriodFilter";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Button } from "@/components/ui/button";
import { SalesSectionExportsProvider, SalesSectionExportMenu } from "@/components/ventas/SalesSectionExports";
import { MARCAS, SUCURSALES } from "@/lib/constants";
import { ESTADOS_TRABAJO } from "@/lib/trabajos";
import { displayImportedTechnicianName, matchTechnicianProfile } from "@/lib/technicianMatching";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";
import { useServiceOrders } from "@/features/service-orders/useServiceOrders";
import { validOperationsRange } from "@/features/service-orders/data";
import { emptyOperationsData, useOperationsModel, type OperationsFilters } from "@/features/service-orders/useOperationsModel";
import { OrdersTable } from "@/features/service-orders/OrdersTable";
import { ProductivityTable } from "@/features/service-orders/ProductivityTable";
import type { TechnicianStatus } from "@/features/service-orders/productivityStatus";
import { compliancePeriodMode } from "@/features/service-orders/compliancePeriod";
import { OperationalEvolution } from "@/features/service-orders/OperationalSummary";
import { orderClosureMetrics } from "@/features/service-orders/orderMetrics";
import { billingEfficiency, billingEfficiencyByPeriod, billingKey, billingWarning, efficiencyBillingOrders } from "@/features/service-orders/billing";
import { useOrdersBilling } from "@/features/service-orders/useOrdersBilling";
import { useWorkLog } from "@/features/service-orders/useWorkLog";
import { workedProductivity } from "@/features/service-orders/workedProductivity";
import { productivityPeriod } from "@/features/service-orders/productivityPeriod";
import { operationsDate } from "@/features/service-orders/format";
import { defaultServiceOrdersPeriod } from "@/features/service-orders/defaultPeriod";
import { LEGACY_IMPORT_CUTOFF, NEW_SYSTEM_START } from "@/lib/imports/cutoff";
import { WorkLogTable } from "@/features/service-orders/WorkLogDetails";
import { WorkIssuesList } from "@/features/service-orders/WorkIssuesList";
import { MobileTechnicianMatrix } from "@/features/service-orders/MobileTechnicianMatrix";
import { ComplianceDetailExport } from "@/features/service-orders/ComplianceDetailExport";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody } from "@/components/ui/responsive-drawer";
import { MatrizTécnicosDías } from "@/components/analytics/OperationalCharts";
import { OperationsPanel } from "@/features/service-orders/OperationsPresentation";
import "@/features/service-orders/service-orders.css";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

export default function OrdenesServicio() {
  return <SalesSectionExportsProvider><OrdersWorkspace /></SalesSectionExportsProvider>;
}

export function OrdersWorkspace() {
  const phone = useIsMobile(640);
  const compact = useIsMobile(1024);
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
  const [today] = useState(() => new Date());
  const [tab, setTab] = useState("ordenes");
  const [technicianStatus, setTechnicianStatus] = useState<TechnicianStatus>("activos");
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null);
  const [matrixMetric, setMatrixMetric] = useState<"trabajos" | "horas">("trabajos");
  const defaults = useMemo<OperationsFilters>(() => ({ ...defaultServiceOrdersPeriod(today), periodMode: "mes", q: "", fSucursales: [], fMarcas: [], fTiposTiempo: [], fEstadosTrabajo: [], fTécnicos: [], fResponsablesOS: [], fEstadosOS: [], fOSRubros: [] }), [today]);
  const [filters, setFilters] = useState(defaults);
  const change = <K extends keyof OperationsFilters>(key: K, value: OperationsFilters[K]) => setFilters(previous => ({ ...previous, [key]: value }));
  const valid = validOperationsRange(filters.dateFrom, filters.dateTo);
  const complianceMode = compliancePeriodMode(filters.dateFrom, filters.dateTo, today);
  const modelFilters = useMemo(() => tab === "cumplimiento" ? { ...filters, periodMode: complianceMode } : filters, [tab, filters, complianceMode]);
  const query = useServiceOrders(filters.dateFrom, filters.dateTo);
  // Never render cached figures/exports while refreshing or when a required source failed.
  const blocked = !valid || query.isPending || query.isFetching || query.isError;
  const model = useOperationsModel(blocked ? emptyOperationsData : query.data?.data ?? emptyOperationsData,
    valid ? modelFilters : { ...modelFilters, dateFrom: defaults.dateFrom, dateTo: defaults.dateTo }, matrixMetric, today, tab === "productividad" ? technicianStatus : "todos");
  const data = model.serviciosDashboardData;
  const workPeriod = productivityPeriod(filters.dateFrom, filters.dateTo);
  const workEligible = Boolean(workPeriod.from && workPeriod.to);
  const work = useWorkLog(filters.dateFrom, filters.dateTo, !blocked && tab === "productividad" && workEligible);
  const workReady = !blocked && workEligible && !work.isPending && !work.isFetching && !work.isError;
  const productivity = useMemo(() => workedProductivity(workReady ? work.data ?? [] : [], query.data?.data ?? emptyOperationsData,
    valid ? filters : defaults, technicianStatus), [workReady, work.data, query.data, valid, filters, defaults, technicianStatus]);
  const productivityPartial = workReady && productivity.issues.length > 0;
  const workTechnicianOptions = useMemo(() => {
    const profiles = query.data?.data.profiles ?? [];
    const names = (work.data ?? []).flatMap(log => log.entries.map(entry => profiles.find(profile => profile.id === entry.tecnico_profile_id)?.nombre
      ?? matchTechnicianProfile(entry.tecnico_nombre, profiles)?.nombre ?? displayImportedTechnicianName(entry.tecnico_nombre)));
    return [...new Set([...profiles.map(profile => profile.nombre), ...names].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [query.data, work.data]);
  const efficiencyOrders = useMemo(() => efficiencyBillingOrders(data.ordenes, NEW_SYSTEM_START), [data.ordenes]);
  const efficiencyKeys = useMemo(() => new Set(efficiencyOrders.map(row => billingKey(row.os))), [efficiencyOrders]);
  const billingOrders = tab === "productividad" ? efficiencyOrders : data.ordenes;
  const billingEnabled = !blocked && tab !== "cumplimiento" && billingOrders.length > 0;
  const financial = useOrdersBilling(billingOrders.map(row => row.os), filters.dateTo, billingEnabled);
  const billingLoading = billingEnabled && (financial.isPending || financial.isFetching);
  const billingFailed = billingEnabled && financial.isError;
  const financialRows = useMemo(() => data.ordenes.map(row => ({ ...row,
    billing: billingEnabled && !billingLoading && !financial.isError ? financial.data?.[billingKey(row.os)] ?? null : null,
  })), [data.ordenes, billingEnabled, billingLoading, financial.isError, financial.data]);
  const closure = useMemo(() => orderClosureMetrics(data.ordenes), [data.ordenes]);
  const efficiency = useMemo(() => billingFailed || billingLoading
    ? { percentage: null, incomplete: 0 } : billingEfficiency(financialRows.filter(row => efficiencyKeys.has(billingKey(row.os)))),
    [financialRows, efficiencyKeys, billingFailed, billingLoading]);
  const periodEfficiency = useMemo(() => billingFailed || billingLoading
    ? productivity.evolucion.map(() => null)
    : billingEfficiencyByPeriod(financialRows.filter(row => efficiencyKeys.has(billingKey(row.os))), productivity.evolucion),
    [financialRows, efficiencyKeys, productivity.evolucion, billingFailed, billingLoading]);
  const productivityPeriods = useMemo(() => productivity.evolucion.map((row, index) => ({ ...row, eficiencia: periodEfficiency[index] })),
    [productivity.evolucion, periodEfficiency]);
  const active = [filters.dateFrom !== defaults.dateFrom || filters.dateTo !== defaults.dateTo, filters.q, ...filters.fSucursales, ...filters.fMarcas,
    ...(tab === "cumplimiento" ? [...filters.fEstadosTrabajo, ...filters.fTécnicos] : [...filters.fTiposTiempo, ...filters.fEstadosOS, ...filters.fResponsablesOS, ...filters.fOSRubros])].filter(Boolean).length;
  useEffect(() => {
    setPageFilters({ seccion: tab, fecha_desde: filters.dateFrom, fecha_hasta: filters.dateTo, agrupacion: modelFilters.periodMode, busqueda: filters.q,
      sucursales: filters.fSucursales, marcas: filters.fMarcas,
      tecnicos: tab === "cumplimiento" ? filters.fTécnicos : filters.fResponsablesOS,
      estados: tab === "cumplimiento" ? filters.fEstadosTrabajo : filters.fEstadosOS,
      tipo_tiempo: tab === "cumplimiento" ? undefined : filters.fTiposTiempo, rubros: tab === "cumplimiento" ? undefined : filters.fOSRubros,
      productividad_desde: tab === "productividad" ? workPeriod.from : undefined,
      productividad_hasta: tab === "productividad" ? workPeriod.to : undefined,
      estado_tecnicos: tab === "productividad" ? technicianStatus : undefined });
    return clearPageFilters;
  }, [filters, modelFilters.periodMode, tab, technicianStatus, workPeriod.from, workPeriod.to, setPageFilters, clearPageFilters]);
  const selectTechnician = (name: string) => setSelectedTechnician(name);

  return <PageShell className="service-orders-workspace">
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-3">
      <PageHeader title="Órdenes de servicio"
        tabs={<TabsList aria-label="Vistas de órdenes de servicio"><TabsTrigger value="ordenes">Órdenes</TabsTrigger><TabsTrigger value="productividad">Productividad</TabsTrigger><TabsTrigger value="cumplimiento">Cumplimiento</TabsTrigger></TabsList>} />
      {!blocked && tab === "productividad" && workPeriod.includesLegacy && workEligible && <div className="flex min-h-0 items-center text-[12px]">
        <button type="button" onClick={() => setTab("ordenes")} className="min-h-11 text-primary hover:underline sm:min-h-0">Histórico en Órdenes</button>
      </div>}
      {!blocked && tab !== "cumplimiento" && <KpiStrip>
        {tab === "ordenes" ? [
          <KpiItem key="total" label="Órdenes" value={data.totalOS} icon={<ClipboardList />} />,
          <KpiItem key="abiertas" label={compact ? "Abiertas" : "Abiertas / sin cierre"} value={data.abiertas} tone="info" icon={<Clock3 />} />,
          <KpiItem key="cerradas" label="Cerradas" value={data.cerradas} tone="positive" icon={<CircleCheck />} />,
          <KpiItem key="cierre" label="% de cierre" value={closure.percentage === null ? "—" : `${decimal.format(closure.percentage)}%`} tone="positive" icon={<Percent />} />,
          <KpiItem key="dias" label={compact && !phone ? "Días prom." : "Días de cierre (prom.)"} value={closure.averageDays === null ? "—" : decimal.format(closure.averageDays)} icon={<CalendarDays />} />,
        ] : tab === "productividad" ? [
          <KpiItem key="horas" label="Horas-persona" value={workReady ? decimal.format(productivity.horasPersona) : "—"} icon={<Clock3 />} />,
          <KpiItem key="meta" label="Meta disponible" value={workReady && productivity.capacidad.horasDisponibles > 0 ? decimal.format(productivity.capacidad.horasDisponibles) : "—"} icon={<Target />} />,
          <KpiItem key="porcentaje" label="Productividad" value={workReady && productivity.capacidad.horasDisponibles > 0 ? `${decimal.format(productivity.capacidad.porcentaje)}%` : "—"} icon={<CircleCheck />} />,
          <KpiItem key="eficiencia" label="Eficiencia" value={efficiency.percentage === null ? "—" : `${decimal.format(efficiency.percentage)}%`} icon={<Percent />}
            detail={billingLoading ? "Calculando…" : billingFailed ? undefined : efficiency.incomplete ? `${efficiency.incomplete} OS sin cálculo` : undefined} />,
        ] : null}
      </KpiStrip>}
      <FiltersBar search={{ value: filters.q, onChange: v => change("q", v), placeholder: tab === "cumplimiento" ? "Cliente, trabajo o TR…" : "OS, cliente o chasis…" }} activeCount={active} onClear={() => setFilters(defaults)} secondaryActions={!blocked ? <SalesSectionExportMenu /> : undefined} expanded={<>
        <FilterMultiSelect label="Marca" values={filters.fMarcas} onChange={v => change("fMarcas", v)} options={MARCAS.map(value => ({ value, label: value }))} />
        {tab !== "cumplimiento" && <FilterSelect label="Agrupar" placeholder="Período" value={filters.periodMode} onChange={v => change("periodMode", v as OperationsFilters["periodMode"])} options={[{ value: "dia", label: "Día" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }, { value: "anio", label: "Año" }]} />}
        {tab === "cumplimiento" ? <>
          <FilterMultiSelect label="Estado del trabajo" values={filters.fEstadosTrabajo} onChange={v => change("fEstadosTrabajo", v)} options={ESTADOS_TRABAJO.map(e => ({ value: e.key, label: e.label }))} />
          <FilterMultiSelect label="Técnico" values={filters.fTécnicos} onChange={v => change("fTécnicos", v)} options={(query.data?.data.profiles ?? []).map(p => ({ value: p.id, label: p.nombre }))} />
        </> : <>
          <FilterMultiSelect label="Estado OS" values={filters.fEstadosOS} onChange={v => change("fEstadosOS", v as OperationsFilters["fEstadosOS"])} options={[{ value: "abierta", label: "Abiertas / sin cierre" }, { value: "cerrada", label: "Cerradas" }, { value: "otra", label: "Anuladas / canceladas" }]} />
          <FilterMultiSelect label="Técnico" values={filters.fResponsablesOS} onChange={v => change("fResponsablesOS", v)} options={(tab === "productividad" ? workTechnicianOptions : model.responsablesOSOptions).map(value => ({ value, label: value }))} />
          <FilterMultiSelect label="Tipo de tiempo" values={filters.fTiposTiempo} onChange={v => change("fTiposTiempo", v)} options={["Cliente", "Garantia", "Interno", "Mixto", "Sin tipo"].map(value => ({ value, label: value === "Garantia" ? "Garantía" : value }))} />
          <FilterMultiSelect label="Rubro OS" values={filters.fOSRubros} onChange={v => change("fOSRubros", v as OperationsFilters["fOSRubros"])} options={["Servicio", "Repuestos", "Kilometraje"].map(value => ({ value, label: value }))} />
        </>}
      </>}>
        <QuickPeriodFilter from={filters.dateFrom} to={filters.dateTo} endAtToday={tab !== "cumplimiento"}
          onChange={(dateFrom, dateTo, periodMode) => setFilters(previous => ({ ...previous, dateFrom, dateTo, periodMode }))} />
        <FilterDate label="Desde" value={filters.dateFrom} onChange={v => change("dateFrom", v)} max={filters.dateTo} />
        <FilterDate label="Hasta" value={filters.dateTo} onChange={v => change("dateTo", v)} min={filters.dateFrom} />
        <FilterMultiSelect label="Sucursal" values={filters.fSucursales} onChange={v => change("fSucursales", v)} options={SUCURSALES.map(value => ({ value, label: value }))} />
      </FiltersBar>
      {!valid ? <p role="alert" className="text-sm text-destructive">Seleccioná un rango de fechas válido.</p> : query.isError ? <div role="alert" className="space-y-2 text-sm"><p>No se pudieron cargar todas las fuentes. No se muestran resultados parciales.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Reintentar</Button></div> : blocked ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Cargando órdenes y actividad…</p> : <>
        {billingFailed && <div role="alert" className="flex flex-wrap gap-2 text-[12px] text-amber-800">
          <div className="inline-flex min-h-9 items-center gap-1 rounded-full bg-amber-50 px-2.5">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" /><span>{billingWarning(financial.error)}</span>
            <Button variant="ghost" size="sm" onClick={() => financial.refetch()}>Reintentar</Button>
          </div>
          {tab === "productividad" && productivityPartial && <span className="sr-only">{productivity.issues.length} {productivity.issues.length === 1 ? "incidencia" : "incidencias"} · Revisar</span>}
        </div>}
        <TabsContent value="ordenes" className="min-w-0 space-y-3">
          <OrdersTable rows={financialRows} billingLoading={billingLoading} billingFailed={billingFailed} from={filters.dateFrom} to={filters.dateTo} />
        </TabsContent>
        <TabsContent value="productividad" className="min-w-0 space-y-3">
          {workEligible && query.data?.capacityWarning && <div className="flex flex-wrap items-center gap-2"><p role="alert" className="flex items-center gap-2 text-[12px] text-amber-700"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{query.data.capacityWarning}</p><Button variant="ghost" size="sm" onClick={() => query.refetch()}>Reintentar</Button></div>}
          {!workEligible ? <div role="status" className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">Histórico sin jornadas · hasta {operationsDate(LEGACY_IMPORT_CUTOFF)}<Button variant="ghost" size="sm" onClick={() => setTab("ordenes")}>Ver órdenes</Button></div>
            : work.isError ? <div role="alert" className="text-[12px]">No se pudieron cargar las jornadas trabajadas.<Button variant="ghost" size="sm" onClick={() => work.refetch()}>Reintentar</Button></div>
            : !workReady ? <p role="status" className="py-6 text-center text-[12px] text-muted-foreground">Cargando jornadas trabajadas…</p>
              : <>
                <ProductivityTable rows={productivity.tecnicos} period={productivity.period} onSelect={selectTechnician} status={technicianStatus} onStatusChange={setTechnicianStatus}
                  issuesAction={productivityPartial ? <div role={billingFailed ? undefined : "alert"} className="shrink-0">
                    <Button variant="ghost" size="sm" aria-label={`${productivity.issues.length} ${productivity.issues.length === 1 ? "incidencia" : "incidencias"} · Revisar`} className="min-h-11 gap-1 rounded-md bg-amber-50 px-2 text-[11px] text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={() => setSelectedTechnician("__issues__")}><CircleAlert className="h-3.5 w-3.5 shrink-0" />{productivity.issues.length} · Revisar</Button>
                  </div> : undefined} />
                <OperationalEvolution rows={productivityPeriods} worked onPeriod={(from, to) => setFilters(previous => ({ ...previous, dateFrom: from, dateTo: to }))} />
              </>}
        </TabsContent>
        <TabsContent value="cumplimiento" className="min-w-0">
          <ComplianceDetailExport data={model.matrizTécnicosDías} />
          <OperationsPanel title="Matriz de técnicos por período" padded={!phone}>
            {phone ? <MobileTechnicianMatrix key={`${filters.dateFrom}:${filters.dateTo}:${complianceMode}`} data={model.matrizTécnicosDías} metric={matrixMetric} onMetricChange={setMatrixMetric} />
              : <MatrizTécnicosDías concise key={`${filters.dateFrom}:${filters.dateTo}:${complianceMode}:${model.matrizTécnicosDías.overLimit}:${model.matrizTécnicosDías.blocks.length}`} data={model.matrizTécnicosDías} currentBucketKey={model.matrizTécnicosDías.currentBucketKey} metric={matrixMetric} onMetricChange={setMatrixMetric} onSelectTecnico={id => change("fTécnicos", [id])} onSelectSucursal={s => change("fSucursales", [s])} />}
          </OperationsPanel>
        </TabsContent>
      </>}
    </Tabs>
    <ResponsiveDrawer open={Boolean(selectedTechnician) && tab === "productividad" && workReady} onOpenChange={open => !open && setSelectedTechnician(null)}>
      <ResponsiveDrawerHeader><h2 className="text-[14px] font-semibold">{selectedTechnician === "__issues__" ? "Incidencias de jornadas" : selectedTechnician}</h2></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        <WorkIssuesList issues={selectedTechnician === "__issues__" ? productivity.issues : productivity.issues.filter(row => !row.technician || row.technician === selectedTechnician)} />
        {selectedTechnician && selectedTechnician !== "__issues__" && <WorkLogTable showOS rows={productivity.records.filter(row => row.technician === selectedTechnician)} />}
      </ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </PageShell>;
}
