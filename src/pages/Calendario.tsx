import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, MapPin, Wrench, Plus, Ban, RotateCcw } from "lucide-react";
import {
  format,
  addMonths,
  addWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { cn } from "@/lib/utils";
import type { Estado, Marca, Sucursal, TipoTrabajo } from "@/lib/constants";

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
  visto_por: string[];
  jornada_id?: string | null;
}

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo?: boolean;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

const PAGE = 1000;

async function cargarTodosLosClientes() {
  let from = 0;
  const all: Cliente[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre, sucursal")
      .order("nombre", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...((data ?? []) as Cliente[]));

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export default function Calendario() {
  const { isAdmin, isCabecilla } = useAuth();
  const [vista, setVista] = useState<"mes" | "semana" | "tecnicos">("mes");
  const [cursor, setCursor] = useState(new Date());
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tecnicoIds, setTecnicoIds] = useState<Set<string>>(new Set());
  const [adminCabecillaIds, setAdminCabecillaIds] = useState<Set<string>>(new Set());
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  const [diaSel, setDiaSel] = useState<Date | null>(null);
  const [diaForm, setDiaForm] = useState<Date | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [diasNL, setDiasNL] = useState<Map<string, { id: string; motivo: string | null }>>(new Map());

  const load = async () => {
    try {
      const [{ data: srv }, { data: prof }, { data: jor }, { data: roles }, { data: nl }, cli] = await Promise.all([
        supabase.from("servicios").select("*"),
        supabase.from("profiles").select("id, nombre, sucursal, activo").order("nombre", { ascending: true }),
        supabase.from("servicio_jornadas").select("id, servicio_id, fecha, estado, horas_trabajadas, observaciones"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("dias_no_laborales").select("id, fecha, motivo"),
        cargarTodosLosClientes(),
      ]);

      const serviciosBase = (srv ?? []) as Servicio[];
      const jornadas = (jor ?? []) as Array<{
        id: string;
        servicio_id: string;
        fecha: string;
        estado: Estado;
        horas_trabajadas: number | null;
        observaciones: string | null;
      }>;

      const porServicio = new Map<string, typeof jornadas>();
      for (const j of jornadas) {
        const list = porServicio.get(j.servicio_id) ?? [];
        list.push(j);
        porServicio.set(j.servicio_id, list);
      }

      const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const expandidos: Servicio[] = [];

      for (const s of serviciosBase) {
        const lista = porServicio.get(s.id);
        if (!lista || lista.length === 0) {
          expandidos.push({ ...s, jornada_id: null });
          continue;
        }
        for (const j of lista) {
          const d = parseISO(j.fecha);
          expandidos.push({
            ...s,
            fecha_programada: j.fecha,
            dia_semana: dias[d.getDay()],
            estado: j.estado,
            horas_trabajadas: j.horas_trabajadas,
            observaciones: j.observaciones,
            jornada_id: j.id,
          });
        }
      }

      setServicios(expandidos);
      setProfiles((prof ?? []) as Profile[]);
      const tecSet = new Set<string>();
      const adminCabSet = new Set<string>();
      for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
        if (r.role === "tecnico") tecSet.add(r.user_id);
        if (r.role === "admin" || r.role === "cabecilla") adminCabSet.add(r.user_id);
      }
      setTecnicoIds(tecSet);
      setAdminCabecillaIds(adminCabSet);
      const nlMap = new Map<string, { id: string; motivo: string | null }>();
      for (const d of (nl ?? []) as Array<{ id: string; fecha: string; motivo: string | null }>) {
        nlMap.set(d.fecha, { id: d.id, motivo: d.motivo });
      }
      setDiasNL(nlMap);
      setClientes(cli);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const profById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])),
    [profiles],
  );

  const cliById = useMemo(
    () => Object.fromEntries(clientes.map((c) => [c.id, c.nombre])),
    [clientes],
  );

  const filtered = useMemo(
    () =>
      servicios.filter(
        (s) =>
          fTecnico === "all" ||
          s.tecnico_responsable_id === fTecnico ||
          s.auxiliares.includes(fTecnico),
      ),
    [servicios, fTecnico],
  );

  const start =
    vista === "mes"
      ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
      : startOfWeek(cursor, { weekStartsOn: 0 });

  const end =
    vista === "mes"
      ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
      : endOfWeek(cursor, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start, end });

  const eventsForDay = (d: Date) => filtered.filter((s) => isSameDay(parseISO(s.fecha_programada), d));

  const tecnicosSolo = useMemo(
    () =>
      profiles.filter(
        (p) => p.activo !== false && !adminCabecillaIds.has(p.id),
      ),
    [profiles, adminCabecillaIds],
  );

  const eventsForTecnicoDay = (tecId: string, d: Date) =>
    servicios.filter(
      (s) =>
        isSameDay(parseISO(s.fecha_programada), d) &&
        (s.tecnico_responsable_id === tecId || s.auxiliares.includes(tecId)),
    );

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const canDrag = (s: Servicio) => s.estado === "Pendiente" && !!s.jornada_id && (isAdmin || isCabecilla);

  const moverJornada = async (jornadaId: string, nuevaFecha: Date, servicioId: string) => {
    const fecha = format(nuevaFecha, "yyyy-MM-dd");
    // Verificar que no exista ya una jornada en esa fecha para el mismo servicio
    const conflict = servicios.find(
      (x) => x.id === servicioId && x.fecha_programada === fecha,
    );
    if (conflict) {
      toast.error("Ya existe una jornada de este servicio en esa fecha.");
      return;
    }
    const { error } = await supabase
      .from("servicio_jornadas")
      .update({ fecha })
      .eq("id", jornadaId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Servicio movido");
    load();
  };

  const estadoColor = (e: Estado) =>
    e === "Completado"
      ? "bg-estado-completado text-white"
      : e === "Iniciado"
      ? "bg-estado-iniciado text-white"
      : "bg-estado-pendiente text-white";

  const canCreate = isAdmin || isCabecilla;
  const eventosDia = diaSel ? eventsForDay(diaSel) : [];

  const dominantColor = (evs: Servicio[]) => {
    if (evs.some((s) => s.estado === "Pendiente")) return "bg-estado-pendiente";
    if (evs.some((s) => s.estado === "Iniciado")) return "bg-estado-iniciado";
    return "bg-estado-completado";
  };

  const clienteNombre = (clienteId: string | null) => {
    if (!clienteId) return "Sin cliente";
    return cliById[clienteId] ?? "Cliente no encontrado";
  };

  return (
    <div className="container max-w-[1400px] py-3 sm:py-4 px-3 sm:px-4 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Calendario</h1>
          <p className="text-xs text-muted-foreground capitalize">
            {format(cursor, "MMMM yyyy", { locale: es })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={vista} onValueChange={(v) => setVista(v as "mes" | "semana" | "tecnicos")}>
            <SelectTrigger className="w-32 sm:w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mes</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="tecnicos">Por técnico</SelectItem>
            </SelectContent>
          </Select>

          <Select value={fTecnico} onValueChange={setFTecnico}>
            <SelectTrigger className="w-40 sm:w-48 h-9">
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCursor(vista === "mes" ? addMonths(cursor, -1) : addWeeks(cursor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="sm" className="h-9" onClick={() => setCursor(new Date())}>
            Hoy
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCursor(vista === "mes" ? addMonths(cursor, 1) : addWeeks(cursor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {vista === "tecnicos" ? (
        <Card className="overflow-x-auto">
          {(() => {
            const semanaDays = eachDayOfInterval({
              start: startOfWeek(cursor, { weekStartsOn: 0 }),
              end: endOfWeek(cursor, { weekStartsOn: 0 }),
            });
            return (
              <div className="min-w-[900px]">
                <div
                  className="grid border-b bg-muted/40 text-[10px] sm:text-xs font-semibold uppercase"
                  style={{ gridTemplateColumns: `180px repeat(7, minmax(0,1fr))` }}
                >
                  <div className="py-2 px-2 text-left">Técnico</div>
                  {semanaDays.map((d) => {
                    const esDom = d.getDay() === 0;
                    const isToday = isSameDay(d, new Date());
                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "py-2 text-center",
                          esDom && "bg-slate-200 text-slate-600",
                          isToday && !esDom && "text-primary",
                        )}
                      >
                        <div>{format(d, "EEE", { locale: es })}</div>
                        <div className="text-[11px] tabular-nums">{format(d, "d/M")}</div>
                      </div>
                    );
                  })}
                </div>

                {tecnicosSolo.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No hay técnicos activos.
                  </div>
                ) : (
                  tecnicosSolo.map((tec) => {
                    const total = semanaDays.reduce(
                      (acc, d) => acc + eventsForTecnicoDay(tec.id, d).length,
                      0,
                    );
                    return (
                      <div
                        key={tec.id}
                        className="grid border-b"
                        style={{ gridTemplateColumns: `180px repeat(7, minmax(0,1fr))` }}
                      >
                        <div className="p-2 border-r bg-muted/20 flex flex-col justify-center">
                          <div className="text-sm font-medium truncate">{tec.nombre}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {tec.sucursal ?? "—"} · {total} {total === 1 ? "servicio" : "servicios"}
                          </div>
                        </div>
                        {semanaDays.map((d) => {
                          const evs = eventsForTecnicoDay(tec.id, d);
                          const esDom = d.getDay() === 0;
                          return (
                            <div
                              key={d.toISOString()}
                              className={cn(
                                "p-1 border-r min-h-[80px] space-y-1",
                                esDom && "bg-slate-50",
                                evs.length === 0 && !esDom && "bg-amber-50/40",
                              )}
                            >
                              {evs.length === 0 ? (
                                <div className="text-[10px] text-muted-foreground/60 italic text-center pt-3">
                                  {esDom ? "—" : "libre"}
                                </div>
                              ) : (
                                evs.map((s) => (
                                  <button
                                    key={`${s.id}-${s.fecha_programada}`}
                                    onClick={() => setDetalle(s)}
                                    className={cn(
                                      "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium",
                                      estadoColor(s.estado),
                                    )}
                                    title={`${clienteNombre(s.cliente_id)} — ${s.trabajo_descripcion}`}
                                  >
                                    {clienteNombre(s.cliente_id)}
                                  </button>
                                ))
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}
        </Card>
      ) : (
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[10px] sm:text-xs font-semibold uppercase">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
            <div
              key={d}
              className={cn(
                "py-1.5 sm:py-2",
                d === "Dom" && "bg-slate-200 text-slate-600"
              )}
            >
              {d}
            </div>
          ))}
        </div>

        <div className={cn("grid grid-cols-7", vista === "semana" && "auto-rows-fr")}>
          {days.map((d) => {
            const evs = eventsForDay(d);
            const isCur = isSameMonth(d, cursor);
            const isToday = isSameDay(d, new Date());
            const dayKey = format(d, "yyyy-MM-dd");
            const isDragOver = dragOverKey === dayKey;
            const esSemana = vista === "semana";
            const visibles = esSemana ? evs : evs.slice(0, 3);
            const esDomingo = d.getDay() === 0;

            return (
              <div
                key={d.toISOString()}
                role="button"
                tabIndex={0}
                onClick={() => setDiaSel(d)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setDiaSel(d);
                }}
                onDragOver={(e) => {
                  if (dragId) {
                    e.preventDefault();
                    if (dragOverKey !== dayKey) setDragOverKey(dayKey);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverKey === dayKey) setDragOverKey(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverKey(null);
                  const data = e.dataTransfer.getData("text/plain");
                  if (!data) return;
                  const [jornadaId, servicioId, fechaOrigen] = data.split("|");
                  if (!jornadaId || fechaOrigen === dayKey) return;
                  moverJornada(jornadaId, d, servicioId);
                }}
                className={cn(
                  "relative border-b border-r p-1 sm:p-1.5 text-xs text-left transition-colors hover:bg-accent/50 flex flex-col cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  esSemana ? "min-h-[260px] sm:min-h-[420px]" : "min-h-[56px] sm:min-h-[110px]",
                  !isCur && vista === "mes" && "bg-muted/30 text-muted-foreground",
                  esDomingo && "bg-slate-100 text-slate-500 hover:bg-slate-200/80",
                  esDomingo && !isCur && vista === "mes" && "bg-slate-200/70 text-slate-500",
                  isToday && !esDomingo && "bg-primary/5",
                  isToday && esDomingo && "bg-slate-100 ring-1 ring-primary/30",
                  isDragOver && "bg-primary/10 ring-2 ring-primary/40",
                )}
              >
                {esDomingo && (
                  <div className="pointer-events-none absolute left-1 top-1 hidden rounded bg-slate-300/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-700 sm:block">
                    No laboral
                  </div>
                )}

                <div
                  className={cn(
                    "text-right text-[11px] font-semibold tabular-nums sm:mb-1",
                    isToday && !esDomingo && "text-primary",
                    esDomingo && "text-slate-600"
                  )}
                >
                  {format(d, "d")}
                </div>

                {!esSemana && (
                  <div className="flex flex-1 items-center justify-center sm:hidden">
                    {evs.length > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white",
                          dominantColor(evs),
                        )}
                      >
                        {evs.length}
                      </span>
                    )}
                  </div>
                )}

                <div className={cn("space-y-1", !esSemana && "hidden sm:block")}>
                  {visibles.map((s) => {
                    const TipoIcon = (s.tipo_trabajo ?? "Visita de campo") === "Máquina en taller" ? Wrench : MapPin;
                    const draggable = canDrag(s);

                    return (
                      <div
                        key={`${s.id}-${s.fecha_programada}`}
                        role="button"
                        tabIndex={0}
                        draggable={draggable}
                        onDragStart={(e) => {
                          if (!draggable || !s.jornada_id) return;
                          e.stopPropagation();
                          setDragId(s.jornada_id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData(
                            "text/plain",
                            `${s.jornada_id}|${s.id}|${s.fecha_programada}`,
                          );
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverKey(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetalle(s);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            setDetalle(s);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium",
                          esSemana && "text-[11px] py-1",
                          estadoColor(s.estado),
                          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        )}
                        title={draggable ? "Arrastrá para mover este servicio a otra fecha" : undefined}
                      >
                        <TipoIcon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{clienteNombre(s.cliente_id)}</span>
                      </div>
                    );
                  })}

                  {!esSemana && evs.length > 3 && (
                    <div className="text-[10px] text-muted-foreground font-medium">
                      +{evs.length - 3} más…
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      )}

      <Sheet open={!!diaSel} onOpenChange={(o) => !o && setDiaSel(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {diaSel && format(diaSel, "EEEE d 'de' MMMM", { locale: es })}
            </SheetTitle>
            <SheetDescription>
              {eventosDia.length} servicio{eventosDia.length !== 1 ? "s" : ""} programado
              {eventosDia.length !== 1 ? "s" : ""}
              {diaSel?.getDay() === 0 && (
                <span className="ml-1 text-slate-500">(domingo no laboral)</span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            {canCreate && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setDiaForm(diaSel);
                  setDiaSel(null);
                  setOpenForm(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo servicio en este día
              </Button>
            )}

            {eventosDia.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin servicios programados.</p>
            ) : (
              eventosDia.map((s) => {
                const TipoIcon = (s.tipo_trabajo ?? "Visita de campo") === "Máquina en taller" ? Wrench : MapPin;
                const responsable = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id] ?? "Sin asignar" : "Sin asignar";

                return (
                  <button
                    key={`${s.id}-${s.fecha_programada}`}
                    onClick={() => {
                      setDiaSel(null);
                      setDetalle(s);
                    }}
                    className="block w-full rounded-md border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TipoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{clienteNombre(s.cliente_id)}</span>
                      </div>
                      <EstadoBadge estado={s.estado} className="shrink-0 text-[10px]" />
                    </div>

                    <div className="text-xs text-muted-foreground truncate">{s.trabajo_descripcion}</div>

                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <MarcaBadge marca={s.marca} className="text-[9px]" />
                      <span>·</span>
                      <span className="truncate">{responsable}</span>
                      <span>·</span>
                      <span>{s.sucursal}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ServicioDetalleDialog
        servicio={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        profiles={profiles}
        clientes={clientes}
        onChanged={load}
        fechaContexto={detalle?.fecha_programada}
      />

      <ServicioFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        servicio={null}
        profiles={profiles}
        clientes={clientes}
        onSaved={load}
        defaultDate={diaForm ? format(diaForm, "yyyy-MM-dd") : undefined}
      />
    </div>
  );
}
