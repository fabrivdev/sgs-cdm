import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  Check,
  Download,
  Flag,
  Phone,
  X,
} from "lucide-react";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { NuevaMaquinaDialog } from "./NuevaMaquinaDialog";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format } from "date-fns";

const SUBGRUPOS = [
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS",
  "PULVERIZADORAS",
  "TRACTORES",
  "OTRO",
] as const;

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
};

type Contacto = {
  id: string;
  cliente_id: string;
  nombre: string;
  telefono: string | null;
  es_principal: boolean;
  activo: boolean;
};

type Maquina = {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  marca: Marca;
  subgrupo: string;
  activo: boolean;
  sucursal: Sucursal | null;
};

type FactAgregado = {
  fact_actual: number;
  fact_prev: number;
  tiene_rep_rango: boolean;
  tiene_srv_rango: boolean;
  ult_repuesto: string | null;
  ult_servicio: string | null;
};

type Seguimiento = {
  cliente_id: string;
  fecha: string;
  resultado: string;
};

interface Row {
  cliente: Cliente;
  contactoPrincipal: Contacto | null;
  contactosCount: number;
  contactos: Contacto[];
  cantClaas: number;
  cantHorsch: number;
  cantTotal: number;
  subgrupos: string[];
  sucursales: Sucursal[];
  antiguedadProm: number | null;
  diasUltRepuesto: number | null;
  diasUltServicio: number | null;
  tieneRepEnRango: boolean;
  tieneSrvEnRango: boolean;
  factYTD: number;
  factPrev: number;
  varPct: number | null;
  ultSeg: Seguimiento | null;
}

type SortKey =
  | "cliente"
  | "cantTotal"
  | "antiguedadProm"
  | "diasUltRepuesto"
  | "diasUltServicio"
  | "factYTD"
  | "factPrev"
  | "varPct";

type RangoPreset = "30d" | "90d" | "180d" | "365d" | "ytd" | "custom";

const dias = (d: string | null | undefined) => {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

const normText = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const esPlataformaOCabezal = (subgrupo: string | null | undefined) => {
  const s = normText(subgrupo);

  return (
    s.includes("plataforma") ||
    s.includes("cabezal") ||
    s.includes("cabecal") ||
    s.includes("header")
  );
};

// (criterios de facturación válidos ahora se filtran en SQL via parque_resumen_facturacion / parque_ultimas_facturas)

const antiguedadColor = (a: number | null) => {
  if (a == null) return "bg-muted text-muted-foreground";
  if (a <= 3) return "bg-emerald-500 text-white";
  if (a <= 6) return "bg-lime-500 text-white";
  if (a <= 9) return "bg-amber-500 text-white";
  if (a <= 12) return "bg-orange-500 text-white";
  return "bg-destructive text-destructive-foreground";
};

export interface ParqueMetricas {
  totalMaquinas: number;
  pctConServicioUltimoAnio: number;
  pctContactadosEsteMes: number;
  sinContacto60d: number;
}

export function ParqueTab({
  onChanged: _onChanged,
  onOpenCliente,
  onMetricasChange,
}: {
  onChanged?: () => void;
  onOpenCliente?: (id: string) => void;
  onMetricasChange?: (m: ParqueMetricas) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [factLoading, setFactLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [factAgregados, setFactAgregados] = useState<Map<string, FactAgregado>>(new Map());
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fMarca, setFMarca] = useState<string>("all");
  const [fSubgrupo, setFSubgrupo] = useState<string>("all");
  const [fSeguimiento, setFSeguimiento] = useState<string>("all");
  const [fRiesgo, setFRiesgo] = useState<string>("all");
  const [searchParams] = useSearchParams();

  const [rango, setRango] = useState<RangoPreset>("365d");
  const [customDesde, setCustomDesde] = useState<Date | undefined>();
  const [customHasta, setCustomHasta] = useState<Date | undefined>();

  const [sortKey, setSortKey] = useState<SortKey>("cantTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [incluirPlataformas, setIncluirPlataformas] = useState(false);
  const [nuevaMaquinaOpen, setNuevaMaquinaOpen] = useState(false);

  const filtrosActivos =
    (fSucursal !== "all" ? 1 : 0) +
    (fMarca !== "all" ? 1 : 0) +
    (fSubgrupo !== "all" ? 1 : 0) +
    (fSeguimiento !== "all" ? 1 : 0) +
    (fRiesgo !== "all" ? 1 : 0) +
    (rango !== "365d" ? 1 : 0) +
    (incluirPlataformas ? 1 : 0);

  const limpiarFiltros = () => {
    setFSucursal("all");
    setFMarca("all");
    setFSubgrupo("all");
    setFSeguimiento("all");
    setFRiesgo("all");
    setRango("365d");
    setCustomDesde(undefined);
    setCustomHasta(undefined);
    setIncluirPlataformas(false);
  };

  // Fase A: datos rápidos (clientes, contactos, máquinas, seguimientos)
  const cargar = async () => {
    setLoading(true);

    try {
      const { data: maquinasData, error: maquinasError } = await supabase
        .from("parque_maquinas")
        .select("id, cliente_id, anio, marca, subgrupo, activo, sucursal")
        .eq("activo", true);

      if (maquinasError) throw maquinasError;

      const maquinasRows = (maquinasData ?? []) as Maquina[];
      const clienteIds = Array.from(
        new Set(maquinasRows.map((m) => m.cliente_id).filter(Boolean) as string[])
      );

      if (clienteIds.length === 0) {
        setClientes([]);
        setContactos([]);
        setMaquinas(maquinasRows);
        setSeguimientos([]);
        setFactAgregados(new Map());
        setLoading(false);
        setFactLoading(false);
        return;
      }

      const [c, ct, s] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nombre, sucursal, activo")
          .in("id", clienteIds)
          .eq("activo", true),

        supabase
          .from("contactos_cliente")
          .select("id, cliente_id, nombre, telefono, es_principal, activo")
          .in("cliente_id", clienteIds)
          .eq("activo", true),

        supabase
          .from("seguimiento_comercial")
          .select("cliente_id, fecha, resultado")
          .in("cliente_id", clienteIds)
          .order("fecha", { ascending: false }),
      ]);

      if (c.error) throw c.error;
      if (ct.error) throw ct.error;
      if (s.error) throw s.error;

      setClientes((c.data ?? []) as Cliente[]);
      setContactos((ct.data ?? []) as Contacto[]);
      setMaquinas(maquinasRows);
      setSeguimientos((s.data ?? []) as Seguimiento[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const riesgo = searchParams.get("riesgo");
    if (riesgo && ["sin_contacto_60d", "sin_ultimo_anio", "facturacion_caida"].includes(riesgo)) {
      setFRiesgo(riesgo);
    }
  }, [searchParams]);

  const { desdeDate, hastaDate, prevDesdeDate, prevHastaDate } = useMemo(() => {
    const hoy = new Date();
    let desde: Date;
    let hasta: Date = hoy;

    switch (rango) {
      case "30d":
        desde = new Date(hoy.getTime() - 30 * 86400000);
        break;
      case "90d":
        desde = new Date(hoy.getTime() - 90 * 86400000);
        break;
      case "180d":
        desde = new Date(hoy.getTime() - 180 * 86400000);
        break;
      case "365d":
        desde = new Date(hoy.getTime() - 365 * 86400000);
        break;
      case "ytd":
        desde = new Date(hoy.getFullYear(), 0, 1);
        break;
      case "custom":
        desde = customDesde ?? new Date(hoy.getFullYear(), 0, 1);
        hasta = customHasta ?? hoy;
        break;
    }

    const prevDesde = new Date(desde);
    prevDesde.setFullYear(prevDesde.getFullYear() - 1);
    const prevHasta = new Date(hasta);
    prevHasta.setFullYear(prevHasta.getFullYear() - 1);

    return {
      desdeDate: desde,
      hastaDate: hasta,
      prevDesdeDate: prevDesde,
      prevHastaDate: prevHasta,
    };
  }, [rango, customDesde, customHasta]);

  // Fase B: agregados de facturación (RPC) — depende del rango
  useEffect(() => {
    let cancelado = false;
    const cargarFact = async () => {
      setFactLoading(true);
      try {
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const [resumen, ultimas] = await Promise.all([
          supabase.rpc("parque_resumen_facturacion", {
            p_desde: fmt(desdeDate),
            p_hasta: fmt(hastaDate),
            p_prev_desde: fmt(prevDesdeDate),
            p_prev_hasta: fmt(prevHastaDate),
          }),
          supabase.rpc("parque_ultimas_facturas"),
        ]);
        if (cancelado) return;
        const map = new Map<string, FactAgregado>();
        for (const r of (resumen.data ?? []) as Array<{
          cliente_id: string;
          fact_actual: number | string;
          fact_prev: number | string;
          tiene_rep_rango: boolean;
          tiene_srv_rango: boolean;
        }>) {
          map.set(r.cliente_id, {
            fact_actual: Number(r.fact_actual) || 0,
            fact_prev: Number(r.fact_prev) || 0,
            tiene_rep_rango: !!r.tiene_rep_rango,
            tiene_srv_rango: !!r.tiene_srv_rango,
            ult_repuesto: null,
            ult_servicio: null,
          });
        }
        for (const r of (ultimas.data ?? []) as Array<{
          cliente_id: string;
          ult_repuesto: string | null;
          ult_servicio: string | null;
        }>) {
          const prev = map.get(r.cliente_id) ?? {
            fact_actual: 0,
            fact_prev: 0,
            tiene_rep_rango: false,
            tiene_srv_rango: false,
            ult_repuesto: null,
            ult_servicio: null,
          };
          prev.ult_repuesto = r.ult_repuesto;
          prev.ult_servicio = r.ult_servicio;
          map.set(r.cliente_id, prev);
        }
        setFactAgregados(map);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelado) setFactLoading(false);
      }
    };
    cargarFact();
    return () => {
      cancelado = true;
    };
  }, [desdeDate, hastaDate, prevDesdeDate, prevHastaDate]);

  const rows: Row[] = useMemo(() => {
    const hoy = new Date();

    const contactosByCliente = new Map<string, Contacto[]>();
    for (const ct of contactos) {
      const arr = contactosByCliente.get(ct.cliente_id) ?? [];
      arr.push(ct);
      contactosByCliente.set(ct.cliente_id, arr);
    }

    const maquinasByCliente = new Map<string, Maquina[]>();
    for (const mq of maquinas) {
      if (!mq.cliente_id) continue;
      if (!incluirPlataformas && esPlataformaOCabezal(mq.subgrupo)) continue;
      if (fMarca !== "all" && mq.marca !== fMarca) continue;
      if (fSubgrupo !== "all" && mq.subgrupo !== fSubgrupo) continue;
      const arr = maquinasByCliente.get(mq.cliente_id) ?? [];
      arr.push(mq);
      maquinasByCliente.set(mq.cliente_id, arr);
    }

    const ultSegByCliente = new Map<string, Seguimiento>();
    for (const sg of seguimientos) {
      const cur = ultSegByCliente.get(sg.cliente_id);
      if (!cur || new Date(cur.fecha) < new Date(sg.fecha)) ultSegByCliente.set(sg.cliente_id, sg);
    }

    return clientes.map((cli) => {
      const cts = contactosByCliente.get(cli.id) ?? [];
      const principal = cts.find((x) => x.es_principal) ?? cts[0] ?? null;
      const mqs = maquinasByCliente.get(cli.id) ?? [];
      const cantClaas = mqs.filter((m) => m.marca === "CLAAS").length;
      const cantHorsch = mqs.filter((m) => m.marca === "HORSCH").length;
      const subgs = Array.from(new Set(mqs.map((m) => m.subgrupo))).sort();
      const sucursales = Array.from(
        new Set(mqs.map((m) => m.sucursal).filter((s): s is Sucursal => !!s)),
      ).sort();
      const anios = mqs.map((m) => m.anio).filter((a): a is number => !!a);
      const antiguedadProm =
        anios.length > 0
          ? Math.round((anios.reduce((s, a) => s + (hoy.getFullYear() - a), 0) / anios.length) * 10) / 10
          : null;

      const agg = factAgregados.get(cli.id);
      const ytd = agg?.fact_actual ?? 0;
      const prev = agg?.fact_prev ?? 0;
      const varPct = prev > 0 ? Math.round(((ytd - prev) / prev) * 100) : ytd > 0 ? 100 : null;

      return {
        cliente: cli,
        contactoPrincipal: principal,
        contactosCount: cts.length,
        contactos: cts,
        cantClaas,
        cantHorsch,
        cantTotal: mqs.length,
        subgrupos: subgs,
        sucursales,
        antiguedadProm,
        diasUltRepuesto: dias(agg?.ult_repuesto ?? null),
        diasUltServicio: dias(agg?.ult_servicio ?? null),
        tieneRepEnRango: agg?.tiene_rep_rango ?? false,
        tieneSrvEnRango: agg?.tiene_srv_rango ?? false,
        factYTD: ytd,
        factPrev: prev,
        varPct,
        ultSeg: ultSegByCliente.get(cli.id) ?? null,
      };
    });
  }, [clientes, contactos, maquinas, factAgregados, seguimientos, incluirPlataformas, fMarca, fSubgrupo]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.cantTotal === 0) return false;
      if (ql && !r.cliente.nombre.toLowerCase().includes(ql)) return false;
      if (fSucursal !== "all" && !r.sucursales.includes(fSucursal as Sucursal)) return false;

      if (fMarca !== "all") {
        if (fMarca === "CLAAS" && r.cantClaas === 0) return false;
        if (fMarca === "HORSCH" && r.cantHorsch === 0) return false;
      }

      if (fSubgrupo !== "all" && !r.subgrupos.includes(fSubgrupo)) return false;

      if (fSeguimiento !== "all") {
        if (fSeguimiento === "sin_seguimiento" && r.ultSeg) return false;
        if (fSeguimiento !== "sin_seguimiento" && r.ultSeg?.resultado !== fSeguimiento) return false;
      }

      if (fRiesgo === "sin_contacto_60d") {
        const sinServicio60 = r.diasUltServicio == null || r.diasUltServicio > 60;
        const sinSeguimiento60 =
          !r.ultSeg ||
          (Date.now() - new Date(r.ultSeg.fecha).getTime()) / 86400000 > 60;
        if (!sinServicio60 || !sinSeguimiento60) return false;
      }
      if (fRiesgo === "sin_ultimo_anio" && !(r.diasUltServicio == null || r.diasUltServicio > 365)) return false;
      if (fRiesgo === "facturacion_caida" && !(r.varPct != null && r.varPct <= -30)) return false;

      return true;
    });
  }, [rows, q, fSucursal, fMarca, fSubgrupo, fSeguimiento, fRiesgo]);

  // Métricas calculadas a partir de los clientes filtrados (para las cards superiores)
  useEffect(() => {
    if (!onMetricasChange) return;
    const desdeMs = desdeDate.getTime();
    const totalClientes = filtradas.length;
    let totalMaquinas = 0;
    let conServicio = 0;
    let contactadosRango = 0;
    let sinContacto = 0;
    for (const r of filtradas) {
      totalMaquinas += r.cantTotal;
      if (r.diasUltServicio != null && r.diasUltServicio <= 365) conServicio++;
      if (r.ultSeg && new Date(r.ultSeg.fecha).getTime() >= desdeMs) contactadosRango++;
      const sinServ60 = r.diasUltServicio == null || r.diasUltServicio > 60;
      const sinSeg60 =
        !r.ultSeg ||
        (Date.now() - new Date(r.ultSeg.fecha).getTime()) / 86400000 > 60;
      if (sinServ60 && sinSeg60) sinContacto++;
    }
    onMetricasChange({
      totalMaquinas,
      pctConServicioUltimoAnio:
        totalClientes > 0 ? Math.round((conServicio / totalClientes) * 100) : 0,
      pctContactadosEsteMes:
        totalClientes > 0 ? Math.round((contactadosRango / totalClientes) * 100) : 0,
      sinContacto60d: sinContacto,
    });
  }, [filtradas, onMetricasChange, desdeDate]);

  const ordenadas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const safe = (n: number | null | undefined) => (n == null ? Number.POSITIVE_INFINITY : n);

    return [...filtradas].sort((a, b) => {
      switch (sortKey) {
        case "cliente":
          return a.cliente.nombre.localeCompare(b.cliente.nombre) * dir;
        case "cantTotal":
          return (a.cantTotal - b.cantTotal) * dir;
        case "antiguedadProm":
          return (safe(a.antiguedadProm) - safe(b.antiguedadProm)) * dir;
        case "diasUltRepuesto":
          return (safe(a.diasUltRepuesto) - safe(b.diasUltRepuesto)) * dir;
        case "diasUltServicio":
          return (safe(a.diasUltServicio) - safe(b.diasUltServicio)) * dir;
        case "factYTD":
          return (a.factYTD - b.factYTD) * dir;
        case "factPrev":
          return (a.factPrev - b.factPrev) * dir;
        case "varPct":
          return (safe(a.varPct) - safe(b.varPct)) * dir;
      }
    });
  }, [filtradas, sortKey, sortDir]);

  const servicioInfo = useMemo(() => {
    let maxServ: Date | null = null;
    let hayEnRango = false;
    for (const agg of factAgregados.values()) {
      if (agg.tiene_srv_rango) hayEnRango = true;
      if (agg.ult_servicio) {
        const d = new Date(agg.ult_servicio);
        if (!maxServ || d > maxServ) maxServ = d;
      }
    }
    return { ultimaServicio: maxServ, hayEnRango };
  }, [factAgregados]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportar = () => {
    const data = ordenadas.map((r) => ({
      Cliente: r.cliente.nombre,
      Sucursal: r.sucursales.join(", "),
      Teléfono: r.contactoPrincipal?.telefono ?? "",
      Maquinarias: r.cantTotal,
      "Antig. prom (años)": r.antiguedadProm ?? "",
      "% CLAAS": r.cantTotal ? Math.round((r.cantClaas / r.cantTotal) * 100) : 0,
      "% HORSCH": r.cantTotal ? Math.round((r.cantHorsch / r.cantTotal) * 100) : 0,
      "Días últ. repuesto": r.diasUltRepuesto ?? "",
      "Días últ. servicio": r.diasUltServicio ?? "",
      Repuesto: r.tieneRepEnRango ? "Sí" : "No",
      Servicio: r.tieneSrvEnRango ? "Sí" : "No",
      "Fact. YTD": r.factYTD,
      "Fact. LY": r.factPrev,
      "%VAR": r.varPct ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parque");
    XLSX.writeFile(wb, `parque-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filaColor = (diasServ: number | null) => {
    if (diasServ == null) return "bg-destructive/10 hover:bg-destructive/15";
    if (diasServ > 365) return "bg-destructive/10 hover:bg-destructive/15";
    if (diasServ > 180) return "bg-amber-500/10 hover:bg-amber-500/15";
    return "hover:bg-accent/40";
  };

  return (
    <div className="space-y-3">
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Nombre del cliente…", label: "Buscar" }}
        activeCount={filtrosActivos + (q ? 1 : 0)}
        onClear={() => { setQ(""); limpiarFiltros(); }}
        
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" onClick={() => setNuevaMaquinaOpen(true)} className="h-9">
              <Plus className="mr-1 h-4 w-4" /> Nueva máquina
            </Button>
            <Button variant="outline" size="sm" onClick={exportar} className="hidden h-9 sm:inline-flex">
              <Download className="mr-1 h-4 w-4" /> Exportar
            </Button>
          </div>
        }
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[150px]"
          options={[{ value: "all", label: "Todas las sucursales" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Marca" value={fMarca} onChange={setFMarca} placeholder="Marca" width="w-[120px]"
          options={[{ value: "all", label: "Todas las marcas" }, ...MARCAS.map(m => ({ value: m, label: m }))]}
        />
        <FilterSelect
          label="Subgrupo" value={fSubgrupo} onChange={setFSubgrupo} placeholder="Subgrupo" width="w-[150px]"
          options={[{ value: "all", label: "Todos los subgrupos" }, ...SUBGRUPOS.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Seguimiento" value={fSeguimiento} onChange={setFSeguimiento} placeholder="Seguimiento" width="w-[170px]"
          options={[
            { value: "all", label: "Cualquier seguimiento" },
            { value: "sin_seguimiento", label: "Sin seguimiento" },
            ...RESULTADOS.map(r => ({ value: r, label: r })),
          ]}
        />
        <FilterSelect
          label="Alerta" value={fRiesgo} onChange={setFRiesgo} placeholder="Alerta" width="w-[180px]"
          options={[
            { value: "all", label: "Todas las alertas" },
            { value: "sin_contacto_60d", label: "Sin contacto +60d" },
            { value: "sin_ultimo_anio", label: "Sin servicio último año" },
            { value: "facturacion_caida", label: "Facturación en caída" },
          ]}
        />
        <FilterSelect
          label="Período" value={rango} onChange={(v) => setRango(v as RangoPreset)} placeholder="Período" width="w-[160px]"
          options={[
            { value: "30d", label: "Últimos 30 días" },
            { value: "90d", label: "Últimos 90 días" },
            { value: "180d", label: "Últimos 6 meses" },
            { value: "365d", label: "Últimos 12 meses" },
            { value: "ytd", label: "Año en curso (YTD)" },
            { value: "custom", label: "Personalizado…" },
          ]}
        />
        {rango === "custom" && (
          <>
            <FilterCustom label="Desde" width="w-[120px]">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-full justify-start text-xs">
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {customDesde ? format(customDesde, "dd/MM/yy") : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customDesde} onSelect={setCustomDesde} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </FilterCustom>
            <FilterCustom label="Hasta" width="w-[120px]">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-full justify-start text-xs">
                    <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                    {customHasta ? format(customHasta, "dd/MM/yy") : "Hasta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customHasta} onSelect={setCustomHasta} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </FilterCustom>
          </>
        )}
        <FilterCustom label="Plataformas / cabezales">
          <div className="flex items-center gap-2 rounded-md border px-3 h-9">
            <Switch id="incluir-plataformas" checked={incluirPlataformas} onCheckedChange={setIncluirPlataformas} />
            <Label htmlFor="incluir-plataformas" className="text-xs cursor-pointer whitespace-nowrap">
              Incluir
            </Label>
          </div>
        </FilterCustom>
      </FiltersBar>


      {!loading && !factLoading && factAgregados.size > 0 && !servicioInfo.hayEnRango && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          ⚠️ No hay facturas de <strong>Servicio</strong> (Mano de Obra / Kilometraje) en el período seleccionado.
          {servicioInfo.ultimaServicio
            ? ` Última factura de servicio en la base: ${format(servicioInfo.ultimaServicio, "dd/MM/yyyy")}.`
            : " La base no tiene servicios cargados."}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {ordenadas.length} cliente{ordenadas.length === 1 ? "" : "s"} · Período:{" "}
        {format(desdeDate, "dd/MM/yy")} – {format(hastaDate, "dd/MM/yy")}
        {factLoading && !loading && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            · cargando facturación…
          </span>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer whitespace-nowrap min-w-[200px]" onClick={() => toggleSort("cliente")}>
                <div className="flex items-center gap-1">Cliente {sortIcon("cliente")}</div>
              </TableHead>
              <TableHead className="whitespace-nowrap min-w-[170px]">Teléfono</TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-center" onClick={() => toggleSort("cantTotal")}>
                <div className="flex items-center justify-center gap-1">Maq. {sortIcon("cantTotal")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-center" onClick={() => toggleSort("antiguedadProm")}>
                <div className="flex items-center justify-center gap-1">Antig. {sortIcon("antiguedadProm")}</div>
              </TableHead>
              <TableHead className="whitespace-nowrap min-w-[140px]">% Marcas</TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("diasUltRepuesto")}>
                <div className="flex items-center justify-end gap-1">Últ. Rep. {sortIcon("diasUltRepuesto")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("diasUltServicio")}>
                <div className="flex items-center justify-end gap-1">Últ. Serv. {sortIcon("diasUltServicio")}</div>
              </TableHead>
              <TableHead className="whitespace-nowrap text-center">Rep.</TableHead>
              <TableHead className="whitespace-nowrap text-center">Serv.</TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("factYTD")}>
                <div className="flex items-center justify-end gap-1">Fact. Período {sortIcon("factYTD")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("factPrev")}>
                <div className="flex items-center justify-end gap-1">Fact. LY {sortIcon("factPrev")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("varPct")}>
                <div className="flex items-center justify-end gap-1">%VAR {sortIcon("varPct")}</div>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={12} className="h-20 text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}

            {!loading && ordenadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="h-20 text-center text-muted-foreground">
                  Sin clientes que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              ordenadas.map((r) => {
                const pctClaas = r.cantTotal ? (r.cantClaas / r.cantTotal) * 100 : 0;
                const pctHorsch = r.cantTotal ? (r.cantHorsch / r.cantTotal) * 100 : 0;

                return (
                  <TableRow
                    key={r.cliente.id}
                    className={cn(filaColor(r.diasUltServicio), onOpenCliente && "cursor-pointer")}
                    onClick={() => onOpenCliente?.(r.cliente.id)}
                  >
                    <TableCell>
                      <div className="font-medium">{r.cliente.nombre}</div>
                      {r.sucursales.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">{r.sucursales.join(", ")}</div>
                      )}
                    </TableCell>

                    <TableCell className="min-w-[170px]">
                      {r.contactoPrincipal?.telefono ? (
                        <a
  href={`tel:${r.contactoPrincipal.telefono}`}
  onClick={(e) => e.stopPropagation()}
  className="flex items-center gap-1 text-sm hover:text-primary whitespace-nowrap"
>
  <Phone className="h-3 w-3 shrink-0" />
  <span className="whitespace-nowrap">{r.contactoPrincipal.telefono}</span>
</a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center tabular-nums font-medium">{r.cantTotal}</TableCell>

                    <TableCell className="text-center">
                      {r.antiguedadProm != null ? (
                        <Badge className={cn("min-w-[36px] justify-center tabular-nums", antiguedadColor(r.antiguedadProm))}>
                          {r.antiguedadProm}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {r.cantTotal > 0 ? (
                        <div className="flex items-center gap-1">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                            {pctClaas > 0 && (
  <div
    style={{ width: `${pctClaas}%`, backgroundColor: "#9DBB00" }}
    title={`CLAAS ${r.cantClaas}`}
  />
)}
{pctHorsch > 0 && (
  <div
    style={{ width: `${pctHorsch}%`, backgroundColor: "#C8102E" }}
    title={`HORSCH ${r.cantHorsch}`}
  />
)}
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                            {r.cantClaas}/{r.cantHorsch}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {r.diasUltRepuesto != null ? (
                        <span className="inline-flex items-center gap-1">
                          {r.diasUltRepuesto > 365 && <Flag className="h-3 w-3 text-destructive" />}
                          {r.diasUltRepuesto}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {r.diasUltServicio != null ? (
                        <span className="inline-flex items-center gap-1">
                          {r.diasUltServicio > 365 && <Flag className="h-3 w-3 text-destructive" />}
                          {r.diasUltServicio}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {r.tieneRepEnRango ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-destructive" />
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {r.tieneSrvEnRango ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-destructive" />
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {r.factYTD > 0 ? `$${fmtMoney(r.factYTD)}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.factPrev > 0 ? `$${fmtMoney(r.factPrev)}` : "—"}
                    </TableCell>

                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        r.varPct != null && r.varPct >= 0 && "text-emerald-600",
                        r.varPct != null && r.varPct < 0 && "text-destructive",
                      )}
                    >
                      {r.varPct != null ? `${r.varPct > 0 ? "+" : ""}${r.varPct}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      <NuevaMaquinaDialog
        open={nuevaMaquinaOpen}
        onOpenChange={setNuevaMaquinaOpen}
        onCreated={() => {
          cargar();
          _onChanged?.();
        }}
      />
    </div>
  );
}
