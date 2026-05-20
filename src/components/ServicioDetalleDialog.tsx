import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { ESTADOS, ESTADO_LABELS, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, MapPin, MoreVertical, Pencil, Trash2, Wrench, X } from "lucide-react";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ProgramarIntervencionDialog } from "@/components/trabajos/ProgramarIntervencionDialog";
import { cn } from "@/lib/utils";

interface Servicio {
  id: string;
  fecha_programada: string;
  dia_semana: string;
  semana: number;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  cliente_id: string | null;
  marca: Marca;
  tipo_trabajo: TipoTrabajo;
  trabajo_descripcion: string;
  estado: Estado;
  observaciones: string | null;
  horas_trabajadas: number | null;
}

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Jornada {
  id: string;
  servicio_id: string;
  fecha: string;
  horas_trabajadas: number | null;
  estado: Estado;
  observaciones: string | null;
}

interface Props {
  servicio: Servicio | null;
  onOpenChange: (o: boolean) => void;
  profiles: Profile[];
  clientes: Cliente[];
  onChanged: () => void;
  /** Fecha (yyyy-MM-dd) desde la que se abrió el detalle, para destacar esa jornada */
  fechaContexto?: string;
}

export function ServicioDetalleDialog({
  servicio,
  onOpenChange,
  profiles,
  clientes,
  onChanged,
  fechaContexto,
}: Props) {
  const { user, isAdmin, isCabecilla } = useAuth();

  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Jornadas
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loadingJornadas, setLoadingJornadas] = useState(false);
  const [confirmDeleteJornadaId, setConfirmDeleteJornadaId] = useState<string | null>(null);
  const [trabajoMadre, setTrabajoMadre] = useState<{
    id: string;
    codigo: string | null;
    descripcion_problema: string;
    cliente_id: string | null;
    sucursal: Sucursal;
    marca: Marca;
    tipo_trabajo: TipoTrabajo;
    estado_general: string;
    prioridad?: string;
    legacy_servicio_id?: string | null;
  } | null>(null);
  const [programarOpen, setProgramarOpen] = useState(false);

  // Cache de cambios pendientes por jornada (id -> patch)
  const [edits, setEdits] = useState<Record<string, Partial<Jornada>>>({});

  const [clientesAll, setClientesAll] = useState<Cliente[]>([]);
  const [adminCabIds, setAdminCabIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("user_roles").select("user_id, role").then(({ data }) => {
      const s = new Set<string>();
      for (const r of (data ?? []) as Array<{ user_id: string; role: string }>) {
        if (r.role === "admin" || r.role === "cabecilla") s.add(r.user_id);
      }
      setAdminCabIds(s);
    });
  }, []);


  useEffect(() => {
    if (!servicio) return;

    const loadClientes = async () => {
      const PAGE = 1000;
      let from = 0;
      const all: Cliente[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nombre, sucursal")
          .order("nombre", { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) {
          console.error(error);
          toast.error("No se pudo cargar el nombre del cliente");
          return;
        }

        if (!data || data.length === 0) break;
        all.push(...((data ?? []) as Cliente[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }

      setClientesAll(all);
    };

    loadClientes();
  }, [servicio?.id]);

  const loadJornadas = async (servicioId: string) => {
    setLoadingJornadas(true);
    const { data, error } = await supabase
      .from("servicio_jornadas")
      .select("id, servicio_id, fecha, horas_trabajadas, estado, observaciones")
      .eq("servicio_id", servicioId)
      .order("fecha", { ascending: true });

    setLoadingJornadas(false);

    if (error) {
      console.error(error);
      toast.error("No se pudieron cargar las jornadas");
      return;
    }

    setJornadas((data ?? []) as Jornada[]);
    setEdits({});
  };

  useEffect(() => {
    if (servicio) {
      loadJornadas(servicio.id);
      supabase
        .from("trabajos")
        .select("id, codigo, descripcion_problema, cliente_id, sucursal, marca, tipo_trabajo, estado_general, prioridad, legacy_servicio_id")
        .eq("legacy_servicio_id", servicio.id)
        .maybeSingle()
        .then(({ data }) => {
          setTrabajoMadre((data as any) ?? null);
        });
    } else {
      setJornadas([]);
      setEdits({});
      setTrabajoMadre(null);
    }
  }, [servicio?.id]);

  const profById = useMemo(() => {
    return Object.fromEntries(profiles.map((p) => [p.id, p.nombre]));
  }, [profiles]);

  const cliById = useMemo(() => {
    const fuente = clientesAll.length > 0 ? clientesAll : clientes;
    return Object.fromEntries(fuente.map((c) => [c.id, c.nombre]));
  }, [clientesAll, clientes]);

  if (!servicio) return null;

  const isAssigned =
    user &&
    (servicio.tecnico_responsable_id === user.id || servicio.auxiliares.includes(user.id));

  const canEdit = isAdmin || isCabecilla || isAssigned;
  const canManage = isAdmin || isCabecilla;
  const tipo = servicio.tipo_trabajo ?? "Visita de campo";

  const clienteNombre = servicio.cliente_id
    ? cliById[servicio.cliente_id] ?? "Cliente no encontrado"
    : "—";

  // Total horas acumulado (incluyendo cambios sin guardar)
  const totalHoras = jornadas.reduce((acc, j) => {
    const v = edits[j.id]?.horas_trabajadas ?? j.horas_trabajadas;
    return acc + (typeof v === "number" ? v : 0);
  }, 0);

  const jornadaPatch = (id: string, patch: Partial<Jornada>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const fechasExistentes = new Set(jornadas.map((j) => j.fecha));

  /*
    Sincroniza el Trabajo madre según el estado real de sus jornadas:
    - si alguna jornada está Iniciado  => trabajo Iniciado
    - si todas están Completado        => trabajo Completado
    - si existe al menos una pendiente => trabajo Programado
    Esto evita completar dos veces o que Planificador y Trabajos queden separados.
  */
  const estadoTrabajoDesdeJornadas = (lista: Jornada[]) => {
    const activas = lista.filter(j => j.estado !== "Cancelada");
    if (activas.length === 0) return "pendiente";
    const pendientes = activas.filter(j => j.estado === "Pendiente").length;
    const completadas = activas.filter(j => j.estado === "Completado").length;
    if (completadas === 0) return "programado";
    if (pendientes === 0) return "completado";
    return "iniciado";
  };

  const syncTrabajoMadre = async (servicioId: string, lista: Jornada[]) => {
    const estado_general = estadoTrabajoDesdeJornadas(lista);
    const ultimaFecha = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;

    const payload: any = {
      estado_general,
      fecha_compromiso: ultimaFecha,
    };

    if (estado_general === "completado") {
      payload.cerrado_en = new Date().toISOString();
      payload.cerrado_por = user?.id ?? null;
    } else {
      payload.cerrado_en = null;
      payload.cerrado_por = null;
    }

    const { error } = await supabase
      .from("trabajos")
      .update(payload)
      .eq("legacy_servicio_id", servicioId);

    if (error) {
      console.error(error);
      toast.error("Se actualizó la jornada, pero no se pudo sincronizar el trabajo madre");
    }
  };


  const deleteJornada = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from("servicio_jornadas").delete().eq("id", id);
    setBusy(false);
    setConfirmDeleteJornadaId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    const nuevaLista = jornadas.filter((j) => j.id !== id);
    await syncTrabajoMadre(servicio.id, nuevaLista);
    toast.success("Jornada eliminada");
    await loadJornadas(servicio.id);
    onChanged();
  };

  const save = async () => {
    const dirtyIds = Object.keys(edits).filter((id) => Object.keys(edits[id] ?? {}).length > 0);
    if (dirtyIds.length === 0) {
      onOpenChange(false);
      return;
    }

    setBusy(true);

    for (const id of dirtyIds) {
      const patch = edits[id];
      const payload: any = {};
      if ("estado" in patch) payload.estado = patch.estado;
      if ("horas_trabajadas" in patch) payload.horas_trabajadas = patch.horas_trabajadas;
      if ("observaciones" in patch) payload.observaciones = patch.observaciones;

      const { error } = await supabase.from("servicio_jornadas").update(payload).eq("id", id);
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
    }

    // Sync legado: el servicio padre refleja la jornada más reciente (snapshot)
    const merged = jornadas
      .map((j) => ({ ...j, ...edits[j.id] }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const ultima = merged[merged.length - 1];
    if (ultima) {
      await supabase
        .from("servicios")
        .update({
          estado: ultima.estado,
          horas_trabajadas: totalHoras > 0 ? totalHoras : null,
          observaciones: ultima.observaciones,
        })
        .eq("id", servicio.id);
    }

    // Sync nuevo: el Trabajo madre se mueve automáticamente según el estado de todas las jornadas.
    await syncTrabajoMadre(servicio.id, merged);

    setBusy(false);
    toast.success("Jornadas actualizadas");
    onChanged();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await supabase.from("servicios").delete().eq("id", servicio.id);
    setBusy(false);
    setConfirmDelete(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Servicio eliminado");
      onChanged();
      onOpenChange(false);
    }
  };

  const dirty = Object.values(edits).some((p) => p && Object.keys(p).length > 0);

  return (
    <>
      <ResponsiveDrawer open={!!servicio && !editOpen} onOpenChange={onOpenChange} size="xl">
        <ResponsiveDrawerHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap pr-8 text-base font-semibold">
              {trabajoMadre?.codigo && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                  {trabajoMadre.codigo}
                </span>
              )}
              Detalle del servicio
              <MarcaBadge marca={servicio.marca} />
              <Badge variant="outline" className="gap-1 text-[10px]">
                {tipo === "Máquina en taller" ? (
                  <Wrench className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {tipo}
              </Badge>
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
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ResponsiveDrawerHeader>

        <ResponsiveDrawerBody>
          <div className="space-y-3 text-sm">

            <Row k="Sucursal" v={servicio.sucursal} />
            <Row k="Cliente" v={clienteNombre} />
            <Row
              k="Responsable"
              v={servicio.tecnico_responsable_id ? profById[servicio.tecnico_responsable_id] ?? "—" : "—"}
            />
            <Row
              k="Auxiliares"
              v={servicio.auxiliares.map((a) => profById[a]).filter(Boolean).join(", ") || "—"}
            />

            <div>
              <div className="text-xs text-muted-foreground">Trabajo o problema a resolver</div>
              <div className="rounded-md bg-muted/40 p-2 text-sm">
                {servicio.trabajo_descripcion}
              </div>
            </div>

            {/* Jornadas */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Jornadas{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({jornadas.length}) · Total {totalHoras || 0} hs
                  </span>
                </Label>

                {canEdit && trabajoMadre && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setProgramarOpen(true)}
                  >
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                    Continuar en otra fecha
                  </Button>
                )}
              </div>

              {loadingJornadas && (
                <p className="text-xs text-muted-foreground">Cargando jornadas…</p>
              )}

              {!loadingJornadas && jornadas.length === 0 && (
                <p className="text-xs text-muted-foreground">Este servicio aún no tiene jornadas.</p>
              )}

              <div className="space-y-2">
                {jornadas.map((j) => {
                  const merged = { ...j, ...edits[j.id] };
                  const isContexto = fechaContexto && j.fecha === fechaContexto;

                  return (
                    <div
                      key={j.id}
                      className={cn(
                        "rounded-md border p-2.5 space-y-2",
                        isContexto && "ring-2 ring-primary/40 border-primary/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold capitalize">
                          {format(parseISO(j.fecha), "EEE d 'de' MMM yyyy", { locale: es })}
                        </div>

                        <div className="flex items-center gap-1">
                          <EstadoBadge estado={merged.estado} className="text-[10px]" />
                          {canManage && jornadas.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteJornadaId(j.id)}
                              title="Quitar esta fecha"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {canEdit ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Estado</Label>
                              <Select
                                value={merged.estado}
                                onValueChange={(v) => jornadaPatch(j.id, { estado: v as Estado })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ESTADOS.map((e) => (
                                    <SelectItem key={e} value={e}>
                                      {ESTADO_LABELS[e]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">
                                Horas
                              </Label>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                className="h-8 text-xs"
                                value={merged.horas_trabajadas ?? ""}
                                onChange={(e) =>
                                  jornadaPatch(j.id, {
                                    horas_trabajadas: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Observaciones</Label>
                            <Textarea
                              rows={2}
                              className="text-xs"
                              value={merged.observaciones ?? ""}
                              onChange={(e) => jornadaPatch(j.id, { observaciones: e.target.value || null })}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs space-y-1">
                          <div className="text-muted-foreground">
                            Horas: <span className="text-foreground">{merged.horas_trabajadas ?? "—"}</span>
                          </div>
                          {merged.observaciones && (
                            <div className="text-muted-foreground">
                              Obs: <span className="text-foreground">{merged.observaciones}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ResponsiveDrawerBody>

        {canEdit && (
          <ResponsiveDrawerFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={save} disabled={busy || !dirty}>
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </ResponsiveDrawerFooter>
        )}
      </ResponsiveDrawer>


      {canManage && (
        <ServicioFormDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) onOpenChange(false);
          }}
          servicio={servicio}
          profiles={profiles}
          clientes={clientesAll.length > 0 ? clientesAll : clientes}
          onSaved={() => {
            onChanged();
          }}
        />
      )}

      {trabajoMadre && (
        <ProgramarIntervencionDialog
          open={programarOpen}
          onOpenChange={setProgramarOpen}
          trabajoId={trabajoMadre.id}
          trabajos={[trabajoMadre as any]}
          clientes={clientesAll.length > 0 ? clientesAll : clientes}
          tecnicos={profiles.filter((p) => !adminCabIds.has(p.id))}
          onSaved={() => {
            loadJornadas(servicio.id);
            onChanged();
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el servicio, todas sus jornadas y sus datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteJornadaId} onOpenChange={(o) => !o && setConfirmDeleteJornadaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar esta jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              El servicio dejará de aparecer en esa fecha. Esta acción no afecta a las demás jornadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteJornadaId && deleteJornada(confirmDeleteJornadaId)}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Quitando…" : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm text-right">{v}</span>
    </div>
  );
}
