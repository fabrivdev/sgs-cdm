import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { EstadoBadge, MarcaBadge, rowClassByEstado } from "@/components/StatusBadges";
import { ESTADOS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal } from "@/lib/constants";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { Plus, FileSpreadsheet, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
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
  trabajo_descripcion: string;
  estado: Estado;
  observaciones: string | null;
  horas_trabajadas: number | null;
  visto_por: string[];
}

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal }

export default function Planificador() {
  const { user, isAdmin, isCabecilla, profile } = useAuth();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);

  // Filtros
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

  // Mark visto on opening detail
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

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-24">Fecha</TableHead>
                <TableHead className="w-20">Día</TableHead>
                <TableHead className="w-16">Sem</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Auxiliares</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-20">Marca</TableHead>
                <TableHead>Trabajo</TableHead>
                <TableHead className="w-32">Estado</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead className="w-16 text-right">Hs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Sin servicios.</TableCell></TableRow>
              )}
              {filtered.map((s) => {
                const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
                return (
                  <TableRow
                    key={s.id}
                    className={cn(rowClassByEstado(s.estado), "cursor-pointer", unseen && "ring-2 ring-inset ring-primary/40")}
                    onClick={() => openDetalle(s)}
                  >
                    <TableCell className="font-medium tabular-nums">{format(parseISO(s.fecha_programada), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-xs">{s.dia_semana}</TableCell>
                    <TableCell className="text-xs tabular-nums">{s.semana}</TableCell>
                    <TableCell className="text-sm">{s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "—"}</TableCell>
                    <TableCell className="text-xs">{s.auxiliares.map((a) => profById[a]?.nombre).filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs">{s.sucursal}</TableCell>
                    <TableCell className="text-sm">{s.cliente_id ? cliById[s.cliente_id]?.nombre : "—"}</TableCell>
                    <TableCell><MarcaBadge marca={s.marca} /></TableCell>
                    <TableCell className="text-sm max-w-[260px] truncate" title={s.trabajo_descripcion}>{s.trabajo_descripcion}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={s.estado} onValueChange={(v) => onChangeEstado(s, v as Estado)}>
                        <SelectTrigger className="h-8 w-full bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={s.observaciones ?? ""}>{s.observaciones ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.horas_trabajadas ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {filtered.map((s) => (
          <Card key={s.id} className={cn("p-3", rowClassByEstado(s.estado))} onClick={() => openDetalle(s)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums">{format(parseISO(s.fecha_programada), "dd/MM")}</span>
                  <span className="text-[10px] text-muted-foreground">{s.dia_semana}</span>
                  <MarcaBadge marca={s.marca} className="text-[10px]" />
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
        ))}
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
