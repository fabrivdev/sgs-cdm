import type {
  CanonicalBillingCrosswalk,
  CanonicalBillingType,
  CanonicalProductRow,
  CanonicalServiceOrderRow,
  CanonicalTimeType,
} from "@/lib/imports/canonical";
import { clasificarGrupoFacturacion, clasificarMarcaFacturacion } from "@/lib/facturacionReglas";
import { normalizeText, normalizeUpper } from "@/lib/imports/fiscal";

const CLIENT_PATTERNS = ["CLIENTE", "CS"];
const WARRANTY_PATTERNS = ["GARANTIA", "GR", "GS"];
const INTERNAL_PATTERNS = ["INTERNO", "INT", "ABSORVE CDM", "ABSORBE CDM", "CAMPOS"];

export function normalizeStableKey(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

export function inferCanonicalTimeType(value: unknown): CanonicalTimeType {
  const sample = normalizeUpper(value);
  if (!sample) return "Desconocido";
  if (WARRANTY_PATTERNS.some((token) => sample.includes(token))) return "Garantia";
  if (INTERNAL_PATTERNS.some((token) => sample.includes(token))) return "Interno";
  if (CLIENT_PATTERNS.some((token) => sample.includes(token))) return "Cliente";
  return "Desconocido";
}

export function inferCanonicalBillingType(group: unknown, description?: unknown): CanonicalBillingType {
  const normalizedGroup = clasificarGrupoFacturacion(group);
  if (normalizedGroup === "Servicio" || normalizedGroup === "Repuestos" || normalizedGroup === "Kilometraje") {
    return normalizedGroup;
  }

  const sample = `${normalizeUpper(group)} ${normalizeUpper(description)}`;
  if (
    sample.includes("COURIER") ||
    sample.includes("COURRIER") ||
    sample.includes("CORREO") ||
    sample.includes("FLETE") ||
    sample.includes("ENVIO") ||
    sample.includes("ENVÍO") ||
    sample.includes("TRANSPORTE")
  ) {
    return "Otros";
  }
  if (sample.includes("KILOMET") || /\bKM\d*\b/.test(sample)) return "Kilometraje";
  if (
    sample.includes("SERVIC") ||
    sample.includes("SEVIC") ||
    /\bSE\d+\b/.test(sample) ||
    /\bMA\d+\b/.test(sample) ||
    /\bMO\d+\b/.test(sample)
  ) return "Servicio";
  if (sample.includes("REPUEST")) return "Repuestos";
  return "Otros";
}

const isPlaceholderCode = (value: unknown) => {
  const normalized = normalizeStableKey(value);
  return !normalized || /^[-.]+$/.test(normalized);
};

export function inferCanonicalServiceOrderLineType(args: {
  group?: unknown;
  productCode?: unknown;
  manufacturerCode?: unknown;
  description?: unknown;
}): CanonicalBillingType {
  const productCode = normalizeUpper(args.productCode);
  const manufacturerCode = normalizeUpper(args.manufacturerCode);
  const description = normalizeUpper(args.description);
  const lineSample = `${productCode} ${description}`;

  if (
    lineSample.includes("COURIER") ||
    lineSample.includes("COURRIER") ||
    lineSample.includes("CORREO") ||
    lineSample.includes("FLETE") ||
    lineSample.includes("ENVIO") ||
    lineSample.includes("TRANSPORTE")
  ) {
    return "Otros";
  }
  if (lineSample.includes("KILOMET") || /\bKM\d+\b/.test(lineSample)) return "Kilometraje";
  if (/\b(?:MA|MO|SE)\d+\b/.test(lineSample)) return "Servicio";
  if (
    /\bRE\d+\b/.test(lineSample) ||
    productCode.startsWith("REP") ||
    !isPlaceholderCode(manufacturerCode)
  ) {
    return "Repuestos";
  }

  return inferCanonicalBillingType(args.group, args.description);
}

export function inferProductBrand(group: unknown, manufacturerCode?: unknown, description?: unknown) {
  const fromGroup = clasificarMarcaFacturacion(group);
  if (fromGroup !== "OTROS") return fromGroup;

  const sample = `${normalizeUpper(manufacturerCode)} ${normalizeUpper(description)}`;
  if (sample.includes("CLAAS")) return "CLAAS";
  if (sample.includes("HORSCH")) return "HORSCH";
  return "OTROS";
}

export function buildProductLookup(rows: CanonicalProductRow[]) {
  const byInternalCode = new Map<string, CanonicalProductRow>();
  const byManufacturerCode = new Map<string, CanonicalProductRow>();

  for (const row of rows) {
    const internalCode = normalizeStableKey(row.internalCode);
    const manufacturerCode = normalizeStableKey(row.manufacturerCode);
    if (internalCode) byInternalCode.set(internalCode, row);
    if (manufacturerCode) byManufacturerCode.set(manufacturerCode, row);
  }

  return { byInternalCode, byManufacturerCode };
}

export function buildServiceOrderLookup(rows: CanonicalServiceOrderRow[]) {
  const byDocument = new Map<string, CanonicalServiceOrderRow>();
  const byInvoice = new Map<string, CanonicalServiceOrderRow>();

  for (const row of rows) {
    const document = normalizeStableKey(row.documentNumber);
    const invoice = normalizeStableKey(row.invoiceNumber);
    if (document) byDocument.set(document, row);
    if (invoice) byInvoice.set(invoice, row);
  }

  return { byDocument, byInvoice };
}

export function crosswalkBillingRow(args: {
  billingRowId: string;
  documentNumber?: unknown;
  invoiceNumber?: unknown;
  productCode?: unknown;
  manufacturerCode?: unknown;
  productGroup?: unknown;
  description?: unknown;
  billingTimeType?: CanonicalTimeType;
  serviceOrders: ReturnType<typeof buildServiceOrderLookup>;
  products: ReturnType<typeof buildProductLookup>;
}): CanonicalBillingCrosswalk {
  const {
    billingRowId,
    documentNumber,
    invoiceNumber,
    productCode,
    manufacturerCode,
    productGroup,
    description,
    billingTimeType,
    serviceOrders,
    products,
  } = args;

  const documentKey = normalizeStableKey(documentNumber);
  const invoiceKey = normalizeStableKey(invoiceNumber);
  const productCodeKey = normalizeStableKey(productCode);
  const manufacturerCodeKey = normalizeStableKey(manufacturerCode);

  const serviceOrder =
    (documentKey ? serviceOrders.byDocument.get(documentKey) : null) ??
    (invoiceKey ? serviceOrders.byInvoice.get(invoiceKey) : null) ??
    null;

  const product =
    (productCodeKey ? products.byInternalCode.get(productCodeKey) : null) ??
    (manufacturerCodeKey ? products.byManufacturerCode.get(manufacturerCodeKey) : null) ??
    null;
  const rowLineType = inferCanonicalBillingType(productGroup, description);
  const productLineType = product ? inferCanonicalBillingType(product.group, product.description) : null;
  const inferredLineType =
    rowLineType === "Servicio" || rowLineType === "Kilometraje"
      ? rowLineType
      : productLineType ?? rowLineType;

  const matchedBy: CanonicalBillingCrosswalk["matchedBy"] = serviceOrder
    ? documentKey && serviceOrders.byDocument.has(documentKey)
      ? "document"
      : "invoice"
    : product
      ? productCodeKey && products.byInternalCode.has(productCodeKey)
        ? "product_code"
        : "manufacturer_code"
      : "none";

  return {
    billingRowId,
    matchedBy,
    serviceOrderNumber: serviceOrder?.serviceOrderNumber ?? null,
    trabajoId: null,
    inferredTimeType:
      serviceOrder?.timeType ?? billingTimeType ?? inferCanonicalTimeType(productGroup ?? description),
    inferredLineType,
    productBrand:
      (serviceOrder && (inferredLineType === "Servicio" || inferredLineType === "Kilometraje")
        ? serviceOrder.brand
        : null) ??
      product?.brand ??
      inferProductBrand(productGroup, manufacturerCode, description),
    productGroup: product?.group ?? (normalizeText(productGroup) || null),
    productFamily: product?.family ?? null,
  };
}
