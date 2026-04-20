import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, MapPin, Wrench, Plus } from "lucide-react";
import { format, addMonths, addWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { cn } from "@/lib/utils";
import type { Estado, Marca, Sucursal, TipoTrabajo } from "@/lib/constants";

interface Servicio {
  id: string; fecha_programada: string; dia_semana: string; semana: number;
  tecnico_responsable_id: string | null; auxiliares: string[];
  sucursal: Sucursal; cliente_id: string | null; marca: Marca;
  tipo_trabajo: TipoTrabajo;
  trabajo_descripcion: string; estado: Estado; observaciones: string | null; horas_trabajadas: number | null;
  visto_por: string[];
}
interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }

export default function Calendario() {
  const { isAdmin, isCabecilla } = useAuth();
  const [vista, setVista] = useState<"mes" | "semana">("mes");
  const [cursor, setCursor] = useState(new Date());
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  const [diaSel, setDiaSel] = useState<Date | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const load = async () => {
    const [{ data: srv }, { data: prof }, { data: cli }] = await Promise.all([
      supabase.from("servicios").select("*"),
      supabase.from("profiles").select("id, nombre, sucursal"),
      supabase.from("clientes").select("id, nombre, sucursal"),
    ]);
    setServicios((srv ?? []) as Servicio[]);
    setProfiles((prof ?? []) as Profile[]);
    setClientes((cli ?? []) as Cliente[]);
  };
  useEffect(() => { load(); }, []);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])), [profiles]);
  const cliById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.nombre])), [clientes]);

  const filtered = useMemo(() => servicios.filter((s) =>
    fTecnico === "all" || s.tecnico_responsable_id === fTecnico || s.auxiliares.includes(fTecnico)
  ), [servicios, fTecnico]);

  const start = vista === "mes" ? startOfWeek(startOfMonth(cursor), { locale: es }) : startOfWeek(cursor, { locale: es });
  const end = vista === "mes" ? endOfWeek(endOfMonth(cursor), { locale: es }) : endOfWeek(cursor, { locale: es });
  const days = eachDayOfInterval({ start, end });

  const eventsForDay = (d: Date) => filtered.filter((s) => isSameDay(parseISO(s.fecha_programada), d));

  const estadoColor = (e: Estado) =>
    e === "Completado" ? "bg-estado-completado text-white" :
    e === "Iniciado" ? "bg-estado-iniciado text-white" :
    "bg-estado-pendiente text-white";

  const canCreate = isAdmin || isCabecilla;
  const eventosDia = diaSel ? eventsForDay(diaSel) : [];

  return (
    <div className="container max-w-[1400px] py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendario</h1>
          <p className="text-xs text-muted-foreground">{format(cursor, "MMMM yyyy", { locale: es })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={vista} onValueChange={(v) => setVista(v as "mes" | "semana")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="mes">Mes</SelectItem><SelectItem value="semana">Semana</SelectItem></SelectContent>
          </Select>
          <Select value={fTecnico} onValueChange={setFTecnico}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los técnicos</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setCursor(vista === "mes" ? addMonths(cursor, -1) : addWeeks(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoy</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(vista === "mes" ? addMonths(cursor, 1) : addWeeks(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold uppercase">
          {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const evs = eventsForDay(d);
            const isCur = isSameMonth(d, cursor);
            const isToday = isSameDay(d, new Date());
            return (
              <button
                key={d.toISOString()}
                onClick={() => setDiaSel(d)}
                className={cn(
                  "min-h-[110px] border-b border-r p-1.5 text-xs text-left transition-colors hover:bg-accent/50",
                  !isCur && vista === "mes" && "bg-muted/30 text-muted-foreground",
                  isToday && "bg-primary/5"
                )}
              >
                <div className={cn("mb-1 text-right text-[11px] font-semibold tabular-nums", isToday && "text-primary")}>
                  {format(d, "d")}
                </div>
                <div className="space-y-1">
                  {evs.slice(0, 3).map((s) => {
                    const TipoIcon = (s.tipo_trabajo ?? "Visita de campo") === "Máquina en taller" ? Wrench : MapPin;
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setDetalle(s); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setDetalle(s); } }}
                        className={cn("flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium cursor-pointer", estadoColor(s.estado))}
                      >
                        <TipoIcon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {s.cliente_id ? cliById[s.cliente_id] : (s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.split(" ")[0] : "—")}
                        </span>
                      </div>
                    );
                  })}
                  {evs.length > 3 && <div className="text-[10px] text-muted-foreground font-medium">+{evs.length - 3} más…</div>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Sheet con servicios del día */}
      <Sheet open={!!diaSel} onOpenChange={(o) => !o && setDiaSel(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {diaSel && format(diaSel, "EEEE d 'de' MMMM", { locale: es })}
            </SheetTitle>
            <SheetDescription>
              {eventosDia.length} servicio{eventosDia.length !== 1 ? "s" : ""} programado{eventosDia.length !== 1 ? "s" : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            {canCreate && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => { setDiaSel(null); setOpenForm(true); }}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo servicio en este día
              </Button>
            )}

            {eventosDia.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin servicios programados.</p>
            ) : (
              eventosDia.map((s) => {
                const TipoIcon = (s.tipo_trabajo ?? "Visita de campo") === "Máquina en taller" ? Wrench : MapPin;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setDiaSel(null); setDetalle(s); }}
                    className="block w-full rounded-md border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TipoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">
                          {s.cliente_id ? cliById[s.cliente_id] : "Sin cliente"}
                        </span>
                      </div>
                      <EstadoBadge estado={s.estado} className="shrink-0 text-[10px]" />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{s.trabajo_descripcion}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <MarcaBadge marca={s.marca} className="text-[9px]" />
                      <span>·</span>
                      <span className="truncate">{s.tecnico_responsable_id ? profById[s.tecnico_responsable_id] : "Sin asignar"}</span>
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

      <ServicioDetalleDialog servicio={detalle} onOpenChange={(o) => !o && setDetalle(null)} profiles={profiles} clientes={clientes} onChanged={load} />
      <ServicioFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        servicio={null}
        profiles={profiles}
        clientes={clientes}
        onSaved={load}
        defaultDate={diaSel ? format(diaSel, "yyyy-MM-dd") : undefined}
      />
    </div>
  );
}
