import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, CalendarDays, X } from "lucide-react";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { ESTADOS_TRABAJO, PRIORIDADES, prioridadBadge, normalizarEstadoTrabajo } from "@/lib/trabajos";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NuevoTrabajoDialog } from "@/components/trabajos/NuevoTrabajoDialog";
import { TrabajoDetalleDialog } from "@/components/trabajos/TrabajoDetalleDialog";
import { getISOWeek, parseISO, format } from "date-fns";

interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface Profile { id: string; nombre: string; sucursal: Sucursal | null }

const PAGE = 1000;
async function cargarTodo<T>(qb: any): Promise<T[]> {
  let from = 0; const all: T[] = [];
  while (true) {
    const { data, error } = await qb.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const MAX_VISIBLES = 5;

export default function Trabajos() {
  const [trabajos, setTrabajos] = useState<any[]>([]);
  const [progByTrabajo, setProgByTrabajo] = useState<Map<string, any[]>>(new Map());
  const [jornadasByProgramacion, setJornadasByProgramacion] = useState<Map<string, any[]>>(new Map());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>("all"); // admin ve todo por defecto
  const [fPrio, setFPrio] = useState<string>("all");
  const [fEstado, setFEstado] = useState<string>("all");
  const [fFecha, setFFecha] = useState<string>("");
  const [fSemana, setFSemana] = useState<string>("all");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const [openNuevo, setOpenNuevo] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [t, p, j, c, pr] = await Promise.all([
        cargarTodo<any>(supabase.from("trabajos").select("*").order("actualizado_en", { ascending: false })),
        cargarTodo<any>(supabase.from("programaciones").select("id, trabajo_id, fecha_programada, tecnico_principal_id").order("fecha_programada", { ascending: true })),
        cargarTodo<any>(supabase.from("jornadas").select("id, programacion_id, estado_jornada")),
        cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal").order("nombre")),
        cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal").order("nombre")),
      ]);
      setTrabajos(t);
      const map = new Map<string, any[]>();
      for (const x of p) {
        const arr = map.get(x.trabajo_id) ?? [];
        arr.push(x); map.set(x.trabajo_id, arr);
      }
      setProgByTrabajo(map);

      const jMap = new Map<string, any[]>();
      for (const x of j) {
        if (!x.programacion_id) continue;
        const arr = jMap.get(x.programacion_id) ?? [];
        arr.push(x); jMap.set(x.programacion_id, arr);
      }
      setJornadasByProgramacion(jMap);

      setClientes(c);
      setProfiles(pr);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando trabajos");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const semanasDisponibles = useMemo(() => {
    const s = new Set<number>();
    for (const arr of progByTrabajo.values()) {
      for (const p of arr) s.add(getISOWeek(parseISO(p.fecha_programada)));
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [progByTrabajo]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trabajos.filter(t => {
      if (fSucursal !== "all" && t.sucursal !== fSucursal) return false;
      if (fPrio !== "all" && t.prioridad !== fPrio) return false;
      if (fEstado !== "all" && normalizarEstadoTrabajo(t.estado_general) !== fEstado) return false;
      if (query) {
        const cli = t.cliente_id ? clienteMap.get(t.cliente_id)?.nombre ?? "" : "";
        if (!cli.toLowerCase().includes(query)
          && !t.descripcion_problema.toLowerCase().includes(query)) return false;
      }
      if (fFecha || fSemana !== "all") {
        const progs = progByTrabajo.get(t.id) ?? [];
        const matchProg = progs.some(p => {
          if (fFecha && p.fecha_programada !== fFecha) return false;
          if (fSemana !== "all" && getISOWeek(parseISO(p.fecha_programada)) !== Number(fSemana)) return false;
          return true;
        });
        if (!matchProg) return false;
      }
      return true;
    });
  }, [trabajos, q, fSucursal, fPrio, fEstado, fFecha, fSemana, clienteMap, progByTrabajo]);

  const limpiar = () => {
    setQ(""); setFSucursal("all"); setFPrio("all"); setFEstado("all");
    setFFecha(""); setFSemana("all");
  };

  const activosCount =
    (q ? 1 : 0) +
    (fSucursal !== "all" ? 1 : 0) +
    (fPrio !== "all" ? 1 : 0) +
    (fEstado !== "all" ? 1 : 0) +
    (fFecha ? 1 : 0) +
    (fSemana !== "all" ? 1 : 0);

  return (
    <div className="container max-w-[1800px] py-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trabajos</h1>
          <p className="text-xs text-muted-foreground">
            Vista macro de casos. Lo operativo se maneja desde Planificador / Calendario.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpenNuevo(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nuevo trabajo
        </Button>
      </div>

      {/* Barra de filtros unificada */}
      <Card className="p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente o problema…"
              className="h-9 pl-7 text-sm"
            />
          </div>

          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Sucursal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {SUCURSALES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Prioridad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda prioridad</SelectItem>
              {PRIORIDADES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo estado</SelectItem>
              {ESTADOS_TRABAJO.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={fFecha}
            onChange={(e) => setFFecha(e.target.value)}
            className="h-9 w-[150px] text-xs"
            title="Filtrar por fecha de programación"
          />

          <Select value={fSemana} onValueChange={setFSemana}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Semana" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda semana</SelectItem>
              {semanasDisponibles.map(s => <SelectItem key={s} value={String(s)}>Semana {s}</SelectItem>)}
            </SelectContent>
          </Select>

          {activosCount > 0 && (
            <Button variant="ghost" size="sm" onClick={limpiar} className="h-9 text-xs">
              <X className="mr-1 h-3 w-3" /> Limpiar ({activosCount})
            </Button>
          )}

          <div className="ml-auto text-[11px] text-muted-foreground">
            {filtered.length} trabajo{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        >
          {ESTADOS_TRABAJO.map(col => {
            const items = filtered.filter(t => normalizarEstadoTrabajo(t.estado_general) === col.key);
            const expandida = expandidas.has(col.key);
            const visibles = expandida ? items : items.slice(0, MAX_VISIBLES);
            const restantes = items.length - visibles.length;

            return (
              <div key={col.key} className="min-w-0">
                <Card className="p-2.5 bg-muted/30 min-h-[300px]">
                  <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wide">{col.label}</h2>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
                  </div>

                  <div className="space-y-1.5">
                    {items.length === 0 && (
                      <p className="text-[11px] text-muted-foreground text-center py-6">—</p>
                    )}

                    {visibles.map(t => {
                      const cli = t.cliente_id ? clienteMap.get(t.cliente_id) : null;
                      const progs = progByTrabajo.get(t.id) ?? [];
                      const hoy = new Date(new Date().toDateString());
                      const futurosActivos = progs.filter(p => {
                        const jvs = jornadasByProgramacion.get(p.id) ?? [];
                        return jvs.length === 0 && new Date(`${p.fecha_programada}T00:00:00`) >= hoy;
                      });
                      const proxima = futurosActivos[0];
                      const prioLabel = PRIORIDADES.find(p => p.key === t.prioridad)?.label ?? "";

                      return (
                        <button
                          key={t.id}
                          onClick={() => setDetalleId(t.id)}
                          className={cn(
                            "w-full rounded-md border bg-card p-2 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/40",
                            col.color,
                          )}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold leading-tight">
                                {cli?.nombre ?? "Sin cliente"}
                              </div>
                              <div className="text-[10px] text-muted-foreground leading-tight">
                                {t.sucursal} · {t.marca}
                              </div>
                            </div>
                            <Badge className={cn("h-4 shrink-0 px-1 text-[9px] font-medium", prioridadBadge(t.prioridad))}>
                              {prioLabel.charAt(0)}
                            </Badge>
                          </div>

                          <div className="mt-1.5 line-clamp-2 text-[11px] text-foreground/80 leading-snug">
                            {t.descripcion_problema}
                          </div>

                          {proxima ? (
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />
                              <span className="tabular-nums">
                                {format(parseISO(proxima.fecha_programada), "dd/MM")}
                              </span>
                              {futurosActivos.length > 1 && (
                                <span className="text-foreground/60">+{futurosActivos.length - 1}</span>
                              )}
                            </div>
                          ) : (
                            progs.length > 0 && (
                              <div className="mt-1.5 text-[10px] text-muted-foreground italic">
                                {progs.length} agenda{progs.length !== 1 ? "s" : ""}
                              </div>
                            )
                          )}
                        </button>
                      );
                    })}

                    {restantes > 0 && (
                      <button
                        onClick={() => setExpandidas(s => new Set(s).add(col.key))}
                        className="w-full rounded-md border border-dashed py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        +{restantes} más
                      </button>
                    )}

                    {expandida && items.length > MAX_VISIBLES && (
                      <button
                        onClick={() => {
                          const next = new Set(expandidas);
                          next.delete(col.key);
                          setExpandidas(next);
                        }}
                        className="w-full rounded-md py-1 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Mostrar menos
                      </button>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <NuevoTrabajoDialog
        open={openNuevo}
        onOpenChange={setOpenNuevo}
        clientes={clientes}
        onSaved={load}
      />
      <TrabajoDetalleDialog
        trabajoId={detalleId}
        onOpenChange={(o) => !o && setDetalleId(null)}
        clientes={clientes}
        tecnicos={profiles}
        profileMap={profileMap}
        clienteMap={clienteMap}
        onChanged={load}
      />
    </div>
  );
}
