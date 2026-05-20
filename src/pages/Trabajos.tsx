import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarDays } from "lucide-react";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { ESTADOS_TRABAJO, PRIORIDADES, prioridadBadge, normalizarEstadoTrabajo } from "@/lib/trabajos";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NuevoTrabajoDialog } from "@/components/trabajos/NuevoTrabajoDialog";
import { TrabajoDetalleDialog } from "@/components/trabajos/TrabajoDetalleDialog";
import { FiltersBar, FilterSelect, FilterDate } from "@/components/filters/FiltersBar";
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
  const [agendasByTrabajo, setAgendasByTrabajo] = useState<Map<string, any[]>>(new Map());
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
      const [t, sj, c, pr] = await Promise.all([
        cargarTodo<any>(supabase.from("trabajos").select("*").order("actualizado_en", { ascending: false })),
        cargarTodo<any>(supabase.from("servicio_jornadas").select("id, servicio_id, fecha, estado, tecnico_responsable_id").order("fecha", { ascending: true })),
        cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal").order("nombre")),
        cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal").order("nombre")),
      ]);
      setTrabajos(t);

      // Mapear servicio_jornadas → trabajo via legacy_servicio_id
      const servToTrabajo = new Map<string, string>();
      for (const tr of t) {
        if (tr.legacy_servicio_id) servToTrabajo.set(tr.legacy_servicio_id, tr.id);
      }
      const map = new Map<string, any[]>();
      for (const x of sj) {
        const trabajoId = servToTrabajo.get(x.servicio_id);
        if (!trabajoId) continue;
        const arr = map.get(trabajoId) ?? [];
        arr.push({ ...x, fecha_programada: x.fecha });
        map.set(trabajoId, arr);
      }
      setAgendasByTrabajo(map);

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
    for (const arr of agendasByTrabajo.values()) {
      for (const p of arr) s.add(getISOWeek(parseISO(p.fecha_programada)));
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [agendasByTrabajo]);


  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trabajos.filter(t => {
      if (fSucursal !== "all" && t.sucursal !== fSucursal) return false;
      if (fPrio !== "all" && t.prioridad !== fPrio) return false;
      if (fEstado !== "all" && normalizarEstadoTrabajo(t.estado_general) !== fEstado) return false;
      if (query) {
        const cli = t.cliente_id ? clienteMap.get(t.cliente_id)?.nombre ?? "" : "";
        if (!cli.toLowerCase().includes(query)
          && !t.descripcion_problema.toLowerCase().includes(query)
          && !(t.codigo ?? "").toLowerCase().includes(query)) return false;
      }
      if (fFecha || fSemana !== "all") {
        const progs = agendasByTrabajo.get(t.id) ?? [];
        const matchProg = progs.some(p => {
          if (fFecha && p.fecha_programada !== fFecha) return false;
          if (fSemana !== "all" && getISOWeek(parseISO(p.fecha_programada)) !== Number(fSemana)) return false;
          return true;
        });
        if (!matchProg) return false;
      }
      return true;
    });
  }, [trabajos, q, fSucursal, fPrio, fEstado, fFecha, fSemana, clienteMap, agendasByTrabajo]);

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

      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Buscar TR-000123, cliente o problema…" }}
        activeCount={activosCount}
        onClear={limpiar}
        meta={`${filtered.length} trabajo${filtered.length !== 1 ? "s" : ""}`}
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[150px]"
          options={[{ value: "all", label: "Todas las sucursales" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Prioridad" value={fPrio} onChange={setFPrio} placeholder="Prioridad" width="w-[130px]"
          options={[{ value: "all", label: "Toda prioridad" }, ...PRIORIDADES.map(p => ({ value: p.key, label: p.label }))]}
        />
        <FilterSelect
          label="Estado" value={fEstado} onChange={setFEstado} placeholder="Estado" width="w-[130px]"
          options={[{ value: "all", label: "Todo estado" }, ...ESTADOS_TRABAJO.map(e => ({ value: e.key, label: e.label }))]}
        />
        <FilterDate label="Fecha" value={fFecha} onChange={setFFecha} title="Filtrar por fecha de programación" />
        <FilterSelect
          label="Semana" value={fSemana} onChange={setFSemana} placeholder="Semana" width="w-[130px]"
          options={[{ value: "all", label: "Toda semana" }, ...semanasDisponibles.map(s => ({ value: String(s), label: `Semana ${s}` }))]}
        />
      </FiltersBar>



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
                <Card className="p-2 bg-muted/30 min-h-[180px]">
                  <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide">{col.label}</h2>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
                  </div>

                  <div className="space-y-1.5">
                    {items.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/70 text-center py-4">—</p>
                    )}

                    {visibles.map(t => {
                      const cli = t.cliente_id ? clienteMap.get(t.cliente_id) : null;
                      const progs = agendasByTrabajo.get(t.id) ?? [];
                      const hoy = new Date(new Date().toDateString());
                      const futurosActivos = progs.filter(p => {
                        return p.estado !== "Completado" && new Date(`${p.fecha_programada}T00:00:00`) >= hoy;
                      });
                      const proxima = futurosActivos[0];
                      const prioLabel = PRIORIDADES.find(p => p.key === t.prioridad)?.label ?? "";
                      const pendCount = futurosActivos.length;

                      return (
                        <button
                          key={t.id}
                          onClick={() => setDetalleId(t.id)}
                          className={cn(
                            "w-full rounded-md border bg-card px-2 py-1.5 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/40",
                            col.color,
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-muted px-1 py-0 text-[9px] font-mono font-semibold text-muted-foreground tabular-nums">
                              {t.codigo ?? "TR-—"}
                            </span>
                            <Badge className={cn("h-4 shrink-0 px-1 text-[9px] font-medium ml-auto", prioridadBadge(t.prioridad))}>
                              {prioLabel.charAt(0)}
                            </Badge>
                          </div>
                          <div className="mt-0.5 truncate text-[12px] font-semibold leading-tight">
                            {cli?.nombre ?? "Sin cliente"}
                          </div>

                          <div className="mt-0.5 line-clamp-1 text-[11px] text-foreground/75 leading-snug">
                            {t.descripcion_problema}
                          </div>

                          {(proxima || pendCount > 0) && (
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              {proxima && (
                                <span className="flex items-center gap-0.5">
                                  <CalendarDays className="h-3 w-3" />
                                  <span className="tabular-nums">
                                    {format(parseISO(proxima.fecha_programada), "dd/MM")}
                                  </span>
                                </span>
                              )}
                              {pendCount > 0 && (
                                <span>· {pendCount} pend.</span>
                              )}
                            </div>
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
