import { sortSalesRows, type SalesColumn } from "@/components/ventas/salesTableInteraction";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CalendarIcon,
  Flag,
  Phone,
  RefreshCw,
} from "lucide-react";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { cn, formatGuaranies } from "@/lib/utils";
import { format } from "date-fns";
import {
  type ClienteContactoInput,
  type KpiResult,
  calcularKpis,
  buildClientesConTrabajoAbierto,
} from "@/lib/contacto-utils";
import { MACHINE_SUBGROUPS, machineSubgroupLabel } from "@/lib/machineModels";
import { useAuth } from "@/hooks/useAuth";
import { cargarTodo } from "@/hooks/useCatalogos";

const MARCA_AMBAS = "ambas";
const MARCA_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: MARCA_AMBAS, label: "C/Ambas" },
  ...MARCAS.map((m) => ({ value: m, label: m })),
];

const RUBRO_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "Repuestos", label: "Repuestos" },
  { value: "Servicio", label: "Servicios" },
  { value: "Kilometraje", label: "Kilometraje" },
];

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
  subgrupo_personalizado: string | null;
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

type TrabajoParque = {
  cliente_id: string | null;
  estado_general: string;
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
  | "sucursal"
  | "cantTotal"
  | "antiguedadProm"
  | "diasUltRepuesto"
  | "diasUltServicio"
  | "factYTD"
  | "factPrev"
  | "varPct" | "telefono" | "marcas" | "repuesto" | "servicio";

type RangoPreset = "30d" | "90d" | "180d" | "365d" | "ytd" | "custom";

const dias = (d: string | null | undefined) => {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};

const fmtMoney = (n: number) => formatGuaranies(n);

type ParqueRpcResult<T> = {
  data: T | null;
  error: { code?: string; details?: string; hint?: string; message?: string } | null;
};
type ParqueRpcRequest<T> = PromiseLike<ParqueRpcResult<T>> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<ParqueRpcResult<T>>;
};

async function cargarRpcConReintento<T>(
  requests: Array<() => ParqueRpcRequest<T>>,
  signal: AbortSignal,
) {
  let ultimoError: { code?: string; details?: string; hint?: string; message?: string } | null = null;

  for (let intento = 0; intento < requests.length; intento += 1) {
    if (signal.aborted) throw new Error("Consulta cancelada");
    const request = requests[intento]();
    const resultado = await (request.abortSignal ? request.abortSignal(signal) : request);
    if (!resultado.error) return resultado.data;
    ultimoError = resultado.error;
    // Repeating a cancelled statement immediately only adds database load.
    if (resultado.error.code === "57014") break;
    if (intento < requests.length - 1) await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const detalle = [ultimoError?.code, ultimoError?.message, ultimoError?.details, ultimoError?.hint]
    .filter(Boolean)
    .filter((valor, indice, valores) => valores.indexOf(valor) === indice)
    .join(" · ");
  throw new Error(detalle || "No se pudo cargar la facturación");
}

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

export type { KpiResult as ParqueMetricas };
export type ParqueFacturacionEstado = "loading" | "error" | "ready";

export function ParqueTab({
  onChanged: _onChanged,
  onOpenCliente,
  onMetricasChange,
  onFacturacionEstadoChange,
}: {
  onChanged?: () => void;
  onOpenCliente?: (id: string) => void;
  onMetricasChange?: (m: KpiResult) => void;
  onFacturacionEstadoChange?: (estado: ParqueFacturacionEstado) => void;
}) {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [factLoading, setFactLoading] = useState(true);
  const [factError, setFactError] = useState<string | null>(null);
  const [factReloadKey, setFactReloadKey] = useState(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [factAgregados, setFactAgregados] = useState<Map<string, FactAgregado>>(new Map());
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoParque[]>([]);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fMarca, setFMarca] = useState<string>("all");
  const [fRubro, setFRubro] = useState<string>("all");
  const [fSubgrupo, setFSubgrupo] = useState<string>("all");
  const [rango, setRango] = useState<RangoPreset>("365d");
  const [customDesde, setCustomDesde] = useState<Date | undefined>();
  const [customHasta, setCustomHasta] = useState<Date | undefined>();

  const [sortKey, setSortKey] = useState<SortKey>("cantTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [incluirPlataformas, setIncluirPlataformas] = useState(false);

  const filtrosActivos =
    (fSucursal !== "all" ? 1 : 0) +
    (fMarca !== "all" ? 1 : 0) +
    (fRubro !== "all" ? 1 : 0) +
    (fSubgrupo !== "all" ? 1 : 0) +
    (rango !== "365d" ? 1 : 0) +
    (incluirPlataformas ? 1 : 0);

  const limpiarFiltros = () => {
    setFSucursal("all");
    setFMarca("all");
    setFRubro("all");
    setFSubgrupo("all");
    setRango("365d");
    setCustomDesde(undefined);
    setCustomHasta(undefined);
    setIncluirPlataformas(false);
  };

  // Fase A: datos rápidos (clientes, contactos, máquinas, seguimientos)
  const cargar = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const maquinasData = await cargarTodo<Maquina>(supabase
        .from("parque_maquinas")
        .select("id, cliente_id, anio, marca, subgrupo, subgrupo_personalizado, activo, sucursal")
        .eq("activo", true).order("id"));

      const maquinasRows = (maquinasData ?? []) as Maquina[];
      const clienteIds = Array.from(
        new Set(maquinasRows.map((m) => m.cliente_id).filter(Boolean) as string[])
      );

      if (clienteIds.length === 0) {
        setClientes([]);
        setContactos([]);
        setMaquinas(maquinasRows);
        setSeguimientos([]);
        setTrabajos([]);
        setFactAgregados(new Map());
        setLoading(false);
        setFactLoading(false);
        return;
      }

      const [c, ct, s, t] = await Promise.all([
        cargarTodo<Cliente>(supabase
          .from("clientes")
          .select("id, nombre, sucursal, activo")
          .in("id", clienteIds).order("id")),

        cargarTodo<Contacto>(supabase
          .from("contactos_cliente")
          .select("id, cliente_id, nombre, telefono, es_principal, activo")
          .in("cliente_id", clienteIds)
          .eq("activo", true).order("id")),

        cargarTodo<Seguimiento>(supabase
          .from("seguimiento_comercial")
          .select("cliente_id, fecha, resultado")
          .in("cliente_id", clienteIds)
          .order("fecha", { ascending: false }).order("id")),

        cargarTodo<TrabajoParque>(supabase
          .from("trabajos")
          .select("cliente_id, estado_general")
          .in("cliente_id", clienteIds).order("id")),
      ]);

      setClientes(c);
      setContactos(ct);
      setMaquinas(maquinasRows);
      setSeguimientos(s);
      setTrabajos(t);
    } catch (e) {
      setLoadError(true);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

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
    const abortController = new AbortController();
    const cargarFact = async () => {
      setFactLoading(true);
      setFactError(null);
      setFactAgregados(new Map());
      try {
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const marcaFacturacion =
          fMarca === MARCA_AMBAS ? "AMBAS" : fMarca === "all" ? "ALL" : fMarca;
        const rubroFacturacion = fRubro === "all" ? "ALL" : fRubro;
        const fechas = {
          p_desde: fmt(desdeDate),
          p_hasta: fmt(hastaDate),
          p_prev_desde: fmt(prevDesdeDate),
          p_prev_hasta: fmt(prevHastaDate),
        };
        const resumenRequests = fRubro !== "all"
          ? [
              () => supabase.rpc("parque_resumen_facturacion_filtros", {
                ...fechas,
                p_marca: marcaFacturacion,
                p_rubro: rubroFacturacion,
              }),
              () => supabase.rpc("parque_resumen_facturacion_filtros", {
                ...fechas,
                p_marca: marcaFacturacion,
                p_rubro: rubroFacturacion,
              }),
            ]
          : fMarca !== "all"
            ? [
                () => supabase.rpc("parque_resumen_facturacion_marca", {
                  ...fechas,
                  p_marca: marcaFacturacion,
                }),
                () => supabase.rpc("parque_resumen_facturacion_marca", {
                  ...fechas,
                  p_marca: marcaFacturacion,
                }),
              ]
            : [
                () => supabase.rpc("parque_resumen_facturacion", fechas),
                () => supabase.rpc("parque_resumen_facturacion", fechas),
              ];
        const resumen = await cargarRpcConReintento(resumenRequests, abortController.signal);
        if (cancelado) return;

        const map = new Map<string, FactAgregado>();
        for (const r of (resumen ?? []) as Array<{
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
        setFactAgregados(new Map(map));

        try {
          const ultimasRequests = fMarca === "all"
            ? [
                () => supabase.rpc("parque_ultimas_facturas"),
                () => supabase.rpc("parque_ultimas_facturas"),
              ]
            : [
                () => supabase.rpc("parque_ultimas_facturas_marca", { p_marca: marcaFacturacion }),
                () => supabase.rpc("parque_ultimas_facturas_marca", { p_marca: marcaFacturacion }),
              ];
          const ultimas = await cargarRpcConReintento(ultimasRequests, abortController.signal);
          if (cancelado) return;

          for (const r of (ultimas ?? []) as Array<{
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
          setFactAgregados(new Map(map));
        } catch (error) {
          if (cancelado) return;
          console.error("No se pudieron cargar las últimas facturas", error);
          if (!cancelado) setFactError("La facturación cargó, pero faltan las fechas de última actividad.");
        }
      } catch (e) {
        if (cancelado) return;
        console.error("No se pudo cargar la facturación del parque", e);
        if (!cancelado) {
          const detalle = e instanceof Error ? e.message.trim() : "";
          setFactError(
            detalle
              ? `No se pudo cargar la facturación: ${detalle}`
              : "No se pudo cargar la facturación. Reintentá sin perder los datos ya visibles.",
          );
        }
      } finally {
        if (!cancelado) setFactLoading(false);
      }
    };
    cargarFact();
    return () => {
      cancelado = true;
      abortController.abort();
    };
  }, [desdeDate, hastaDate, prevDesdeDate, prevHastaDate, fMarca, fRubro, factReloadKey]);

  useEffect(() => {
    onFacturacionEstadoChange?.(factLoading ? "loading" : factError ? "error" : "ready");
  }, [factLoading, factError, onFacturacionEstadoChange]);

  const subgrupoOptions = useMemo(() => {
    const values = new Set<string>(MACHINE_SUBGROUPS.filter((subgrupo) => subgrupo !== "OTRO"));
    for (const maquina of maquinas) {
      values.add(machineSubgroupLabel(maquina.subgrupo, maquina.subgrupo_personalizado));
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((value) => ({ value, label: value === "OTRO" ? "OTRO (SIN ESPECIFICAR)" : value }));
  }, [maquinas]);

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
      const subgrupo = machineSubgroupLabel(mq.subgrupo, mq.subgrupo_personalizado);
      if (!incluirPlataformas && esPlataformaOCabezal(subgrupo)) continue;
      if (fSubgrupo !== "all" && subgrupo !== fSubgrupo) continue;
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
      const subgs = Array.from(new Set(mqs.map((m) => machineSubgroupLabel(m.subgrupo, m.subgrupo_personalizado)))).sort();
      const sucursales = Array.from(
        new Set(mqs.map((m) => m.sucursal).filter((s): s is Sucursal => !!s)),
      ).sort();
      const años = mqs.map((m) => m.anio).filter((a): a is number => !!a);
      const antiguedadProm =
        años.length > 0
          ? Math.round((años.reduce((s, a) => s + (hoy.getFullYear() - a), 0) / años.length) * 10) / 10
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
  }, [clientes, contactos, maquinas, factAgregados, seguimientos, incluirPlataformas, fSubgrupo]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.cantTotal === 0) return false;
      if (ql && !r.cliente.nombre.toLowerCase().includes(ql)) return false;
      if (fSucursal !== "all" && !r.sucursales.includes(fSucursal as Sucursal)) return false;

      if (fMarca !== "all") {
        if (fMarca === MARCA_AMBAS && (r.cantClaas === 0 || r.cantHorsch === 0)) return false;
        if (fMarca === "CLAAS" && r.cantClaas === 0) return false;
        if (fMarca === "HORSCH" && r.cantHorsch === 0) return false;
      }

      if (fSubgrupo !== "all" && !r.subgrupos.includes(fSubgrupo)) return false;

      return true;
    });
  }, [rows, q, fSucursal, fMarca, fSubgrupo]);

  const clientesConTrabajoAbierto = useMemo(
    () => buildClientesConTrabajoAbierto(trabajos),
    [trabajos],
  );

  // Metricas calculadas a partir de los clientes filtrados con criterio compartido.
  useEffect(() => {
    if (!onMetricasChange) return;
    const inputs: (ClienteContactoInput & { cantMaquinas: number })[] = filtradas.map((r) => {
      const fact = factAgregados.get(r.cliente.id);
      return {
        clienteId: r.cliente.id,
        ultSeguimientoFecha: r.ultSeg?.fecha ?? null,
        ultServicioFecha: fact?.ult_servicio ?? null,
        ultRepuestoFecha: fact?.ult_repuesto ?? null,
        tieneTrabajoAbierto: clientesConTrabajoAbierto.has(r.cliente.id),
        tieneRepEnRango: r.tieneRepEnRango,
        tieneSrvEnRango: r.tieneSrvEnRango,
        cantMaquinas: r.cantTotal,
      };
    });
    onMetricasChange(calcularKpis(inputs, desdeDate));
  }, [filtradas, onMetricasChange, desdeDate, clientesConTrabajoAbierto, factAgregados]);

  const sortColumns: SalesColumn<typeof filtradas[number]>[] = [
    { key: "cliente", label: "Cliente", kind: "text", value: r => r.cliente.nombre },
    { key: "sucursal", label: "Sucursal", kind: "text", value: r => r.sucursales.join(", ") },
    { key: "telefono", label: "Teléfono", kind: "text", value: r => r.contactoPrincipal?.telefono },
    ...(["cantTotal", "antiguedadProm", "diasUltRepuesto", "diasUltServicio", "factYTD", "factPrev", "varPct"] as const).map(key => ({ key, label: key, kind: "number" as const, value: (r: typeof filtradas[number]) => r[key] })),
    { key: "marcas", label: "% Marcas", kind: "number", value: r => r.cantTotal ? r.cantClaas / r.cantTotal : null },
    { key: "repuesto", label: "Rep.", kind: "number", value: r => Number(r.tieneRepEnRango) },
    { key: "servicio", label: "Serv.", kind: "number", value: r => Number(r.tieneSrvEnRango) },
  ];
  const ordenadas = sortSalesRows(filtradas, sortColumns, { key: sortKey, direction: sortDir });

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


  const exportar = async () => {
    const XLSX = await import("xlsx");
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

  return (
    <div className="space-y-3">
      <FiltersBar
        secondaryActions={can("datos:exportar") ? <SectionActionsMenu options={[{ id: "excel", label: "Exportar clientes", disabled: loading || loadError || factLoading || !!factError || !ordenadas.length, onSelect: exportar }]} /> : undefined}
        search={{ value: q, onChange: setQ, placeholder: "Nombre del cliente…", label: "Buscar" }}
        activeCount={filtrosActivos + (q ? 1 : 0)}
        onClear={() => { setQ(""); limpiarFiltros(); }}
        expanded={(
          <>
            <FilterSelect
              label="Rubro" value={fRubro} onChange={setFRubro} placeholder="Rubro" width="w-full"
              options={RUBRO_OPTIONS}
            />
            <FilterSelect
              label="Subgrupo" value={fSubgrupo} onChange={setFSubgrupo} placeholder="Subgrupo" width="w-full"
              options={[{ value: "all", label: "Todos" }, ...subgrupoOptions]}
            />
            {rango === "custom" && (
              <>
                <FilterCustom label="Desde" width="w-full">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-full justify-start text-[12px]">
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                        {customDesde ? format(customDesde, "dd/MM") : "Desde"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customDesde} onSelect={setCustomDesde} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </FilterCustom>
                <FilterCustom label="Hasta" width="w-full">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-full justify-start text-[12px]">
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                        {customHasta ? format(customHasta, "dd/MM") : "Hasta"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customHasta} onSelect={setCustomHasta} className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </FilterCustom>
              </>
            )}
            <FilterCustom label="Plataformas / cabezales" width="w-full">
              <div className="flex h-9 items-center gap-2 rounded-md border px-3">
                <Switch id="incluir-plataformas" checked={incluirPlataformas} onCheckedChange={setIncluirPlataformas} />
                <Label htmlFor="incluir-plataformas" className="cursor-pointer whitespace-nowrap text-[12px]">Incluir</Label>
              </div>
            </FilterCustom>
          </>
        )}
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[150px]"
          options={[{ value: "all", label: "Todos" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Marca" value={fMarca} onChange={setFMarca} placeholder="Marca" width="w-[135px]"
          options={MARCA_OPTIONS}
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
      </FiltersBar>

      <div className="flex flex-col gap-2 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          {ordenadas.length} cliente{ordenadas.length === 1 ? "" : "s"} · Período:{" "}
          {format(desdeDate, "dd/MM")} – {format(hastaDate, "dd/MM")}
          {factLoading && !loading && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
              · cargando facturación...
            </span>
          )}
        </div>
      </div>

      {factError && !factLoading && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{factError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setFactReloadKey((value) => value + 1)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reintentar
          </Button>
        </div>
      )}


      {!loading && !factLoading && factAgregados.size > 0 && !servicioInfo.hayEnRango && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
          ⚠️ No hay facturas de <strong>Servicio</strong> (Mano de Obra / Kilometraje) en el período seleccionado.
          {servicioInfo.ultimaServicio
            ? ` Última factura de servicio en la base: ${format(servicioInfo.ultimaServicio, "dd/MM/yyyy")}.`
            : " La base no tiene servicios cargados."}
        </div>
      )}

      <div className="hidden text-[12px] text-muted-foreground">
        {ordenadas.length} cliente{ordenadas.length === 1 ? "" : "s"} · Período:{" "}
        {format(desdeDate, "dd/MM")} – {format(hastaDate, "dd/MM")}
        {factLoading && !loading && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            · cargando facturación…
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <CompactListTable rows={ordenadas} id={r=>r.cliente.id} label="Clientes del parque" sort={{key:sortKey,direction:sortDir}} onSort={key=>toggleSort(key as SortKey)}
          status={loading?"Cargando…":loadError?<span className="text-destructive">No se pudieron cargar los clientes.</span>:!ordenadas.length?"Sin clientes que coincidan con los filtros.":undefined}
          onSelect={onOpenCliente?r=>onOpenCliente(r.cliente.id):undefined}
          columns={["cliente","telefono","cantTotal","antiguedadProm","marcas","diasUltRepuesto","diasUltServicio","factYTD","factPrev","varPct"].map(key=>{
            const column=sortColumns.find(c=>c.key===key)!;
            const layout:Record<string,Pick<CompactListColumn<Row>,"width"|"hiddenBelow"|"label"|"align">>={
              cliente:{width:"w-[42%] md:w-[25%] xl:w-[19%]",label:"Cliente"},
              telefono:{width:"md:w-[22%] xl:w-[13%]",label:"Teléfono",hiddenBelow:"md"},
              cantTotal:{width:"w-[20%] md:w-[10%] xl:w-[6%]",label:"Maq.",align:"center"},
              antiguedadProm:{width:"xl:w-[6%]",label:"Antig.",align:"center",hiddenBelow:"xl"},
              marcas:{width:"md:w-[15%] xl:w-[10%]",label:"Marcas",align:"right",hiddenBelow:"md"},
              diasUltRepuesto:{width:"xl:w-[8%]",label:"Días rep.",align:"center",hiddenBelow:"xl"},
              diasUltServicio:{width:"xl:w-[9%]",label:"Días serv.",align:"center",hiddenBelow:"xl"},
              factYTD:{width:"w-[38%] md:w-[18%] xl:w-[11%]",label:"Facturación",align:"right"},
              factPrev:{width:"xl:w-[11%]",label:"Fact. LY",align:"right",hiddenBelow:"xl"},
              varPct:{width:"md:w-[10%] xl:w-[7%]",label:"Var.",align:"right",hiddenBelow:"md"},
            };
            return {...column,...layout[key],title:(r:Row)=>{
              if(key==="factYTD")return factLoading?"Cargando facturación…":factError??`$ ${fmtMoney(r.factYTD)}`;
              if(key==="factPrev")return factLoading?"Cargando facturación…":factError??`$ ${fmtMoney(r.factPrev)}`;
              if(key==="marcas")return `CLAAS: ${r.cantClaas} · HORSCH: ${r.cantHorsch} · Orden por participación CLAAS`;
              return String(column.value(r)??"—");
            },render:(r:Row)=>{
              if(key==="cliente")return <CompactListInfo label={r.cliente.nombre} fields={[
                ["Sucursal",r.sucursales.join(", ")||"—"],["Teléfono",r.contactoPrincipal?.telefono??"—"],["Máquinas",String(r.cantTotal)],
                ["Antig. (años)",String(r.antiguedadProm??"—")],["CLAAS",String(r.cantClaas)],["HORSCH",String(r.cantHorsch)],
                ["Días rep.",String(r.diasUltRepuesto??"—")],["Días serv.",String(r.diasUltServicio??"—")],
                ["Repuestos",r.tieneRepEnRango?"Sí":"No"],["Servicios",r.tieneSrvEnRango?"Sí":"No"],
                ["Facturación",factLoading?"Cargando…":factError??`$ ${fmtMoney(r.factYTD)}`],["Fact. LY",factLoading?"Cargando…":factError??`$ ${fmtMoney(r.factPrev)}`],
                ["Variación",factLoading?"Cargando…":factError??(r.varPct==null?"—":`${r.varPct}%`)]
              ]}>{onOpenCliente&&<Button size="sm" variant="outline" onClick={event=>{event.stopPropagation();onOpenCliente(r.cliente.id);}}>Ver cliente</Button>}</CompactListInfo>;
              if(key==="telefono")return r.contactoPrincipal?.telefono?<a href={`tel:${r.contactoPrincipal.telefono}`} onClick={event=>event.stopPropagation()} className="inline-flex max-w-full items-center gap-1 hover:text-primary"><Phone className="h-3 w-3 shrink-0" /><span className="truncate">{r.contactoPrincipal.telefono}</span></a>:"—";
              if(key==="antiguedadProm")return r.antiguedadProm!=null?<Badge className={cn("max-w-full whitespace-nowrap px-1.5 tabular-nums",antiguedadColor(r.antiguedadProm))}>{r.antiguedadProm}</Badge>:"—";
              if(key==="marcas")return r.cantTotal?<span className="inline-flex max-w-full gap-1 tabular-nums"><span className="text-marca-claas">{Math.round(r.cantClaas/r.cantTotal*100)}%</span><span>/</span><span className="text-marca-horsch">{Math.round(r.cantHorsch/r.cantTotal*100)}%</span></span>:"—";
              if(key==="diasUltRepuesto"||key==="diasUltServicio"){const value=r[key];return value!=null?<span className="inline-flex items-center gap-1">{value>365&&<Flag className="h-3 w-3 shrink-0 text-destructive" aria-label="Más de un año" />}{value}</span>:"—";}
              if(key==="factYTD"||key==="factPrev")return factLoading?"…":factError?"—":r[key]!==0?`$ ${fmtMoney(r[key])}`:"—";
              if(key==="varPct")return factLoading?"…":factError||r.varPct==null?"—":<span className={r.varPct>=0?"text-emerald-600":"text-destructive"}>{r.varPct>0?"+":""}{r.varPct}%</span>;
              return String(column.value(r)??"—");
            }};
          })} />
      </div>
    </div>
  );
}

