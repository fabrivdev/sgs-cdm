import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge, rowClassByEstado } from "@/components/StatusBadges";
import { ESTADOS, ESTADO_LABELS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { ProgramarIntervencionDialog } from "@/components/trabajos/ProgramarIntervencionDialog";
import { FiltersBar, FilterSelect, FilterDate } from "@/components/filters/FiltersBar";
import { CalendarPlus, FileSpreadsheet, MapPin, Wrench } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format, parseISO, getISOWeek } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pageDescription, pageShellWide, pageTitle, tableText } from "@/lib/ui-classes";
import { trabajoReferencia, trabajoOsNumero } from "@/lib/trabajos";

interface Servicio {
  id: string;
  jornada_id?: string | null;
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
  const [searchParams] = useSearchParams();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [detalle, setDetalle] = useState<Servicio | null>(null);
  
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
  const [fVencidas, setFVencidas] = useState<string>("all");
  const [fDatos, setFDatos] = useState<string>("all");
  const [vista, setVista] = useState<"dia" | "semana">("dia");

  // Default sucursal por perfil al primer load
  useEffect(() => {
    if (!defaultsApplied && profile) {
      if (profile.sucursal && !isAdmin && !searchParams.get("sucursal")) setFSucursal(profile.sucursal);
      // Para admins no filtrar por sucursal (dejar "all" para ver todas)
      setDefaultsApplied(true);
    }
  }, [profile, isAdmin, defaultsApplied, searchParams]);

  useEffect(() => {
    const estado = searchParams.get("estado");
    const sucursal = searchParams.get("sucursal");
    const overdue = searchParams.get("overdue");
    const sinHoras = searchParams.get("sin_horas");
    const semana = searchParams.get("semana");

    if (estado && ESTADOS.includes(estado as Estado)) setFEstado(estado);
    if (sucursal && SUCURSALES.includes(sucursal as Sucursal)) setFSucursal(sucursal);
    if (overdue === "7") {
      setFVencidas("7");
      setFEstado("Pendiente");
      setFSemana("all");
    }
    if (sinHoras === "1") {
      setFDatos("sin_horas");
      setFEstado("Completado");
      setFSemana("all");
    }
    if (semana) setFSemana(semana);
  }, [searchParams]);

  const load = async () => {
    setLoading(true);

    try {
      const [{ data: srv }, { data: prof }, { data: jor }, cli, { data: trabs }, { data: rls }] = await Promise.all([
        supabase.from("servicios").select("*").order("fecha_programada", { ascending: true }),
        supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        supabase.from("servicio_jornadas").select("id, servicio_id, fecha, estado, horas_trabajadas, observaciones, tecnico_responsable_id, auxiliares"),
        cargarTodosLosClientes(),
        supabase.from("trabajos").select("id, codigo, os_numero, proxima_accion, descripcion_problema, cliente_id, sucursal, marca, tipo_trabajo, estado_general, legacy_servicio_id").order("creado_en", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const adminCab = new Set<string>();
      for (const r of (rls ?? []) as Array<{ user_id: string; role: string }>) {
        if (r.role === "admin" || r.role === "cabecilla") adminCab.add(r.user_id);
      }
      setAdminCabIds(adminCab);

      const serviciosBase = (srv ?? []) as Servicio[];
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
            jornada_id: j.id,
            fecha_programada: j.fecha,
            dia_semana: dias[d.getDay()],
            semana: getISOWeek(d),
            estado: j.estado,
            horas_trabajadas: j.horas_trabajadas,
            observaciones: j.observaciones,
            // Cada jornada puede tener su propia cuadrilla; si no, hereda del servicio padre.
            tecnico_responsable_id: j.tecnico_responsable_id ?? s.tecnico_responsable_id,
            auxiliares: (j.auxiliares && j.auxiliares.length > 0) ? j.auxiliares : s.auxiliares,
          });
        }
      }

      expandidos.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));

      setServicios(expandidos);
      setProfiles((prof ?? []) as Profile[]);
      setClientes(cli);
      const jornadasPorServicio = new Map<string, Array<{ fecha: string; estado: Estado }>>();
      for (const j of jornadas) {
        const list = jornadasPorServicio.get(j.servicio_id) ?? [];
        list.push({ fecha: j.fecha, estado: j.estado });
        jornadasPorServicio.set(j.servicio_id, list);
      }

      setTrabajosLite(((trabs ?? []) as any[]).map((t) => ({
        ...t,
        jornadas: t.legacy_servicio_id ? jornadasPorServicio.get(t.legacy_servicio_id) ?? [] : [],
      })));
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
  const refByServicio = useMemo(() => {
    const m = new Map<string, { ref: string; os: string; codigo: string }>();
    for (const t of trabajosLite) {
      if (!t.legacy_servicio_id) continue;
      m.set(t.legacy_servicio_id, {
        ref: trabajoReferencia(t),
        os: trabajoOsNumero(t),
        codigo: t.codigo ?? "",
      });
    }
    return m;
  }, [trabajosLite]);

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
      if (fDatos === "sin_horas" && !(s.estado === "Completado" && !Number(s.horas_trabajadas))) return false;
      if (fVencidas === "7") {
        if (s.estado !== "Pendiente") return false;
        const fecha = new Date(`${s.fecha_programada}T00:00:00`);
        const hoy = new Date(new Date().toDateString());
        const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000);
        if (dias <= 7) return false;
      }
      if (q) {
        const nombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "" : "";
        const r = refByServicio.get(s.id);
        const codigo = r?.codigo ?? "";
        const os = r?.os ?? "";
        const ref = r?.ref ?? "";
        if (
          !nombre.toLowerCase().includes(q) &&
          !codigo.toLowerCase().includes(q) &&
          !os.toLowerCase().includes(q) &&
          !ref.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [servicios, fSemana, fSucursal, fTecnico, fMarca, fEstado, fDatos, fVencidas, fCliente, cliById, refByServicio]);

  const displayed = useMemo(() => filtered, [filtered]);

  const canCreate = isAdmin || isCabecilla;


  const exportExcel = () => {
    const rows = displayed.map((s) => ({
      Fecha: s.fecha_programada,
      Dia: s.dia_semana,
      Semana: s.semana,
      Tipo: s.tipo_trabajo,
      "Técnico Responsable": s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre : "",
      Auxiliares: s.auxiliares.map((a) => profById[a]?.nombre).filter(Boolean).join(", "),
      Sucursal: s.sucursal,
      Cliente: s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "" : "",
      Marca: s.marca,
      Trabajo: s.trabajo_descripcion,
      Resultado: s.estado,
      Observaciones: s.observaciones ?? "",
      Horas: s.horas_trabajadas ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Intervenciones");
    XLSX.writeFile(wb, `intervenciones_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
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
    setFVencidas("all");
    setFDatos("all");
    setFCliente("");
  };

  const activeChips: { label: string; clear: () => void }[] = [];
  if (fSemana !== "all") activeChips.push({ label: `Semana ${fSemana}`, clear: () => setFSemana("all") });
  if (fSucursal !== "all") activeChips.push({ label: fSucursal, clear: () => setFSucursal("all") });
  if (fTecnico !== "all") activeChips.push({ label: profById[fTecnico]?.nombre ?? "Técnico", clear: () => setFTecnico("all") });
  if (fMarca !== "all") activeChips.push({ label: fMarca, clear: () => setFMarca("all") });
  if (fEstado !== "all") activeChips.push({ label: fEstado, clear: () => setFEstado("all") });
  if (fVencidas === "7") activeChips.push({ label: "+7d sin cierre", clear: () => setFVencidas("all") });
  if (fDatos === "sin_horas") activeChips.push({ label: "Sin horas", clear: () => setFDatos("all") });

  return (
    <div className={pageShellWide}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>Planificador</h1>
          <p className={pageDescription}>
            {displayed.length} jornadas visibles · Plan diario y semanal de trabajo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">

          <Button variant="outline" size="sm" onClick={exportExcel} className="hidden sm:inline-flex">
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>

          {canCreate && (
            <Button size="sm" onClick={() => setOpenProgramar(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" /> Programar jornada
            </Button>
          )}
        </div>
      </div>

      <FiltersBar
        search={{ value: fCliente, onChange: setFCliente, placeholder: "Buscar OS, TR-000123 o cliente…" }}
        activeCount={activeChips.length}
        onClear={limpiarFiltros}
        meta={`${displayed.length} jornada${displayed.length !== 1 ? "s" : ""}`}
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[150px]"
          options={[{ value: "all", label: "Todas las sucursales" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Técnico" value={fTecnico} onChange={setFTecnico} placeholder="Técnico" width="w-[160px]"
          options={[{ value: "all", label: "Todos los técnicos" }, ...tecnicosSolo.map(p => ({ value: p.id, label: p.nombre }))]}
        />
        <FilterSelect
          label="Marca" value={fMarca} onChange={setFMarca} placeholder="Marca" width="w-[120px]"
          options={[{ value: "all", label: "Todas las marcas" }, ...MARCAS.map(m => ({ value: m, label: m }))]}
        />
        <FilterSelect
          label="Estado" value={fEstado} onChange={setFEstado} placeholder="Estado" width="w-[130px]"
          options={[{ value: "all", label: "Todo estado" }, ...ESTADOS.map(e => ({ value: e, label: ESTADO_LABELS[e] }))]}
        />
        <FilterSelect
          label="Semana" value={fSemana} onChange={setFSemana} placeholder="Semana" width="w-[130px]"
          options={[{ value: "all", label: "Toda semana" }, ...semanasDisponibles.map(s => ({ value: String(s), label: `Semana ${s}` }))]}
        />
      </FiltersBar>



      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table className={tableText}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 px-3 py-2 w-[92px]">Fecha</TableHead>
                <TableHead className="h-9 px-3 py-2">Cliente</TableHead>
                <TableHead className="h-9 px-3 py-2">Trabajo</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[120px]">Marca / Tipo</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[150px]">Responsable</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[80px]">Suc.</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[110px]">Resultado</TableHead>
                <TableHead className="h-9 px-3 py-2 w-[50px] text-right">Hs</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                </TableRow>
              )}

              {!loading && displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin intervenciones.</TableCell>
                </TableRow>
              )}

              {displayed.map((s) => {
                const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
                const tipo = s.tipo_trabajo ?? "Visita de campo";
                const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
                const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
                const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "—" : "—";
                const fechaLabel = format(parseISO(s.fecha_programada), "dd/MM/yy");

                return (
                  <TableRow
                    key={`${s.id}-${s.fecha_programada}`}
                    className={cn(rowClassByEstado(s.estado), "cursor-pointer", unseen && "ring-2 ring-inset ring-primary/40")}
                    onClick={() => openDetalle(s)}
                  >
                    <TableCell className="px-3 py-2 align-top">
                      <div className="font-medium tabular-nums leading-tight flex items-center gap-1">
                        {fechaLabel}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{s.dia_semana.slice(0, 3)} · S{s.semana}</div>
                    </TableCell>

                    <TableCell className="px-3 py-2 align-top font-medium truncate max-w-[180px]" title={clienteNombre}>
                      {clienteNombre}
                    </TableCell>

                    <TableCell className="px-3 py-2 align-top truncate max-w-[280px]" title={s.trabajo_descripcion}>
                      <div className="flex items-center gap-1.5">
                        {refByServicio.get(s.id)?.ref && (
                          <span className="rounded bg-muted px-1 py-0 text-[10px] font-mono font-semibold text-muted-foreground tabular-nums shrink-0">
                            {refByServicio.get(s.id)?.ref}
                          </span>
                        )}
                        <span className="truncate">{s.trabajo_descripcion}</span>
                      </div>
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

                    <TableCell className="px-3 py-2 align-top">
                      <EstadoBadge estado={s.estado} />
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
      <div className="space-y-2 md:hidden">
        {loading && <p className="text-center text-xs text-muted-foreground py-6">Cargando...</p>}
        {!loading && displayed.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Sin intervenciones.</p>}

        {displayed.map((s) => {
          const tipo = s.tipo_trabajo ?? "Visita de campo";
          const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
          const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
          const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
          const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "Sin asignar" : "Sin asignar";
          const fechaLabel = format(parseISO(s.fecha_programada), "dd/MM");

          return (
            <Card
              key={`${s.id}-${s.fecha_programada}`}
              className={cn(
                "cursor-pointer overflow-hidden rounded-[18px] border bg-card p-3 shadow-sm transition-colors",
                "min-h-[132px]",
                rowClassByEstado(s.estado),
                unseen && "ring-2 ring-primary/40",
              )}
              onClick={() => openDetalle(s)}
            >
              <div className="flex min-h-[108px] flex-col justify-between gap-2">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">{fechaLabel}</span>
                        <span>·</span>
                        <span>{s.dia_semana.slice(0, 3)}</span>
                        <TipoIcon className="h-3 w-3 shrink-0" />
                      </div>
                    </div>

                    <EstadoBadge estado={s.estado} className="shrink-0 text-[10px]" />
                  </div>

                  <div className="space-y-1">
                    {refByServicio.get(s.id)?.ref && (
                      <div className="flex">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground tabular-nums">
                          {refByServicio.get(s.id)?.ref}
                        </span>
                      </div>
                    )}

                    <div className="line-clamp-1 text-[15px] font-semibold leading-tight">
                      {clienteNombre}
                    </div>

                    <div className="line-clamp-2 min-h-[36px] text-[13px] leading-[1.35] text-muted-foreground">
                      {s.trabajo_descripcion}
                    </div>
                  </div>
                </div>

                <div className="truncate pt-0.5 text-[11px] text-muted-foreground">
                  {responsableNombre}
                  <span className="mx-1">·</span>
                  {SUCURSAL_ABBR[s.sucursal] ?? s.sucursal}
                </div>
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
