/* eslint-disable @typescript-eslint/no-explicit-any -- las tablas/RPC de esta migración aún no están en los tipos generados de Supabase */
import { supabase } from "@/integrations/supabase/client";
import type { CanonicalServiceOrderRow } from "@/lib/imports/canonical";
import { matchTechnicianProfile, normalizeTechnicianName } from "@/lib/technicianMatching";
import { mapOrdenesServicioSheet, parseNewSystemWorkbook } from "@/lib/imports/newSystemXml";
import {
  calculateCommissionDuration,
  normalizeCommissionTime,
} from "@/lib/imports/workDuration";

export { calculateCommissionDuration, normalizeCommissionTime };

export type CommissionValidationStatus = "VALIDA" | "REVISAR" | "INVALIDA";

export interface CommissionTimeEntry {
  fuente_clave: string;
  importacion_id: string | null;
  origen_sistema: string;
  sucursal: string | null;
  os_numero: string;
  cliente_nombre: string | null;
  nro_chasis: string | null;
  estado_os: string | null;
  fecha_cierre: string | null;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  fecha_fin: string | null;
  hora_fin: string | null;
  tecnico_codigo: string | null;
  tecnico_nombre: string;
  tecnico_profile_id: string | null;
  rol_tecnico: "PRINCIPAL" | "AUXILIAR";
  tipo_tiempo: "Cliente" | "Garantia" | "Interno" | "Desconocido";
  tipo_tiempo_importado: "Cliente" | "Garantia" | "Interno" | "Desconocido";
  tipo_tiempo_ajustado: boolean;
  tipo_tiempo_ajustado_por: string | null;
  tipo_tiempo_ajustado_en: string | null;
  horas_reportadas: number | null;
  horas_calculadas: number | null;
  horas_validas: number | null;
  estado_validacion: CommissionValidationStatus;
  motivos_validacion: string[];
  validado_por?: string | null;
  validado_en?: string | null;
  raw_data: Record<string, unknown>;
  vigente: boolean;
}

export interface HistoricalInheritedParticipant {
  os_numero: string;
  source: string;
  origin: "KM" | "SE";
}

interface TechnicianReference {
  id: string;
  nombre: string;
}

// PostgREST serializa los filtros `.in(...)` dentro de la URL. Las claves de
// comisiones son deliberadamente descriptivas y un lote grande supera con
// facilidad el limite del proxy (el XML de referencia producia una URL de
// unos 34 KB y respondia solamente `400 Bad Request`).
const SOURCE_KEY_LOOKUP_BATCH_SIZE = 40;
const UUID_LOOKUP_BATCH_SIZE = 100;

function commissionRequestError(stage: string, error: unknown) {
  const candidate = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
  } | null;
  const parts = [
    candidate?.message,
    candidate?.code ? `codigo ${candidate.code}` : null,
    candidate?.details,
    candidate?.hint,
    candidate?.status ? `HTTP ${candidate.status}` : null,
  ].filter((value): value is string => Boolean(value));
  return new Error(`${stage}: ${parts.join(" | ") || String(error)}`);
}

function rawText(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text && !/^[-_.]+$/.test(text)) return text;
  }
  return null;
}

function parseTechnician(value: string) {
  const trimmed = value.trim();
  const codeMatch = trimmed.match(/^([A-Z]{0,6}\d{2,})\s*(?:[-:|/]\s*)?/i);
  return {
    code: codeMatch?.[1] ?? null,
    name: normalizeTechnicianName(trimmed) || trimmed,
  };
}

function commissionProductToken(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isLaborTimeLine(row: CanonicalServiceOrderRow) {
  const productCode = commissionProductToken(row.productCode);
  const productName = commissionProductToken(row.productName);
  return productCode === "MA01" || productName === "MA01";
}

type InheritedParticipantOrigin = "KM" | "SE";

function inheritedParticipantOrigin(row: CanonicalServiceOrderRow): InheritedParticipantOrigin | null {
  const productCode = commissionProductToken(row.productCode);
  const productName = commissionProductToken(row.productName);
  if (
    Number(row.kilometreQuantity ?? 0) !== 0
    || /^(?:KM|KM0*1)$/.test(productCode)
    || /^(?:KM|KM0*1)$/.test(productName)
  ) return "KM";
  if (
    /^(?:SE|SE0*1)$/.test(productCode)
    || /^(?:SE|SE0*1)$/.test(productName)
    || productName === "SERVICIOTERCERIZADO"
  ) return "SE";
  return null;
}

export function historicalInheritedParticipantOrigin(rawData: Record<string, unknown>): InheritedParticipantOrigin | null {
  const explicitOrigin = rawData.source_participant_origin;
  if (explicitOrigin === "KM" || explicitOrigin === "SE") return explicitOrigin;

  // Las primeras jornadas del módulo se guardaron antes de incorporar
  // `source_participant_origin`, pero ya conservaban el código y el nombre del
  // producto original. Recuperar el origen desde esos campos evita perder al
  // técnico en una reimportación posterior de una OS histórica.
  const productCode = commissionProductToken(rawData.source_product_code);
  const productName = commissionProductToken(rawData.source_product_name);
  if (/^(?:KM|KM0*1)$/.test(productCode) || /^(?:KM|KM0*1)$/.test(productName)) return "KM";
  if (
    /^(?:SE|SE0*1)$/.test(productCode)
    || /^(?:SE|SE0*1)$/.test(productName)
    || productName === "SERVICIOTERCERIZADO"
  ) return "SE";
  return null;
}

function isCommissionParticipantLine(row: CanonicalServiceOrderRow) {
  return isLaborTimeLine(row) || inheritedParticipantOrigin(row) !== null;
}

function timeBlockKey(row: CanonicalServiceOrderRow) {
  return [
    row.raw.canonical_start_date,
    normalizeCommissionTime(row.raw.canonical_start_time),
    row.raw.canonical_end_date,
    normalizeCommissionTime(row.raw.canonical_end_time),
    row.timeType,
  ].map((value) => String(value ?? "").trim().toUpperCase()).join("|");
}

function sourceKey(row: CanonicalServiceOrderRow, technician: string, role: string) {
  const raw = row.raw;
  return [
    "COMISION",
    row.serviceOrderNumber,
    rawText(raw, ["ITEM", "Item"]),
    row.documentNumber,
    raw.canonical_start_date,
    raw.canonical_start_time,
    raw.canonical_end_date,
    raw.canonical_end_time,
    row.timeType,
    normalizeTechnicianName(technician),
    role,
  ].map((value) => String(value ?? "").trim().toUpperCase()).join("|");
}

export function buildCommissionTimeEntries(
  rows: CanonicalServiceOrderRow[],
  importId: string | null,
  technicians: TechnicianReference[] = [],
  historicalInheritedParticipants: HistoricalInheritedParticipant[] = [],
): CommissionTimeEntry[] {
  const entries = new Map<string, CommissionTimeEntry>();
  const rowsByServiceOrder = new Map<string, CanonicalServiceOrderRow[]>();

  for (const row of rows) {
    if (!isCommissionParticipantLine(row)) continue;
    const current = rowsByServiceOrder.get(row.serviceOrderNumber) ?? [];
    current.push(row);
    rowsByServiceOrder.set(row.serviceOrderNumber, current);
  }

  for (const serviceOrderRows of rowsByServiceOrder.values()) {
    const laborRowsByBlock = new Map<string, CanonicalServiceOrderRow>();
    for (const row of serviceOrderRows) {
      if (!isLaborTimeLine(row)) continue;
      const blockKey = timeBlockKey(row);
      if (!laborRowsByBlock.has(blockKey)) laborRowsByBlock.set(blockKey, row);
    }
    const laborRows = Array.from(laborRowsByBlock.values());

    // KM y SE identifican participantes, pero no contienen un horario fiable.
    // Sin al menos una linea MA01 no existe un bloque horario que se pueda heredar.
    if (!laborRows.length) continue;

    type ParticipantOrigin = "MA01" | InheritedParticipantOrigin;
    const participants = new Map<string, { source: string; origin: ParticipantOrigin }>();
    const addParticipant = (source: string | null | undefined, origin: ParticipantOrigin) => {
      const value = String(source ?? "").trim();
      const normalized = normalizeTechnicianName(value);
      if (!normalized) return;
      const current = participants.get(normalized);
      if (!current || (current.origin !== "MA01" && origin === "MA01")) {
        participants.set(normalized, { source: value, origin });
      }
    };

    for (const row of serviceOrderRows) {
      const origin: ParticipantOrigin | null = isLaborTimeLine(row)
        ? "MA01"
        : inheritedParticipantOrigin(row);
      if (!origin) continue;
      addParticipant(row.technician, origin);
      row.auxiliaryTechnicians.forEach((value) => addParticipant(value, origin));
    }

    // Los reportes diarios pueden volver a incluir una OS sin repetir todas sus
    // lineas KM/SE historicas. Esos renglones identifican participantes, no
    // horarios: conservar el ultimo participante conocido evita que una carga
    // parcial borre comisiones ya reconstruidas correctamente.
    const serviceOrderNumber = serviceOrderRows[0]?.serviceOrderNumber;
    for (const participant of historicalInheritedParticipants) {
      if (participant.os_numero !== serviceOrderNumber) continue;
      addParticipant(participant.source, participant.origin);
    }

    const principalName = laborRows
      .map((row) => normalizeTechnicianName(String(row.technician ?? "")))
      .find(Boolean) ?? null;

    for (const row of laborRows) {
      const startDate = String(row.raw.canonical_start_date ?? "").trim() || null;
      const endDate = String(row.raw.canonical_end_date ?? "").trim() || null;
      const startTime = normalizeCommissionTime(row.raw.canonical_start_time);
      const endTime = normalizeCommissionTime(row.raw.canonical_end_time);
      const reportedHours = Number.isFinite(row.serviceHours) ? row.serviceHours : null;
      const duration = calculateCommissionDuration({ startDate, startTime, endDate, endTime, reportedHours });

      for (const [normalizedName, participant] of participants.entries()) {
        const role = principalName === normalizedName ? "PRINCIPAL" : "AUXILIAR";
        const parsed = parseTechnician(participant.source);
        const matched = matchTechnicianProfile(parsed.name, technicians);
        const key = sourceKey(row, participant.source, role);
        const validationReasons = matched
          ? duration.reasons
          : Array.from(new Set([...duration.reasons, "TECNICO_FUERA_DE_NOMINA_ACTIVA"]));
        const validationStatus = !matched && duration.status !== "INVALIDA"
          ? "REVISAR"
          : duration.status;
        entries.set(key, {
          fuente_clave: key,
          importacion_id: importId,
          origen_sistema: "new_xml_ordenes_servicio",
          sucursal: row.branch,
          os_numero: row.serviceOrderNumber,
          cliente_nombre: row.ownerName ?? row.billedClientName,
          nro_chasis: row.chassis,
          estado_os: row.status,
          fecha_cierre: row.closeDate,
          fecha_inicio: startDate,
          hora_inicio: startTime,
          fecha_fin: endDate,
          hora_fin: endTime,
          tecnico_codigo: parsed.code,
          tecnico_nombre: matched?.nombre ?? parsed.name,
          tecnico_profile_id: matched?.id ?? null,
          rol_tecnico: role,
          tipo_tiempo: row.timeType,
          tipo_tiempo_importado: row.timeType,
          tipo_tiempo_ajustado: false,
          tipo_tiempo_ajustado_por: null,
          tipo_tiempo_ajustado_en: null,
          horas_reportadas: reportedHours,
          horas_calculadas: duration.calculatedHours,
          horas_validas: matched ? duration.validHours : null,
          estado_validacion: validationStatus,
          motivos_validacion: validationReasons,
          raw_data: {
            source_row_id: row.rowId,
            source_os_number: row.sourceServiceOrderNumber,
            source_branch_code: row.branchCode,
            source_client_name: row.ownerName,
            source_billed_client_name: row.billedClientName,
            source_chassis: row.chassis,
            source_product_code: row.productCode,
            source_product_name: row.productName,
            source_technician: participant.source,
            source_participant_origin: participant.origin,
            inherited_from_ma01: participant.origin !== "MA01",
          },
          vigente: true,
        });
      }
    }
  }

  return Array.from(entries.values());
}

function isMissingCommissionSchema(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  return /comisiones_(jornadas|preparar_reimportacion|reemplazar_jornadas)/i.test(message)
    && /does not exist|schema cache|could not find/i.test(message);
}

export async function persistCommissionTimeEntries(args: {
  rows: CanonicalServiceOrderRow[];
  importId: string | null;
  strict?: boolean;
}) {
  const { data: technicianRows, error: technicianError } = await (supabase.rpc as any)("servicios_listar_tecnicos_activos");
  if (technicianError) throw commissionRequestError("No se pudo consultar el plantel de tecnicos", technicianError);
  const technicians = ((technicianRows ?? []) as Array<{ id: string; nombre: string }>).map((row) => ({
    id: row.id,
    nombre: row.nombre,
  }));
  const candidateOsNumbers = Array.from(new Set(
    args.rows
      .filter(isCommissionParticipantLine)
      .map((row) => row.serviceOrderNumber)
      .filter(Boolean),
  ));
  const historicalInheritedParticipants: HistoricalInheritedParticipant[] = [];
  for (let index = 0; index < candidateOsNumbers.length; index += UUID_LOOKUP_BATCH_SIZE) {
    const { data, error } = await (supabase
      .from("comisiones_jornadas" as any)
      .select("os_numero,tecnico_nombre,raw_data,actualizado_en")
      .eq("origen_sistema", "new_xml_ordenes_servicio")
      .eq("vigente", true)
      .in("os_numero", candidateOsNumbers.slice(index, index + UUID_LOOKUP_BATCH_SIZE))
      .order("actualizado_en", { ascending: false }) as any);
    if (error) {
      if (!args.strict && isMissingCommissionSchema(error)) {
        console.info("Comisiones no se persistieron: falta aplicar la migración del módulo.");
        return { inserted: 0, review: 0, invalid: 0, schemaAvailable: false };
      }
      throw commissionRequestError("No se pudieron recuperar los participantes historicos", error);
    }
    for (const row of data ?? []) {
      const rawData = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
      const origin = historicalInheritedParticipantOrigin(rawData);
      if (!origin) continue;
      const source = String(rawData.source_technician ?? row.tecnico_nombre ?? "").trim();
      if (!source) continue;
      historicalInheritedParticipants.push({ os_numero: row.os_numero, source, origin });
    }
  }

  const entries = buildCommissionTimeEntries(
    args.rows,
    args.importId,
    technicians,
    historicalInheritedParticipants,
  );
  const osNumbers = Array.from(new Set(entries.map((row) => row.os_numero)));

  if (!entries.length) return { inserted: 0, review: 0, invalid: 0, schemaAvailable: true };

  const existingByKey = new Map<string, any>();
  for (let index = 0; index < entries.length; index += SOURCE_KEY_LOOKUP_BATCH_SIZE) {
    const keys = entries.slice(index, index + SOURCE_KEY_LOOKUP_BATCH_SIZE).map((row) => row.fuente_clave);
    const { data, error } = await (supabase
      .from("comisiones_jornadas" as any)
      .select("id,fuente_clave,estado_validacion,horas_validas,validado_por,validado_en,tipo_tiempo,tipo_tiempo_importado,tipo_tiempo_ajustado,tipo_tiempo_ajustado_por,tipo_tiempo_ajustado_en")
      .in("fuente_clave", keys) as any);
    if (error) throw commissionRequestError("No se pudieron comprobar las jornadas ya cargadas", error);
    for (const row of data ?? []) existingByKey.set(row.fuente_clave, row);
  }

  const paidExistingIds = new Set<string>();
  const existingIds = Array.from(existingByKey.values()).map((row) => String(row.id));
  for (let index = 0; index < existingIds.length; index += UUID_LOOKUP_BATCH_SIZE) {
    const { data, error } = await (supabase
      .from("comisiones_liquidacion_detalle" as any)
      .select("jornada_id")
      .in("jornada_id", existingIds.slice(index, index + UUID_LOOKUP_BATCH_SIZE)) as any);
    if (error) throw commissionRequestError("No se pudo comprobar si las jornadas ya fueron pagadas", error);
    for (const row of data ?? []) paidExistingIds.add(String(row.jornada_id));
  }

  const payload = entries.flatMap((entry) => {
    const existing = existingByKey.get(entry.fuente_clave);
    if (existing && paidExistingIds.has(String(existing.id))) return [];
    let next = { ...entry };
    if (existing?.validado_por && entry.tecnico_profile_id) {
      next = {
        ...next,
        estado_validacion: existing.estado_validacion,
        horas_validas: existing.horas_validas,
        validado_por: existing.validado_por,
        validado_en: existing.validado_en,
      };
    }
    if (existing?.tipo_tiempo_ajustado) {
      next = {
        ...next,
        tipo_tiempo: existing.tipo_tiempo,
        tipo_tiempo_ajustado: true,
        tipo_tiempo_ajustado_por: existing.tipo_tiempo_ajustado_por,
        tipo_tiempo_ajustado_en: existing.tipo_tiempo_ajustado_en,
      };
    }
    return [next];
  });

  // El reemplazo se realiza dentro de una sola transacción de PostgreSQL. Así
  // una falla de red o un XML parcial nunca puede dejar una OS desactivada a
  // mitad del proceso: o se desactivan y recrean todas las jornadas, o ninguna.
  const { error: replaceError } = await (supabase.rpc as any)("comisiones_reemplazar_jornadas", {
    p_os_numeros: osNumbers,
    p_jornadas: payload,
  });
  if (replaceError) {
    if (!args.strict && isMissingCommissionSchema(replaceError)) {
      console.info("Comisiones no se persistieron: falta aplicar la migración del reemplazo atómico.");
      return { inserted: 0, review: 0, invalid: 0, schemaAvailable: false };
    }
    throw commissionRequestError("No se pudieron reemplazar atomícamente las jornadas", replaceError);
  }

  return {
    inserted: payload.length,
    review: payload.filter((row) => row.estado_validacion === "REVISAR").length,
    invalid: payload.filter((row) => row.estado_validacion === "INVALIDA").length,
    schemaAvailable: true,
  };
}

export async function importCommissionXmlOnly(args: {
  file: File;
  userId: string;
}) {
  const workbook = parseNewSystemWorkbook(await args.file.text());
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("El XML no contiene una hoja utilizable.");
  const envelope = mapOrdenesServicioSheet(args.file.name, sheet);

  const { data: importRow, error: importError } = await supabase
    .from("importaciones")
    .insert({
      tipo: "facturacion",
      archivo_nombre: args.file.name,
      origen_sistema: "comisiones_os_backfill",
      total_filas: envelope.rows.length,
      insertados: 0,
      duplicados: 0,
      usuario_id: args.userId,
      metadata: {
        modulo: "comisiones",
        alcance: "solo_jornadas_tecnicos",
        no_reimporta: ["clientes", "productos", "facturacion", "ordenes_servicio_resumen"],
        worksheet: sheet.name,
      },
    } as any)
    .select("id")
    .single();
  if (importError) throw commissionRequestError("No se pudo registrar la carga inicial", importError);

  const result = await persistCommissionTimeEntries({
    rows: envelope.rows,
    importId: importRow.id,
    strict: true,
  });
  const { error: updateError } = await supabase
    .from("importaciones")
    .update({ insertados: result.inserted, duplicados: envelope.rows.length - result.inserted } as any)
    .eq("id", importRow.id);
  if (updateError) throw commissionRequestError("Las jornadas se guardaron, pero no se pudo cerrar la importacion", updateError);

  return { ...result, sourceRows: envelope.rows.length };
}
