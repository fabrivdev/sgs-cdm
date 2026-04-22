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
  "PULVERIZADORAS",
  "TRACTORES",
  "OTRO",
]);

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
  cod_factura: string;
  tipo: "Repuesto" | "Servicio";
  _isNew: boolean;
}
interface ClienteRow {
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

interface Imp {
  id: string;
  tipo: "parque" | "facturacion";
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
// Normaliza nombre para comparación: mayúsculas, sin puntos/comas/S.A./S.R.L. al final, trim
const normName = (s: unknown) =>
  norm(s)
    .toUpperCase()
    .replace(/\s+(S\.?A\.?|S\.R\.L\.?|LTDA\.?|INC\.?)\s*$/i, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Mapeo de regiones a sucursales (igual al usado en la importación inicial)
const REGION_TO_SUCURSAL: Record<string, Sucursal> = {
  "central": "Santa Rita",
  "santa rita": "Santa Rita",
  "santa rosa del aguaray": "Santa Rosa",
  "santa rosa": "Santa Rosa",
  "campo 9": "Campo 9",
  "campo nueve": "Campo 9",
  "misiones": "Misiones",
  "loma plata": "Loma Plata",
  "katuete": "Katuete",
  "katueté": "Katuete",
};
const matchSucursalFromRegion = (region: unknown): Sucursal | null => {
  const v = lower(region).replace(/\s*\(\d+\)\s*$/, ""); // quita "(9)" final
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

// Busca el primer valor que matchee algún alias (case-insensitive)
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
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<Imp[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

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

  useEffect(() => { cargarHistorial(); }, []);

  // ===== Procesar Parque =====
  const procesarParque = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) return toast.error("Excel vacío");

      const seriesExistentes = new Set<string>();
      const { data: existentes } = await supabase.from("parque_maquinas").select("serie");
      for (const e of existentes ?? []) seriesExistentes.add(e.serie.toLowerCase());

      const rows: ParqueRow[] = [];
      for (const r of json) {
        const serie = norm(r["SERIE"] ?? r["serie"]);
        if (!serie) continue;
        const marca = matchMarca(r["MARCA"] ?? r["marca"]) ?? "CLAAS";
        const subRaw = norm(r["SUBGRUPO"] ?? r["subgrupo"]).toUpperCase();
        const subgrupo = SUBGRUPOS_VALIDOS.has(subRaw) ? subRaw : "OTRO";
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
          _isNew: !seriesExistentes.has(serie.toLowerCase()),
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
      const nombresUnicos = Array.from(new Set(nuevos.map((r) => r.cliente_nombre).filter(Boolean)));
      const { data: todosClientes } = await supabase.from("clientes").select("id, nombre");
      const cliMap = new Map<string, string>(); // normName → id
      const cliMapRaw = new Map<string, string>(); // lower exact → id
      for (const c of todosClientes ?? []) {
        cliMap.set(normName(c.nombre), c.id);
        cliMapRaw.set(c.nombre.toLowerCase(), c.id);
      }
      const resolveId = (n: string) =>
        cliMapRaw.get(n.toLowerCase()) ?? cliMap.get(normName(n)) ?? null;

      const aCrear = nombresUnicos.filter((n) => !resolveId(n));
      if (aCrear.length > 0) {
        const sucPorCliente = new Map<string, Sucursal | null>();
        for (const r of nuevos) {
          if (r.cliente_nombre && !sucPorCliente.has(r.cliente_nombre.toLowerCase())) {
            sucPorCliente.set(r.cliente_nombre.toLowerCase(), r.sucursal);
          }
        }
        const insertCli = aCrear.map((n) => ({
          nombre: n,
          sucursal: sucPorCliente.get(n.toLowerCase()) ?? null,
        }));
        const { data: creados, error: errCli } = await supabase
          .from("clientes")
          .insert(insertCli)
          .select("id, nombre");
        if (errCli) throw errCli;
        for (const c of creados ?? []) {
          cliMap.set(normName(c.nombre), c.id);
          cliMapRaw.set(c.nombre.toLowerCase(), c.id);
        }
      }

      const insertMaq = nuevos.map((r) => ({
        cliente_id: r.cliente_nombre ? resolveId(r.cliente_nombre) : null,
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
        insertados: nuevos.length,
        duplicados: parqueRows.length - nuevos.length,
        archivo_nombre: parqueFile,
      });

      toast.success(`Importadas ${nuevos.length} máquinas`);
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

  // ===== Procesar Facturación =====
  const procesarFact = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // Procesar TODAS las hojas. El tipo se infiere del nombre de la hoja:
      //   "Fact. Repuestos" / contiene "repuesto" → Repuesto
      //   "Fact. Servicios" / contiene "servicio" → Servicio
      // Si no se puede inferir, se usa la columna "Tipo" o se asume Repuesto.
      const inferTipoFromSheet = (name: string): "Repuesto" | "Servicio" | null => {
        const n = name.toLowerCase();
        if (n.includes("servic")) return "Servicio";
        if (n.includes("repuest")) return "Repuesto";
        return null;
      };

      // Cargar TODOS los cod_factura+tipo existentes con paginación (Supabase limita a 1000)
      // Clave: `${cod}|${tipo}` para permitir repuesto y servicio del mismo cod_factura
      const existentesKey = new Set<string>();
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("facturacion")
          .select("cod_factura, tipo")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const e of data) existentesKey.add(`${e.cod_factura.toLowerCase()}|${e.tipo}`);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const rows: FactRow[] = [];
      // Para agrupar por (cod_factura, tipo) dentro del propio Excel
      const agg = new Map<string, FactRow & { _seen: number }>();

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
        if (json.length === 0) continue;
        const tipoSheet = inferTipoFromSheet(sheetName);

        for (const r of json) {
          const cod = norm(
            pick(r, ["Código Factura", "Codigo Factura", "cod_factura", "Nro. Factura", "Nro Factura"]),
          );
          if (!cod) continue;
          const fecha = parseExcelDate(pick(r, ["Fecha Factura", "Fecha", "fecha", "Dt. Emissão"]));
          if (!fecha) continue;
          // Solo ventas (S). Ignorar entradas (E)
          const tpMov = norm(pick(r, ["Tp. Movimento", "Tipo Movimiento", "tp_movimento"])).toUpperCase();
          if (tpMov && tpMov !== "S") continue;

          let tipo: "Repuesto" | "Servicio";
          if (tipoSheet) {
            tipo = tipoSheet;
          } else {
            const tipoRaw = norm(pick(r, ["Tipo", "tipo", "Tipo Item", "Tipo Mercaderia"]));
            tipo = tipoRaw.toLowerCase().startsWith("serv") ? "Servicio" : "Repuesto";
          }

          const totalRaw = pick(r, ["Total Venta", "total_venta", "Vlr. Total", "Valor Total"]) ?? 0;
          const total =
            typeof totalRaw === "number"
              ? totalRaw
              : Number(String(totalRaw).replace(/[^0-9.-]/g, "")) || 0;

          const sucRaw = norm(pick(r, ["Sucursal", "sucursal", "Filial"]));
          const sucursal = matchSucursalFromRegion(sucRaw) ?? matchSucursal(sucRaw);

          const key = `${cod.toLowerCase()}|${tipo}`;
          const prev = agg.get(key);
          if (prev) {
            // Misma factura+tipo: sumar total y mantener primer encabezado
            prev.total_venta += total;
            prev._seen += 1;
          } else {
            agg.set(key, {
              fecha,
              sucursal,
              entidad_nombre: norm(pick(r, ["Entidad", "entidad", "Cliente", "Razão Social"])),
              cod_entidad: norm(pick(r, ["Cod. Entidad", "Cod Entidad", "cod_entidad", "Cod. Cliente"])) || null,
              total_venta: total,
              grupo: norm(pick(r, ["Grupo", "grupo"])) || null,
              cod_factura: cod,
              tipo,
              _isNew: !existentesKey.has(key),
              _seen: 1,
            });
          }
        }
      }

      for (const v of agg.values()) {
        const { _seen, ...row } = v;
        rows.push(row);
      }
      if (rows.length === 0) return toast.error("Excel vacío o sin filas válidas");
      setFactRows(rows);
      setFactFile(file.name);
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
      const nombresUnicos = Array.from(new Set(nuevos.map((r) => r.entidad_nombre).filter(Boolean)));
      // Traer TODOS los clientes para hacer match por normName (evita duplicados por S.A. / puntuación)
      const { data: todosClientes } = await supabase.from("clientes").select("id, nombre, ruc");
      const cliMap = new Map<string, string>(); // normName → id
      const cliMapRaw = new Map<string, string>(); // nombre exacto → id
      for (const c of todosClientes ?? []) {
        cliMap.set(normName(c.nombre), c.id);
        cliMapRaw.set(c.nombre.toLowerCase(), c.id);
      }
      const aCrear = nombresUnicos.filter(
        (n) => !cliMap.has(normName(n)) && !cliMapRaw.has(n.toLowerCase()),
      );
      if (aCrear.length > 0) {
        const insertCli = aCrear.map((n) => {
          const r = nuevos.find((x) => x.entidad_nombre === n);
          return { nombre: n, sucursal: r?.sucursal ?? null };
        });
        const { data: creados, error: errCli } = await supabase
          .from("clientes")
          .insert(insertCli)
          .select("id, nombre");
        if (errCli) throw errCli;
        for (const c of creados ?? []) {
          cliMap.set(normName(c.nombre), c.id);
          cliMapRaw.set(c.nombre.toLowerCase(), c.id);
        }
      }
      // Remap insertF usando normName como fallback
      const resolveClienteId = (nombre: string) =>
        cliMapRaw.get(nombre.toLowerCase()) ?? cliMap.get(normName(nombre)) ?? null;

      const insertF = nuevos.map((r) => ({
        fecha: r.fecha,
        sucursal: r.sucursal,
        tipo: r.tipo as never,
        cliente_id: r.entidad_nombre ? resolveClienteId(r.entidad_nombre) : null,
        entidad_nombre: r.entidad_nombre,
        cod_entidad: r.cod_entidad,
        total_venta: r.total_venta,
        grupo: r.grupo,
        cod_factura: r.cod_factura,
      }));
      for (let i = 0; i < insertF.length; i += 500) {
        const chunk = insertF.slice(i, i + 500);
        const { error } = await supabase.from("facturacion").insert(chunk);
        if (error) throw error;
      }

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "facturacion",
        total_filas: factRows.length,
        insertados: nuevos.length,
        duplicados: factRows.length - nuevos.length,
        archivo_nombre: factFile,
      });

      toast.success(`Importadas ${nuevos.length} facturas`);
      setFactRows(null);
      setFactFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ===== Procesar Clientes (fusiona TODAS las hojas, BD CLIENTES sobreescribe) =====
  const procesarClientes = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const { data: existentes } = await supabase.from("clientes").select("id, nombre, ruc");
      const porNombre = new Map<string, string>();
      const porRuc = new Map<string, string>();
      for (const c of existentes ?? []) {
        if (c.nombre) porNombre.set(c.nombre.toLowerCase(), c.id);
        if (c.ruc) porRuc.set(normRuc(c.ruc), c.id);
      }

      // Acumulador por clave (RUC normalizado o nombre lowercase si no hay RUC).
      // Procesa Cadastro primero (base), luego BD CLIENTES (curada, sobreescribe).
      type Acc = ClienteRow & { _key: string };
      const acc = new Map<string, Acc>();
      const orderedSheets = [...wb.SheetNames].sort((a, b) => {
        const aBd = a.toLowerCase().includes("bd clientes") ? 1 : 0;
        const bBd = b.toLowerCase().includes("bd clientes") ? 1 : 0;
        return aBd - bBd;
      });

      for (const sheetName of orderedSheets) {
        const isBdClientes = sheetName.toLowerCase().includes("bd clientes");
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
        if (json.length === 0) continue;

        for (const r of json) {
          const nombre = norm(
            pick(r, [
              "NOMBRE", "Nombre", "Cliente", "CLIENTE",
              "Razón Social", "Razon Social", "Entidad",
              "Nombre Entidad",
            ]),
          );
          if (!nombre) continue;
          const ruc = norm(pick(r, ["RUC", "Ruc", "ruc", "CI/RUC"])) || null;
          const region = norm(pick(r, ["REGION", "REGIONES", "Región", "Region", "Sucursal"])) || null;
          const direccion = norm(pick(r, ["DIRECCION", "Dirección", "Direccion"])) || null;
          const localidad = norm(pick(r, ["LOCALIDAD", "Localidad", "Ciudad", "Municipio"])) || null;
          const correo = norm(pick(r, ["CORREO", "Correo", "Email", "E-mail", "EMAIL"])) || null;
          const sucursal =
            matchSucursalFromRegion(region) ?? matchSucursal(region) ?? matchSucursal(localidad);

          const key = ruc ? `r:${normRuc(ruc)}` : `n:${nombre.toLowerCase()}`;
          const prev = acc.get(key);
          if (!prev) {
            const matchedId =
              (ruc && porRuc.get(normRuc(ruc))) ?? porNombre.get(nombre.toLowerCase()) ?? null;
            acc.set(key, {
              _key: key,
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
          } else {
            // BD CLIENTES sobreescribe; otras hojas solo rellenan vacíos
            if (isBdClientes) {
              prev.nombre = nombre;
              if (ruc) prev.ruc = ruc;
              if (region) prev.region = region;
              if (direccion) prev.direccion = direccion;
              if (localidad) prev.localidad = localidad;
              if (correo) prev.correo_principal = correo;
              if (sucursal) prev.sucursal = sucursal;
            } else {
              prev.ruc = prev.ruc ?? ruc;
              prev.region = prev.region ?? region;
              prev.direccion = prev.direccion ?? direccion;
              prev.localidad = prev.localidad ?? localidad;
              prev.correo_principal = prev.correo_principal ?? correo;
              prev.sucursal = prev.sucursal ?? sucursal;
            }
          }
        }
      }

      const rows: ClienteRow[] = [...acc.values()].map(({ _key, ...r }) => r);
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
        const { error } = await supabase.from("clientes").insert(chunk);
        if (error) throw error;
      }
      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        // reusamos "parque" como tipo lógico (enum solo permite parque|facturacion)
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

  // ===== Procesar Contactos (recorre TODAS las hojas) =====
  const procesarContactos = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const { data: clientes } = await supabase.from("clientes").select("id, nombre, ruc");
      const porNombre = new Map<string, string>();
      const porNombreNorm = new Map<string, string>();
      const porRuc = new Map<string, string>();
      for (const c of clientes ?? []) {
        if (c.nombre) {
          porNombre.set(c.nombre.toLowerCase(), c.id);
          porNombreNorm.set(normName(c.nombre), c.id);
        }
        if (c.ruc) porRuc.set(normRuc(c.ruc), c.id);
      }

      const { data: contactosEx } = await supabase
        .from("contactos_cliente")
        .select("cliente_id, nombre, telefono");
      const dupKeys = new Set<string>();
      for (const c of contactosEx ?? []) {
        if (c.telefono) dupKeys.add(`${c.cliente_id}|t:${normPhone(c.telefono)}`);
        if (c.nombre) dupKeys.add(`${c.cliente_id}|n:${c.nombre.toLowerCase()}`);
      }

      const rows: ContactoRow[] = [];
      // Dedupe dentro del propio Excel
      const vistosExcel = new Set<string>();

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
        if (json.length === 0) continue;

        for (const r of json) {
          const nombre = norm(
            pick(r, [
              "CONTACTO", "Contacto", "NOMBRE CONTACTO", "Nombre Contacto",
              "NOMBRE_CONTACTO", "nombre_contacto",
            ]),
          );
          // Si no hay nombre de contacto, usar el nombre del cliente como contacto principal
          const clienteNombreFallback = norm(
            pick(r, ["CLIENTE", "Cliente", "Razón Social", "Razon Social", "Entidad", "Nombre Entidad"]),
          );
          const nombreFinal = nombre || clienteNombreFallback;
          if (!nombreFinal) continue;

          const ruc = norm(pick(r, ["RUC", "Ruc", "ruc", "CI/RUC", "RUC CLIENTE"])) || null;
          const cliente_nombre = clienteNombreFallback || null;
          const cargo = norm(pick(r, ["CARGO", "Cargo", "Puesto"])) || null;
          const telefono = norm(
            pick(r, ["TELEFONO", "Teléfono", "Telefono", "CELULAR", "Celular", "Móvil", "Movil", "telefono"]),
          ) || null;
          const correo = norm(pick(r, ["CORREO", "Correo", "Email", "E-mail", "EMAIL", "CORREO"])) || null;
          const wa = lower(pick(r, ["WHATSAPP", "WhatsApp", "Whatsapp", "Es Whatsapp", "TIENE_WHATSAPP"]));
          const es_whatsapp = wa === "si" || wa === "sí" || wa === "true" || wa === "1" || wa === "x" || !!telefono;
          const pr = lower(pick(r, ["PRINCIPAL", "Principal", "Es Principal", "ES_PRINCIPAL"]));
          const es_principal = pr === "si" || pr === "sí" || pr === "true" || pr === "1" || pr === "x" || !nombre;
          const notas = norm(pick(r, ["NOTAS", "Notas", "Observaciones", "OBSERVACIONES"])) || null;

          const clienteId =
            (ruc && porRuc.get(normRuc(ruc))) ??
            (cliente_nombre && (porNombre.get(cliente_nombre.toLowerCase()) ?? porNombreNorm.get(normName(cliente_nombre)))) ??
            null;

          // Dedupe del propio Excel (mismo cliente + nombre o teléfono)
          const excelKey = clienteId
            ? `${clienteId}|${normPhone(telefono ?? "")}|${nombreFinal.toLowerCase()}`
            : `noid|${ruc ?? cliente_nombre ?? ""}|${nombreFinal.toLowerCase()}`;
          if (vistosExcel.has(excelKey)) continue;
          vistosExcel.add(excelKey);

          let status: ContactoRow["_status"] = "ok";
          if (!clienteId) status = "sin-cliente";
          else if (
            (telefono && dupKeys.has(`${clienteId}|t:${normPhone(telefono)}`)) ||
            dupKeys.has(`${clienteId}|n:${nombreFinal.toLowerCase()}`)
          ) {
            status = "duplicado";
          }

          rows.push({
            cliente_ruc: ruc,
            cliente_nombre,
            nombre: nombreFinal,
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
      }

      if (rows.length === 0) return toast.error("No se encontraron filas con columna CONTACTO");
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
          help="Columnas: AÑO, SUCURSAL, SUBGRUPO, MODELO_TIPO, SERIE, CLIENTE, MARCA, VENDEDOR, LOCALIDAD"
          onFile={procesarParque}
        />
        <DropZone
          title="Importar facturación"
          help="FACTURACIÓN_HISTORICA.xlsx — lee ambas hojas (Fact. Repuestos + Fact. Servicios). Filtra Tp. Movimento = S, mapea CENTRAL→Santa Rita."
          onFile={procesarFact}
        />
        <DropZone
          title="Importar clientes"
          help="MATRIZ_CLIENTES.xlsx — fusiona ambas hojas (Cadastro + BD CLIENTES). Match por RUC con fallback a nombre. BD CLIENTES tiene prioridad."
          onFile={procesarClientes}
        />
        <DropZone
          title="Importar contactos"
          help="MATRIZ_CLIENTES.xlsx (hoja BD CLIENTES) — extrae fila por fila CONTACTO + TELEFONO + CORREO. Vincula al cliente por RUC."
          onFile={procesarContactos}
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
        <Preview
          title={`Facturación — ${factFile}`}
          rows={factRows}
          columns={["fecha", "sucursal", "entidad_nombre", "cod_factura", "tipo", "total_venta"]}
          onConfirm={confirmarFact}
          onCancel={() => setFactRows(null)}
          busy={busy}
        />
      )}

      {cliRows && (
        <Preview
          title={`Clientes — ${cliFile}`}
          rows={cliRows}
          columns={["nombre", "ruc", "region", "localidad", "direccion", "correo_principal", "sucursal"]}
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

      {/* Historial */}
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
                      <TableCell className="text-xs">{new Date(h.creado_en).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                      <TableCell className="text-xs">{h.usuario_id ? profiles[h.usuario_id] ?? "—" : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{h.tipo}</Badge></TableCell>
                      <TableCell className="text-xs truncate max-w-[180px]">{h.archivo_nombre ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_filas}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 font-medium">{h.insertados}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{h.duplicados}</TableCell>
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
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
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
                {columns.map((c) => <TableHead key={c} className="whitespace-nowrap text-[11px]">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i} className={!r._isNew ? "opacity-50" : ""}>
                  <TableCell>
                    {r._isNew ? (
                      <Badge className="bg-emerald-600 text-white text-[9px]">Nuevo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">Dup.</Badge>
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
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
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
                    {r._status === "ok" && (
                      <Badge className="bg-emerald-600 text-white text-[9px]">Nuevo</Badge>
                    )}
                    {r._status === "duplicado" && (
                      <Badge variant="secondary" className="text-[9px]">Dup.</Badge>
                    )}
                    {r._status === "sin-cliente" && (
                      <Badge variant="destructive" className="text-[9px]">Sin cliente</Badge>
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
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={onConfirm} disabled={busy || ok === 0}>
            {busy ? "Importando..." : `Confirmar (${ok})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
