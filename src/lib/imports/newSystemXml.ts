import type {
  CanonicalBillingRow,
  CanonicalImportEnvelope,
  CanonicalProductRow,
  CanonicalServiceOrderRow,
} from "@/lib/imports/canonical";
import {
  applyIva,
  extractShortInvoiceNumber,
  inferIvaRate,
  normalizeCompactDate,
  normalizeDateLike,
  normalizeText,
  normalizeUpper,
  parseFlexibleNumber,
  resolveCurrency,
} from "@/lib/imports/fiscal";
import {
  inferCanonicalBillingType,
  inferCanonicalServiceOrderLineType,
  inferCanonicalTimeType,
  inferProductBrand,
  normalizeStableKey,
} from "@/lib/imports/mappings";
import { parseSpreadsheetXml, type SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const firstValue = (row: Record<string, unknown>, candidates: string[]) => {
  for (const candidate of candidates) {
    const raw = row[candidate];
    const normalized = normalizeText(raw);
    const withoutPlaceholders = normalized.replace(/[-_.\s]/g, "");
    if (candidate in row && raw != null && normalized !== "" && withoutPlaceholders !== "") {
      return row[candidate];
    }
  }
  return null;
};

const text = (row: Record<string, unknown>, candidates: string[]) => {
  const value = firstValue(row, candidates);
  const normalized = normalizeText(value);
  return normalized || null;
};

const number = (row: Record<string, unknown>, candidates: string[]) => {
  return parseFlexibleNumber(firstValue(row, candidates));
};

function buildRowId(...parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizeStableKey(part)).join("|");
}

function normalizeXmlSucursal(value: unknown) {
  const sample = normalizeText(value);
  const upper = sample.toUpperCase();
  if (!sample) return null;
  if (upper.includes("SANTA RITA") || sample === "01") return "Santa Rita";
  if (upper.includes("SANTA ROSA") || sample === "02") return "Santa Rosa";
  if (upper.includes("CAMPO 9") || upper.includes("CAMPO NUEVE") || sample === "03") return "Campo 9";
  if (upper.includes("MISIONES") || sample === "04") return "Misiones";
  if (upper.includes("LOMA PLATA") || sample === "05") return "Loma Plata";
  if (upper.includes("KATUETE") || upper.includes("KATUETÉ") || sample === "06") return "Katuete";
  return null;
}

function normalizeXmlMarca(value: unknown) {
  const upper = normalizeText(value).toUpperCase();
  if (!upper) return null;
  if (upper.includes("CLAAS") || upper.startsWith("CLA")) return "CLAAS";
  if (upper.includes("HORSCH") || upper.startsWith("HOR")) return "HORSCH";
  return "OTROS";
}

function normalizeXmlOsStatus(value: unknown) {
  const raw = normalizeText(value);
  const upper = normalizeUpper(value);
  if (!raw) return null;
  if (upper.includes("CERRAD")) return "Cerrada";
  if (upper.includes("LIBERAD") || upper.includes("ABIERT")) return "Abierta";
  if (upper.includes("CANCEL")) return "Cancelada";
  if (upper.includes("ANUL")) return "Anulada";
  return raw;
}

export function parseNewSystemWorkbook(xmlText: string) {
  return parseSpreadsheetXml(xmlText);
}

export function mapFacturaVentasSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalBillingRow> {
  const rows = sheet.rows.map((row, index) => {
    const emissionDate = normalizeDateLike(firstValue(row, ["EMISION"]));
    const dueDate = normalizeDateLike(firstValue(row, ["FCHVEN"]));
    const invoiceLongNumber = text(row, ["DOCUMENTO"]);
    const invoiceShortNumber = extractShortInvoiceNumber(firstValue(row, ["DOCUMENTO"]));
    const productCode = text(row, ["CODIGO"]);
    const productName = text(row, ["PRODUCTO"]);
    const quantity = number(row, ["CANTIDAD"]);
    const totalUsd = number(row, ["TOTALUSD"]);
    const totalGs = number(row, ["TOTALGS"]);
    const hasUsdValue = firstValue(row, ["TOTALUSD"]) !== null;
    const currency = hasUsdValue
      ? "USD"
      : resolveCurrency(firstValue(row, ["MONORI"]), totalGs ? "GS" : "");
    const totalBase = hasUsdValue ? totalUsd : totalGs;
    const unitBase = hasUsdValue ? number(row, ["VUNITUSD"]) : number(row, ["VUNITGS"]);
    const ivaRate = inferIvaRate(
      firstValue(row, ["IVA", "TIPOES"]),
      firstValue(row, ["PRODUCTO"]),
      firstValue(row, ["ESPECIE"]),
    );
    const documentNumber = text(row, ["DOCUMENTO"]);
    const isCreditNote = normalizeUpper(firstValue(row, ["ESPECIE"])).includes("NCC");
    const sign = isCreditNote ? -1 : 1;

    return {
      rowId:
        buildRowId(
          invoiceLongNumber,
          productCode,
          text(row, ["ITEM"]),
          String(index + 1),
        ) || `fact-row-${index + 1}`,
      emissionDate,
      dueDate,
      branch: normalizeXmlSucursal(firstValue(row, ["FILIAL", "LOJA"])),
      clientCode: text(row, ["CLIENTE"]),
      clientName: text(row, ["NOMBRE"]) || "Sin cliente",
      invoiceLongNumber,
      invoiceShortNumber,
      documentNumber,
      itemNumber: text(row, ["ITEM"]),
      productCode,
      manufacturerCode: null,
      productName,
      quantity,
      unitValueBase: unitBase * sign,
      totalValueBase: totalBase * sign,
      ivaRate,
      unitValueWithIva: applyIva(unitBase * sign, ivaRate),
      totalValueWithIva: applyIva(totalBase * sign, ivaRate),
      currency,
      exchangeRate: number(row, ["TIPCAM"]) || null,
      paymentCondition: text(row, ["CNDPAG"]),
      lineType: inferCanonicalBillingType(null, productName),
      timeType: "Cliente",
      productGroup: null,
      productFamily: null,
      productBrand: null,
      linkedServiceOrder: null,
      linkedTrabajo: null,
      isDirectSale: true,
      raw: {
        ...row,
        original_invoice_number: text(row, ["NFORI"]),
        canonical_document_kind: isCreditNote ? "NotaCredito" : "Factura",
      },
    } satisfies CanonicalBillingRow;
  });

  return {
    sourceSystem: "new_xml_facturacion",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapOrdenesServicioSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalServiceOrderRow> {
  const rows = sheet.rows.map((row, index) => {
    const serviceOrderNumber = text(row, ["Nº OS", "NÂº OS", "NRO OS", "OS"]) || `os-${index + 1}`;
    const sourceServiceOrderNumber = serviceOrderNumber;
    const branchCode = text(row, ["Sucursal", "SUCURSAL", "FILIAL"]);
    const qualifiedServiceOrderNumber = branchCode
      ? `${branchCode.padStart(2, "0")}-${sourceServiceOrderNumber}`
      : sourceServiceOrderNumber;
    const timeTypeRaw = text(row, ["TIPTEM"]);
    const productGroup = text(row, ["GRUPO"]);
    const manufacturerCode = text(row, ["CODFAB"]);
    const productCode = text(row, ["CODIGO"]);
    const productName = text(row, ["PRODUCTO"]);
    const auxiliaryTechnicians = Array.from(
      new Set([text(row, ["TECAUX001"]), text(row, ["TECAUX002"])].filter((value): value is string => Boolean(value))),
    );
    const lineType = inferCanonicalServiceOrderLineType({
      group: productGroup,
      productCode,
      manufacturerCode,
      description: productName,
    });
    const quantity = number(row, ["CANTIDAD", "CNTFAC"]);
    const lineTotal = number(row, ["TOTAL"]);

    return {
      rowId:
        buildRowId(qualifiedServiceOrderNumber, text(row, ["ITEM"]), text(row, ["DOCUMENTO"]), String(index + 1)) ||
        `os-row-${index + 1}`,
      sourceServiceOrderNumber,
      branchCode,
      serviceOrderNumber: qualifiedServiceOrderNumber,
      branch: normalizeXmlSucursal(firstValue(row, ["Sucursal", "SUCURSAL", "FILIAL"])),
      status: normalizeXmlOsStatus(firstValue(row, ["ESTADO"])),
      billingStatus: text(row, ["CNDPAG"]),
      openDate: normalizeDateLike(firstValue(row, ["Fc Abiert OS"])),
      closeDate: normalizeCompactDate(firstValue(row, ["FCHCIERRE"])),
      invoiceDate: null,
      ownerCode: text(row, ["Propietario"]),
      ownerName: text(row, ["Nombre"]),
      billedClientCode: text(row, ["CLIFAC"]),
      billedClientName: text(row, ["NOMCLI"]),
      chassis: text(row, ["Chasis Inter", "Chasis Vehic"]),
      brand: normalizeXmlMarca(firstValue(row, ["MARCA"])) ?? "OTROS",
      group: productGroup,
      model: text(row, ["MODELO"]),
      technician: text(row, ["TECNICO"]),
      auxiliaryTechnicians,
      timeType: inferCanonicalTimeType(timeTypeRaw),
      documentNumber: text(row, ["DOCUMENTO"]),
      invoiceNumber: text(row, ["DOCUMENTO"]),
      manufacturerCode,
      productCode,
      productName,
      quantity,
      lineTotal,
      currency: resolveCurrency(firstValue(row, ["MONEDA"])),
      serviceHours: lineType === "Servicio" ? quantity : 0,
      kilometreQuantity: lineType === "Kilometraje" ? quantity : 0,
      thirdPartyValue: lineType === "Otros" ? lineTotal : 0,
      kilometreValue: lineType === "Kilometraje" ? lineTotal : 0,
      serviceValue: lineType === "Servicio" ? lineTotal : 0,
      sparePartsValue: lineType === "Repuestos" ? lineTotal : 0,
      raw: {
        ...row,
        canonical_internal_number: text(row, ["Nro. Interno"]),
        canonical_start_date: normalizeDateLike(firstValue(row, ["Fch. Inicial"])),
        canonical_start_time: text(row, ["Hora Inicial"]),
        canonical_end_date: normalizeDateLike(firstValue(row, ["Fch. Final"])),
        canonical_end_time: text(row, ["Hora Final"]),
        canonical_parts_status: text(row, ["PIEZAS"]),
        canonical_origin: text(row, ["ORIGEN"]),
        canonical_auxiliary_technicians: auxiliaryTechnicians,
      },
    } satisfies CanonicalServiceOrderRow;
  });

  return {
    sourceSystem: "new_xml_ordenes_servicio",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapProductosSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalProductRow> {
  const rows = sheet.rows.map((row, index) => {
    const internalCode = text(row, ["Codigo"]);
    const manufacturerCode = text(row, ["CODFAB"]);
    const description = text(row, ["Descripcion"]) || `Producto ${index + 1}`;
    const group = text(row, ["GRUPO"]);
    const brand = normalizeXmlMarca(firstValue(row, ["MARCA"])) || inferProductBrand(group, manufacturerCode, description);

    return {
      rowId: buildRowId(internalCode, manufacturerCode, String(index + 1)) || `prod-row-${index + 1}`,
      internalCode,
      manufacturerCode,
      description,
      brand,
      group,
      family: text(row, ["FAMILIA"]),
      unit: text(row, ["Unidad"]),
      isActive: normalizeStableKey(text(row, ["ESTADO"])) !== "INACTIVO",
      raw: row,
    } satisfies CanonicalProductRow;
  });

  return {
    sourceSystem: "new_xml_productos",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}
