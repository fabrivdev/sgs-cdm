import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, CalendarDays } from "lucide-react";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { ESTADOS_TRABAJO, PRIORIDADES, prioridadBadge, normalizarEstadoTrabajo } from "@/lib/trabajos";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NuevoTrabajoDialog } from "@/components/trabajos/NuevoTrabajoDialog";
import { TrabajoDetalleDialog } from "@/components/trabajos/TrabajoDetalleDialog";

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

/**
 * Vista MACRO del estado de cada trabajo. No tiene acciones operativas.
 * Toda programación/jornada se hace desde Planificador / Calendario.
 * El estado de cada trabajo lo recalcula el trigger DB.
 */
export default function Trabajos() {
  const { profile } = useAuth();
  const [trabajos, setTrabajos] = useState<any[]>([]);
  const [progByTrabajo, setProgByTrabajo] = useState<Map<string, any[]>>(new Map());
  const [jornadasByProgramacion, setJornadasByProgramacion] = useState<Map<string, any[]>>(new Map());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>(profile?.sucursal ?? "all");
  const [fPrio, setFPrio] = useState<string>("all");

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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trabajos.filter(t => {
      if (fSucursal !== "all" && t.sucursal !== fSucursal) return false;
      if (fPrio !== "all" && t.prioridad !== fPrio) return false;
      if (query) {
        const cli = t.cliente_id ? clienteMap.get(t.cliente_id)?.nombre ?? "" : "";
        if (!cli.toLowerCase().includes(query)
          && !t.descripcion_problema.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [trabajos, q, fSucursal, fPrio, clienteMap]);

  return (
    <div className="container max-w-[1800px] py-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trabajos</h1>
          <p className="text-sm text-muted-foreground">
            Vista macro de casos. Lo operativo se maneja en Planificador/Calendario.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o problema…" className="pl-8" />
          </div>
          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Sucursal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SUCURSALES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {PRIORIDADES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenNuevo(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo trabajo
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {ESTADOS_TRABAJO.map(col => {
            const items = filtered.filter(t => normalizarEstadoTrabajo(t.estado_general) === col.key);
            return (
              <div key={col.key} className="w-[280px] shrink-0">
                <Card className="min-h-[560px] p-3 bg-muted/30">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map(t => {
                      const cli = t.cliente_id ? clienteMap.get(t.cliente_id) : null;
                      const progs = progByTrabajo.get(t.id) ?? [];
                      const hoy = new Date(new Date().toDateString());
                      const agendasActivas = progs.filter(p => {
                        const jvs = jornadasByProgramacion.get(p.id) ?? [];
                        return jvs.length === 0 && new Date(`${p.fecha_programada}T00:00:00`) >= hoy;
                      });
                      const proxima = agendasActivas[0];
                      return (
                        <button key={t.id} onClick={() => setDetalleId(t.id)}
                          className={cn("w-full rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md bg-card", col.color)}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{cli?.nombre ?? "Sin cliente"}</div>
                              <div className="text-[11px] text-muted-foreground">{t.sucursal} · {t.marca}</div>
                            </div>
                            <Badge className={cn("shrink-0 text-[10px]", prioridadBadge(t.prioridad))}>
                              {PRIORIDADES.find(p => p.key === t.prioridad)?.label}
                            </Badge>
                          </div>
                          <div className="mt-2 line-clamp-3 text-xs">{t.descripcion_problema}</div>
                          <div className="mt-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
                            {proxima && <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Próxima: {proxima.fecha_programada}</div>}
                            {progs.length > 0 && <div>{progs.length} agenda(s) · {agendasActivas.length} pendiente(s)</div>}
                          </div>
                        </button>
                      );
                    })}
                    {items.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-4">—</p>}
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
