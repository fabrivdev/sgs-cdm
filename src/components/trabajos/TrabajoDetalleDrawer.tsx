import { useEffect, useMemo, useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerHeader, ResponsiveDrawerBody, ResponsiveDrawerFooter } from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, ClipboardList, Clock, User, Users } from "lucide-react";
import { PRIORIDADES, prioridadBadge, estadoTrabajoLabel, normalizarEstadoTrabajo } from "@/lib/trabajos";
import { ESTADO_LABELS, type Estado, type Sucursal } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ProgramarIntervencionDialog } from "./ProgramarIntervencionDialog";
import { CargarJornadaDialog } from "./CargarJornadaDialog";

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
  return differenceInCalendarDays(startToday(), parseISO(j.fecha)) > 7
    ? "border-l-amber-500 bg-amber-50/40"
    : "border-l-blue-400 bg-card";
}

function badgeTone(j: Jornada) {
  if (j.estado === "Completado") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (j.estado === "Cancelada") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-blue-100 text-blue-800 border-blue-200";
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
  const [rolesTecnico, setRolesTecnico] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [programarOpen, setProgramarOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);

  const cargar = async () => {
    if (!trabajoId) return;
    setLoading(true);
    try {
      const [{ data: t, error }, { data: roles }] = await Promise.all([
        supabase.from("trabajos").select("*").eq("id", trabajoId).single(),
        supabase.from("user_roles").select("user_id, role").eq("role", "tecnico"),
      ]);
      if (error) throw error;
      setTrabajo(t);
      setRolesTecnico(new Set(((roles as any[]) ?? []).map((r) => r.user_id)));

      if (!t.legacy_servicio_id) {
        setJornadas([]);
        return;
      }
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoId]);

  const resumen = useMemo(() => ({
    pendientes: jornadas.filter((j) => j.estado === "Pendiente"),
    realizadas: jornadas.filter((j) => j.estado === "Completado"),
    noRealizadas: jornadas.filter((j) => j.estado === "Cancelada"),
    vencidas: jornadas.filter((j) => j.estado === "Pendiente" && differenceInCalendarDays(startToday(), parseISO(j.fecha)) > 7),
    horas: jornadas.reduce((acc, j) => acc + (j.estado === "Completado" ? Number(j.horas_trabajadas) || 0 : 0), 0),
  }), [jornadas]);

  const tecnicosOnly = useMemo(
    () => tecnicos.filter((t) => rolesTecnico.size === 0 || rolesTecnico.has(t.id)),
    [tecnicos, rolesTecnico],
  );

  if (!trabajoId) return null;

  const open = !!trabajoId && !programarOpen && !cargarOpen;
  const estado = trabajo ? normalizarEstadoTrabajo(trabajo.estado_general) : "pendiente";
  const cliente = trabajo ? clienteMap.get(trabajo.cliente_id) : null;
  const hint = jornadas.length === 0
    ? "Aun no tiene jornadas programadas."
    : resumen.pendientes.length > 0
      ? "Tiene jornadas pendientes de cierre."
      : "Todas las jornadas tienen resultado.";

  return (
    <>
      <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="xl">
        <ResponsiveDrawerHeader>
          {!trabajo ? (
            <div className="text-sm text-muted-foreground">Cargando...</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold text-muted-foreground">
                  {trabajo.codigo}
                </span>
                <Badge variant="outline" className="text-[10px]">{trabajo.sucursal}</Badge>
                <Badge variant="outline" className="text-[10px]">{trabajo.marca}</Badge>
                <Badge className={cn("text-[10px]", prioridadBadge(trabajo.prioridad))}>
                  {PRIORIDADES.find((p) => p.key === trabajo.prioridad)?.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">{estadoTrabajoLabel(estado)}</Badge>
              </div>
              <h2 className="text-lg font-semibold leading-tight">{cliente?.nombre ?? "Sin cliente"}</h2>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          )}
        </ResponsiveDrawerHeader>

        <ResponsiveDrawerBody className="space-y-5">
          {loading || !trabajo ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <>
              <section className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen del trabajo</h3>
                <div>
                  <div className="text-[11px] text-muted-foreground">Problema reportado</div>
                  <div className="text-sm">{trabajo.descripcion_problema}</div>
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

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jornadas</h3>
                {jornadas.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Todavia no hay jornadas.
                  </div>
                )}
                {jornadas.map((j) => {
                  const principal = j.tecnico_responsable_id ? profileMap.get(j.tecnico_responsable_id)?.nombre : null;
                  const aux = (j.auxiliares ?? []).map((id) => profileMap.get(id)?.nombre).filter(Boolean);
                  const vencida = j.estado === "Pendiente" && differenceInCalendarDays(startToday(), parseISO(j.fecha)) > 7;
                  return (
                    <div key={j.id} className={cn("rounded-lg border border-l-4 p-3", jornadaTone(j))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{format(parseISO(j.fecha), "dd/MM/yyyy")}</span>
                            <span className="text-[11px] text-muted-foreground capitalize">
                              {format(parseISO(j.fecha), "EEEE", { locale: es })}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px] border", badgeTone(j))}>
                              {ESTADO_LABELS[j.estado]}
                            </Badge>
                            {vencida && <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-800">Sin cierre +7d</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {principal && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{principal}</span>}
                            {aux.length > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{aux.join(", ")}</span>}
                            {j.horas_trabajadas != null && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{j.horas_trabajadas} hs</span>}
                          </div>
                          {j.observaciones && <p className="text-[11px] text-muted-foreground italic">"{j.observaciones}"</p>}
                        </div>
                        {j.estado === "Pendiente" && (
                          <Button size="sm" variant="outline" onClick={() => setCargarOpen(true)}>Cargar resultado</Button>
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
            <Button size="sm" variant="outline" onClick={() => setCargarOpen(true)}>
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Cargar resultado
            </Button>
          )}
          {trabajo && (isAdmin || isCabecilla) && (
            <Button size="sm" onClick={() => setProgramarOpen(true)}>
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Programar jornada
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
          onSaved={() => { cargar(); onChanged(); }}
        />
      )}
    </>
  );
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className={cn("text-sm font-medium", warn && "text-amber-700")}>{v}</div>
    </div>
  );
}
