/* eslint-disable @typescript-eslint/no-explicit-any -- las tablas/RPC de esta migración aún no están en los tipos generados de Supabase */
import { supabase } from "@/integrations/supabase/client";
import type { CanonicalServiceOrderRow } from "@/lib/imports/canonical";
import { matchTechnicianProfile, normalizeTechnicianName } from "@/lib/technicianMatching";
import { mapOrdenesServicioSheet, parseNewSystemWorkbook } from "@/lib/imports/newSystemXml";

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
  horas_reportadas: number | null;
  horas_calculadas: number | null;
  horas_validas: number | null;
  estado_validacion: CommissionValidationStatus;
  motivos_validacion: string[];
  raw_data: Record<string, unknown>;
  vigente: boolean;
}

interface TechnicianReference {
  id: string;
  nombre: string;
}

const roundHours = (value: number) => Math.round(value * 10_000) / 10_000;
// PostgREST serializa los filtros `.in(...)` dentro de la URL. Las claves de
// comisiones son deliberadamente descriptivas y un lote grande supera con
// facilidad el limite del proxy (el XML de referencia producia una URL de
// unos 34 KB y respondia solamente `400 Bad Request`).
const SOURCE_KEY_LOOKUP_BATCH_SIZE = 40;
const UUID_LOOKUP_BATCH_SIZE = 100;
const UPSERT_BATCH_SIZE = 100;

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

export function normalizeCommissionTime(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const colon = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    const second = Number(colon[3] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length > 6) return null;
  const padded = digits.padStart(4, "0");
  const hour = Number(padded.slice(0, padded.length - 2));
  const minute = Number(padded.slice(-2));
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function utcDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp / 86_400_000 : null;
}

function timeMinutes(value: string | null) {
  if (!value) return null;
  const [hour, minute, second] = value.split(":").map(Number);
  if (![hour, minute, second].every(Number.isFinite)) return null;
  return hour * 60 + minute + second / 60;
}

export function calculateCommissionDuration(args: {
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  reportedHours: number | null;
}) {
  const reasons: string[] = [];
  const startDay = utcDay(args.startDate);
  const endDay = utcDay(args.endDate);
  const startMinutes = timeMinutes(args.startTime);
  const endMinutes = timeMinutes(args.endTime);

  if (startDay == null || endDay == null || startMinutes == null || endMinutes == null) {
    return { calculatedHours: null, validHours: null, status: "INVALIDA" as const, reasons: ["MARCAS_DE_TIEMPO_INCOMPLETAS"] };
  }

  let durationMinutes = (endDay - startDay) * 1_440 + endMinutes - startMinutes;
  if (durationMinutes <= 0 && startDay === endDay && endMinutes < startMinutes) {
    durationMinutes += 1_440;
    reasons.push("CRUCE_DE_MEDIANOCHE_INFERIDO");
  }

  if (durationMinutes <= 0) {
    return { calculatedHours: null, validHours: null, status: "INVALIDA" as const, reasons: ["DURACION_NO_POSITIVA"] };
  }
  if (durationMinutes > 16 * 60) {
    return { calculatedHours: roundHours(durationMinutes / 60), validHours: null, status: "INVALIDA" as const, reasons: ["DURACION_MAYOR_A_16_HORAS"] };
  }

  const calculatedHours = roundHours(durationMinutes / 60);
  const reported = args.reportedHours;
  if (reported == null || reported <= 0) {
    reasons.push("CANTIDAD_REPORTADA_AUSENTE");
    return { calculatedHours, validHours: calculatedHours, status: "REVISAR" as const, reasons };
  }
  if (Math.abs(calculatedHours - reported) > 0.25) {
    reasons.push("DIFERENCIA_MAYOR_A_15_MINUTOS");
    return { calculatedHours, validHours: calculatedHours, status: "REVISAR" as const, reasons };
  }

  return { calculatedHours, validHours: calculatedHours, status: "VALIDA" as const, reasons };
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

function isKilometreParticipantLine(row: CanonicalServiceOrderRow) {
  const productCode = String(row.productCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const productName = String(row.productName ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return Number(row.kilometreQuantity ?? 0) !== 0
    || /^(?:KM|KM0*1)$/.test(productCode)
    || /^(?:KM|KM0*1)$/.test(productName);
}

function isCommissionParticipantLine(row: CanonicalServiceOrderRow) {
  return isLaborTimeLine(row) || isKilometreParticipantLine(row);
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

    // KM identifica a un participante, pero nunca contiene un horario fiable.
    // Sin al menos una linea MA01 no existe un bloque horario que se pueda heredar.
    if (!laborRows.length) continue;

    const participants = new Map<string, { source: string; origin: "MA01" | "KM" }>();
    const addParticipant = (source: string | null | undefined, origin: "MA01" | "KM") => {
      const value = String(source ?? "").trim();
      const normalized = normalizeTechnicianName(value);
      if (!normalized) return;
      const current = participants.get(normalized);
      if (!current || (current.origin === "KM" && origin === "MA01")) {
        participants.set(normalized, { source: value, origin });
      }
    };

    for (const row of serviceOrderRows) {
      const origin = isLaborTimeLine(row) ? "MA01" : "KM";
      addParticipant(row.technician, origin);
      row.auxiliaryTechnicians.forEach((value) => addParticipant(value, origin));
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
            inherited_from_ma01: participant.origin === "KM",
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
  return /comisiones_(jornadas|preparar_reimportacion)/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
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
  const entries = buildCommissionTimeEntries(args.rows, args.importId, technicians);
  const osNumbers = Array.from(new Set(entries.map((row) => row.os_numero)));

  if (!entries.length) return { inserted: 0, review: 0, invalid: 0, schemaAvailable: true };

  const { error: prepareError } = await (supabase.rpc as any)("comisiones_preparar_reimportacion", {
    p_os_numeros: osNumbers,
  });
  if (prepareError) {
    if (!args.strict && isMissingCommissionSchema(prepareError)) {
      console.info("Comisiones no se persistieron: falta aplicar la migración del módulo.");
      return { inserted: 0, review: 0, invalid: 0, schemaAvailable: false };
    }
    throw commissionRequestError("No se pudo preparar la reimportacion de las OS", prepareError);
  }

  const existingByKey = new Map<string, any>();
  for (let index = 0; index < entries.length; index += SOURCE_KEY_LOOKUP_BATCH_SIZE) {
    const keys = entries.slice(index, index + SOURCE_KEY_LOOKUP_BATCH_SIZE).map((row) => row.fuente_clave);
    const { data, error } = await (supabase
      .from("comisiones_jornadas" as any)
      .select("id,fuente_clave,estado_validacion,horas_validas,validado_por,validado_en")
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
    return [existing?.validado_por && entry.tecnico_profile_id
      ? {
          ...entry,
          estado_validacion: existing.estado_validacion,
          horas_validas: existing.horas_validas,
          validado_por: existing.validado_por,
          validado_en: existing.validado_en,
        }
      : entry];
  });

  for (let index = 0; index < payload.length; index += UPSERT_BATCH_SIZE) {
    const { error } = await (supabase.from("comisiones_jornadas" as any).upsert(payload.slice(index, index + UPSERT_BATCH_SIZE) as any, {
      onConflict: "fuente_clave",
    }) as any);
    if (error) throw commissionRequestError("No se pudieron guardar las jornadas recalculadas", error);
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
