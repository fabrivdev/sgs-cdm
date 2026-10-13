import type { SourceFileIdentity } from "@/lib/imports/sourceIdentity";

export interface BillingSourceAccreditationRpcClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export interface BillingSourceAccreditationPayload {
  supportingLoadId: string;
  sourceIdentity: SourceFileIdentity;
  importEnvelope: Record<string, unknown>;
  summary: unknown[];
  lines: unknown[];
  from: string | null;
  to: string | null;
  replaceSummary: boolean;
}

export interface BillingSnapshotScope {
  version: "totvs-billing-full-v1";
  kind: "FULL";
  source: "TOTVS_BILLING";
  branchScope: "DECLARED";
  documentScope: "ALL";
  from: string;
  to: string;
  sourceFileSha256: string;
  sourceFileByteSize: number;
  observedLineCount: number;
  observedBranches: string[];
  includedBranches: string[];
  completenessConfirmed: true;
}

export interface BillingSnapshotDeclaration {
  from: string;
  to: string;
  includedBranches: string[];
  completenessConfirmed: true;
}

export function buildBillingSnapshotScope(
  declaration: BillingSnapshotDeclaration | null,
  evidence: {
    sourceFileSha256: string;
    sourceFileByteSize: number;
    observedLineCount: number;
    observedBranches: string[];
  },
): BillingSnapshotScope | null {
  const sourceFileSha256 = evidence.sourceFileSha256.toLowerCase();
  const observedBranches = [...new Set(evidence.observedBranches.filter(Boolean))].sort();
  const includedBranches = [...new Set(declaration?.includedBranches.filter(Boolean) ?? [])].sort();
  if (
    !declaration?.completenessConfirmed
    || !/^\d{4}-\d{2}-\d{2}$/.test(declaration.from)
    || !/^\d{4}-\d{2}-\d{2}$/.test(declaration.to)
    || declaration.from > declaration.to
    || !/^[0-9a-f]{64}$/.test(sourceFileSha256)
    || evidence.sourceFileByteSize <= 0
    || evidence.observedLineCount <= 0
    || observedBranches.length === 0
    || includedBranches.length === 0
    || observedBranches.some((branch) => !includedBranches.includes(branch))
  ) return null;
  return {
    version: "totvs-billing-full-v1",
    kind: "FULL",
    source: "TOTVS_BILLING",
    branchScope: "DECLARED",
    documentScope: "ALL",
    from: declaration.from,
    to: declaration.to,
    sourceFileSha256,
    sourceFileByteSize: evidence.sourceFileByteSize,
    observedLineCount: evidence.observedLineCount,
    observedBranches,
    includedBranches,
    completenessConfirmed: true,
  };
}

export const TOTVS_BILLING_BRANCHES = [
  "Campo 9", "Katuete", "Loma Plata", "Misiones", "Santa Rita", "Santa Rosa",
] as const;

export function requestBillingSnapshotDeclaration(args: {
  observedFrom: string | null;
  observedTo: string | null;
  confirm?: (message: string) => boolean;
  prompt?: (message: string, defaultValue?: string) => string | null;
}): BillingSnapshotDeclaration | null | undefined {
  const ask = args.prompt ?? globalThis.prompt;
  const confirm = args.confirm ?? globalThis.confirm;
  if (!ask || !confirm) return undefined;
  const mode = ask(
    "Escribí COMPLETO si Ventas es un snapshot acumulativo sin filtros; escribí PARCIAL para importar sin inferir anulaciones.",
    "COMPLETO",
  );
  if (mode === null) return undefined;
  if (mode.trim().toUpperCase() === "PARCIAL") return null;
  if (mode.trim().toUpperCase() !== "COMPLETO") return undefined;
  const from = ask("Fecha DESDE declarada por el reporte, no inferida de las filas (AAAA-MM-DD):", "");
  if (from === null) return undefined;
  const to = ask("Fecha HASTA declarada por el reporte, no inferida de las filas (AAAA-MM-DD):", "");
  if (to === null) return undefined;
  const branchesText = ask(
    "Sucursales incluidas, separadas por coma. Incluí también sucursales sin filas:",
    "",
  );
  if (branchesText === null) return undefined;
  const includedBranches = branchesText.split(",").map((value) => value.trim()).filter(Boolean);
  const unknown = includedBranches.filter((branch) => !TOTVS_BILLING_BRANCHES.includes(branch as never));
  if (unknown.length || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return undefined;
  }
  if (!confirm(
    `Confirmá snapshot COMPLETO de ${from} a ${to}, incluyendo: ${includedBranches.join(", ")}. `
    + "Toda identidad ausente dentro de ese alcance se registrará como anulada, sin borrarla.",
  )) return undefined;
  return { from, to, includedBranches, completenessConfirmed: true };
}

export function toBillingSourceIdentityRpc(identity: SourceFileIdentity) {
  return {
    file_name: identity.fileName,
    byte_size: identity.byteSize,
    sha256: identity.sha256,
  };
}

export async function accreditExistingBillingSource(
  client: BillingSourceAccreditationRpcClient,
  payload: BillingSourceAccreditationPayload,
) {
  return client.rpc("facturacion_acreditar_fuente_existente_v1", {
    p_importacion_id: payload.supportingLoadId,
    p_source_identity: toBillingSourceIdentityRpc(payload.sourceIdentity),
    p_importacion: payload.importEnvelope,
    p_resumen: payload.summary,
    p_lineas: payload.lines,
    p_desde: payload.from,
    p_hasta: payload.to,
    p_reemplazar_resumen: payload.replaceSummary,
  });
}
