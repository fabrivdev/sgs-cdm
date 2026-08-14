import { useEffect, useMemo, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, ClipboardList, Clock, MoreVertical, PauseCircle, Pencil, PlayCircle, Trash2, User, Users } from "lucide-react";
import { PRIORIDADES, prioridadBadge, estadoTrabajoLabel, estadoTrabajoDesdeJornadas, trabajoOsNumero, trabajoPausado, trabajoReferencia } from "@/lib/trabajos";
import { ESTADO_LABELS, DIAS_JORNADA_VENCIDA, type Estado, type Sucursal } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ProgramarIntervencionDialog } from "./ProgramarIntervencionDialog";
import { CargarJornadaDialog } from "./CargarJornadaDialog";
import { NuevoTrabajoDialog } from "./NuevoTrabajoDialog";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface Jornada {
  id: string;
  servicio_id: string;
  fecha: string;
  estado: Estado;
  horas_trabajadas: number | null;
  observaciones: string | null;
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
}

interface ServicioBaseCrew {
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
}

interface OrdenServicioImportada {
  os_numero: string;
  tipo_tiempo: string | null;
  servicios_cantidad: number | null;
  terceros_valor: number | null;
  kilometro_valor: number | null;
  servicios_valor: number | null;
  repuesto_valor: number | null;
  factura: string | null;
  situacion_os: string | null;
  situacion_facturacion: string | null;
  problema: string | null;
  actualizado_en: string | null;
}

interface Props {
  trabajoId: string | null;
  onOpenChange: (o: boolean) => void;
  clientes: Cliente[];
  tecnicos: Profile[];
  profileMap: Map<string, Profile>;
  clienteMap: Map<string, Cliente>;
  onChanged: () => void;
}

const startToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function jornadaTone(j: Jornada) {
  if (j.estado === "Completado") return "border-l-emerald-500 bg-emerald-50/30";
  if (j.estado === "Cancelada") return "border-l-orange-500 bg-orange-50/30";
  return differenceInCalendarDays(startToday(), parseISO(j.fecha)) > DIAS_JORNADA_VENCIDA
    ? "border-l-amber-500 bg-amber-50/40"
    : "border-l-blue-400 bg-card";
}

function badgeTone(j: Jornada) {
  if (j.estado === "Completado") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (j.estado === "Cancelada") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-blue-100 text-blue-800 border-blue-200";
}

function osDesdeHistorial(payload: any): OrdenServicioImportada | null {
  if (!payload || payload.tipo !== "orden_servicio_importada") return null;
  return {
    os_numero: String(payload.os_numero ?? ""),
    tipo_tiempo: payload.tipo_tiempo ?? null,
    servicios_cantidad: Number(payload.servicios_cantidad ?? 0),
    terceros_valor: Number(payload.terceros_valor ?? 0),
    kilometro_valor: Number(payload.kilometro_valor ?? 0),
    servicios_valor: Number(payload.servicios_valor ?? 0),
    repuesto_valor: Number(payload.repuesto_valor ?? 0),
    factura: payload.factura ?? null,
    situacion_os: payload.situacion_os ?? null,
    situacion_facturacion: payload.situacion_facturacion ?? null,
    problema: payload.problema ?? null,
    actualizado_en: payload.actualizado_en ?? null,
  };
}

export function TrabajoDetalleDrawer({
  trabajoId,
  onOpenChange,
  clientes,
  tecnicos,
  profileMap,
  clienteMap,
  onChanged,
}: Props) {
  const { isAdmin, isCabecilla } = useAuth();
  const [trabajo, setTrabajo] = useState<any | null>(null);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [servicioBaseCrew, setServicioBaseCrew] = useState<ServicioBaseCrew | null>(null);
  const [ordenServicio, setOrdenServicio] = useState<OrdenServicioImportada | null>(null);
  const [osImportDisponible, setOsImportDisponible] = useState(true);
  const [rolesTecnico, setRolesTecnico] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [programarOpen, setProgramarOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [selectedJornadaId, setSelectedJornadaId] = useState<string | null>(null);

  const cargar = async () => {
    if (!trabajoId) return;
    setLoading(true);
    try {
      const cargarOsHistorial = async (osNumero: string) => {
        const { data, error } = await supabase
          .from("trabajo_historial")
          .select("payload, creado_en")
          .eq("trabajo_id", trabajoId)
          .eq("tipo_evento", "observacion")
          .order("creado_en", { ascending: false })
          .limit(25);
        if (error) throw error;

        const found = ((data as any[]) ?? [])
          .map((row) => osDesdeHistorial({ ...row.payload, actualizado_en: row.payload?.actualizado_en ?? row.creado_en }))
          .find((item) => item && item.os_numero === osNumero);
        return found ?? null;
      };

      const [{ data: t, error }, { data: roles }] = await Promise.all([
        supabase.from("trabajos").select("*").eq("id", trabajoId).single(),
        supabase.from("user_roles").select("user_id, role").eq("role", "operativo"),
      ]);
      if (error) throw error;
      setTrabajo(t);
      setRolesTecnico(new Set(((roles as any[]) ?? []).map((r) => r.user_id)));

      const osNumero = trabajoOsNumero(t);
      if (osNumero) {
        const { data: osData, error: osError } = await (supabase
          .from("ordenes_servicio_importadas" as any)
          .select("os_numero, tipo_tiempo, servicios_cantidad, terceros_valor, kilometro_valor, servicios_valor, repuesto_valor, factura, situacion_os, situacion_facturacion, problema, actualizado_en")
          .eq("os_numero", osNumero)
          .maybeSingle() as any);
        if (osError) {
          const message = String(osError.message ?? "");
          const code = String(osError.code ?? "");
          if ((code === "PGRST205" || code === "42P01") && message.includes("ordenes_servicio_importadas")) {
            setOsImportDisponible(false);
            setOrdenServicio(await cargarOsHistorial(osNumero));
          } else {
            throw osError;
          }
        } else {
          setOsImportDisponible(true);
          setOrdenServicio(((osData as OrdenServicioImportada) ?? null) || await cargarOsHistorial(osNumero));
        }
      } else {
        setOrdenServicio(null);
        setOsImportDisponible(true);
      }

      if (!t.legacy_servicio_id) {
        setJornadas([]);
        setServicioBaseCrew(null);
        return;
      }
      const { data: servicioBase, error: sError } = await supabase
        .from("servicios")
        .select("tecnico_responsable_id, auxiliares")
        .eq("id", t.legacy_servicio_id)
        .maybeSingle();
      if (sError) throw sError;
      setServicioBaseCrew((servicioBase as ServicioBaseCrew) ?? null);

      const { data, error: jError } = await supabase
        .from("servicio_jornadas")
        .select("id, servicio_id, fecha, estado, horas_trabajadas, observaciones, tecnico_responsable_id, auxiliares")
        .eq("servicio_id", t.legacy_servicio_id)
        .order("fecha", { ascending: false });
      if (jError) throw jError;
      setJornadas(((data as any[]) ?? []) as Jornada[]);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cargar el trabajo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trabajoId) cargar();
    else {
      setTrabajo(null);
      setJornadas([]);
      setServicioBaseCrew(null);
      setOrdenServicio(null);
      setOsImportDisponible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoId]);

  const resumen = useMemo(() => ({
    pendientes: jornadas.filter((j) => j.estado === "Pendiente"),
    realizadas: jornadas.filter((j) => j.estado === "Completado"),
    noRealizadas: jornadas.filter((j) => j.estado === "Cancelada"),
    vencidas: jornadas.filter((j) => j.estado === "Pendiente" && differenceInCalendarDays(startToday(), parseISO(j.fecha)) > DIAS_JORNADA_VENCIDA),
    horas: jornadas.reduce((acc, j) => acc + (j.estado === "Completado" ? Number(j.horas_trabajadas) || 0 : 0), 0),
  }), [jornadas]);

  const tecnicosOnly = useMemo(
    () => tecnicos.filter((t) => rolesTecnico.size === 0 || rolesTecnico.has(t.id)),
    [tecnicos, rolesTecnico],
  );
  const defaultCrew = useMemo(() => {
    const selected = selectedJornadaId ? jornadas.find((j) => j.id === selectedJornadaId) : null;
    const fromSelected = selected && (selected.tecnico_responsable_id || (selected.auxiliares?.length ?? 0) > 0) ? selected : null;
    const fromPending = jornadas.find((j) => j.estado === "Pendiente" && (j.tecnico_responsable_id || (j.auxiliares?.length ?? 0) > 0));
    const fromLatest = jornadas.find((j) => j.tecnico_responsable_id || (j.auxiliares?.length ?? 0) > 0);
    const source = fromSelected ?? fromPending ?? fromLatest ?? servicioBaseCrew ?? null;
    return {
      tecnico_id: source?.tecnico_responsable_id ?? null,
      auxiliares: source?.auxiliares ?? [],
    };
  }, [jornadas, selectedJornadaId, servicioBaseCrew]);

  if (!trabajoId) return null;

  const open = !!trabajoId && !programarOpen && !cargarOpen && !editOpen;
  const estado = trabajo ? estadoTrabajoDesdeJornadas(jornadas, trabajo.estado_general) : "pendiente";
  const cliente = trabajo ? clienteMap.get(trabajo.cliente_id) : null;
  const pausado = trabajoPausado(trabajo);
  const hint = jornadas.length === 0
    ? "Aun no tiene jornadas programadas."
    : pausado
      ? "Trabajo pausado por un impedimento operativo."
    : resumen.pendientes.length > 0
      ? "Tiene jornadas pendientes de cierre."
      : "Todas las jornadas tienen resultado.";
  const canManage = isAdmin || isCabecilla;

  const pausarTrabajo = async () => {
    if (!trabajo) return;
    const motivo = pauseReason.trim();
    if (!motivo) {
      toast.error("Carga el motivo de la pausa");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("trabajos")
        .update({ estado_general: "bloqueado" as any, motivo_bloqueo: motivo })
        .eq("id", trabajo.id);
      if (error) throw error;
      toast.success("Trabajo pausado");
      setPauseOpen(false);
      setPauseReason("");
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo pausar el trabajo");
    } finally {
      setLoading(false);
    }
  };

  const reactivarTrabajo = async () => {
    if (!trabajo) return;
    setLoading(true);
    try {
      const estadoBase = estadoTrabajoDesdeJornadas(jornadas, "pendiente");
      const { error } = await supabase
        .from("trabajos")
        .update({ estado_general: estadoBase as any, motivo_bloqueo: null })
        .eq("id", trabajo.id);
      if (error) throw error;
      toast.success("Trabajo reactivado");
      await cargar();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo reactivar el trabajo");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!trabajo) return;
    setLoading(true);
    try {
      if (trabajo.legacy_servicio_id) {
        const { error: jError } = await supabase
          .from("servicio_jornadas")
          .delete()
          .eq("servicio_id", trabajo.legacy_servicio_id);
        if (jError) throw jError;

        const { error: sError } = await supabase
          .from("servicios")
          .delete()
          .eq("id", trabajo.legacy_servicio_id);
        if (sError) throw sError;
      }

      const { error } = await supabase.from("trabajos").delete().eq("id", trabajo.id);
      if (error) throw error;

      toast.success("Trabajo eliminado");
      setConfirmDelete(false);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar el trabajo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="xl">
        <ResponsiveDrawerHeader>
          {!trabajo ? (
            <div className="text-[13px] text-muted-foreground">Cargando...</div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2 pr-8">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-mono font-semibold text-muted-foreground">
                    {trabajoReferencia(trabajo)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{trabajo.sucursal}</Badge>
                  <Badge variant="outline" className="text-[10px]">{trabajo.marca}</Badge>
                  <Badge className={cn("text-[10px]", prioridadBadge(trabajo.prioridad))}>
                    {PRIORIDADES.find((p) => p.key === trabajo.prioridad)?.label}
                  </Badge>
                  <Badge
                    variant={pausado ? "default" : "secondary"}
                    className={cn("text-[10px]", pausado && "bg-amber-600 text-white")}
                  >
                    {estadoTrabajoLabel(estado)}
                  </Badge>
                </div>
                <h2 className="text-[14px] font-semibold leading-tight">{cliente?.nombre ?? "Sin cliente"}</h2>
                <p className="text-[12px] text-muted-foreground">{hint}</p>
              </div>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar trabajo
                    </DropdownMenuItem>
                    {pausado ? (
                      <DropdownMenuItem onClick={reactivarTrabajo}>
                        <PlayCircle className="mr-2 h-4 w-4" /> Reactivar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          setPauseReason(trabajo.motivo_bloqueo ?? "");
                          setPauseOpen(true);
                        }}
                      >
                        <PauseCircle className="mr-2 h-4 w-4" /> Pausar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setConfirmDelete(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar trabajo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </ResponsiveDrawerHeader>

        <ResponsiveDrawerBody className="space-y-5">
          {loading || !trabajo ? (
            <p className="text-[13px] text-muted-foreground">Cargando...</p>
          ) : (
            <>
              <section className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Resumen del trabajo</h3>
                {pausado && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Trabajo pausado</div>
                    <div className="mt-1 text-[13px] text-amber-950">{trabajo.motivo_bloqueo || "Sin motivo cargado"}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-muted-foreground">Problema reportado</div>
                  <div className="text-[13px]">{trabajo.descripcion_problema}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  <Stat k="Tipo" v={trabajo.tipo_trabajo} />
                  <Stat k="Jornadas" v={String(jornadas.length)} />
                  <Stat k="Pendientes" v={String(resumen.pendientes.length)} warn={resumen.vencidas.length > 0} />
                  <Stat k="Realizadas" v={String(resumen.realizadas.length)} />
                  <Stat k="No realizadas" v={String(resumen.noRealizadas.length)} />
                  <Stat k="Horas acumuladas" v={`${resumen.horas} hs`} />
                </div>
              </section>

              {(ordenServicio || trabajoOsNumero(trabajo)) && (
                <section className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Orden de servicio importada
                      </h3>
                      <div className="mt-1 text-[13px] font-semibold">{trabajoReferencia(trabajo)}</div>
                    </div>
                    {ordenServicio?.actualizado_en && (
                      <Badge variant="outline" className="text-[10px]">
                        Actualizado {format(parseISO(ordenServicio.actualizado_en), "dd/MM/yyyy")}
                      </Badge>
                    )}
                  </div>

                  {!ordenServicio ? (
                    <div className="rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
                      {osImportDisponible
                        ? "Esta OS esta asociada al trabajo, pero todavia no tiene datos importados del Excel."
                        : "La tabla de detalle OS todavia no esta disponible en la base. Cuando Lovable aplique la migracion, aca se vera el detalle importado."}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                        <Stat k="Tipo de tiempo" v={ordenServicio.tipo_tiempo ?? "—"} />
                        <Stat k="Horas OS" v={`${Number(ordenServicio.servicios_cantidad ?? 0)} hs`} />
                        <Stat k="Factura" v={ordenServicio.factura ?? "—"} />
                        <Stat k="Situacion OS" v={ordenServicio.situacion_os ?? "—"} />
                        <Stat k="Terceros" v={formatCurrency(ordenServicio.terceros_valor)} />
                        <Stat k="Kilometro" v={formatCurrency(ordenServicio.kilometro_valor)} />
                        <Stat k="Servicios" v={formatCurrency(ordenServicio.servicios_valor)} />
                        <Stat k="Repuesto" v={formatCurrency(ordenServicio.repuesto_valor)} />
                      </div>
                      {ordenServicio.problema && ordenServicio.problema !== trabajo.descripcion_problema && (
                        <div>
                          <div className="text-[11px] text-muted-foreground">Problema segun OS</div>
                          <div className="text-[13px]">{ordenServicio.problema}</div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Jornadas</h3>
                {jornadas.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-[12px] text-muted-foreground">
                    Todavia no hay jornadas.
                  </div>
                )}
                {jornadas.map((j) => {
                  const principal = j.tecnico_responsable_id ? profileMap.get(j.tecnico_responsable_id)?.nombre : null;
                  const aux = (j.auxiliares ?? []).map((id) => profileMap.get(id)?.nombre).filter(Boolean);
                  const vencida = j.estado === "Pendiente" && differenceInCalendarDays(startToday(), parseISO(j.fecha)) > DIAS_JORNADA_VENCIDA;
                  return (
                    <div key={j.id} className={cn("rounded-lg border border-l-4 p-3", jornadaTone(j))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[13px]">{format(parseISO(j.fecha), "dd/MM/yyyy")}</span>
                            <span className="text-[11px] text-muted-foreground capitalize">
                              {format(parseISO(j.fecha), "EEEE", { locale: es })}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px] border", badgeTone(j))}>
                              {ESTADO_LABELS[j.estado]}
                            </Badge>
                            {vencida && <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-800">Sin cierre +7d</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                            {principal && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{principal}</span>}
                            {aux.length > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{aux.join(", ")}</span>}
                            {j.horas_trabajadas != null && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{j.horas_trabajadas} hs</span>}
                          </div>
                          {j.observaciones && <p className="text-[11px] text-muted-foreground italic">"{j.observaciones}"</p>}
                        </div>
                        {j.estado === "Pendiente" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedJornadaId(j.id);
                              setCargarOpen(true);
                            }}
                          >
                            Cargar resultado
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </ResponsiveDrawerBody>

        <ResponsiveDrawerFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {trabajo && resumen.pendientes.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedJornadaId(null);
                setCargarOpen(true);
              }}
            >
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Cargar resultado
            </Button>
          )}
          {trabajo && (isAdmin || isCabecilla) && !pausado && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPauseReason(trabajo.motivo_bloqueo ?? "");
                  setPauseOpen(true);
                }}
              >
                <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Pausar
              </Button>
              <Button size="sm" onClick={() => setProgramarOpen(true)}>
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Programar jornada
              </Button>
            </>
          )}
          {trabajo && (isAdmin || isCabecilla) && pausado && (
            <Button size="sm" onClick={reactivarTrabajo}>
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Reactivar
            </Button>
          )}
        </ResponsiveDrawerFooter>
      </ResponsiveDrawer>

      {trabajo && (
        <ProgramarIntervencionDialog
          open={programarOpen}
          onOpenChange={setProgramarOpen}
          trabajoId={trabajo.id}
          trabajos={[trabajo]}
          clientes={clientes}
          tecnicos={tecnicosOnly}
          onSaved={() => { cargar(); onChanged(); }}
        />
      )}

      {trabajo && (
        <CargarJornadaDialog
          open={cargarOpen}
          onOpenChange={setCargarOpen}
          trabajoId={trabajo.id}
          legacyServicioId={trabajo.legacy_servicio_id}
          tecnicos={tecnicosOnly}
          jornadas={jornadas.filter((j) => j.estado === "Pendiente")}
          initialJornadaId={selectedJornadaId}
          defaultTecnicoId={defaultCrew.tecnico_id}
          defaultAuxiliares={defaultCrew.auxiliares}
          onSaved={() => { cargar(); onChanged(); }}
        />
      )}

      {trabajo && (
        <NuevoTrabajoDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          clientes={clientes}
          trabajo={trabajo}
          onSaved={() => {
            cargar();
            onChanged();
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar este trabajo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Se eliminara el caso, sus jornadas y los datos ligados a su planificacion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar trabajo</AlertDialogTitle>
            <AlertDialogDescription>
              Usa esta pausa cuando no se puede continuar por repuestos, aprobacion, espera del cliente u otro impedimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Textarea
              rows={4}
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Ej: En espera de repuestos para continuar la reparacion..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={pausarTrabajo} disabled={loading || !pauseReason.trim()}>
              {loading ? "Guardando..." : "Pausar trabajo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className={cn("text-[13px] font-medium", warn && "text-amber-700")}>{v}</div>
    </div>
  );
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return "USD 0";
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
