import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Gauge,
  MapPin,
  Timer,
  UserRound,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiciosDashboardData } from "./types";

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const STATE_COLORS = {
  cerradas: "#8eaa38",
  abiertas: "#2f7dcc",
  otras: "#ef8b18",
} as const;

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
  if (normalized.includes("anulad") || normalized.includes("cancel")) return "border-orange-200 bg-orange-50 text-orange-700";
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
  onSelectPeriodo: (periodo: Pick<ServiciosDashboardData["evolucion"][number], "key" | "label" | "dateFrom" | "dateTo">) => void;
  onSelectEstado: (estado: "cerrada" | "abierta" | "otra") => void;
  onSelectTipoTiempo: (tipo: string) => void;
  onSelectSucursal: (sucursal: string) => void;
}) {
  const [showAllTechnicians, setShowAllTechnicians] = useState(false);
  const [evolutionMetric, setEvolutionMetric] = useState<"orders" | "hours">("orders");
  const [orderPage, setOrderPage] = useState(0);

  if (loading) {
    return (
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-md border bg-muted/40" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-md border bg-muted/30" />
      </div>
    );
  }

  const closeRate = data.totalOS > 0 ? Math.round((data.cerradas / data.totalOS) * 100) : 0;
  const openRate = data.totalOS > 0 ? Math.round((data.abiertas / data.totalOS) * 100) : 0;
  const otherRate = Math.max(100 - closeRate - openRate, 0);
  const capacityPercent = Math.round(data.capacidad.porcentaje);
  const hoursCloseRate = data.horas > 0 ? Math.round((data.horasCerradas / data.horas) * 100) : 0;
  const evolutionMax = Math.max(
    ...data.evolucion.map((row) => evolutionMetric === "hours" ? row.horasOS : row.cerradas + row.abiertas + row.otras),
    1,
  );
  const branchMax = Math.max(...data.sucursales.map((row) => row.total), 1);
  const timeTotal = data.mixTiempo.reduce((sum, row) => sum + row.total, 0);
  const visibleTecnicos = showAllTechnicians ? data.tecnicos : data.tecnicos.slice(0, 5);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(data.ordenes.length / pageSize));
  const safePage = Math.min(orderPage, pageCount - 1);
  const visibleOrders = data.ordenes.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageStart = data.ordenes.length === 0 ? 0 : safePage * pageSize + 1;
  const pageEnd = Math.min((safePage + 1) * pageSize, data.ordenes.length);

  const kpis = [
    {
      label: "Órdenes del período",
      value: integer.format(data.totalOS),
      detail: `${data.cerradas} cerradas · ${data.abiertas} abiertas · ${data.otras} anuladas`,
      icon: ClipboardCheck,
      tone: "text-primary",
      iconBg: "bg-primary/10",
      border: "border-t-primary",
    },
    {
      label: "Cierre operativo",
      value: `${closeRate}%`,
      detail: `${data.cerradas} de ${data.totalOS} OS cerradas`,
      icon: CheckCircle2,
      tone: "text-emerald-700",
      iconBg: "bg-emerald-50",
      border: "border-t-emerald-500",
    },
    {
      label: "Productividad",
      value: `${capacityPercent}%`,
      detail: `${decimal.format(data.capacidad.horasUtilizadas)} de ${decimal.format(data.capacidad.horasDisponibles)} hs disponibles`,
      icon: BarChart3,
      tone: "text-blue-700",
      iconBg: "bg-blue-50",
      border: "border-t-blue-500",
    },
    {
      label: "Cierre por horas",
      value: `${hoursCloseRate}%`,
      detail: `${decimal.format(data.horasCerradas)} de ${decimal.format(data.horas)} hs en OS cerradas`,
      icon: Gauge,
      tone: "text-orange-700",
      iconBg: "bg-orange-50",
      border: "border-t-orange-500",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <section key={kpi.label} className={cn("relative min-h-[110px] rounded-md border border-t-2 bg-card p-3.5", kpi.border)}>
              <span className={cn("absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md", kpi.iconBg, kpi.tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="pr-11 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{kpi.label}</div>
              <div className="mt-2 text-[25px] font-extrabold leading-none tabular-nums">{kpi.value}</div>
              <div className="mt-2 line-clamp-2 text-[10px] text-muted-foreground" title={kpi.detail}>{kpi.detail}</div>
            </section>
          );
        })}
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <section className="min-w-0 overflow-hidden rounded-md border bg-card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Evolución de órdenes</h2>
              <p className="text-[11px] text-muted-foreground">
                {evolutionMetric === "orders" ? "Órdenes por estado y período" : "Horas registradas por período"}
              </p>
            </div>
            <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border bg-muted/30 text-[10px] font-semibold">
              <button type="button" onClick={() => setEvolutionMetric("orders")} className={cn("px-4 hover:bg-accent", evolutionMetric === "orders" && "bg-primary text-primary-foreground hover:bg-primary")}>OS</button>
              <button type="button" onClick={() => setEvolutionMetric("hours")} className={cn("border-l px-4 hover:bg-accent", evolutionMetric === "hours" && "bg-primary text-primary-foreground hover:bg-primary")}>Horas</button>
            </div>
          </div>

          {data.evolucion.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">Sin órdenes para los filtros actuales.</div>
          ) : (
            <div className="mt-3 max-w-full overflow-x-auto overflow-y-hidden pb-1">
              <div
                className="grid h-[220px] shrink-0 items-end gap-2 border-b px-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(data.evolucion.length, 1)}, minmax(42px, 1fr))`,
                  width: data.evolucion.length > 12 ? `${data.evolucion.length * 58}px` : "100%",
                  minWidth: data.evolucion.length > 8 ? "560px" : "100%",
                }}
              >
                {data.evolucion.map((row) => {
                  const total = row.cerradas + row.abiertas + row.otras;
                  const value = evolutionMetric === "hours" ? row.horasOS : total;
                  const height = value > 0 ? Math.max((value / evolutionMax) * 100, 4) : 0;
                  return (
                    <button
                      type="button"
                      key={row.key}
                      onClick={() => onSelectPeriodo(row)}
                      className="group flex h-full min-w-0 flex-col justify-end"
                      title={`Filtrar ${row.label}`}
                    >
                      <div className="relative flex min-h-0 flex-1 items-end justify-center">
                        {value > 0 && (
                          <span className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums" style={{ bottom: `calc(${height}% + 4px)` }}>
                            {evolutionMetric === "hours" ? `${decimal.format(value)} hs` : integer.format(value)}
                          </span>
                        )}
                        {evolutionMetric === "orders" ? (
                          <span className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-sm transition-opacity group-hover:opacity-80" style={{ height: `${height}%` }}>
                            <span className="bg-primary" style={{ height: `${total > 0 ? (row.cerradas / total) * 100 : 0}%` }} />
                            <span className="bg-blue-500" style={{ height: `${total > 0 ? (row.abiertas / total) * 100 : 0}%` }} />
                            <span className="bg-orange-500" style={{ height: `${total > 0 ? (row.otras / total) * 100 : 0}%` }} />
                          </span>
                        ) : (
                          <span className="w-full max-w-9 rounded-t-sm bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${height}%` }} />
                        )}
                      </div>
                      <span className="h-7 truncate pt-1 text-center text-[9px] text-muted-foreground">{row.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap justify-center gap-5 text-[10px] text-muted-foreground">
            {evolutionMetric === "orders" ? (
              <>
                <Legend color={STATE_COLORS.cerradas} label="Cerradas" />
                <Legend color={STATE_COLORS.abiertas} label="Abiertas" />
                <Legend color={STATE_COLORS.otras} label="Anuladas" />
              </>
            ) : (
              <Legend color={STATE_COLORS.cerradas} label="Horas registradas" />
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Estado actual de OS</h2>
              <p className="text-[11px] text-muted-foreground">Composición del período filtrado</p>
            </div>
            <Wrench className="h-4 w-4 text-primary" />
          </div>

          <div className="mt-3 grid grid-cols-[118px_1fr] items-center gap-4">
            <div
              className="relative mx-auto h-28 w-28 rounded-full"
              style={{ background: `conic-gradient(${STATE_COLORS.cerradas} 0 ${closeRate}%, ${STATE_COLORS.abiertas} ${closeRate}% ${closeRate + openRate}%, ${STATE_COLORS.otras} ${closeRate + openRate}% 100%)` }}
            >
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-card">
                <strong className="text-xl tabular-nums">{integer.format(data.totalOS)}</strong>
                <span className="text-[9px] uppercase text-muted-foreground">OS</span>
              </div>
            </div>
            <div className="divide-y text-xs">
              <CompositionRow color={STATE_COLORS.cerradas} label="Cerradas" value={data.cerradas} percent={closeRate} selected={selectedEstados.includes("cerrada")} onClick={() => onSelectEstado("cerrada")} />
              <CompositionRow color={STATE_COLORS.abiertas} label="Abiertas" value={data.abiertas} percent={openRate} selected={selectedEstados.includes("abierta")} onClick={() => onSelectEstado("abierta")} />
              <CompositionRow color={STATE_COLORS.otras} label="Anuladas" value={data.otras} percent={otherRate} selected={selectedEstados.includes("otra")} onClick={() => onSelectEstado("otra")} />
            </div>
          </div>

          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold">Tipo de tiempo</h3>
              <span className="text-[10px] text-muted-foreground">{integer.format(timeTotal)} OS clasificadas</span>
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-sm bg-muted">
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
                <button type="button" key={row.label} onClick={() => onSelectTipoTiempo(row.label)} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: timeColor(row.label) }} />
                  {timeLabel(row.label)} {timeTotal > 0 ? Math.round((row.total / timeTotal) * 100) : 0}%
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <section className="min-w-0 rounded-md border bg-card p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Carga por responsable</h2>
              <p className="text-[11px] text-muted-foreground">Horas-persona sobre la meta del período</p>
            </div>
            <UserRound className="h-4 w-4 text-primary" />
          </div>

          <div className="space-y-2 md:hidden">
            {visibleTecnicos.map((row, index) => {
              const productivity = data.metaHorasPeriodo > 0 ? (row.horas / data.metaHorasPeriodo) * 100 : 0;
              return (
                <button
                  type="button"
                  key={row.tecnico}
                  onClick={() => onSelectTecnico(row.tecnico)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-xs hover:bg-accent",
                    !row.activo && "bg-muted/60 text-muted-foreground",
                    selectedTecnicos.includes(row.tecnico) && "bg-primary/5 ring-1 ring-primary/20",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-muted-foreground">{index + 1}</span>
                      <span className="truncate font-semibold" title={row.tecnico}>{row.tecnico}</span>
                    </span>
                    {!row.activo && <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">Inactivo</Badge>}
                  </span>
                  <span className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <span><strong className="block text-sm text-foreground">{row.totalOS}</strong>OS</span>
                    <span><strong className="block text-sm text-foreground">{decimal.format(row.horas)}</strong>Horas</span>
                    <span><strong className="block text-sm text-foreground">{Math.round(productivity)}%</strong>Productividad</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className={cn("block h-full rounded-full", productivity >= 100 ? "bg-emerald-500" : productivity >= 75 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.min(productivity, 100)}%` }} />
                  </span>
                </button>
              );
            })}
            {data.tecnicos.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Sin responsables para los filtros actuales.</div>}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[30px_minmax(190px,1fr)_52px_82px_minmax(150px,0.8fr)] gap-2 border-b px-2 pb-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>#</span><span>Responsable</span><span className="text-right">OS</span><span className="text-right">Horas</span><span>Productividad</span>
              </div>
              {visibleTecnicos.map((row, index) => {
                const productivity = data.metaHorasPeriodo > 0 ? (row.horas / data.metaHorasPeriodo) * 100 : 0;
                return (
                  <button
                    type="button"
                    key={row.tecnico}
                    onClick={() => onSelectTecnico(row.tecnico)}
                    className={cn(
                      "grid w-full grid-cols-[30px_minmax(190px,1fr)_52px_82px_minmax(150px,0.8fr)] items-center gap-2 border-b px-2 py-2 text-left text-xs last:border-b-0 hover:bg-accent",
                      !row.activo && "bg-muted/60 text-muted-foreground",
                      selectedTecnicos.includes(row.tecnico) && "bg-primary/5 ring-1 ring-inset ring-primary/20",
                    )}
                  >
                    <span className="text-muted-foreground">{index + 1}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium" title={row.tecnico}>{row.tecnico}</span>
                      {!row.activo && <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">Inactivo</Badge>}
                    </span>
                    <span className="text-right tabular-nums">{row.totalOS}</span>
                    <span className="text-right tabular-nums">{decimal.format(row.horas)} hs</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", productivity >= 100 ? "bg-emerald-500" : productivity >= 75 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.min(productivity, 100)}%` }} />
                      </span>
                      <strong className="w-10 text-right tabular-nums">{Math.round(productivity)}%</strong>
                    </span>
                  </button>
                );
              })}
              {data.tecnicos.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Sin responsables para los filtros actuales.</div>}
            </div>
          </div>

          {data.tecnicos.length > 5 && (
            <button type="button" onClick={() => setShowAllTechnicians((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {showAllTechnicians ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAllTechnicians ? "Ver los 5 principales" : `Ver todos los responsables (${data.tecnicos.length})`}
            </button>
          )}
        </section>

        <section className="min-w-0 rounded-md border bg-card p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">OS por sucursal</h2>
              <p className="text-[11px] text-muted-foreground">Distribución por estado</p>
            </div>
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-3">
            {data.sucursales.slice(0, 7).map((row) => (
              <button
                type="button"
                key={row.sucursal}
                onClick={() => onSelectSucursal(row.sucursal)}
                className={cn("grid w-full grid-cols-[92px_1fr_42px] items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent", selectedSucursales.includes(row.sucursal) && "bg-primary/5 ring-1 ring-primary/20")}
              >
                <span className="truncate font-medium" title={row.sucursal}>{row.sucursal}</span>
                <span className="h-3 overflow-hidden rounded-sm bg-muted" style={{ width: `${Math.max((row.total / branchMax) * 100, 4)}%` }}>
                  <span className="flex h-full w-full">
                    <span className="h-full bg-primary" style={{ width: `${row.total > 0 ? (row.cerradas / row.total) * 100 : 0}%` }} />
                    <span className="h-full bg-blue-500" style={{ width: `${row.total > 0 ? (row.abiertas / row.total) * 100 : 0}%` }} />
                    <span className="h-full bg-orange-500" style={{ width: `${row.total > 0 ? (row.otras / row.total) * 100 : 0}%` }} />
                  </span>
                </span>
                <strong className="text-right tabular-nums">{row.total}</strong>
              </button>
            ))}
            {data.sucursales.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Sin sucursales para los filtros actuales.</div>}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-4 border-t pt-3 text-[10px] text-muted-foreground">
            <Legend color={STATE_COLORS.cerradas} label="Cerradas" />
            <Legend color={STATE_COLORS.abiertas} label="Abiertas" />
            <Legend color={STATE_COLORS.otras} label="Anuladas" />
          </div>
        </section>
      </div>

      <section className="rounded-md border bg-card p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Detalle de órdenes de servicio</h2>
            <p className="text-[11px] text-muted-foreground">Casos del período filtrado</p>
          </div>
          <Badge variant="secondary">{data.ordenes.length} OS</Badge>
        </div>

        <div className="space-y-2 md:hidden">
          {visibleOrders.map((row) => (
            <article key={row.key} className="rounded-md border p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <strong className="font-mono">{row.os}</strong>
                <Badge className={statusTone(row.estadoOS)} variant="outline">{row.estadoOS}</Badge>
              </div>
              <div className="mt-1 font-medium">{row.cliente}</div>
              <div className="mt-1 text-muted-foreground">{row.tecnico} · {row.sucursal ?? "Sin sucursal"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline">{timeLabel(row.tipoTiempo)}</Badge>
                {row.origen && <Badge variant="outline">Origen: {row.origen}</Badge>}
                <Badge variant="outline"><Timer className="mr-1 h-3 w-3" />{decimal.format(row.horas)} hs</Badge>
                <Badge variant="secondary">USD {usd.format(row.valorOS)}</Badge>
              </div>
            </article>
          ))}
          {visibleOrders.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Sin órdenes para los filtros actuales.</div>}
        </div>

        <div className="hidden overflow-x-auto rounded-md border md:block">
          <table className="w-full min-w-[1040px] text-xs">
            <thead className="bg-muted/75 text-left text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">OS</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Responsable</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Origen</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Apertura</th>
                <th className="px-3 py-2 text-right">Hs</th>
                <th className="px-3 py-2 text-right">Total OS</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((row) => (
                <tr key={row.key} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-semibold">{row.os}</td>
                  <td className="max-w-[210px] truncate px-3 py-2" title={row.cliente}>{row.cliente}</td>
                  <td className="max-w-[190px] truncate px-3 py-2" title={row.tecnico}>{row.tecnico}</td>
                  <td className="px-3 py-2">{row.sucursal ?? "-"}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{timeLabel(row.tipoTiempo)}</Badge></td>
                  <td className="max-w-[130px] truncate px-3 py-2" title={row.origen}>{row.origen || "-"}</td>
                  <td className="px-3 py-2"><Badge className={statusTone(row.estadoOS)} variant="outline">{row.estadoOS}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.fechaApertura || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{decimal.format(row.horas)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">USD {usd.format(row.valorOS)}</td>
                </tr>
              ))}
              {visibleOrders.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">Sin órdenes para los filtros actuales.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span>Mostrando {pageStart} a {pageEnd} de {data.ordenes.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Página anterior" disabled={safePage === 0} onClick={() => setOrderPage(Math.max(safePage - 1, 0))} className="flex h-8 w-8 items-center justify-center rounded-md border text-foreground hover:bg-accent disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-16 text-center tabular-nums">{safePage + 1} / {pageCount}</span>
            <button type="button" aria-label="Página siguiente" disabled={safePage >= pageCount - 1} onClick={() => setOrderPage(Math.min(safePage + 1, pageCount - 1))} className="flex h-8 w-8 items-center justify-center rounded-md border text-foreground hover:bg-accent disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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
