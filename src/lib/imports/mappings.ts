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

export function inferCanonicalBillingType(
  group: unknown,
  description?: unknown,
  productCode?: unknown,
): CanonicalBillingType {
  const normalizedGroup = clasificarGrupoFacturacion(group);
  const normalizedProductCode = normalizeUpper(productCode);
  const sample = `${normalizeUpper(group)} ${normalizeUpper(description)}`;
  const isStructuredMachine =
    sample.includes("TIPO:") &&
    sample.includes("MODELO:") &&
    (sample.includes("CASIS:") || sample.includes("CHASIS:"));

  if (
    normalizedGroup === "Maquinarias" ||
    normalizedProductCode.startsWith("VEIC_") ||
    isStructuredMachine
  ) {
    return "Maquinarias";
  }
  if (normalizedGroup === "Servicio" || normalizedGroup === "Repuestos" || normalizedGroup === "Kilometraje") {
    return normalizedGroup;
  }

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

  return inferCanonicalBillingType(args.group, args.description, args.productCode);
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
  const byDocument = new Map<string, CanonicalServiceOrderRow[]>();
  const byInvoice = new Map<string, CanonicalServiceOrderRow[]>();

  const append = (lookup: Map<string, CanonicalServiceOrderRow[]>, key: string, row: CanonicalServiceOrderRow) => {
    lookup.set(key, [...(lookup.get(key) ?? []), row]);
  };

  for (const row of rows) {
    const document = normalizeStableKey(row.documentNumber);
    const invoice = normalizeStableKey(row.invoiceNumber);
    if (document) append(byDocument, document, row);
    if (invoice) append(byInvoice, invoice, row);
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
  billingProductBrand?: string | null;
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
    billingProductBrand,
    serviceOrders,
    products,
  } = args;

  const documentKey = normalizeStableKey(documentNumber);
  const invoiceKey = normalizeStableKey(invoiceNumber);
  const productCodeKey = normalizeStableKey(productCode);
  const manufacturerCodeKey = normalizeStableKey(manufacturerCode);

  const serviceOrderCandidates =
    (documentKey ? serviceOrders.byDocument.get(documentKey) : null) ??
    (invoiceKey ? serviceOrders.byInvoice.get(invoiceKey) : null) ??
    [];

  const product =
    (productCodeKey ? products.byInternalCode.get(productCodeKey) : null) ??
    (manufacturerCodeKey ? products.byManufacturerCode.get(manufacturerCodeKey) : null) ??
    null;
  const rowLineType = inferCanonicalBillingType(productGroup, description, productCode);
  const sameProduct = serviceOrderCandidates.filter((candidate) =>
    Boolean(productCodeKey) && normalizeStableKey(candidate.productCode) === productCodeKey,
  );
  const sameManufacturer = serviceOrderCandidates.filter((candidate) =>
    Boolean(manufacturerCodeKey) && normalizeStableKey(candidate.manufacturerCode) === manufacturerCodeKey,
  );
  const sameLineType = serviceOrderCandidates.filter((candidate) =>
    inferCanonicalServiceOrderLineType({
      group: candidate.group,
      productCode: candidate.productCode,
      manufacturerCode: candidate.manufacturerCode,
      description: candidate.productName,
    }) === rowLineType,
  );
  const lineEvidence = sameProduct.length
    ? sameProduct
    : sameManufacturer.length
      ? sameManufacturer
      : sameLineType.length
        ? sameLineType
        : rowLineType === "Otros" && serviceOrderCandidates.length === 1
          ? serviceOrderCandidates
          : [];
  const uniqueValues = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  const serviceOrderNumbers = uniqueValues(serviceOrderCandidates.map((candidate) => candidate.serviceOrderNumber));
  const serviceOrderEvidence: CanonicalBillingCrosswalk["serviceOrderEvidence"] = !serviceOrderNumbers.length
    ? "missing"
    : serviceOrderNumbers.length === 1
      ? "complete"
      : "conflict";
  const lineTimeTypes = uniqueValues(
    lineEvidence.map((candidate) => candidate.timeType).filter((value) => value !== "Desconocido"),
  ) as CanonicalTimeType[];
  const hasUnknownTimeType = lineEvidence.some((candidate) => candidate.timeType === "Desconocido");
  const timeTypeEvidence: CanonicalBillingCrosswalk["timeTypeEvidence"] = !lineEvidence.length
    ? "missing"
    : lineTimeTypes.length > 1
      ? "conflict"
      : hasUnknownTimeType
        ? "partial"
        : "complete";
  const lineBrands = uniqueValues(lineEvidence.map((candidate) => candidate.brand));
  const productLineType = product
    ? inferCanonicalBillingType(product.group, product.description, product.internalCode)
    : null;
  const inferredLineType =
    rowLineType === "Servicio" ||
    rowLineType === "Kilometraje" ||
    rowLineType === "Maquinarias"
      ? rowLineType
      : productLineType ?? rowLineType;

  const serviceOrderBrand = lineBrands.length === 1
    && (inferredLineType === "Servicio" || inferredLineType === "Kilometraje")
    ? lineBrands[0]
    : null;
  const inferredBrand = inferProductBrand(productGroup, manufacturerCode, description);
  const evidencedInferredBrand = inferredBrand === "OTROS" ? null : inferredBrand;
  const productBrand = serviceOrderBrand
    ?? product?.brand
    ?? billingProductBrand
    ?? inferredBrand;
  const productBrandEvidence: CanonicalBillingCrosswalk["productBrandEvidence"] = serviceOrderBrand
    ? "service_order"
    : product?.brand
      ? "product"
      : billingProductBrand
        ? "billing"
        : evidencedInferredBrand
          ? "inferred"
          : "missing";

  const matchedBy: CanonicalBillingCrosswalk["matchedBy"] = serviceOrderCandidates.length
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
    serviceOrderNumber: serviceOrderNumbers.length === 1 ? serviceOrderNumbers[0] : null,
    serviceOrderEvidence,
    knownServiceOrders: serviceOrderNumbers,
    trabajoId: null,
    inferredTimeType: lineTimeTypes.length === 1
      ? lineTimeTypes[0]
      : billingTimeType ?? "Desconocido",
    timeTypeEvidence,
    knownTimeTypes: lineTimeTypes,
    hasUnknownTimeType,
    inferredLineType,
    productBrand,
    productBrandEvidence,
    knownProductBrands: productBrandEvidence === "missing" ? [] : [productBrand],
    productGroup: product?.group ?? (normalizeText(productGroup) || null),
    productFamily: product?.family ?? null,
  };
}
