import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarPlus, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { ESTADOS_TRABAJO, ESTADOS_PROGRAMACION, ESTADOS_JORNADA, PRIORIDADES, prioridadBadge, type EstadoTrabajo, siguientesEstadosTrabajo, estadoTrabajoLabel, normalizarEstadoTrabajo } from "@/lib/trabajos";
import { ProgramarIntervencionDialog } from "./ProgramarIntervencionDialog";
import { CargarJornadaDialog } from "./CargarJornadaDialog";
import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";
import { useAuth } from "@/hooks/useAuth";
import type { Sucursal } from "@/lib/constants";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }

interface Props {
  trabajoId: string | null;
  onOpenChange: (o: boolean) => void;
  clientes: Cliente[];
  tecnicos: Profile[];
  profileMap: Map<string, Profile>;
  clienteMap: Map<string, Cliente>;
  onChanged: () => void;
}

export function TrabajoDetalleDialog({ trabajoId, onOpenChange, clientes, tecnicos, profileMap, clienteMap, onChanged }: Props) {
  const { isAdmin, isCabecilla } = useAuth();
  const [trabajo, setTrabajo] = useState<any | null>(null);
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [jornadas, setJornadas] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [reprog, setReprog] = useState<any | null>(null);
  const [jornadaOpen, setJornadaOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const cargar = async () => {
    if (!trabajoId) return;
    setLoading(true);
    const [t, p, j, h] = await Promise.all([
      supabase.from("trabajos").select("*").eq("id", trabajoId).single(),
      supabase.from("programaciones").select("*").eq("trabajo_id", trabajoId).order("fecha_programada", { ascending: false }),
      supabase.from("jornadas").select("*").eq("trabajo_id", trabajoId).order("fecha_real", { ascending: false }),
      supabase.from("trabajo_historial").select("*").eq("trabajo_id", trabajoId).order("creado_en", { ascending: false }),
    ]);
    if (t.error) toast.error(t.error.message); else setTrabajo(t.data);
    setProgramaciones(p.data ?? []);
    setJornadas(j.data ?? []);
    setHistorial(h.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (trabajoId) cargar(); else { setTrabajo(null); setProgramaciones([]); setJornadas([]); setHistorial([]); } }, [trabajoId]);

  const horasTotal = useMemo(() => jornadas.reduce((a, j) => a + (Number(j.horas_reales) || 0), 0), [jornadas]);
  const puedeCerrar = isAdmin || isCabecilla;

  const estadoServicio = (estado: EstadoTrabajo) => {
    if (estado === "completado") return "Completado";
    if (estado === "iniciado") return "Iniciado";
    return "Pendiente";
  };

  const quitarDelPlanificador = async () => {
    if (!trabajo?.legacy_servicio_id) return;

    await supabase.from("servicio_jornadas").delete().eq("servicio_id", trabajo.legacy_servicio_id);
    await supabase.from("servicios").delete().eq("id", trabajo.legacy_servicio_id);

    await supabase
      .from("trabajos")
      .update({
        legacy_servicio_id: null,
        fecha_compromiso: null,
      })
      .eq("id", trabajo.id);
  };

  const cambiarEstado = async (nuevo: EstadoTrabajo) => {
    if (!trabajo) return;

    if (nuevo === "programado") {
      const tieneProgramacionActiva = programaciones.some((p) => p.estado === "programada");
      if (!tieneProgramacionActiva) {
        toast.error("Primero programá una intervención con fecha y técnico.");
        setProgramOpen(true);
        return;
      }
    }

    try {
      if (nuevo === "pendiente") {
        await quitarDelPlanificador();
        await supabase
          .from("programaciones")
          .update({ estado: "cancelada" })
          .eq("trabajo_id", trabajo.id)
          .eq("estado", "programada");
      }

      const patch: any = {
        estado_general: nuevo,
        cerrado_en: nuevo === "completado" ? new Date().toISOString() : null,
      };

      if (nuevo !== "en_pausa") patch.motivo_bloqueo = null;

      const { error } = await supabase.from("trabajos").update(patch).eq("id", trabajo.id);
      if (error) throw error;

      if (trabajo.legacy_servicio_id && nuevo !== "pendiente") {
        await supabase
          .from("servicios")
          .update({ estado: estadoServicio(nuevo) })
          .eq("id", trabajo.legacy_servicio_id);

        await supabase
          .from("servicio_jornadas")
          .update({ estado: estadoServicio(nuevo) })
          .eq("servicio_id", trabajo.legacy_servicio_id);
      }

      toast.success(`Estado actualizado a ${estadoTrabajoLabel(nuevo)}`);
      cargar();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar el estado");
    }
  };

  const eliminar = async () => {
    if (!trabajo) return;
    if (!window.confirm("¿Eliminar este trabajo y toda su historia?")) return;
    if (trabajo.legacy_servicio_id) {
      await supabase.from("servicio_jornadas").delete().eq("servicio_id", trabajo.legacy_servicio_id);
      await supabase.from("servicios").delete().eq("id", trabajo.legacy_servicio_id);
    }

    const { error } = await supabase.from("trabajos").delete().eq("id", trabajo.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Trabajo eliminado");
    onOpenChange(false);
    onChanged();
  };

  const eliminarProgramacion = async (id: string) => {
    if (!window.confirm("¿Eliminar esta programación?")) return;
    const { error } = await supabase.from("programaciones").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    cargar();
  };

  const eliminarJornada = async (id: string) => {
    if (!window.confirm("¿Eliminar esta jornada?")) return;
    const { error } = await supabase.from("jornadas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    cargar();
  };

  if (!trabajoId) return null;

  return (
    <>
      <Dialog open={!!trabajoId && !editOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {trabajo ? (clienteMap.get(trabajo.cliente_id)?.nombre ?? "Sin cliente") : "Cargando…"}
              {trabajo && (
                <>
                  <Badge variant="outline">{trabajo.marca}</Badge>
                  <Badge variant="outline">{trabajo.sucursal}</Badge>
                  <Badge className={prioridadBadge(trabajo.prioridad)}>{PRIORIDADES.find(p => p.key === trabajo.prioridad)?.label}</Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading || !trabajo ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
            <Tabs defaultValue="resumen">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="programaciones">Programaciones ({programaciones.length})</TabsTrigger>
                <TabsTrigger value="jornadas">Jornadas ({jornadas.length})</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="space-y-3 pt-3">
                <Row k="Estado">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant="outline">{estadoTrabajoLabel(trabajo.estado_general)}</Badge>
                    {siguientesEstadosTrabajo(trabajo.estado_general).map((estadoSiguiente) => (
                      <Button
                        key={estadoSiguiente}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => cambiarEstado(estadoSiguiente)}
                      >
                        Pasar a {estadoTrabajoLabel(estadoSiguiente)}
                      </Button>
                    ))}
                  </div>
                </Row>
                <Row k="Tipo">{trabajo.tipo_trabajo}</Row>
                <Row k="Responsable principal">{trabajo.responsable_principal_id ? profileMap.get(trabajo.responsable_principal_id)?.nombre ?? "—" : "—"}</Row>
                <Row k="Fecha compromiso">{trabajo.fecha_compromiso ?? "—"}</Row>
                <Row k="Horas reales acumuladas">{horasTotal} hs</Row>
                {trabajo.motivo_bloqueo && <Row k="Motivo de pausa">{trabajo.motivo_bloqueo}</Row>}
                {trabajo.proxima_accion && <Row k="Observación interna">{trabajo.proxima_accion}</Row>}
                <div>
                  <div className="text-xs text-muted-foreground">Problema</div>
                  <div className="rounded-md bg-muted/40 p-2 text-sm">{trabajo.descripcion_problema}</div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar datos
                  </Button>
                  {puedeCerrar && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={eliminar}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="programaciones" className="space-y-2 pt-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => { setReprog(null); setProgramOpen(true); }}>
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Programar intervención
                  </Button>
                </div>
                {programaciones.length === 0 && <p className="text-xs text-muted-foreground">Sin programaciones.</p>}
                {programaciones.map(p => (
                  <div key={p.id} className="rounded-md border p-2.5 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{p.fecha_programada}</div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{ESTADOS_PROGRAMACION.find(e => e.key === p.estado)?.label}</Badge>
                        {p.estado === "programada" && (
                          <Button variant="ghost" size="sm" className="h-7 text-[11px]"
                            onClick={() => { setReprog({ id: p.id, fecha: p.fecha_programada, tecnico: p.tecnico_principal_id }); setProgramOpen(true); }}>
                            Reprogramar
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => eliminarProgramacion(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Técnico: <span className="text-foreground">{p.tecnico_principal_id ? profileMap.get(p.tecnico_principal_id)?.nombre ?? "—" : "—"}</span>
                      {p.auxiliares?.length > 0 && <> · Aux: {p.auxiliares.map((a: string) => profileMap.get(a)?.nombre).filter(Boolean).join(", ")}</>}
                      {p.horas_estimadas && <> · Estim: {p.horas_estimadas} hs</>}
                    </div>
                    {p.accion_programada && <div className="text-xs"><b>Acción:</b> {p.accion_programada}</div>}
                    {p.observacion && <div className="text-xs text-muted-foreground">{p.observacion}</div>}
                    {p.motivo_reprogramacion && <div className="text-xs text-amber-700"><b>Reprogramada:</b> {p.motivo_reprogramacion}</div>}
                    {p.reemplaza_a && <div className="text-[10px] text-muted-foreground">Reemplaza programación previa</div>}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="jornadas" className="space-y-2 pt-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setJornadaOpen(true)}>
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Cargar jornada
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">Total acumulado: <b>{horasTotal} hs</b> en {jornadas.length} jornada(s)</div>
                {jornadas.length === 0 && <p className="text-xs text-muted-foreground">Sin jornadas registradas.</p>}
                {jornadas.map(j => (
                  <div key={j.id} className="rounded-md border p-2.5 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{j.fecha_real} · {profileMap.get(j.tecnico_id)?.nombre ?? "—"}</div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{ESTADOS_JORNADA.find(e => e.key === j.estado_jornada)?.label}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => eliminarJornada(j.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {j.hora_inicio && j.hora_fin && <>{j.hora_inicio}–{j.hora_fin} · </>}
                      Horas: <b className="text-foreground">{j.horas_reales ?? "—"}</b>
                    </div>
                    {j.actividad_realizada && <div className="text-xs"><b>Actividad:</b> {j.actividad_realizada}</div>}
                    {j.resultado && <div className="text-xs"><b>Resultado:</b> {j.resultado}</div>}
                    {j.observaciones && <div className="text-xs text-muted-foreground">{j.observaciones}</div>}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="historial" className="space-y-2 pt-3">
                {historial.length === 0 && <p className="text-xs text-muted-foreground">Sin eventos.</p>}
                {historial.map(h => (
                  <div key={h.id} className="rounded-md border p-2 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{h.tipo_evento}</Badge>
                      <span className="text-muted-foreground">{new Date(h.creado_en).toLocaleString("es-PY")}</span>
                    </div>
                    {h.usuario_id && <div className="text-muted-foreground">Por: {profileMap.get(h.usuario_id)?.nombre ?? h.usuario_id.slice(0, 8)}</div>}
                    <pre className="whitespace-pre-wrap break-words text-[11px] bg-muted/40 rounded p-1.5 mt-1">
                      {JSON.stringify(h.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {trabajo && (
        <>
          <ProgramarIntervencionDialog
            open={programOpen}
            onOpenChange={setProgramOpen}
            trabajoId={trabajo.id}
            tecnicos={tecnicos}
            reprogramarDe={reprog}
            onSaved={() => { cargar(); onChanged(); }}
          />
          <CargarJornadaDialog
            open={jornadaOpen}
            onOpenChange={setJornadaOpen}
            trabajoId={trabajo.id}
            tecnicos={tecnicos}
            programaciones={programaciones.filter(p => p.estado === "programada" || p.estado === "cumplida").map(p => ({ id: p.id, fecha_programada: p.fecha_programada }))}
            onSaved={() => { cargar(); onChanged(); }}
          />
          <NuevoTrabajoDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            clientes={clientes}
            tecnicos={tecnicos}
            trabajo={trabajo}
            onSaved={() => { cargar(); onChanged(); }}
          />
        </>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 border-b border-border/50 py-1.5">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}
