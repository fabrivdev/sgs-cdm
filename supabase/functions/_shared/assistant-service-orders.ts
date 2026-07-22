export type ServiceOrderBranchRow = Record<string, unknown>;

export type ServiceOrderBranchContext = {
  jobsById?: ReadonlyMap<string, ServiceOrderBranchRow>;
  clientsById?: ReadonlyMap<string, ServiceOrderBranchRow>;
  clientsByName?: ReadonlyMap<string, ServiceOrderBranchRow>;
};

export const ASSISTANT_SERVICE_ORDER_SELECT = [
  "os_numero",
  "cliente_nombre",
  "fecha_abierta_os",
  "fecha_emision_factura",
  "factura",
  "responsable",
  "marca",
  "problema",
  "tipo_tiempo",
  "servicios_cantidad",
  "servicios_valor",
  "km_cantidad",
  "kilometro_valor",
  "repuesto_valor",
  "terceros_valor",
  "situacion_os",
  "situacion_facturacion",
  "trabajo_id",
  "raw_data",
].join(",");

const BRANCH_BY_CODE: Record<string, string> = {
  "01": "Santa Rita",
  "02": "Santa Rosa",
  "03": "Campo 9",
  "04": "Misiones",
  "05": "Loma Plata",
  "06": "Katuete",
};

const BRANCHES = Object.values(BRANCH_BY_CODE);

const TECHNICIAN_CODE_PREFIX = /^(?:[A-Z]{1,6}[\s-]*)?\d{2,}\s*(?:[-:|/]\s*)?/;

const TECHNICIAN_ALIASES: Record<string, string> = {
  "DENNIS BENITEZ": "DENIS DE LA CRUZ BENITEZ ARAUJO",
};

export function normalizeServiceOrderText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeServiceOrderTechnician(value: unknown) {
  const normalized = normalizeServiceOrderText(value)
    .replace(TECHNICIAN_CODE_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  return TECHNICIAN_ALIASES[normalized] ?? normalized;
}

export function dedupeServiceOrderTechnicianSources(values: unknown[]) {
  const sources = new Map<string, string>();
  for (const value of values) {
    const source = String(value ?? "").trim();
    const key = normalizeServiceOrderText(source);
    if (!key || sources.has(key)) continue;
    sources.set(key, source);
  }
  return [...sources.values()];
}

export function serviceOrderTechnicianMatchScore(left: unknown, right: unknown) {
  const source = normalizeServiceOrderTechnician(left);
  const candidate = normalizeServiceOrderTechnician(right);
  if (!source || !candidate) return 0;
  if (source === candidate) return 1;

  const sourceTokens = source.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  const sourceSet = new Set(sourceTokens);
  const candidateSet = new Set(candidateTokens);
  const intersection = sourceTokens.filter((token) => candidateSet.has(token)).length;
  const sourceContained = sourceTokens.length >= 2 && intersection === sourceTokens.length;
  const candidateContained = candidateTokens.length >= 2 && candidateTokens.every((token) => sourceSet.has(token));

  if (sourceContained || candidateContained) {
    return 0.94 - Math.min(Math.abs(sourceTokens.length - candidateTokens.length) * 0.02, 0.12);
  }
  if (intersection < 2) return 0;
  return intersection / Math.max(sourceTokens.length, candidateTokens.length) +
    (sourceTokens[0] === candidateTokens[0] ? 0.12 : 0);
}

export function serviceOrderTechniciansMatch(left: unknown, right: unknown) {
  return serviceOrderTechnicianMatchScore(left, right) >= 0.72;
}

export function serviceOrderClientKey(value: unknown) {
  return normalizeServiceOrderText(value)
    .replace(/\b(?:S A C I|SACI|S A|SA|S R L|SRL|E A S|EAS)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBranch(value: unknown) {
  const normalized = normalizeServiceOrderText(value);
  if (!normalized) return null;

  const numericCode = normalized.match(/^0?([1-6])$/)?.[1];
  if (numericCode) return BRANCH_BY_CODE[numericCode.padStart(2, "0")] ?? null;

  if (normalized.includes("SANTA RITA")) return "Santa Rita";
  if (normalized.includes("SANTA ROSA")) return "Santa Rosa";
  if (normalized.includes("CAMPO 9") || normalized.includes("CAMPO NUEVE")) return "Campo 9";
  if (normalized.includes("MISIONES")) return "Misiones";
  if (normalized.includes("LOMA PLATA")) return "Loma Plata";
  if (normalized.includes("KATUETE")) return "Katuete";

  return null;
}

function branchFromRawData(rawData: unknown) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const acceptedKeys = new Set([
    "SOURCE BRANCH",
    "SOURCE BRANCH CODE",
    "BRANCH",
    "BRANCH CODE",
    "SUCURSAL",
    "FILIAL",
    "LOJA",
  ]);
  for (const [key, value] of Object.entries(rawData as ServiceOrderBranchRow)) {
    if (!acceptedKeys.has(normalizeServiceOrderText(key))) continue;
    const branch = canonicalBranch(value);
    if (branch) return branch;
  }
  return null;
}

function branchFromOrderNumber(value: unknown) {
  const orderNumber = String(value ?? "").trim();
  const code = orderNumber.match(/^0?([1-6])[-_/]/)?.[1];
  return code ? BRANCH_BY_CODE[code.padStart(2, "0")] ?? null : null;
}

function branchFromClientName(value: unknown) {
  const normalized = normalizeServiceOrderText(value);
  if (!normalized) return null;
  return BRANCHES.find((branch) => normalized.includes(normalizeServiceOrderText(branch))) ?? null;
}

export function resolveServiceOrderBranch(
  row: ServiceOrderBranchRow,
  context: ServiceOrderBranchContext = {},
) {
  const jobId = String(row.trabajo_id ?? "").trim();
  const job = jobId ? context.jobsById?.get(jobId) : undefined;
  const jobBranch = canonicalBranch(job?.sucursal);
  if (jobBranch) return jobBranch;

  const rawBranch = branchFromRawData(row.raw_data);
  if (rawBranch) return rawBranch;

  const orderBranch = branchFromOrderNumber(row.os_numero);
  if (orderBranch) return orderBranch;

  const jobClientId = String(job?.cliente_id ?? "").trim();
  const jobClient = jobClientId ? context.clientsById?.get(jobClientId) : undefined;
  const jobClientBranch = canonicalBranch(jobClient?.sucursal);
  if (jobClientBranch) return jobClientBranch;

  const clientName = String(row.cliente_nombre ?? "").trim();
  const matchedClient = clientName ? context.clientsByName?.get(serviceOrderClientKey(clientName)) : undefined;
  const matchedClientBranch = canonicalBranch(matchedClient?.sucursal);
  if (matchedClientBranch) return matchedClientBranch;

  return branchFromClientName(clientName) ?? "Sin sucursal";
}
