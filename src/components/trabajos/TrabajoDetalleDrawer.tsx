import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CalendarPlus,
  ClipboardList,
  Pencil,
  Trash2,
  ChevronDown,
  Clock,
  User as UserIcon,
  Users,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { PRIORIDADES, prioridadBadge, estadoTrabajoLabel, normalizarEstadoTrabajo } from "@/lib/trabajos";
import {
  unificarFechas,
  resumenTrabajo,
  calcularProximaAccion,
  ESTADO_FILA_LABEL,
  estadoFilaBadge,
  estadoFilaBorde,
  ESTADO_TRABAJO_HINT,
  type ProgramacionRow,
  type JornadaRow,
  type FilaUnificada,
} from "@/lib/trabajo-derivado";
import { humanizarEvento } from "@/lib/historial";
import { cn } from "@/lib/utils";
import type { Sucursal } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";
import { ProgramarIntervencionDialog } from "./ProgramarIntervencionDialog";
import { CargarJornadaDialog } from "./CargarJornadaDialog";

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

export function TrabajoDetalleDrawer({
  trabajoId, onOpenChange, clientes, tecnicos, profileMap, clienteMap, onChanged,
}: Props) {
  const { isAdmin, isCabecilla } = useAuth();
  const puedeAdmin = isAdmin || isCabecilla;

  const [trabajo, setTrabajo] = useState<any | null>(null);
  const [programaciones, setProgramaciones] = useState<ProgramacionRow[]>([]);
  const [jornadas, setJornadas] = useState<JornadaRow[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tecnicosRoleIds, setTecnicosRoleIds] = useState<Set<string>>(new Set());

  // Subflujos
  const [editOpen, setEditOpen] = useState(false);
  const [programarOpen, setProgramarOpen] = useState(false);
  const [cargarJornadaOpen, setCargarJornadaOpen] = useState(false);

  const cargar = async () => {
    if (!trabajoId) return;
    setLoading(true);
    try {
      const [t, p, j, h, roles] = await Promise.all([
        supabase.from("trabajos").select("*").eq("id", trabajoId).single(),
        supabase.from("programaciones").select("*").eq("trabajo_id", trabajoId).order("fecha_programada", { ascending: false }),
        supabase.from("jornadas").select("*").eq("trabajo_id", trabajoId).order("fecha_real", { ascending: false }),
        supabase.from("trabajo_historial").select("*").eq("trabajo_id", trabajoId).order("creado_en", { ascending: false }),
        supabase.from("user_roles").select("user_id, role").eq("role", "tecnico"),
      ]);
      if (t.error) toast.error(t.error.message);
      else setTrabajo(t.data);
      setProgramaciones((p.data as any) ?? []);
      setJornadas((j.data as any) ?? []);
      setHistorial(h.data ?? []);
      setTecnicosRoleIds(new Set(((roles.data as any[]) ?? []).map((r) => r.user_id)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trabajoId) cargar();
    else {
      setTrabajo(null);
      setProgramaciones([]); setJornadas([]); setHistorial([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoId]);

  const tecnicosOnly = useMemo(
    () => tecnicos.filter((t) => tecnicosRoleIds.has(t.id) || tecnicosRoleIds.size === 0),
    [tecnicos, tecnicosRoleIds],
  );

  const filas: FilaUnificada[] = useMemo(
    () => unificarFechas(programaciones, jornadas),
    [programaciones, jornadas],
  );
  const resumen = useMemo(() => resumenTrabajo(filas, jornadas), [filas, jornadas]);
  const estado = trabajo ? normalizarEstadoTrabajo(trabajo.estado_general) : "pendiente";
  const proxima = useMemo(() => calcularProximaAccion(estado, resumen), [estado, resumen]);

  const ultimaActividad = useMemo(() => {
    const all = [
      ...historial.map((h) => h.creado_en),
      ...jornadas.map((j) => j.fecha_real),
    ];
    return all.sort().reverse()[0];
  }, [historial, jornadas]);

  const eventosHumanos = useMemo(
    () => historial.map((h) => humanizarEvento(h, profileMap as any)),
    [historial, profileMap],
  );

  const cliente = trabajo ? clienteMap.get(trabajo.cliente_id) : null;

  // Acciones rápidas
  const irACargarJornada = () => setCargarJornadaOpen(true);
  const irAProgramar = () => setProgramarOpen(true);

  const eliminarTrabajo = async () => {
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

  const removerAgendaLegacy = async (fecha: string) => {
    if (!trabajo?.legacy_servicio_id) return;
    await supabase.from("servicio_jornadas")
      .delete().eq("servicio_id", trabajo.legacy_servicio_id).eq("fecha", fecha);
  };

  const eliminarProgramacion = async (p: ProgramacionRow) => {
    if (!window.confirm("¿Eliminar esta fecha?")) return;
    const { error } = await supabase.from("programaciones").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await removerAgendaLegacy(p.fecha_programada);
    await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajo.id });
    cargar(); onChanged();
  };

  const eliminarJornada = async (id: string) => {
    if (!window.confirm("¿Eliminar esta jornada?")) return;
    const { error } = await supabase.from("jornadas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.rpc("recalcular_estado_trabajo" as any, { p_trabajo_id: trabajo.id });
    cargar(); onChanged();
  };

  const handleAccion = (action: string) => {
    if (action === "programar") irAProgramar();
    else if (action === "cargar_jornada") irACargarJornada();
    else if (action === "ver_jornadas") {
      const el = document.getElementById("seccion-fechas");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action === "reabrir") {
      toast.info("Reabrir trabajo: programá una nueva fecha y se reactivará automáticamente.");
      irAProgramar();
    }
  };

  if (!trabajoId) return null;

  const open = !!trabajoId && !editOpen && !programarOpen && !cargarJornadaOpen;

  return (
    <>
      <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="xl">
        <ResponsiveDrawerHeader>
          {trabajo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold tabular-nums text-muted-foreground">
                  {trabajo.codigo ?? "TR-—"}
                </span>
                <Badge variant="outline" className="text-[10px]">{trabajo.sucursal}</Badge>
                <Badge variant="outline" className="text-[10px]">{trabajo.marca}</Badge>
                <Badge className={cn("text-[10px]", prioridadBadge(trabajo.prioridad))}>
                  {PRIORIDADES.find((p) => p.key === trabajo.prioridad)?.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {estadoTrabajoLabel(estado)}
                </Badge>
              </div>
              <h2 className="text-lg font-semibold leading-tight pr-4">
                {cliente?.nombre ?? "Sin cliente"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {ESTADO_TRABAJO_HINT[estado] ?? ""}
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          )}
        </ResponsiveDrawerHeader>

        <ResponsiveDrawerBody className="space-y-5">
          {loading || !trabajo ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              {/* Próxima acción */}
              <section
                className={cn(
                  "rounded-xl border p-4 shadow-sm",
                  proxima.tipo === "tiene_vencida"
                    ? "border-amber-200 bg-amber-50/60"
                    : proxima.tipo === "sin_pendientes_con_jornadas"
                    ? "border-emerald-200 bg-emerald-50/60"
                    : proxima.tipo === "completado"
                    ? "border-green-200 bg-green-50/60"
                    : "border-blue-200 bg-blue-50/60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-background p-2 border">
                    {proxima.tipo === "tiene_vencida" ? (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    ) : proxima.tipo === "tiene_futura" ? (
                      <Clock className="h-4 w-4 text-blue-600" />
                    ) : (
                      <CalendarPlus className="h-4 w-4 text-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{proxima.titulo}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {proxima.descripcion}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleAccion(proxima.primaria.action)}>
                        {proxima.primaria.label}
                      </Button>
                      {proxima.secundaria && (
                        <Button size="sm" variant="outline" onClick={() => handleAccion(proxima.secundaria!.action)}>
                          {proxima.secundaria.label}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Resumen operativo */}
              <section className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resumen operativo
                </h3>
                <div>
                  <div className="text-[11px] text-muted-foreground">Problema reportado</div>
                  <div className="text-sm">{trabajo.descripcion_problema}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <Stat k="Tipo" v={trabajo.tipo_trabajo} />
                  <Stat k="Fechas programadas" v={String(resumen.totalProgramaciones)} />
                  <Stat k="Fechas pendientes" v={String(resumen.pendientes.length)} accent={resumen.vencidas.length > 0 ? "warn" : undefined} />
                  <Stat k="Jornadas cargadas" v={String(resumen.totalJornadas)} />
                  <Stat k="Horas acumuladas" v={`${resumen.horasAcumuladas} hs`} />
                  <Stat
                    k="Última actividad"
                    v={ultimaActividad ? format(parseISO(ultimaActividad), "dd/MM/yyyy, HH:mm", { locale: es }) : "—"}
                  />
                </div>
              </section>

              {/* Fechas y jornadas */}
              <section id="seccion-fechas" className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fechas y jornadas
                  </h3>
                </div>


                {filas.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Todavía no hay fechas ni jornadas.
                  </div>
                )}

                <div className="space-y-2">
                  {filas.map((f) => {
                    const fechaDate = parseISO(f.fecha);
                    const principalId = f.programacion?.tecnico_principal_id ?? f.jornada?.tecnico_id;
                    const principal = principalId ? profileMap.get(principalId)?.nombre : null;
                    const aux = f.programacion?.auxiliares?.map((id) => profileMap.get(id)?.nombre).filter(Boolean) ?? [];

                    const puedeCargar = f.estado === "fecha_pendiente" || f.estado === "pendiente_cargar";

                    return (
                      <div
                        key={f.key}
                        className={cn(
                          "rounded-lg border border-l-4 bg-card p-3 space-y-2",
                          estadoFilaBorde(f.estado),
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm tabular-nums">
                                {format(fechaDate, "dd/MM/yyyy")}
                              </span>
                              <span className="text-[11px] text-muted-foreground capitalize">
                                {format(fechaDate, "EEEE", { locale: es })}
                              </span>
                              <Badge variant="outline" className={cn("text-[10px] border", estadoFilaBadge(f.estado))}>
                                {ESTADO_FILA_LABEL[f.estado]}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {principal && (
                                <span className="flex items-center gap-1">
                                  <UserIcon className="h-3 w-3" />
                                  {principal}
                                </span>
                              )}
                              {aux.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {aux.join(", ")}
                                </span>
                              )}
                              {f.jornada?.horas_reales != null && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {f.jornada.horas_reales} hs
                                </span>
                              )}
                            </div>
                            {(f.jornada?.observaciones || f.programacion?.observacion) && (
                              <p className="mt-1.5 text-[11px] text-muted-foreground italic">
                                “{f.jornada?.observaciones ?? f.programacion?.observacion}”
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {puedeCargar && (
                              <Button size="sm" variant="outline" onClick={irACargarJornada}>
                                Cargar jornada
                              </Button>
                            )}
                            {f.programacion && puedeAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => eliminarProgramacion(f.programacion!)}
                                title="Eliminar fecha"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!f.programacion && f.jornada && puedeAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => eliminarJornada(f.jornada!.id)}
                                title="Eliminar jornada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Historial */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Historial
                </h3>
                {eventosHumanos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
                ) : (
                  <ol className="relative border-l pl-4 space-y-3">
                    {eventosHumanos.map((e) => (
                      <li key={e.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {format(parseISO(e.fecha), "dd/MM/yyyy, HH:mm", { locale: es })}
                        </div>
                        <div className="text-sm">{e.texto}</div>
                        {e.detalle && Object.keys(e.detalle).length > 0 && (
                          <Collapsible>
                            <CollapsibleTrigger className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                              <ChevronDown className="h-3 w-3" /> Ver detalle técnico
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[10px]">
                                {JSON.stringify(e.detalle, null, 2)}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <Separator />

              <div className="flex flex-wrap gap-2 pb-2">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar datos
                </Button>
                {puedeAdmin && (
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={eliminarTrabajo}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar trabajo
                  </Button>
                )}
              </div>
            </>
          )}
        </ResponsiveDrawerBody>

        <ResponsiveDrawerFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {trabajo && proxima.secundaria && (
            <Button size="sm" variant="outline" onClick={() => handleAccion(proxima.secundaria!.action)}>
              {proxima.secundaria.label}
            </Button>
          )}
          {trabajo && (
            <Button size="sm" onClick={() => handleAccion(proxima.primaria.action)}>
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              {proxima.primaria.label}
            </Button>
          )}
        </ResponsiveDrawerFooter>
      </ResponsiveDrawer>

      {/* Subflujos */}
      <NuevoTrabajoDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clientes={clientes}
        trabajo={trabajo}
        onSaved={() => { cargar(); onChanged(); }}
      />

      {trabajo && (
        <ProgramarIntervencionDialog
          open={programarOpen}
          onOpenChange={setProgramarOpen}
          trabajoId={trabajo.id}
          trabajos={[{
            id: trabajo.id,
            codigo: trabajo.codigo,
            descripcion_problema: trabajo.descripcion_problema,
            cliente_id: trabajo.cliente_id,
            sucursal: trabajo.sucursal,
            marca: trabajo.marca,
            tipo_trabajo: trabajo.tipo_trabajo,
            estado_general: trabajo.estado_general,
            prioridad: trabajo.prioridad,
            legacy_servicio_id: trabajo.legacy_servicio_id,
          }]}
          clientes={clientes}
          tecnicos={tecnicosOnly}
          onSaved={() => { cargar(); onChanged(); }}
        />
      )}

      {trabajo && (
        <CargarJornadaDialog
          open={cargarJornadaOpen}
          onOpenChange={setCargarJornadaOpen}
          trabajoId={trabajo.id}
          tecnicos={tecnicosOnly}
          programaciones={programaciones
            .filter((p) => !jornadas.some((j) => j.programacion_id === p.id || j.fecha_real === p.fecha_programada))
            .map((p) => ({ id: p.id, fecha_programada: p.fecha_programada }))}
          onSaved={() => { cargar(); onChanged(); }}
        />
      )}
    </>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: "warn" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className={cn("text-sm font-medium", accent === "warn" && "text-amber-700")}>{v}</div>
    </div>
  );
}
