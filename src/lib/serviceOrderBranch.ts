import { type Sucursal } from "@/lib/constants";

const BRANCH_BY_OS_CODE: Record<string, Sucursal> = {
  "01": "Santa Rita",
  "02": "Santa Rosa",
  "03": "Campo 9",
  "04": "Misiones",
  "05": "Loma Plata",
  "06": "Katuete",
};

const BRANCHES = Object.values(BRANCH_BY_OS_CODE);

function normalizeBranchValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBranch(value: unknown): Sucursal | null {
  const normalized = normalizeBranchValue(value);
  if (!normalized) return null;

  const numericCode = normalized.match(/^0?([1-6])$/)?.[1];
  if (numericCode) return BRANCH_BY_OS_CODE[numericCode.padStart(2, "0")] ?? null;

  if (normalized.includes("SANTA RITA")) return "Santa Rita";
  if (normalized.includes("SANTA ROSA")) return "Santa Rosa";
  if (normalized.includes("CAMPO 9") || normalized.includes("CAMPO NUEVE")) return "Campo 9";
  if (normalized.includes("MISIONES")) return "Misiones";
  if (normalized.includes("LOMA PLATA")) return "Loma Plata";
  if (normalized.includes("KATUETE")) return "Katuete";

  return null;
}

export function serviceOrderBranchFromNumber(value: unknown): Sucursal | null {
  const code = String(value ?? "").trim().match(/^0?([1-6])[-_/]/)?.[1];
  return code ? BRANCH_BY_OS_CODE[code.padStart(2, "0")] ?? null : null;
}

function serviceOrderBranchFromRawData(rawData: unknown): Sucursal | null {
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

  for (const [key, value] of Object.entries(rawData as Record<string, unknown>)) {
    if (!acceptedKeys.has(normalizeBranchValue(key))) continue;
    const branch = canonicalBranch(value);
    if (branch) return branch;
  }

  return null;
}

type DashboardServiceOrderBranchInput = {
  jobBranch?: unknown;
  rawData?: unknown;
  orderNumber?: unknown;
  clientBranch?: unknown;
  clientName?: unknown;
};

export function resolveDashboardServiceOrderBranch({
  jobBranch,
  rawData,
  orderNumber,
  clientBranch,
  clientName,
}: DashboardServiceOrderBranchInput): Sucursal | null {
  return canonicalBranch(jobBranch)
    ?? serviceOrderBranchFromRawData(rawData)
    ?? serviceOrderBranchFromNumber(orderNumber)
    ?? canonicalBranch(clientBranch)
    ?? BRANCHES.find((branch) => normalizeBranchValue(clientName).includes(normalizeBranchValue(branch)))
    ?? null;
}
