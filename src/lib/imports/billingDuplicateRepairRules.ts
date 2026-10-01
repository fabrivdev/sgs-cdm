import { billingSourceLineKey, sameAuditedCommercialLine } from "./billingLineStableReimport";

type RepairRow = Parameters<typeof billingSourceLineKey>[0] & {
  importacion_id: string | null;
};

const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase();

export function isSafeEnrichmentDuplicatePair(left: RepairRow, right: RepairRow) {
  if (!billingSourceLineKey(left) || billingSourceLineKey(left) !== billingSourceLineKey(right)) return false;
  if (!left.importacion_id || !right.importacion_id || left.importacion_id === right.importacion_id) return false;
  if (!sameAuditedCommercialLine(left, right)) return false;
  if (Boolean(left.fecha_factura) === Boolean(right.fecha_factura)) return false;
  const currencies = new Set([left.moneda, right.moneda].map(normalized).filter(Boolean));
  if (currencies.size > 1) return false;
  const species = [left.raw_data?.ESPECIE, right.raw_data?.ESPECIE].map(normalized).join(" ");
  if (species.includes("NCC")) return false;
  if (Number(left.cantidad ?? 0) < 0 || Number(right.cantidad ?? 0) < 0) return false;
  if (Number(left.total_venta ?? 0) < 0 || Number(right.total_venta ?? 0) < 0) return false;
  return true;
}
