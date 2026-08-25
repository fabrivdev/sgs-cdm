import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";
import { useAuth } from "@/hooks/useAuth";
import { useServicioTecnicos } from "@/hooks/useServicioTecnicos";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge, rowClassByEstado } from "@/components/StatusBadges";
import { ESTADOS, ESTADO_LABELS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";
import { ServicioDetalleDialog } from "@/components/ServicioDetalleDialog";
import { ProgramarIntervencionDialog } from "@/components/trabajos/ProgramarIntervencionDialog";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { FilterMultiSelect, matchesMulti } from "@/components/filters/FilterMultiSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { MobileCardSkeletons, TableSkeletonRows } from "@/components/LoadingSkeletons";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, FileSpreadsheet, MapPin, Wrench } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addDays, format, getISOWeek, parseISO, setISOWeek, startOfWeek } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pageShellWide, tableText } from "@/lib/ui-classes";
import { PageHeader } from "@/components/layout/AppPrimitives";
import { trabajoReferencia, trabajoOsNumero } from "@/lib/trabajos";
import { resolverCuadrillaJornada } from "@/lib/jornada-cuadrilla";

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
  cod_entidad?: string | null;
  ruc?: string | null;
  region?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  correo_principal?: string | null;
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
      .select("id, nombre, sucursal, cod_entidad, ruc, region, direccion, localidad, correo_principal")
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
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
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
  const { data: tecnicosSolo = [] } = useServicioTecnicos();

  const currentWeek = useMemo(() => String(getISOWeek(new Date())), []);
  const [fSemana, setFSemana] = useState<string>(currentWeek);
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [fMarcas, setFMarcas] = useState<string[]>([]);
  const [fEstados, setFEstados] = useState<string[]>([]);
  const [fCliente, setFCliente] = useState<string>("");
  const [fVencidas, setFVencidas] = useState<string>("all");
  const [fDatos, setFDatos] = useState<string>("all");
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [soloPrincipalesSemana, setSoloPrincipalesSemana] = useState(false);

  const assistantWeekRange = useMemo(() => {
    if (fSemana === "all") return {};
    const weekNumber = Number(fSemana);
    if (!Number.isFinite(weekNumber)) return {};
    const weekStart = startOfWeek(setISOWeek(new Date(), weekNumber), { weekStartsOn: 1 });
    return {
      fecha_desde: format(weekStart, "yyyy-MM-dd"),
      fecha_hasta: format(addDays(weekStart, 6), "yyyy-MM-dd"),
    };
  }, [fSemana]);

  useEffect(() => {
    setPageFilters({
      vista,
      semana: fSemana === "all" ? undefined : fSemana,
      ...assistantWeekRange,
      sucursales: fSucursales.length ? fSucursales : undefined,
      tecnicos: fTecnicos.length ? fTecnicos : undefined,
      marcas: fMarcas.length ? fMarcas : undefined,
      estados: fEstados.length ? fEstados : undefined,
      cliente: fCliente || undefined,
      vencimiento: fVencidas === "all" ? undefined : fVencidas,
    });
    return clearPageFilters;
  }, [assistantWeekRange, clearPageFilters, fCliente, fEstados, fMarcas, fSemana, fSucursales, fTecnicos, fVencidas, setPageFilters, vista]);

  // Default sucursal por perfil al primer load
  useEffect(() => {
    if (!defaultsApplied && profile) {
      if (profile.sucursal && !isAdmin && !searchParams.get("sucursal")) setFSucursales([profile.sucursal]);
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

    if (estado && ESTADOS.includes(estado as Estado)) setFEstados([estado]);
    if (sucursal && SUCURSALES.includes(sucursal as Sucursal)) setFSucursales([sucursal]);
    if (overdue === "7") {
      setFVencidas("7");
      setFEstados(["Pendiente"]);
      setFSemana("all");
    }
    if (sinHoras === "1") {
      setFDatos("sin_horas");
      setFEstados(["Completado"]);
      setFSemana("all");
    }
    if (semana) setFSemana(semana);
  }, [searchParams]);

  const load = async () => {
    setLoading(true);

    try {
      const [{ data: srv }, { data: prof }, { data: jor }, cli, { data: trabs }] = await Promise.all([
        supabase.from("servicios").select("*").order("fecha_programada", { ascending: true }),
        supabase.from("profiles").select("id, nombre, sucursal").order("nombre", { ascending: true }),
        supabase.from("servicio_jornadas").select("id, servicio_id, fecha, estado, horas_trabajadas, observaciones, tecnico_responsable_id, auxiliares"),
        cargarTodosLosClientes(),
        supabase.from("trabajos").select("id, codigo, os_numero, proxima_accion, descripcion_problema, cliente_id, sucursal, marca, tipo_trabajo, estado_general, legacy_servicio_id").order("creado_en", { ascending: false }),
      ]);

      const trabajosRaw = (trabs ?? []) as any[];
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
          const crew = resolverCuadrillaJornada(j, s);
          expandidos.push({
            ...s,
            jornada_id: j.id,
            fecha_programada: j.fecha,
            dia_semana: dias[d.getDay()],
            semana: getISOWeek(d),
            estado: j.estado,
            horas_trabajadas: j.horas_trabajadas,
            observaciones: j.observaciones,
            // La cuadrilla de la jornada manda; solo las legado heredan del servicio.
            tecnico_responsable_id: crew.principalId,
            auxiliares: crew.auxiliares,
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

      setTrabajosLite(trabajosRaw.map((t) => ({
        ...t,
        jornadas: t.legacy_servicio_id ? jornadasPorServicio.get(t.legacy_servicio_id) ?? [] : [],
      })));
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar los datos del planificador");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const cliById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);
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
  const semanasSelector = useMemo(() => {
    const current = Number(currentWeek);
    const selected = Number(fSemana);
    const set = new Set<number>();

    for (let week = Math.max(1, current - 6); week <= Math.min(53, current + 8); week++) {
      set.add(week);
    }
    if (Number.isFinite(selected) && selected >= 1 && selected <= 53) set.add(selected);
    for (const week of semanasDisponibles) {
      if (Math.abs(week - current) <= 8) set.add(week);
    }

    return Array.from(set).sort((a, b) => a - b);
  }, [currentWeek, fSemana, semanasDisponibles]);

  const moverSemana = (delta: number) => {
    const base = fSemana === "all" ? Number(currentWeek) : Number(fSemana);
    const next = Math.max(1, Math.min(53, (Number.isFinite(base) ? base : Number(currentWeek)) + delta));
    setFSemana(String(next));
  };

  const filtered = useMemo(() => {
    const q = fCliente.trim().toLowerCase();
    return servicios.filter((s) => {
      if (fSemana !== "all" && s.semana !== Number(fSemana)) return false;
      if (!matchesMulti(fSucursales, s.sucursal)) return false;
      if (fTecnicos.length > 0 && !fTecnicos.some((id) => s.tecnico_responsable_id === id || s.auxiliares.includes(id))) return false;
      if (!matchesMulti(fMarcas, s.marca)) return false;
      if (!matchesMulti(fEstados, s.estado)) return false;
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
  }, [servicios, fSemana, fSucursales, fTecnicos, fMarcas, fEstados, fDatos, fVencidas, fCliente, cliById, refByServicio]);

  const displayed = useMemo(() => {
    if (!soloPrincipalesSemana || fSemana === "all") return filtered;

    const firstByServicio = new Set<string>();
    return filtered.filter((row) => {
      if (firstByServicio.has(row.id)) return false;
      firstByServicio.add(row.id);
      return true;
    });
  }, [filtered, soloPrincipalesSemana, fSemana]);

  const continuidadByRow = useMemo(() => {
    const meta = new Map<string, { orden: number; total: number }>();
    const porServicio = new Map<string, Servicio[]>();

    for (const servicio of servicios) {
      const list = porServicio.get(servicio.id) ?? [];
      list.push(servicio);
      porServicio.set(servicio.id, list);
    }

    for (const [servicioId, lista] of porServicio.entries()) {
      const ordenadas = [...lista].sort((a, b) => {
        if (a.fecha_programada === b.fecha_programada) {
          return String(a.jornada_id ?? "").localeCompare(String(b.jornada_id ?? ""));
        }
        return a.fecha_programada.localeCompare(b.fecha_programada);
      });

      const total = ordenadas.length;
      ordenadas.forEach((row, index) => {
        meta.set(`${servicioId}-${row.jornada_id ?? row.fecha_programada}`, {
          orden: index + 1,
          total,
        });
      });
    }

    return meta;
  }, [servicios]);

  const totalHoras = useMemo(() => {
    return displayed.reduce((sum, s) => sum + (Number(s.horas_trabajadas) || 0), 0);
  }, [displayed]);

  const canCreate = isAdmin || isCabecilla;



  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = displayed.map((s) => {
      const cli = s.cliente_id ? cliById[s.cliente_id] : null;
      const ref = refByServicio.get(s.id);
      const resp = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id] : null;
      return {
        Fecha: s.fecha_programada,
        Dia: s.dia_semana,
        Semana: s.semana,
        Tipo: s.tipo_trabajo,
        "Código Trabajo": ref?.codigo ?? "",
        "OS Nº": ref?.os ?? "",
        Referencia: ref?.ref ?? "",
        "Técnico Responsable": resp?.nombre ?? "",
        "Sucursal Técnico": resp?.sucursal ?? "",
        Auxiliares: s.auxiliares.map((a) => profById[a]?.nombre).filter(Boolean).join(", "),
        Sucursal: s.sucursal,
        Cliente: cli?.nombre ?? "",
        "Cod. Entidad": cli?.cod_entidad ?? "",
        RUC: cli?.ruc ?? "",
        "Sucursal Cliente": cli?.sucursal ?? "",
        Region: cli?.region ?? "",
        "Direccion Cliente": cli?.direccion ?? "",
        "Localidad Cliente": cli?.localidad ?? "",
        "Correo Cliente": cli?.correo_principal ?? "",
        Marca: s.marca,
        Trabajo: s.trabajo_descripcion,
        Resultado: s.estado,
        Observaciones: s.observaciones ?? "",
        Horas: s.horas_trabajadas ?? "",
        "Visto por (cant.)": s.visto_por?.length ?? 0,
        "ID Servicio": s.id,
        "ID Jornada": s.jornada_id ?? "",
        "ID Cliente": s.cliente_id ?? "",
      };
    });

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Intervenciones");

    if (fSemana !== "all") {
      const semanaServicios = displayed.filter((s) => s.semana === Number(fSemana));
      const semanaBase =
        semanaServicios[0]?.fecha_programada ??
        servicios.find((s) => s.semana === Number(fSemana))?.fecha_programada;

      if (semanaBase) {
        const inicioSemana = startOfWeek(parseISO(semanaBase), { weekStartsOn: 1 });
        const diasSemana = Array.from({ length: 7 }, (_, index) => addDays(inicioSemana, index));
        const tecnicoIds = new Set<string>();

        for (const s of semanaServicios) {
          if (s.tecnico_responsable_id) tecnicoIds.add(s.tecnico_responsable_id);
          for (const auxiliar of s.auxiliares) tecnicoIds.add(auxiliar);
        }

        const tecnicosSemana = (
          fTecnicos.length > 0
            ? tecnicosSolo.filter((profile) => fTecnicos.includes(profile.id))
            : tecnicosSolo.filter((profile) => tecnicoIds.has(profile.id))
        ).sort((a, b) => a.nombre.localeCompare(b.nombre));

        const sheetRows = tecnicosSemana.map((profile) => {
          const baseRow: Record<string, string | number> = {
            Tecnico: profile.nombre,
            Sucursal: profile.sucursal ?? "",
          };

          let totalJornadas = 0;

          for (const dia of diasSemana) {
            const key = format(dia, "EEE dd/MM");
            const serviciosDia = semanaServicios.filter((s) => {
              const crew = [s.tecnico_responsable_id, ...s.auxiliares].filter(Boolean) as string[];
              return crew.includes(profile.id) && s.fecha_programada === format(dia, "yyyy-MM-dd");
            });

            totalJornadas += serviciosDia.length;
            baseRow[key] = serviciosDia
              .map((s) => {
                const ref = refByServicio.get(s.id);
                const codigo = ref?.codigo ?? ref?.ref ?? "";
                const cliente = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "Sin cliente";
                return codigo ? `${codigo} - ${cliente}` : cliente;
              })
              .join(" | ");
          }

          baseRow["Total jornadas"] = totalJornadas;
          return baseRow;
        });

        const wsTecnicos = XLSX.utils.json_to_sheet(sheetRows);
        wsTecnicos["!cols"] = [
          { wch: 28 },
          { wch: 16 },
          ...diasSemana.map(() => ({ wch: 32 })),
          { wch: 14 },
        ];
        XLSX.utils.book_append_sheet(wb, wsTecnicos, "Tecnico por dia");
      }
    }

    XLSX.writeFile(wb, `intervenciones_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
  };

  const openDetalle = async (s: Servicio) => {
    setDetalle(s);

    if (user && !s.visto_por.includes(user.id)) {
      await supabase.from("servicios").update({ visto_por: [...s.visto_por, user.id] }).eq("id", s.id);
    }
  };

  useEffect(() => {
    const servicioId = searchParams.get("servicio");
    if (!servicioId || loading || detalle) return;
    const servicio = servicios.find((s) => s.id === servicioId);
    if (servicio) openDetalle(servicio);
  }, [searchParams, loading, servicios, detalle]);

  const limpiarFiltros = () => {
    setFSemana("all");
    setFSucursales([]);
    setFTecnicos([]);
    setFMarcas([]);
    setFEstados([]);
    setFVencidas("all");
    setFDatos("all");
    setFCliente("");
    setSoloPrincipalesSemana(false);
  };

  const activeChips: { label: string; clear: () => void }[] = [];
  if (fSemana !== "all") activeChips.push({ label: `Semana ${fSemana}`, clear: () => setFSemana("all") });
  if (fSucursales.length) activeChips.push({ label: `${fSucursales.length} sucursal${fSucursales.length > 1 ? "es" : ""}`, clear: () => setFSucursales([]) });
  if (fTecnicos.length) activeChips.push({ label: fTecnicos.length === 1 ? profById[fTecnicos[0]]?.nombre ?? "Técnico" : `${fTecnicos.length} técnicos`, clear: () => setFTecnicos([]) });
  if (fMarcas.length) activeChips.push({ label: fMarcas.length === 1 ? fMarcas[0] : `${fMarcas.length} marcas`, clear: () => setFMarcas([]) });
  if (fEstados.length) activeChips.push({ label: fEstados.length === 1 ? fEstados[0] : `${fEstados.length} estados`, clear: () => setFEstados([]) });
  if (fVencidas === "7") activeChips.push({ label: "+7d sin cierre", clear: () => setFVencidas("all") });
  if (fDatos === "sin_horas") activeChips.push({ label: "Sin horas", clear: () => setFDatos("all") });
  if (soloPrincipalesSemana && fSemana !== "all") activeChips.push({ label: "Solo principales", clear: () => setSoloPrincipalesSemana(false) });

  return (
    <div className={pageShellWide}>
      <PageHeader title="Planificador" actions={canCreate ? <>
            <Button size="sm" onClick={() => setOpenProgramar(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" /> Programar jornada
            </Button>
      </> : undefined} />

      <FiltersBar
        search={{ value: fCliente, onChange: setFCliente, placeholder: "Cliente, OS o folio…" }}
        activeCount={activeChips.length}
        onClear={limpiarFiltros}
        meta={`${displayed.length} jornada${displayed.length !== 1 ? "s" : ""}`}
        actions={(
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Exportar
          </Button>
        )}
        expanded={<>
          <FilterMultiSelect label="Marca" values={fMarcas} onChange={setFMarcas} placeholder="Todas" width="w-full" options={MARCAS.map(m => ({ value: m, label: m }))} />
          <FilterMultiSelect label="Estado" values={fEstados} onChange={setFEstados} placeholder="Todos" width="w-full" options={ESTADOS.map(e => ({ value: e, label: ESTADO_LABELS[e] }))} />
          <FilterCustom label="Lectura" width="w-full"><Button type="button" variant={soloPrincipalesSemana ? "default" : "outline"} size="sm" className="h-8 w-full" disabled={fSemana === "all"} onClick={() => setSoloPrincipalesSemana((value) => !value)}>Solo principales</Button></FilterCustom>
        </>}
      >
        <FilterMultiSelect
          label="Sucursal" values={fSucursales} onChange={setFSucursales} placeholder="Todas" width="w-[150px]"
          options={SUCURSALES.map(s => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Técnico" values={fTecnicos} onChange={setFTecnicos} placeholder="Todos" width="w-[160px]"
          options={tecnicosSolo.map(p => ({ value: p.id, label: p.nombre }))}
        />
        <FilterCustom label="Semana" width="w-[230px]">
          <div className="flex h-8 overflow-hidden rounded-md border bg-background">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-none border-r"
              onClick={() => moverSemana(-1)}
              disabled={fSemana !== "all" && Number(fSemana) <= 1}
              title="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={fSemana} onValueChange={setFSemana}>
              <SelectTrigger className="h-8 min-w-0 flex-1 rounded-none border-0 px-2 text-[12px] shadow-none focus:ring-0">
                <SelectValue placeholder="Semana" />
              </SelectTrigger>
              <SelectContent className="max-h-[280px] min-w-[--radix-select-trigger-width]">
                <SelectItem value="all">Todos</SelectItem>
                {semanasSelector.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Semana {s}{String(s) === currentWeek ? " (actual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-none border-l"
              onClick={() => moverSemana(1)}
              disabled={fSemana !== "all" && Number(fSemana) >= 53}
              title="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </FilterCustom>
      </FiltersBar>



      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table className={tableText}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-8 px-3 py-1.5 w-[92px]">Fecha</TableHead>
                <TableHead className="h-8 px-3 py-1.5">Cliente</TableHead>
                <TableHead className="h-8 px-3 py-1.5">Trabajo</TableHead>
                <TableHead className="h-8 px-3 py-1.5 w-[110px]">Marca</TableHead>
                <TableHead className="h-8 px-3 py-1.5 w-[150px]">Responsable</TableHead>
                <TableHead className="h-8 px-3 py-1.5 w-[80px]">Suc.</TableHead>
                <TableHead className="h-8 px-3 py-1.5 w-[110px]">Resultado</TableHead>
                <TableHead className="h-8 px-3 py-1.5 w-[50px] text-right">Hs</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && (
                <TableSkeletonRows columns={8} rows={7} />
              )}

              {!loading && displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6">
                    <EmptyState title="Sin jornadas" description="No hay jornadas que coincidan con los filtros actuales." />
                  </TableCell>
                </TableRow>
              )}

              {displayed.map((s) => {
                const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
                const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
                const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "—" : "—";
                const fechaLabel = format(parseISO(s.fecha_programada), "dd/MM");
                const continuidad = continuidadByRow.get(`${s.id}-${s.jornada_id ?? s.fecha_programada}`);

                return (
                  <TableRow
                    key={`${s.id}-${s.fecha_programada}`}
                    className={cn(rowClassByEstado(s.estado), "cursor-pointer", unseen && "ring-2 ring-inset ring-primary/40")}
                    onClick={() => openDetalle(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetalle(s);
                      }
                    }}
                  >
                    <TableCell className="px-3 py-1.5 align-top">
                      <div className="font-medium tabular-nums leading-tight flex items-center gap-1">
                        {fechaLabel}
                        {continuidad && continuidad.total > 1 && (
                          <Badge variant="outline" className="h-5 rounded-full border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
                            {continuidad.orden}/{continuidad.total}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{s.dia_semana.slice(0, 3)} · S{s.semana}</div>
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-top font-medium truncate max-w-[180px]" title={clienteNombre}>
                      {clienteNombre}
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-top truncate max-w-[280px]" title={s.trabajo_descripcion}>
                      <div className="flex items-center gap-1.5">
                        {refByServicio.get(s.id)?.ref && (
                          <span className="rounded bg-muted px-1 py-0 text-[10px] font-mono font-semibold text-muted-foreground tabular-nums shrink-0">
                            {refByServicio.get(s.id)?.ref}
                          </span>
                        )}
                        <span className="truncate">{s.trabajo_descripcion}</span>
                      </div>
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-middle">
                      <MarcaBadge marca={s.marca} className="self-start text-[10px]" />
                    </TableCell>


                    <TableCell className="px-3 py-1.5 align-top truncate" title={responsableNombre}>
                      {responsableNombre}
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-top text-[12px] text-muted-foreground">
                      {SUCURSAL_ABBR[s.sucursal] ?? s.sucursal}
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-top">
                      <EstadoBadge estado={s.estado} />
                    </TableCell>

                    <TableCell className="px-3 py-1.5 align-top text-right tabular-nums">
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
        {loading && <MobileCardSkeletons rows={4} />}
        {!loading && displayed.length === 0 && (
          <EmptyState title="Sin jornadas" description="No hay jornadas que coincidan con los filtros actuales." />
        )}

        {displayed.map((s) => {
          const tipo = s.tipo_trabajo ?? "Visita de campo";
          const TipoIcon = tipo === "Máquina en taller" ? Wrench : MapPin;
          const unseen = user && !s.visto_por.includes(user.id) && (s.tecnico_responsable_id === user.id || s.auxiliares.includes(user.id));
          const clienteNombre = s.cliente_id ? cliById[s.cliente_id]?.nombre ?? "Cliente no encontrado" : "—";
          const responsableNombre = s.tecnico_responsable_id ? profById[s.tecnico_responsable_id]?.nombre ?? "Sin asignar" : "Sin asignar";
          const fechaLabel = format(parseISO(s.fecha_programada), "dd/MM");
          const continuidad = continuidadByRow.get(`${s.id}-${s.jornada_id ?? s.fecha_programada}`);

          return (
            <Card
              key={`${s.id}-${s.fecha_programada}`}
              className={cn(
                "cursor-pointer overflow-hidden rounded-lg border bg-card p-3 transition-colors",
                rowClassByEstado(s.estado),
                unseen && "ring-2 ring-primary/40",
              )}
              onClick={() => openDetalle(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDetalle(s);
                }
              }}
            >
              <div className="flex flex-col justify-between gap-2">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">{fechaLabel}</span>
                        <span>·</span>
                        <span>{s.dia_semana.slice(0, 3)}</span>
                        <TipoIcon className="h-3 w-3 shrink-0" />
                        {continuidad && continuidad.total > 1 && (
                          <Badge variant="outline" className="h-5 rounded-full border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
                            {continuidad.orden}/{continuidad.total}
                          </Badge>
                        )}
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

      <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Total horas · {displayed.length} jornada{displayed.length !== 1 ? "s" : ""} filtrada{displayed.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="text-[22px] font-semibold tabular-nums">
            {totalHoras.toFixed(totalHoras % 1 === 0 ? 0 : 1)}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">hs</span>
          </div>
        </div>
      </Card>

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


