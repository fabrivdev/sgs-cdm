import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { ESTADOS_JORNADA, PRIORIDADES, prioridadBadge, estadoTrabajoLabel } from "@/lib/trabajos";
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

/**
 * Vista MACRO del trabajo. Solo lectura + eliminar agenda/jornada.
 * Para programar o cargar jornadas, usar Planificador / Calendario.
 */
export function TrabajoDetalleDialog({ trabajoId, onOpenChange, clientes, profileMap, clienteMap, onChanged }: Props) {
  const { isAdmin, isCabecilla } = useAuth();
  const [trabajo, setTrabajo] = useState<any | null>(null);
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [jornadas, setJornadas] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (trabajoId) cargar();
    else { setTrabajo(null); setProgramaciones([]); setJornadas([]); setHistorial([]); }
  }, [trabajoId]);

  const horasTotal = useMemo(() => jornadas.reduce((a, j) => a + (Number(j.horas_reales) || 0), 0), [jornadas]);
  const puedeAdmin = isAdmin || isCabecilla;

  const jornadasPorProg = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const j of jornadas) {
      if (!j.programacion_id) continue;
      const arr = map.get(j.programacion_id) ?? [];
      arr.push(j); map.set(j.programacion_id, arr);
    }
    return map;
  }, [jornadas]);

  const removerAgendaLegacy = async (fecha: string) => {
    if (!trabajo?.legacy_servicio_id) return;
    await supabase.from("servicio_jornadas")
      .delete().eq("servicio_id", trabajo.legacy_servicio_id).eq("fecha", fecha);
  };

  const eliminarProgramacion = async (p: any) => {
    if (!window.confirm("¿Eliminar esta agenda?")) return;
    const { error } = await supabase.from("programaciones").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await removerAgendaLegacy(p.fecha_programada);
    cargar(); onChanged();
  };

  const eliminarJornada = async (id: string) => {
    if (!window.confirm("¿Eliminar esta jornada?")) return;
    const { error } = await supabase.from("jornadas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    cargar(); onChanged();
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

  const cerrarTrabajo = async () => {
    if (!trabajo) return;
    const incompletas = jornadas.filter(j => j.estado_jornada === "incompleta").length;
    const msg = incompletas > 0
      ? `Hay ${incompletas} jornada(s) marcada(s) como incompleta(s). ¿Cerrar el trabajo igualmente?`
      : "¿Marcar este trabajo como completado y cerrarlo?";
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from("trabajos")
      .update({ cerrado_en: new Date().toISOString(), cerrado_por: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq("id", trabajo.id);
    if (error) { toast.error(error.message); return; }
    await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajo.id });
    toast.success("Trabajo cerrado");
    cargar(); onChanged();
  };

  const reabrirTrabajo = async () => {
    if (!trabajo) return;
    if (!window.confirm("¿Reabrir este trabajo? Su estado se recalculará automáticamente.")) return;
    const { error } = await supabase.from("trabajos")
      .update({ cerrado_en: null, cerrado_por: null })
      .eq("id", trabajo.id);
    if (error) { toast.error(error.message); return; }
    // Forzar recálculo tocando una jornada o programación no es necesario: el trigger recalcula al cambiar cerrado_en? No, no hay trigger en trabajos.
    // Llamamos RPC manual:
    await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajo.id });
    toast.success("Trabajo reabierto");
    cargar(); onChanged();
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
                  <Badge variant="secondary">{estadoTrabajoLabel(trabajo.estado_general)}</Badge>
                </>
              )}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              El estado se calcula solo desde agendas y jornadas. Para programar, andá al Planificador.
            </p>
          </DialogHeader>

          {loading || !trabajo ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
            <Tabs defaultValue="resumen">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="agenda">Agenda ({programaciones.length})</TabsTrigger>
                <TabsTrigger value="jornadas">Jornadas ({jornadas.length})</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="space-y-3 pt-3">
                <Row k="Tipo">{trabajo.tipo_trabajo}</Row>
                <Row k="Horas reales acumuladas">{horasTotal} hs</Row>
                {trabajo.cerrado_en && (
                  <Row k="Cerrado el">{new Date(trabajo.cerrado_en).toLocaleString("es-PY")}</Row>
                )}
                <div>
                  <div className="text-xs text-muted-foreground">Problema</div>
                  <div className="rounded-md bg-muted/40 p-2 text-sm">{trabajo.descripcion_problema}</div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar datos
                  </Button>
                  {puedeAdmin && !trabajo.cerrado_en && (
                    <Button size="sm" onClick={cerrarTrabajo}>
                      Cerrar trabajo
                    </Button>
                  )}
                  {puedeAdmin && trabajo.cerrado_en && (
                    <Button size="sm" variant="outline" onClick={reabrirTrabajo}>
                      Reabrir trabajo
                    </Button>
                  )}
                  {puedeAdmin && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={eliminar}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Un trabajo solo pasa a <b>Completado</b> cuando se cierra manualmente. Mientras tenga jornadas incompletas y sin agendas futuras, queda en <b>En pausa</b>.
                </p>
              </TabsContent>


              <TabsContent value="agenda" className="space-y-2 pt-3">
                <p className="text-xs text-muted-foreground">
                  Cada agenda es una fecha prevista de trabajo. Se programa desde el Planificador o Calendario.
                </p>
                {programaciones.length === 0 && <p className="text-xs text-muted-foreground">Sin fechas agendadas.</p>}
                {programaciones.map(p => {
                  const jornadasVinc = jornadasPorProg.get(p.id) ?? [];
                  const usada = jornadasVinc.length > 0;
                  return (
                    <div key={p.id} className="rounded-md border p-2.5 space-y-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{p.fecha_programada}</div>
                          {usada && <Badge variant="outline" className="mt-1 text-[10px]">Con jornada cargada</Badge>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => eliminarProgramacion(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Técnico: <span className="text-foreground">{p.tecnico_principal_id ? profileMap.get(p.tecnico_principal_id)?.nombre ?? "—" : "—"}</span>
                        {p.auxiliares?.length > 0 && <> · Aux: {p.auxiliares.map((a: string) => profileMap.get(a)?.nombre).filter(Boolean).join(", ")}</>}
                      </div>
                      {p.observacion && <div className="text-xs text-muted-foreground">{p.observacion}</div>}
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="jornadas" className="space-y-2 pt-3">
                <div className="text-xs text-muted-foreground">Total acumulado: <b>{horasTotal} hs</b> en {jornadas.length} jornada(s)</div>
                {jornadas.length === 0 && <p className="text-xs text-muted-foreground">Sin jornadas registradas.</p>}
                {jornadas.map(j => (
                  <div key={j.id} className="rounded-md border p-2.5 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{j.fecha_real} · {profileMap.get(j.tecnico_id)?.nombre ?? "—"}</div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{ESTADOS_JORNADA.find(e => e.key === j.estado_jornada)?.label ?? j.estado_jornada}</Badge>
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
                    <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{JSON.stringify(h.payload, null, 0)}</pre>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <NuevoTrabajoDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clientes={clientes}
        trabajo={trabajo}
        onSaved={() => { cargar(); onChanged(); }}
      />
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
