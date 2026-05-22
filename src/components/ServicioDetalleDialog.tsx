import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { ESTADO_LABELS, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, CheckCircle2, MapPin, MoreVertical, Pencil, RotateCcw, Trash2, Wrench, X, XCircle } from "lucide-react";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ProgramarIntervencionDialog } from "@/components/trabajos/ProgramarIntervencionDialog";
import { TecnicosPicker } from "@/components/trabajos/TecnicosPicker";
import { CargarJornadaDialog } from "@/components/trabajos/CargarJornadaDialog";
import { cn } from "@/lib/utils";
import { estadoTrabajoDesdeJornadas } from "@/lib/trabajos";

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
  tecnico_responsable_id: string | null;
  auxiliares: string[];
}

interface TrabajoMadre {
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
}

interface Props {
  servicio: Servicio | null;
  onOpenChange: (o: boolean) => void;
  profiles: Profile[];
  clientes: Cliente[];
  onChanged: () => void;
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
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [loadingJornadas, setLoadingJornadas] = useState(false);
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);
  const [confirmDeleteJornadaId, setConfirmDeleteJornadaId] = useState<string | null>(null);
  const [trabajoMadre, setTrabajoMadre] = useState<TrabajoMadre | null>(null);
  const [programarOpen, setProgramarOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);
  const [editClosedOpen, setEditClosedOpen] = useState(false);
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
      .select("id, servicio_id, fecha, horas_trabajadas, estado, observaciones, tecnico_responsable_id, auxiliares")
      .eq("servicio_id", servicioId)
      .order("fecha", { ascending: true });

    setLoadingJornadas(false);

    if (error) {
      toast.error("No se pudieron cargar las jornadas");
      return;
    }

    setJornadas((data ?? []) as Jornada[]);
    setEdits({});
  };

  useEffect(() => {
    if (!servicio) {
      setJornadas([]);
      setEdits({});
      setTrabajoMadre(null);
      setActiveJornadaId(null);
      return;
    }

    loadJornadas(servicio.id);
    supabase
      .from("trabajos")
      .select("id, codigo, descripcion_problema, cliente_id, sucursal, marca, tipo_trabajo, estado_general, prioridad, legacy_servicio_id")
      .eq("legacy_servicio_id", servicio.id)
      .maybeSingle()
      .then(({ data }) => setTrabajoMadre((data as TrabajoMadre) ?? null));
  }, [servicio?.id]);

  useEffect(() => {
    setEditClosedOpen(false);
  }, [activeJornadaId]);

  useEffect(() => {
    if (jornadas.length === 0) {
      setActiveJornadaId(null);
      return;
    }

    const byContext = fechaContexto ? jornadas.find((j) => j.fecha === fechaContexto) : null;
    const pending = jornadas.find((j) => j.estado === "Pendiente");
    const fallback = jornadas[jornadas.length - 1];
    const next = byContext ?? pending ?? fallback;

    setActiveJornadaId((current) =>
      current && jornadas.some((j) => j.id === current) ? current : next.id,
    );
  }, [jornadas, fechaContexto]);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])), [profiles]);
  const cliById = useMemo(() => {
    const fuente = clientesAll.length > 0 ? clientesAll : clientes;
    return Object.fromEntries(fuente.map((c) => [c.id, c.nombre]));
  }, [clientesAll, clientes]);

  if (!servicio) return null;

  const activeJornada = jornadas.find((j) => j.id === activeJornadaId) ?? null;
  const activeMerged = activeJornada ? { ...activeJornada, ...edits[activeJornada.id] } : null;
  const jornadaResponsableId = activeMerged?.tecnico_responsable_id ?? servicio.tecnico_responsable_id;
  const canEdit = isAdmin || isCabecilla || (!!user && jornadaResponsableId === user.id);
  const canManage = isAdmin || isCabecilla;
  const tipo = servicio.tipo_trabajo ?? "Visita de campo";
  const clienteNombre = servicio.cliente_id ? cliById[servicio.cliente_id] ?? "Cliente no encontrado" : "-";
  const jornadaResponsableNombre =
    (activeMerged?.tecnico_responsable_id && profById[activeMerged.tecnico_responsable_id]) ||
    (servicio.tecnico_responsable_id && profById[servicio.tecnico_responsable_id]) ||
    "-";
  const jornadaAuxiliares = ((activeMerged?.auxiliares?.length ? activeMerged.auxiliares : servicio.auxiliares) ?? [])
    .map((id) => profById[id])
    .filter(Boolean)
    .join(", ") || "-";

  const totalHoras = jornadas.reduce((acc, j) => {
    const v = edits[j.id]?.horas_trabajadas ?? j.horas_trabajadas;
    return acc + (typeof v === "number" ? v : 0);
  }, 0);

  const jornadaPatch = (id: string, patch: Partial<Jornada>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const activeIsPending = activeMerged?.estado === "Pendiente";
  const historial = jornadas.filter((j) => j.id !== activeJornadaId);
  const dirty = Object.values(edits).some((p) => p && Object.keys(p).length > 0);

  const syncTrabajoMadre = async (servicioId: string, lista: Jornada[]) => {
    const estado_general = estadoTrabajoDesdeJornadas(lista);
    const ultimaFecha = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;

    const payload: any = {
      estado_general,
      fecha_compromiso: ultimaFecha,
      cerrado_en: estado_general === "completado" ? new Date().toISOString() : null,
      cerrado_por: estado_general === "completado" ? user?.id ?? null : null,
    };

    const { error } = await supabase
      .from("trabajos")
      .update(payload)
      .eq("legacy_servicio_id", servicioId);

    if (error) toast.error("Se actualizo la jornada, pero no se pudo sincronizar el trabajo");
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
      if ("tecnico_responsable_id" in patch) payload.tecnico_responsable_id = patch.tecnico_responsable_id;
      if ("auxiliares" in patch) payload.auxiliares = patch.auxiliares;

      const { error } = await supabase.from("servicio_jornadas").update(payload).eq("id", id);
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
    }

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
          tecnico_responsable_id: ultima.tecnico_responsable_id,
          auxiliares: ultima.auxiliares ?? [],
        })
        .eq("id", servicio.id);
    }

    await syncTrabajoMadre(servicio.id, merged);

    setBusy(false);
    toast.success("Resultado guardado");
    onChanged();
    onOpenChange(false);
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

  return (
    <>
      <ResponsiveDrawer open={!!servicio && !editOpen} onOpenChange={onOpenChange} size="xl">
        <ResponsiveDrawerHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                {trabajoMadre?.codigo && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                    {trabajoMadre.codigo}
                  </span>
                )}
                <MarcaBadge marca={servicio.marca} />
                <Badge variant="outline" className="gap-1 text-[10px]">
                  {tipo === "Maquina en taller" || tipo === "MÃ¡quina en taller" ? (
                    <Wrench className="h-3 w-3" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  {tipo}
                </Badge>
              </div>
              <h2 className="truncate text-lg font-semibold">{clienteNombre}</h2>
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
                    <Pencil className="mr-2 h-4 w-4" /> Editar servicio
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
          <div className="space-y-4 text-sm">
            <section className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-md bg-muted/40 p-2.5 text-sm leading-snug flex-1">
                  {servicio.trabajo_descripcion}
                </div>
                <Badge variant="secondary" className="shrink-0">{servicio.sucursal}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Responsable: <span className="text-foreground">{servicio.tecnico_responsable_id ? profById[servicio.tecnico_responsable_id] ?? "-" : "-"}</span>
                </span>
                <span>
                  Auxiliares: <span className="text-foreground">{servicio.auxiliares.map((a) => profById[a]).filter(Boolean).join(", ") || "-"}</span>
                </span>
              </div>
            </section>

            {loadingJornadas && <p className="text-xs text-muted-foreground">Cargando jornadas...</p>}

            {!loadingJornadas && !activeMerged && (
              <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                Este servicio aun no tiene jornadas.
              </div>
            )}

            {activeJornada && activeMerged && (
              <section
                className={cn(
                  "rounded-lg p-4 space-y-3",
                  activeIsPending
                    ? "border-2 border-primary/30 bg-primary/5"
                    : "border bg-card shadow-sm",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {activeIsPending ? "Jornada a cerrar" : "Jornada registrada"}
                    </div>
                    <div className="text-base font-semibold capitalize">
                      {format(parseISO(activeJornada.fecha), "EEEE d 'de' MMMM yyyy", { locale: es })}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Responsable: <span className="text-foreground">{jornadaResponsableNombre}</span>
                      </span>
                      <span>
                        Auxiliares: <span className="text-foreground">{jornadaAuxiliares}</span>
                      </span>
                    </div>
                  </div>
                  <EstadoBadge estado={activeMerged.estado} className="text-[10px]" />
                </div>

                {canEdit && activeIsPending ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        className="h-11 justify-start gap-2"
                        onClick={() => setCargarOpen(true)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Cargar resultado
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start gap-2 bg-card"
                        onClick={() => setProgramarOpen(true)}
                        disabled={!trabajoMadre}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Continuar otro dia
                      </Button>
                    </div>
                    <div className="rounded-md bg-card p-3 text-xs text-muted-foreground">
                      Usa la misma carga de resultado que en Trabajos para guardar estado, horas, observacion y cuadrilla en una sola accion.
                    </div>
                  </>
                ) : activeIsPending ? (
                  <div className="rounded-md bg-card p-3 text-xs text-muted-foreground">
                    No tenes permisos para editar esta jornada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs font-medium">
                        {activeMerged.horas_trabajadas ?? 0} hs trabajadas
                      </Badge>
                      {!activeMerged.observaciones?.trim() && (
                        <Badge variant="outline" className="rounded-md px-2 py-1 text-xs text-muted-foreground">
                          Sin observaciones
                        </Badge>
                      )}
                    </div>

                    {activeMerged.observaciones?.trim() && (
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Observacion</Label>
                        <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm leading-relaxed">
                          {activeMerged.observaciones}
                        </div>
                      </div>
                    )}

                    {canEdit && (
                      <div className="flex justify-start">
                        <Button
                          type="button"
                          variant={editClosedOpen ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setEditClosedOpen((v) => !v)}
                        >
                          {editClosedOpen ? "Ocultar edicion" : "Editar resultado"}
                        </Button>
                      </div>
                    )}

                    {canEdit && editClosedOpen && (
                      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <ResultButton
                            active={activeMerged.estado === "Completado"}
                            icon={<CheckCircle2 className="h-4 w-4" />}
                            label="Realizada"
                            onClick={() => jornadaPatch(activeJornada.id, { estado: "Completado" })}
                          />
                          <ResultButton
                            active={activeMerged.estado === "Cancelada"}
                            icon={<XCircle className="h-4 w-4" />}
                            label="No realizada"
                            onClick={() => jornadaPatch(activeJornada.id, { estado: "Cancelada" })}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                          <div className="space-y-1.5">
                            <Label>Horas trabajadas</Label>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              inputMode="decimal"
                              className="h-11 text-base"
                              value={activeMerged.horas_trabajadas ?? ""}
                              onChange={(e) =>
                                jornadaPatch(activeJornada.id, {
                                  horas_trabajadas: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              placeholder="0"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Observacion</Label>
                            <Textarea
                              rows={3}
                              className="text-sm"
                              value={activeMerged.observaciones ?? ""}
                              onChange={(e) => jornadaPatch(activeJornada.id, { observaciones: e.target.value || null })}
                              placeholder="Completa o corrige lo que se hizo ese dia..."
                            />
                          </div>
                        </div>

                        <TecnicosPicker
                          tecnicos={profiles.filter((p) => !adminCabIds.has(p.id))}
                          principalId={activeMerged.tecnico_responsable_id}
                          auxiliares={activeMerged.auxiliares ?? []}
                          onChange={({ principalId, auxiliares }) =>
                            jornadaPatch(activeJornada.id, {
                              tecnico_responsable_id: principalId,
                              auxiliares,
                            })
                          }
                          label="Cuadrilla que participo"
                          helperText="Normalmente queda igual. Si ese dia trabajo otra combinacion, corregila aca."
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold">
                  Historial{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({jornadas.length}) - Total {totalHoras || 0} hs
                  </span>
                </Label>
                {canEdit && trabajoMadre && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setProgramarOpen(true)}>
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                    Nueva jornada
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                {historial.map((j) => {
                  const merged = { ...j, ...edits[j.id] };
                  const isContexto = fechaContexto && j.fecha === fechaContexto;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setActiveJornadaId(j.id)}
                      className={cn(
                        "w-full rounded-md border bg-card p-2 text-left transition-colors hover:border-primary/50",
                        isContexto && "ring-1 ring-primary/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold capitalize">
                            {format(parseISO(j.fecha), "EEE d MMM yyyy", { locale: es })}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {ESTADO_LABELS[merged.estado]} - {merged.horas_trabajadas ?? 0} hs
                            {merged.observaciones ? ` - ${merged.observaciones}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <EstadoBadge estado={merged.estado} className="text-[10px]" />
                          {canManage && jornadas.length > 1 && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="rounded p-1 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteJornadaId(j.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setConfirmDeleteJornadaId(j.id);
                                }
                              }}
                              title="Quitar esta fecha"
                            >
                              <X className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </ResponsiveDrawerBody>

        <ResponsiveDrawerFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {canEdit && editClosedOpen && (
            <Button onClick={save} disabled={busy || !dirty}>
              {busy ? "Guardando..." : "Guardar resultado"}
            </Button>
          )}
        </ResponsiveDrawerFooter>
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
          onSaved={onChanged}
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
          initialTecnicoId={activeMerged?.tecnico_responsable_id ?? servicio.tecnico_responsable_id}
          initialAuxiliares={activeMerged?.auxiliares ?? servicio.auxiliares}
          onSaved={() => {
            loadJornadas(servicio.id);
            onChanged();
          }}
        />
      )}

      {trabajoMadre && (
        <CargarJornadaDialog
          open={cargarOpen}
          onOpenChange={setCargarOpen}
          trabajoId={trabajoMadre.id}
          legacyServicioId={servicio.id}
          tecnicos={profiles.filter((p) => !adminCabIds.has(p.id))}
          jornadas={jornadas.filter((j) => j.estado === "Pendiente")}
          initialJornadaId={activeJornadaId}
          defaultTecnicoId={activeMerged?.tecnico_responsable_id ?? servicio.tecnico_responsable_id}
          defaultAuxiliares={activeMerged?.auxiliares ?? servicio.auxiliares}
          onSaved={async () => {
            await loadJornadas(servicio.id);
            onChanged();
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Se eliminara el servicio, todas sus jornadas y sus datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteJornadaId} onOpenChange={(o) => !o && setConfirmDeleteJornadaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar esta jornada?</AlertDialogTitle>
            <AlertDialogDescription>
              El servicio dejara de aparecer en esa fecha. Esta accion no afecta a las demas jornadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteJornadaId && deleteJornada(confirmDeleteJornadaId)}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Quitando..." : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ResultButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      className={cn("h-11 justify-start gap-2", !active && "bg-card")}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}
