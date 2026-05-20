import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EstadoBadge, MarcaBadge, rowClassByEstado } from "@/components/StatusBadges";
import { ESTADOS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { ProgramarIntervencionDialog } from "@/components/trabajos/ProgramarIntervencionDialog";
import { CalendarPlus, FileSpreadsheet, Filter, MapPin, Wrench, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format, parseISO, getISOWeek } from "date-fns";
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

const SUCURSAL_ABBR: Record<Sucursal, string> = {
  "Santa Rita": "S.Rita",
  "Santa Rosa": "S.Rosa",
  "Campo 9": "Campo 9",
  "Misiones": "Misiones",
  "Loma Plata": "L.Plata",
  "Katuete": "Katuete",
};

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

export default function Planificador() {
  const { user, profile, isAdmin, isCabecilla } = useAuth();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [openProgramar, setOpenProgramar] = useState(false);
  const [trabajosLite, setTrabajosLite] = useState<any[]>([]);
  const [adminCabIds, setAdminCabIds] = useState<Set<string>>(new Set());

  const currentWeek = useMemo(() => String(getISOWeek(new Date())), []);
  const [fSemana, setFSemana] = useState<string>(currentWeek);
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fTecnico, setFTecnico] = useState<string>("all");
  const [fMarca, setFMarca] = useState<string>("all");
  const [fEstado, setFEstado] = useState<string>("all");
  const [fCliente, setFCliente] = useState<string>("");
  const [vista, setVista] = useState<"dia" | "semana">("dia");

  // Default sucursal por perfil al primer load
  useEffect(() => {
    if (!defaultsApplied && profile) {
      if (profile.sucursal && !isAdmin) setFSucursal(profile.sucursal);
      // Para admins no filtrar por sucursal (dejar "all" para ver todas)
      setDefaultsApplied(true);
    }
  }, [profile, isAdmin, defaultsApplied]);

  const load = async () => {
    setLoading(true);

    try {
      const [{ data: srv }, { data: prof }, { data: jor }, cli, { data: trabs }, { data: rls }] = await Promise.all([
        supabase.from("servicios").select("*").order("fecha_programada", { ascending: true }),
        supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        supabase.from("servicio_jornadas").select("servicio_id, fecha, estado, horas_trabajadas, observaciones, tecnico_responsable_id, auxiliares"),
        cargarTodosLosClientes(),
        supabase.from("trabajos").select("id, descripcion_problema, cliente_id, sucursal, marca, tipo_trabajo, estado_general, legacy_servicio_id").order("creado_en", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const adminCab = new Set<string>();
      for (const r of (rls ?? []) as Array<{ user_id: string; role: string }>) {
        if (r.role === "admin" || r.role === "cabecilla") adminCab.add(r.user_id);
      }
      setAdminCabIds(adminCab);

      const serviciosBase = (srv ?? []) as Servicio[];
      const jornadas = (jor ?? []) as Array<{
        servicio_id: string;
        fecha: string;
        estado: Estado;
        horas_trabajadas: number | null;
        observaciones: string | null;
      }>;

      // Expandir: una entrada por jornada. Si un servicio no tiene jornadas (legado), usar su fecha.
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
          expandidos.push(s);
          continue;
        }

        for (const j of lista) {
          const d = parseISO(j.fecha);
          expandidos.push({
            ...s,
            fecha_programada: j.fecha,
            dia_semana: dias[d.getDay()],
            semana: getISOWeek(d),
            estado: j.estado,
            horas_trabajadas: j.horas_trabajadas,
            observaciones: j.observaciones,
          });
        }
      }

      expandidos.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));

      setServicios(expandidos);
      setProfiles((prof ?? []) as Profile[]);
      setClientes(cli);
      setTrabajosLite(trabs ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudieron cargar los datos del planificador");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const cliById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);
  const tecnicosSolo = useMemo(() => profiles.filter(p => !adminCabIds.has(p.id)), [profiles, adminCabIds]);

  const semanasDisponibles = useMemo(
    () => Array.from(new Set(servicios.map((s) => s.semana))).sort((a, b) => a - b),
    [servicios],
  );

  const filtered = useMemo(() => {
    const q = fCliente.trim().toLowerCase();
    return servicios.filter((s) => {
      if (fSemana !== "all" && s.semana !== Number(fSemana)) return false;
      if (fSucursal !== "all" && s.sucursal !== fSucursal) return false;
      if (fTecnico !== "all" && s.tecnico_responsable_id !== fTecnico && !s.auxiliares.includes(fTecnico)) return false;
      if (fMarca !== "all" && s.marca !== fMarca) return false;
      if (fEstado !== "all" && s.estado !== fEstado) return false;
      if (q) {
        const nombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "" : "";
        if (!nombre.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [servicios, fSemana, fSucursal, fTecnico, fMarca, fEstado, fCliente, cliById]);

  // Fechas agrupadas por servicio (dentro del set filtrado) para vista "por semana"
  const fechasPorServicio = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of filtered) {
      const a = m.get(s.id) ?? [];
      a.push(s.fecha_programada);
      m.set(s.id, a);
    }
    for (const a of m.values()) a.sort();
    return m;
  }, [filtered]);

  const displayed = useMemo(() => {
    if (vista === "dia") return filtered;
    const seen = new Set<string>();
    const out: Servicio[] = [];
    for (const s of filtered) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const fechas = fechasPorServicio.get(s.id) ?? [s.fecha_programada];
      out.push({ ...s, fecha_programada: fechas[0] });
    }
    return out;
  }, [filtered, vista, fechasPorServicio]);

  const canCreate = isAdmin || isCabecilla;

  const onChangeEstado = async (s: Servicio, estado: Estado) => {
    if (estado === "Completado" && !s.horas_trabajadas) {
      setDetalle(s);
      toast.warning("Cargá las horas trabajadas para completar el servicio.");
      return;
    }

    // Actualizar la jornada de esa fecha (si existe), no el servicio padre
    const { data: j } = await supabase
      .from("servicio_jornadas")
      .select("id")
      .eq("servicio_id", s.id)
      .eq("fecha", s.fecha_programada)
      .maybeSingle();

    const error = j?.id
      ? (await supabase.from("servicio_jornadas").update({ estado }).eq("id", j.id)).error
      : (await supabase.from("servicios").update({ estado }).eq("id", s.id)).error;

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Estado: ${estado}`);
      load();
    }
  };

  const exportExcel = () => {
    const rows = displayed.map((s) => ({
      Fecha: s.fecha_programada,
      Día: s.dia_semana,
      Semana: s.semana,
      Tipo: s.tipo_trabajo,
      "Técnico Responsable": s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "",
      Auxiliares: s.auxiliares.map((a) => profById[a]?.nombre).filter(Boolean).join(", "),
      Sucursal: s.sucursal,
      Cliente: s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "" : "",
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

  const limpiarFiltros = () => {
    setFSemana("all");
    setFSucursal("all");
    setFTecnico("all");
    setFMarca("all");
    setFEstado("all");
    setFCliente("");
  };

  const activeChips: { label: string; clear: () => void }[] = [];
  if (fSemana !== "all") activeChips.push({ label: `Semana ${fSemana}`, clear: () => setFSemana("all") });
  if (fSucursal !== "all") activeChips.push({ label: fSucursal, clear: () => setFSucursal("all") });
  if (fTecnico !== "all") activeChips.push({ label: profById[fTecnico]?.nombre ?? "Técnico", clear: () => setFTecnico("all") });
  if (fMarca !== "all") activeChips.push({ label: fMarca, clear: () => setFMarca("all") });
  if (fEstado !== "all") activeChips.push({ label: fEstado, clear: () => setFEstado("all") });

  return (
    <div className="container max-w-[1600px] py-3 px-3 sm:py-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Planificador</h1>
          <p className="text-xs text-muted-foreground">{displayed.length} servicios visibles</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={fCliente}
              onChange={(e) => setFCliente(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-9 w-[200px] pl-7 text-sm"
            />
            {fCliente && (
              <button
                onClick={() => setFCliente("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <ToggleGroup
            type="single"
            value={vista}
            onValueChange={(v) => v && setVista(v as "dia" | "semana")}
            size="sm"
            variant="outline"
          >
            <ToggleGroupItem value="dia" className="h-9 px-3 text-xs">Por día</ToggleGroupItem>
            <ToggleGroupItem value="semana" className="h-9 px-3 text-xs">Por semana</ToggleGroupItem>
          </ToggleGroup>

          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filtros
                {activeChips.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{activeChips.length}</Badge>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <FilterField
                  label="Semana"
                  value={fSemana}
                  onChange={setFSemana}
                  options={[
                    { v: "all", l: "Todas" },
                    ...semanasDisponibles.map((s) => ({ v: String(s), l: `Semana ${s}` })),
                  ]}
                />

                <FilterField
                  label="Sucursal"
                  value={fSucursal}
                  onChange={setFSucursal}
                  options={[
                    { v: "all", l: "Todas" },
                    ...SUCURSALES.map((s) => ({ v: s, l: s })),
                  ]}
                />

                <FilterField
                  label="Técnico"
                  value={fTecnico}
                  onChange={setFTecnico}
                  options={[
                    { v: "all", l: "Todos" },
                    ...tecnicosSolo.map((p) => ({ v: p.id, l: p.nombre })),
                  ]}
                />

                <FilterField
                  label="Marca"
                  value={fMarca}
                  onChange={setFMarca}
                  options={[
                    { v: "all", l: "Todas" },
                    ...MARCAS.map((m) => ({ v: m, l: m })),
                  ]}
                />

                <FilterField
                  label="Estado"
                  value={fEstado}
                  onChange={setFEstado}
                  options={[
                    { v: "all", l: "Todos" },
                    ...ESTADOS.map((e) => ({ v: e, l: e })),
                  ]}
                />

                <div className="pt-2 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={limpiarFiltros}>Limpiar</Button>
                  <Button className="flex-1" onClick={() => setFiltersOpen(false)}>Aplicar</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>

          {canCreate && (
            <Button size="sm" onClick={() => setOpenProgramar(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" /> Programar intervención
            </Button>
          )}
        </div>
      </div>

      {/* Chips de filtros activos */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((c, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 text-[11px] font-normal">
              {c.label}
              <button onClick={c.clear} className="rounded-sm hover:bg-background/60 p-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          <button onClick={limpiarFiltros} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
            Limpiar todo
          </button>
        </div>
      )}

      {/* Desktop table */}
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
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell>
                </TableRow>
              )}

              {!loading && displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin servicios.</TableCell>
                </TableRow>
              )}

              {displayed.map((s) => {
                const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
                const tipo = s.tipo_trabajo ?? "Visita de campo";
                const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
                const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
                const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "—" : "—";
                const fechasSrv = fechasPorServicio.get(s.id) ?? [s.fecha_programada];
                const multi = vista === "semana" && fechasSrv.length > 1;
                const fechaLabel = multi
                  ? `${format(parseISO(fechasSrv[0]), "dd/MM")} – ${format(parseISO(fechasSrv[fechasSrv.length - 1]), "dd/MM/yy")}`
                  : format(parseISO(s.fecha_programada), "dd/MM/yy");

                return (
                  <TableRow
                    key={`${s.id}-${s.fecha_programada}`}
                    className={cn(rowClassByEstado(s.estado), "cursor-pointer", unseen && "ring-2 ring-inset ring-primary/40")}
                    onClick={() => openDetalle(s)}
                  >
                    <TableCell className="px-3 py-2 align-top">
                      <div className="font-medium tabular-nums leading-tight flex items-center gap-1">
                        {fechaLabel}
                        {multi && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal tabular-nums">
                            {fechasSrv.length}d
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{s.dia_semana.slice(0, 3)} · S{s.semana}</div>
                    </TableCell>

                    <TableCell className="px-3 py-2 align-top font-medium truncate max-w-[180px]" title={clienteNombre}>
                      {clienteNombre}
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

                    <TableCell className="px-3 py-2 align-top truncate" title={responsableNombre}>
                      {responsableNombre}
                    </TableCell>

                    <TableCell className="px-3 py-2 align-top text-xs text-muted-foreground">
                      {SUCURSAL_ABBR[s.sucursal] ?? s.sucursal}
                    </TableCell>

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
                                s.estado === e && "bg-accent font-semibold",
                              )}
                            >
                              {e}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </TableCell>

                    <TableCell className="px-3 py-2 align-top text-right tabular-nums">
                      {s.horas_trabajadas ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {loading && <p className="text-center text-xs text-muted-foreground py-6">Cargando…</p>}
        {!loading && displayed.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Sin servicios.</p>}

        {displayed.map((s) => {
          const tipo = s.tipo_trabajo ?? "Visita de campo";
          const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
          const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
          const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
          const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "Sin asignar" : "Sin asignar";
          const fechasSrv = fechasPorServicio.get(s.id) ?? [s.fecha_programada];
          const multi = vista === "semana" && fechasSrv.length > 1;
          const fechaLabel = multi
            ? `${format(parseISO(fechasSrv[0]), "dd/MM")}–${format(parseISO(fechasSrv[fechasSrv.length - 1]), "dd/MM")}`
            : format(parseISO(s.fecha_programada), "dd/MM");

          return (
            <Card
              key={`${s.id}-${s.fecha_programada}`}
              className={cn("p-2.5 cursor-pointer", rowClassByEstado(s.estado), unseen && "ring-2 ring-primary/40")}
              onClick={() => openDetalle(s)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">{fechaLabel}</span>
                    {multi && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">{fechasSrv.length}d</Badge>}
                    <span>·</span>
                    <span>{s.dia_semana.slice(0, 3)}</span>
                    <TipoIcon className="h-3 w-3" />
                  </div>

                  <div className="text-sm font-semibold truncate">{clienteNombre}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 leading-snug">{s.trabajo_descripcion}</div>

                  <div className="text-[10px] text-muted-foreground pt-0.5">
                    {responsableNombre}
                    <span className="mx-1">·</span>
                    {SUCURSAL_ABBR[s.sucursal] ?? s.sucursal}
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
        fechaContexto={detalle?.fecha_programada}
      />

      <ProgramarIntervencionDialog
        open={openProgramar}
        onOpenChange={setOpenProgramar}
        trabajos={trabajosLite}
        clientes={clientes}
        tecnicos={tecnicosSolo}
        onSaved={load}
      />
    </div>
  );
}

function FilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
