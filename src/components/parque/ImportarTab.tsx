import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

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
const normText = (s: unknown) => lower(s).replace(/\s+/g, " ");
const normRuc = (s: unknown) => norm(s).replace(/[.\s-]/g, "").toLowerCase();
const normPhone = (s: unknown) => norm(s).replace(/[^\d]/g, "");
const normCode = (s: unknown) => norm(s).replace(/\s+/g, "").toLowerCase();
const normOs = (s: unknown) => norm(s).replace(/[^\d]/g, "");

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

const REGION_TO_SUCURSAL: Record<string, Sucursal> = {
  central: "Santa Rita",
  "santa rita": "Santa Rita",
  "santa rosa del aguaray": "Santa Rosa",
  "santa rosa": "Santa Rosa",
  "campo 9": "Campo 9",
  "campo nueve": "Campo 9",
  misiones: "Misiones",
  "loma plata": "Loma Plata",
  katuete: "Katuete",
  "katueté": "Katuete",
};

const matchSucursalFromRegion = (region: unknown): Sucursal | null => {
  const v = lower(region).replace(/\s*\(\d+\)\s*$/, "");
  return REGION_TO_SUCURSAL[v] ?? null;
};

const parseExcelDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
};

const matchSucursal = (s: unknown): Sucursal | null => {
  const v = lower(s);
  return (SUCURSALES.find((x) => x.toLowerCase() === v) ?? null) as Sucursal | null;
};

const matchMarca = (s: unknown): Marca | null => {
  const v = lower(s);
  return (MARCAS.find((x) => x.toLowerCase() === v) ?? null) as Marca | null;
};

const pick = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const k = keys.find((x) => x.trim().toLowerCase() === a.toLowerCase());
    if (k != null && row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  return null;
};

export function ImportarTab({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
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
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<Imp[]>([]);
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
        supabase.from("trabajos").select("id, codigo, os_numero"),
      ]);

      const osImportadas = new Set<string>((importadas ?? []).map((r: any) => normOs(r.os_numero)));
      const trabajosPorOs = new Map<string, { id: string; codigo: string | null }>();
      for (const t of trabajos ?? []) {
        const os = normOs((t as any).os_numero);
        if (os) trabajosPorOs.set(os, { id: t.id, codigo: t.codigo });
      }

      const rowsByOs = new Map<string, OrdenServicioRow>();
      for (const r of json) {
        const os = normOs(pick(r, ["Nº OS", "Nro OS", "Nro. OS", "Numero OS", "Número OS", "OS"]));
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

        row.km_cantidad += parseMoney(pick(r, ["Km Cnt. Utilizada", "Km Cnt Utilizada"]));
        row.km_valor_unitario = row.km_valor_unitario || parseMoney(pick(r, ["Km Vlr. Unitario", "Km Vlr Unitario"]));
        row.servicios_cantidad += parseMoney(pick(r, ["Servicios Cnt. Utilizada", "Servicios Cnt Utilizada"]));
        row.servicios_valor_unitario = row.servicios_valor_unitario || parseMoney(pick(r, ["Servicios Vlr. Unitario", "Servicios Vlr Unitario"]));
        row.terceros_valor += parseMoney(pick(r, ["Terceros"]));
        row.kilometro_valor += parseMoney(pick(r, ["Kilometro", "Kilómetro"]));
        row.servicios_valor += parseMoney(pick(r, ["Servicios"]));
        row.repuesto_valor += parseMoney(pick(r, ["Repuesto"]));
        row.raw_data = { ...row.raw_data, ...r };

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
        if (error) throw error;
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

      const validos = nuevos.filter((r) => cliMap.has(normText(r.cliente_nombre)));
      const omitidos = nuevos.length - validos.length;

      if (validos.length === 0) {
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

      if (omitidos > 0) {
        toast.success(
          `Importadas ${validos.length} máquinas. ${omitidos} fueron omitidas por no coincidir exactamente con un cliente.`,
        );
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
          } else {
            agg.set(key, {
              fecha,
              sucursal,
              entidad_nombre: entidadNombre,
              cod_entidad: codEntidad,
              total_venta: totalVenta,
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
        grupo: r.grupo,
        grupo_fx: r.grupo_fx,
        cod_factura: r.cod_factura,
      }));

      let insertadosReal = 0;
      for (let i = 0; i < insertF.length; i += 500) {
        const chunk = insertF.slice(i, i + 500);
        const { error, count } = await supabase
          .from("facturacion")
          .upsert(chunk as any, {
            onConflict: "cod_factura,tipo,fecha,cod_entidad,entidad_nombre,sucursal,grupo,grupo_fx",
            ignoreDuplicates: true,
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DropZone
          title="Importar parque de máquinas"
          help="COBERTURA PARQUE DE MAQUINAS.xlsx — usa solo la hoja BD_CLAAS_HORSCH y exige coincidencia exacta del CLIENTE con la matriz ya importada."
          onFile={procesarParque}
        />
        <DropZone
          title="Importar facturación"
          help="FACTURACIÓN HISTORICA.xlsx — usa Fact. Repuestos + Fact. Servicios, filtra Tp. Movimento = S y guarda GRUPO FX. Se importan TODAS las líneas; el filtro 'Mano de Obra/Kilometraje' aplica sólo al cálculo del Parque."
          onFile={procesarFact}
        />
        <DropZone
          title="Importar clientes"
          help="MATRIZ CLIENTES.xlsx — une Cadastro de Entidad v2 + BD CLIENTES por código de entidad. BD CLIENTES complementa y sobreescribe datos."
          onFile={procesarClientes}
        />
        <DropZone
          title="Importar contactos"
          help="MATRIZ CLIENTES.xlsx — toma contactos solo desde BD CLIENTES y los vincula por NRO ENTIDAD."
          onFile={procesarContactos}
        />
        <DropZone
          title="Importar ordenes de servicio"
          help="Ordenes de Servicios - CDM.xlsx - usa Nro OS para vincular con trabajos que tengan cargada la OS interna."
          onFile={procesarOrdenesServicio}
        />
      </div>

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
                <div className="text-sm font-semibold">Resumen de lectura</div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
                    <div className="text-xs font-semibold mb-1">
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
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Historial de importaciones
          </div>
          {historial.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sin importaciones registradas.</div>
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
                  {historial.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">
                        {new Date(h.creado_en).toLocaleString("es-PY", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{h.usuario_id ? profiles[h.usuario_id] ?? "—" : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {h.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[180px]">{h.archivo_nombre ?? "—"}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}

function DropZone({ title, help, onFile }: { title: string; help: string; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
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
      <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <div className="font-medium text-sm">{title}</div>
      <div className="mb-3 mt-1 text-[11px] text-muted-foreground">{help}</div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-1 h-3.5 w-3.5" /> Seleccionar archivo
      </Button>
      <div className="mt-1 text-[10px] text-muted-foreground">o arrastrá el archivo aquí</div>
    </div>
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
          <div className="font-semibold text-sm">{title}</div>
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
                    <TableCell key={c} className="whitespace-nowrap text-xs">
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
          <div className="font-semibold text-sm">{title}</div>
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
                  <TableCell className="text-xs">
                    <div className="font-mono text-[10px] text-muted-foreground">{r.cliente_ruc ?? "—"}</div>
                    <div className="truncate max-w-[200px]">{r.cliente_nombre ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.nombre}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.cargo ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.telefono ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.correo ?? "—"}</TableCell>
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
