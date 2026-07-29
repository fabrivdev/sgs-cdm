import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock3, Users, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiciosDashboardData } from "./types";

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function stateColor(state: "cerradas" | "abiertas" | "otras") {
  if (state === "cerradas") return "#8eaa38";
  if (state === "abiertas") return "#2f7dcc";
  return "#ef8b18";
}

function timeLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("garant")) return "Garantía";
  if (normalized.includes("intern") || normalized.includes("absor")) return "Interno";
  if (normalized.includes("client") || normalized.includes("factur")) return "Cliente";
  return label;
}

function timeColor(label: string) {
  const normalized = timeLabel(label);
  if (normalized === "Garantía") return "#2f7dcc";
  if (normalized === "Interno") return "#ef8b18";
  return "#8eaa38";
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("cerrad")) return "border-primary/30 bg-primary/10 text-primary";
  if (normalized.includes("anulad") || normalized.includes("cancel")) return "border-muted bg-muted text-muted-foreground";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export function ServiciosDashboard({
  data,
  loading,
  selectedTecnicos,
  selectedEstados,
  selectedTiposTiempo,
  selectedSucursales,
  onSelectTecnico,
  onSelectPeriodo,
  onSelectEstado,
  onSelectTipoTiempo,
  onSelectSucursal,
}: {
  data: ServiciosDashboardData;
  loading: boolean;
  selectedTecnicos: string[];
  selectedEstados: Array<"cerrada" | "abierta" | "otra">;
  selectedTiposTiempo: string[];
  selectedSucursales: string[];
  onSelectTecnico: (tecnico: string) => void;
  onSelectPeriodo: (periodo: ServiciosDashboardData["evolucion"][number]) => void;
  onSelectEstado: (estado: "cerrada" | "abierta" | "otra") => void;
  onSelectTipoTiempo: (tipo: string) => void;
  onSelectSucursal: (sucursal: string) => void;
}) {
  const [showAllTechnicians, setShowAllTechnicians] = useState(false);
  const [evolutionMetric, setEvolutionMetric] = useState<"orders" | "osHours" | "personHours" | "capacity">("orders");
  const [selectedTrendTechnician, setSelectedTrendTechnician] = useState("");

  if (loading) {
    return <div className="rounded-md border px-3 py-12 text-center text-xs text-muted-foreground">Cargando servicios...</div>;
  }

  const closeRate = data.totalOS > 0 ? Math.round((data.cerradas / data.totalOS) * 100) : 0;
  const openRate = data.totalOS > 0 ? Math.round((data.abiertas / data.totalOS) * 100) : 0;
  const otherRate = Math.max(100 - closeRate - openRate, 0);
  const attention = data.sinResponsable + data.otras;
  const evolutionMax = Math.max(
    ...data.evolucion.map((row) => {
      if (evolutionMetric === "osHours") return row.horasOS;
      if (evolutionMetric === "personHours") return row.horasPersona;
      if (evolutionMetric === "capacity") return row.utilizacion;
      return row.cerradas + row.abiertas + row.otras;
    }),
    evolutionMetric === "capacity" ? 100 : 1,
  );
  const branchMax = Math.max(...data.sucursales.map((row) => row.total), 1);
  const timeTotal = data.mixTiempo.reduce((sum, row) => sum + row.total, 0);
  const allTecnicos = data.tecnicos;
  const visibleTecnicos = showAllTechnicians ? allTecnicos : allTecnicos.slice(0, 8);
  const trendTechnician = allTecnicos.find((row) => row.tecnico === selectedTrendTechnician) ?? allTecnicos[0] ?? null;
  const trendMax = Math.max(
    ...(trendTechnician?.evolucion.map((row) => Math.max(row.horas, row.metaHoras)) ?? []),
    1,
  );
  const capacityPercent = Math.round(data.capacidad.porcentaje);

  const kpis = [
    {
      label: "Órdenes del período",
      value: integer.format(data.totalOS),
      detail: `${data.cerradas} cerradas · ${data.abiertas} abiertas · ${data.otras} anuladas`,
      icon: ClipboardList,
      border: "border-t-primary",
      tone: "text-primary",
    },
    {
      label: "Cierre operativo",
      value: `${closeRate}%`,
      detail: `${data.cerradas} de ${data.totalOS} OS cerradas`,
      icon: CheckCircle2,
      border: "border-t-emerald-500",
      tone: "text-emerald-600",
    },
    {
      label: "Horas OS",
      value: `${decimal.format(data.horas)} hs`,
      detail: `${decimal.format(data.horasPersona)} hs-persona · meta individual ${decimal.format(data.metaHorasPeriodo)} hs`,
      icon: Clock3,
      border: "border-t-blue-500",
      tone: "text-blue-600",
    },
    {
      label: "Requieren atención",
      value: integer.format(attention),
      detail: `${data.sinResponsable} sin responsable · ${data.otras} anuladas`,
      icon: AlertTriangle,
      border: "border-t-orange-500",
      tone: "text-orange-600",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={cn("relative min-h-[108px] rounded-md border border-t-2 bg-card p-3.5", kpi.border)}>
              <div className={cn("absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted/70", kpi.tone)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="pr-10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{kpi.label}</div>
              <div className="mt-2 text-xl font-extrabold leading-tight tabular-nums sm:text-2xl">{kpi.value}</div>
              <div className="mt-2 truncate text-[11px] text-muted-foreground" title={kpi.detail}>{kpi.detail}</div>
            </div>
          );
        })}
      </div>

      <section className="rounded-md border bg-card px-3.5 py-3">
        <div className="grid gap-3 md:grid-cols-[minmax(210px,0.8fr)_minmax(260px,1.4fr)_auto] md:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Capacidad estimada</h2>
              <p className="text-[11px] text-muted-foreground">Horas-persona utilizadas sobre la meta del período</p>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
              <span>
                <strong className="text-base tabular-nums">{decimal.format(data.capacidad.horasUtilizadas)} hs</strong>
                <span className="text-muted-foreground"> de {decimal.format(data.capacidad.horasDisponibles)} hs</span>
              </span>
              <strong className="tabular-nums text-primary">{capacityPercent}%</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  capacityPercent >= 100 ? "bg-emerald-500" : capacityPercent >= 75 ? "bg-primary" : "bg-amber-500",
                )}
                style={{ width: `${Math.min(Math.max(capacityPercent, 0), 100)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-2 text-xs md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <Users className="h-4 w-4 text-primary" />
            <span><strong className="tabular-nums">{data.capacidad.tecnicosBase}</strong> técnicos considerados</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
            Detalle individual TOTVS: {decimal.format(data.horasPersonaDesdeDetalle)} hs
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            Atribución completa por OS: {decimal.format(data.horasPersonaDesdeOS)} hs
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {data.capacidad.base === "participantes_filtrados"
            ? "Base: participantes con actividad dentro de los filtros actuales."
            : "Base: técnicos activos actuales más participantes históricos del período."} Cada participante recibe las horas completas de la OS; si TOTVS informa horas individuales, ese detalle prevalece.
        </p>
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <section className="min-w-0 overflow-hidden rounded-md border bg-card p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Evolución de órdenes</h2>
              <p className="text-xs text-muted-foreground">
                {evolutionMetric === "orders"
                  ? "Aperturas y cierres por período"
                  : evolutionMetric === "osHours"
                    ? "Duración de las OS, sin duplicar participantes"
                    : evolutionMetric === "personHours"
                      ? "Horas atribuidas a cada participante"
                      : "Horas-persona utilizadas sobre capacidad estimada"}
              </p>
            </div>
            <div className="inline-flex h-8 overflow-hidden rounded-md border bg-muted/40 text-[10px] font-medium">
              {([
                ["orders", "OS"],
                ["osHours", "Horas OS"],
                ["personHours", "Hs-persona"],
                ["capacity", "% capacidad"],
              ] as const).map(([metric, label]) => (
                <button
                  type="button"
                  key={metric}
                  onClick={() => setEvolutionMetric(metric)}
                  className={cn(
                    "border-r px-2.5 last:border-r-0 hover:bg-accent",
                    evolutionMetric === metric && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {data.evolucion.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">Sin órdenes para los filtros actuales.</div>
          ) : (
            <div className="mt-4 w-full max-w-full overflow-x-auto overflow-y-hidden pb-1">
              <div
                className="grid h-52 shrink-0 items-end gap-3 border-b px-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(data.evolucion.length, 1)}, minmax(0, 1fr))`,
                  width: data.evolucion.length > 12 ? `${data.evolucion.length * 58}px` : "100%",
                  minWidth:
                    data.evolucion.length > 12
                      ? `${data.evolucion.length * 58}px`
                      : data.evolucion.length > 8
                        ? "520px"
                        : "100%",
                }}
              >
                {data.evolucion.map((row) => (
                  <div key={row.key} className="flex h-full flex-col justify-end">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      {evolutionMetric === "orders" ? (
                        (["cerradas", "abiertas", "otras"] as const).map((state) => {
                          const value = row[state];
                          const filterState = state === "cerradas" ? "cerrada" : state === "abiertas" ? "abierta" : "otra";
                          return (
                            <button
                              type="button"
                              key={state}
                              disabled={value === 0}
                              onClick={() => {
                                onSelectPeriodo(row);
                                onSelectEstado(filterState);
                              }}
                              className="group relative flex h-full flex-1 items-end justify-center disabled:pointer-events-none"
                              aria-label={`${row.label}: ${value} ${state}`}
                            >
                              <span
                                className={cn("w-full max-w-7 rounded-t-sm transition-opacity hover:opacity-80", selectedEstados.includes(filterState) && "ring-2 ring-foreground/20")}
                                style={{ height: `${Math.max((value / evolutionMax) * 100, value > 0 ? 4 : 0)}%`, backgroundColor: stateColor(state) }}
                                title={`${value} ${state}`}
                              />
                            </button>
                          );
                        })
                      ) : (() => {
                        const value = evolutionMetric === "osHours"
                          ? row.horasOS
                          : evolutionMetric === "personHours"
                            ? row.horasPersona
                            : row.utilizacion;
                        const unit = evolutionMetric === "capacity" ? "%" : " hs";
                        const barTone = evolutionMetric === "osHours"
                          ? "bg-primary"
                          : evolutionMetric === "personHours"
                            ? "bg-blue-500"
                            : row.utilizacion >= 100
                              ? "bg-emerald-500"
                              : row.utilizacion >= 75
                                ? "bg-primary"
                                : "bg-amber-500";

                        return (
                          <button
                            type="button"
                            onClick={() => onSelectPeriodo(row)}
                            className="relative flex h-full w-full items-end justify-center"
                            aria-label={`${row.label}: ${decimal.format(value)}${unit}`}
                          >
                            <span
                              className={cn(
                                "relative w-full max-w-12 rounded-t-sm transition-opacity hover:opacity-80",
                                barTone,
                              )}
                              style={{
                                height: `${Math.max(
                                  (value / evolutionMax) * 100,
                                  value > 0 ? 4 : 0,
                                )}%`,
                              }}
                              title={`${decimal.format(value)}${unit}`}
                            >
                              {value > 0 && (
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums text-foreground">
                                  {decimal.format(value)}{evolutionMetric === "capacity" ? "%" : ""}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                    <button type="button" onClick={() => onSelectPeriodo(row)} className="h-7 truncate pt-1 text-center text-[10px] text-muted-foreground hover:text-foreground" title={`Filtrar ${row.label}`}>{row.label}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-5 text-[10px] text-muted-foreground">
            {evolutionMetric === "orders" ? (
              <>
                <Legend color="#8eaa38" label="Cerradas" />
                <Legend color="#2f7dcc" label="Abiertas" />
                <Legend color="#ef8b18" label="Anuladas" />
              </>
            ) : evolutionMetric === "osHours" ? (
              <Legend color="#8eaa38" label="Horas OS" />
            ) : evolutionMetric === "personHours" ? (
              <Legend color="#2f7dcc" label="Horas-persona" />
            ) : (
              <Legend color="#8eaa38" label="Uso de capacidad" />
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-card p-3.5">
          <h2 className="text-sm font-semibold">Composición operativa</h2>
          <div className="mt-3 grid grid-cols-[130px_1fr] items-center gap-4">
            <div
              className="relative mx-auto h-28 w-28 rounded-full"
              style={{ background: `conic-gradient(#8eaa38 0 ${closeRate}%, #2f7dcc ${closeRate}% ${closeRate + openRate}%, #ef8b18 ${closeRate + openRate}% 100%)` }}
            >
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-card">
                <strong className="text-xl tabular-nums">{data.totalOS}</strong>
                <span className="text-[9px] uppercase text-muted-foreground">OS</span>
              </div>
            </div>
            <div className="divide-y text-xs">
              <CompositionRow color="#8eaa38" label="Cerradas" value={data.cerradas} percent={closeRate} selected={selectedEstados.includes("cerrada")} onClick={() => onSelectEstado("cerrada")} />
              <CompositionRow color="#2f7dcc" label="Abiertas" value={data.abiertas} percent={openRate} selected={selectedEstados.includes("abierta")} onClick={() => onSelectEstado("abierta")} />
              <CompositionRow color="#ef8b18" label="Anuladas" value={data.otras} percent={otherRate} selected={selectedEstados.includes("otra")} onClick={() => onSelectEstado("otra")} />
            </div>
          </div>
          <div className="mt-4 border-t pt-3">
            <h3 className="text-xs font-semibold">Tipo de tiempo</h3>
            <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-muted">
              {data.mixTiempo.map((row) => (
                <button
                  type="button"
                  key={row.label}
                  onClick={() => onSelectTipoTiempo(row.label)}
                  className={cn("h-full transition-opacity hover:opacity-80", selectedTiposTiempo.some((tipo) => timeLabel(tipo) === timeLabel(row.label)) && "ring-2 ring-inset ring-foreground/30")}
                  style={{ width: `${timeTotal > 0 ? (row.total / timeTotal) * 100 : 0}%`, backgroundColor: timeColor(row.label) }}
                  title={`${timeLabel(row.label)}: ${row.total} OS`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              {data.mixTiempo.map((row) => (
                <button type="button" key={row.label} onClick={() => onSelectTipoTiempo(row.label)} className={cn("rounded px-1 hover:bg-accent", selectedTiposTiempo.some((tipo) => timeLabel(tipo) === timeLabel(row.label)) && "bg-accent font-semibold text-foreground")}>
                  <Legend color={timeColor(row.label)} label={`${timeLabel(row.label)} ${timeTotal > 0 ? Math.round((row.total / timeTotal) * 100) : 0}%`} />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-md border bg-card p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Carga por responsable</h2>
              <p className="text-xs text-muted-foreground">Productividad por horas-persona sobre una meta de {decimal.format(data.metaHorasMensual)} hs mensuales</p>
            </div>
            <div className="flex items-center gap-2">
              {allTecnicos.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllTechnicians((current) => !current)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-accent"
                >
                  {showAllTechnicians ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showAllTechnicians ? "Ver menos" : `Ver todos (${allTecnicos.length})`}
                </button>
              )}
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
          {trendTechnician && (
            <div className="mb-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Evolución individual</div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <strong>{decimal.format(trendTechnician.horas)} hs-persona</strong>
                    <span className="text-muted-foreground">{trendTechnician.totalOS} OS en el período</span>
                    <span className="font-semibold text-primary">
                      {data.metaHorasPeriodo > 0 ? Math.round((trendTechnician.horas / data.metaHorasPeriodo) * 100) : 0}% de meta
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <span className="sr-only">Técnico para evolución</span>
                  <select
                    value={trendTechnician.tecnico}
                    onChange={(event) => setSelectedTrendTechnician(event.target.value)}
                    className="h-8 max-w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/30 sm:w-[260px]"
                  >
                    {allTecnicos.map((row) => (
                      <option key={row.tecnico} value={row.tecnico}>
                        {row.tecnico}{row.activo ? "" : " · Inactivo"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 overflow-x-auto pb-1">
                <div
                  className="grid h-36 items-end gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(trendTechnician.evolucion.length, 1)}, minmax(48px, 1fr))`,
                    minWidth: trendTechnician.evolucion.length > 8 ? `${trendTechnician.evolucion.length * 56}px` : "100%",
                  }}
                >
                  {trendTechnician.evolucion.map((row) => {
                    const usedHeight = Math.max((row.horas / trendMax) * 100, row.horas > 0 ? 3 : 0);
                    const targetHeight = Math.min((row.metaHoras / trendMax) * 100, 100);
                    return (
                      <button
                        type="button"
                        key={row.key}
                        onClick={() => onSelectPeriodo(row)}
                        className="group flex h-full min-w-0 flex-col justify-end rounded px-0.5 pt-5 hover:bg-accent/60"
                        title={`${row.label}: ${decimal.format(row.horas)} hs-persona · meta ${decimal.format(row.metaHoras)} hs`}
                      >
                        <div className="relative flex min-h-0 flex-1 items-end justify-center">
                          <span
                            className="absolute inset-x-1 border-t border-dashed border-orange-500"
                            style={{ bottom: `${targetHeight}%` }}
                          />
                          <span
                            className="relative w-6 rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                            style={{ height: `${usedHeight}%` }}
                          >
                            {row.horas > 0 && (
                              <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums">
                                {decimal.format(row.horas)}
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="mt-1 truncate text-center text-[9px] text-muted-foreground" title={row.label}>{row.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-4 border-t pt-2 text-[10px] text-muted-foreground">
                <Legend color="#8eaa38" label="Hs-persona" />
                <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-orange-500" />Meta estimada</span>
              </div>
            </div>
          )}
          <div className="max-h-[460px] overflow-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(210px,1fr)_54px_64px_64px_70px_150px] gap-2 border-b px-2 pb-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Responsable</span><span className="text-right">OS</span><span className="text-right">Cerradas</span><span className="text-right">Abiertas</span><span className="text-right" title="Cada participante recibe las horas completas de la OS, salvo que TOTVS informe horas individuales.">Hs-persona</span><span>Productividad</span>
              </div>
              {visibleTecnicos.map((row) => {
                const productivity = data.metaHorasPeriodo > 0 ? (row.horas / data.metaHorasPeriodo) * 100 : 0;
                const selected = selectedTecnicos.includes(row.tecnico);
                return (
                  <button
                    type="button"
                    key={row.tecnico}
                    onClick={() => onSelectTecnico(row.tecnico)}
                    className={cn(
                      "grid w-full grid-cols-[minmax(210px,1fr)_54px_64px_64px_70px_150px] items-center gap-2 border-b px-2 py-2 text-left text-xs last:border-b-0 hover:bg-accent",
                      !row.activo && "bg-muted/60 text-muted-foreground",
                      selected && "bg-primary/5",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium" title={row.tecnico}>{row.tecnico}</span>
                      {!row.activo && <Badge variant="outline" className="shrink-0 bg-muted px-1.5 py-0 text-[9px] text-muted-foreground">Inactivo</Badge>}
                    </span>
                    <span className="text-right tabular-nums">{row.totalOS}</span>
                    <span className="text-right tabular-nums">{row.cerradas}</span>
                    <span className="text-right tabular-nums">{row.abiertas}</span>
                    <span className="text-right tabular-nums">{decimal.format(row.horas)}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", productivity >= 100 ? "bg-emerald-500" : productivity >= 75 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.min(productivity, 100)}%` }} />
                      </span>
                      <strong className="w-10 text-right tabular-nums">{Math.round(productivity)}%</strong>
                    </span>
                  </button>
                );
              })}
              {allTecnicos.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Sin responsables para los filtros actuales.</div>}
            </div>
          </div>
        </section>

        <section className="flex h-full min-w-0 flex-col rounded-md border bg-card p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">OS por sucursal</h2>
              <p className="text-xs text-muted-foreground">Distribución por estado</p>
            </div>
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-1 flex-col justify-evenly gap-4 py-2">
            {data.sucursales.slice(0, 7).map((row) => (
              <button type="button" key={row.sucursal} onClick={() => onSelectSucursal(row.sucursal)} className={cn("grid grid-cols-[90px_1fr_38px] items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent", selectedSucursales.includes(row.sucursal) && "bg-primary/5 ring-1 ring-primary/20")}>
                <span className="truncate font-medium" title={row.sucursal}>{row.sucursal}</span>
                <div className="h-4 overflow-hidden rounded-sm bg-muted" style={{ width: `${Math.max((row.total / branchMax) * 100, 4)}%` }}>
                  <div className="flex h-full w-full">
                    <span className="h-full bg-primary" style={{ width: `${row.total > 0 ? (row.cerradas / row.total) * 100 : 0}%` }} />
                    <span className="h-full bg-blue-500" style={{ width: `${row.total > 0 ? (row.abiertas / row.total) * 100 : 0}%` }} />
                    <span className="h-full bg-orange-500" style={{ width: `${row.total > 0 ? (row.otras / row.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <strong className="text-right tabular-nums">{row.total}</strong>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-4 border-t pt-3 text-[10px] text-muted-foreground">
            <Legend color="#8eaa38" label="Cerradas" />
            <Legend color="#2f7dcc" label="Abiertas" />
            <Legend color="#ef8b18" label="Anuladas" />
          </div>
        </section>
      </div>

      <section className="rounded-md border bg-card p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Detalle de órdenes de servicio</h2>
            <p className="text-xs text-muted-foreground">Casos recientes del período</p>
          </div>
          <Badge variant="secondary">{data.ordenes.length} OS</Badge>
        </div>
        <div className="space-y-2 md:hidden">
          {data.ordenes.slice(0, 12).map((row) => (
            <article key={row.key} className="rounded-md border p-3 text-xs">
              <div className="flex items-start justify-between gap-2"><strong className="font-mono">{row.os}</strong><Badge className={statusTone(row.estadoOS)} variant="outline">{row.estadoOS}</Badge></div>
              <div className="mt-1 font-medium">{row.cliente}</div>
              <div className="mt-1 text-muted-foreground">{row.tecnico} · {row.sucursal ?? "Sin sucursal"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{timeLabel(row.tipoTiempo)}</Badge>{row.origen && <Badge variant="outline">Origen: {row.origen}</Badge>}<Badge variant="outline">{decimal.format(row.horas)} hs</Badge><Badge variant="outline">{integer.format(row.km)} km</Badge><Badge variant="secondary">USD {usd.format(row.valorOS)}</Badge></div>
            </article>
          ))}
        </div>
        <div className="hidden max-h-[390px] overflow-auto rounded-md border md:block">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="sticky top-0 bg-muted/95 text-left text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">OS</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Origen</th><th className="px-3 py-2">Apertura</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Hs</th><th className="px-3 py-2 text-right">Km</th><th className="px-3 py-2 text-right">Total OS</th></tr>
            </thead>
            <tbody>
              {data.ordenes.map((row) => (
                <tr key={row.key} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-semibold">{row.os}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={row.cliente}>{row.cliente}</td>
                  <td className="max-w-[210px] truncate px-3 py-2" title={row.tecnico}>{row.tecnico}</td>
                  <td className="px-3 py-2">{row.sucursal ?? "-"}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{timeLabel(row.tipoTiempo)}</Badge></td>
                  <td className="max-w-[150px] truncate px-3 py-2" title={row.origen}>{row.origen || "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.fechaApertura || "-"}</td>
                  <td className="px-3 py-2"><Badge className={statusTone(row.estadoOS)} variant="outline">{row.estadoOS}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{decimal.format(row.horas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{integer.format(row.km)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">USD {usd.format(row.valorOS)}</td>
                </tr>
              ))}
              {data.ordenes.length === 0 && <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Sin órdenes para los filtros actuales.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function CompositionRow({ color, label, value, percent, selected, onClick }: { color: string; label: string; value: number; percent: number; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("grid w-full grid-cols-[1fr_42px_38px] items-center gap-2 rounded px-1 py-2 text-left hover:bg-accent", selected && "bg-primary/5 ring-1 ring-primary/20")}>
      <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>
      <strong className="text-right tabular-nums">{value}</strong>
      <span className="text-right tabular-nums text-muted-foreground">{percent}%</span>
    </button>
  );
}
