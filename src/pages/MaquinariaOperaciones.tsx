/* eslint-disable @typescript-eslint/no-explicit-any -- Las tablas se tipan al regenerar database.types tras aplicar la migración. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileCheck2, FileText, Paperclip, PackageCheck, Plus, Ship, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
} from "@/components/ui/responsive-drawer";
import { KpiItem, KpiStrip, PageHeader, Panel } from "@/components/layout/AppPrimitives";
import { ModeloMaquinaSelect } from "@/components/parque/ModeloMaquinaSelect";
import { pageShell } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";

const db = supabase as any;
const TODAY = new Date().toISOString().slice(0, 10);

// Estado de una UNIDAD fisica (maquinaria_unidades_operacion.estado) --
// distinto del estado de la operacion (STATE_LABEL, mas abajo).
const UNIT_STATE_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente", EN_TRANSITO: "En tránsito", DISPONIBLE: "Disponible",
  FACTURADA: "Facturada", EN_PARQUE: "En parque", TRANSFERIDA: "Transferida", CANCELADA: "Cancelada",
};

// Las 9 etapas reales de una operacion -- se muestran completas solo en el
// detalle. En la lista se usa el estado simplificado (ver simpleOrderState).
const STATE_LABEL: Record<string, string> = {
  BORRADOR: "Borrador", REVISION_NP: "Revisar NP", NP_VALIDADA: "NP validada",
  ABASTECIMIENTO: "Abastecimiento", EN_IMPORTACION: "En importación", DISPONIBLE: "Disponible",
  FACTURADA: "Facturada", CERRADA: "Cerrada", CANCELADA: "Cancelada",
};
const OPERATION_ENUM_VALUES = new Set(Object.keys(STATE_LABEL));

const usdFormatter = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const formatUsd = (value: unknown) => {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? "—" : usdFormatter.format(number);
};

const brandClass = (marca: string | null) => {
  const normalized = (marca ?? "").toUpperCase();
  if (normalized === "CLAAS") return "border-marca-claas/30 bg-marca-claas-bg text-marca-claas";
  if (normalized === "HORSCH") return "border-marca-horsch/30 bg-marca-horsch-bg text-marca-horsch";
  return "border-border bg-muted text-muted-foreground";
};

// El proveedor de una importacion suele SER el fabricante (CLAAS/HORSCH
// importan sus propias maquinas), pero no siempre -- puede ser un tercero.
// Se reusa la paleta de marca cuando el nombre la contiene, y un color propio
// para el resto, para que "Proveedor" tenga su propia identidad visual sin
// inventar una paleta arbitraria por cada proveedor distinto.
const supplierClass = (proveedor: string | null) => {
  const normalized = (proveedor ?? "").toUpperCase();
  if (normalized.includes("CLAAS")) return "border-marca-claas/30 bg-marca-claas-bg text-marca-claas";
  if (normalized.includes("HORSCH")) return "border-marca-horsch/30 bg-marca-horsch-bg text-marca-horsch";
  if (!normalized) return "border-border bg-muted text-muted-foreground";
  return "border-indigo-200 bg-indigo-50 text-indigo-700";
};

// "Tipo de venta" del diseño = la condicion que ya existe en la base.
const CONDITION_LABEL: Record<string, string> = { NUEVA: "Nueva", USADA: "Usada" };
const conditionClass = (condicion: string | null) =>
  condicion === "USADA"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

const SUPPLY_LABEL: Record<string, string> = { STOCK: "Stock", IMPORTAR: "Importar", DEFINIR: "Sin definir" };
const supplyClass = (abastecimiento: string | null) => {
  if (abastecimiento === "STOCK") return "border-blue-200 bg-blue-50 text-blue-700";
  if (abastecimiento === "IMPORTAR") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-border bg-muted text-muted-foreground";
};

// Estado simplificado de la lista (Pendiente/Completado/Cancelada). Hoy el
// dato de origen mezcla el enum real de la operacion con texto libre heredado
// de la planilla historica ("Pendiente"/"Completado" tal cual lo tipeaban) --
// esta funcion normaliza ambos vocabularios a un solo resultado, sin tocar
// la base. Ante la duda (texto irreconocible) se asume Pendiente, para no
// esconder algo que en realidad falta revisar.
type SimpleOrderState = "PENDIENTE" | "COMPLETADO" | "CANCELADA";
const SIMPLE_STATE_LABEL: Record<SimpleOrderState, string> = {
  PENDIENTE: "Pendiente", COMPLETADO: "Facturado", CANCELADA: "Cancelada",
};
const simpleStateClass = (state: SimpleOrderState) =>
  state === "COMPLETADO"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : state === "CANCELADA"
      ? "border-slate-300 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-700";

function simpleOrderState(estadoFuente: string | null): SimpleOrderState {
  const raw = String(estadoFuente ?? "").trim().toUpperCase();
  if (!raw) return "PENDIENTE";
  if (OPERATION_ENUM_VALUES.has(raw)) {
    if (raw === "FACTURADA" || raw === "CERRADA") return "COMPLETADO";
    if (raw === "CANCELADA") return "CANCELADA";
    return "PENDIENTE";
  }
  if (raw.includes("CANCEL")) return "CANCELADA";
  if (raw.includes("COMPLET")) return "COMPLETADO";
  return "PENDIENTE";
}

// Estado de entrega de UNA UNIDAD fisica (Entregado/En stock/No disponible)
// -- distinto y enteramente independiente del estado de facturacion: una
// maquina puede estar facturada y seguir en nuestro stock. "En stock" exige
// prueba real: el chasis de la unidad tiene que existir fisicamente en
// parque_stock_maquinas (el inventario que sube el Excel de TOTVS), no
// alcanza con que la unidad este en un estado "todavia no entregada" --
// antes de este ajuste, cualquier unidad sin chasis (la mayoria de los
// pedidos activos, con o sin origen STOCK) mostraba "En stock" sin ninguna
// prueba de que la maquina estuviera fisicamente en el deposito.
type EntregaState = "ENTREGADO" | "EN_STOCK" | "NO_DISPONIBLE" | "CANCELADA";
const ENTREGA_LABEL: Record<EntregaState, string> = {
  ENTREGADO: "Entregado", EN_STOCK: "En stock", NO_DISPONIBLE: "No disponible", CANCELADA: "Cancelada",
};
const entregaClass = (state: EntregaState | null) =>
  state === "ENTREGADO"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : state === "EN_STOCK"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : state === "CANCELADA"
        ? "border-slate-300 bg-slate-100 text-slate-600"
        : "border-amber-200 bg-amber-50 text-amber-700";

const normalizarChasis = (value: string | null | undefined) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Sub-etapa A (diseno_flujo_maquinas.md): las marcas no admitidas a Parque
// (OTROS) nunca van a generar una fila en parque_maquinas -- para ellas
// "EN_PARQUE"/"TRANSFERIDA" nunca va a llegar, aunque la venta este 100%
// cerrada. Confirmado con datos reales: 3 pedidos OTROS con la operacion
// en FACTURADA/CERRADA quedaban "En stock" para siempre. Para esas marcas,
// la operacion cerrada/facturada YA es la señal de entrega real. CLAAS y
// HORSCH no cambian: siguen dependiendo solo de entrar al Parque.
function entregaStateFromUnit(
  unitEstado: string | null | undefined,
  unitChasis: string | null | undefined,
  marca: string | null | undefined,
  operacionEstado: string | null | undefined,
  stockChasisSet: Set<string> | undefined,
): EntregaState {
  if (unitEstado === "EN_PARQUE" || unitEstado === "TRANSFERIDA") return "ENTREGADO";
  if (unitEstado === "CANCELADA") return "CANCELADA";
  const esParqueEligible = marca === "CLAAS" || marca === "HORSCH";
  if (!esParqueEligible && (operacionEstado === "FACTURADA" || operacionEstado === "CERRADA")) return "ENTREGADO";
  const normalizado = normalizarChasis(unitChasis);
  if (normalizado && stockChasisSet?.has(normalizado)) return "EN_STOCK";
  return "NO_DISPONIBLE";
}

// Estado de llegada de una importacion (Planificado/En transito/Completado).
// Prioriza estado_fuente (texto de la planilla historica, ya viene limpio:
// "Planificado"/"Completado") sobre el calculo por ETA/ATA -- confirmado con
// datos reales que casi todas las filas tienen ETA cargado de entrada (no
// solo cuando el envio ya salio), asi que "hay ETA y no hay ATA" NO significa
// "en transito" de forma confiable. El calculo por fechas queda como
// respaldo unicamente cuando el texto de origen no dice nada reconocible.
type ArrivalState = "PLANIFICADO" | "EN_TRANSITO" | "COMPLETADO";
const ARRIVAL_LABEL: Record<ArrivalState, string> = {
  PLANIFICADO: "Planificado", EN_TRANSITO: "En tránsito", COMPLETADO: "Completado",
};
const arrivalClass = (state: ArrivalState) =>
  state === "COMPLETADO"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : state === "EN_TRANSITO"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-slate-100 text-slate-600";

function arrivalState(row: Pick<ImportRow, "eta" | "ata" | "estado_fuente">): ArrivalState {
  const raw = String(row.estado_fuente ?? "").trim().toUpperCase();
  if (raw.includes("COMPLET") || raw.includes("ARRIB") || raw.includes("RECIB")) return "COMPLETADO";
  if (raw.includes("TRANSIT") || raw.includes("EMBARC")) return "EN_TRANSITO";
  if (raw.includes("PLANIFIC")) return "PLANIFICADO";
  if (row.ata) return "COMPLETADO";
  if (row.eta) return "EN_TRANSITO";
  return "PLANIFICADO";
}

// Situacion comercial (Reservado/Vendido/Stock) -- ya se calcula sola desde
// maquinaria_stock_trazabilidad, se reusa tal cual.
const AVAILABILITY_LABEL: Record<string, string> = {
  DISPONIBLE: "Stock", RESERVADO: "Reservado", VENDIDO_PENDIENTE_ENTREGA: "Vendido · por entregar",
  EN_PARQUE: "En parque", CONFLICTO: "Conflicto", SIN_CHASIS: "Sin chasis",
};
const availabilityClass = (state?: string | null) => cn(
  "text-[10px]",
  state === "DISPONIBLE" && "border-emerald-200 bg-emerald-50 text-emerald-700",
  state === "RESERVADO" && "border-blue-200 bg-blue-50 text-blue-700",
  state === "VENDIDO_PENDIENTE_ENTREGA" && "border-violet-200 bg-violet-50 text-violet-700",
  state === "CONFLICTO" && "border-red-200 bg-red-50 text-red-700",
  (!state || state === "SIN_CHASIS" || state === "EN_PARQUE") && "border-slate-200 bg-slate-100 text-slate-600",
);

type OrderRow = {
  id: string; operacion_id: string; np_numero: string | null; np_fecha: string | null; cliente_nombre: string;
  comercial: string | null; marca: string | null; producto: string | null; modelo: string | null; cantidad: number | null;
  condicion: string | null; abastecimiento: string | null; estado_fuente: string | null; chasis: string | null;
  estado_disponibilidad: string | null; disponibilidad_detalle: string | null; estado_importacion_fuente: string | null;
  eta: string | null; ata: string | null; proveedor: string | null; factura_venta: string | null; factura_fecha: string | null;
  costo_producto: number | null; valor_venta: number | null; observaciones: string | null; actualizado_en: string;
};
type ImportRow = {
  id: string; operacion_id: string | null; linea_id: string | null; np_numero: string | null; np_fecha: string | null;
  cliente_nombre: string | null; comercial: string | null; marca: string | null; producto: string | null; modelo: string | null;
  cantidad: number | null; estado_fuente: string | null; oc: string | null; po: string | null; eta: string | null; ata: string | null;
  proveedor: string | null; invoice_supplier: string | null; precio_oc: number | null; costo_final: number | null; chasis: string | null;
  venta_facturada: string | null; valor_venta: number | null; situacion_vinculo: string | null; estado_disponibilidad: string | null;
  disponibilidad_detalle: string | null; stock_sucursal: string | null; stock_deposito: string | null; stock_saldo: number | null;
};
type DraftLine = {
  linea_numero: number; marca: "CLAAS" | "HORSCH" | "OTROS"; producto: string; modelo: string;
  anio?: number | null; cabezal?: string;
  cantidad: number; condicion: "NUEVA" | "USADA"; abastecimiento: "DEFINIR" | "STOCK" | "IMPORTAR";
  subgrupo: string; chasis: string[]; confianza?: Record<string, unknown>; datos_extraidos?: Record<string, unknown>;
};
type OperationDetail = OrderRow & { estado: string; unidades: number; documentos: number; requiere_importacion: boolean; lines: any[]; units: any[]; docs: any[]; importation?: any };

const blankLine = (n = 1): DraftLine => ({
  linea_numero: n, marca: "CLAAS", producto: "", modelo: "", cantidad: 1,
  anio: null, cabezal: "", condicion: "NUEVA", abastecimiento: "DEFINIR", subgrupo: "OTRO", chasis: [],
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function safeMarca(value: unknown): DraftLine["marca"] {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "CLAAS" || normalized === "HORSCH" ? normalized : "OTROS";
}

function safeSubgroup(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  return (MACHINE_SUBGROUPS as readonly string[]).includes(normalized) && normalized !== "SUELO"
    ? normalized : "OTRO";
}

function safeExtractedDate(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function safeExtractedText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized.toLowerCase() !== "null" ? normalized : "";
}

function extractedLinesToDraft(rawLines: unknown[], confidence: Record<string, unknown> = {}) {
  const result: DraftLine[] = [];
  rawLines.forEach((raw) => {
    const line = (raw ?? {}) as Record<string, any>;
    const quantity = Math.max(1, Number(line.cantidad) || 1);
    const condition: DraftLine["condicion"] = line.condicion === "USADA" ? "USADA" : "NUEVA";
    const supply: DraftLine["abastecimiento"] = line.abastecimiento === "STOCK" || line.abastecimiento === "IMPORTAR"
      ? line.abastecimiento
      : "DEFINIR";
    const brand = safeMarca(line.marca);
    const head = safeExtractedText(line.cabezal);

    result.push({
      linea_numero: result.length + 1,
      marca: brand,
      producto: safeExtractedText(line.producto),
      modelo: safeExtractedText(line.modelo),
      anio: line.anio == null || line.anio === "" || !Number.isInteger(Number(line.anio)) ? null : Number(line.anio),
      cabezal: "",
      cantidad: quantity,
      condicion: condition,
      abastecimiento: supply,
      subgrupo: safeSubgroup(line.subgrupo),
      chasis: Array.isArray(line.chasis) ? line.chasis.map(String) : [],
      confianza: confidence,
      datos_extraidos: line,
    });

    // En la NP una máquina y su cabezal son activos independientes. La
    // compatibilidad con `cabezal` permite separar también lecturas hechas
    // con versiones anteriores de la función OCR.
    if (head) {
      result.push({
        linea_numero: result.length + 1,
        marca: brand,
        producto: "Cabezal / plataforma",
        modelo: head,
        anio: null,
        cabezal: "",
        cantidad: quantity,
        condicion: condition,
        abastecimiento: supply,
        subgrupo: "PLATAFORMAS/CABEZALES",
        chasis: [],
        confianza: confidence,
        datos_extraidos: { ...line, cabezal: null, origen_linea: "CABEZAL_DE_NP" },
      });
    }
  });
  return result;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function extractDocument(file: File, documentType: "NP" | "FACTURA_IMPORTACION") {
  if (!file.type.startsWith("image/")) throw new Error("La lectura automática requiere una foto JPG, PNG o WEBP.");
  const { data, error } = await supabase.functions.invoke("machine-document-extractor", {
    body: { documentType, mimeType: file.type, dataUrl: await fileToDataUrl(file) },
  });
  if (error) {
    const raw = [error.message, (error as any).context?.status, (error as any).context?.statusText]
      .filter(Boolean)
      .join(" ");
    if (/404|not[_ ]found|function.*not.*found|failed to send/i.test(raw)) {
      throw new Error("El lector automático todavía no está desplegado en Supabase. Podés completar los datos manualmente o publicar la función machine-document-extractor.");
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data?.data ?? {};
}

async function uploadEvidence(file: File, operationId: string, type: string, extracted: unknown) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sesión no válida");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${auth.user.id}/${operationId}/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await supabase.storage.from("maquinaria-documentos").upload(path, file, { contentType: file.type });
  if (storageError) throw storageError;
  const { error: docError } = await db.from("maquinaria_documentos").insert({
    operacion_id: operationId, tipo: type, archivo_nombre: file.name, storage_path: path,
    mime_type: file.type, tamano_bytes: file.size, estado_extraccion: "REVISADO",
    datos_extraidos: extracted ?? {}, revisado_por: auth.user.id, revisado_en: new Date().toISOString(),
  });
  if (docError) throw docError;
}

export default function MaquinariaOperaciones() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const importsView = location.pathname === "/parque-importaciones";
  const [search, setSearch] = useState("");
  const [orderState, setOrderState] = useState<SimpleOrderState | "TODOS">("PENDIENTE");
  const [marca, setMarca] = useState("TODOS");
  const [condicion, setCondicion] = useState("TODOS");
  const [llegada, setLlegada] = useState<ArrivalState | "TODOS">("TODOS");
  const [situacion, setSituacion] = useState("TODOS");
  const [entrega, setEntrega] = useState<EntregaState | "TODOS">("TODOS");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportRow | null>(null);

  // Los filtros son independientes por pantalla: cambiar de pestaña no debe
  // arrastrar un filtro que no existe del otro lado.
  useEffect(() => { setSearch(""); }, [importsView]);

  const operationsQuery = useQuery({
    queryKey: ["machine-operations", importsView ? "imports" : "orders"],
    queryFn: async () => {
      const table = importsView ? "maquinaria_importaciones_lineas_operativas" : "maquinaria_pedidos_lineas_operativas";
      const orderColumn = importsView ? "eta" : "np_fecha";
      const { data, error } = await db.from(table).select("*").order(orderColumn, { ascending: false, nullsFirst: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as (OrderRow | ImportRow)[];
    },
  });

  // El "estado de entrega" (Entregado/En stock/No disponible) sale de
  // maquinaria_unidades_operacion (estado + chasis) -- la vista de la lista
  // todavia no lo expone, asi que se busca aparte por el id de cada fila
  // (que coincide con el id de la unidad fisica) en vez de tocar la base
  // para agregar la columna a la vista.
  const unitIds = useMemo(
    () => importsView ? [] : Array.from(new Set((operationsQuery.data ?? []).map((row) => row.id).filter(Boolean))),
    [importsView, operationsQuery.data],
  );
  const entregaQuery = useQuery({
    queryKey: ["machine-operations-entrega", unitIds],
    enabled: !importsView && unitIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, { estado: string; chasis: string | null }>();
      for (let i = 0; i < unitIds.length; i += 200) {
        const chunk = unitIds.slice(i, i + 200);
        const { data, error } = await db.from("maquinaria_unidades_operacion").select("id,estado,chasis").in("id", chunk);
        if (error) throw error;
        for (const unit of data ?? []) map.set(unit.id, { estado: unit.estado, chasis: unit.chasis });
      }
      return map;
    },
  });

  // "En stock" exige prueba real: el chasis de la unidad tiene que existir
  // en el inventario fisico (parque_stock_maquinas, el Excel de TOTVS). Se
  // trae el set completo de chasis normalizados una sola vez -- es liviano
  // (una sola columna) y se reusa para todas las filas.
  const stockChasisQuery = useQuery({
    queryKey: ["machine-operations-stock-chasis"],
    enabled: !importsView,
    queryFn: async () => {
      const set = new Set<string>();
      let from = 0;
      for (;;) {
        const { data, error } = await db.from("parque_stock_maquinas").select("chasis").range(from, from + 999);
        if (error) throw error;
        for (const row of data ?? []) {
          const normalizado = normalizarChasis(row.chasis);
          if (normalizado) set.add(normalizado);
        }
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      return set;
    },
  });

  // Sub-etapa A: para marcas OTROS, "entrega" tambien depende del estado
  // real de la OPERACION (FACTURADA/CERRADA) -- se busca aparte por
  // operacion_id, igual patron que entregaQuery, sin tocar la base.
  const operacionIds = useMemo(
    () => importsView ? [] : Array.from(new Set((operationsQuery.data ?? []).map((row) => (row as OrderRow).operacion_id).filter(Boolean))),
    [importsView, operationsQuery.data],
  );
  const operacionEstadoQuery = useQuery({
    queryKey: ["machine-operations-estado-operacion", operacionIds],
    enabled: !importsView && operacionIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, string>();
      for (let i = 0; i < operacionIds.length; i += 200) {
        const chunk = operacionIds.slice(i, i + 200);
        const { data, error } = await db.from("maquinaria_operaciones").select("id,estado").in("id", chunk);
        if (error) throw error;
        for (const op of data ?? []) map.set(op.id, op.estado);
      }
      return map;
    },
  });

  const marcaOptions = useMemo(
    () => Array.from(new Set((operationsQuery.data ?? []).map((row) => row.marca).filter((v): v is string => !!v))).sort(),
    [operationsQuery.data],
  );

  const entregaByUnitId = entregaQuery.data;
  const estadoByOperacionId = operacionEstadoQuery.data;
  const stockChasisSet = stockChasisQuery.data;
  const rows = useMemo(() => (operationsQuery.data ?? []).filter((row) => {
    if (importsView) {
      const importRow = row as ImportRow;
      if (llegada !== "TODOS" && arrivalState(importRow) !== llegada) return false;
      if (situacion !== "TODOS" && (importRow.estado_disponibilidad ?? "SIN_CHASIS") !== situacion) return false;
    } else {
      const orderRow = row as OrderRow;
      if (orderState !== "TODOS" && simpleOrderState(orderRow.estado_fuente) !== orderState) return false;
      if (condicion !== "TODOS" && orderRow.condicion !== condicion) return false;
      const unit = entregaByUnitId?.get(orderRow.id);
      if (entrega !== "TODOS" && entregaStateFromUnit(unit?.estado, unit?.chasis, orderRow.marca, estadoByOperacionId?.get(orderRow.operacion_id), stockChasisSet) !== entrega) return false;
    }
    if (marca !== "TODOS" && row.marca !== marca) return false;
    const q = search.trim().toUpperCase();
    if (!q) return true;
    const common = [row.np_numero, row.cliente_nombre, row.marca, row.producto, row.modelo, row.chasis];
    const importValues = importsView ? [(row as ImportRow).proveedor, (row as ImportRow).oc, (row as ImportRow).po] : [(row as OrderRow).comercial];
    return [...common, ...importValues].some((v) => String(v ?? "").toUpperCase().includes(q));
  }), [operationsQuery.data, importsView, search, orderState, marca, condicion, llegada, situacion, entrega, entregaByUnitId, estadoByOperacionId, stockChasisSet]);

  const activeCount = (marca !== "TODOS" ? 1 : 0)
    + (importsView ? (llegada !== "TODOS" ? 1 : 0) + (situacion !== "TODOS" ? 1 : 0) : (condicion !== "TODOS" ? 1 : 0) + (entrega !== "TODOS" ? 1 : 0));
  const clearFilters = () => { setMarca("TODOS"); setCondicion("TODOS"); setLlegada("TODOS"); setSituacion("TODOS"); setEntrega("TODOS"); };

  const orderTotals = useMemo(() => {
    const orderRows = rows as OrderRow[];
    return {
      total: orderRows.length,
      pendientes: orderRows.filter((row) => simpleOrderState(row.estado_fuente) === "PENDIENTE").length,
      facturados: orderRows.filter((row) => simpleOrderState(row.estado_fuente) === "COMPLETADO").length,
      facturado: orderRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.valor_venta)) ? Number(row.valor_venta) : 0), 0),
    };
  }, [rows]);
  const importTotals = useMemo(() => {
    const importRows = rows as ImportRow[];
    return {
      total: importRows.length,
      planificadas: importRows.filter((row) => arrivalState(row) === "PLANIFICADO").length,
      transito: importRows.filter((row) => arrivalState(row) === "EN_TRANSITO").length,
      completadas: importRows.filter((row) => arrivalState(row) === "COMPLETADO").length,
    };
  }, [rows]);

  return <main className={pageShell}>
    <PageHeader
      title={importsView ? "Importación de máquinas" : "Operaciones de máquinas"}
      meta={importsView ? "Qué está planificado y qué ya llegó, con su situación comercial." : "Qué pedidos faltan facturar y cuáles ya se completaron."}
      actions={!importsView ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nuevo pedido</Button> : undefined}
    />
    {importsView ? (
      <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiItem label="Importaciones" value={importTotals.total} icon={<Ship />} tone="info" />
        <KpiItem label="Planificadas" value={importTotals.planificadas} icon={<FileText />} />
        <KpiItem label="En tránsito" value={importTotals.transito} icon={<FileText />} tone="info" />
        <KpiItem label="Completadas" value={importTotals.completadas} icon={<PackageCheck />} tone="positive" />
      </KpiStrip>
    ) : (
      <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiItem label="Pedidos" value={orderTotals.total} icon={<FileCheck2 />} tone="info" />
        <KpiItem label="Pendientes de facturar" value={orderTotals.pendientes} icon={<FileText />} tone="warning" />
        <KpiItem label="Facturados" value={orderTotals.facturados} icon={<PackageCheck />} tone="positive" />
        <KpiItem label="Facturación (USD)" value={formatUsd(orderTotals.facturado)} />
      </KpiStrip>
    )}
    <FiltersBar
      search={{ value: search, onChange: setSearch, placeholder: importsView ? "NP, proveedor, OC/PO..." : "NP, cliente o comercial...", label: "Buscar", width: "w-[240px]" }}
      activeCount={activeCount}
      onClear={clearFilters}
      meta={`${rows.length} ${importsView ? "importaciones" : "pedidos"}`}
    >
      {!importsView && (
        <FilterSelect
          label="Facturación"
          value={orderState}
          onChange={(v) => setOrderState(v as SimpleOrderState | "TODOS")}
          placeholder="Facturación"
          width="w-[150px]"
          options={[
            { value: "PENDIENTE", label: "Pendientes" },
            { value: "COMPLETADO", label: "Facturados" },
            { value: "CANCELADA", label: "Canceladas" },
            { value: "TODOS", label: "Todos" },
          ]}
        />
      )}
      {!importsView && (
        <FilterSelect
          label="Entrega"
          value={entrega}
          onChange={(v) => setEntrega(v as EntregaState | "TODOS")}
          placeholder="Entrega"
          width="w-[130px]"
          options={[
            { value: "TODOS", label: "Todas" },
            { value: "EN_STOCK", label: "En stock" },
            { value: "NO_DISPONIBLE", label: "No disponible" },
            { value: "ENTREGADO", label: "Entregado" },
          ]}
        />
      )}
      {importsView && (
        <FilterSelect
          label="Llegada"
          value={llegada}
          onChange={(v) => setLlegada(v as ArrivalState | "TODOS")}
          placeholder="Llegada"
          width="w-[150px]"
          options={[{ value: "TODOS", label: "Todas" }, ...Object.entries(ARRIVAL_LABEL).map(([value, label]) => ({ value, label }))]}
        />
      )}
      {importsView && (
        <FilterSelect
          label="Situación"
          value={situacion}
          onChange={setSituacion}
          placeholder="Situación"
          width="w-[150px]"
          options={[{ value: "TODOS", label: "Todas" }, ...Object.entries(AVAILABILITY_LABEL).map(([value, label]) => ({ value, label }))]}
        />
      )}
      <FilterSelect label="Marca" value={marca} onChange={setMarca} placeholder="Marca" width="w-[130px]" options={[{ value: "TODOS", label: "Todas" }, ...marcaOptions.map((value) => ({ value, label: value }))]} />
      {!importsView && (
        <FilterSelect label="Condición" value={condicion} onChange={setCondicion} placeholder="Condición" width="w-[130px]" options={[{ value: "TODOS", label: "Todas" }, ...Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }))]} />
      )}
    </FiltersBar>
    <Panel className="p-0">
      {operationsQuery.isError ? <div className="p-8 text-center text-[12px] text-destructive">Aplicá la migración SQL de operaciones para habilitar esta sección.</div> :
      <>
        <div className="hidden overflow-x-auto md:block">
          {importsView ? <ImportsTable rows={rows as ImportRow[]} onSelect={setSelectedImport} /> : <OrdersTable rows={rows as OrderRow[]} onSelect={(row) => setSelected(row.operacion_id)} entregaByUnitId={entregaByUnitId} estadoByOperacionId={estadoByOperacionId} stockChasisSet={stockChasisSet} />}
        </div>
        <div className="space-y-2 p-3 md:hidden">{rows.map((row) => {
          if (importsView) {
            const importRow = row as ImportRow;
            const arrival = arrivalState(importRow);
            return <button type="button" key={row.id} onClick={() => setSelectedImport(importRow)} className="w-full rounded-xl border bg-card p-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[12px] font-semibold">{importRow.oc ? `OC ${importRow.oc}` : row.np_numero ? `NP ${row.np_numero}` : "Sin OC"}</span>
                <Badge variant="outline" className={cn("text-[10px]", arrivalClass(arrival))}>{ARRIVAL_LABEL[arrival]}</Badge>
              </div>
              <div className="mt-2 text-[13px] font-medium">{row.producto || row.modelo || "Sin descripción"}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.modelo && row.modelo !== row.producto ? row.modelo : ""}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("text-[10px]", supplierClass(importRow.proveedor))}>{importRow.proveedor || "Sin proveedor"}</Badge>
                {importRow.estado_disponibilidad && <Badge variant="outline" className={availabilityClass(importRow.estado_disponibilidad)}>{AVAILABILITY_LABEL[importRow.estado_disponibilidad] ?? importRow.estado_disponibilidad}</Badge>}
              </div>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">{row.chasis || "Sin chasis"}</div>
            </button>;
          }
          const orderRow = row as OrderRow;
          const state = simpleOrderState(orderRow.estado_fuente);
          const orderUnit = entregaByUnitId?.get(orderRow.id);
          const entregaState = entregaStateFromUnit(orderUnit?.estado, orderUnit?.chasis, orderRow.marca, estadoByOperacionId?.get(orderRow.operacion_id), stockChasisSet);
          return <button type="button" key={row.id} onClick={() => setSelected(orderRow.operacion_id)} className="w-full rounded-xl border bg-card p-3 text-left">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[12px] font-semibold">{row.np_numero ? `NP ${row.np_numero}` : "Sin NP"}</span>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={cn("text-[10px]", simpleStateClass(state))}>{SIMPLE_STATE_LABEL[state]}</Badge>
                {entregaState && <Badge variant="outline" className={cn("text-[10px]", entregaClass(entregaState))}>{ENTREGA_LABEL[entregaState]}</Badge>}
              </div>
            </div>
            <div className="mt-2 text-[13px] font-medium">{row.modelo || row.producto || "Sin descripción"}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{orderRow.cliente_nombre || "Sin cliente"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("text-[10px]", brandClass(row.marca))}>{row.marca ?? "OTROS"}</Badge>
              {orderRow.condicion && <Badge variant="outline" className={cn("text-[10px]", conditionClass(orderRow.condicion))}>{CONDITION_LABEL[orderRow.condicion] ?? orderRow.condicion}</Badge>}
              <span className="ml-auto text-[11px] font-medium tabular-nums">{formatUsd(orderRow.valor_venta)}</span>
            </div>
          </button>;
        })}</div>
        {!rows.length && !operationsQuery.isLoading && <div className="p-10 text-center text-[12px] text-muted-foreground">No hay {importsView ? "importaciones" : "pedidos"} con estos filtros.</div>}
      </>}
    </Panel>
    <NewOperationDrawer open={newOpen} onOpenChange={setNewOpen} onSaved={() => queryClient.invalidateQueries({ queryKey: ["machine-operations"] })} />
    <OperationDrawer operationId={selected} onOpenChange={(open) => !open && setSelected(null)} onChanged={() => queryClient.invalidateQueries({ queryKey: ["machine-operations"] })} />
    <ImportDetailDrawer row={selectedImport} onOpenChange={(open) => !open && setSelectedImport(null)} />
  </main>;
}

function OrdersTable({ rows, onSelect, entregaByUnitId, estadoByOperacionId, stockChasisSet }: { rows: OrderRow[]; onSelect: (row: OrderRow) => void; entregaByUnitId?: Map<string, { estado: string; chasis: string | null }>; estadoByOperacionId?: Map<string, string>; stockChasisSet?: Set<string> }) {
  return <Table className="text-[12px]">
    <TableHeader><TableRow>
      <TableHead>NP</TableHead>
      <TableHead>Fecha</TableHead>
      <TableHead>Cliente</TableHead>
      <TableHead>Máquina</TableHead>
      <TableHead>Marca</TableHead>
      <TableHead>Condición</TableHead>
      <TableHead>Origen</TableHead>
      <TableHead>Facturación</TableHead>
      <TableHead>Entrega</TableHead>
      <TableHead className="text-right">Valor (USD)</TableHead>
      <TableHead className="w-[40px]" />
    </TableRow></TableHeader>
    <TableBody>{rows.map((row) => {
      const state = simpleOrderState(row.estado_fuente);
      const unit = entregaByUnitId?.get(row.id);
      const entregaState = entregaStateFromUnit(unit?.estado, unit?.chasis, row.marca, estadoByOperacionId?.get(row.operacion_id), stockChasisSet);
      return <TableRow key={row.id} className="cursor-pointer" onClick={() => onSelect(row)}>
        <TableCell className="font-mono font-medium">{row.np_numero || "Sin NP"}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(row.np_fecha)}</TableCell>
        <TableCell className="max-w-[220px] truncate">{row.cliente_nombre}</TableCell>
        <TableCell className="max-w-[220px] truncate">{row.modelo || row.producto || "—"}</TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", brandClass(row.marca))}>{row.marca ?? "OTROS"}</Badge></TableCell>
        <TableCell>{row.condicion && <Badge variant="outline" className={cn("text-[10px]", conditionClass(row.condicion))}>{CONDITION_LABEL[row.condicion] ?? row.condicion}</Badge>}</TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", supplyClass(row.abastecimiento))}>{SUPPLY_LABEL[row.abastecimiento ?? ""] ?? "Sin definir"}</Badge></TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", simpleStateClass(state))}>{SIMPLE_STATE_LABEL[state]}</Badge></TableCell>
        <TableCell>{entregaState ? <Badge variant="outline" className={cn("text-[10px]", entregaClass(entregaState))}>{ENTREGA_LABEL[entregaState]}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className="text-right tabular-nums">{formatUsd(row.valor_venta)}</TableCell>
        <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}

function ImportsTable({ rows, onSelect }: { rows: ImportRow[]; onSelect: (row: ImportRow) => void }) {
  return <Table className="text-[12px]">
    <TableHeader><TableRow>
      <TableHead>OC</TableHead>
      <TableHead>Proveedor</TableHead>
      <TableHead>Máquina</TableHead>
      <TableHead>Modelo</TableHead>
      <TableHead className="text-right">Cant.</TableHead>
      <TableHead>Embarque (est.)</TableHead>
      <TableHead>Arribo</TableHead>
      <TableHead>Llegada</TableHead>
      <TableHead>Situación</TableHead>
      <TableHead>Chasis</TableHead>
      <TableHead className="w-[40px]" />
    </TableRow></TableHeader>
    <TableBody>{rows.map((row) => {
      const arrival = arrivalState(row);
      return <TableRow key={row.id} className="cursor-pointer" onClick={() => onSelect(row)}>
        <TableCell className="font-mono font-medium">{row.oc || "—"}</TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", supplierClass(row.proveedor))}>{row.proveedor || "Sin proveedor"}</Badge></TableCell>
        <TableCell className="max-w-[200px] truncate">{row.producto || "—"}</TableCell>
        <TableCell className="max-w-[200px] truncate font-medium">{row.modelo || "—"}</TableCell>
        <TableCell className="text-right tabular-nums">{row.cantidad ?? "—"}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(row.eta)}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(row.ata)}</TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", arrivalClass(arrival))}>{ARRIVAL_LABEL[arrival]}</Badge></TableCell>
        <TableCell>{row.estado_disponibilidad ? <Badge variant="outline" className={availabilityClass(row.estado_disponibilidad)}>{AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className="font-mono text-[11px]">{row.chasis || "Sin chasis"}</TableCell>
        <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}

/** Adjuntar un documento suelto (sin lectura OCR) a una operacion ya creada. */
function AttachDocumentButton({ operationId, onUploaded, disabledTitle }: { operationId: string | null; onUploaded: () => void; disabledTitle?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (file?: File) => {
    if (!file || !operationId) return;
    setBusy(true);
    try {
      await uploadEvidence(file, operationId, "OTRO", {});
      toast.success("Documento adjuntado");
      onUploaded();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo adjuntar el documento");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return <>
    <input ref={fileRef} type="file" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    <Button
      variant="outline" size="sm" disabled={busy || !operationId}
      title={!operationId ? disabledTitle : undefined}
      onClick={() => fileRef.current?.click()}
    >
      <Paperclip className="mr-1.5 h-3.5 w-3.5" />{busy ? "Subiendo..." : "Adjuntar documento"}
    </Button>
  </>;
}

function ImportDetailDrawer({ row, onOpenChange }: { row: ImportRow | null; onOpenChange: (open: boolean) => void }) {
  if (!row) return null;
  const arrival = arrivalState(row);
  const groups = [
    { title: "Unidad importada", values: [["Máquina", row.producto], ["Modelo", row.modelo], ["Marca", row.marca], ["Chasis", row.chasis], ["Cantidad", row.cantidad]] },
    { title: "Logística", values: [["OC", row.oc], ["PO", row.po], ["Proveedor", row.proveedor], ["Estado de origen", row.estado_fuente], ["Embarque estimado", formatDate(row.eta)], ["Arribo", formatDate(row.ata)]] },
    { title: "Pedido vinculado", values: [["NP", row.np_numero], ["Cliente", row.cliente_nombre], ["Comercial", row.comercial], ["Situación del vínculo", row.situacion_vinculo]] },
    { title: "Documentación y valores", values: [["Valor de OC", row.precio_oc != null ? formatUsd(row.precio_oc) : null], ["Valor facturado por el proveedor", row.costo_final != null ? formatUsd(row.costo_final) : null], ["Factura del proveedor", row.invoice_supplier], ["Venta facturada", row.venta_facturada], ["Valor de venta", row.valor_venta != null ? formatUsd(row.valor_venta) : null]] },
    { title: "Stock vinculado", values: [["Sucursal", row.stock_sucursal], ["Depósito", row.stock_deposito], ["Saldo", row.stock_saldo], ["Detalle", row.disponibilidad_detalle]] },
  ].map((group) => ({ ...group, values: group.values.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "—") })).filter((group) => group.values.length);
  return <ResponsiveDrawer open onOpenChange={onOpenChange} size="lg">
    <ResponsiveDrawerHeader>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[16px] font-semibold">{row.producto || row.modelo || "Importación"}</h2><p className="text-[11px] text-muted-foreground">{row.oc ? `OC ${row.oc}` : row.np_numero ? `NP ${row.np_numero}` : "Sin OC"}</p></div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={cn("text-[10px]", arrivalClass(arrival))}>{ARRIVAL_LABEL[arrival]}</Badge>
          {row.estado_disponibilidad && <Badge variant="outline" className={availabilityClass(row.estado_disponibilidad)}>{AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad}</Badge>}
        </div>
      </div>
    </ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      {groups.map((group) => <section key={group.title}><h3 className="mb-2 text-[12px] font-semibold">{group.title}</h3><dl className="grid gap-x-4 gap-y-2 rounded-lg border p-3 sm:grid-cols-2">{group.values.map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="break-words text-[12px] font-medium">{String(value)}</dd></div>)}</dl></section>)}
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter>
      <AttachDocumentButton
        operationId={row.operacion_id}
        disabledTitle="Esta importación todavía no está vinculada a un pedido; vinculala primero para poder adjuntar documentos."
        onUploaded={() => undefined}
      />
    </ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function NewOperationDrawer({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<any>({});
  const [form, setForm] = useState({ np_numero: "", np_fecha: "", cliente_nombre: "", comercial: "", observaciones: "" });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  useEffect(() => { if (!open) return; setFile(null); setExtracted({}); setForm({ np_numero: "", np_fecha: "", cliente_nombre: "", comercial: "", observaciones: "" }); setLines([blankLine()]); }, [open]);
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = async (picked?: File) => {
    if (!picked) return;
    setFile(picked); setReading(true);
    try {
      const data = await extractDocument(picked, "NP"); setExtracted(data);
      setForm((old) => ({
        ...old,
        np_numero: safeExtractedText(data.np_numero) || old.np_numero,
        np_fecha: safeExtractedDate(data.np_fecha) || old.np_fecha,
        cliente_nombre: safeExtractedText(data.cliente_nombre) || old.cliente_nombre,
        comercial: safeExtractedText(data.comercial) || old.comercial,
        observaciones: safeExtractedText(data.observaciones) || old.observaciones,
      }));
      if (Array.isArray(data.lineas) && data.lineas.length) {
        setLines(extractedLinesToDraft(data.lineas, data.confianza ?? {}));
      }
      toast.success("Lectura terminada. Revisá los datos antes de guardar.");
    } catch (error: any) { toast.warning(error?.message ?? "No se pudo leer; completá los datos manualmente."); }
    finally { setReading(false); }
  };
  const updateLine = (index: number, patch: Partial<DraftLine>) => setLines((all) => all.map((line, i) => i === index ? { ...line, ...patch } : line));
  const save = async () => {
    if (!form.np_numero.trim()) return toast.error("Ingresá el número de NP");
    if (!form.cliente_nombre.trim()) return toast.error("Ingresá el cliente");
    if (lines.some((l) => !l.producto.trim() && !l.modelo.trim())) return toast.error("Cada línea necesita producto o modelo");
    setSaving(true);
    try {
      const operationId = crypto.randomUUID();
      const linesForSave = lines.map((line) => ({
        ...line,
        datos_extraidos: { ...(line.datos_extraidos ?? {}), anio: line.anio ?? null, cabezal: line.cabezal || null },
      }));
      const { data, error } = await db.rpc("maquinaria_registrar_operacion", { p_operacion: { id: operationId, ...form }, p_lineas: linesForSave });
      if (error) throw error;
      if (file) {
        try { await uploadEvidence(file, data ?? operationId, "NP", extracted); }
        catch (uploadError) { console.error(uploadError); toast.warning("La operación se guardó, pero el archivo no pudo adjuntarse."); }
      }
      toast.success("NP validada y operación creada"); onSaved(); onOpenChange(false);
    } catch (error: any) { toast.error(error?.message ?? "No se pudo guardar la operación"); }
    finally { setSaving(false); }
  };
  return <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="xl">
    <ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">Nuevo pedido</h2><p className="text-[11px] text-muted-foreground">Subí la foto de la NP, verificá lo leído y completá solamente lo faltante.</p></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Upload className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{reading ? "Leyendo la NP..." : file?.name ?? "Subir foto nítida de la NP"}</span><span className="block text-[11px] text-muted-foreground">La lectura propone datos; nada se confirma automáticamente.</span></span>
          {reading && <Sparkles className="h-4 w-4 animate-pulse text-primary" />}
        </button>
        {previewUrl && <Button type="button" variant="outline" size="sm" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver documento</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Número de NP"><Input value={form.np_numero} onChange={(e) => setForm({ ...form, np_numero: e.target.value })} /></Field><Field label="Fecha"><Input type="date" value={form.np_fecha} onChange={(e) => setForm({ ...form, np_fecha: e.target.value })} />{!form.np_fecha && <p className="text-[10px] text-amber-700">No se pudo confirmar la fecha automáticamente; completala según la NP.</p>}</Field><Field label="Cliente"><Input value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} /></Field><Field label="Operativo comercial"><Input value={form.comercial} onChange={(e) => setForm({ ...form, comercial: e.target.value })} /></Field></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><div><h3 className="text-[13px] font-semibold">Unidades de la NP</h3><p className="text-[10px] text-muted-foreground">La máquina y el cabezal se registran como líneas independientes.</p></div><Button variant="outline" size="sm" onClick={() => setLines((v) => [...v, blankLine(v.length + 1)])}><Plus className="mr-1 h-3.5 w-3.5" />Agregar</Button></div>{lines.map((line, i) => <div key={i} className="rounded-xl border p-3"><div className="mb-2 flex justify-between"><span className="text-[11px] font-medium text-muted-foreground">Línea {i + 1}</span>{lines.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLines((v) => v.filter((_, x) => x !== i).map((l, x) => ({ ...l, linea_numero: x + 1 })))}><X className="h-3.5 w-3.5" /></Button>}</div><div className="grid gap-2 sm:grid-cols-2"><Field label="Marca"><CompactSelect value={line.marca} values={["CLAAS", "HORSCH", "OTROS"]} onChange={(v) => updateLine(i, { marca: v as DraftLine["marca"], modelo: "" })} /></Field><Field label="Tipo"><CompactSelect value={line.subgrupo} values={(MACHINE_SUBGROUPS as readonly string[]).filter((v) => v !== "SUELO")} onChange={(v) => updateLine(i, { subgrupo: v, modelo: "" })} /></Field><Field label="Producto / tipo"><Input value={line.producto} onChange={(e) => updateLine(i, { producto: e.target.value })} /></Field><Field label="Modelo del catálogo"><ModeloMaquinaSelect marca={line.marca} subgrupo={line.subgrupo} value={line.modelo} onValueChange={(modelo) => updateLine(i, { modelo })} /></Field><Field label="Año"><Input type="number" min={1900} max={2200} value={line.anio ?? ""} onChange={(e) => updateLine(i, { anio: e.target.value ? Number(e.target.value) : null })} /></Field><Field label="Cantidad"><Input type="number" min={1} value={line.cantidad} onChange={(e) => updateLine(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} /></Field><Field label="Condición"><CompactSelect value={line.condicion} values={["NUEVA", "USADA"]} onChange={(v) => updateLine(i, { condicion: v as DraftLine["condicion"] })} /></Field><Field label="Abastecimiento"><CompactSelect value={line.abastecimiento} values={["DEFINIR", "STOCK", "IMPORTAR"]} onChange={(v) => updateLine(i, { abastecimiento: v as DraftLine["abastecimiento"] })} /></Field></div>{line.marca === "OTROS" && <p className="mt-2 text-[11px] text-amber-700">Se seguirá en la operación, pero no podrá ingresar al Parque mientras la marca no esté admitida.</p>}</div>)}</div>
      <Field label="Observaciones"><Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Field>
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={saving || reading}>{saving ? "Guardando..." : "Validar y crear"}</Button></ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function OperationDrawer({ operationId, onOpenChange, onChanged }: { operationId: string | null; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const invoiceRef = useRef<HTMLInputElement>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [reading, setReading] = useState(false); const [saving, setSaving] = useState(false);
  const detailQuery = useQuery({
    queryKey: ["machine-operation-detail", operationId], enabled: !!operationId,
    queryFn: async (): Promise<OperationDetail> => {
      const [summary, operation, lines, docs, importation] = await Promise.all([
        db.from("maquinaria_operaciones_resumen").select("*").eq("id", operationId).single(),
        db.from("maquinaria_operaciones").select("observaciones").eq("id", operationId).single(),
        db.from("maquinaria_operacion_lineas").select("*").eq("operacion_id", operationId).order("linea_numero"),
        db.from("maquinaria_documentos").select("*").eq("operacion_id", operationId).order("creado_en"),
        db.from("maquinaria_importaciones_operativas").select("*").eq("operacion_id", operationId).maybeSingle(),
      ]);
      if (summary.error) throw summary.error; if (lines.error) throw lines.error;
      const lineIds = (lines.data ?? []).map((l: any) => l.id);
      const units = lineIds.length ? await db.from("maquinaria_unidades_operacion").select("*").in("linea_id", lineIds).order("numero_unidad") : { data: [] };
      return { ...summary.data, observaciones: operation.data?.observaciones, lines: lines.data ?? [], docs: docs.data ?? [], units: units.data ?? [], importation: importation.data };
    },
  });
  useEffect(() => { setInvoiceFile(null); setInvoiceData(null); }, [operationId]);
  const openDocument = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from("maquinaria-documentos").createSignedUrl(storagePath, 90);
    if (error || !data?.signedUrl) return toast.error("No se pudo abrir el documento");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const chooseInvoice = async (file?: File) => { if (!file) return; setInvoiceFile(file); setReading(true); try { setInvoiceData(await extractDocument(file, "FACTURA_IMPORTACION")); toast.success("Factura leída. Revisá chasis y valor antes de confirmar."); } catch (e: any) { toast.warning(e?.message ?? "No se pudo leer la factura"); setInvoiceData({ factura_fecha: TODAY, chasis: [] }); } finally { setReading(false); } };
  const confirmInvoice = async () => {
    if (!operationId || !invoiceFile || !invoiceData) return;
    setSaving(true);
    try {
      const payload = { proveedor: invoiceData.proveedor || null, factura_numero: invoiceData.factura_numero || null, factura_fecha: invoiceData.factura_fecha || null, moneda: invoiceData.moneda || null, valor_facturado: Number(invoiceData.valor_facturado) || null, estado: "FACTURA_REVISADA", actualizado_en: new Date().toISOString() };
      const existing = detailQuery.data?.importation;
      const result = existing ? await db.from("maquinaria_importaciones_operativas").update(payload).eq("id", existing.id) : await db.from("maquinaria_importaciones_operativas").insert({ operacion_id: operationId, ...payload });
      if (result.error) throw result.error;
      const chassis = Array.isArray(invoiceData.chasis) ? invoiceData.chasis.map((v: unknown) => String(v).trim()).filter(Boolean) : [];
      for (let i = 0; i < chassis.length && i < (detailQuery.data?.units.length ?? 0); i++) { const update = await db.from("maquinaria_unidades_operacion").update({ chasis: chassis[i], estado: "EN_TRANSITO" }).eq("id", detailQuery.data!.units[i].id); if (update.error) throw update.error; }
      await uploadEvidence(invoiceFile, operationId, "FACTURA_IMPORTACION", invoiceData);
      const op = await db.from("maquinaria_operaciones").update({ estado: "EN_IMPORTACION", actualizado_en: new Date().toISOString() }).eq("id", operationId); if (op.error) throw op.error;
      toast.success("Factura validada y vinculada a la operación"); setInvoiceData(null); setInvoiceFile(null); detailQuery.refetch(); onChanged();
    } catch (e: any) { toast.error(e?.message ?? "No se pudo guardar la factura"); } finally { setSaving(false); }
  };
  const detail = detailQuery.data;
  const simpleState = detail ? simpleOrderState(detail.estado) : "PENDIENTE";
  return <ResponsiveDrawer open={!!operationId} onOpenChange={onOpenChange} size="xl">
    <ResponsiveDrawerHeader>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[16px] font-semibold">NP {detail?.np_numero ?? "—"}</h2><p className="text-[11px] text-muted-foreground">{detail?.cliente_nombre ?? "Cargando..."}</p></div>
        {detail && <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={cn("text-[10px]", simpleStateClass(simpleState))}>{SIMPLE_STATE_LABEL[simpleState]}</Badge>
          <span className="text-[10px] text-muted-foreground" title="Etapa real del pedido">{STATE_LABEL[detail.estado] ?? detail.estado}</span>
        </div>}
      </div>
    </ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      {detail && <>
        <KpiStrip className="grid-cols-3"><KpiItem label="Unidades" value={detail.unidades} /><KpiItem label="Documentos" value={detail.documentos} /><KpiItem label="Fecha NP" value={formatDate(detail.np_fecha)} /></KpiStrip>
        <div><h3 className="mb-2 text-[13px] font-semibold">Detalle de máquinas</h3><div className="space-y-2">{detail.lines.map((line) => {
          const extracted = line.datos_extraidos ?? {};
          const model = line.modelo || extracted.modelo;
          const product = line.producto || extracted.producto;
          const year = line.anio ?? extracted.anio;
          const head = line.cabezal || extracted.cabezal;
          const unidadesDeLinea = detail.units.filter((u: any) => u.linea_id === line.id);
          return <div key={line.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[12px] font-medium">{model || product || "Sin descripción"}</div><div className="text-[10px] text-muted-foreground">{[product && product !== model ? product : null, year && `Año ${year}`, head && `Cabezal: ${head}`].filter(Boolean).join(" · ")}</div></div>
              <div className="flex shrink-0 items-center gap-1.5"><Badge variant="outline" className={cn("text-[10px]", brandClass(line.marca))}>{line.marca ?? "OTROS"}</Badge><Badge variant="outline" className={cn("text-[10px]", conditionClass(line.condicion))}>{CONDITION_LABEL[line.condicion] ?? line.condicion}</Badge><Badge variant="outline" className={cn("text-[10px]", supplyClass(line.abastecimiento))}>{SUPPLY_LABEL[line.abastecimiento] ?? line.abastecimiento}</Badge></div>
            </div>
            {unidadesDeLinea.length > 0 && <div className="mt-2 space-y-1 border-t pt-2">{unidadesDeLinea.map((u: any) => <div key={u.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-muted-foreground">{u.chasis || "Sin chasis"}</span>
              <span className="text-muted-foreground">{UNIT_STATE_LABEL[u.estado] ?? u.estado}</span>
            </div>)}</div>}
          </div>;
        })}</div></div>
        <div><h3 className="mb-2 text-[13px] font-semibold">Documentos</h3>{detail.docs.length ? <div className="space-y-1">{detail.docs.map((doc) => <button type="button" key={doc.id} onClick={() => openDocument(doc.storage_path)} className="flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-left text-[11px] hover:bg-muted"><span className="flex min-w-0 items-center gap-2"><Eye className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{doc.archivo_nombre}</span></span><span className="flex items-center gap-2"><Badge variant="outline">{doc.tipo}</Badge><span className="font-medium text-primary">Ver</span></span></button>)}</div> : <p className="text-[11px] text-muted-foreground">Aún no hay documentos adjuntos.</p>}</div>
        {(detail.requiere_importacion || detail.importation) && <div className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-[13px] font-semibold">Factura de importación</h3><p className="text-[11px] text-muted-foreground">Completa chasis y valor facturado; la propuesta siempre requiere confirmación.</p></div><Button variant="outline" size="sm" onClick={() => invoiceRef.current?.click()} disabled={reading}><Upload className="mr-1.5 h-3.5 w-3.5" />{reading ? "Leyendo..." : "Subir factura"}</Button></div><input ref={invoiceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseInvoice(e.target.files?.[0])} />
          {invoiceData && <div className="mt-3 space-y-3 border-t pt-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="Factura"><Input value={invoiceData.factura_numero ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, factura_numero: e.target.value })} /></Field><Field label="Fecha"><Input type="date" value={invoiceData.factura_fecha ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, factura_fecha: e.target.value })} /></Field><Field label="Valor facturado"><Input type="number" value={invoiceData.valor_facturado ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, valor_facturado: e.target.value })} /></Field><Field label="Moneda"><Input value={invoiceData.moneda ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, moneda: e.target.value })} /></Field></div><Field label="Chasis (uno por línea)"><Textarea rows={3} value={(invoiceData.chasis ?? []).join("\n")} onChange={(e) => setInvoiceData({ ...invoiceData, chasis: e.target.value.split("\n") })} /></Field><div className="flex justify-end"><Button size="sm" onClick={confirmInvoice} disabled={saving}>{saving ? "Guardando..." : "Confirmar factura"}</Button></div></div>}
        </div>}
        {detail.observaciones && <div className="rounded-lg bg-muted/40 p-3 text-[11px]">{detail.observaciones}</div>}
      </>}
    </ResponsiveDrawerBody>
    {detail && <ResponsiveDrawerFooter>
      <AttachDocumentButton operationId={operationId} onUploaded={() => detailQuery.refetch()} />
    </ResponsiveDrawerFooter>}
  </ResponsiveDrawer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>; }
function CompactSelect({ value, values, onChange }: { value: string; values: readonly string[]; onChange: (v: string) => void }) { return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{values.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>; }
