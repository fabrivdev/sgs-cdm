import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, addWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { cn } from "@/lib/utils";
import type { Estado, Marca, Sucursal } from "@/lib/constants";

interface Servicio {
  id: string; fecha_programada: string; dia_semana: string; semana: number;
  tecnico_responsable_id: string | null; auxiliares: string[];
  sucursal: Sucursal; cliente_id: string | null; marca: Marca;
  trabajo_descripcion: string; estado: Estado; observaciones: string | null; horas_trabajadas: number | null;
  visto_por: string[];
}
interface Profile { id: string; nombre: string }
interface Cliente { id: string; nombre: string }

export default function Calendario() {
  const [vista, setVista] = useState<"mes" | "semana">("mes");
  const [cursor, setCursor] = useState(new Date());
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [detalle, setDetalle] = useState<Servicio | null>(null);

  const load = async () => {
    const [{ data: srv }, { data: prof }, { data: cli }] = await Promise.all([
      supabase.from("servicios").select("*"),
      supabase.from("profiles").select("id, nombre"),
      supabase.from("clientes").select("id, nombre"),
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
            return (
              <div key={d.toISOString()} className={cn("min-h-[110px] border-b border-r p-1.5 text-xs", !isCur && vista === "mes" && "bg-muted/30 text-muted-foreground")}>
                <div className="mb-1 text-right text-[11px] font-semibold tabular-nums">{format(d, "d")}</div>
                <div className="space-y-1">
                  {evs.slice(0, 4).map((s) => (
                    <button key={s.id}
                      onClick={() => setDetalle(s)}
                      className={cn("w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium", estadoColor(s.estado))}
                    >
                      {s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.split(" ")[0] : "—"}
                      {" · "}
                      {s.cliente_id ? cliById[s.cliente_id] : "—"}
                    </button>
                  ))}
                  {evs.length > 4 && <div className="text-[10px] text-muted-foreground">+{evs.length - 4} más</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <ServicioDetalleDialog servicio={detalle} onOpenChange={(o) => !o && setDetalle(null)} profiles={profiles} clientes={clientes} onChanged={load} />
    </div>
  );
}
