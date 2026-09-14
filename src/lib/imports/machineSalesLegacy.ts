import * as XLSX from "xlsx";
import type { Marca, Sucursal } from "@/lib/constants";
import { matchSucursalFromRegion } from "@/lib/imports";

export const MACHINE_SALES_LEGACY_CUTOFF = "2026-06-30";

export type MachineSalesLegacyRow = {
  linea_clave: string;
  fecha_factura: string;
  sucursal: Sucursal;
  vendedor: string | null;
  cod_mercaderia: string;
  nombre_mercaderia: string;
  tipo_movimiento: "S" | "E";
  cod_entidad: string | null;
  entidad_nombre: string;
  grupo: string;
  plan_financiacion: string | null;
  factura: string;
  cantidad: number;
  total_venta: number;
  valor_medio: number;
  total_cobrado: number;
  saldo: number;
  fecha_vencimiento: string | null;
  margen_venta_pct: number;
  margen_costo_pct: number;
  lucro_bruto: number;
  costo_medio: number;
  costo_total: number;
  fecha_pedido: string | null;
  codigo_pedido: string | null;
  precio_tabla: number;
  chasis: string | null;
  marca_estimada: Marca;
  tipo_maquina_estimado: string;
  modelo_estimado: string;
  raw_data: Record<string, unknown>;
};

export type MachineSalesLegacyPreview = {
  sheetName: string;
  rows: MachineSalesLegacyRow[];
  desde: string;
  hasta: string;
  ventaBruta: number;
  notasCredito: number;
  facturacionNeta: number;
  vendidas: number;
  acreditadas: number;
};

const text = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const headerKey = (value: unknown) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function pick(row: Record<string, unknown>, name: string) {
  const target = headerKey(name);
  const key = Object.keys(row).find(candidate => headerKey(candidate) === target);
  return key ? row[key] : null;
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const normalized = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  return Number(normalized) || 0;
}

function date(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : null;
  }
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function inferLegacyMachineChassis(value: unknown) {
  const source = text(value).toUpperCase();
  const patterns = [
    /\bCHASS?I?S?\s*:?\s*([A-Z0-9-]{7,})\b/,
    /\bSERIE\s*:?\s*([A-Z0-9-]{7,})\b/,
    /\bN[°º]\s*([A-Z0-9-]{7,})\b/,
    /\b([A-Z][A-Z0-9-]{7,})\s*-?\s*MOTOR\b/,
    /\/\s*([A-Z0-9-]{8,})\s*$/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1].replace(/^-+|-+$/g, "");
  }
  return null;
}

export function inferLegacyMachineType(groupValue: unknown, descriptionValue: unknown) {
  const group = text(groupValue).toUpperCase();
  const description = text(descriptionValue).toUpperCase();
  if (/PLANTADOR|SEMBRADOR|MAESTRO|DAKAR/.test(`${group} ${description}`)) return "SEMBRADORAS";
  if (/PICADORA/.test(group) && /^MAQ/.test(group)) return "PICADORAS";
  if (/PLATAFORMA|CABEZAL|ORBIS|CONVIO|DIRECT DISC/.test(`${group} ${description}`)) return "PLATAFORMAS/CABEZALES";
  if (/COSECHADORA|TRION|LEXION/.test(`${group} ${description}`)) return "COSECHADORAS";
  if (/PULVERIZ/.test(`${group} ${description}`)) return "PULVERIZADORAS";
  if (/TRACTOR/.test(`${group} ${description}`)) return "TRACTORES";
  if (/SUELO|SUBSOLADOR|JOKER/.test(`${group} ${description}`)) return "SUELO";
  return "OTRO";
}

export function inferLegacyMachineBrand(groupValue: unknown, descriptionValue: unknown): Marca {
  const value = `${text(groupValue)} ${text(descriptionValue)}`.toUpperCase();
  if (/STARA|JOHN DEERE|BALDAN|MACDON|MASSEY|ALLOCHIS/.test(value)) return "OTROS";
  if (/MAESTRO|DAKAR|JOKER|SUBSOLADOR|PLANTADORA SEMBRADORA|MANEJO DE SUELO/.test(value)) return "HORSCH";
  if (/CLAAS|TRION|LEXION|JAGUAR|ORBIS|CONVIO|DIRECT DISC|MAQ COSECHADORAS|MAQ PICADORAS/.test(value)) return "CLAAS";
  return "OTROS";
}

export function inferLegacyMachineModel(value: unknown) {
  const source = text(value).toUpperCase();
  const known = source.match(/\b(TRION\s+\d+|LEXION\s+\d+|JAGUAR\s+\d+|MAESTRO(?:\s+KOMPASS)?\s+(?:\d+\s+CF\s+)?\d+(?:\.\d+)?|DAKAR\s+\d+\s+CF|JOKER\s+\d+\s+RT\+?|ORBIS\s+\d+|CONVIO\s+FLEX\s+\d+|DIRECT\s+DISC\s+\d+)/);
  if (known) return known[1].replace(/\s+/g, " ");
  return source
    .replace(/\b(?:CHASS?I?S?|SERIE)\s*:?\s*[A-Z0-9-]+.*$/, "")
    .replace(/\bN[°º]?\s*[A-Z0-9-]+.*$/, "")
    .replace(/\s+/g, " ")
    .trim() || "Modelo no informado";
}

export function parseMachineSalesLegacyWorkbook(buffer: ArrayBuffer): MachineSalesLegacyPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no contiene hojas.");
  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });
  if (!sourceRows.length) throw new Error("La hoja está vacía.");

  const required = ["Fecha Factura", "Código Factura", "Cod. Mercaderia", "Nombre Mercaderia", "Tp. Movimento", "Entidad", "Grupo", "Cant. Unit.", "Total Venta"];
  const present = new Set(Object.keys(sourceRows[0]).map(headerKey));
  const missing = required.filter(column => !present.has(headerKey(column)));
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);

  const rows = sourceRows.map((source, index): MachineSalesLegacyRow => {
    const fechaFactura = date(pick(source, "Fecha Factura"));
    const factura = text(pick(source, "Código Factura"));
    const codigo = text(pick(source, "Cod. Mercaderia"));
    const description = text(pick(source, "Nombre Mercaderia"));
    const group = text(pick(source, "Grupo"));
    const movement = text(pick(source, "Tp. Movimento")).toUpperCase();
    if (!fechaFactura || !factura || !codigo || !description || !group || !["S", "E"].includes(movement)) {
      throw new Error(`La línea ${index + 2} tiene fecha, factura, máquina, grupo o movimiento inválido.`);
    }
    if (fechaFactura > MACHINE_SALES_LEGACY_CUTOFF) {
      throw new Error(`La línea ${index + 2} supera el corte histórico del ${MACHINE_SALES_LEGACY_CUTOFF}.`);
    }
    const sign = movement === "E" ? -1 : 1;
    const quantity = Math.abs(number(pick(source, "Cant. Unit."))) * sign;
    const amount = Math.abs(number(pick(source, "Total Venta"))) * sign;
    const entity = text(pick(source, "Entidad")) || "Cliente histórico";
    const stableKey = [fechaFactura, factura, codigo, description, movement, text(pick(source, "Cod. Entidad")), quantity, amount].join("|");
    return {
      linea_clave: stableKey,
      fecha_factura: fechaFactura,
      sucursal: matchSucursalFromRegion(text(pick(source, "Sucursal"))) ?? "Santa Rita",
      vendedor: text(pick(source, "Vendedor")) || null,
      cod_mercaderia: codigo,
      nombre_mercaderia: description,
      tipo_movimiento: movement as "S" | "E",
      cod_entidad: text(pick(source, "Cod. Entidad")) || null,
      entidad_nombre: entity,
      grupo: group,
      plan_financiacion: text(pick(source, "Plan Financiación")) || null,
      factura,
      cantidad: quantity,
      total_venta: amount,
      valor_medio: Math.abs(number(pick(source, "Valor Medio"))) * sign,
      total_cobrado: number(pick(source, "Total Cobrado")),
      saldo: number(pick(source, "Saldo")),
      fecha_vencimiento: date(pick(source, "Fecha Vencimiento")),
      margen_venta_pct: number(pick(source, "Margen Venta %")),
      margen_costo_pct: number(pick(source, "Margen Costo %")),
      lucro_bruto: number(pick(source, "Lucro Bruto")),
      costo_medio: number(pick(source, "Costo Medio")),
      costo_total: number(pick(source, "Costo Total")),
      fecha_pedido: date(pick(source, "Fecha Pedido")),
      codigo_pedido: text(pick(source, "Código Pedido")) || null,
      precio_tabla: number(pick(source, "Precio Tabla")),
      chasis: inferLegacyMachineChassis(description),
      marca_estimada: inferLegacyMachineBrand(group, description),
      tipo_maquina_estimado: inferLegacyMachineType(group, description),
      modelo_estimado: inferLegacyMachineModel(description),
      raw_data: source,
    };
  });

  const dates = rows.map(row => row.fecha_factura).sort();
  return {
    sheetName,
    rows,
    desde: dates[0],
    hasta: dates[dates.length - 1],
    ventaBruta: rows.filter(row => row.total_venta > 0).reduce((sum, row) => sum + row.total_venta, 0),
    notasCredito: Math.abs(rows.filter(row => row.total_venta < 0).reduce((sum, row) => sum + row.total_venta, 0)),
    facturacionNeta: rows.reduce((sum, row) => sum + row.total_venta, 0),
    vendidas: rows.filter(row => row.cantidad > 0).reduce((sum, row) => sum + row.cantidad, 0),
    acreditadas: Math.abs(rows.filter(row => row.cantidad < 0).reduce((sum, row) => sum + row.cantidad, 0)),
  };
}
