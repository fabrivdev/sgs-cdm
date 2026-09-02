/* eslint-disable @typescript-eslint/no-explicit-any -- Las tablas se tipan al regenerar database.types tras aplicar la migración. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileCheck2, FileText, LoaderCircle, Paperclip, PackageCheck, Pencil, Plus, RotateCcw, Save, Ship, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { DetailSection, DocumentRow, EntityCard, KeyValueGrid, KeyValueItem, ProcessStepper } from "@/components/maquinaria/MachineDetailPrimitives";
import { pageShell } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";

const db = supabase as any;
const TODAY = new Date().toISOString().slice(0, 10);
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  const normalized = (marca ?? "").trim().toUpperCase();
  if (normalized === "CLAAS") return "border-marca-claas/30 bg-marca-claas-bg text-marca-claas";
  if (normalized === "HORSCH") return "border-marca-horsch/30 bg-marca-horsch-bg text-marca-horsch";
  return "border-border bg-muted text-muted-foreground";
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
const formatNpCode = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sin NP";
  const code = raw.replace(/^(?:NP[\s._-]*)+/i, "").trim();
  return code ? `NP${code}` : "NP";
};

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

function importStockConfirmed(row: Pick<ImportRow, "stock_sucursal" | "stock_deposito" | "estado_disponibilidad">) {
  return Boolean(row.stock_sucursal || row.stock_deposito || ["DISPONIBLE", "RESERVADO", "VENDIDO_PENDIENTE_ENTREGA"].includes(row.estado_disponibilidad ?? ""));
}

// Situacion comercial (Reservado/Vendido/Stock) -- ya se calcula sola desde
// maquinaria_stock_trazabilidad, se reusa tal cual.
const AVAILABILITY_LABEL: Record<string, string> = {
  DISPONIBLE: "Stock", RESERVADO: "Reservado", VENDIDO_PENDIENTE_ENTREGA: "Vendido · por entregar",
  EN_PARQUE: "En parque", CONFLICTO: "Conflicto", SIN_CHASIS: "Sin chasis", SIN_CONCILIAR: "Sin conciliar",
};
const availabilityClass = (state?: string | null) => cn(
  "text-[10px]",
  state === "DISPONIBLE" && "border-emerald-200 bg-emerald-50 text-emerald-700",
  state === "RESERVADO" && "border-blue-200 bg-blue-50 text-blue-700",
  state === "VENDIDO_PENDIENTE_ENTREGA" && "border-violet-200 bg-violet-50 text-violet-700",
  state === "CONFLICTO" && "border-red-200 bg-red-50 text-red-700",
  state === "SIN_CONCILIAR" && "border-amber-200 bg-amber-50 text-amber-700",
  (!state || state === "SIN_CHASIS" || state === "EN_PARQUE") && "border-slate-200 bg-slate-100 text-slate-600",
);

type OrderRow = {
  id: string; operacion_id: string; np_numero: string | null; np_fecha: string | null; cliente_nombre: string;
  comercial: string | null; marca: string | null; producto: string | null; modelo: string | null; cantidad: number | null;
  condicion: string | null; abastecimiento: string | null; estado_fuente: string | null; estado_operacion: string | null; chasis: string | null;
  estado_disponibilidad: string | null; disponibilidad_detalle: string | null; estado_importacion_fuente: string | null;
  eta: string | null; ata: string | null; proveedor: string | null; factura_venta: string | null; factura_fecha: string | null;
  costo_producto: number | null; valor_venta: number | null; observaciones: string | null; actualizado_en: string;
};
type ImportRow = {
  id: string; importacion_linea_id: string; numero_unidad: number; cantidad_lote: number | null;
  operacion_id: string | null; linea_id: string | null; unidad_id: string | null; np_numero: string | null; np_fecha: string | null;
  cliente_nombre: string | null; comercial: string | null; marca: string | null; producto: string | null; modelo: string | null;
  cantidad: number | null; estado_fuente: string | null; oc: string | null; po: string | null; fecha_pedido: string | null; eta: string | null; ata: string | null;
  llave_interna: string | null;
  proveedor: string | null; invoice_supplier: string | null; factura_proveedor_fecha: string | null; factura_proveedor_moneda: string | null;
  precio_oc: number | null; costo_final_sin_iva: number | null; costo_final: number | null; chasis: string | null;
  venta_facturada: string | null; valor_venta: number | null; situacion_vinculo: string | null; estado_disponibilidad: string | null;
  disponibilidad_detalle: string | null; stock_sucursal: string | null; stock_deposito: string | null; stock_saldo: number | null;
  vinculo_manual: boolean; detalle_manual: boolean;
};
type DraftLine = {
  id?: string;
  linea_numero: number; marca: "CLAAS" | "HORSCH" | "OTROS"; producto: string; modelo: string;
  anio?: number | null; cabezal?: string;
  cantidad: number; condicion: "NUEVA" | "USADA"; abastecimiento: "DEFINIR" | "STOCK" | "IMPORTAR";
  subgrupo: string; chasis: string[]; confianza?: Record<string, unknown>; datos_extraidos?: Record<string, unknown>;
};
type StockAssignmentRow = {
  id: string; producto_codigo: string; marca: string | null; modelo: string | null; sucursal: string | null;
  deposito: string | null; chasis: string | null; saldo_actual: number | null; estado_disponibilidad: string | null;
  disponibilidad_detalle: string | null; unidad_operacion_id: string | null;
};
type ImportAssignmentRow = {
  id: string; importacion_linea_id: string; numero_unidad: number; cantidad_lote: number | null;
  operacion_id: string | null; linea_id: string | null; unidad_id: string | null;
  np_numero: string | null; proveedor: string | null; producto: string | null; modelo: string | null;
  estado_fuente: string | null; oc: string | null; po: string | null; eta: string | null; ata: string | null;
  chasis: string | null; chasis_normalizado?: string | null; situacion_vinculo: string | null; vinculo_manual: boolean;
  invoice_supplier: string | null; factura_proveedor_fecha: string | null; costo_final: number | null;
  asignable?: boolean;
};

function orderBillingState(row: Pick<OrderRow, "estado_operacion" | "estado_fuente">): SimpleOrderState {
  return simpleOrderState(row.estado_operacion || row.estado_fuente);
}
type ImportDraft = {
  marca: "CLAAS" | "HORSCH" | "OTROS"; producto: string; modelo: string;
  cantidad: number; estado_fuente: string; linea_id: string; np_numero: string; llave_interna: string;
  oc: string; fecha_pedido: string; eta: string; notas: string;
};
type AvailableImportNp = {
  operacion_id: string; linea_id: string; np_numero: string; cliente_nombre: string | null;
  marca: "CLAAS" | "HORSCH" | "OTROS"; producto: string | null; modelo: string | null;
  unidades_disponibles: number;
};
type LinkSuggestionRow = {
  unidad_id: string; linea_id: string; operacion_id: string; tipo: "STOCK" | "IMPORTAR";
  recurso_id: string; chasis: string; modelo: string | null; marca: string | null;
  ubicacion: string | null; motivo: string;
};
type OperationDetail = OrderRow & { estado: string; unidades: number; documentos: number; requiere_importacion: boolean; lines: any[]; units: any[]; stock: StockAssignmentRow[]; imports: ImportAssignmentRow[]; suggestions: LinkSuggestionRow[]; docs: any[]; importation?: any };

const blankLine = (n = 1): DraftLine => ({
  linea_numero: n, marca: "CLAAS", producto: "", modelo: "", cantidad: 1,
  anio: null, cabezal: "", condicion: "NUEVA", abastecimiento: "DEFINIR", subgrupo: "OTRO", chasis: [],
});
const blankImport = (): ImportDraft => ({
  marca: "CLAAS", producto: "COSECHADORAS", modelo: "", cantidad: 1,
  estado_fuente: "PLANIFICADA", linea_id: "", np_numero: "", llave_interna: "",
  oc: "", fecha_pedido: "", eta: "", notas: "",
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

type MachineDocumentType = "NP" | "OC" | "FACTURA_IMPORTACION" | "FACTURA_VENTA" | "OTRO";

const MACHINE_DOCUMENT_LABELS: Record<MachineDocumentType, string> = {
  NP: "Nota de pedido",
  OC: "Orden de compra",
  FACTURA_IMPORTACION: "Factura del proveedor",
  FACTURA_VENTA: "Factura al cliente",
  OTRO: "Otro",
};

async function uploadEvidence(file: File, operationId: string, type: MachineDocumentType, extracted: unknown) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sesión no válida");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${auth.user.id}/${operationId}/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await supabase.storage.from("maquinaria-documentos").upload(path, file, { contentType: file.type });
  if (storageError) throw storageError;
  const { data: document, error: docError } = await db.from("maquinaria_documentos").insert({
    operacion_id: operationId, tipo: type, archivo_nombre: file.name, storage_path: path,
    mime_type: file.type, tamano_bytes: file.size, estado_extraccion: "REVISADO",
    datos_extraidos: extracted ?? {}, revisado_por: auth.user.id, revisado_en: new Date().toISOString(),
  }).select("id").single();
  if (docError) throw docError;
  return document;
}

async function uploadImportDocument(file: File, importLineId: string, type: "OC" | "FACTURA_IMPORTACION", operationId?: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sesión no válida");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${auth.user.id}/importaciones/${importLineId}/${type.toLowerCase()}/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await supabase.storage.from("maquinaria-documentos").upload(path, file, { contentType: file.type });
  if (storageError) throw storageError;
  const { error: docError } = await db.from("maquinaria_documentos").insert({
    operacion_id: operationId || null, importacion_linea_id: importLineId, tipo: type,
    archivo_nombre: file.name, storage_path: path, mime_type: file.type,
    tamano_bytes: file.size, estado_extraccion: "REVISADO", datos_extraidos: {},
    revisado_por: auth.user.id, revisado_en: new Date().toISOString(),
  });
  if (docError) throw docError;
}

const MACHINE_DOCUMENT_EVENT = "sig:open-machine-document";
type MachineDocumentRequest = { storagePath: string; fileName: string };
type RenderedMachineDocument = { objectUrl: string; kind: "IMAGE" | "PDF" | "OTHER"; pages: string[] };
const machineDocumentCache = new Map<string, RenderedMachineDocument>();

function openMachineDocument(storagePath: string, fileName = "documento") {
  window.dispatchEvent(new CustomEvent<MachineDocumentRequest>(MACHINE_DOCUMENT_EVENT, { detail: { storagePath, fileName } }));
  return Promise.resolve();
}

function MachineDocumentViewer() {
  const [request, setRequest] = useState<MachineDocumentRequest | null>(null);
  const [rendered, setRendered] = useState<RenderedMachineDocument | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const listener = (event: Event) => setRequest((event as CustomEvent<MachineDocumentRequest>).detail);
    window.addEventListener(MACHINE_DOCUMENT_EVENT, listener);
    return () => window.removeEventListener(MACHINE_DOCUMENT_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!request) return;
    const cacheKey = request.storagePath;
    const cached = machineDocumentCache.get(cacheKey);
    if (cached) {
      setRendered(cached);
      setProgress("");
      setError("");
      return;
    }
    let cancelled = false;
    setRendered(null);
    setError("");
    setProgress("Descargando documento...");
    void (async () => {
      try {
        const { data, error: downloadError } = await supabase.storage.from("maquinaria-documentos").download(request.storagePath);
        if (downloadError || !data) throw downloadError ?? new Error("El archivo no está disponible");
        const objectUrl = URL.createObjectURL(data);
        const normalizedName = request.fileName.toLowerCase();
        const isImage = data.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(normalizedName);
        const isPdf = data.type === "application/pdf" || normalizedName.endsWith(".pdf");
        if (isImage) {
          const result: RenderedMachineDocument = { objectUrl, kind: "IMAGE", pages: [objectUrl] };
          machineDocumentCache.set(cacheKey, result);
          if (!cancelled) { setRendered(result); setProgress(""); }
          return;
        }
        if (!isPdf) {
          const result: RenderedMachineDocument = { objectUrl, kind: "OTHER", pages: [] };
          machineDocumentCache.set(cacheKey, result);
          if (!cancelled) { setRendered(result); setProgress(""); }
          return;
        }
        const pdf = await getDocument({
          data: new Uint8Array(await data.arrayBuffer()),
          isImageDecoderSupported: false,
          isOffscreenCanvasSupported: false,
        }).promise;
        const pages: string[] = [];
        const result: RenderedMachineDocument = { objectUrl, kind: "PDF", pages };
        if (!cancelled) setRendered({ ...result, pages: [] });
        const scale = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (!cancelled) setProgress(`Renderizando página ${pageNumber} de ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("No se pudo preparar la vista del PDF");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
          pages.push(canvas.toDataURL("image/jpeg", 0.92));
          canvas.width = 1;
          canvas.height = 1;
          page.cleanup();
          if (!cancelled) setRendered({ ...result, pages: [...pages] });
        }
        await pdf.destroy();
        machineDocumentCache.set(cacheKey, { ...result, pages: [...pages] });
        if (!cancelled) setProgress("");
      } catch (documentError) {
        console.error("No se pudo preparar el documento", documentError);
        if (!cancelled) { setProgress(""); setError("No se pudo generar la vista previa. Podés intentar nuevamente o descargar el archivo."); }
      }
    })();
    return () => { cancelled = true; };
  }, [request]);

  return <Dialog open={!!request} onOpenChange={(open) => !open && setRequest(null)}>
    <DialogContent className="h-[92vh] w-[96vw] max-w-none gap-0 overflow-hidden p-0 sm:rounded-xl">
      <DialogHeader className="border-b px-5 py-3 pr-24 text-left">
        <DialogTitle className="truncate text-[14px]">{request?.fileName ?? "Documento"}</DialogTitle>
        <DialogDescription className="sr-only">Vista previa del documento seleccionado</DialogDescription>
      </DialogHeader>
      {rendered?.objectUrl && <Button asChild variant="outline" size="sm" className="absolute right-12 top-2.5 h-8"><a href={rendered.objectUrl} download={request?.fileName}><Download className="mr-1.5 h-3.5 w-3.5" />Descargar</a></Button>}
      <div className="min-h-0 overflow-auto bg-slate-600 p-3">
        {progress && rendered?.pages.length ? <div className="sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-[11px] text-white shadow"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />{progress}</div> : null}
        {((!rendered || (progress && !rendered.pages.length)) && !error) && <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-[12px] text-white"><LoaderCircle className="h-4 w-4 animate-spin" />{progress || "Preparando documento..."}</div>}
        {error && <div className="flex h-full min-h-[320px] items-center justify-center text-center text-[12px] text-white">{error}</div>}
        {rendered?.kind === "IMAGE" && <img src={rendered.pages[0]} alt={request?.fileName} className="mx-auto max-h-full max-w-full bg-white object-contain shadow-xl" />}
        {rendered?.kind === "PDF" && <div className="space-y-3">{rendered.pages.map((page, index) => <img key={index} src={page} alt={`Página ${index + 1} de ${request?.fileName}`} className="mx-auto h-auto max-w-full bg-white shadow-xl" />)}</div>}
        {rendered?.kind === "OTHER" && <div className="flex h-full min-h-[320px] items-center justify-center text-center text-[12px] text-white">Este formato no admite vista previa. Usá Descargar para abrirlo en tu equipo.</div>}
      </div>
    </DialogContent>
  </Dialog>;
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
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [importFormOpen, setImportFormOpen] = useState(false);
  const [editingImport, setEditingImport] = useState<ImportRow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportRow | null>(null);

  // Los filtros son independientes por pantalla: cambiar de pestaña no debe
  // arrastrar un filtro que no existe del otro lado.
  useEffect(() => { setSearch(""); }, [importsView]);

  const operationsQuery = useQuery({
    queryKey: ["machine-operations", importsView ? "imports" : "orders"],
    queryFn: async () => {
      const table = importsView ? "maquinaria_importacion_unidades_operativas" : "maquinaria_pedidos_lineas_estado_actual";
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
      if (orderState !== "TODOS" && orderBillingState(orderRow) !== orderState) return false;
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
      pendientes: orderRows.filter((row) => orderBillingState(row) === "PENDIENTE").length,
      facturados: orderRows.filter((row) => orderBillingState(row) === "COMPLETADO").length,
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
      actions={importsView
        ? <Button size="sm" onClick={() => { setEditingImport(null); setImportFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Nueva importación</Button>
        : <Button size="sm" onClick={() => { setEditingOperationId(null); setNewOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Nuevo pedido</Button>}
    />
    {importsView ? (
      <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiItem label="Máquinas importadas" value={importTotals.total} icon={<Ship />} tone="info" />
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
                <span className="font-mono text-[12px] font-semibold">{importRow.llave_interna || (importRow.oc ? `OC ${importRow.oc}` : "Sin llave interna")}</span>
                <Badge variant="outline" className={cn("text-[10px]", arrivalClass(arrival))}>{ARRIVAL_LABEL[arrival]}</Badge>
              </div>
              <div className="mt-2 text-[13px] font-medium">{row.producto || row.modelo || "Sin descripción"}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.modelo && row.modelo !== row.producto ? row.modelo : ""}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("text-[10px]", brandClass(importRow.marca || importRow.proveedor))}>{importRow.marca || importRow.proveedor || "OTROS"}</Badge>
                <Badge variant="outline" className="text-[10px]">Unidad {importRow.numero_unidad}/{Math.max(1, Number(importRow.cantidad_lote) || 1)}</Badge>
                {importRow.estado_disponibilidad && <Badge variant="outline" className={availabilityClass(importRow.estado_disponibilidad)}>{AVAILABILITY_LABEL[importRow.estado_disponibilidad] ?? importRow.estado_disponibilidad}</Badge>}
              </div>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">{row.chasis || "Sin chasis"}</div>
            </button>;
          }
          const orderRow = row as OrderRow;
          const state = orderBillingState(orderRow);
          const orderUnit = entregaByUnitId?.get(orderRow.id);
          const entregaState = entregaStateFromUnit(orderUnit?.estado, orderUnit?.chasis, orderRow.marca, estadoByOperacionId?.get(orderRow.operacion_id), stockChasisSet);
          return <button type="button" key={row.id} onClick={() => setSelected(orderRow.operacion_id)} className="w-full rounded-xl border bg-card p-3 text-left">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[12px] font-semibold">{formatNpCode(row.np_numero)}</span>
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
    <NewOperationDrawer operationId={editingOperationId} open={newOpen} onOpenChange={(open) => { setNewOpen(open); if (!open) setEditingOperationId(null); }} onSaved={() => queryClient.invalidateQueries({ queryKey: ["machine-operations"] })} />
    <OperationDrawer operationId={selected} onOpenChange={(open) => !open && setSelected(null)} onEdit={(id) => { setSelected(null); setEditingOperationId(id); setNewOpen(true); }} onChanged={() => { queryClient.invalidateQueries({ queryKey: ["machine-operations"] }); queryClient.invalidateQueries({ queryKey: ["machine-operations-entrega"] }); }} />
    <ImportFormDrawer
      open={importFormOpen}
      row={editingImport}
      onOpenChange={(open) => { setImportFormOpen(open); if (!open) setEditingImport(null); }}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ["machine-operations", "imports"] })}
    />
    <ImportDetailDrawer
      row={selectedImport}
      onEditHeader={(importRow) => { setSelectedImport(null); setEditingImport(importRow); setImportFormOpen(true); }}
      onOpenChange={(open) => !open && setSelectedImport(null)}
      onSaved={() => {
        setSelectedImport(null);
        queryClient.invalidateQueries({ queryKey: ["machine-operations", "imports"] });
      }}
    />
    <MachineDocumentViewer />
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
      const state = orderBillingState(row);
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
      <TableHead>Llave interna</TableHead>
      <TableHead>OC</TableHead>
      <TableHead>Marca / proveedor</TableHead>
      <TableHead>Máquina</TableHead>
      <TableHead>Modelo</TableHead>
      <TableHead>Unidad</TableHead>
      <TableHead>Fecha pedido</TableHead>
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
        <TableCell className="font-mono font-semibold">{row.llave_interna || "—"}</TableCell>
        <TableCell className="font-mono font-medium">{row.oc || "—"}</TableCell>
        <TableCell><Badge variant="outline" className={cn("text-[10px]", brandClass(row.marca || row.proveedor))}>{row.marca || row.proveedor || "OTROS"}</Badge></TableCell>
        <TableCell className="max-w-[200px] truncate">{row.producto || "—"}</TableCell>
        <TableCell className="max-w-[200px] truncate font-medium">{row.modelo || "—"}</TableCell>
        <TableCell className="whitespace-nowrap tabular-nums">{row.numero_unidad}/{Math.max(1, Number(row.cantidad_lote) || 1)}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(row.fecha_pedido)}</TableCell>
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

/** Adjunta un documento comercial con un tipo explicito a un pedido. */
function AttachOrderDocumentButton({ operationId, type, label, onUploaded }: { operationId: string | null; type: "NP" | "FACTURA_VENTA"; label: string; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (file?: File) => {
    if (!file || !operationId) return;
    setBusy(true);
    try {
      await uploadEvidence(file, operationId, type, {});
      toast.success(`${label} adjuntada`);
      onUploaded();
    } catch (error: any) {
      toast.error(error?.message ?? `No se pudo adjuntar ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return <>
    <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    <Button
      variant="outline" size="sm" disabled={busy || !operationId}
      onClick={() => fileRef.current?.click()}
    >
      <Paperclip className="mr-1.5 h-3.5 w-3.5" />{busy ? "Subiendo..." : label}
    </Button>
  </>;
}

function ImportFormDrawer({ open, row, onOpenChange, onSaved }: { open: boolean; row: ImportRow | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<ImportDraft>(blankImport());
  const [saving, setSaving] = useState(false);
  const [ocFile, setOcFile] = useState<File | null>(null);
  const ocFileRef = useRef<HTMLInputElement>(null);
  const importLineId = row?.importacion_linea_id ?? null;
  const availableNpQuery = useQuery({
    queryKey: ["machine-import-available-nps", importLineId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("maquinaria_importacion_np_disponibles").select("*").order("np_numero");
      if (error) throw error;
      return (data ?? []) as AvailableImportNp[];
    },
  });
  const ocDocumentsQuery = useQuery({
    queryKey: ["machine-import-oc-documents", importLineId],
    enabled: open && Boolean(importLineId),
    queryFn: async () => {
      const { data, error } = await db.from("maquinaria_documentos")
        .select("id,archivo_nombre,storage_path,creado_en")
        .eq("importacion_linea_id", importLineId)
        .eq("tipo", "OC")
        .order("creado_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const npOptions = useMemo(() => {
    const options = [...(availableNpQuery.data ?? [])];
    if (row?.linea_id && row.np_numero && !options.some((option) => option.linea_id === row.linea_id)) {
      options.unshift({
        operacion_id: row.operacion_id ?? "", linea_id: row.linea_id, np_numero: row.np_numero,
        cliente_nombre: row.cliente_nombre, marca: safeMarca(row.marca), producto: row.producto,
        modelo: row.modelo, unidades_disponibles: Math.max(1, Number(row.cantidad_lote) || 1),
      });
    }
    return options;
  }, [availableNpQuery.data, row]);
  const selectedNp = npOptions.find((option) => option.linea_id === form.linea_id);
  useEffect(() => {
    if (!open) return;
    setOcFile(null);
    setForm(row ? {
      marca: safeMarca(row.marca), producto: safeSubgroup(row.producto),
      modelo: row.modelo ?? "", cantidad: Math.max(1, Number(row.cantidad_lote) || 1),
      estado_fuente: row.estado_fuente ?? "PLANIFICADA", linea_id: row.linea_id ?? "", np_numero: row.np_numero ?? "",
      llave_interna: row.llave_interna ?? "", oc: row.oc ?? "", fecha_pedido: row.fecha_pedido ?? "",
      eta: row.eta ?? "", notas: (row as any).notas ?? "",
    } : blankImport());
  }, [open, row]);
  const selectNp = (lineId: string) => {
    if (lineId === "NONE") {
      setForm((value) => ({ ...value, linea_id: "", np_numero: "" }));
      return;
    }
    const option = npOptions.find((candidate) => candidate.linea_id === lineId);
    if (!option) return;
    setForm((value) => ({
      ...value, linea_id: option.linea_id, np_numero: option.np_numero,
      marca: safeMarca(option.marca), producto: safeSubgroup(option.producto), modelo: option.modelo ?? "",
      cantidad: Math.min(value.cantidad, Math.max(1, Number(option.unidades_disponibles) || 1)),
    }));
  };
  const save = async () => {
    if (!form.llave_interna.trim()) return toast.error("Ingresá la llave interna");
    if (!form.producto || !form.modelo) return toast.error("Seleccioná el producto y el modelo");
    setSaving(true);
    try {
      const { data: savedId, error } = await db.rpc("maquinaria_guardar_importacion", {
        p_importacion_id: row?.importacion_linea_id ?? null,
        p_datos: form,
      });
      if (error) throw error;
      if (ocFile) {
        try {
          await uploadImportDocument(ocFile, savedId, "OC", npOptions.find((option) => option.linea_id === form.linea_id)?.operacion_id ?? row?.operacion_id);
        } catch (uploadError: any) {
          toast.warning(`La importación se guardó, pero la OC no pudo subirse: ${uploadError?.message ?? "error desconocido"}`);
        }
      }
      toast.success(row ? "Importación actualizada" : "Importación creada y desglosada por unidad");
      onSaved(); onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la importación");
    } finally {
      setSaving(false);
    }
  };
  return <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="lg">
    <ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">{row ? "Editar importación" : "Nueva importación"}</h2><p className="text-[11px] text-muted-foreground">La cantidad se desglosa automáticamente en máquinas físicas independientes.</p></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Llave interna *"><Input autoFocus value={form.llave_interna} onChange={(event) => setForm((value) => ({ ...value, llave_interna: event.target.value }))} placeholder="Ej. 26.61L2" /></Field>
        <Field label="Marca / proveedor"><CompactSelect value={form.marca} values={["CLAAS", "HORSCH", "OTROS"]} disabled={Boolean(selectedNp)} onChange={(marca) => setForm((value) => ({ ...value, marca: marca as ImportDraft["marca"], modelo: "" }))} /></Field>
        <Field label="Producto / tipo"><CompactSelect value={form.producto} values={(MACHINE_SUBGROUPS as readonly string[]).filter((value) => value !== "SUELO")} disabled={Boolean(selectedNp)} onChange={(producto) => setForm((value) => ({ ...value, producto, modelo: "" }))} /></Field>
        <Field label="Modelo"><ModeloMaquinaSelect marca={form.marca} subgrupo={form.producto} value={form.modelo} onValueChange={(modelo) => setForm((value) => ({ ...value, modelo }))} allowCustom={false} disabled={Boolean(selectedNp)} /></Field>
        <Field label="Cantidad"><Input type="number" min={1} max={selectedNp?.unidades_disponibles ?? 500} value={form.cantidad} onChange={(event) => setForm((value) => ({ ...value, cantidad: Math.min(selectedNp?.unidades_disponibles ?? 500, Math.max(1, Number(event.target.value) || 1)) }))} /></Field>
        <Field label="Estado"><Select value={form.estado_fuente} onValueChange={(estado_fuente) => setForm((value) => ({ ...value, estado_fuente }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PLANIFICADA">Planificada</SelectItem><SelectItem value="PEDIDA">Pedida</SelectItem><SelectItem value="EN_TRANSITO">En tránsito</SelectItem><SelectItem value="RECIBIDA">Recibida</SelectItem><SelectItem value="CANCELADA">Cancelada</SelectItem></SelectContent></Select></Field>
        <Field label="NP de referencia"><Select value={form.linea_id || "NONE"} onValueChange={selectNp}><SelectTrigger><SelectValue placeholder={availableNpQuery.isLoading ? "Cargando NP..." : "Seleccionar NP disponible"} /></SelectTrigger><SelectContent><SelectItem value="NONE">Sin NP asignada</SelectItem>{npOptions.map((option) => <SelectItem key={option.linea_id} value={option.linea_id}>{formatNpCode(option.np_numero)} · {option.modelo || option.producto} · {option.unidades_disponibles} libre{option.unidades_disponibles === 1 ? "" : "s"}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="OC"><Input value={form.oc} onChange={(event) => setForm((value) => ({ ...value, oc: event.target.value }))} /></Field>
        <Field label="Fecha de pedido"><Input type="date" value={form.fecha_pedido} onChange={(event) => setForm((value) => ({ ...value, fecha_pedido: event.target.value }))} /></Field>
        <Field label="Embarque estimado"><Input type="date" value={form.eta} onChange={(event) => setForm((value) => ({ ...value, eta: event.target.value }))} /></Field>
      </div>
      <section className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[12px] font-semibold">Documento de OC</h3><p className="text-[10px] text-muted-foreground">PDF o imagen de la orden de compra.</p></div><><input ref={ocFileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setOcFile(event.target.files?.[0] ?? null)} /><Button type="button" variant="outline" size="sm" onClick={() => ocFileRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />{ocFile ? "Cambiar archivo" : "Subir OC"}</Button></></div>{ocFile && <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-[11px]"><span className="truncate">{ocFile.name}</span><Button type="button" variant="ghost" size="sm" onClick={() => setOcFile(null)}>Quitar</Button></div>}{ocDocumentsQuery.data?.map((document: any) => <button type="button" key={document.id} onClick={() => openMachineDocument(document.storage_path, document.archivo_nombre).catch((error) => toast.error(error?.message ?? "No se pudo abrir la OC"))} className="mt-2 flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-left text-[11px] hover:bg-muted"><span className="flex min-w-0 items-center gap-2"><Eye className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{document.archivo_nombre}</span></span><span className="font-medium text-primary">Ver OC</span></button>)}</section>
      <Field label="Notas"><Textarea rows={3} value={form.notas} onChange={(event) => setForm((value) => ({ ...value, notas: event.target.value }))} /></Field>
      {row && <p className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">Los chasis, facturas, costos y fechas de arribo se editan por cada máquina física desde su detalle.</p>}
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando..." : row ? "Guardar cambios" : "Crear importación"}</Button></ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function ImportDetailDrawer({ row, onOpenChange, onEditHeader, onSaved }: { row: ImportRow | null; onOpenChange: (open: boolean) => void; onEditHeader: (row: ImportRow) => void; onSaved: () => void }) {
  const { isAdmin, roles } = useAuth();
  const canEdit = isAdmin || roles.includes("jefatura");
  const [activeTab, setActiveTab] = useState("resumen");
  const [editingChassis, setEditingChassis] = useState(false);
  const [editingImportData, setEditingImportData] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [reversingReceipt, setReversingReceipt] = useState(false);
  const [uploadingOc, setUploadingOc] = useState(false);
  const [uploadingSupplierInvoice, setUploadingSupplierInvoice] = useState(false);
  const detailOcRef = useRef<HTMLInputElement>(null);
  const detailSupplierInvoiceRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ chasis: "", eta: "", invoice_supplier: "", factura_proveedor_fecha: "", factura_proveedor_moneda: "USD", costo_final_sin_iva: "", costo_final: "" });
  const [receipt, setReceipt] = useState({ fecha: TODAY });
  const detailOcQuery = useQuery({
    queryKey: ["machine-import-oc-documents", row?.importacion_linea_id], enabled: Boolean(row?.importacion_linea_id),
    queryFn: async () => {
      const { data, error } = await db.from("maquinaria_documentos").select("id,archivo_nombre,storage_path,creado_en").eq("importacion_linea_id", row?.importacion_linea_id).eq("tipo", "OC").order("creado_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const detailSupplierInvoiceQuery = useQuery({
    queryKey: ["machine-import-supplier-invoice-documents", row?.importacion_linea_id], enabled: Boolean(row?.importacion_linea_id),
    queryFn: async () => {
      const { data, error } = await db.from("maquinaria_documentos").select("id,archivo_nombre,storage_path,creado_en").eq("importacion_linea_id", row?.importacion_linea_id).eq("tipo", "FACTURA_IMPORTACION").order("creado_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    setActiveTab("resumen");
    setEditingChassis(false); setEditingImportData(false); setEditingInvoice(false); setEditingReceipt(false);
    setForm({ chasis: row?.chasis ?? "", eta: row?.eta ?? "", invoice_supplier: row?.invoice_supplier ?? "", factura_proveedor_fecha: row?.factura_proveedor_fecha ?? "", factura_proveedor_moneda: row?.factura_proveedor_moneda ?? "USD", costo_final_sin_iva: row?.costo_final_sin_iva == null ? "" : String(row.costo_final_sin_iva), costo_final: row?.costo_final == null ? "" : String(row.costo_final) });
    setReceipt({ fecha: row?.ata ?? TODAY });
  }, [row?.id, row?.chasis, row?.eta, row?.ata, row?.invoice_supplier, row?.factura_proveedor_fecha, row?.factura_proveedor_moneda, row?.costo_final_sin_iva, row?.costo_final]);
  if (!row) return null;
  const arrival = arrivalState(row);
  const stockConfirmed = importStockConfirmed(row);
  const progressIndex = stockConfirmed ? 3 : row.ata || arrival === "COMPLETADO" ? 2 : arrival === "EN_TRANSITO" ? 1 : 0;
  const closeEditors = () => { setEditingChassis(false); setEditingImportData(false); setEditingInvoice(false); };
  const uploadOc = async (file?: File) => {
    if (!file) return;
    setUploadingOc(true);
    try { await uploadImportDocument(file, row.importacion_linea_id, "OC", row.operacion_id); await detailOcQuery.refetch(); toast.success("Documento de OC adjuntado"); }
    catch (error: any) { toast.error(error?.message ?? "No se pudo adjuntar la OC"); }
    finally { setUploadingOc(false); if (detailOcRef.current) detailOcRef.current.value = ""; }
  };
  const uploadSupplierInvoice = async (file?: File) => {
    if (!file) return;
    setUploadingSupplierInvoice(true);
    try { await uploadImportDocument(file, row.importacion_linea_id, "FACTURA_IMPORTACION", row.operacion_id); await detailSupplierInvoiceQuery.refetch(); toast.success("Factura del proveedor adjuntada"); }
    catch (error: any) { toast.error(error?.message ?? "No se pudo adjuntar la factura del proveedor"); }
    finally { setUploadingSupplierInvoice(false); if (detailSupplierInvoiceRef.current) detailSupplierInvoiceRef.current.value = ""; }
  };
  const saveUnit = async () => {
    setSaving(true);
    try {
      const { error } = await db.from("maquinaria_importacion_unidades").update({ chasis: form.chasis.trim() || null, eta: form.eta || null, invoice_supplier: form.invoice_supplier.trim() || null, factura_proveedor_fecha: form.factura_proveedor_fecha || null, factura_proveedor_moneda: form.factura_proveedor_moneda || null, costo_final_sin_iva: form.costo_final_sin_iva === "" ? null : Number(form.costo_final_sin_iva), costo_final: form.costo_final === "" ? null : Number(form.costo_final), detalle_manual: true, actualizado_en: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      toast.success("Datos actualizados"); closeEditors(); onSaved();
    } catch (error: any) { toast.error(error?.message ?? "No se pudo actualizar la máquina importada"); }
    finally { setSaving(false); }
  };
  const receiveUnit = async () => {
    setReceiving(true);
    try {
      const { data, error } = await db.rpc("maquinaria_recibir_unidad_importacion", { p_importacion_unidad_id: row.id, p_fecha: receipt.fecha });
      if (error) throw error;
      toast.success(data?.stock_confirmado ? "Arribo registrado y chasis confirmado en stock" : "Arribo registrado; pendiente de confirmación en stock");
      setEditingReceipt(false); onSaved();
    } catch (error: any) { toast.error(error?.message ?? "No se pudo registrar la recepción"); }
    finally { setReceiving(false); }
  };
  const reverseReceipt = async () => {
    setReversingReceipt(true);
    try {
      const { data, error } = await db.rpc("maquinaria_anular_recepcion_importacion", { p_importacion_unidad_id: row.id });
      if (error) throw error;
      toast.success(data?.chasis_liberado ? `Recepción anulada; chasis ${data.chasis_liberado} liberado` : "Recepción anulada");
      onSaved();
    } catch (error: any) { toast.error(error?.message ?? "No se pudo anular la recepción"); }
    finally { setReversingReceipt(false); }
  };
  const ocDocuments = detailOcQuery.data ?? [];
  const supplierDocuments = detailSupplierInvoiceQuery.data ?? [];
  return <ResponsiveDrawer open onOpenChange={onOpenChange} size="lg">
    <ResponsiveDrawerHeader><div className="flex items-start justify-between gap-3"><div><h2 className="text-[16px] font-semibold">{row.modelo || row.producto || "Importación"}</h2><p className="text-[11px] text-muted-foreground">{[row.producto, row.marca, `Unidad ${row.numero_unidad}/${Math.max(1, Number(row.cantidad_lote) || 1)}`].filter(Boolean).join(" · ")}</p></div><div className="flex flex-col items-end gap-1"><Badge variant="outline" className={cn("text-[10px]", arrivalClass(arrival))}>{ARRIVAL_LABEL[arrival]}</Badge>{row.estado_disponibilidad && <span className="text-[10px] text-muted-foreground">{AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad}</span>}</div></div></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <ProcessStepper steps={["Planificada", "En tránsito", "Recibida", "Stock"]} currentIndex={progressIndex} pulseCurrent={!stockConfirmed} />
        <TabsList className="grid h-auto w-full grid-cols-4"><TabsTrigger value="resumen" className="px-2 text-[11px]">Resumen</TabsTrigger><TabsTrigger value="pedido" className="px-2 text-[11px]">Pedido</TabsTrigger><TabsTrigger value="documentos" className="px-2 text-[11px]">Documentos</TabsTrigger><TabsTrigger value="recepcion" className="px-2 text-[11px]">Recepción</TabsTrigger></TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <DetailSection title="Máquina" action={canEdit && !editingChassis ? <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditingChassis(true)}><Pencil className="mr-1.5 h-3 w-3" />{row.chasis ? "Cambiar chasis" : "Asignar chasis"}</Button> : undefined}>
            <EntityCard><div className="mb-3"><div className="text-[13px] font-semibold">{row.modelo || row.producto || "Sin modelo"}</div><div className="text-[10px] text-muted-foreground">{[row.producto, row.marca].filter(Boolean).join(" · ")}</div></div>{editingChassis ? <div className="flex items-end gap-2 border-t pt-3"><Field label="Chasis"><Input autoFocus value={form.chasis} onChange={(event) => setForm((value) => ({ ...value, chasis: event.target.value }))} /></Field><Button variant="outline" size="sm" onClick={() => { setForm((value) => ({ ...value, chasis: row.chasis ?? "" })); setEditingChassis(false); }}>Cancelar</Button><Button size="sm" onClick={saveUnit} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />Guardar</Button></div> : <KeyValueGrid className="border-t pt-3"><KeyValueItem label="Llave interna" value={row.llave_interna} /><KeyValueItem label="Unidad del lote" value={`${row.numero_unidad}/${Math.max(1, Number(row.cantidad_lote) || 1)}`} /><KeyValueItem label="Chasis" value={row.chasis} empty="Sin asignar" mono /></KeyValueGrid>}</EntityCard>
          </DetailSection>
          <DetailSection title="Importación" action={canEdit && !editingImportData ? <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditingImportData(true)}><Pencil className="mr-1.5 h-3 w-3" />Editar datos</Button> : undefined}>
            {editingImportData ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Embarque estimado"><Input type="date" value={form.eta} onChange={(event) => setForm((value) => ({ ...value, eta: event.target.value }))} /></Field><Field label="Costo sin IVA"><Input type="number" value={form.costo_final_sin_iva} onChange={(event) => setForm((value) => ({ ...value, costo_final_sin_iva: event.target.value }))} /></Field><Field label="Costo final"><Input type="number" value={form.costo_final} onChange={(event) => setForm((value) => ({ ...value, costo_final: event.target.value }))} /></Field></div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setForm((value) => ({ ...value, eta: row.eta ?? "", costo_final_sin_iva: row.costo_final_sin_iva == null ? "" : String(row.costo_final_sin_iva), costo_final: row.costo_final == null ? "" : String(row.costo_final) })); setEditingImportData(false); }}>Cancelar</Button><Button size="sm" onClick={saveUnit} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />Guardar</Button></div></div> : <KeyValueGrid><KeyValueItem label="OC" value={row.oc} empty="Sin asignar" mono /><KeyValueItem label="Estado" value={ARRIVAL_LABEL[arrival]} /><KeyValueItem label="Fecha de pedido" value={formatDate(row.fecha_pedido)} /><KeyValueItem label="Embarque estimado" value={formatDate(row.eta)} empty="Pendiente" /><KeyValueItem label="Valor OC" value={row.precio_oc != null ? formatUsd(row.precio_oc) : null} /><KeyValueItem label="Costo sin IVA" value={row.costo_final_sin_iva != null ? formatUsd(row.costo_final_sin_iva) : null} /><KeyValueItem label="Costo final" value={row.costo_final != null ? formatUsd(row.costo_final) : null} /><KeyValueItem label="Venta facturada" value={row.venta_facturada} empty="No" /><KeyValueItem label="Valor de venta" value={row.valor_venta != null ? formatUsd(row.valor_venta) : null} /></KeyValueGrid>}
          </DetailSection>
          {(row.stock_sucursal || row.stock_deposito || row.disponibilidad_detalle) && <DetailSection title="Stock vinculado"><KeyValueGrid><KeyValueItem label="Sucursal" value={row.stock_sucursal} /><KeyValueItem label="Depósito" value={row.stock_deposito} /><KeyValueItem label="Saldo" value={row.stock_saldo} /><KeyValueItem label="Estado" value={row.disponibilidad_detalle} /></KeyValueGrid></DetailSection>}
        </TabsContent>

        <TabsContent value="pedido" className="space-y-4">
          <DetailSection title="Pedido vinculado" action={canEdit ? <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onEditHeader(row)}><Pencil className="mr-1.5 h-3 w-3" />{row.np_numero ? "Cambiar" : "Vincular"}</Button> : undefined}>
            {row.np_numero ? <EntityCard><div className="mb-3"><div className="text-[13px] font-semibold">{formatNpCode(row.np_numero)}</div><div className="text-[10px] text-muted-foreground">{row.cliente_nombre || "Cliente no informado"}</div></div><KeyValueGrid className="border-t pt-3"><KeyValueItem label="Comercial" value={row.comercial} /><KeyValueItem label="Fecha NP" value={formatDate(row.np_fecha)} /><KeyValueItem label="Estado del vínculo" value={row.situacion_vinculo} empty="Vinculado" /></KeyValueGrid></EntityCard> : <div className="py-4 text-[11px] text-muted-foreground">Esta máquina todavía no tiene un pedido vinculado.</div>}
          </DetailSection>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          <input ref={detailOcRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => uploadOc(event.target.files?.[0])} />
          <input ref={detailSupplierInvoiceRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => uploadSupplierInvoice(event.target.files?.[0])} />
          <DetailSection title="Documentos de importación">
            <div>{ocDocuments.length ? ocDocuments.map((document: any, index: number) => <DocumentRow key={document.id} label={index ? "Orden de compra adicional" : "Orden de compra"} fileName={document.archivo_nombre} date={formatDate(document.creado_en)} onOpen={() => openMachineDocument(document.storage_path, document.archivo_nombre).catch((error) => toast.error(error?.message ?? "No se pudo abrir la OC"))} />) : <DocumentRow label="Orden de compra" action={canEdit ? <Button variant="outline" size="sm" disabled={uploadingOc} onClick={() => detailOcRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Adjuntar</Button> : undefined} />}{ocDocuments.length > 0 && canEdit && <div className="flex justify-end"><Button variant="ghost" size="sm" disabled={uploadingOc} onClick={() => detailOcRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Adjuntar otra OC</Button></div>}</div>
            <div>{supplierDocuments.length ? supplierDocuments.map((document: any, index: number) => <DocumentRow key={document.id} label={index ? "Factura adicional" : "Factura del proveedor"} fileName={document.archivo_nombre} date={formatDate(document.creado_en)} onOpen={() => openMachineDocument(document.storage_path, document.archivo_nombre).catch((error) => toast.error(error?.message ?? "No se pudo abrir la factura"))} />) : <DocumentRow label="Factura del proveedor" action={canEdit ? <Button variant="outline" size="sm" disabled={uploadingSupplierInvoice} onClick={() => detailSupplierInvoiceRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Adjuntar</Button> : undefined} />}</div>
          </DetailSection>
          <DetailSection title="Datos de la factura" action={canEdit && !editingInvoice ? <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditingInvoice(true)}><Pencil className="mr-1.5 h-3 w-3" />Editar</Button> : undefined}>
            {editingInvoice ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Número de factura"><Input value={form.invoice_supplier} onChange={(event) => setForm((value) => ({ ...value, invoice_supplier: event.target.value }))} /></Field><Field label="Fecha de factura"><Input type="date" value={form.factura_proveedor_fecha} onChange={(event) => setForm((value) => ({ ...value, factura_proveedor_fecha: event.target.value }))} /></Field><Field label="Moneda"><CompactSelect value={form.factura_proveedor_moneda} values={["USD", "EUR", "PYG"]} onChange={(factura_proveedor_moneda) => setForm((value) => ({ ...value, factura_proveedor_moneda }))} /></Field><Field label="Valor sin IVA"><Input type="number" value={form.costo_final_sin_iva} onChange={(event) => setForm((value) => ({ ...value, costo_final_sin_iva: event.target.value }))} /></Field><Field label="Valor facturado"><Input type="number" value={form.costo_final} onChange={(event) => setForm((value) => ({ ...value, costo_final: event.target.value }))} /></Field></div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setForm((value) => ({ ...value, invoice_supplier: row.invoice_supplier ?? "", factura_proveedor_fecha: row.factura_proveedor_fecha ?? "", factura_proveedor_moneda: row.factura_proveedor_moneda ?? "USD", costo_final_sin_iva: row.costo_final_sin_iva == null ? "" : String(row.costo_final_sin_iva), costo_final: row.costo_final == null ? "" : String(row.costo_final) })); setEditingInvoice(false); }}>Cancelar</Button><Button size="sm" onClick={saveUnit} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />Guardar</Button></div></div> : <KeyValueGrid><KeyValueItem label="Número" value={row.invoice_supplier} empty="Pendiente" mono /><KeyValueItem label="Fecha" value={formatDate(row.factura_proveedor_fecha)} empty="Pendiente" /><KeyValueItem label="Moneda" value={row.factura_proveedor_moneda} empty="Pendiente" /><KeyValueItem label="Valor sin IVA" value={row.costo_final_sin_iva != null ? formatUsd(row.costo_final_sin_iva) : null} empty="Pendiente" /><KeyValueItem label="Valor" value={row.costo_final != null ? formatUsd(row.costo_final) : null} empty="Pendiente" /></KeyValueGrid>}
          </DetailSection>
        </TabsContent>

        <TabsContent value="recepcion" className="space-y-4">
          <DetailSection title="Recepción">
            <KeyValueGrid><KeyValueItem label="Chasis" value={row.chasis} empty="Sin asignar" mono /><KeyValueItem label="Fecha de arribo" value={formatDate(row.ata)} empty="Pendiente" /><KeyValueItem label="Estado en stock" value={stockConfirmed ? (AVAILABILITY_LABEL[row.estado_disponibilidad ?? ""] ?? "Confirmado") : "Pendiente de confirmación"} /></KeyValueGrid>
          </DetailSection>
          {canEdit && (editingReceipt || !row.ata) ? <div className="space-y-3 border-t pt-4"><div className="max-w-xs"><Field label="Fecha de arribo"><Input type="date" value={receipt.fecha} onChange={(event) => setReceipt({ fecha: event.target.value })} /></Field></div>{!row.chasis && <p className="text-[10px] text-amber-700">Asigná el chasis antes de registrar el arribo.</p>}<div className="flex gap-2">{row.ata && <Button variant="outline" size="sm" onClick={() => { setReceipt({ fecha: row.ata ?? TODAY }); setEditingReceipt(false); }}>Cancelar</Button>}<Button size="sm" onClick={receiveUnit} disabled={receiving || !row.chasis || !receipt.fecha}><PackageCheck className="mr-1.5 h-3.5 w-3.5" />{receiving ? "Registrando..." : "Registrar arribo"}</Button></div></div> : canEdit && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setEditingReceipt(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Modificar arribo</Button>{!stockConfirmed && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Anular recepción</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Anular esta recepción</AlertDialogTitle><AlertDialogDescription>Se quitarán la fecha de arribo y el chasis de esta unidad para que puedas recibir la máquina correcta. La OC, la factura del proveedor y el pedido vinculado se conservarán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={reversingReceipt} onClick={reverseReceipt}>{reversingReceipt ? "Anulando..." : "Anular recepción"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>}
          {row.ata && !stockConfirmed && <p className="text-[10px] text-muted-foreground">El arribo está registrado. La máquina ingresará al stock cuando el chasis coincida con el archivo importado del sistema.</p>}
          {row.ata && stockConfirmed && <p className="text-[10px] text-muted-foreground">La recepción ya fue confirmada por el stock físico. Para anularla, primero hay que corregir ese registro de stock.</p>}
        </TabsContent>
      </Tabs>
    </ResponsiveDrawerBody>
    {canEdit && <ResponsiveDrawerFooter><Button variant="outline" size="sm" onClick={() => onEditHeader(row)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar importación</Button></ResponsiveDrawerFooter>}
  </ResponsiveDrawer>;
}

function NewOperationDrawer({ operationId, open, onOpenChange, onSaved }: { operationId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<any>({});
  const [form, setForm] = useState({ np_numero: "", np_fecha: "", cliente_nombre: "", comercial: "", observaciones: "" });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const editQuery = useQuery({
    queryKey: ["machine-operation-edit", operationId],
    enabled: open && !!operationId,
    queryFn: async () => {
      const [operation, summary, existingLines] = await Promise.all([
        db.from("maquinaria_operaciones").select("id,np_numero,np_fecha,cliente_id,cliente_nombre,comercial,observaciones").eq("id", operationId).single(),
        db.from("maquinaria_operaciones_resumen").select("cliente_nombre").eq("id", operationId).single(),
        db.from("maquinaria_operacion_lineas").select("*").eq("operacion_id", operationId).order("linea_numero"),
      ]);
      if (operation.error) throw operation.error;
      if (existingLines.error) throw existingLines.error;
      return { operation: { ...operation.data, cliente_nombre: summary.data?.cliente_nombre ?? operation.data.cliente_nombre }, lines: existingLines.data ?? [] };
    },
  });
  useEffect(() => {
    if (!open) return;
    setFile(null); setExtracted({});
    if (operationId) {
      if (!editQuery.data) return;
      const operation = editQuery.data.operation;
      setForm({
        np_numero: operation.np_numero ?? "", np_fecha: operation.np_fecha ?? "",
        cliente_nombre: operation.cliente_nombre ?? "", comercial: operation.comercial ?? "",
        observaciones: operation.observaciones ?? "",
      });
      setLines(editQuery.data.lines.map((line: any, index: number) => ({
        id: line.id, linea_numero: index + 1, marca: safeMarca(line.marca),
        producto: line.producto ?? "", modelo: line.modelo ?? "",
        anio: line.datos_extraidos?.anio ?? null, cabezal: line.datos_extraidos?.cabezal ?? "",
        cantidad: Math.max(1, Number(line.cantidad) || 1),
        condicion: line.condicion === "USADA" ? "USADA" : "NUEVA",
        abastecimiento: ["STOCK", "IMPORTAR"].includes(line.abastecimiento) ? line.abastecimiento : "DEFINIR",
        subgrupo: safeSubgroup(line.subgrupo), chasis: [],
        confianza: line.confianza_extraccion ?? {}, datos_extraidos: line.datos_extraidos ?? {},
      })));
      return;
    }
    setForm({ np_numero: "", np_fecha: "", cliente_nombre: "", comercial: "", observaciones: "" });
    setLines([blankLine()]);
  }, [open, operationId, editQuery.data]);
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
      const targetOperationId = operationId ?? crypto.randomUUID();
      const linesForSave = lines.map((line) => ({
        ...line,
        datos_extraidos: { ...(line.datos_extraidos ?? {}), anio: line.anio ?? null, cabezal: line.cabezal || null },
      }));
      const { data, error } = operationId
        ? await db.rpc("maquinaria_actualizar_operacion", { p_operacion_id: operationId, p_operacion: form, p_lineas: linesForSave })
        : await db.rpc("maquinaria_registrar_operacion", { p_operacion: { id: targetOperationId, ...form }, p_lineas: linesForSave });
      if (error) throw error;
      if (file) {
        try { await uploadEvidence(file, data ?? targetOperationId, "NP", extracted); }
        catch (uploadError) { console.error(uploadError); toast.warning("La operación se guardó, pero el archivo no pudo adjuntarse."); }
      }
      toast.success(operationId ? "Pedido actualizado" : "NP validada y operación creada"); onSaved(); onOpenChange(false);
    } catch (error: any) { toast.error(error?.message ?? "No se pudo guardar la operación"); }
    finally { setSaving(false); }
  };
  return <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="xl">
    <ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">{operationId ? "Editar pedido" : "Nuevo pedido"}</h2><p className="text-[11px] text-muted-foreground">{operationId ? "Corregí los datos sin perder las unidades ni sus vínculos." : "Subí la foto de la NP, verificá lo leído y completá solamente lo faltante."}</p></ResponsiveDrawerHeader>
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
      <div className="space-y-2"><div className="flex items-center justify-between"><div><h3 className="text-[13px] font-semibold">Unidades de la NP</h3><p className="text-[10px] text-muted-foreground">La máquina y el cabezal se registran como líneas independientes.</p></div><Button variant="outline" size="sm" onClick={() => setLines((v) => [...v, blankLine(v.length + 1)])}><Plus className="mr-1 h-3.5 w-3.5" />Agregar</Button></div>{lines.map((line, i) => <div key={i} className="rounded-xl border p-3"><div className="mb-2 flex justify-between"><span className="text-[11px] font-medium text-muted-foreground">Línea {i + 1}</span>{lines.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLines((v) => v.filter((_, x) => x !== i).map((l, x) => ({ ...l, linea_numero: x + 1 })))}><X className="h-3.5 w-3.5" /></Button>}</div><div className="grid gap-2 sm:grid-cols-2"><Field label="Marca"><CompactSelect value={line.marca} values={["CLAAS", "HORSCH", "OTROS"]} onChange={(v) => updateLine(i, { marca: v as DraftLine["marca"], modelo: "" })} /></Field><Field label="Tipo"><CompactSelect value={line.subgrupo} values={(MACHINE_SUBGROUPS as readonly string[]).filter((v) => v !== "SUELO")} onChange={(v) => updateLine(i, { subgrupo: v, modelo: "" })} /></Field><Field label="Modelo del catálogo"><ModeloMaquinaSelect marca={line.marca} subgrupo={line.subgrupo} value={line.modelo} onValueChange={(modelo) => updateLine(i, { modelo })} /></Field><Field label="Año"><Input type="number" min={1900} max={2200} value={line.anio ?? ""} onChange={(e) => updateLine(i, { anio: e.target.value ? Number(e.target.value) : null })} /></Field><Field label="Cantidad"><Input type="number" min={1} value={line.cantidad} onChange={(e) => updateLine(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} /></Field><Field label="Condición"><CompactSelect value={line.condicion} values={["NUEVA", "USADA"]} onChange={(v) => updateLine(i, { condicion: v as DraftLine["condicion"] })} /></Field><Field label="Abastecimiento"><CompactSelect value={line.abastecimiento} values={["DEFINIR", "STOCK", "IMPORTAR"]} onChange={(v) => updateLine(i, { abastecimiento: v as DraftLine["abastecimiento"] })} /></Field></div>{line.marca === "OTROS" && <p className="mt-2 text-[11px] text-amber-700">Se seguirá en la operación, pero no podrá ingresar al Parque mientras la marca no esté admitida.</p>}</div>)}</div>
      <Field label="Observaciones"><Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Field>
    </ResponsiveDrawerBody>
    <ResponsiveDrawerFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={saving || reading || editQuery.isLoading}>{saving ? "Guardando..." : operationId ? "Guardar cambios" : "Validar y crear"}</Button></ResponsiveDrawerFooter>
  </ResponsiveDrawer>;
}

function DetailValue({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <KeyValueItem label={label} value={value} mono={mono} />;
}

function OperationChassisValue({ unit, canEdit, onSaved }: { unit: any; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unit.chasis ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(unit.chasis ?? ""), [unit.chasis]);
  const save = async () => {
    setSaving(true);
    try {
      const { error } = await db.from("maquinaria_unidades_operacion").update({ chasis: value.trim() || null }).eq("id", unit.id);
      if (error) {
        if (error.code === "23505") throw new Error("Este chasis ya está asignado a otra unidad");
        if (error.code === "42501") throw new Error("No tenés permiso para editar el chasis");
        throw error;
      }
      toast.success("Chasis actualizado");
      setEditing(false); onSaved();
    } catch (error: any) { toast.error(error?.message ?? "No se pudo actualizar el chasis"); }
    finally { setSaving(false); }
  };
  return editing ? <div className="flex items-end gap-2"><Field label={`Unidad ${unit.numero_unidad} · Chasis`}><Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></Field><Button variant="outline" size="sm" onClick={() => { setValue(unit.chasis ?? ""); setEditing(false); }}>Cancelar</Button><Button size="sm" onClick={save} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />Guardar</Button></div> : <div className="flex items-start justify-between gap-2"><KeyValueGrid className="min-w-0 flex-1 grid-cols-2 sm:grid-cols-2"><DetailValue label={`Unidad ${unit.numero_unidad}`} value={unit.chasis || "Sin asignar"} mono /><DetailValue label="Estado" value={UNIT_STATE_LABEL[unit.estado] ?? unit.estado} /></KeyValueGrid>{canEdit && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /><span className="sr-only">Editar chasis</span></Button>}</div>;
}

function OperationDrawer({ operationId, onOpenChange, onEdit, onChanged }: { operationId: string | null; onOpenChange: (v: boolean) => void; onEdit: (id: string) => void; onChanged: () => void }) {
  const { isAdmin, roles } = useAuth();
  const canEditChasis = isAdmin || roles.includes("jefatura");
  const [activeTab, setActiveTab] = useState("resumen");
  const detailQuery = useQuery({
    queryKey: ["machine-operation-detail", operationId], enabled: !!operationId,
    queryFn: async (): Promise<OperationDetail> => {
      const [summary, operation, lines, docs, importation] = await Promise.all([
        db.from("maquinaria_operaciones_resumen").select("*").eq("id", operationId).single(),
        db.from("maquinaria_operaciones").select("observaciones").eq("id", operationId).single(),
        db.from("maquinaria_operacion_lineas").select("*").eq("operacion_id", operationId).order("linea_numero"),
        db.from("maquinaria_documentos").select("*").eq("operacion_id", operationId).in("tipo", ["NP", "FACTURA_VENTA"]).order("creado_en"),
        db.from("maquinaria_importaciones_operativas").select("*").eq("operacion_id", operationId).maybeSingle(),
      ]);
      if (summary.error) throw summary.error; if (lines.error) throw lines.error;
      const lineIds = (lines.data ?? []).map((l: any) => l.id);
      const [units, stock, linkedImports, availableImports, suggestions] = await Promise.all([
        lineIds.length ? db.from("maquinaria_unidades_operacion").select("*").in("linea_id", lineIds).order("numero_unidad") : Promise.resolve({ data: [], error: null }),
        db.from("maquinaria_stock_trazabilidad")
          .select("id,producto_codigo,marca,modelo,sucursal,deposito,chasis,saldo_actual,estado_disponibilidad,disponibilidad_detalle,unidad_operacion_id")
          .or("saldo_actual.gt.0,unidad_operacion_id.not.is.null")
          .order("marca").order("modelo").limit(1000),
        db.from("maquinaria_importacion_unidades_operativas")
          .select("*").eq("operacion_id", operationId)
          .order("eta", { ascending: true, nullsFirst: false }),
        db.from("maquinaria_importacion_unidades_asignables")
          .select("*").order("eta", { ascending: true, nullsFirst: false }).limit(500),
        db.from("maquinaria_vinculos_sugeridos").select("*").eq("operacion_id", operationId),
      ]);
      if (units.error) throw units.error; if (stock.error) throw stock.error; if (linkedImports.error) throw linkedImports.error; if (availableImports.error) throw availableImports.error; if (suggestions.error) throw suggestions.error;
      const historicalChassis = [...new Set((units.data ?? []).map((unit: any) => normalizeChassisKey(unit.chasis)).filter(Boolean))];
      const historicalImports = simpleOrderState(summary.data?.estado) === "COMPLETADO" && historicalChassis.length
        ? await db.from("maquinaria_importacion_unidades_historicas").select("*").in("chasis_normalizado", historicalChassis).limit(500)
        : { data: [], error: null };
      const historicalMigrationMissing = historicalImports.error
        && (["42P01", "PGRST205"].includes(historicalImports.error.code) || String(historicalImports.error.message ?? "").includes("maquinaria_importacion_unidades_historicas"));
      if (historicalImports.error && !historicalMigrationMissing) throw historicalImports.error;
      const importsById = new Map<string, ImportAssignmentRow>();
      (linkedImports.data ?? []).forEach((item: ImportAssignmentRow) => importsById.set(item.id, { ...item, asignable: false }));
      (availableImports.data ?? []).forEach((item: ImportAssignmentRow) => importsById.set(item.id, { ...item, asignable: true }));
      (historicalImports.data ?? []).forEach((item: ImportAssignmentRow) => importsById.set(item.id, { ...item, asignable: false }));
      return { ...summary.data, observaciones: operation.data?.observaciones, lines: lines.data ?? [], docs: docs.data ?? [], units: units.data ?? [], stock: stock.data ?? [], imports: [...importsById.values()], suggestions: suggestions.data ?? [], importation: importation.data };
    },
  });
  const openDocument = (storagePath: string, fileName: string) => {
    openMachineDocument(storagePath, fileName).catch((error) => {
      console.error(error);
      toast.error("No se pudo abrir el documento");
    });
  };
  const detail = detailQuery.data;
  const simpleState = detail ? simpleOrderState(detail.estado) : "PENDIENTE";
  useEffect(() => {
    setActiveTab(simpleState === "COMPLETADO" ? "facturacion" : "resumen");
  }, [operationId, simpleState]);
  const invoices = useMemo(() => {
    if (!detail) return [];
    const found = new Map<string, { numero: string | null; fecha: string | null; valor: number | null }>();
    detail.lines.forEach((line: any) => {
      const historical = line.datos_extraidos?.historico_pedido ?? {};
      const numero = historical.factura_numero || historical.factura_venta || detail.factura_venta || null;
      const fecha = historical.factura_fecha || detail.factura_fecha || null;
      const rawValue = historical.valor_factura ?? historical.valor_venta ?? detail.valor_venta ?? null;
      const valor = rawValue == null || rawValue === "" ? null : Number(rawValue);
      if (numero || fecha || valor != null) {
        const key = `${numero ?? ""}|${fecha ?? ""}|${valor ?? ""}`;
        found.set(key, { numero, fecha, valor: Number.isFinite(valor) ? valor : null });
      }
    });
    if (!found.size && (detail.factura_venta || detail.factura_fecha || detail.valor_venta != null)) {
      found.set("summary", { numero: detail.factura_venta, fecha: detail.factura_fecha, valor: detail.valor_venta });
    }
    return [...found.values()];
  }, [detail]);
  const detailStockChassis = new Set<string>((detail?.stock ?? []).map((stockRow: StockAssignmentRow) => normalizarChasis(stockRow.chasis)).filter(Boolean));
  const deliveryComplete = Boolean(detail?.units.length) && detail!.units.every((unit: any) => {
    const line = detail!.lines.find((candidate: any) => candidate.id === unit.linea_id);
    return entregaStateFromUnit(unit.estado, unit.chasis, line?.marca, detail!.estado, detailStockChassis) === "ENTREGADO";
  });
  const lifecycleIndex = detail
    ? deliveryComplete ? 3 : ["FACTURADA", "CERRADA"].includes(detail.estado) ? 2 : ["ABASTECIMIENTO", "EN_IMPORTACION", "DISPONIBLE"].includes(detail.estado) ? 1 : 0
    : 0;
  const npDocuments = detail?.docs.filter((document: any) => document.tipo === "NP") ?? [];
  const saleInvoiceDocuments = detail?.docs.filter((document: any) => document.tipo === "FACTURA_VENTA") ?? [];
  return <ResponsiveDrawer open={!!operationId} onOpenChange={onOpenChange} size="xl">
    <ResponsiveDrawerHeader>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[16px] font-semibold">{detail ? formatNpCode(detail.np_numero) : "Cargando..."}</h2><p className="text-[11px] text-muted-foreground">{detail?.cliente_nombre ?? "Cargando..."}</p></div>
        {detail && <div className="flex flex-col items-end gap-1"><Badge variant="outline" className={cn("text-[10px]", simpleStateClass(simpleState))}>{SIMPLE_STATE_LABEL[simpleState]}</Badge><span className="text-[10px] text-muted-foreground">{STATE_LABEL[detail.estado] ?? detail.estado}</span></div>}
      </div>
    </ResponsiveDrawerHeader>
    <ResponsiveDrawerBody>
      {detail && <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <ProcessStepper steps={["Pedido", "Origen", "Facturación", "Entrega"]} currentIndex={lifecycleIndex} pulseCurrent={!deliveryComplete} />
        <TabsList className="grid h-auto w-full grid-cols-4">
          <TabsTrigger value="resumen" className="px-2 text-[11px]">Resumen</TabsTrigger>
          <TabsTrigger value="origen" className="px-2 text-[11px]">Origen</TabsTrigger>
          <TabsTrigger value="facturacion" className="px-2 text-[11px]">Facturación</TabsTrigger>
          <TabsTrigger value="documentos" className="px-2 text-[11px]">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <KeyValueGrid className="sm:grid-cols-4">
            <DetailValue label="Fecha NP" value={formatDate(detail.np_fecha)} />
            <DetailValue label="Comercial" value={detail.comercial} />
            <DetailValue label="Unidades" value={detail.unidades} />
            <DetailValue label="Valor" value={formatUsd(detail.valor_venta)} />
          </KeyValueGrid>
          <DetailSection title="Máquinas"><div className="space-y-2">{detail.lines.map((line: any) => {
            const extracted = line.datos_extraidos ?? {};
            const model = line.modelo || extracted.modelo;
            const product = line.producto || extracted.producto;
            const year = line.anio ?? extracted.anio;
            const head = line.cabezal || extracted.cabezal;
            const lineUnits = detail.units.filter((unit: any) => unit.linea_id === line.id);
            return <EntityCard key={line.id}><div className="flex items-start justify-between gap-3"><div><div className="text-[12px] font-medium">{model || product || "Sin descripción"}</div><div className="text-[10px] text-muted-foreground">{[product && product !== model ? product : null, year && `Año ${year}`, head && `Cabezal ${head}`].filter(Boolean).join(" · ")}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5"><Badge variant="outline" className={cn("text-[10px]", brandClass(line.marca))}>{line.marca ?? "OTROS"}</Badge><Badge variant="outline" className={cn("text-[10px]", conditionClass(line.condicion))}>{CONDITION_LABEL[line.condicion] ?? line.condicion}</Badge></div></div>{lineUnits.length > 0 && <div className="mt-3 space-y-3 border-t pt-3">{lineUnits.map((unit: any) => <OperationChassisValue key={unit.id} unit={unit} canEdit={canEditChasis} onSaved={() => { detailQuery.refetch(); onChanged(); }} />)}</div>}</EntityCard>;
          })}</div></DetailSection>
          {detail.observaciones && <DetailSection title="Observaciones"><div className="rounded-lg bg-muted/40 p-3 text-[11px]">{detail.observaciones}</div></DetailSection>}
        </TabsContent>

        <TabsContent value="origen" className="space-y-3">
          {canEditChasis ? detail.units.map((unit: any) => <UnitAssignment key={unit.id} unit={unit} line={detail.lines.find((line: any) => line.id === unit.linea_id)} stock={detail.stock} imports={detail.imports} suggestions={detail.suggestions.filter((suggestion: LinkSuggestionRow) => suggestion.unidad_id === unit.id)} historical={simpleState === "COMPLETADO"} onSaved={() => { detailQuery.refetch(); onChanged(); }} />) : <p className="text-[11px] text-muted-foreground">No tenés permisos para modificar el origen de las unidades.</p>}
        </TabsContent>

        <TabsContent value="facturacion" className="space-y-4">
          <DetailSection title="Facturación">{invoices.length ? <div className="divide-y">{invoices.map((invoice, index) => <KeyValueGrid key={`${invoice.numero}-${invoice.fecha}-${index}`} className="py-3 first:pt-0"><KeyValueItem label="Valor" value={formatUsd(invoice.valor)} empty="Pendiente" prominent /><KeyValueItem label="Número" value={invoice.numero} empty="Pendiente" mono /><KeyValueItem label="Fecha" value={invoice.fecha ? formatDate(invoice.fecha) : null} empty="Pendiente" /></KeyValueGrid>)}</div> : <KeyValueGrid><KeyValueItem label="Valor" value={detail.valor_venta != null ? formatUsd(detail.valor_venta) : null} empty="Pendiente" prominent /><KeyValueItem label="Número" value={null} empty="Pendiente" /><KeyValueItem label="Fecha" value={null} empty="Pendiente" /></KeyValueGrid>}</DetailSection>
          <DetailSection title="Entrega"><div className="space-y-2">{detail.units.map((unit: any) => { const line = detail.lines.find((item: any) => item.id === unit.linea_id); return <EntityCard key={unit.id}><div className="mb-3"><div className="text-[12px] font-medium">{line?.modelo || line?.producto || "Máquina"}</div><div className="text-[10px] text-muted-foreground">{unit.chasis ? `Ch. ${unit.chasis}` : "Sin chasis asignado"}</div></div><KeyValueGrid className="border-t pt-3"><DetailValue label="Unidad" value={unit.numero_unidad} /><DetailValue label="Estado" value={UNIT_STATE_LABEL[unit.estado] ?? unit.estado} /></KeyValueGrid></EntityCard>; })}</div></DetailSection>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          <DetailSection title="Documentos comerciales"><div>{npDocuments.length ? npDocuments.map((document: any, index: number) => <DocumentRow key={document.id} label={index ? "Nota de pedido adicional" : "Nota de pedido"} fileName={document.archivo_nombre} date={formatDate(document.creado_en)} onOpen={() => openDocument(document.storage_path, document.archivo_nombre)} />) : <DocumentRow label="Nota de pedido" action={<AttachOrderDocumentButton operationId={operationId} type="NP" label="Adjuntar" onUploaded={() => detailQuery.refetch()} />} />}{npDocuments.length > 0 && <div className="flex justify-end"><AttachOrderDocumentButton operationId={operationId} type="NP" label="Adjuntar otra" onUploaded={() => detailQuery.refetch()} /></div>}</div><div>{saleInvoiceDocuments.length ? saleInvoiceDocuments.map((document: any, index: number) => <DocumentRow key={document.id} label={index ? "Factura adicional" : "Factura al cliente"} fileName={document.archivo_nombre} date={formatDate(document.creado_en)} onOpen={() => openDocument(document.storage_path, document.archivo_nombre)} />) : <DocumentRow label="Factura al cliente" action={<AttachOrderDocumentButton operationId={operationId} type="FACTURA_VENTA" label="Adjuntar" onUploaded={() => detailQuery.refetch()} />} />}{saleInvoiceDocuments.length > 0 && <div className="flex justify-end"><AttachOrderDocumentButton operationId={operationId} type="FACTURA_VENTA" label="Adjuntar otra" onUploaded={() => detailQuery.refetch()} /></div>}</div></DetailSection>
        </TabsContent>
      </Tabs>}
    </ResponsiveDrawerBody>
    {detail && canEditChasis && operationId && <ResponsiveDrawerFooter><Button variant="outline" size="sm" onClick={() => onEdit(operationId)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar pedido</Button></ResponsiveDrawerFooter>}
  </ResponsiveDrawer>;
}

function normalizeAssignmentText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function normalizeChassisKey(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function UnitAssignment({ unit, line, stock, imports, suggestions, historical, onSaved }: { unit: any; line: any; stock: StockAssignmentRow[]; imports: ImportAssignmentRow[]; suggestions: LinkSuggestionRow[]; historical: boolean; onSaved: () => void }) {
  if (historical) {
    return <UnitHistoricalAssignment unit={unit} line={line} stock={stock} imports={imports} onSaved={onSaved} />;
  }
  if (line?.abastecimiento === "IMPORTAR") {
    return <UnitImportAssignment unit={unit} line={line} imports={imports} suggestion={suggestions.find((item) => item.tipo === "IMPORTAR")} onSaved={onSaved} />;
  }
  if (line?.abastecimiento === "STOCK") {
    return <UnitStockAssignment unit={unit} line={line} stock={stock} suggestion={suggestions.find((item) => item.tipo === "STOCK")} onSaved={onSaved} />;
  }
  return <UnitSupplyDefinition unit={unit} line={line} onSaved={onSaved} />;
}

function UnitHistoricalAssignment({ unit, line, stock, imports, onSaved }: { unit: any; line: any; stock: StockAssignmentRow[]; imports: ImportAssignmentRow[]; onSaved: () => void }) {
  const chassisKey = normalizeChassisKey(unit.chasis);
  const linkedStock = stock.find((row) => row.unidad_operacion_id === unit.id);
  const linkedImport = imports.find((row) => row.unidad_id === unit.id && row.vinculo_manual);
  const candidates = imports
    .filter((row) => normalizeChassisKey(row.chasis) === chassisKey)
    .filter((row) => !row.unidad_id || row.unidad_id === unit.id)
    .sort((a, b) => String(b.ata ?? "").localeCompare(String(a.ata ?? "")) || String(b.eta ?? "").localeCompare(String(a.eta ?? "")));
  if (linkedImport && !candidates.some((row) => row.id === linkedImport.id)) candidates.unshift(linkedImport);

  const [importId, setImportId] = useState(linkedImport?.id ?? "NONE");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setImportId(linkedImport?.id ?? "NONE"), [linkedImport?.id]);
  const dirty = importId !== (linkedImport?.id ?? "NONE");

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await db.rpc("maquinaria_vincular_importacion_historica", {
        p_unidad_id: unit.id,
        p_importacion_id: importId === "NONE" ? null : importId,
      });
      if (error) throw error;
      toast.success(importId === "NONE" ? "Vínculo histórico quitado" : "Importación histórica vinculada por chasis");
      setEditing(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la trazabilidad histórica");
    } finally {
      setSaving(false);
    }
  };

  return <div className="rounded-xl border p-3">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-[12px] font-medium">{line?.modelo || line?.producto || "Unidad"} · #{unit.numero_unidad}</div><div className="text-[10px] text-muted-foreground">Ch. {unit.chasis || "sin registrar"} · Pedido facturado</div></div>
      {linkedImport && !editing && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3 w-3" />Cambiar</Button>}
    </div>
    {linkedImport && !editing ? <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3"><DetailValue label="Origen" value="Importación" /><DetailValue label="Proveedor" value={linkedImport.proveedor} /><DetailValue label="OC" value={linkedImport.oc} mono /><DetailValue label="Factura proveedor" value={linkedImport.invoice_supplier} mono /><DetailValue label="Fecha factura" value={formatDate(linkedImport.factura_proveedor_fecha)} /><DetailValue label="Arribo" value={formatDate(linkedImport.ata)} /></div> : <>
    {linkedStock && <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3"><DetailValue label="Origen anterior" value="Stock" /><DetailValue label="Ubicación" value={[linkedStock.sucursal, linkedStock.deposito].filter(Boolean).join(" · ")} /></div>}
    {!chassisKey ? <p className="rounded-lg border border-dashed p-3 text-[11px] text-amber-700">Registrá el chasis para buscar la importación correspondiente.</p> : candidates.length ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Importación histórica con el mismo chasis</Label><Select value={importId} onValueChange={setImportId}><SelectTrigger className="h-9 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Sin importación histórica vinculada</SelectItem>{candidates.map((row) => <SelectItem key={row.id} value={row.id}>{[row.modelo || row.producto || "Importación", `Ch. ${row.chasis}`, row.oc && `OC ${row.oc}`, row.invoice_supplier && `Factura ${row.invoice_supplier}`, row.ata ? `Arribo ${formatDate(row.ata)}` : row.eta && `ETA ${formatDate(row.eta)}`].filter(Boolean).join(" · ")}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-2">{editing && <Button size="sm" variant="outline" onClick={() => { setImportId(linkedImport?.id ?? "NONE"); setEditing(false); }}>Cancelar</Button>}<Button size="sm" onClick={save} disabled={!dirty || saving}><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? "Guardando..." : "Guardar"}</Button></div>
    </div> : <p className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">No se encontró una importación histórica con el chasis exacto {unit.chasis}.</p>}
    </>}
  </div>;
}

function UnitSupplyDefinition({ unit, line, onSaved }: { unit: any; line: any; onSaved: () => void }) {
  const [supply, setSupply] = useState<"STOCK" | "IMPORTAR">("STOCK");
  const [savingSupply, setSavingSupply] = useState(false);
  const saveSupply = async () => {
    setSavingSupply(true);
    try {
      const { error } = await db.from("maquinaria_operacion_lineas").update({ abastecimiento: supply }).eq("id", line.id);
      if (error) throw error;
      toast.success(`Origen definido como ${SUPPLY_LABEL[supply]}`);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo definir el origen");
    } finally {
      setSavingSupply(false);
    }
  };
  return <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
    <div className="mb-2"><div className="text-[12px] font-medium">{line?.modelo || line?.producto || "Unidad"} · #{unit.numero_unidad}</div><div className="text-[10px] text-amber-800">Definí si esta línea se abastece desde stock o mediante importación.</div></div>
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label="Origen"><CompactSelect value={supply} values={["STOCK", "IMPORTAR"]} onChange={(value) => setSupply(value as "STOCK" | "IMPORTAR")} /></Field><Button size="sm" onClick={saveSupply} disabled={savingSupply}><Save className="mr-1.5 h-3.5 w-3.5" />{savingSupply ? "Guardando..." : "Definir origen"}</Button></div>
  </div>;
}

function UnitStockAssignment({ unit, line, stock, suggestion, onSaved }: { unit: any; line: any; stock: StockAssignmentRow[]; suggestion?: LinkSuggestionRow; onSaved: () => void }) {
  const linked = stock.find((row) => row.unidad_operacion_id === unit.id);
  const [stockId, setStockId] = useState(linked?.id ?? "NONE");
  const [searchStock, setSearchStock] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setStockId(linked?.id ?? "NONE");
  }, [linked?.id]);

  const expected = normalizeAssignmentText([line?.marca, line?.modelo, line?.producto].filter(Boolean).join(" "));
  const query = normalizeAssignmentText(searchStock);
  const candidates = stock
    .filter((row) => !row.unidad_operacion_id || row.unidad_operacion_id === unit.id || row.estado_disponibilidad === "DISPONIBLE")
    .filter((row) => !query || normalizeAssignmentText([row.producto_codigo, row.marca, row.modelo, row.sucursal, row.deposito, row.chasis].join(" ")).includes(query))
    .sort((a, b) => {
      const aMatch = expected && normalizeAssignmentText([a.marca, a.modelo].join(" ")).split(" ").some((part) => part.length > 2 && expected.includes(part)) ? 1 : 0;
      const bMatch = expected && normalizeAssignmentText([b.marca, b.modelo].join(" ")).split(" ").some((part) => part.length > 2 && expected.includes(part)) ? 1 : 0;
      return bMatch - aMatch || Number(b.saldo_actual ?? 0) - Number(a.saldo_actual ?? 0);
    })
    .slice(0, 60);
  if (linked && !candidates.some((row) => row.id === linked.id)) candidates.unshift(linked);

  const saveAssignment = async (suggestedStockId?: string) => {
    const effectiveStockId = suggestedStockId ?? stockId;
    setSavingAssignment(true);
    try {
      const { error } = await db.rpc("maquinaria_asignar_stock", {
        p_unidad_id: unit.id,
        p_stock_id: effectiveStockId === "NONE" ? null : effectiveStockId,
        p_chasis: String(unit.chasis ?? "").trim() || null,
      });
      if (error) throw error;
      toast.success(effectiveStockId === "NONE" ? "Reserva de stock quitada" : "Stock reservado para la operación");
      setEditing(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la asignación");
    } finally {
      setSavingAssignment(false);
    }
  };

  const dirty = stockId !== (linked?.id ?? "NONE");
  return <div className="rounded-xl border p-3">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><div className="text-[12px] font-medium">{line?.modelo || line?.producto || "Unidad"} · #{unit.numero_unidad}</div><div className="text-[10px] text-muted-foreground">{line?.marca}</div></div>{linked && !editing && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3 w-3" />Cambiar</Button>}</div>
    {linked && !editing ? <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3"><DetailValue label="Origen" value="Stock" /><DetailValue label="Máquina" value={linked.modelo || linked.producto_codigo} /><DetailValue label="Chasis" value={linked.chasis} mono /><DetailValue label="Sucursal" value={linked.sucursal} /><DetailValue label="Depósito" value={linked.deposito} /><DetailValue label="Estado" value={AVAILABILITY_LABEL[linked.estado_disponibilidad ?? ""] ?? linked.estado_disponibilidad} /></div> : <>
    {!linked && suggestion && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5"><div><p className="text-[11px] font-medium text-blue-800">Coincidencia exacta de chasis</p><p className="text-[10px] text-blue-700">{[suggestion.modelo, suggestion.ubicacion, suggestion.chasis].filter(Boolean).join(" · ")}</p></div><Button size="sm" variant="outline" onClick={() => saveAssignment(suggestion.recurso_id)} disabled={savingAssignment}>Confirmar sugerencia</Button></div>}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Unidad de stock</Label><Input className="h-8 text-[11px]" value={searchStock} onChange={(event) => setSearchStock(event.target.value)} placeholder="Buscar por modelo, código, sucursal o chasis" /><Select value={stockId} onValueChange={setStockId}><SelectTrigger className="h-9 text-[11px]"><SelectValue placeholder="Sin reserva" /></SelectTrigger><SelectContent><SelectItem value="NONE">Sin reserva de stock</SelectItem>{candidates.map((row) => <SelectItem key={row.id} value={row.id}>{[row.modelo || row.producto_codigo, row.chasis && `Ch. ${row.chasis}`, row.sucursal, row.deposito, `Stock ${Number(row.saldo_actual ?? 0)}`].filter(Boolean).join(" · ")}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-2">{editing && <Button size="sm" variant="outline" onClick={() => { setStockId(linked?.id ?? "NONE"); setEditing(false); }}>Cancelar</Button>}<Button size="sm" onClick={() => saveAssignment()} disabled={!dirty || savingAssignment}><Save className="mr-1.5 h-3.5 w-3.5" />{savingAssignment ? "Guardando..." : "Guardar"}</Button></div>
    </div>
    </>}
  </div>;
}

function UnitImportAssignment({ unit, line, imports, suggestion, onSaved }: { unit: any; line: any; imports: ImportAssignmentRow[]; suggestion?: LinkSuggestionRow; onSaved: () => void }) {
  const linked = imports.find((row) => row.unidad_id === unit.id && row.vinculo_manual);
  const [importId, setImportId] = useState(linked?.id ?? "NONE");
  const [searchImport, setSearchImport] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => setImportId(linked?.id ?? "NONE"), [linked?.id]);

  const expected = normalizeAssignmentText([line?.marca, line?.modelo, line?.producto].filter(Boolean).join(" "));
  const query = normalizeAssignmentText(searchImport);
  const candidates = imports
    .filter((row) => row.unidad_id === unit.id || row.asignable === true)
    .filter((row) => !query || normalizeAssignmentText([row.np_numero, row.proveedor, row.producto, row.modelo, row.estado_fuente, row.oc, row.po, row.chasis].join(" ")).includes(query))
    .sort((a, b) => {
      const aMatch = expected && normalizeAssignmentText([a.modelo, a.producto].join(" ")).split(" ").some((part) => part.length > 2 && expected.includes(part)) ? 1 : 0;
      const bMatch = expected && normalizeAssignmentText([b.modelo, b.producto].join(" ")).split(" ").some((part) => part.length > 2 && expected.includes(part)) ? 1 : 0;
      return bMatch - aMatch || String(a.eta ?? "9999").localeCompare(String(b.eta ?? "9999"));
    })
    .slice(0, 60);
  if (linked && !candidates.some((row) => row.id === linked.id)) candidates.unshift(linked);
  const validSuggestion = suggestion && candidates.some((row) => row.id === suggestion.recurso_id) ? suggestion : undefined;

  const saveAssignment = async (suggestedImportId?: string) => {
    const effectiveImportId = suggestedImportId ?? importId;
    setSavingAssignment(true);
    try {
      const { error } = await db.rpc("maquinaria_asignar_importacion", {
        p_unidad_id: unit.id,
        p_importacion_id: effectiveImportId === "NONE" ? null : effectiveImportId,
      });
      if (error) throw error;
      toast.success(effectiveImportId === "NONE" ? "Vínculo de importación quitado" : "Importación vinculada a la unidad");
      setEditing(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la importación");
    } finally {
      setSavingAssignment(false);
    }
  };

  const dirty = importId !== (linked?.id ?? "NONE");
  return <div className="rounded-xl border p-3">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><div className="text-[12px] font-medium">{line?.modelo || line?.producto || "Unidad"} · #{unit.numero_unidad}</div><div className="text-[10px] text-muted-foreground">{[line?.marca, unit.chasis && `Ch. ${unit.chasis}`].filter(Boolean).join(" · ")}</div></div>{linked && !editing && <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3 w-3" />Cambiar</Button>}</div>
    {linked && !editing ? <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3"><DetailValue label="Origen" value="Importación" /><DetailValue label="Máquina" value={linked.modelo || linked.producto} /><DetailValue label="Chasis" value={linked.chasis || unit.chasis} mono /><DetailValue label="Proveedor" value={linked.proveedor} /><DetailValue label="OC" value={linked.oc} mono /><DetailValue label="Llegada" value={formatDate(linked.ata || linked.eta)} /></div> : <>
    {!linked && validSuggestion && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5"><div><p className="text-[11px] font-medium text-violet-800">Coincidencia exacta de chasis</p><p className="text-[10px] text-violet-700">{[validSuggestion.modelo, validSuggestion.ubicacion, validSuggestion.chasis].filter(Boolean).join(" · ")}</p></div><Button size="sm" variant="outline" onClick={() => saveAssignment(validSuggestion.recurso_id)} disabled={savingAssignment}>Confirmar sugerencia</Button></div>}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Máquina importada</Label><Input className="h-8 text-[11px]" value={searchImport} onChange={(event) => setSearchImport(event.target.value)} placeholder="Buscar por modelo, NP, proveedor, OC, PO o chasis" /><Select value={importId} onValueChange={setImportId}><SelectTrigger className="h-9 text-[11px]"><SelectValue placeholder="Sin importación vinculada" /></SelectTrigger><SelectContent><SelectItem value="NONE">Sin importación vinculada</SelectItem>{candidates.map((row) => <SelectItem key={row.id} value={row.id}>{[row.modelo || row.producto || "Importación", `Unidad ${row.numero_unidad}/${Math.max(1, Number(row.cantidad_lote) || 1)}`, row.chasis && `Ch. ${row.chasis}`, row.np_numero && formatNpCode(row.np_numero), row.oc && `OC ${row.oc}`, row.po && `PO ${row.po}`, row.eta && `ETA ${formatDate(row.eta)}`].filter(Boolean).join(" · ")}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-2">{editing && <Button size="sm" variant="outline" onClick={() => { setImportId(linked?.id ?? "NONE"); setEditing(false); }}>Cancelar</Button>}<Button size="sm" onClick={() => saveAssignment()} disabled={!dirty || savingAssignment}><Save className="mr-1.5 h-3.5 w-3.5" />{savingAssignment ? "Guardando..." : "Guardar"}</Button></div>
    </div>
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>; }
function CompactSelect({ value, values, onChange, disabled = false }: { value: string; values: readonly string[]; onChange: (v: string) => void; disabled?: boolean }) { return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{values.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>; }
