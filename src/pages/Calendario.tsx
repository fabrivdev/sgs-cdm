import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarOff, ChevronLeft, ChevronRight, FileSpreadsheet, GraduationCap, MapPin, Wrench, Plus, Ban, RotateCcw, Trash2 } from "lucide-react";
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
import { DisponibilidadDialog } from "@/components/tecnicos/DisponibilidadDialog";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { cn } from "@/lib/utils";
import { MAX_EVENTOS_DIA_CALENDARIO, MAX_DISPONIBILIDADES_DIA } from "@/lib/constants";
import type { Estado, Marca, Sucursal, TipoTrabajo } from "@/lib/constants";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";
import { PageHeader } from "@/components/layout/AppPrimitives";

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

interface DisponibilidadTecnico {
  id: string;
  tecnico_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string;
  observacion: string | null;
  bloquea_agenda: boolean;
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
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
  const [vista, setVista] = useState<"mes" | "semana" | "tecnicos">("mes");
  const [cursor, setCursor] = useState(new Date());
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { data: tecnicosSolo = [] } = useServicioTecnicos();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  const [diaSel, setDiaSel] = useState<Date | null>(null);
  const [diaForm, setDiaForm] = useState<Date | null>(null);
  const [diaDisponibilidad, setDiaDisponibilidad] = useState<string | undefined>();
  const [openForm, setOpenForm] = useState(false);
  const [openDisponibilidad, setOpenDisponibilidad] = useState(false);
  const [disponibilidades, setDisponibilidades] = useState<DisponibilidadTecnico[]>([]);
  const [diasNL, setDiasNL] = useState<Map<string, { id: string; motivo: string | null }>>(new Map());
  const [motivoDialogOpen, setMotivoDialogOpen] = useState(false);
  const [motivoPendiente, setMotivoPendiente] = useState("");

  useEffect(() => {
    const start = vista === "mes" ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }) : startOfWeek(cursor, { weekStartsOn: 0 });
    const end = vista === "mes" ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }) : endOfWeek(cursor, { weekStartsOn: 0 });
    setPageFilters({
      vista,
      fecha_desde: format(start, "yyyy-MM-dd"),
      fecha_hasta: format(end, "yyyy-MM-dd"),
      tecnicos: fTecnicos,
    });
    return clearPageFilters;
  }, [clearPageFilters, cursor, fTecnicos, setPageFilters, vista]);

  const [codigoByServicio, setCodigoByServicio] = useState<Map<string, string>>(new Map());

  const load = async () => {
    try {
      const [{ data: srv }, { data: prof }, { data: jor }, { data: nl }, cli, { data: trabs }] = await Promise.all([
        supabase.from("servicios").select("*"),
        supabase.from("profiles").select("id, nombre, sucursal, activo").order("nombre", { ascending: true }),
        supabase.from("servicio_jornadas").select("id, servicio_id, fecha, estado, horas_trabajadas, observaciones, tecnico_responsable_id, auxiliares"),
        supabase.from("dias_no_laborales").select("id, fecha, motivo"),
        cargarTodosLosClientes(),
        supabase.from("trabajos").select("codigo, legacy_servicio_id, cliente_id, descripcion_problema, sucursal, marca, tipo_trabajo"),
      ]);
      const codMap = new Map<string, string>();
      const trabajosRaw = (trabs ?? []) as any[];
      for (const t of trabajosRaw) {
        if (t.legacy_servicio_id && t.codigo) codMap.set(t.legacy_servicio_id, t.codigo);
      }
      setCodigoByServicio(codMap);

      const trabajoPorServicio = new Map<string, any>();
      for (const t of trabajosRaw) {
        if (t.legacy_servicio_id) trabajoPorServicio.set(t.legacy_servicio_id, t);
      }

      const serviciosBase = ((srv ?? []) as Servicio[]).map((s) => {
        const t = trabajoPorServicio.get(s.id);
        if (!t) return s;
        return {
          ...s,
          cliente_id: t.cliente_id ?? s.cliente_id,
          marca: t.marca ?? s.marca,
          sucursal: t.sucursal ?? s.sucursal,
          tipo_trabajo: t.tipo_trabajo ?? s.tipo_trabajo,
          trabajo_descripcion: t.descripcion_problema ?? s.trabajo_descripcion,
        };
      });
      const jornadas = (jor ?? []) as Array<{
        id: string;
        servicio_id: string;
        fecha: string;
        estado: Estado;
        horas_trabajadas: number | null;
        observaciones: string | null;
        tecnico_responsable_id: string | null;
        auxiliares: string[] | null;
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
            tecnico_responsable_id: j.tecnico_responsable_id ?? s.tecnico_responsable_id,
            auxiliares: (j.auxiliares && j.auxiliares.length > 0) ? j.auxiliares : s.auxiliares,
          });
        }
      }

      setServicios(expandidos);
      setProfiles((prof ?? []) as Profile[]);
      const nlMap = new Map<string, { id: string; motivo: string | null }>();
      for (const d of (nl ?? []) as Array<{ id: string; fecha: string; motivo: string | null }>) {
        nlMap.set(d.fecha, { id: d.id, motivo: d.motivo });
      }
      setDiasNL(nlMap);
      setClientes(cli);

      try {
        const { data: disp, error: dispError } = await supabase
          .from("tecnico_disponibilidad")
          .select("id, tecnico_id, fecha_inicio, fecha_fin, tipo, observacion, bloquea_agenda");
        if (dispError) throw dispError;
        setDisponibilidades((disp ?? []) as DisponibilidadTecnico[]);
      } catch (dispError) {
        console.warn("Disponibilidad tecnica no disponible", dispError);
        setDisponibilidades([]);
      }
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

  const start =
    vista === "mes"
      ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
      : startOfWeek(cursor, { weekStartsOn: 0 });

  const end =
    vista === "mes"
      ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
      : endOfWeek(cursor, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start, end });
  const esMesDeSeisSemanas = vista === "mes" && days.length > 35;

  const eventsForDay = (d: Date) => filtered.filter((s) => isSameDay(parseISO(s.fecha_programada), d));

  const tecnicoFilterSet = useMemo(
    () => new Set(fTecnicos.length > 0 ? fTecnicos : tecnicosSolo.map((t) => t.id)),
    [fTecnicos, tecnicosSolo],
  );

  const filtered = useMemo(
    () =>
      servicios.filter((s) => {
        const crew = [s.tecnico_responsable_id, ...s.auxiliares].filter(Boolean) as string[];
        if (crew.length === 0) return fTecnicos.length === 0;
        return crew.some((id) => tecnicoFilterSet.has(id));
      }),
    [servicios, fTecnicos.length, tecnicoFilterSet],
  );

  const tecnicosVisibles = useMemo(
    () => (fTecnicos.length === 0 ? tecnicosSolo : tecnicosSolo.filter((t) => fTecnicos.includes(t.id))),
    [tecnicosSolo, fTecnicos],
  );

  const eventsForTecnicoDay = (tecId: string, d: Date) =>
    filtered.filter(
      (s) =>
        isSameDay(parseISO(s.fecha_programada), d) &&
        (s.tecnico_responsable_id === tecId || s.auxiliares.includes(tecId)),
    );

  const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

  const dispIncludesDay = (disp: DisponibilidadTecnico, d: Date) => {
    const key = dateKey(d);
    return key >= disp.fecha_inicio && key <= disp.fecha_fin;
  };

  const disponibilidadForTecnicoDay = (tecId: string, d: Date) =>
    disponibilidades.filter((disp) => disp.tecnico_id === tecId && dispIncludesDay(disp, d));

  const disponibilidadForDay = (d: Date) =>
    disponibilidades.filter(
      (disp) => dispIncludesDay(disp, d) && tecnicoFilterSet.has(disp.tecnico_id),
    );

  const disponibilidadLabel = (tipo: string) => tipo || "No disponible";

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
      : e === "Cancelada"
      ? "bg-muted text-muted-foreground"
      : "bg-estado-pendiente text-white";

  const canCreate = isAdmin || isCabecilla;
  const eventosDia = diaSel ? eventsForDay(diaSel) : [];
  const disponibilidadDiaSel = diaSel ? disponibilidadForDay(diaSel) : [];
  const diaSelKey = diaSel ? format(diaSel, "yyyy-MM-dd") : "";
  const diaSelNL = diaSelKey ? diasNL.get(diaSelKey) : undefined;

  const toggleNoLaboral = async () => {
    if (!diaSel || !canCreate) return;
    const key = format(diaSel, "yyyy-MM-dd");
    const existente = diasNL.get(key);
    if (existente) {
      const { error } = await supabase.from("dias_no_laborales").delete().eq("id", existente.id);
      if (error) { toast.error(error.message); return; }
      const next = new Map(diasNL); next.delete(key); setDiasNL(next);
      toast.success("Día marcado como laboral");
    } else {
      setMotivoPendiente("");
      setMotivoDialogOpen(true);
    }
  };

  const confirmarNoLaboral = async () => {
    if (!diaSel) return;
    const key = format(diaSel, "yyyy-MM-dd");
    const { data: u } = await supabase.auth.getUser();
    const motivo = motivoPendiente.trim() || null;
    const { data, error } = await supabase
      .from("dias_no_laborales")
      .insert({ fecha: key, motivo, creado_por: u.user?.id ?? null })
      .select("id, fecha, motivo")
      .single();
    if (error) { toast.error(error.message); return; }
    const next = new Map(diasNL);
    next.set(data.fecha, { id: data.id, motivo: data.motivo });
    setDiasNL(next);
    setMotivoDialogOpen(false);
    toast.success("Día marcado como No laboral");
  };

  const quitarDisponibilidad = async (disp: DisponibilidadTecnico) => {
    if (!canCreate) return;
    const { error } = await supabase.from("tecnico_disponibilidad").delete().eq("id", disp.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDisponibilidades((current) => current.filter((row) => row.id !== disp.id));
    toast.success("Tecnico quitado de la no disponibilidad");
  };

  const dominantColor = (evs: Servicio[]) => {
    const activas = evs.filter((s) => s.estado !== "Cancelada");
    if (activas.length === 0) return "bg-muted";
    if (activas.some((s) => s.estado === "Pendiente")) return "bg-estado-pendiente";
    return "bg-estado-completado";
  };

  const clienteNombre = (clienteId: string | null) => {
    if (!clienteId) return "Sin cliente";
    return cliById[clienteId] ?? "Cliente no encontrado";
  };

  const servicioCodigo = (servicioId: string) => codigoByServicio.get(servicioId) ?? servicioId.slice(0, 8);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const periodoInicio = format(start, "dd-MM-yyyy");
    const periodoFin = format(end, "dd-MM-yyyy");

    const baseServicioRow = (s: Servicio, tecnicoId?: string) => {
      const cuadrillaIds = [s.tecnico_responsable_id, ...s.auxiliares].filter(Boolean) as string[];
      const rol =
        tecnicoId && s.tecnico_responsable_id === tecnicoId
          ? "Responsable"
          : tecnicoId && s.auxiliares.includes(tecnicoId)
          ? "Auxiliar"
          : "";

      return {
        Fecha: format(parseISO(s.fecha_programada), "dd/MM/yyyy"),
        Dia: format(parseISO(s.fecha_programada), "EEEE", { locale: es }),
        Tecnico: tecnicoId ? profById[tecnicoId] ?? "Sin tecnico" : profById[s.tecnico_responsable_id ?? ""] ?? "Sin tecnico",
        Rol: rol,
        Agenda: "Servicio",
        Codigo: servicioCodigo(s.id),
        Cliente: clienteNombre(s.cliente_id),
        Trabajo: s.trabajo_descripcion,
        Estado: s.estado,
        Sucursal: s.sucursal,
        Marca: s.marca,
        Tipo: s.tipo_trabajo,
        Horas: s.horas_trabajadas ?? "",
        Cuadrilla: cuadrillaIds.map((id) => profById[id] ?? id).join(", "),
        Observaciones: s.observaciones ?? "",
      };
    };

    const rows =
      vista === "tecnicos"
        ? tecnicosVisibles.flatMap((tec) => {
            const semanaDays = eachDayOfInterval({
              start: startOfWeek(cursor, { weekStartsOn: 0 }),
              end: endOfWeek(cursor, { weekStartsOn: 0 }),
            });

            return semanaDays.flatMap((d) => {
              const evs = eventsForTecnicoDay(tec.id, d);
              const bloqueos = disponibilidadForTecnicoDay(tec.id, d);

              const bloqueoRows = bloqueos.map((disp) => ({
                Fecha: format(d, "dd/MM/yyyy"),
                Dia: format(d, "EEEE", { locale: es }),
                Tecnico: tec.nombre,
                Rol: "",
                Agenda: "No disponible",
                Codigo: "",
                Cliente: "",
                Trabajo: disponibilidadLabel(disp.tipo),
                Estado: disp.bloquea_agenda ? "Bloquea agenda" : "Informativo",
                Sucursal: tec.sucursal ?? "",
                Marca: "",
                Tipo: "",
                Horas: "",
                Cuadrilla: tec.nombre,
                Observaciones: disp.observacion ?? "",
              }));

              const servicioRows = evs.map((s) => baseServicioRow(s, tec.id));

              if (bloqueoRows.length === 0 && servicioRows.length === 0) {
                return [{
                  Fecha: format(d, "dd/MM/yyyy"),
                  Dia: format(d, "EEEE", { locale: es }),
                  Tecnico: tec.nombre,
                  Rol: "",
                  Agenda: "Libre",
                  Codigo: "",
                  Cliente: "",
                  Trabajo: "",
                  Estado: "",
                  Sucursal: tec.sucursal ?? "",
                  Marca: "",
                  Tipo: "",
                  Horas: "",
                  Cuadrilla: "",
                  Observaciones: "",
                }];
              }

              return [...bloqueoRows, ...servicioRows];
            });
          })
        : filtered
            .filter((s) => days.some((d) => isSameDay(parseISO(s.fecha_programada), d)))
            .sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada))
            .map((s) => baseServicioRow(s));

    if (rows.length === 0) {
      toast.info("No hay datos visibles para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 14 },
      { wch: 28 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 32 },
      { wch: 48 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 10 },
      { wch: 48 },
      { wch: 42 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, vista === "tecnicos" ? "Tecnicos por dia" : "Calendario");
    XLSX.writeFile(wb, `calendario-${vista}-${periodoInicio}-a-${periodoFin}.xlsx`);
  };

  return (
    <div className={cn(
      "w-full space-y-3 px-3 py-3 sm:px-4 lg:px-5",
      vista === "mes" && "md:flex md:h-[calc(100svh-48px)] md:flex-col md:gap-2 md:space-y-0 md:overflow-hidden md:py-2",
    )}>
      <PageHeader
        title="Calendario"
        meta={<span className="capitalize">{format(cursor, "MMMM yyyy", { locale: es })}</span>}
        actions={<>
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
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={() => {
                setDiaDisponibilidad(undefined);
                setOpenDisponibilidad(true);
              }}
            >
              <CalendarOff className="h-4 w-4" />
              Disponibilidad
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCursor(vista === "mes" ? addMonths(cursor, 1) : addWeeks(cursor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>}
      />

      <FiltersBar
        activeCount={fTecnicos.length > 0 ? 1 : 0}
        onClear={() => setFTecnicos([])}
        actions={(
          <Button variant="outline" size="sm" onClick={exportarExcel}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Exportar
          </Button>
        )}
      >
        <FilterSelect
          label="Vista"
          value={vista}
          onChange={(v) => setVista(v as "mes" | "semana" | "tecnicos")}
          placeholder="Vista"
          width="w-[140px]"
          options={[
            { value: "mes", label: "Mes" },
            { value: "semana", label: "Semana" },
            { value: "tecnicos", label: "Por técnico" },
          ]}
        />
        <FilterMultiSelect
          label="Técnico"
          values={fTecnicos}
          onChange={setFTecnicos}
          placeholder="Todos"
          width="w-[220px]"
          options={tecnicosSolo.map((p) => ({ value: p.id, label: p.nombre }))}
        />
      </FiltersBar>



      {vista === "tecnicos" ? (
        <div className="relative">
        <Card className="overflow-x-auto">
          {(() => {
            const semanaDays = eachDayOfInterval({
              start: startOfWeek(cursor, { weekStartsOn: 0 }),
              end: endOfWeek(cursor, { weekStartsOn: 0 }),
            });
            return (
              <div className="min-w-[900px]">
                <div
                  className="grid border-b bg-muted/40 text-[10px] sm:text-[12px] font-semibold uppercase"
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

                {tecnicosVisibles.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-muted-foreground">
                    No hay técnicos activos.
                  </div>
                ) : (
                  tecnicosVisibles.map((tec) => {
                    const total = semanaDays.reduce(
                      (acc, d) => acc + eventsForTecnicoDay(tec.id, d).length,
                      0,
                    );
                    const diasBloqueados = semanaDays.reduce(
                      (acc, d) => acc + (disponibilidadForTecnicoDay(tec.id, d).length > 0 ? 1 : 0),
                      0,
                    );
                    return (
                      <div
                        key={tec.id}
                        className="grid border-b"
                        style={{ gridTemplateColumns: `180px repeat(7, minmax(0,1fr))` }}
                      >
                        <div className="p-2 border-r bg-muted/20 flex flex-col justify-center">
                          <div className="text-[13px] font-medium truncate">{tec.nombre}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {tec.sucursal ?? "—"} · {total} {total === 1 ? "servicio" : "servicios"}
                            {diasBloqueados > 0 ? ` · ${diasBloqueados} no disp.` : ""}
                          </div>
                        </div>
                        {semanaDays.map((d) => {
                          const evs = eventsForTecnicoDay(tec.id, d);
                          const bloqueos = disponibilidadForTecnicoDay(tec.id, d);
                          const esDom = d.getDay() === 0;
                          return (
                            <div
                              key={d.toISOString()}
                              className={cn(
                                "p-1 border-r min-h-[80px] space-y-1",
                                esDom && "bg-slate-50",
                                evs.length === 0 && bloqueos.length === 0 && !esDom && "bg-amber-50/40",
                                bloqueos.length > 0 && !esDom && "bg-sky-50/50",
                              )}
                            >
                              {bloqueos.map((disp) => (
                                <div
                                  key={disp.id}
                                  className="flex items-center gap-1 truncate rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800"
                                  title={disp.observacion ?? undefined}
                                >
                                  <GraduationCap className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{disponibilidadLabel(disp.tipo)}</span>
                                </div>
                              ))}

                              {evs.length === 0 && bloqueos.length === 0 ? (
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
                                    title={`${codigoByServicio.get(s.id) ?? ""} ${clienteNombre(s.cliente_id)} — ${s.trabajo_descripcion}`}
                                  >
                                    {codigoByServicio.get(s.id) ? `${codigoByServicio.get(s.id)} · ` : ""}{clienteNombre(s.cliente_id)}
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
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent md:hidden" aria-hidden />
        </div>
      ) : (
      <Card className={cn("overflow-hidden", vista === "mes" && "md:flex md:min-h-0 md:flex-1 md:flex-col")}>
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[10px] sm:text-[12px] font-semibold uppercase">
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

        <div
          className={cn("grid grid-cols-7", vista === "semana" && "auto-rows-fr", vista === "mes" && "md:min-h-0 md:flex-1")}
          style={vista === "mes" ? { gridTemplateRows: `repeat(${Math.ceil(days.length / 7)}, minmax(0, 1fr))` } : undefined}
        >
          {days.map((d) => {
            const evs = eventsForDay(d);
            const isCur = isSameMonth(d, cursor);
            const isToday = isSameDay(d, new Date());
            const dayKey = format(d, "yyyy-MM-dd");
            const isDragOver = dragOverKey === dayKey;
            const esSemana = vista === "semana";
            const disponibilidadDia = disponibilidadForDay(d);
            const limiteDisponibilidad = esMesDeSeisSemanas
              ? Math.min(disponibilidadDia.length, 1)
              : MAX_DISPONIBILIDADES_DIA;
            const limiteEventos = esMesDeSeisSemanas
              ? Math.max(0, 2 - limiteDisponibilidad)
              : MAX_EVENTOS_DIA_CALENDARIO;
            const visibles = esSemana ? evs : evs.slice(0, limiteEventos);
            const visiblesDisponibilidad = esSemana
              ? disponibilidadDia
              : disponibilidadDia.slice(0, limiteDisponibilidad);
            const ocultosDisponibilidad = disponibilidadDia.length - visiblesDisponibilidad.length;
            const ocultosEventos = evs.length - visibles.length;
            const ocultosCompactos = ocultosDisponibilidad + ocultosEventos;
            const esDomingo = d.getDay() === 0;
            const nlInfo = diasNL.get(dayKey);
            const esNL = !!nlInfo || esDomingo;

            return (
              <div
                key={d.toISOString()}
                role="button"
                tabIndex={0}
                aria-label={format(d, "EEEE d 'de' MMMM", { locale: es })}
                onClick={() => setDiaSel(d)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDiaSel(d); }
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
                  "relative border-b border-r p-1 sm:p-1.5 text-[12px] text-left transition-colors hover:bg-accent/50 flex flex-col cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  esSemana ? "min-h-[260px] sm:min-h-[420px]" : "min-h-[56px] sm:min-h-[88px] md:min-h-0 md:overflow-hidden",
                  !isCur && vista === "mes" && "bg-muted/30 text-muted-foreground",
                  esNL && "bg-slate-100 text-slate-500 hover:bg-slate-200/80",
                  esNL && !isCur && vista === "mes" && "bg-slate-200/70 text-slate-500",
                  isToday && !esNL && "bg-primary/5",
                  isToday && esNL && "bg-slate-100 ring-1 ring-primary/30",
                  isDragOver && "bg-primary/10 ring-2 ring-primary/40",
                )}
              >
                {esNL && (
                  <div
                    className={cn(
                      "pointer-events-none absolute left-1 top-1 hidden rounded px-1.5 py-0.5 text-[9px] font-medium sm:block",
                      nlInfo ? "bg-amber-200 text-amber-900" : "bg-slate-300/80 text-slate-700",
                    )}
                    title={nlInfo?.motivo ?? undefined}
                  >
                    {nlInfo ? (nlInfo.motivo ? `NL · ${nlInfo.motivo}` : "No laboral") : "No laboral"}
                  </div>
                )}

                <div
                  className={cn(
                    "text-right text-[11px] font-semibold tabular-nums sm:mb-1",
                    esMesDeSeisSemanas && "sm:mb-0",
                    isToday && !esNL && "text-primary",
                    esNL && "text-slate-600"
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

                <div className={cn("space-y-1", esMesDeSeisSemanas && "space-y-0.5", !esSemana && "hidden sm:block")}>
                  {visiblesDisponibilidad.map((disp) => (
                    <div
                      key={disp.id}
                      className={cn(
                        "flex items-center gap-1 truncate rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-left text-[10px] font-medium text-sky-800",
                        esMesDeSeisSemanas && "py-0 leading-4",
                        esSemana && "text-[11px] py-1",
                      )}
                      title={`${profById[disp.tecnico_id] ?? "Tecnico"} - ${disp.observacion ?? disponibilidadLabel(disp.tipo)}`}
                    >
                      <GraduationCap className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">
                        {fTecnicos.length === 0 ? `${profById[disp.tecnico_id] ?? "Tecnico"} · ` : ""}
                        {disponibilidadLabel(disp.tipo)}
                      </span>
                    </div>
                  ))}

                  {!esSemana && !esMesDeSeisSemanas && ocultosDisponibilidad > 0 && (
                    <div className="text-[10px] text-sky-700 font-medium">
                      +{ocultosDisponibilidad} no disp.
                    </div>
                  )}

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
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setDetalle(s);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium",
                          esMesDeSeisSemanas && "py-0 leading-4",
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

                  {!esSemana && esMesDeSeisSemanas && ocultosCompactos > 0 && (
                    <div className="text-[10px] leading-4 text-muted-foreground font-medium">
                      +{ocultosCompactos} más…
                    </div>
                  )}

                  {!esSemana && !esMesDeSeisSemanas && ocultosEventos > 0 && (
                    <div className="text-[10px] text-muted-foreground font-medium">
                      +{ocultosEventos} más…
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
            <SheetTitle className="capitalize flex items-center gap-2">
              <span>{diaSel && format(diaSel, "EEEE d 'de' MMMM", { locale: es })}</span>
              {canCreate && (
                <Button
                  size="sm"
                  variant={diaSelNL ? "default" : "outline"}
                  onClick={toggleNoLaboral}
                  className={cn(
                    "h-6 px-2 text-[10px] gap-1",
                    diaSelNL && "bg-amber-500 hover:bg-amber-600 text-white",
                  )}
                  title={diaSelNL ? "Quitar marca No laboral" : "Marcar como No laboral"}
                >
                  {diaSelNL ? <RotateCcw className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                  {diaSelNL ? "Laboral" : "NL"}
                </Button>
              )}
              {diaSelNL && !canCreate && (
                <Badge className="bg-amber-500 text-white text-[10px]">No laboral</Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {eventosDia.length} servicio{eventosDia.length !== 1 ? "s" : ""} programado
              {eventosDia.length !== 1 ? "s" : ""}
              {disponibilidadDiaSel.length > 0 && (
                <span className="ml-1 text-sky-700">
                  · {disponibilidadDiaSel.length} no disponible{disponibilidadDiaSel.length !== 1 ? "s" : ""}
                </span>
              )}
              {diaSelNL && (
                <span className="ml-1 text-amber-600">
                  · No laboral{diaSelNL.motivo ? `: ${diaSelNL.motivo}` : ""}
                </span>
              )}
              {!diaSelNL && diaSel?.getDay() === 0 && (
                <span className="ml-1 text-slate-500">(domingo no laboral)</span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            {canCreate && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setDiaForm(diaSel);
                    setDiaSel(null);
                    setOpenForm(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Nuevo servicio
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    if (diaSel) setDiaDisponibilidad(format(diaSel, "yyyy-MM-dd"));
                    setDiaSel(null);
                    setOpenDisponibilidad(true);
                  }}
                >
                  <CalendarOff className="mr-2 h-4 w-4" /> Disponibilidad
                </Button>
              </div>
            )}

            {disponibilidadDiaSel.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12px] font-semibold uppercase text-muted-foreground">No disponibilidad</p>
                {disponibilidadDiaSel.map((disp) => (
                  <div key={disp.id} className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <GraduationCap className="h-4 w-4 shrink-0" />
                        <span className="truncate text-[13px] font-medium">{profById[disp.tecnico_id] ?? "Tecnico"}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">
                          {disponibilidadLabel(disp.tipo)}
                        </Badge>
                        {canCreate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-sky-800 hover:bg-sky-100 hover:text-destructive"
                            title="Quitar tecnico de esta no disponibilidad"
                            onClick={() => quitarDisponibilidad(disp)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {disp.observacion && (
                      <p className="mt-1 text-[12px] text-sky-800">{disp.observacion}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {eventosDia.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Sin servicios programados.</p>
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
                        {codigoByServicio.get(s.id) && (
                          <span className="rounded bg-muted px-1 py-0 text-[10px] font-mono font-semibold text-muted-foreground tabular-nums shrink-0">
                            {codigoByServicio.get(s.id)}
                          </span>
                        )}
                        <span className="truncate text-[13px] font-medium">{clienteNombre(s.cliente_id)}</span>
                      </div>
                      <EstadoBadge estado={s.estado} className="shrink-0 text-[10px]" />
                    </div>

                    <div className="text-[12px] text-muted-foreground truncate">{s.trabajo_descripcion}</div>

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

      <DisponibilidadDialog
        open={openDisponibilidad}
        onOpenChange={setOpenDisponibilidad}
        tecnicos={tecnicosSolo}
        fechaInicial={diaDisponibilidad}
        onSaved={load}
      />

      <Dialog open={motivoDialogOpen} onOpenChange={setMotivoDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar día no laboral</DialogTitle>
            {diaSel && (
              <DialogDescription>
                {format(diaSel, "EEEE d 'de' MMMM", { locale: es })}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-nl">
              Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="motivo-nl"
              placeholder="Ej: Feriado nacional"
              value={motivoPendiente}
              onChange={(e) => setMotivoPendiente(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarNoLaboral(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarNoLaboral}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


