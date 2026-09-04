import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, History } from "lucide-react";
import { toast } from "sonner";
import { SUCURSALES, MARCAS, type Sucursal, type Marca } from "@/lib/constants";
import {
  NEW_SYSTEM_START,
  isMissingBillingLinesTableError,
  isMissingOsImportTableError,
  matchSucursal,
  matchSucursalFromRegion,
  normCode,
  normText,
  persistNewSystemBundle,
  actualizarVentasRepuestosPeriodo,
  prepareNewSystemImportBundle,
  type NewSystemImportBundle,
} from "@/lib/imports";
import {
  clasificarGrupoFacturacion,
  clasificarMarcaFacturacion,
  clasificarTipoTiempoFacturacion,
  type GrupoNormalizadoFacturacion,
  type TipoTiempoFacturacion,
} from "@/lib/facturacionReglas";
import { cn } from "@/lib/utils";
import { importedServiceOrderParticipants } from "@/lib/technicianMatching";

const SUBGRUPOS_VALIDOS = new Set([
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS",
  "PLATAFORMAS/CABEZALES",
  "PULVERIZADORAS",
  "TRACTORES",
  "SUELO",
  "OTRO",
]);

const normalizarSubgrupoParque = (value: unknown): string => {
  const raw = norm(value).toUpperCase().replace(/\s+/g, " ");

  if (!raw) return "OTRO";

  if (raw.includes("COSECH")) return "COSECHADORAS";
  if (raw.includes("SEMBR")) return "SEMBRADORAS";
  if (raw.includes("PICAD")) return "PICADORAS";
  if (raw.includes("PULVER")) return "PULVERIZADORAS";
  if (raw.includes("TRACT")) return "TRACTORES";
  if (raw.includes("SUELO")) return "SUELO";

  if (
    raw.includes("PLATAFORMA") ||
    raw.includes("CABEZAL") ||
    raw.includes("CABEZALES") ||
    raw.includes("HEADER")
  ) {
    return "PLATAFORMAS/CABEZALES";
  }

  return SUBGRUPOS_VALIDOS.has(raw) ? raw : "OTRO";
};

interface ParqueRow {
  anio: number | null;
  sucursal: Sucursal | null;
  subgrupo: string;
  modelo_tipo: string | null;
  serie: string;
  cliente_nombre: string;
  marca: Marca;
  vendedor: string | null;
  localidad: string | null;
  _isNew: boolean;
}

interface FactRow {
  fecha: string;
  sucursal: Sucursal | null;
  entidad_nombre: string;
  cod_entidad: string | null;
  total_venta: number;
  cantidad: number;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
  tipo: "Repuesto" | "Servicio";
  _isNew: boolean;
}

interface ClienteRow {
  cod_entidad: string | null;
  nombre: string;
  ruc: string | null;
  region: string | null;
  direccion: string | null;
  localidad: string | null;
  correo_principal: string | null;
  sucursal: Sucursal | null;
  _isNew: boolean;
  _matchedId?: string | null;
}

interface ContactoRow {
  cliente_cod_entidad: string | null;
  cliente_ruc: string | null;
  cliente_nombre: string | null;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  correo: string | null;
  es_whatsapp: boolean;
  es_principal: boolean;
  notas: string | null;
  _isNew: boolean;
  _clienteId: string | null;
  _status: "ok" | "sin-cliente" | "duplicado";
}

interface OrdenServicioRow {
  os_numero: string;
  trabajo_id: string | null;
  trabajo_codigo: string | null;
  cliente_nombre: string | null;
  situacion_os: string | null;
  situacion_facturacion: string | null;
  responsable: string | null;
  cod_mecanico: string | null;
  factura: string | null;
  cod_interno: string | null;
  fecha_abierta_os: string | null;
  fecha_emision_factura: string | null;
  nro_chasis: string | null;
  marca: string | null;
  tipo_tiempo: string | null;
  problema: string | null;
  km_cantidad: number;
  km_valor_unitario: number;
  servicios_cantidad: number;
  servicios_valor_unitario: number;
  terceros_valor: number;
  kilometro_valor: number;
  servicios_valor: number;
  repuesto_valor: number;
  raw_data: Record<string, unknown>;
  _isNew: boolean;
}

interface FacturacionGridRow {
  origen_sistema: string;
  codigo_interno_factura: string | null;
  factura: string | null;
  entidad_nombre: string;
  fecha_factura: string | null;
  sucursal: Sucursal | null;
  subgrupo_original: string | null;
  grupo_normalizado: GrupoNormalizadoFacturacion;
  marca_normalizada: Marca;
  tipo_facturacion: "Repuesto" | "Servicio";
  tipo_tiempo: TipoTiempoFacturacion;
  observacion: string | null;
  cod_mercaderia: string | null;
  codigo_fabricante: string | null;
  mercaderia: string | null;
  cantidad: number;
  valor_unitario: number;
  total_venta: number;
  raw_data: Record<string, unknown>;
  _isNew: boolean;
}

type NewSystemXmlKind = "facturacion" | "ordenesServicio" | "productos";

interface NewSystemXmlFile {
  fileName: string;
  xmlText: string;
}

interface NewSystemXmlFilesState {
  facturacion: NewSystemXmlFile | null;
  ordenesServicio: NewSystemXmlFile | null;
  productos: NewSystemXmlFile | null;
}

interface Imp {
  id: string;
  tipo: "parque" | "facturacion" | "ordenes_servicio";
  total_filas: number;
  insertados: number;
  duplicados: number;
  archivo_nombre: string | null;
  creado_en: string;
  usuario_id: string | null;
}

const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();
const normRuc = (s: unknown) => norm(s).replace(/[.\s-]/g, "").toLowerCase();
const normPhone = (s: unknown) => norm(s).replace(/[^\d]/g, "");
const normOs = (s: unknown) => norm(s).replace(/[^\d]/g, "");
const normHeader = (s: unknown) =>
  norm(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseMoney = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const raw = String(v).trim();
  if (!raw) return 0;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > lastDot) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return Number(normalized) || 0;
  }

  const normalized = cleaned.replace(/,/g, "");
  return Number(normalized) || 0;
};

const factKey = (row: {
  cod_factura: string;
  tipo: "Repuesto" | "Servicio";
  fecha: string;
  cod_entidad: string | null;
  entidad_nombre: string;
  sucursal: Sucursal | null;
  grupo: string | null;
  grupo_fx: string | null;
}) =>
  [
    normCode(row.cod_factura),
    row.tipo,
    row.fecha,
    normCode(row.cod_entidad),
    normText(row.entidad_nombre),
    normText(row.sucursal),
    normText(row.grupo),
    normText(row.grupo_fx),
  ].join("|");

const parseExcelDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
};

const matchMarca = (s: unknown): Marca | null => {
  const v = lower(s);
  return (MARCAS.find((x) => x.toLowerCase() === v) ?? null) as Marca | null;
};

const pick = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const alias = normHeader(a);
    const k = keys.find((x) => x.trim().toLowerCase() === a.toLowerCase() || normHeader(x) === alias);
    if (k != null && row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  return null;
};

const osHeaderScore = (row: Record<string, unknown>): number => {
  const situacionOs = norm(pick(row, ["Situación O.S", "Situacion O.S", "Situacion OS"])).toLowerCase();
  const tipoTiempo = norm(pick(row, ["Tipo de Tiempo"]));
  const valores =
    parseMoney(pick(row, ["Terceros"])) +
    parseMoney(pick(row, ["Kilometro", "Kilómetro"])) +
    parseMoney(pick(row, ["Servicios"])) +
    parseMoney(pick(row, ["Repuesto"]));

  return (
    (situacionOs.includes("cerrad") ? 1000 : 0) +
    (valores > 0 ? 500 : 0) +
    (tipoTiempo ? 100 : 0) +
    (parseExcelDate(pick(row, ["Fc Abierta OS", "Fecha Abierta OS"])) ? 10 : 0)
  );
};

const applyOrdenServicioHeader = (target: OrdenServicioRow, source: Record<string, unknown>) => {
  target.cliente_nombre = norm(pick(source, ["Nombre", "Cliente"])) || target.cliente_nombre;
  target.situacion_os = norm(pick(source, ["Situación O.S", "Situacion O.S", "Situacion OS"])) || target.situacion_os;
  target.situacion_facturacion = norm(pick(source, ["Situación", "Situacion"])) || target.situacion_facturacion;
  target.responsable = norm(pick(source, ["Responsable"])) || target.responsable;
  target.cod_mecanico = norm(pick(source, ["Cod. Mecanico", "Cod Mecanico"])) || target.cod_mecanico;
  target.factura = norm(pick(source, ["Factura"])) || target.factura;
  target.cod_interno = norm(pick(source, ["Cod. Interno", "Cod Interno"])) || target.cod_interno;
  target.fecha_abierta_os = parseExcelDate(pick(source, ["Fc Abierta OS", "Fecha Abierta OS"])) || target.fecha_abierta_os;
  target.fecha_emision_factura = parseExcelDate(pick(source, ["Emisión Fact.", "Emision Fact.", "Fecha Factura"])) || target.fecha_emision_factura;
  target.nro_chasis = norm(pick(source, ["Nro Chasis", "Nº Chasis"])) || target.nro_chasis;
  target.marca = norm(pick(source, ["Marca"])) || target.marca;
  target.tipo_tiempo = norm(pick(source, ["Tipo de Tiempo"])) || target.tipo_tiempo;
  target.problema = norm(pick(source, ["Problema"])) || target.problema;
};

export function ImportarTab({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [parqueRows, setParqueRows] = useState<ParqueRow[] | null>(null);
  const [parqueFile, setParqueFile] = useState<string>("");
  const [factRows, setFactRows] = useState<FactRow[] | null>(null);
  const [factFile, setFactFile] = useState<string>("");
  const [cliRows, setCliRows] = useState<ClienteRow[] | null>(null);
  const [cliFile, setCliFile] = useState<string>("");
  const [conRows, setConRows] = useState<ContactoRow[] | null>(null);
  const [conFile, setConFile] = useState<string>("");
  const [osRows, setOsRows] = useState<OrdenServicioRow[] | null>(null);
  const [osFile, setOsFile] = useState<string>("");
  const [gridRows, setGridRows] = useState<FacturacionGridRow[] | null>(null);
  const [gridFile, setGridFile] = useState<string>("");
  const [newSystemFiles, setNewSystemFiles] = useState<NewSystemXmlFilesState>({
    facturacion: null,
    ordenesServicio: null,
    productos: null,
  });
  const [newSystemPreview, setNewSystemPreview] = useState<NewSystemImportBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<Imp[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [factDiag, setFactDiag] = useState<{
    porHoja: Record<string, number>;
    sinFecha: number;
    sinEntidad: number;
    descTpMov: number;
    grupoFxNoComercial: { grupo: string; count: number }[];
    repuestoTotal: number;
    servicioTotal: number;
    repuestoNuevos: number;
    servicioNuevos: number;
  } | null>(null);
  const [gridDiag, setGridDiag] = useState<{
    total: number;
    garantia: number;
    interno: number;
    cliente: number;
    sinFecha: number;
    sinFactura: number;
    sinCodigoInterno: number;
    sinCodMercaderia: number;
    porMarca: Record<Marca, number>;
    porSubgrupo: { subgrupo: string; total: number; lineas: number }[];
  } | null>(null);

  const resetNewSystemImport = () => {
    setNewSystemFiles({
      facturacion: null,
      ordenesServicio: null,
      productos: null,
    });
    setNewSystemPreview(null);
  };

  const cargarHistorial = async () => {
    const [imp, prof] = await Promise.all([
      supabase.from("importaciones").select("*").order("creado_en", { ascending: false }).limit(20),
      supabase.from("profiles").select("id, nombre"),
    ]);
    setHistorial((imp.data ?? []) as Imp[]);
    setProfiles(
      Object.fromEntries(((prof.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre])),
    );
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarTodosLosClientes = async () => {
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      all.push(...data);

      if (data.length < PAGE) break;
      from += PAGE;
    }

    return all;
  };

  const procesarOrdenesServicio = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName =
        wb.SheetNames.find((x) => x.trim().toLowerCase() === "ordenes de servicios - cdm") ??
        wb.SheetNames[0];

      if (!sheetName) return toast.error("No se encontró una hoja válida");

      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
      if (json.length === 0) return toast.error("Excel vacío");

      const [{ data: importadas }, { data: trabajos }] = await Promise.all([
        (supabase.from("ordenes_servicio_importadas" as any).select("os_numero") as any),
        supabase.from("trabajos").select("id, codigo, proxima_accion"),
      ]);

      const osImportadas = new Set<string>((importadas ?? []).map((r: any) => normOs(r.os_numero)));
      const trabajosPorOs = new Map<string, { id: string; codigo: string | null }>();
      for (const t of trabajos ?? []) {
        const os = normOs((t as any).proxima_accion) || normOs((t as any).codigo);
        if (os) trabajosPorOs.set(os, { id: t.id, codigo: t.codigo });
      }

      const rowsByOs = new Map<string, OrdenServicioRow>();
      const headerScoreByOs = new Map<string, number>();
      for (const r of json) {
        const os = normOs(pick(r, ["Nº OS", "N OS", "Nro OS", "Nro. OS", "Numero OS", "Número OS", "OS"]));
        if (!os) continue;

        const trabajo = trabajosPorOs.get(os) ?? null;
        const prev = rowsByOs.get(os);
        const row: OrdenServicioRow = prev ?? {
          os_numero: os,
          trabajo_id: trabajo?.id ?? null,
          trabajo_codigo: trabajo?.codigo ?? null,
          cliente_nombre: norm(pick(r, ["Nombre", "Cliente"])) || null,
          situacion_os: norm(pick(r, ["Situación O.S", "Situacion O.S", "Situacion OS"])) || null,
          situacion_facturacion: norm(pick(r, ["Situación", "Situacion"])) || null,
          responsable: norm(pick(r, ["Responsable"])) || null,
          cod_mecanico: norm(pick(r, ["Cod. Mecanico", "Cod Mecanico"])) || null,
          factura: norm(pick(r, ["Factura"])) || null,
          cod_interno: norm(pick(r, ["Cod. Interno", "Cod Interno"])) || null,
          fecha_abierta_os: parseExcelDate(pick(r, ["Fc Abierta OS", "Fecha Abierta OS"])),
          fecha_emision_factura: parseExcelDate(pick(r, ["Emisión Fact.", "Emision Fact.", "Fecha Factura"])),
          nro_chasis: norm(pick(r, ["Nro Chasis", "Nº Chasis"])) || null,
          marca: norm(pick(r, ["Marca"])) || null,
          tipo_tiempo: norm(pick(r, ["Tipo de Tiempo"])) || null,
          problema: norm(pick(r, ["Problema"])) || null,
          km_cantidad: 0,
          km_valor_unitario: 0,
          servicios_cantidad: 0,
          servicios_valor_unitario: 0,
          terceros_valor: 0,
          kilometro_valor: 0,
          servicios_valor: 0,
          repuesto_valor: 0,
          raw_data: {},
          _isNew: !osImportadas.has(os),
        };
        const incomingHeaderScore = osHeaderScore(r);
        const currentHeaderScore = headerScoreByOs.get(os) ?? -1;
        if (!prev || incomingHeaderScore >= currentHeaderScore) {
          applyOrdenServicioHeader(row, r);
          headerScoreByOs.set(os, incomingHeaderScore);
        }

        row.km_cantidad += parseMoney(pick(r, ["Km Cnt. Utilizada", "Km Cnt Utilizada"]));
        row.km_valor_unitario = row.km_valor_unitario || parseMoney(pick(r, ["Km Vlr. Unitario", "Km Vlr Unitario"]));
        row.servicios_cantidad += parseMoney(pick(r, ["Servicios Cnt. Utilizada", "Servicios Cnt Utilizada"]));
        row.servicios_valor_unitario = row.servicios_valor_unitario || parseMoney(pick(r, ["Servicios Vlr. Unitario", "Servicios Vlr Unitario"]));
        row.terceros_valor += parseMoney(pick(r, ["Terceros"]));
        row.kilometro_valor += parseMoney(pick(r, ["Kilometro", "Kilómetro"]));
        row.servicios_valor += parseMoney(pick(r, ["Servicios"]));
        row.repuesto_valor += parseMoney(pick(r, ["Repuesto"]));
        const previousRaw = row.raw_data as Record<string, any>;
        const previousParticipants = importedServiceOrderParticipants(previousRaw, row.responsable);
        const rowResponsible = norm(pick(r, ["Responsable"])) || null;
        const rowParticipants = importedServiceOrderParticipants(r, rowResponsible);
        const participantNames = Array.from(new Set([...previousParticipants, ...rowParticipants]));
        const totalsByTechnician = { ...(previousRaw.totales_por_tecnico ?? {}) } as Record<string, any>;
        const rowTotals = {
          horas: parseMoney(pick(r, ["Servicios Cnt. Utilizada", "Servicios Cnt Utilizada"])),
          kilometros: parseMoney(pick(r, ["Km Cnt. Utilizada", "Km Cnt Utilizada"])),
          valor_servicio: parseMoney(pick(r, ["Servicios"])),
          valor_repuestos: parseMoney(pick(r, ["Repuesto"])),
          valor_kilometraje: parseMoney(pick(r, ["Kilometro"])),
          valor_terceros: parseMoney(pick(r, ["Terceros"])),
        };

        for (const participant of rowParticipants) {
          const current = totalsByTechnician[participant] ?? {
            horas: 0,
            kilometros: 0,
            valor_servicio: 0,
            valor_repuestos: 0,
            valor_kilometraje: 0,
            valor_terceros: 0,
          };
          current.horas += rowTotals.horas;
          current.kilometros += rowTotals.kilometros;
          current.valor_servicio += rowTotals.valor_servicio;
          current.valor_repuestos += rowTotals.valor_repuestos;
          current.valor_kilometraje += rowTotals.valor_kilometraje;
          current.valor_terceros += rowTotals.valor_terceros;
          totalsByTechnician[participant] = current;
        }

        row.raw_data = {
          ...row.raw_data,
          ...r,
          tecnicos_participantes: participantNames,
          totales_por_tecnico: totalsByTechnician,
        };

        rowsByOs.set(os, row);
      }

      const rows = [...rowsByOs.values()].sort((a, b) => Number(b.os_numero) - Number(a.os_numero));
      if (rows.length === 0) return toast.error("No encontré filas con Nº OS");

      setOsRows(rows);
      setOsFile(file.name);
      const vinculadas = rows.filter((r) => r.trabajo_id).length;
      toast.success(`Leídas ${rows.length} OS. ${vinculadas} ya coinciden con trabajos.`);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const procesarNuevoSistemaXml = async (kind: NewSystemXmlKind, file: File) => {
    try {
      const xmlText = await file.text();
      const nextFiles: NewSystemXmlFilesState = {
        ...newSystemFiles,
        [kind]: {
          fileName: file.name,
          xmlText,
        },
      };

      setNewSystemFiles(nextFiles);

      if (!nextFiles.facturacion || !nextFiles.ordenesServicio || !nextFiles.productos) {
        setNewSystemPreview(null);
        const missing = [
          !nextFiles.facturacion ? "Facturación" : null,
          !nextFiles.ordenesServicio ? "Órdenes de servicio" : null,
          !nextFiles.productos ? "Maestro de productos" : null,
        ].filter(Boolean);
        toast.success(`Archivo cargado. Faltan: ${missing.join(", ")}.`);
        return;
      }

      const bundle = prepareNewSystemImportBundle({
        facturacion: nextFiles.facturacion,
        ordenesServicio: nextFiles.ordenesServicio,
        productos: nextFiles.productos,
        usuarioId: user?.id ?? null,
      });

      setNewSystemPreview(bundle);
      toast.success(
        `Nuevo sistema listo: ${bundle.diagnostics.billingRows} líneas de facturación y ${bundle.diagnostics.serviceOrders} líneas de OS.`,
      );
    } catch (e) {
      setNewSystemPreview(null);
      toast.error("Error leyendo XML del nuevo sistema: " + (e as Error).message);
    }
  };

  const confirmarOrdenesServicio = async () => {
    if (!osRows || !user) return;

    setBusy(true);
    try {
      const payload = osRows.map((r) => ({
        os_numero: r.os_numero,
        trabajo_id: r.trabajo_id,
        cliente_nombre: r.cliente_nombre,
        situacion_os: r.situacion_os,
        situacion_facturacion: r.situacion_facturacion,
        responsable: r.responsable,
        cod_mecanico: r.cod_mecanico,
        factura: r.factura,
        cod_interno: r.cod_interno,
        fecha_abierta_os: r.fecha_abierta_os,
        fecha_emision_factura: r.fecha_emision_factura,
        nro_chasis: r.nro_chasis,
        marca: r.marca,
        tipo_tiempo: r.tipo_tiempo,
        problema: r.problema,
        km_cantidad: r.km_cantidad,
        km_valor_unitario: r.km_valor_unitario,
        servicios_cantidad: r.servicios_cantidad,
        servicios_valor_unitario: r.servicios_valor_unitario,
        terceros_valor: r.terceros_valor,
        kilometro_valor: r.kilometro_valor,
        servicios_valor: r.servicios_valor,
        repuesto_valor: r.repuesto_valor,
        raw_data: r.raw_data,
        actualizado_en: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await (supabase.from("ordenes_servicio_importadas" as any).upsert(chunk, {
          onConflict: "os_numero",
        }) as any);
        if (error) {
          if (!isMissingOsImportTableError(error)) throw error;

          const vinculadas = osRows.filter((r) => r.trabajo_id);
          for (const r of vinculadas) {
            const { error: updateError } = await supabase
              .from("trabajos")
              .update({ proxima_accion: `OS:${r.os_numero}` } as any)
              .eq("id", r.trabajo_id!);
            if (updateError) throw updateError;
          }

          const historial = vinculadas.map((r) => ({
            trabajo_id: r.trabajo_id!,
            tipo_evento: "observacion" as const,
            usuario_id: user.id,
            payload: {
              tipo: "orden_servicio_importada",
              os_numero: r.os_numero,
              tipo_tiempo: r.tipo_tiempo,
              servicios_cantidad: r.servicios_cantidad,
              terceros_valor: r.terceros_valor,
              kilometro_valor: r.kilometro_valor,
              servicios_valor: r.servicios_valor,
              repuesto_valor: r.repuesto_valor,
              factura: r.factura,
              situacion_os: r.situacion_os,
              situacion_facturacion: r.situacion_facturacion,
              problema: r.problema,
              actualizado_en: new Date().toISOString(),
            },
          }));
          if (historial.length > 0) {
            const { error: histError } = await supabase.from("trabajo_historial").insert(historial as any);
            if (histError) throw histError;
          }

          toast.warning(
            `La tabla de detalle OS todavía no está disponible. Guardé ${vinculadas.length} detalles de OS en el historial del trabajo.`,
          );
          setOsRows(null);
          setOsFile("");
          await cargarHistorial();
          onChanged();
          return;
        }
      }

      const nuevas = osRows.filter((r) => r._isNew).length;
      const vinculadas = osRows.filter((r) => r.trabajo_id).length;
      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "ordenes_servicio" as any,
        total_filas: osRows.length,
        insertados: nuevas,
        duplicados: osRows.length - nuevas,
        archivo_nombre: osFile,
      });

      const { error: refreshParkError } = await (supabase.rpc as any)("refrescar_parque_ultima_actividad");
      if (refreshParkError) console.error("No se pudo reconciliar la ultima actividad del Parque", refreshParkError);

      toast.success(`Importadas ${osRows.length} OS. ${vinculadas} vinculadas a trabajos.`);
      setOsRows(null);
      setOsFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmarNuevoSistemaXml = async () => {
    if (!newSystemPreview || !user) return;

    setBusy(true);
    try {
      const resultado = await persistNewSystemBundle({
        bundle: newSystemPreview,
        userId: user.id,
        fileNames: {
          facturacion: newSystemFiles.facturacion?.fileName ?? null,
          ordenesServicio: newSystemFiles.ordenesServicio?.fileName ?? null,
          productos: newSystemFiles.productos?.fileName ?? null,
        },
      });

      toast.success(
        `Nuevo sistema importado: ${resultado.facturacionLineas} líneas de facturación y ${resultado.ordenesServicio} líneas de OS.`,
      );
      if (resultado.historialRepuestosError) toast.warning(resultado.historialRepuestosError);
      resetNewSystemImport();
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "ventas_unificadas"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error importando nuevo sistema: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const procesarParque = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const sheetName = wb.SheetNames.find((x) => x.trim().toLowerCase() === "bd_claas_horsch");
      if (!sheetName) {
        return toast.error("No se encontró la hoja BD_CLAAS_HORSCH");
      }

      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) return toast.error("Excel vacío");

      const seriesExistentes = new Set<string>();
      const { data: existentes } = await supabase.from("parque_maquinas").select("serie");
      for (const e of existentes ?? []) {
        if (e.serie) seriesExistentes.add(normText(e.serie));
      }

      const rows: ParqueRow[] = [];
      for (const r of json) {
        const serie = norm(r["SERIE"] ?? r["serie"]);
        if (!serie) continue;

        const marca = matchMarca(r["MARCA"] ?? r["marca"]) ?? "CLAAS";
        const subgrupo = normalizarSubgrupoParque(r["SUBGRUPO"] ?? r["subgrupo"]);
        const anioVal = r["AÑO"] ?? r["ANO"] ?? r["ANIO"] ?? r["año"];
        const anio = anioVal ? Number(anioVal) || null : null;

        rows.push({
          anio,
          sucursal: matchSucursal(r["SUCURSAL"] ?? r["sucursal"]),
          subgrupo,
          modelo_tipo: norm(r["MODELO_TIPO"] ?? r["MODELO"] ?? r["modelo_tipo"]) || null,
          serie,
          cliente_nombre: norm(r["CLIENTE"] ?? r["cliente"]),
          marca,
          vendedor: norm(r["VENDEDOR"] ?? r["vendedor"]) || null,
          localidad: norm(r["LOCALIDAD"] ?? r["localidad"]) || null,
          _isNew: !seriesExistentes.has(normText(serie)),
        });
      }

      setParqueRows(rows);
      setParqueFile(file.name);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarParque = async () => {
    if (!parqueRows || !user) return;

    const nuevos = parqueRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay registros nuevos");

    setBusy(true);
    try {
      const cliExistentes = await cargarTodosLosClientes();

      const cliMap = new Map<string, string>();
      for (const c of cliExistentes ?? []) {
        if (c.nombre) cliMap.set(normText(c.nombre), c.id);
      }

      // Parque representa equipos de clientes de marcas admitidas. Las filas
      // OTROS siguen siendo validas en Operaciones, pero no deben hacer fallar
      // atomicamente una importacion completa del Excel de Parque.
      const marcasAdmitidas = nuevos.filter((r) => r.marca === "CLAAS" || r.marca === "HORSCH");
      const omitidosMarca = nuevos.length - marcasAdmitidas.length;
      const validos = marcasAdmitidas.filter((r) => cliMap.has(normText(r.cliente_nombre)));
      const omitidosCliente = marcasAdmitidas.length - validos.length;

      if (validos.length === 0) {
        if (marcasAdmitidas.length === 0) {
          return toast.error("El archivo no contiene máquinas CLAAS o HORSCH admitidas al Parque");
        }
        return toast.error("Ninguna máquina coincide exactamente con un cliente existente");
      }

      const insertMaq = validos.map((r) => ({
        cliente_id: cliMap.get(normText(r.cliente_nombre)) ?? null,
        anio: r.anio,
        sucursal: r.sucursal,
        localidad: r.localidad,
        subgrupo: r.subgrupo as never,
        modelo_tipo: r.modelo_tipo,
        serie: r.serie,
        vendedor: r.vendedor,
        marca: r.marca,
        agregado_manualmente: false,
      }));

      const { error } = await supabase.from("parque_maquinas").insert(insertMaq);
      if (error) throw error;

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "parque",
        total_filas: parqueRows.length,
        insertados: validos.length,
        duplicados: parqueRows.length - validos.length,
        archivo_nombre: parqueFile,
      });

      if (omitidosMarca > 0 || omitidosCliente > 0) {
        const motivos = [
          omitidosMarca > 0 ? `${omitidosMarca} de marcas no admitidas al Parque` : null,
          omitidosCliente > 0 ? `${omitidosCliente} sin coincidencia exacta de cliente` : null,
        ].filter(Boolean).join("; ");
        toast.success(`Importadas ${validos.length} máquinas. Omitidas: ${motivos}.`);
      } else {
        toast.success(`Importadas ${validos.length} máquinas`);
      }

      setParqueRows(null);
      setParqueFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const procesarFact = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const hojasValidas = wb.SheetNames.filter((name) => {
        const n = name.toLowerCase();
        return n.includes("repuest") || n.includes("servic");
      });

      if (hojasValidas.length === 0) {
        return toast.error("No se encontraron hojas válidas de facturación");
      }

      const existentesKey = new Set<string>();
      let from = 0;
      const PAGE = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("facturacion")
          .select("cod_factura, tipo, fecha, cod_entidad, entidad_nombre, sucursal, grupo, grupo_fx")
          .range(from, from + PAGE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const e of data) {
          existentesKey.add(
            factKey({
              cod_factura: e.cod_factura,
              tipo: e.tipo,
              fecha: e.fecha,
              cod_entidad: e.cod_entidad,
              entidad_nombre: e.entidad_nombre,
              sucursal: e.sucursal,
              grupo: e.grupo,
              grupo_fx: (e as any).grupo_fx ?? null,
            }),
          );
        }

        if (data.length < PAGE) break;
        from += PAGE;
      }

      const agg = new Map<string, FactRow>();

      // Diagnóstico
      const diag = {
        porHoja: {} as Record<string, number>,
        sinFecha: 0,
        sinEntidad: 0,
        descTpMov: 0,
        grupoFxNoComercial: [] as { grupo: string; count: number }[],
        repuestoTotal: 0,
        servicioTotal: 0,
        repuestoNuevos: 0,
        servicioNuevos: 0,
      };
      const grupoFxOtros = new Map<string, number>();

      for (const sheetName of hojasValidas) {
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
        diag.porHoja[sheetName] = json.length;
        if (json.length === 0) continue;

        const tipo: "Repuesto" | "Servicio" =
          sheetName.toLowerCase().includes("servic") ? "Servicio" : "Repuesto";

        for (const r of json) {
          const codFactura = norm(
            pick(r, ["Código Factura", "Codigo Factura", "cod_factura", "Nro. Factura", "Nro Factura"]),
          );
          if (!codFactura) continue;

          const fecha = parseExcelDate(pick(r, ["Fecha Factura", "Fecha", "fecha", "Dt. Emissão"]));
          if (!fecha) {
            diag.sinFecha++;
            continue;
          }

          const tpMov = norm(pick(r, ["Tp. Movimento", "Tipo Movimiento", "tp_movimento"])).toUpperCase();
          if (tpMov && tpMov !== "S") {
            diag.descTpMov++;
            continue;
          }

          const grupoFx = norm(
            pick(r, ["GRUPO FX", "Grupo FX", "grupo fx", "Grupo_FX", "grupo_fx"]),
          ) || null;

          // Diagnóstico: registrar grupos no comerciales en Servicios (sin descartar)
          if (tipo === "Servicio") {
            const g = normText(grupoFx);
            if (!(g.includes("mano de obra") || g.includes("kilometraje"))) {
              const label = grupoFx || "(sin grupo)";
              grupoFxOtros.set(label, (grupoFxOtros.get(label) ?? 0) + 1);
            }
          }

          const codEntidad =
            normCode(pick(r, ["Cod. Entidad", "Cod Entidad", "cod_entidad", "Cod. Cliente"])) || null;
          const entidadNombre = norm(pick(r, ["Entidad", "entidad", "Cliente", "Razão Social"]));
          if (!codEntidad && !entidadNombre) {
            diag.sinEntidad++;
            continue;
          }

          const sucRaw = norm(pick(r, ["Sucursal", "sucursal", "Filial"]));
          const sucursal = matchSucursalFromRegion(sucRaw) ?? matchSucursal(sucRaw);

          const grupo = norm(pick(r, ["Grupo", "grupo"])) || null;
          const totalVenta = parseMoney(pick(r, ["Total Venta", "total venta", "Total venta"]));
          const cantidad = parseMoney(pick(r, ["Cant. Unit.", "Cant Unit", "Cantidad"]));

          const key = factKey({
            cod_factura: codFactura,
            tipo,
            fecha,
            cod_entidad: codEntidad,
            entidad_nombre: entidadNombre,
            sucursal,
            grupo,
            grupo_fx: grupoFx,
          });

          const prev = agg.get(key);
          if (prev) {
            prev.total_venta += totalVenta;
            prev.cantidad += cantidad;
          } else {
            agg.set(key, {
              fecha,
              sucursal,
              entidad_nombre: entidadNombre,
              cod_entidad: codEntidad,
              total_venta: totalVenta,
              cantidad,
              grupo,
              grupo_fx: grupoFx,
              cod_factura: codFactura,
              tipo,
              _isNew: !existentesKey.has(key),
            });
          }
        }
      }

      const rows = Array.from(agg.values());
      if (rows.length === 0) return toast.error("Excel vacío o sin filas válidas");

      // Contadores finales por tipo
      for (const r of rows) {
        if (r.tipo === "Repuesto") {
          diag.repuestoTotal++;
          if (r._isNew) diag.repuestoNuevos++;
        } else {
          diag.servicioTotal++;
          if (r._isNew) diag.servicioNuevos++;
        }
      }
      diag.grupoFxNoComercial = [...grupoFxOtros.entries()]
        .map(([grupo, count]) => ({ grupo, count }))
        .sort((a, b) => b.count - a.count);

      setFactDiag(diag);
      setFactRows(rows);
      setFactFile(file.name);

      toast.success(
        `Leídas ${diag.repuestoTotal} Repuesto + ${diag.servicioTotal} Servicio`,
      );
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarFact = async () => {
    if (!factRows || !user) return;

    const nuevos = factRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay registros nuevos");

    setBusy(true);
    try {
      const cliExistentes = await cargarTodosLosClientes();

      const cliByCod = new Map<string, string>();
      const cliByNombre = new Map<string, string>();

      for (const c of (cliExistentes ?? []) as any[]) {
        if (c.cod_entidad) cliByCod.set(normCode(c.cod_entidad), c.id);
        if (c.nombre) cliByNombre.set(normText(c.nombre), c.id);
      }

      const insertF = nuevos.map((r) => ({
        fecha: r.fecha,
        sucursal: r.sucursal,
        tipo: r.tipo as never,
        cliente_id:
          (r.cod_entidad && cliByCod.get(normCode(r.cod_entidad))) ??
          cliByNombre.get(normText(r.entidad_nombre)) ??
          null,
        entidad_nombre: r.entidad_nombre,
        cod_entidad: r.cod_entidad,
        total_venta: r.total_venta,
        cantidad: r.cantidad,
        grupo: r.grupo,
        grupo_fx: r.grupo_fx,
        cod_factura: r.cod_factura,
        // Este importador viejo (grillas/Excel) no trae ninguna columna de
        // moneda -- se marca "UNKNOWN" en vez de dejarlo null para que el
        // indice unico de mas abajo siga detectando reimportaciones del
        // mismo archivo (Postgres nunca matchea NULL contra NULL).
        moneda: "UNKNOWN",
      }));

      let insertadosReal = 0;
      for (let i = 0; i < insertF.length; i += 500) {
        const chunk = insertF.slice(i, i + 500);
        const { error, count } = await supabase
          .from("facturacion")
          .upsert(chunk as any, {
            onConflict: "cod_factura,tipo,fecha,cod_entidad,entidad_nombre,sucursal,grupo,grupo_fx,moneda",
            count: "exact",
          });
        if (error) throw error;
        insertadosReal += count ?? 0;
      }

      const dupBd = nuevos.length - insertadosReal;

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "facturacion",
        total_filas: factRows.length,
        insertados: insertadosReal,
        duplicados: factRows.length - insertadosReal,
        archivo_nombre: factFile,
      });

      const { error: refreshParkError } = await (supabase.rpc as any)("refrescar_parque_ultima_actividad");
      if (refreshParkError) console.error("No se pudo reconciliar la ultima actividad del Parque", refreshParkError);

      toast.success(
        `Importadas ${insertadosReal} facturas` +
          (dupBd > 0 ? ` (${dupBd} duplicadas ignoradas en BD)` : ""),
      );
      setFactRows(null);
      setFactFile("");
      setFactDiag(null);
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const procesarFacturacionGridCampos = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return toast.error("No se encontro una hoja valida");

      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
      if (json.length === 0) return toast.error("Excel vacio");

      const { data: existentes, error } = await (supabase
        .from("facturacion_lineas_importadas" as any)
        .select("codigo_interno_factura,factura,cod_mercaderia,codigo_fabricante,observacion,total_venta")
        .eq("origen_sistema", "grid_campos") as any);

      if (error) {
        if (isMissingBillingLinesTableError(error)) {
          return toast.error("Falta aplicar la migracion de facturacion detallada antes de importar el GRID.");
        }
        throw error;
      }

      const rowKey = (r: {
        codigo_interno_factura?: unknown;
        factura?: unknown;
        cod_mercaderia?: unknown;
        codigo_fabricante?: unknown;
        observacion?: unknown;
        total_venta?: unknown;
      }) =>
        [
          normCode(r.codigo_interno_factura),
          normCode(r.factura),
          normCode(r.cod_mercaderia),
          normCode(r.codigo_fabricante),
          normText(r.observacion),
          String(parseMoney(r.total_venta).toFixed(6)),
        ].join("|");

      const existentesKey = new Set<string>(
        ((existentes ?? []) as any[]).map((r) =>
          rowKey({
            codigo_interno_factura: r.codigo_interno_factura,
            factura: r.factura,
            cod_mercaderia: r.cod_mercaderia,
            codigo_fabricante: r.codigo_fabricante,
            observacion: r.observacion,
            total_venta: r.total_venta,
          }),
        ),
      );

      const diag = {
        total: 0,
        garantia: 0,
        interno: 0,
        cliente: 0,
        sinFecha: 0,
        sinFactura: 0,
        sinCodigoInterno: 0,
        sinCodMercaderia: 0,
        porMarca: { CLAAS: 0, HORSCH: 0, OTROS: 0 } as Record<Marca, number>,
        porSubgrupo: [] as { subgrupo: string; total: number; lineas: number }[],
      };
      const subgrupoMap = new Map<string, { subgrupo: string; total: number; lineas: number }>();

      const rows: FacturacionGridRow[] = json.map((r) => {
        const codigoInterno =
          norm(pick(r, ["Código Interno", "CÃ³digo Interno", "Codigo Interno", "Cód. Interno", "CÃ³d. Interno", "Cod. Interno"])) ||
          null;
        const factura = norm(pick(r, ["Factura"])) || null;
        const entidad = norm(pick(r, ["Entidad", "Cliente"])) || "Sin entidad";
        const fecha = parseExcelDate(pick(r, ["Fecha Factura", "Fecha"]));
        const sucursal =
          matchSucursalFromRegion(pick(r, ["Sucursal", "Departamento", "Localidad"])) ??
          matchSucursal(pick(r, ["Sucursal", "Departamento", "Localidad"]));
        const subgrupo = norm(pick(r, ["Sub-Grupo", "Subgrupo", "Grupo"])) || null;
        const observacion = norm(pick(r, ["ObservaciÃ³n", "Observacion", "Observación"])) || null;
        const codMercaderia =
          norm(pick(r, ["Cód. Mercadería", "CÃ³d. MercaderÃ­a", "Cod. Mercaderia", "CÃ³d. Mercaderia", "Cód. Mercaderia"])) ||
          null;
        const codigoFabricante = norm(pick(r, ["Código Fabricante", "CÃ³digo Fabricante", "Codigo Fabricante"])) || null;
        const mercaderia = norm(pick(r, ["MercaderÃ­a", "Mercaderia", "Mercadería", "Nombre ImpresiÃ³n", "Nombre Impresión"])) || null;
        const cantidad = parseMoney(pick(r, ["Cant. Unit.", "Cant Unit", "Cantidad"]));
        const valorUnitario = parseMoney(pick(r, ["Valor Unitario"]));
        const totalVenta = parseMoney(pick(r, ["Sub-total Items", "Sub-Total (Facturas)", "Sub-Total Facturas", "Total Venta"]));
        const tipoTiempo = clasificarTipoTiempoFacturacion(entidad, observacion);
        const marca = clasificarMarcaFacturacion(subgrupo);
        const grupoNormalizado = clasificarGrupoFacturacion(subgrupo);
        const tipoFacturacion: "Repuesto" | "Servicio" =
          grupoNormalizado === "Servicio" || lower(subgrupo).includes("service") || lower(subgrupo).includes("servicio")
            ? "Servicio"
            : "Repuesto";
        const key = rowKey({
          codigo_interno_factura: codigoInterno,
          factura,
          cod_mercaderia: codMercaderia,
          codigo_fabricante: codigoFabricante,
          observacion,
          total_venta: totalVenta,
        });

        diag.total++;
        if (tipoTiempo === "Garantia") diag.garantia++;
        if (tipoTiempo === "Interno") diag.interno++;
        if (tipoTiempo === "Cliente") diag.cliente++;
        if (!fecha) diag.sinFecha++;
        if (!factura) diag.sinFactura++;
        if (!codigoInterno) diag.sinCodigoInterno++;
        if (!codMercaderia) diag.sinCodMercaderia++;
        diag.porMarca[marca]++;

        const subKey = subgrupo || "(sin subgrupo)";
        const current = subgrupoMap.get(subKey) ?? { subgrupo: subKey, total: 0, lineas: 0 };
        current.total += totalVenta;
        current.lineas++;
        subgrupoMap.set(subKey, current);

        return {
          origen_sistema: "grid_campos",
          codigo_interno_factura: codigoInterno,
          factura,
          entidad_nombre: entidad,
          fecha_factura: fecha,
          sucursal,
          subgrupo_original: subgrupo,
          grupo_normalizado: grupoNormalizado,
          marca_normalizada: marca,
          tipo_facturacion: tipoFacturacion,
          tipo_tiempo: tipoTiempo,
          observacion,
          cod_mercaderia: codMercaderia,
          codigo_fabricante: codigoFabricante,
          mercaderia,
          cantidad,
          valor_unitario: valorUnitario,
          total_venta: totalVenta,
          raw_data: r,
          _isNew: !existentesKey.has(key),
        };
      });

      diag.porSubgrupo = [...subgrupoMap.values()]
        .map((row) => ({ ...row, total: Number(row.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);

      setGridRows(rows);
      setGridFile(file.name);
      setGridDiag(diag);
      toast.success(`Leidas ${rows.length} lineas GRID: ${diag.garantia} garantia y ${diag.interno} interno.`);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarFacturacionGridCampos = async () => {
    if (!gridRows || !user) return;

    const nuevos = gridRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay lineas nuevas");

    setBusy(true);
    try {
      const { data: imp, error: impError } = await supabase
        .from("importaciones")
        .insert({
          usuario_id: user.id,
          tipo: "facturacion",
          total_filas: gridRows.length,
          insertados: 0,
          duplicados: gridRows.length,
          archivo_nombre: `grid_campos:${gridFile}`,
          origen_sistema: "grid_campos",
          metadata: {
            tipo: "facturacion_grid_campos",
            garantia: gridDiag?.garantia ?? 0,
            interno: gridDiag?.interno ?? 0,
            cliente: gridDiag?.cliente ?? 0,
          },
        } as any)
        .select("id")
        .single();
      if (impError) throw impError;

      const payload = nuevos.map((r) => ({
        importacion_id: imp?.id ?? null,
        origen_sistema: r.origen_sistema,
        codigo_interno_factura: r.codigo_interno_factura,
        factura: r.factura,
        entidad_nombre: r.entidad_nombre,
        fecha_factura: r.fecha_factura,
        sucursal: r.sucursal,
        subgrupo_original: r.subgrupo_original,
        grupo_normalizado: r.grupo_normalizado,
        marca_normalizada: r.marca_normalizada,
        tipo_facturacion: r.tipo_facturacion,
        tipo_tiempo: r.tipo_tiempo,
        observacion: r.observacion,
        cod_mercaderia: r.cod_mercaderia,
        codigo_fabricante: r.codigo_fabricante,
        mercaderia: r.mercaderia,
        cantidad: r.cantidad,
        valor_unitario: r.valor_unitario,
        total_venta: r.total_venta,
        raw_data: r.raw_data,
      }));

      let insertadosReal = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error, count } = await (supabase
          .from("facturacion_lineas_importadas" as any)
          .upsert(chunk, {
            onConflict: "origen_sistema,linea_hash",
            ignoreDuplicates: true,
            count: "exact",
          }) as any);
        if (error) {
          if (isMissingBillingLinesTableError(error)) {
            return toast.error("Falta aplicar la migracion de facturacion detallada antes de importar el GRID.");
          }
          throw error;
        }
        insertadosReal += count ?? 0;
      }

      const { error: updError } = await supabase
        .from("importaciones")
        .update({
          insertados: insertadosReal,
          duplicados: gridRows.length - insertadosReal,
        } as any)
        .eq("id", imp?.id);
      if (updError) throw updError;

      const fechasGrid = payload.map((row) => row.fecha_factura).filter((value): value is string => Boolean(value)).sort();
      const historialGrid = await actualizarVentasRepuestosPeriodo(
        fechasGrid[0] ?? null,
        fechasGrid.length ? fechasGrid[fechasGrid.length - 1] : null,
      );

      toast.success(`Importadas ${insertadosReal} lineas GRID`);
      if (historialGrid.error) toast.warning(historialGrid.error);
      setGridRows(null);
      setGridFile("");
      setGridDiag(null);
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "ventas_unificadas"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const procesarClientes = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const sheetCadastro = wb.SheetNames.find((x) => x.trim().toLowerCase() === "cadastro de entidad v2");
      const sheetBd = wb.SheetNames.find((x) => x.trim().toLowerCase() === "bd clientes");

      if (!sheetCadastro || !sheetBd) {
        return toast.error("El archivo debe contener las hojas 'Cadastro de Entidad v2' y 'BD CLIENTES'");
      }

      const existentesRaw = await cargarTodosLosClientes();

      const porCodigo = new Map<string, string>();
      const porNombre = new Map<string, string>();
      const porRuc = new Map<string, string>();

      for (const c of (existentesRaw ?? []) as any[]) {
        if (c.cod_entidad) porCodigo.set(normCode(c.cod_entidad), c.id);
        if (c.nombre) porNombre.set(normText(c.nombre), c.id);
        if (c.ruc) porRuc.set(normRuc(c.ruc), c.id);
      }

      type Acc = ClienteRow & { _key: string };
      const acc = new Map<string, Acc>();

      const cadastroRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetCadastro], {
        defval: null,
      });
      const bdRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetBd], {
        defval: null,
      });

      for (const r of cadastroRows) {
        const cod_entidad =
          normCode(pick(r, ["Cód. Interno", "Cod. Interno", "Cod Interno", "Codigo Interno"])) || null;
        const nombre = norm(pick(r, ["Nombre Entidad", "Entidad", "Cliente", "Nombre"]));
        if (!cod_entidad || !nombre) continue;

        const ruc = norm(pick(r, ["RUC", "Ruc", "ruc"])) || null;
        const region = norm(pick(r, ["Sucursal", "REGION", "REGIONES", "Región", "Region"])) || null;
        const direccion = norm(pick(r, ["Dirección", "Direccion", "DIRECCION"])) || null;
        const localidad = norm(pick(r, ["Localidad", "LOCALIDAD", "Municipio"])) || null;
        const correo = norm(pick(r, ["Correo", "CORREO", "Email", "EMAIL"])) || null;
        const sucursal = matchSucursalFromRegion(region) ?? matchSucursal(region) ?? matchSucursal(localidad);

        const matchedId =
          porCodigo.get(cod_entidad) ??
          (ruc ? porRuc.get(normRuc(ruc)) : null) ??
          porNombre.get(normText(nombre)) ??
          null;

        acc.set(cod_entidad, {
          _key: cod_entidad,
          cod_entidad,
          nombre,
          ruc,
          region,
          direccion,
          localidad,
          correo_principal: correo,
          sucursal,
          _isNew: !matchedId,
          _matchedId: matchedId,
        });
      }

      for (const r of bdRows) {
        const cod_entidad = normCode(pick(r, ["NRO ENTIDAD", "Nro Entidad", "NRO_ENTIDAD"])) || null;
        if (!cod_entidad) continue;

        const nombre = norm(pick(r, ["CLIENTE", "Cliente", "Nombre Entidad", "Entidad"])) || null;
        const ruc = norm(pick(r, ["RUC", "Ruc", "ruc", "CI/RUC"])) || null;
        const region = norm(pick(r, ["REGIONES", "REGION", "Region", "Región"])) || null;
        const direccion = norm(pick(r, ["DIRECCION", "Dirección", "Direccion"])) || null;
        const localidad = norm(pick(r, ["LOCALIDAD", "Localidad"])) || null;
        const correo = norm(pick(r, ["CORREO", "Correo", "EMAIL", "Email"])) || null;
        const sucursal = matchSucursalFromRegion(region) ?? matchSucursal(region) ?? matchSucursal(localidad);

        const prev = acc.get(cod_entidad);

        if (!prev) {
          const matchedId =
            porCodigo.get(cod_entidad) ??
            (ruc ? porRuc.get(normRuc(ruc)) : null) ??
            (nombre ? porNombre.get(normText(nombre)) : null) ??
            null;

          acc.set(cod_entidad, {
            _key: cod_entidad,
            cod_entidad,
            nombre: nombre ?? "",
            ruc,
            region,
            direccion,
            localidad,
            correo_principal: correo,
            sucursal,
            _isNew: !matchedId,
            _matchedId: matchedId,
          });
        } else {
          if (nombre) prev.nombre = nombre;
          if (ruc) prev.ruc = ruc;
          if (region) prev.region = region;
          if (direccion) prev.direccion = direccion;
          if (localidad) prev.localidad = localidad;
          if (correo) prev.correo_principal = correo;
          if (sucursal) prev.sucursal = sucursal;
        }
      }

      const rows: ClienteRow[] = [...acc.values()]
        .map(({ _key, ...r }) => r)
        .filter((r) => !!r.cod_entidad && !!r.nombre);

      if (rows.length === 0) return toast.error("Excel sin filas válidas");

      setCliRows(rows);
      setCliFile(file.name);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarClientes = async () => {
    if (!cliRows || !user) return;

    const nuevos = cliRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay clientes nuevos");

    setBusy(true);
    try {
      const insertCli = nuevos.map((r) => ({
        cod_entidad: r.cod_entidad,
        nombre: r.nombre,
        ruc: r.ruc,
        region: r.region,
        direccion: r.direccion,
        localidad: r.localidad,
        correo_principal: r.correo_principal,
        sucursal: r.sucursal,
      }));

      for (let i = 0; i < insertCli.length; i += 500) {
        const chunk = insertCli.slice(i, i + 500);
        const { error } = await supabase.from("clientes").insert(chunk as any);
        if (error) throw error;
      }

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "parque",
        total_filas: cliRows.length,
        insertados: nuevos.length,
        duplicados: cliRows.length - nuevos.length,
        archivo_nombre: `clientes:${cliFile}`,
      });

      toast.success(`Importados ${nuevos.length} clientes`);
      setCliRows(null);
      setCliFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const procesarContactos = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const sheetBd = wb.SheetNames.find((x) => x.trim().toLowerCase() === "bd clientes");
      if (!sheetBd) {
        return toast.error("No se encontró la hoja BD CLIENTES");
      }

      const clientesRaw = await cargarTodosLosClientes();

      const porCodigo = new Map<string, string>();
      const porNombre = new Map<string, string>();
      const porRuc = new Map<string, string>();

      for (const c of (clientesRaw ?? []) as any[]) {
        if (c.cod_entidad) porCodigo.set(normCode(c.cod_entidad), c.id);
        if (c.nombre) porNombre.set(normText(c.nombre), c.id);
        if (c.ruc) porRuc.set(normRuc(c.ruc), c.id);
      }

      const { data: contactosEx, error: contErr } = await supabase
        .from("contactos_cliente")
        .select("cliente_id, nombre, telefono, correo");
      if (contErr) throw contErr;

      const dupKeys = new Set<string>();
      for (const c of contactosEx ?? []) {
        dupKeys.add([c.cliente_id, normText(c.nombre), normPhone(c.telefono), normText(c.correo)].join("|"));
      }

      const ws = wb.Sheets[sheetBd];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) return toast.error("La hoja BD CLIENTES está vacía");

      const rows: ContactoRow[] = [];
      const vistosExcel = new Set<string>();

      for (const r of json) {
        const nombre =
          norm(pick(r, ["CONTACTO", "Contacto", "NOMBRE CONTACTO", "Nombre Contacto"])) ||
          norm(pick(r, ["CLIENTE", "Cliente", "Nombre Entidad", "Entidad"]));
        if (!nombre) continue;

        const cliente_cod_entidad = normCode(pick(r, ["NRO ENTIDAD", "Nro Entidad", "NRO_ENTIDAD"])) || null;
        const ruc = norm(pick(r, ["RUC", "Ruc", "ruc", "CI/RUC", "RUC CLIENTE"])) || null;
        const cliente_nombre =
          norm(pick(r, ["CLIENTE", "Cliente", "Razón Social", "Razon Social", "Entidad", "Nombre Entidad"])) ||
          null;
        const cargo = norm(pick(r, ["CARGO", "Cargo", "Puesto"])) || null;
        const telefono =
          norm(pick(r, ["TELEFONO", "Teléfono", "Telefono", "CELULAR", "Celular", "Móvil", "Movil"])) ||
          null;
        const correo = norm(pick(r, ["CORREO", "Correo", "Email", "E-mail", "EMAIL"])) || null;

        const wa = lower(pick(r, ["WHATSAPP", "WhatsApp", "Whatsapp", "Es Whatsapp"]));
        const es_whatsapp = wa === "si" || wa === "sí" || wa === "true" || wa === "1" || wa === "x";

        const pr = lower(pick(r, ["PRINCIPAL", "Principal", "Es Principal"]));
        const es_principal = pr === "si" || pr === "sí" || pr === "true" || pr === "1" || pr === "x";

        const notas = norm(pick(r, ["NOTAS", "Notas", "Observaciones", "OBSERVACIONES"])) || null;

        const clienteId =
          (cliente_cod_entidad && porCodigo.get(cliente_cod_entidad)) ??
          (ruc && porRuc.get(normRuc(ruc))) ??
          (cliente_nombre && porNombre.get(normText(cliente_nombre))) ??
          null;

        const excelKey = [
          clienteId ?? cliente_cod_entidad ?? normText(cliente_nombre),
          normText(nombre),
          normPhone(telefono),
          normText(correo),
        ].join("|");

        if (vistosExcel.has(excelKey)) continue;
        vistosExcel.add(excelKey);

        let status: ContactoRow["_status"] = "ok";
        const dbKey = [clienteId, normText(nombre), normPhone(telefono), normText(correo)].join("|");

        if (!clienteId) status = "sin-cliente";
        else if (dupKeys.has(dbKey)) status = "duplicado";

        rows.push({
          cliente_cod_entidad,
          cliente_ruc: ruc,
          cliente_nombre,
          nombre,
          cargo,
          telefono,
          correo,
          es_whatsapp,
          es_principal,
          notas,
          _isNew: status === "ok",
          _clienteId: clienteId,
          _status: status,
        });
      }

      if (rows.length === 0) return toast.error("No se encontraron contactos válidos");
      setConRows(rows);
      setConFile(file.name);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarContactos = async () => {
    if (!conRows || !user) return;
    const nuevos = conRows.filter((r) => r._isNew && r._clienteId);
    if (nuevos.length === 0) return toast.info("No hay contactos nuevos");

    setBusy(true);
    try {
      const insertCon = nuevos.map((r) => ({
        cliente_id: r._clienteId!,
        nombre: r.nombre,
        cargo: r.cargo,
        telefono: r.telefono,
        correo: r.correo,
        es_whatsapp: r.es_whatsapp,
        es_principal: r.es_principal,
        notas: r.notas,
      }));

      for (let i = 0; i < insertCon.length; i += 500) {
        const chunk = insertCon.slice(i, i + 500);
        const { error } = await supabase.from("contactos_cliente").insert(chunk);
        if (error) throw error;
      }

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "parque",
        total_filas: conRows.length,
        insertados: nuevos.length,
        duplicados: conRows.length - nuevos.length,
        archivo_nombre: `contactos:${conFile}`,
      });

      toast.success(`Importados ${nuevos.length} contactos`);
      setConRows(null);
      setConFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const historialVisible = showAllHistory ? historial : historial.slice(0, 10);
  const historialOculto = Math.max(historial.length - historialVisible.length, 0);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="text-[13px] font-semibold">Importacion vigente - Nuevo sistema XML</div>
              <div className="max-w-3xl text-[11px] text-muted-foreground">
                El historico hasta 30/06/2026 queda congelado. Al confirmar, se reemplaza solo el tramo nuevo de facturacion y ordenes de servicio.
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px]">Desde 01/07/2026</Badge>
          </div>
          <div className="overflow-hidden rounded-lg border bg-background">
            <DropZone
              title="Facturacion XML"
              help="facturas - ndc - ncc - ventas.xml - base principal para la venta real del nuevo sistema."
              onFile={(file) => procesarNuevoSistemaXml("facturacion", file)}
              accept=".xml"
              selectedFileLabel={newSystemFiles.facturacion?.fileName ?? null}
              compact
            />
            <DropZone
              title="Ordenes de servicio XML"
              help="ordenes_de_servicio.xml - cruza documento/factura para distinguir Cliente, Garantia e Interno."
              onFile={(file) => procesarNuevoSistemaXml("ordenesServicio", file)}
              accept=".xml"
              selectedFileLabel={newSystemFiles.ordenesServicio?.fileName ?? null}
              compact
            />
            <DropZone
              title="Maestro de productos XML"
              help="maestro_de_productos.xml - completa marca, familia y grupo para enriquecer facturacion y OS."
              onFile={(file) => procesarNuevoSistemaXml("productos", file)}
              accept=".xml"
              selectedFileLabel={newSystemFiles.productos?.fileName ?? null}
              compact
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted bg-muted/20">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold">Importaciones anteriores</div>
              <div className="text-[11px] text-muted-foreground">Archivadas por cambio de sistema. Se conservan solo como referencia.</div>
            </div>
            <Badge variant="outline" className="text-[10px]">Deshabilitado</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Parque de maquinas",
              "Facturacion historica",
              "GRID Campos",
              "Clientes",
              "Contactos",
              "Ordenes de servicio",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-[13px] text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                <span className="truncate">{item}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">Archivado</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {parqueRows && (
        <Preview
          title={`Parque — ${parqueFile}`}
          rows={parqueRows}
          columns={["anio", "sucursal", "subgrupo", "modelo_tipo", "serie", "cliente_nombre", "marca"]}
          onConfirm={confirmarParque}
          onCancel={() => setParqueRows(null)}
          busy={busy}
        />
      )}

      {factRows && (
        <>
          {factDiag && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-3 sm:p-4 space-y-2">
                <div className="text-[13px] font-semibold">Resumen de lectura</div>
                <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Repuesto (total)</div>
                    <div className="font-semibold">{factDiag.repuestoTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-emerald-600">{factDiag.repuestoNuevos.toLocaleString()} nuevos</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Servicio (total)</div>
                    <div className="font-semibold">{factDiag.servicioTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-emerald-600">{factDiag.servicioNuevos.toLocaleString()} nuevos</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin fecha</div>
                    <div className="font-semibold">{factDiag.sinFecha.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin entidad</div>
                    <div className="font-semibold">{factDiag.sinEntidad.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tp. Mov. ≠ S</div>
                    <div className="font-semibold">{factDiag.descTpMov.toLocaleString()}</div>
                  </div>
                  {Object.entries(factDiag.porHoja).map(([h, n]) => (
                    <div key={h}>
                      <div className="text-muted-foreground truncate" title={h}>Hoja "{h}"</div>
                      <div className="font-semibold">{n.toLocaleString()} filas</div>
                    </div>
                  ))}
                </div>
                {factDiag.grupoFxNoComercial.length > 0 && (
                  <div className="pt-2 border-t border-blue-500/20">
                    <div className="text-[12px] font-semibold mb-1">
                      Servicios con GRUPO FX no comercial ({factDiag.grupoFxNoComercial.reduce((s, x) => s + x.count, 0).toLocaleString()} filas):
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Se importan igual, pero <strong>no</strong> cuentan como "servicio" en el Parque (sólo Mano de Obra y Kilometraje cuentan).
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {factDiag.grupoFxNoComercial.slice(0, 20).map((g) => (
                        <Badge key={g.grupo} variant="outline" className="text-[10px]">
                          {g.grupo} · {g.count}
                        </Badge>
                      ))}
                      {factDiag.grupoFxNoComercial.length > 20 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{factDiag.grupoFxNoComercial.length - 20} más
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Preview
            title={`Facturación — ${factFile}`}
            rows={factRows}
            columns={["fecha", "sucursal", "entidad_nombre", "cod_factura", "tipo", "grupo_fx", "total_venta"]}
            onConfirm={confirmarFact}
            onCancel={() => {
              setFactRows(null);
              setFactDiag(null);
            }}
            busy={busy}
          />
        </>
      )}

      {gridRows && (
        <>
          {gridDiag && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold">Resumen GRID Campos</div>
                    <div className="text-[12px] text-muted-foreground">
                      Clasificacion por observacion para distinguir Garantia e Interno.
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {gridDiag.total.toLocaleString()} lineas
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4 lg:grid-cols-7">
                  <div>
                    <div className="text-muted-foreground">Garantia</div>
                    <div className="font-semibold">{gridDiag.garantia.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Interno</div>
                    <div className="font-semibold">{gridDiag.interno.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Cliente</div>
                    <div className="font-semibold">{gridDiag.cliente.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin factura</div>
                    <div className="font-semibold">{gridDiag.sinFactura.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin fecha</div>
                    <div className="font-semibold">{gridDiag.sinFecha.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin interno</div>
                    <div className="font-semibold">{gridDiag.sinCodigoInterno.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sin cod. merc.</div>
                    <div className="font-semibold">{gridDiag.sinCodMercaderia.toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(gridDiag.porMarca).map(([marca, count]) => (
                    <Badge key={marca} variant="secondary" className="text-[10px]">
                      {marca}: {count.toLocaleString()}
                    </Badge>
                  ))}
                  {gridDiag.porSubgrupo
                    .slice(0, 12)
                    .map((item) => (
                      <Badge
                        key={item.subgrupo}
                        variant="outline"
                        className="max-w-[220px] truncate text-[10px]"
                        title={item.subgrupo}
                      >
                        {item.subgrupo}: {item.lineas.toLocaleString()}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
          <Preview
            title={`GRID Campos - ${gridFile}`}
            rows={gridRows}
            columns={[
              "codigo_interno_factura",
              "factura",
              "fecha_factura",
              "tipo_tiempo",
              "marca_normalizada",
              "subgrupo_original",
              "cod_mercaderia",
              "codigo_fabricante",
              "total_venta",
            ]}
            onConfirm={confirmarFacturacionGridCampos}
            onCancel={() => {
              setGridRows(null);
              setGridFile("");
              setGridDiag(null);
            }}
            busy={busy}
          />
        </>
      )}

      {newSystemPreview && (
        <NewSystemXmlPreview
          bundle={newSystemPreview}
          files={newSystemFiles}
          onConfirm={confirmarNuevoSistemaXml}
          onCancel={resetNewSystemImport}
          busy={busy}
        />
      )}

      {cliRows && (
        <Preview
          title={`Clientes — ${cliFile}`}
          rows={cliRows}
          columns={["cod_entidad", "nombre", "ruc", "region", "localidad", "direccion", "correo_principal", "sucursal"]}
          onConfirm={confirmarClientes}
          onCancel={() => setCliRows(null)}
          busy={busy}
        />
      )}

      {conRows && (
        <ContactosPreview
          title={`Contactos — ${conFile}`}
          rows={conRows}
          onConfirm={confirmarContactos}
          onCancel={() => setConRows(null)}
          busy={busy}
        />
      )}

      {osRows && (
        <Preview
          title={`Ordenes de servicio - ${osFile}`}
          rows={osRows}
          columns={[
            "os_numero",
            "trabajo_codigo",
            "cliente_nombre",
            "tipo_tiempo",
            "servicios_cantidad",
            "terceros_valor",
            "kilometro_valor",
            "servicios_valor",
            "repuesto_valor",
          ]}
          onConfirm={confirmarOrdenesServicio}
          onCancel={() => setOsRows(null)}
          busy={busy}
        />
      )}

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <History className="h-4 w-4 text-primary" /> Historial de importaciones
            </div>
            {historial.length > 10 && (
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => setShowAllHistory((value) => !value)}>
                {showAllHistory ? "Mostrar ultimos 10" : `Ver ${historial.length}`}
              </Button>
            )}
          </div>
          {historial.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">Sin importaciones registradas.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Insertados</TableHead>
                    <TableHead className="text-right">Duplicados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historialVisible.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-[12px]">
                        {new Date(h.creado_en).toLocaleString("es-PY", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-[12px]">{h.usuario_id ? profiles[h.usuario_id] ?? "—" : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {h.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] truncate max-w-[180px]">{h.archivo_nombre ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_filas}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 font-medium">
                        {h.insertados}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {h.duplicados}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {historialOculto > 0 && (
            <div className="mt-2 text-right text-[11px] text-muted-foreground">
              {historialOculto} registros anteriores ocultos.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DropZone({
  title,
  help,
  onFile,
  accept = ".xlsx,.xls,.csv",
  selectedFileLabel = null,
  compact = false,
}: {
  title: string;
  help: string;
  onFile: (f: File) => void;
  accept?: string;
  selectedFileLabel?: string | null;
  compact?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "border-dashed transition-colors",
        compact ? "border-b p-3 last:border-b-0" : "rounded-lg border-2 p-4 text-center",
        drag ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className={cn(compact && "flex items-center gap-3")}>
        <FileSpreadsheet className={cn("text-muted-foreground", compact ? "h-5 w-5 shrink-0" : "mx-auto mb-2 h-8 w-8")} />
        <div className={cn(compact && "min-w-0 flex-1 text-left")}>
          <div className="text-[13px] font-medium">{title}</div>
          <div className={cn("text-[11px] text-muted-foreground", compact ? "truncate" : "mb-3 mt-1")} title={help}>
            {help}
          </div>
          {selectedFileLabel && compact && (
            <div className="mt-1 truncate text-[10px] font-medium text-primary" title={selectedFileLabel}>
              {selectedFileLabel}
            </div>
          )}
        </div>
        {selectedFileLabel && compact ? (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            Listo
          </Badge>
        ) : null}
        {compact && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Seleccionar
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {!compact && (
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 h-3.5 w-3.5" /> Seleccionar archivo
        </Button>
      )}
      {!compact && selectedFileLabel && (
        <div className="mt-2 truncate text-[10px] font-medium text-primary" title={selectedFileLabel}>
          {selectedFileLabel}
        </div>
      )}
      {!compact && <div className="mt-1 text-[10px] text-muted-foreground">o arrastrá el archivo aquí</div>}
    </div>
  );
}

function NewSystemXmlPreview({
  bundle,
  files,
  onConfirm,
  onCancel,
  busy,
}: {
  bundle: NewSystemImportBundle;
  files: NewSystemXmlFilesState;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const factPreview = bundle.facturacion.rows.slice(0, 8);
  const osPreview = bundle.ordenesServicio.rows.slice(0, 8);

  return (
    <Card className="border-primary/30">
      <CardContent className="p-3 sm:p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-[13px]">Nuevo sistema listo para importar</div>
            <div className="text-[11px] text-muted-foreground">
              Reemplaza solo datos desde {NEW_SYSTEM_START}. El histórico anterior queda intacto.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{bundle.diagnostics.billingRows.toLocaleString()} líneas facturación</Badge>
            <Badge variant="outline">{bundle.diagnostics.serviceOrders.toLocaleString()} líneas OS</Badge>
            <Badge variant="outline">{bundle.diagnostics.serviceOrderTimeTypes.Cliente} Cliente</Badge>
            <Badge variant="outline">{bundle.diagnostics.serviceOrderTimeTypes.Garantia} Garantía</Badge>
            <Badge variant="outline">{bundle.diagnostics.serviceOrderTimeTypes.Interno} Interno</Badge>
            <Badge variant="outline">{bundle.diagnostics.products.toLocaleString()} productos</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card className="border-border/60">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">Venta directa</div>
              <div className="text-[20px] font-semibold">{bundle.diagnostics.billingDirectSales.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Sin cruce con OS</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">Cruzadas con OS</div>
              <div className="text-[20px] font-semibold">{bundle.diagnostics.billingMatchedToOs.toLocaleString()}</div>
              <div className="text-[11px] text-muted-foreground">Documento / factura</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">Ventana facturación</div>
              <div className="font-semibold">
                {bundle.diagnostics.replacement.facturacion.from ?? "—"} · {bundle.diagnostics.replacement.facturacion.to ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">Se reemplaza solo este tramo</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">Ventana OS</div>
              <div className="font-semibold">
                {bundle.diagnostics.replacement.ordenesServicio.from ?? "—"} · {bundle.diagnostics.replacement.ordenesServicio.to ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">Apertura / emisión</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-2">
                <div className="font-semibold text-[13px]">Facturación nueva</div>
                <div className="text-[11px] text-muted-foreground">{files.facturacion?.fileName ?? "—"}</div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factPreview.map((row) => {
                      const crosswalk = bundle.billingCrosswalk.find((item) => item.billingRowId === row.rowId);
                      return (
                        <TableRow key={row.rowId}>
                          <TableCell className="text-[12px] whitespace-nowrap">{row.emissionDate ?? "—"}</TableCell>
                          <TableCell className="text-[12px] whitespace-nowrap">{row.invoiceShortNumber ?? row.invoiceLongNumber ?? "—"}</TableCell>
                          <TableCell className="text-[12px] max-w-[220px] truncate">{row.clientName}</TableCell>
                          <TableCell className="text-[12px] whitespace-nowrap">{crosswalk?.inferredTimeType ?? row.timeType}</TableCell>
                          <TableCell className="text-[12px] text-right whitespace-nowrap">
                            USD {(row.totalValueWithIva || row.totalValueBase || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-2">
                <div className="font-semibold text-[13px]">Órdenes de servicio nuevas</div>
                <div className="text-[11px] text-muted-foreground">{files.ordenesServicio?.fileName ?? "—"}</div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {osPreview.map((row) => (
                      <TableRow key={row.rowId}>
                        <TableCell className="text-[12px] whitespace-nowrap">{row.serviceOrderNumber}</TableCell>
                        <TableCell className="text-[12px] whitespace-nowrap">{row.openDate ?? row.invoiceDate ?? "—"}</TableCell>
                        <TableCell className="text-[12px] max-w-[220px] truncate">{row.ownerName ?? row.billedClientName ?? "—"}</TableCell>
                        <TableCell className="text-[12px] whitespace-nowrap">{row.timeType}</TableCell>
                        <TableCell className="text-[12px] text-right whitespace-nowrap">
                          USD {(row.lineTotal || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Importando..." : "Confirmar importación nuevo sistema"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Preview<T extends { _isNew: boolean }>({
  title,
  rows,
  columns,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  rows: T[];
  columns: string[];
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const nuevos = rows.filter((r) => r._isNew).length;
  const duplicados = rows.length - nuevos;
  const preview = rows.slice(0, 10);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-[13px]">{title}</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rows.length} filas</Badge>
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {nuevos} nuevos
            </Badge>
            <Badge variant="secondary">
              <AlertCircle className="mr-1 h-3 w-3" /> {duplicados} duplicados
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-[11px]">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i} className={!r._isNew ? "opacity-50" : ""}>
                  <TableCell>
                    {r._isNew ? (
                      <Badge className="bg-emerald-600 text-white text-[9px]">Nuevo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">
                        Dup.
                      </Badge>
                    )}
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap text-[12px]">
                      {String((r as Record<string, unknown>)[c] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy || nuevos === 0}>
            {busy ? "Importando..." : `Confirmar (${nuevos})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactosPreview({
  title,
  rows,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  rows: ContactoRow[];
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const ok = rows.filter((r) => r._status === "ok").length;
  const sinCliente = rows.filter((r) => r._status === "sin-cliente").length;
  const dup = rows.filter((r) => r._status === "duplicado").length;
  const preview = rows.slice(0, 15);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-[13px]">{title}</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rows.length} filas</Badge>
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {ok} a importar
            </Badge>
            <Badge variant="secondary">
              <AlertCircle className="mr-1 h-3 w-3" /> {dup} duplicados
            </Badge>
            {sinCliente > 0 && (
              <Badge variant="destructive">
                <AlertCircle className="mr-1 h-3 w-3" /> {sinCliente} sin cliente
              </Badge>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="text-[11px]">Cliente (RUC / Nombre)</TableHead>
                <TableHead className="text-[11px]">Contacto</TableHead>
                <TableHead className="text-[11px]">Cargo</TableHead>
                <TableHead className="text-[11px]">Teléfono</TableHead>
                <TableHead className="text-[11px]">Correo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow
                  key={i}
                  className={cn(
                    r._status === "duplicado" && "opacity-50",
                    r._status === "sin-cliente" && "bg-destructive/5",
                  )}
                >
                  <TableCell>
                    {r._status === "ok" && <Badge className="bg-emerald-600 text-white text-[9px]">Nuevo</Badge>}
                    {r._status === "duplicado" && (
                      <Badge variant="secondary" className="text-[9px]">
                        Dup.
                      </Badge>
                    )}
                    {r._status === "sin-cliente" && (
                      <Badge variant="destructive" className="text-[9px]">
                        Sin cliente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px]">
                    <div className="font-mono text-[10px] text-muted-foreground">{r.cliente_ruc ?? "—"}</div>
                    <div className="truncate max-w-[200px]">{r.cliente_nombre ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">{r.nombre}</TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">{r.cargo ?? "—"}</TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">{r.telefono ?? "—"}</TableCell>
                  <TableCell className="text-[12px] whitespace-nowrap">{r.correo ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy || ok === 0}>
            {busy ? "Importando..." : `Confirmar (${ok})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

