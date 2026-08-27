/* eslint-disable @typescript-eslint/no-explicit-any -- Las tablas se tipan al regenerar database.types tras aplicar la migración. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileCheck2, FileText, PackageCheck, Plus, Search, Ship, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
const STATE_LABEL: Record<string, string> = {
  BORRADOR: "Borrador", REVISION_NP: "Revisar NP", NP_VALIDADA: "NP validada",
  ABASTECIMIENTO: "Abastecimiento", EN_IMPORTACION: "En importación", DISPONIBLE: "Disponible",
  FACTURADA: "Facturada", CERRADA: "Cerrada", CANCELADA: "Cancelada",
};

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
  proveedor: string | null; invoice_supplier: string | null; costo_final: number | null; chasis: string | null;
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

const AVAILABILITY_LABEL: Record<string, string> = {
  DISPONIBLE: "Disponible", RESERVADO: "Reservado", VENDIDO_PENDIENTE_ENTREGA: "Vendido · por entregar",
  EN_PARQUE: "En parque", CONFLICTO: "Conflicto", SIN_CHASIS: "Sin chasis",
};
const availabilityClass = (state?: string | null) => cn("text-[10px]", state === "DISPONIBLE" && "border-emerald-200 bg-emerald-50 text-emerald-700", state === "RESERVADO" && "border-blue-200 bg-blue-50 text-blue-700", state === "VENDIDO_PENDIENTE_ENTREGA" && "border-violet-200 bg-violet-50 text-violet-700", state === "CONFLICTO" && "border-red-200 bg-red-50 text-red-700", (!state || state === "SIN_CHASIS") && "border-amber-200 bg-amber-50 text-amber-700");

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
  const [state, setState] = useState("TODOS");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportRow | null>(null);

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
  const rows = useMemo(() => (operationsQuery.data ?? []).filter((row) => {
    if (state !== "TODOS" && row.estado_fuente !== state) return false;
    const q = search.trim().toUpperCase();
    const common = [row.np_numero, row.cliente_nombre, row.marca, row.producto, row.modelo, row.chasis];
    const importValues = importsView ? [(row as ImportRow).proveedor, (row as ImportRow).oc, (row as ImportRow).po] : [(row as OrderRow).comercial];
    return !q || [...common, ...importValues].some((v) => String(v ?? "").toUpperCase().includes(q));
  }), [operationsQuery.data, importsView, search, state]);
  const totals = useMemo(() => importsView ? {
    first: rows.length,
    second: rows.filter((row) => !(row as ImportRow).ata).length,
    third: rows.filter((row) => !!(row as ImportRow).ata).length,
    fourth: rows.filter((row) => !!row.estado_disponibilidad).length,
  } : {
    first: rows.length,
    second: rows.filter((row) => String(row.estado_fuente ?? "").toLowerCase() === "pendiente").length,
    third: rows.filter((row) => row.estado_disponibilidad === "RESERVADO").length,
    fourth: rows.filter((row) => row.estado_disponibilidad === "VENDIDO_PENDIENTE_ENTREGA").length,
  }, [rows, importsView]);
  const stateOptions = Array.from(new Set((operationsQuery.data ?? []).map((row) => row.estado_fuente).filter((value): value is string => !!value))).sort();

  return <main className={pageShell}>
    <PageHeader
      title={importsView ? "Importación de máquinas" : "Operaciones de máquinas"}
      meta={importsView ? "Logística y documentación de las unidades importadas." : "Pedidos comerciales y asignación de unidades por chasis."}
      actions={!importsView ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nueva operación</Button> : undefined}
    />
    <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiItem label={importsView ? "Importaciones" : "Pedidos"} value={totals.first} icon={importsView ? <Ship /> : <FileCheck2 />} tone="info" />
      <KpiItem label={importsView ? "En tránsito / sin ATA" : "Pendientes"} value={totals.second} icon={<FileText />} tone="warning" />
      <KpiItem label={importsView ? "Con arribo" : "Reservados en stock"} value={totals.third} icon={<PackageCheck />} tone="positive" />
      <KpiItem label={importsView ? "Vinculados a stock" : "Vendidos por entregar"} value={totals.fourth} />
    </KpiStrip>
    <Panel className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b p-3">
        <div className="min-w-[240px] flex-1"><Label className="text-[11px]">Buscar</Label><div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input className="h-8 pl-8 text-[12px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="NP, cliente, comercial o marca..." /></div></div>
        <div className="w-[190px]"><Label className="text-[11px]">Estado de origen</Label><Select value={state} onValueChange={setState}><SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos</SelectItem>{stateOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <span className="pb-2 text-[11px] text-muted-foreground">{rows.length} {importsView ? "importaciones" : "pedidos"}</span>
      </div>
      {operationsQuery.isError ? <div className="p-8 text-center text-[12px] text-destructive">Aplicá la migración SQL de operaciones para habilitar esta sección.</div> :
      <>
        <div className="hidden max-h-[calc(100vh-300px)] overflow-y-auto md:block">
          {importsView ? <ImportsTable rows={rows as ImportRow[]} onSelect={setSelectedImport} /> : <OrdersTable rows={rows as OrderRow[]} onSelect={(row) => setSelected(row.operacion_id)} />}
        </div>
        <div className="space-y-2 p-3 md:hidden">{rows.map((row) => <button type="button" key={row.id} onClick={() => importsView ? setSelectedImport(row as ImportRow) : setSelected((row as OrderRow).operacion_id)} className="w-full rounded-xl border bg-card p-3 text-left"><div className="flex items-start justify-between gap-2"><span className="font-mono text-[12px] font-semibold">{row.np_numero ? `NP ${row.np_numero}` : "Sin NP"}</span><Badge variant="outline" className="text-[10px]">{row.estado_fuente ?? "Sin estado"}</Badge></div><div className="mt-2 text-[13px] font-medium">{row.modelo || row.producto || "Sin descripción"}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.cliente_nombre || (importsView ? (row as ImportRow).proveedor : "Sin cliente") || "—"}</div><div className="mt-2 flex items-center justify-between font-mono text-[10px]"><span>{row.chasis || "Sin chasis"}</span><Eye className="h-4 w-4" /></div></button>)}</div>
        {!rows.length && !operationsQuery.isLoading && <div className="p-10 text-center text-[12px] text-muted-foreground">No hay {importsView ? "importaciones" : "pedidos"} con estos filtros.</div>}
      </>}
    </Panel>
    <NewOperationDrawer open={newOpen} onOpenChange={setNewOpen} onSaved={() => queryClient.invalidateQueries({ queryKey: ["machine-operations"] })} />
    <OperationDrawer operationId={selected} onOpenChange={(open) => !open && setSelected(null)} onChanged={() => queryClient.invalidateQueries({ queryKey: ["machine-operations"] })} />
    <ImportDetailDrawer row={selectedImport} onOpenChange={(open) => !open && setSelectedImport(null)} />
  </main>;
}

function OrdersTable({ rows, onSelect }: { rows: OrderRow[]; onSelect: (row: OrderRow) => void }) {
  return <Table className="table-fixed text-[12px]"><TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead className="w-[125px]">NP / fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Máquina</TableHead><TableHead className="w-[130px]">Comercial</TableHead><TableHead className="w-[115px]">Abastecimiento</TableHead><TableHead className="w-[130px]">Estado</TableHead><TableHead className="w-[175px]">Chasis / stock</TableHead><TableHead className="w-[52px]" /></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => onSelect(row)}><TableCell><div className="font-mono font-medium">{row.np_numero || "Sin NP"}</div><div className="text-[10px] text-muted-foreground">{formatDate(row.np_fecha)}</div></TableCell><TableCell><div className="truncate font-medium">{row.cliente_nombre}</div></TableCell><TableCell><div className="truncate font-medium">{row.modelo || row.producto || "—"}</div><div className="truncate text-[10px] text-muted-foreground">{[row.producto !== row.modelo && row.producto, row.marca].filter(Boolean).join(" · ")}</div></TableCell><TableCell className="truncate">{row.comercial || "—"}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{row.abastecimiento || "Sin definir"}</Badge></TableCell><TableCell className="truncate">{row.estado_fuente || "—"}</TableCell><TableCell><div className="truncate font-mono text-[10px]">{row.chasis || "Sin chasis"}</div>{row.estado_disponibilidad && <Badge variant="outline" className={availabilityClass(row.estado_disponibilidad)}>{AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad}</Badge>}</TableCell><TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell></TableRow>)}</TableBody></Table>;
}

function ImportsTable({ rows, onSelect }: { rows: ImportRow[]; onSelect: (row: ImportRow) => void }) {
  return <Table className="table-fixed text-[12px]"><TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead className="w-[125px]">Estado</TableHead><TableHead className="w-[115px]">NP</TableHead><TableHead>Máquina</TableHead><TableHead className="w-[145px]">Proveedor</TableHead><TableHead className="w-[135px]">OC / PO</TableHead><TableHead className="w-[145px]">ETA / ATA</TableHead><TableHead className="w-[180px]">Chasis / stock</TableHead><TableHead className="w-[52px]" /></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => onSelect(row)}><TableCell><Badge variant="outline" className="max-w-full truncate text-[10px]">{row.estado_fuente || "Sin estado"}</Badge></TableCell><TableCell><div className="truncate font-mono font-medium">{row.np_numero || "Sin NP"}</div><div className="truncate text-[10px] text-muted-foreground">{row.cliente_nombre || "Sin cliente"}</div></TableCell><TableCell><div className="truncate font-medium">{row.modelo || row.producto || "—"}</div><div className="truncate text-[10px] text-muted-foreground">{[row.producto !== row.modelo && row.producto, row.marca].filter(Boolean).join(" · ")}</div></TableCell><TableCell className="truncate">{row.proveedor || "—"}</TableCell><TableCell><div className="truncate">{[row.oc && `OC ${row.oc}`, row.po && `PO ${row.po}`].filter(Boolean).join(" · ") || "—"}</div></TableCell><TableCell><div className="text-[10px]">ETA {formatDate(row.eta)}</div><div className="text-[10px] text-muted-foreground">ATA {formatDate(row.ata)}</div></TableCell><TableCell><div className="truncate font-mono text-[10px]">{row.chasis || "Sin chasis"}</div>{row.estado_disponibilidad && <Badge variant="outline" className={availabilityClass(row.estado_disponibilidad)}>{AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad}</Badge>}</TableCell><TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell></TableRow>)}</TableBody></Table>;
}

function ImportDetailDrawer({ row, onOpenChange }: { row: ImportRow | null; onOpenChange: (open: boolean) => void }) {
  if (!row) return null;
  const groups = [
    { title: "Unidad importada", values: [["Máquina", row.modelo || row.producto], ["Producto", row.producto], ["Marca", row.marca], ["Chasis", row.chasis], ["Cantidad", row.cantidad]] },
    { title: "Pedido vinculado", values: [["NP", row.np_numero], ["Cliente", row.cliente_nombre], ["Comercial", row.comercial], ["Situación del vínculo", row.situacion_vinculo]] },
    { title: "Logística", values: [["Estado", row.estado_fuente], ["Proveedor", row.proveedor], ["OC", row.oc], ["PO", row.po], ["ETA", formatDate(row.eta)], ["ATA", formatDate(row.ata)]] },
    { title: "Documentación y valores", values: [["Factura proveedor", row.invoice_supplier], ["Costo final", row.costo_final], ["Venta facturada", row.venta_facturada], ["Valor de venta", row.valor_venta]] },
    { title: "Stock vinculado", values: [["Disponibilidad", row.estado_disponibilidad ? AVAILABILITY_LABEL[row.estado_disponibilidad] ?? row.estado_disponibilidad : null], ["Sucursal", row.stock_sucursal], ["Depósito", row.stock_deposito], ["Saldo", row.stock_saldo], ["Detalle", row.disponibilidad_detalle]] },
  ].map((group) => ({ ...group, values: group.values.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "—") })).filter((group) => group.values.length);
  return <ResponsiveDrawer open onOpenChange={onOpenChange} size="lg"><ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">{row.modelo || row.producto || "Importación"}</h2><p className="text-[11px] text-muted-foreground">{row.np_numero ? `NP ${row.np_numero}` : "Sin NP vinculada"} · {row.estado_fuente || "Sin estado"}</p></ResponsiveDrawerHeader><ResponsiveDrawerBody className="space-y-4">{groups.map((group) => <section key={group.title}><h3 className="mb-2 text-[12px] font-semibold">{group.title}</h3><dl className="grid gap-x-4 gap-y-2 rounded-lg border p-3 sm:grid-cols-2">{group.values.map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="break-words text-[12px] font-medium">{String(value)}</dd></div>)}</dl></section>)}</ResponsiveDrawerBody></ResponsiveDrawer>;
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
    <ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">Nueva operación</h2><p className="text-[11px] text-muted-foreground">Subí la foto de la NP, verificá lo leído y completá solamente lo faltante.</p></ResponsiveDrawerHeader>
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
  return <ResponsiveDrawer open={!!operationId} onOpenChange={onOpenChange} size="xl">
    <ResponsiveDrawerHeader><h2 className="text-[16px] font-semibold">NP {detail?.np_numero ?? "—"}</h2><p className="text-[11px] text-muted-foreground">{detail?.cliente_nombre ?? "Cargando..."} · {detail ? STATE_LABEL[detail.estado] : ""}</p></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      {detail && <>
        <KpiStrip className="grid-cols-3"><KpiItem label="Unidades" value={detail.unidades} /><KpiItem label="Documentos" value={detail.documentos} /><KpiItem label="Fecha NP" value={formatDate(detail.np_fecha)} /></KpiStrip>
        <div><h3 className="mb-2 text-[13px] font-semibold">Detalle de máquinas</h3><div className="space-y-2">{detail.lines.map((line) => { const extracted = line.datos_extraidos ?? {}; const model = line.modelo || extracted.modelo; const product = line.producto || extracted.producto; const year = line.anio ?? extracted.anio; const head = line.cabezal || extracted.cabezal; return <div key={line.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="text-[12px] font-medium">{model || product || "Sin descripción"}</div><div className="text-[10px] text-muted-foreground">{[product && product !== model ? product : null, year && `Año ${year}`, head && `Cabezal: ${head}`, line.marca, line.condicion, line.abastecimiento].filter(Boolean).join(" · ")}</div></div><Badge variant={line.elegible_parque ? "secondary" : "outline"}>{line.elegible_parque ? "Admitida al Parque" : "Solo operación"}</Badge></div>; })}</div></div>
        <div><h3 className="mb-2 text-[13px] font-semibold">Documentos</h3>{detail.docs.length ? <div className="space-y-1">{detail.docs.map((doc) => <button type="button" key={doc.id} onClick={() => openDocument(doc.storage_path)} className="flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-left text-[11px] hover:bg-muted"><span className="flex min-w-0 items-center gap-2"><Eye className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{doc.archivo_nombre}</span></span><span className="flex items-center gap-2"><Badge variant="outline">{doc.tipo}</Badge><span className="font-medium text-primary">Ver</span></span></button>)}</div> : <p className="text-[11px] text-muted-foreground">Aún no hay documentos adjuntos.</p>}</div>
        {(detail.requiere_importacion || detail.importation) && <div className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-[13px] font-semibold">Factura de importación</h3><p className="text-[11px] text-muted-foreground">Completa chasis y valor facturado; la propuesta siempre requiere confirmación.</p></div><Button variant="outline" size="sm" onClick={() => invoiceRef.current?.click()} disabled={reading}><Upload className="mr-1.5 h-3.5 w-3.5" />{reading ? "Leyendo..." : "Subir factura"}</Button></div><input ref={invoiceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseInvoice(e.target.files?.[0])} />
          {invoiceData && <div className="mt-3 space-y-3 border-t pt-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="Factura"><Input value={invoiceData.factura_numero ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, factura_numero: e.target.value })} /></Field><Field label="Fecha"><Input type="date" value={invoiceData.factura_fecha ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, factura_fecha: e.target.value })} /></Field><Field label="Valor facturado"><Input type="number" value={invoiceData.valor_facturado ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, valor_facturado: e.target.value })} /></Field><Field label="Moneda"><Input value={invoiceData.moneda ?? ""} onChange={(e) => setInvoiceData({ ...invoiceData, moneda: e.target.value })} /></Field></div><Field label="Chasis (uno por línea)"><Textarea rows={3} value={(invoiceData.chasis ?? []).join("\n")} onChange={(e) => setInvoiceData({ ...invoiceData, chasis: e.target.value.split("\n") })} /></Field><div className="flex justify-end"><Button size="sm" onClick={confirmInvoice} disabled={saving}>{saving ? "Guardando..." : "Confirmar factura"}</Button></div></div>}
        </div>}
        {detail.observaciones && <div className="rounded-lg bg-muted/40 p-3 text-[11px]">{detail.observaciones}</div>}
      </>}
    </ResponsiveDrawerBody>
  </ResponsiveDrawer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>; }
function CompactSelect({ value, values, onChange }: { value: string; values: readonly string[]; onChange: (v: string) => void }) { return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{values.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>; }
