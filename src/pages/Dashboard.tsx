import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  ESTADOS,
  MARCAS,
  SUCURSALES,
  type Estado,
  type Marca,
  type Sucursal,
} from "@/lib/constants";
import {
  parseISO,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
} from "date-fns";
import { AlertTriangle, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  marca: Marca;
  estado: Estado;
  horas_trabajadas: number | null;
}

interface Profile {
  id: string;
  nombre: string;
}

const COLORS_ESTADO: Record<Estado, string> = {
  Pendiente: "#EF9F27",
  Iniciado: "#378ADD",
  Completado: "#639922",
};

const COLORS_MARCA: Record<Marca, string> = {
  CLAAS: "hsl(var(--marca-claas))",
  HORSCH: "hsl(var(--marca-horsch))",
};

const shortName = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ");

export default function Dashboard() {
  const navigate = useNavigate();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [showAllTecnicos, setShowAllTecnicos] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("servicios")
        .select(
          "id, fecha_programada, tecnico_responsable_id, auxiliares, sucursal, marca, estado, horas_trabajadas",
        ),
      supabase.from("profiles").select("id, nombre"),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]).then(([s, p, r]) => {
      setServicios((s.data ?? []) as Servicio[]);
      setProfiles((p.data ?? []) as Profile[]);
      setAdminIds(new Set((r.data ?? []).map((x: { user_id: string }) => x.user_id)));
    });
  }, []);

  const profById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])),
    [profiles],
  );

  const filtered = useMemo(
    () =>
      servicios.filter((s) => {
        const d = parseISO(s.fecha_programada);
        return isWithinInterval(d, { start: parseISO(from), end: parseISO(to) });
      }),
    [servicios, from, to],
  );

  // Mes anterior (mismo largo de período aprox.) para tendencia
  const prevPeriod = useMemo(() => {
    const fromDate = parseISO(from);
    const toDate = parseISO(to);
    const prevFrom = subMonths(fromDate, 1);
    const prevTo = subMonths(toDate, 1);
    return servicios.filter((s) => {
      const d = parseISO(s.fecha_programada);
      return isWithinInterval(d, { start: prevFrom, end: prevTo });
    });
  }, [servicios, from, to]);

  const total = filtered.length;
  const completados = filtered.filter((s) => s.estado === "Completado").length;
  const pendientes = filtered.filter((s) => s.estado === "Pendiente").length;
  const iniciados = filtered.filter((s) => s.estado === "Iniciado").length;
  const totalHoras = filtered.reduce((acc, s) => acc + (s.horas_trabajadas ?? 0), 0);

  const totalPrev = prevPeriod.length;
  const trendTotal = total - totalPrev;

  const pctCompletados = total ? Math.round((completados / total) * 100) : 0;
  const pctPendientes = total ? Math.round((pendientes / total) * 100) : 0;

  // Técnicos activos = profiles no admin con al menos 1 servicio en el período
  const tecnicosActivosIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of filtered) {
      if (s.tecnico_responsable_id && !adminIds.has(s.tecnico_responsable_id))
        set.add(s.tecnico_responsable_id);
      for (const a of s.auxiliares ?? []) {
        if (a && !adminIds.has(a)) set.add(a);
      }
    }
    return set;
  }, [filtered, adminIds]);

  const horasPorTecnicoActivo = tecnicosActivosIds.size
    ? totalHoras / tecnicosActivosIds.size
    : 0;

  // Por sucursal apilado por estado
  const porSucursal = useMemo(
    () =>
      SUCURSALES.map((suc) => {
        const items = filtered.filter((x) => x.sucursal === suc);
        return {
          name: suc,
          Pendiente: items.filter((x) => x.estado === "Pendiente").length,
          Iniciado: items.filter((x) => x.estado === "Iniciado").length,
          Completado: items.filter((x) => x.estado === "Completado").length,
          total: items.length,
        };
      }),
    [filtered],
  );

  // Por técnico (responsable + auxiliares, excluye admins)
  const porTecnico = useMemo(() => {
    const base = new Map<string, { id: string; name: string; total: number; horas: number }>();

    for (const p of profiles) {
      if (adminIds.has(p.id)) continue;
      base.set(p.id, { id: p.id, name: shortName(p.nombre), total: 0, horas: 0 });
    }

    for (const s of filtered) {
      const participantes = new Set<string>();
      if (s.tecnico_responsable_id) participantes.add(s.tecnico_responsable_id);
      for (const aux of s.auxiliares ?? []) if (aux) participantes.add(aux);

      for (const id of participantes) {
        if (adminIds.has(id)) continue;
        const actual =
          base.get(id) ??
          { id, name: shortName(profById[id] ?? "Sin nombre"), total: 0, horas: 0 };
        actual.total += 1;
        actual.horas += s.horas_trabajadas ?? 0;
        base.set(id, actual);
      }
    }

    return [...base.values()]
      .filter((t) => t.total > 0) // sólo con servicios asignados en el período
      .sort((a, b) => b.total - a.total || b.horas - a.horas);
  }, [profiles, adminIds, filtered, profById]);

  const topTecnicos = porTecnico.slice(0, 5);
  const maxHoras = Math.max(1, ...porTecnico.map((t) => t.horas));
  const tecnicosSinHoras = porTecnico.filter((t) => t.horas === 0);
  const tecnicosConHoras = porTecnico.filter((t) => t.horas > 0);

  const porMarca = MARCAS.map((m) => ({
    name: m,
    value: filtered.filter((x) => x.marca === m).length,
  }));

  const porEstado = ESTADOS.map((e) => ({
    name: e,
    value: filtered.filter((x) => x.estado === e).length,
  }));

  const showAlert = total > 0 && pctPendientes > 50;

  return (
    <div className="container max-w-[1400px] py-4 space-y-4">
      {/* Header con filtros */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Resumen del período seleccionado</p>
        </div>

        <div className="flex gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Banner alerta */}
      {showAlert && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border px-4 py-3"
          style={{
            backgroundColor: "rgba(239, 159, 39, 0.12)",
            borderColor: "#EF9F27",
          }}
        >
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#EF9F27" }} />
            <span>
              <span className="font-semibold">{pctPendientes}%</span> de servicios están pendientes
              este período — <span className="font-semibold">{pendientes}</span> de{" "}
              <span className="font-semibold">{total}</span> sin resolver
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/planificador")}
            className="gap-1 self-start sm:self-auto border-[#EF9F27] hover:bg-[#EF9F27]/10"
          >
            Ver pendientes <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI
          label="Total servicios"
          value={total}
          context={
            totalPrev > 0 || trendTotal !== 0 ? (
              <TrendBadge value={trendTotal} suffix=" vs mes anterior" />
            ) : (
              <span className="text-[11px] text-muted-foreground">sin datos previos</span>
            )
          }
        />
        <KPI
          label="Completados"
          value={`${completados}`}
          accent="completado"
          context={
            <Badge
              variant="outline"
              className="text-[10px] border-estado-completado text-estado-completado bg-estado-completado/10"
            >
              {pctCompletados}% de cierre
            </Badge>
          }
        />
        <KPI
          label="Pendientes"
          value={pendientes}
          accent="pendiente"
          context={
            pctPendientes > 50 ? (
              <Badge variant="destructive" className="text-[10px]">
                {pctPendientes}% del total
              </Badge>
            ) : (
              <span className="text-[11px] text-muted-foreground">{pctPendientes}% del total</span>
            )
          }
        />
        <KPI
          label="Horas trabajadas"
          value={totalHoras.toFixed(1)}
          context={
            <span className="text-[11px] text-muted-foreground">
              ~{horasPorTecnicoActivo.toFixed(1)}h por técnico activo
            </span>
          }
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sucursal apilado */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Servicios por sucursal</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={porSucursal}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} width={80} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Pendiente" stackId="a" fill={COLORS_ESTADO.Pendiente} />
              <Bar dataKey="Iniciado" stackId="a" fill={COLORS_ESTADO.Iniciado} />
              <Bar dataKey="Completado" stackId="a" fill={COLORS_ESTADO.Completado}>
                <LabelList
                  dataKey="total"
                  position="right"
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                  formatter={(v: number) => (v > 0 ? v : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Estado + Marca unificada */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Distribución por estado y marca</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={porEstado}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    label={({ value, percent }) =>
                      value > 0 ? `${Math.round((percent ?? 0) * 100)}%` : ""
                    }
                    labelLine={false}
                  >
                    {porEstado.map((e) => (
                      <Cell key={e.name} fill={COLORS_ESTADO[e.name as Estado]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                {porEstado.map((e) => (
                  <div key={e.name} className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: COLORS_ESTADO[e.name as Estado] }}
                    />
                    <span className="text-muted-foreground">{e.name}</span>
                    <span className="font-semibold tabular-nums">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Por marca
              </div>
              {porMarca.map((m) => {
                const pct = total ? Math.round((m.value / total) * 100) : 0;
                return (
                  <div key={m.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ background: COLORS_MARCA[m.name as Marca] }}
                        />
                        <span className="font-medium">{m.name}</span>
                      </div>
                      <div className="tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">{m.value}</span> · {pct}%
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: COLORS_MARCA[m.name as Marca],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Top 5 técnicos */}
        <Card className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Top 5 técnicos</h3>
            {porTecnico.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAllTecnicos(true)}
              >
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-[11px]">Técnico</TableHead>
                <TableHead className="h-8 text-[11px] text-right w-14">Serv.</TableHead>
                <TableHead className="h-8 text-[11px]">Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topTecnicos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                    Sin datos en el período
                  </TableCell>
                </TableRow>
              ) : (
                topTecnicos.map((t) => (
                  <TecnicoRow key={t.id} t={t} maxHoras={maxHoras} />
                ))
              )}
            </TableBody>
          </Table>

          {tecnicosSinHoras.length > 0 && (
            <div className="mt-3 text-[11px] text-muted-foreground border-t pt-2">
              <span className="font-semibold text-destructive">{tecnicosSinHoras.length}</span>{" "}
              técnico{tecnicosSinHoras.length !== 1 && "s"} con servicios asignados pero{" "}
              <span className="font-semibold">0h</span> registradas
            </div>
          )}
        </Card>

        {/* Cobertura de horas */}
        <Card className="p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Cobertura de horas</h3>
          <CoberturaBar
            label="Con horas cargadas"
            value={tecnicosConHoras.length}
            total={porTecnico.length}
            color="hsl(var(--estado-completado))"
          />
          <div className="mt-3">
            <CoberturaBar
              label="Sin horas registradas"
              value={tecnicosSinHoras.length}
              total={porTecnico.length}
              color="hsl(var(--destructive))"
            />
          </div>

          <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold tabular-nums text-estado-completado">
                {tecnicosConHoras.length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                con horas
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-destructive">
                {tecnicosSinHoras.length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                sin horas
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal todos los técnicos */}
      <Dialog open={showAllTecnicos} onOpenChange={setShowAllTecnicos}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Todos los técnicos</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-right">Servicios</TableHead>
                <TableHead>Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porTecnico.map((t) => (
                <TecnicoRow key={t.id} t={t} maxHoras={maxHoras} />
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TecnicoRow({
  t,
  maxHoras,
}: {
  t: { id: string; name: string; total: number; horas: number };
  maxHoras: number;
}) {
  const pct = maxHoras > 0 ? (t.horas / maxHoras) * 100 : 0;
  return (
    <TableRow>
      <TableCell className="py-1.5 text-xs font-medium">{t.name}</TableCell>
      <TableCell className="py-1.5 text-xs text-right tabular-nums">{t.total}</TableCell>
      <TableCell className="py-1.5 text-xs">
        {t.horas === 0 ? (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
            sin horas
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[40px]">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-[11px] w-8 text-right">{t.horas.toFixed(1)}</span>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function CoberturaBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold">
          {value}
          <span className="text-muted-foreground font-normal">/{total}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function TrendBadge({ value, suffix }: { value: number; suffix: string }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const cls =
    value > 0
      ? "text-estado-completado"
      : value < 0
      ? "text-destructive"
      : "text-muted-foreground";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`text-[11px] inline-flex items-center gap-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {sign}
      {value}
      <span className="text-muted-foreground">{suffix}</span>
    </span>
  );
}

function KPI({
  label,
  value,
  accent,
  context,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "completado" | "pendiente";
  context?: React.ReactNode;
}) {
  const accentClass =
    accent === "completado"
      ? "text-estado-completado"
      : accent === "pendiente"
      ? "text-estado-pendiente"
      : "";

  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</div>
      {context && <div className="mt-auto pt-1">{context}</div>}
    </Card>
  );
}
