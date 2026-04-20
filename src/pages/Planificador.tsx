import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EstadoBadge, MarcaBadge, rowClassByEstado } from "@/components/StatusBadges";
import { ESTADOS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { Plus, FileSpreadsheet, Filter, MapPin, Wrench } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
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
  visto_por: string[];
}

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }

const SUCURSAL_ABBR: Record<Sucursal, string> = {
  "Santa Rita": "S.Rita",
  "Santa Rosa": "S.Rosa",
  "Campo 9": "Campo 9",
  "Misiones": "Misiones",
  "Loma Plata": "L.Plata",
  "Katuete": "Katuete",
};

export default function Planificador() {
  const { user, isAdmin, isCabecilla } = useAuth();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);

  const [fSemana, setFSemana] = useState<string>("all");
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [fMarca, setFMarca] = useState<string>("all");
  const [fEstado, setFEstado] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [{ data: srv }, { data: prof }, { data: cli }] = await Promise.all([
      supabase.from("servicios").select("*").order("fecha_programada", { ascending: true }),
      supabase.from("profiles").select("id, nombre, sucursal"),
      supabase.from("clientes").select("id, nombre, sucursal"),
    ]);
    setServicios((srv ?? []) as Servicio[]);
    setProfiles((prof ?? []) as Profile[]);
    setClientes((cli ?? []) as Cliente[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const cliById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);

  const semanasDisponibles = useMemo(
    () => Array.from(new Set(servicios.map((s) => s.semana))).sort((a, b) => a - b),
    [servicios],
  );

  const filtered = useMemo(() => {
    return servicios.filter((s) => {
      if (fSemana !== "all" && s.semana !== Number(fSemana)) return false;
      if (fSucursal !== "all" && s.sucursal !== fSucursal) return false;
      if (fTecnico !== "all" && s.tecnico_responsable_id !== fTecnico && !s.auxiliares.includes(fTecnico)) return false;
      if (fMarca !== "all" && s.marca !== fMarca) return false;
      if (fEstado !== "all" && s.estado !== fEstado) return false;
      return true;
    });
  }, [servicios, fSemana, fSucursal, fTecnico, fMarca, fEstado]);

  const canCreate = isAdmin || isCabecilla;

  const onChangeEstado = async (s: Servicio, estado: Estado) => {
    if (estado === "Completado" && !s.horas_trabajadas) {
      setDetalle(s);
      toast.warning("Cargá las horas trabajadas para completar el servicio.");
      return;
    }
    const { error } = await supabase.from("servicios").update({ estado }).eq("id", s.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Estado: ${estado}`);
      load();
    }
  };

  const exportExcel = () => {
    const rows = filtered.map((s) => ({
      Fecha: s.fecha_programada,
      Día: s.dia_semana,
      Semana: s.semana,
      Tipo: s.tipo_trabajo,
      "Técnico Responsable": s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "",
      Auxiliares: s.auxiliares.map((a) => profById[a]?.nombre).filter(Boolean).join(", "),
      Sucursal: s.sucursal,
      Cliente: s.cliente_id ? cliById[s.cliente_id]?.nombre : "",
      Marca: s.marca,
      Trabajo: s.trabajo_descripcion,
      Estado: s.estado,
      Observaciones: s.observaciones ?? "",
      Horas: s.horas_trabajadas ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Servicios");
    XLSX.writeFile(wb, `servicios_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
  };

  const openDetalle = async (s: Servicio) => {
    setDetalle(s);
    if (user && !s.visto_por.includes(user.id)) {
      await supabase.from("servicios").update({ visto_por: [...s.visto_por, user.id] }).eq("id", s.id);
    }
  };

  return (
    <div className="container max-w-[1600px] py-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planificador</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} servicios visibles</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => { setEditing(null); setOpenForm(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo servicio
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <FilterSelect label="Semana" value={fSemana} onChange={setFSemana} options={[
            { v: "all", l: "Todas" },
            ...semanasDisponibles.map((s) => ({ v: String(s), l: `Semana ${s}` })),
          ]} />
          <FilterSelect label="Sucursal" value={fSucursal} onChange={setFSucursal} options={[
            { v: "all", l: "Todas" },
            ...SUCURSALES.map((s) => ({ v: s, l: s })),
          ]} />
          <FilterSelect label="Técnico" value={fTecnico} onChange={setFTecnico} options={[
            { v: "all", l: "Todos" },
            ...profiles.map((p) => ({ v: p.id, l: p.nombre })),
          ]} />
          <FilterSelect label="Marca" value={fMarca} onChange={setFMarca} options={[
            { v: "all", l: "Todas" },
            ...MARCAS.map((m) => ({ v: m, l: m })),
          ]} />
          <FilterSelect label="Estado" value={fEstado} onChange={setFEstado} options={[
            { v: "all", l: "Todos" },
            ...ESTADOS.map((e) => ({ v: e, l: e })),
          ]} />
        </div>
      </Card>

      {/* Desktop table — compacta, 8 columnas */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 px-3 py-2 w-[92px]">Fecha</TableHead>
                <TableHead className="h-9 px-3 py-2">Cliente</TableHead>
                <TableHead className="h-9 px-3 py-2">Trabajo</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[120px]">Marca / Tipo</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[150px]">Responsable</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[80px]">Suc.</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[110px]">Estado</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[50px] text-right">Hs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin servicios.</TableCell></TableRow>
              )}
              {filtered.map((s) => {
                const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
                const tipo = s.tipo_trabajo ?? "Visita de campo";
                const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
                return (
                  <TableRow
                    key={s.id}
                    className={cn(rowClassByEstado(s.estado), "cursor-pointer", unseen && "ring-2 ring-inset ring-primary/40")}
                    onClick={() => openDetalle(s)}
                  >
                    <TableCell className="px-3 py-2 align-top">
                      <div className="font-medium tabular-nums leading-tight">{format(parseISO(s.fecha_programada), "dd/MM/yy")}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{s.dia_semana.slice(0,3)} · S{s.semana}</div>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top font-medium truncate max-w-[180px]" title={s.cliente_id ? cliById[s.cliente_id]?.nombre : ""}>
                      {s.cliente_id ? cliById[s.cliente_id]?.nombre : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top truncate max-w-[280px]" title={s.trabajo_descripcion}>
                      {s.trabajo_descripcion}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <MarcaBadge marca={s.marca} className="self-start text-[10px]" />
                        <Badge variant="outline" className="self-start gap-0.5 px-1.5 py-0 text-[10px] font-normal">
                          <TipoIcon className="h-2.5 w-2.5" />
                          {tipo === "Máquina en taller" ? "Taller" : "Visita"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top truncate" title={s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : ""}>
                      {s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top text-xs text-muted-foreground">{SUCURSAL_ABBR[s.sucursal] ?? s.sucursal}</TableCell>
                    <TableCell className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="w-full text-left">
                            <EstadoBadge estado={s.estado} className="cursor-pointer" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="start">
                          {ESTADOS.map((e) => (
                            <button
                              key={e}
                              onClick={() => onChangeEstado(s, e)}
                              className={cn(
                                "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                                s.estado === e && "bg-accent font-semibold"
                              )}
                            >
                              {e}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top text-right tabular-nums">{s.horas_trabajadas ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {filtered.map((s) => {
          const tipo = s.tipo_trabajo ?? "Visita de campo";
          const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
          return (
            <Card key={s.id} className={cn("p-3", rowClassByEstado(s.estado))} onClick={() => openDetalle(s)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold tabular-nums">{format(parseISO(s.fecha_programada), "dd/MM")}</span>
                    <span className="text-[10px] text-muted-foreground">{s.dia_semana}</span>
                    <MarcaBadge marca={s.marca} className="text-[10px]" />
                    <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px]">
                      <TipoIcon className="h-2.5 w-2.5" />
                      {tipo === "Máquina en taller" ? "Taller" : "Visita"}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium truncate">{s.cliente_id ? cliById[s.cliente_id]?.nombre : "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.trabajo_descripcion}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "—"} · {s.sucursal}
                  </div>
                </div>
                <EstadoBadge estado={s.estado} className="shrink-0 text-[10px]" />
              </div>
            </Card>
          );
        })}
      </div>

      <ServicioFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        servicio={editing}
        profiles={profiles}
        clientes={clientes}
        onSaved={load}
      />
      <ServicioDetalleDialog
        servicio={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        profiles={profiles}
        clientes={clientes}
        onChanged={load}
      />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
