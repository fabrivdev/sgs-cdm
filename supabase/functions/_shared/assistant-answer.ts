import {
  semanticCatalog,
  shouldSortTemporalSeriesChronologically,
  type BusinessDataset,
  type GenericQueryPlan,
  type SemanticRecord,
} from "./assistant-semantic.ts";

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
    return `${values.join(" | ")}. ${period}${filterText}`;
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
  ].filter(Boolean).join(" ");
  return `${metricTitle} por ${dimensionTitle}:\n${lines.join("\n")}\n${footer}`;
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
