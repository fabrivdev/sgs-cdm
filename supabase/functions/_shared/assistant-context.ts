export type AssistantContextRecord = Record<string, unknown>;

function normalizeContextText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

export function referencesVisibleContext(question: string) {
  const normalized = normalizeContextText(question);
  return includesAny(normalized, [
    "PERIODO VISIBLE",
    "RANGO VISIBLE",
    "FILTROS ACTUALES",
    "FILTRO ACTUAL",
    "ESTOS FILTROS",
    "ESTA SELECCION",
    "PERIODO SELECCIONADO",
    "EN ESTA VISTA",
  ]);
}

export function referencesAllHistory(question: string) {
  const normalized = normalizeContextText(question);
  return includesAny(normalized, [
    "TODO EL HISTORICO",
    "TODO EL HISTORIAL",
    "HISTORICO COMPLETO",
    "HISTORIAL COMPLETO",
    "DE TODOS LOS ANOS",
    "TODOS LOS ANOS",
    "DESDE SIEMPRE",
  ]);
}

/**
 * El contexto de pantalla es una ayuda, no el universo de datos del asistente.
 * Solo se hereda cuando el usuario lo pide o cuando la pregunta pertenece al
 * mismo dominio operativo de la pantalla actual.
 */
export function shouldApplyPageContext(question: string, pageContext: AssistantContextRecord) {
  if (referencesAllHistory(question)) return false;
  if (referencesVisibleContext(question)) return true;
  const normalized = normalizeContextText(question);
  const moduleName = normalizeContextText(pageContext.module);

  if (moduleName === "DASHBOARD") return false;
  if (moduleName.includes("PLANIFICADOR") || moduleName.includes("CALENDARIO")) {
    return includesAny(normalized, [
      "JORNAD", "PLANIFIC", "CALENDARIO", "PROGRAMAD", "DISPONIBIL",
      "VACACION", "CAPACITACION", "PERMISO", "CARGA", "CUADRILLA",
    ]);
  }
  if (moduleName === "TRABAJOS") {
    return includesAny(normalized, [
      "TRABAJO", "TR ", "PENDIENT", "INICIAD", "PAUSAD", "COMPLETAD", "CIERRE",
    ]);
  }
  if (moduleName.includes("PARQUE")) {
    return includesAny(normalized, ["PARQUE", "MAQUINA", "CHASIS", "SERIE", "COBERTURA"]);
  }
  if (moduleName.includes("AGENDA")) {
    return includesAny(normalized, ["AGENDA", "CONTACT", "SEGUIMIENTO", "GESTION COMERCIAL"]);
  }
  return false;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Cuenta los dias inclusivos donde un intervalo se solapa con el rango consultado. */
export function inclusiveOverlapDays(
  intervalStart: unknown,
  intervalEnd: unknown,
  rangeStart?: unknown,
  rangeEnd?: unknown,
) {
  const start = String(intervalStart ?? "").slice(0, 10);
  const end = String(intervalEnd ?? "").slice(0, 10);
  const from = String(rangeStart ?? "").slice(0, 10);
  const to = String(rangeEnd ?? "").slice(0, 10);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!validDate(start) || !validDate(end)) return 0;

  const overlapStart = validDate(from) && from > start ? from : start;
  const overlapEnd = validDate(to) && to < end ? to : end;
  if (overlapEnd < overlapStart) return 0;

  const startDate = new Date(`${overlapStart}T12:00:00Z`);
  const endDate = new Date(`${overlapEnd}T12:00:00Z`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

/** Devuelve solo fechas nombradas por el usuario; siempre prevalecen al contexto. */
export function resolveQuestionDateRange(question: string, currentDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return {};
  const normalized = normalizeContextText(question);
  const current = new Date(`${currentDate}T12:00:00Z`);
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  let range: { date_from?: string; date_to?: string } = {};
  if (includesAny(normalized, ["MES EN CURSO", "MES ACTUAL", "ESTE MES"])) {
    range = { date_from: `${currentDate.slice(0, 7)}-01`, date_to: currentDate };
  } else if (includesAny(normalized, ["ANO EN CURSO", "ANO ACTUAL", "ESTE ANO"])) {
    range = { date_from: `${currentDate.slice(0, 4)}-01-01`, date_to: currentDate };
  } else if (includesAny(normalized, ["ANO PASADO", "ANO ANTERIOR"])) {
    const year = Number(currentDate.slice(0, 4)) - 1;
    range = { date_from: `${year}-01-01`, date_to: `${year}-12-31` };
  } else if (includesAny(normalized, ["SEMANA PASADA", "SEMANA ANTERIOR"])) {
    const from = new Date(monday);
    const to = new Date(sunday);
    from.setUTCDate(from.getUTCDate() - 7);
    to.setUTCDate(to.getUTCDate() - 7);
    range = { date_from: isoDate(from), date_to: isoDate(to) };
  } else if (includesAny(normalized, ["ESTA SEMANA", "SEMANA ACTUAL", "SEMANA EN CURSO"])) {
    range = { date_from: isoDate(monday), date_to: isoDate(sunday) };
  } else if (
    normalized.includes("HOY")
    || includesAny(normalized, [
      "FACTURACION DEL DIA",
      "VENTAS DEL DIA",
      "VENTA DEL DIA",
      "FACTURADO DEL DIA",
      "DIA ACTUAL",
      "EN EL DIA DE HOY",
    ])
  ) {
    range = { date_from: currentDate, date_to: currentDate };
  } else if (normalized.includes("AYER")) {
    const yesterday = new Date(current);
    yesterday.setUTCDate(current.getUTCDate() - 1);
    range = { date_from: isoDate(yesterday), date_to: isoDate(yesterday) };
  }

  const months: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
    NOVIEMBRE: 11, DICIEMBRE: 12,
  };
  const monthEntry = Object.entries(months).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  if (monthEntry) {
    const explicitYear = normalized.match(/\b(20\d{2})\b/)?.[1];
    const year = Number(explicitYear ?? currentDate.slice(0, 4));
    const month = monthEntry[1];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    range = {
      date_from: `${year}-${String(month).padStart(2, "0")}-01`,
      date_to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  return range;
}
