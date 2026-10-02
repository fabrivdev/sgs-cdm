import type { BillingSourceLine } from "./billingLineStableReimport";

type RepairRow = BillingSourceLine & {
  importacion_id: string | null;
};

const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase();

const sameNumber = (left: unknown, right: unknown) => {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
};

const repairSourceLineKey = (row: RepairRow) => {
  const rawOrigin = normalized(row.origen_sistema);
  const origin = rawOrigin === "NEW_XML_FACTURACION_DIRECTA" || rawOrigin === "NEW_XML_FACTURACION_OS"
    ? "NEW_XML_FACTURACION"
    : rawOrigin;
  const branch = normalized(row.sucursal || row.raw_data?.FILIAL || row.raw_data?.LOJA);
  const document = normalized(row.codigo_interno_factura || row.factura);
  const item = normalized(row.raw_data?.ITEM);
  const documentKind = normalized(row.raw_data?.canonical_document_kind || row.raw_data?.ESPECIE);
  if (!origin || !branch || !document || !item || !documentKind) return null;
  return [origin, branch, documentKind, document, item].join("|");
};

const sameRepairCommercialLine = (left: RepairRow, right: RepairRow) =>
  normalized(left.codigo_interno_factura || left.factura) === normalized(right.codigo_interno_factura || right.factura)
  && normalized(left.sucursal || left.raw_data?.FILIAL || left.raw_data?.LOJA)
    === normalized(right.sucursal || right.raw_data?.FILIAL || right.raw_data?.LOJA)
  && normalized(left.raw_data?.ITEM) === normalized(right.raw_data?.ITEM)
  && normalized(left.cod_mercaderia) === normalized(right.cod_mercaderia)
  && normalized(left.entidad_nombre) === normalized(right.entidad_nombre)
  && normalized(left.mercaderia) === normalized(right.mercaderia)
  && normalized(left.observacion) === normalized(right.observacion)
  && sameNumber(left.cantidad, right.cantidad)
  && sameNumber(left.valor_unitario, right.valor_unitario)
  && sameNumber(left.total_venta, right.total_venta);

export function isSafeEnrichmentDuplicatePair(left: RepairRow, right: RepairRow) {
  const leftKey = repairSourceLineKey(left);
  const rightKey = repairSourceLineKey(right);
  if (!leftKey || leftKey !== rightKey) return false;
  if (!left.importacion_id || !right.importacion_id || left.importacion_id === right.importacion_id) return false;
  if (!sameRepairCommercialLine(left, right)) return false;
  if (Boolean(left.fecha_factura) === Boolean(right.fecha_factura)) return false;
  const currencies = new Set([left.moneda, right.moneda].map(normalized).filter(Boolean));
  if (currencies.size > 1) return false;
  const species = [left.raw_data?.ESPECIE, right.raw_data?.ESPECIE].map(normalized).join(" ");
  if (species.includes("NCC")) return false;
  if (Number(left.cantidad ?? 0) < 0 || Number(right.cantidad ?? 0) < 0) return false;
  if (Number(left.total_venta ?? 0) < 0 || Number(right.total_venta ?? 0) < 0) return false;
  return true;
}
