import { type Sucursal } from "@/lib/constants";

// Los codigos de sucursal cambiaron con el sistema nuevo. Las OS calificadas
// (01-..., 02-..., etc.) y source_branch_code pertenecen al sistema nuevo.
const NEW_BRANCH_BY_OS_CODE: Record<string, Sucursal> = {
  "01": "Santa Rita",
  "02": "Katuete",
  "03": "Campo 9",
  "04": "Misiones",
  "05": "Loma Plata",
  "06": "Santa Rosa",
};

// Los campos numericos genericos del archivo historico conservan el mapeo
// anterior. No deben interpretarse con la tabla del sistema nuevo.
const LEGACY_BRANCH_BY_CODE: Record<string, Sucursal> = {
  "01": "Santa Rita",
  "02": "Santa Rosa",
  "03": "Campo 9",
  "04": "Misiones",
  "05": "Loma Plata",
  "06": "Katuete",
};

const BRANCHES = Array.from(new Set([
  ...Object.values(NEW_BRANCH_BY_OS_CODE),
  ...Object.values(LEGACY_BRANCH_BY_CODE),
]));

function normalizeBranchValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBranchName(value: unknown): Sucursal | null {
  const normalized = normalizeBranchValue(value);
  if (!normalized) return null;

  if (normalized.includes("SANTA RITA")) return "Santa Rita";
  if (normalized.includes("SANTA ROSA")) return "Santa Rosa";
  if (normalized.includes("CAMPO 9") || normalized.includes("CAMPO NUEVE")) return "Campo 9";
  if (normalized.includes("MISIONES")) return "Misiones";
  if (normalized.includes("LOMA PLATA")) return "Loma Plata";
  if (normalized.includes("KATUETE")) return "Katuete";

  return null;
}

function branchFromCode(value: unknown, source: "new" | "legacy"): Sucursal | null {
  const normalized = normalizeBranchValue(value);
  const numericCode = normalized.match(/^0?([1-6])$/)?.[1];
  if (!numericCode) return null;
  const mapping = source === "new" ? NEW_BRANCH_BY_OS_CODE : LEGACY_BRANCH_BY_CODE;
  return mapping[numericCode.padStart(2, "0")] ?? null;
}

function canonicalBranch(value: unknown): Sucursal | null {
  return canonicalBranchName(value) ?? branchFromCode(value, "legacy");
}

export function serviceOrderBranchFromNumber(value: unknown): Sucursal | null {
  const code = String(value ?? "").trim().match(/^0?([1-6])[-_/]/)?.[1];
  return code ? NEW_BRANCH_BY_OS_CODE[code.padStart(2, "0")] ?? null : null;
}

function serviceOrderBranchFromRawData(rawData: unknown): Sucursal | null {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const entries = Object.entries(rawData as Record<string, unknown>);
  const normalizedEntries = new Map(
    entries.map(([key, value]) => [normalizeBranchValue(key), value]),
  );
  const canonical = canonicalBranchName(normalizedEntries.get("CANONICAL BRANCH"));
  if (canonical) return canonical;
  const sourceCode = branchFromCode(normalizedEntries.get("SOURCE BRANCH CODE"), "new");
  if (sourceCode) return sourceCode;

  const acceptedKeys = new Set([
    "SOURCE BRANCH",
    "BRANCH",
    "BRANCH CODE",
    "SUCURSAL",
    "FILIAL",
    "LOJA",
  ]);

  for (const [key, value] of entries) {
    const normalizedKey = normalizeBranchValue(key);
    if (!acceptedKeys.has(normalizedKey)) continue;
    const branch = canonicalBranchName(value)
      ?? branchFromCode(value, normalizedKey === "SOURCE BRANCH CODE" ? "new" : "legacy");
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
  technicianBranch?: unknown;
};

export function resolveDashboardServiceOrderBranch({
  jobBranch,
  rawData,
  orderNumber,
  clientBranch,
  clientName,
  technicianBranch,
}: DashboardServiceOrderBranchInput): Sucursal | null {
  return canonicalBranch(jobBranch)
    ?? serviceOrderBranchFromRawData(rawData)
    ?? serviceOrderBranchFromNumber(orderNumber)
    ?? canonicalBranch(clientBranch)
    ?? BRANCHES.find((branch) => normalizeBranchValue(clientName).includes(normalizeBranchValue(branch)))
    ?? canonicalBranch(technicianBranch)
    ?? null;
}
