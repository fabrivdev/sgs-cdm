import {
  semanticCatalog,
  shouldSortTemporalSeriesChronologically,
  type BusinessDataset,
  type GenericQueryPlan,
  type SemanticRecord,
} from "./assistant-semantic.ts";

export type DominantOutlier = { metric: string; top: number; median: number; ratio: number };
export type PendingHoursCaveat = { pendingJornadas: number };
export type CycleTimeCaveat = { closedCount: number; median: number; average: number };
export type ExecutionCoverageCaveat = { withDataCount: number; totalCount: number; median: number; average: number };
export type OsCycleTimeCaveat = { withDataCount: number; totalCount: number; median: number; average: number };

export type BusinessQueryResult = {
  dataset: BusinessDataset;
  definition: string;
  metrics: string[];
  dimensions: string[];
  filters: SemanticRecord;
  granularity: string;
  source_rows: number;
  result_rows: number;
  rows: SemanticRecord[];
  outlier?: DominantOutlier | null;
  pending_hours_caveat?: PendingHoursCaveat | null;
  cycle_time_caveat?: CycleTimeCaveat | null;
  execution_coverage_caveat?: ExecutionCoverageCaveat | null;
  os_cycle_time_caveat?: OsCycleTimeCaveat | null;
};

export type ExecutedSemanticQuery = {
  args: GenericQueryPlan;
  data: BusinessQueryResult;
};

type DeterministicAnswerInput = {
  question: string;
  results: ExecutedSemanticQuery[];
  mode: "brief" | "analytic";
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, maximumFractionDigits = 2) {
  return numberValue(value).toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function metricValue(dataset: BusinessDataset, metric: string, value: unknown) {
  const definition = semanticCatalog[dataset].metrics[metric as keyof typeof semanticCatalog[typeof dataset]["metrics"]];
  const unit = definition?.unit;
  if (unit === "usd") return `USD ${formatNumber(value, 2)}`;
  if (unit === "hours") return `${formatNumber(value, 2)} hs`;
  if (unit === "km") return `${formatNumber(value, 2)} km`;
  if (unit === "ratio") return `${formatNumber(numberValue(value) * 100, 1)}%`;
  if (unit === "days") return `${formatNumber(value, 1)} dias`;
  return formatNumber(value, 2);
}

function metricLabel(dataset: BusinessDataset, metric: string) {
  return semanticCatalog[dataset].metrics[metric as keyof typeof semanticCatalog[typeof dataset]["metrics"]]?.label ?? metric;
}

function dimensionLabel(dataset: BusinessDataset, dimension: string) {
  return semanticCatalog[dataset].dimensions[dimension as keyof typeof semanticCatalog[typeof dataset]["dimensions"]]?.label ?? dimension;
}

function formatPeriodValue(value: unknown, granularity: string) {
  const text = String(value ?? "");
  if (granularity === "year" && /^\d{4}$/.test(text)) return text;
  if (granularity === "month" && /^\d{4}-\d{2}$/.test(text)) {
    const date = new Date(`${text}-01T12:00:00Z`);
    return new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  if (granularity === "week" && /^\d{4}-\d{2}-\d{2}$/.test(text)) return `semana del ${text}`;
  return text || "Sin dato";
}

function dimensionValue(row: SemanticRecord, dimension: string, granularity: string) {
  const value = row[dimension];
  return dimension === "periodo" ? formatPeriodValue(value, granularity) : String(value ?? "Sin dato");
}

function periodLine(filters: SemanticRecord) {
  const from = String(filters.date_from ?? "").trim();
  const to = String(filters.date_to ?? "").trim();
  if (from && to) return `Periodo consultado: ${from} al ${to}.`;
  if (from) return `Periodo consultado: desde ${from}.`;
  if (to) return `Periodo consultado: hasta ${to}.`;
  return "Periodo consultado: todo el historico disponible.";
}

function filterLines(dataset: BusinessDataset, filters: SemanticRecord) {
  const ignored = new Set(["date_from", "date_to"]);
  return Object.entries(filters)
    .filter(([key, value]) => !ignored.has(key) && value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => {
      const label = key === "sucursales" ? "Sucursales" : dimensionLabel(dataset, key);
      const display = Array.isArray(value) ? value.join(", ") : String(value);
      return `${label}: ${display}`;
    });
}

function isSecondPlaceQuestion(question: string) {
  const text = normalizeText(question);
  return text.includes("LE SIGUE") || text.includes("SEGUNDO LUGAR") || text.includes("SEGUNDA POSICION");
}

function selectedRows(question: string, rows: SemanticRecord[]) {
  if (isSecondPlaceQuestion(question) && rows.length > 1) return [rows[1]];
  return rows;
}

function rowLine(plan: GenericQueryPlan, row: SemanticRecord, index: number) {
  const dimensions = plan.dimensions
    .map((dimension) => dimensionValue(row, dimension, plan.granularity))
    .join(" | ");
  const metrics = plan.metrics
    .map((metric) => `${metricLabel(plan.dataset, metric)}: ${metricValue(plan.dataset, metric, row[metric])}`)
    .join(" | ");
  return `${index + 1}. ${dimensions || semanticCatalog[plan.dataset].label}: ${metrics}`;
}

function renderSingleResult(question: string, result: ExecutedSemanticQuery, mode: "brief" | "analytic") {
  const { args: plan, data } = result;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const filters = plan.filters ?? {};
  const period = periodLine(filters);
  const appliedFilters = filterLines(plan.dataset, filters);

  if (!numberValue(data.source_rows)) {
    const suffix = appliedFilters.length ? ` Filtros: ${appliedFilters.join("; ")}.` : "";
    return `No se encontraron datos de ${semanticCatalog[plan.dataset].label.toLowerCase()} para la consulta. ${period}${suffix}`;
  }

  if (!plan.dimensions.length) {
    const row = rows[0] ?? {};
    const values = plan.metrics.map((metric) => `${metricLabel(plan.dataset, metric)}: ${metricValue(plan.dataset, metric, row[metric])}`);
    const filterText = appliedFilters.length ? ` Filtros: ${appliedFilters.join("; ")}.` : "";
    const caveats = [
      pendingHoursCaveat(data.pending_hours_caveat),
      cycleTimeCaveat(data.cycle_time_caveat),
      executionCoverageCaveat(data.execution_coverage_caveat),
      osCycleTimeCaveat(data.os_cycle_time_caveat),
    ].filter(Boolean).join(" ");
    return `${values.join(" | ")}. ${period}${filterText}${caveats ? ` ${caveats}` : ""}`;
  }

  const rankedRows = selectedRows(question, rows);
  const chronologicalSeries = shouldSortTemporalSeriesChronologically(question, plan.dimensions);
  const visibleLimit = chronologicalSeries
    ? plan.granularity === "day" ? 31 : plan.granularity === "week" ? 26 : 24
    : mode === "analytic" ? 20 : 10;
  const visibleRows = rankedRows.slice(0, visibleLimit);
  const dimensionTitle = plan.dimensions.map((dimension) => dimensionLabel(plan.dataset, dimension)).join(" / ");
  const metricTitle = plan.metrics.map((metric) => metricLabel(plan.dataset, metric)).join(" / ");
  const lines = visibleRows.map((row, index) => rowLine(plan, row, index));
  const omitted = Math.max(0, data.result_rows - visibleRows.length);
  const footer = [
    period,
    appliedFilters.length ? `Filtros: ${appliedFilters.join("; ")}.` : "",
    omitted ? `Se muestran ${visibleRows.length} de ${data.result_rows} resultados.` : "",
    outlierCaveat(plan.dataset, data.outlier),
    pendingHoursCaveat(data.pending_hours_caveat),
    cycleTimeCaveat(data.cycle_time_caveat),
    executionCoverageCaveat(data.execution_coverage_caveat),
    osCycleTimeCaveat(data.os_cycle_time_caveat),
  ].filter(Boolean).join(" ");
  return `${metricTitle} por ${dimensionTitle}:\n${lines.join("\n")}\n${footer}`;
}

/**
 * Avisa cuando el valor ganador de un ranking domina de forma desproporcionada
 * al resto de los resultados comparables: puede ser un dato cargado mal, no un
 * maximo real. Ver convencion "honestidad de datos" del proyecto.
 */
function outlierCaveat(dataset: BusinessDataset, outlier: DominantOutlier | null | undefined) {
  if (!outlier) return "";
  const metric = metricLabel(dataset, outlier.metric).toLowerCase();
  return `Aviso: el primer resultado (${metric} ${formatNumber(outlier.top, 2)}) es ${formatNumber(outlier.ratio, 1)} veces mas alto que el resto de los valores comparables; podria ser un dato cargado incorrectamente. Verificalo en la fuente antes de darlo por valido.`;
}

/**
 * Las horas de tecnicos solo se acumulan en jornadas Completadas. Si el
 * resultado incluye jornadas Pendientes, "0 hs" no significa que no trabajaron
 * sino que todavia no se cerro la jornada; hay que decirlo, no dejarlo implicito.
 */
function pendingHoursCaveat(caveat: PendingHoursCaveat | null | undefined) {
  if (!caveat || !caveat.pendingJornadas) return "";
  const plural = caveat.pendingJornadas === 1 ? "jornada pendiente" : "jornadas pendientes";
  return `Nota: hay ${caveat.pendingJornadas} ${plural} en el resultado; las horas solo se registran al completarla, por eso pueden figurar en 0 sin que signifique que no trabajaron.`;
}

/**
 * La mediana es la cifra principal del tiempo de ciclo porque unos pocos
 * trabajos con cierre muy tardio distorsionan el promedio. Si no hay
 * trabajos cerrados en el resultado, o si promedio y mediana difieren mucho,
 * hay que decirlo en vez de mostrar un numero sin contexto.
 */
function cycleTimeCaveat(caveat: CycleTimeCaveat | null | undefined) {
  if (!caveat) return "";
  if (!caveat.closedCount) {
    return "Nota: no hay trabajos cerrados en el resultado para calcular el tiempo de ciclo; el valor mostrado no es representativo.";
  }
  if (caveat.median <= 0) return "";
  const ratio = caveat.average / caveat.median;
  if (ratio < 1.3 && ratio > 0.7) return "";
  return `Nota: el promedio (${formatNumber(caveat.average, 1)} dias) difiere bastante de la mediana (${formatNumber(caveat.median, 1)} dias) mostrada como cifra principal; puede haber trabajos con tiempos de cierre atipicos.`;
}

/**
 * La fecha de inicio/fin de visita solo llega por el importador del sistema
 * nuevo; las OS del sistema anterior no la tienen. Sin esta nota, un valor
 * calculado sobre un subconjunto pequeno podria leerse como el total.
 */
function executionCoverageCaveat(caveat: ExecutionCoverageCaveat | null | undefined) {
  if (!caveat) return "";
  if (!caveat.withDataCount) {
    return "Nota: ninguna de las OS consultadas tiene fecha de inicio/fin de visita registrada (ese dato solo llega por el sistema nuevo de importacion); no se puede calcular este valor para esta consulta.";
  }
  if (caveat.withDataCount < caveat.totalCount) {
    const pct = formatNumber((caveat.withDataCount / caveat.totalCount) * 100, 1);
    return `Nota: este dato solo esta disponible en ${caveat.withDataCount} de ${caveat.totalCount} OS consultadas (${pct}%); las importadas por el sistema anterior no lo tienen. El valor mostrado es sobre esas ${caveat.withDataCount}, no sobre el total.`;
  }
  return "";
}

/**
 * La fecha de cierre de OS solo llega por el sistema nuevo de importacion.
 * totalCount son las OS cerradas del resultado (las abiertas nunca la tienen
 * y no cuentan como "falta el dato"); withDataCount son las que ademas
 * tienen fecha_cierre_os poblada.
 */
function osCycleTimeCaveat(caveat: OsCycleTimeCaveat | null | undefined) {
  if (!caveat) return "";
  if (!caveat.totalCount) {
    return "Nota: no hay OS cerradas en el resultado para calcular el tiempo de cierre.";
  }
  if (!caveat.withDataCount) {
    return "Nota: ninguna de las OS cerradas consultadas tiene fecha de cierre importada (fecha_cierre_os); ese dato solo llega por el sistema nuevo de importacion. El valor mostrado no es representativo.";
  }
  if (caveat.withDataCount < caveat.totalCount) {
    const pct = formatNumber((caveat.withDataCount / caveat.totalCount) * 100, 1);
    return `Nota: la fecha de cierre solo esta disponible en ${caveat.withDataCount} de ${caveat.totalCount} OS cerradas consultadas (${pct}%) -- el resto se importo antes de que se agregara este dato. El valor mostrado es sobre esas ${caveat.withDataCount}, no sobre el total de cerradas.`;
  }
  return "";
}

/**
 * Redacta resultados simples sin una segunda llamada al modelo. Esto evita que
 * una cifra ya calculada sea reinterpretada, renombrada o convertida a otra unidad.
 */
export function renderDeterministicAnswer(input: DeterministicAnswerInput) {
  if (!input.results.length) return null;
  if (input.results.length === 1) return renderSingleResult(input.question, input.results[0], input.mode);

  return input.results
    .map((result, index) => {
      const title = semanticCatalog[result.args.dataset].label;
      return `${index + 1}. ${title}\n${renderSingleResult(input.question, result, input.mode)}`;
    })
    .join("\n\n");
}
