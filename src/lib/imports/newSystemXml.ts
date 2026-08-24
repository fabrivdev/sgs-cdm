import type {
  CanonicalBillingRow,
  CanonicalClienteRow,
  CanonicalImportEnvelope,
  CanonicalPedidoCompraRow,
  CanonicalProductRow,
  CanonicalServiceOrderRow,
  CanonicalSolicitudCompraRow,
  CanonicalStockRow,
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
import { calculateCommissionDuration } from "@/lib/imports/workDuration";
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
  // Codificacion de sucursales del sistema nuevo (TOTVS). No debe
  // confundirse con la numeracion del sistema anterior: en los XML nuevos
  // 02 corresponde a Katuete y 06 a Santa Rosa.
  if (upper.includes("KATUETE") || upper.includes("KATUETÉ") || sample === "02") return "Katuete";
  if (upper.includes("CAMPO 9") || upper.includes("CAMPO NUEVE") || sample === "03") return "Campo 9";
  // "San Juan Bautista" es la localidad cabecera del departamento de
  // Misiones -- TOTVS a veces manda la localidad en vez del nombre de
  // sucursal que usa el resto de la app. Verificado: es la misma sucursal,
  // no una nueva (confirmado en pedidos/solicitudes de compra).
  if (upper.includes("MISIONES") || upper.includes("SAN JUAN BAUTISTA") || sample === "04") return "Misiones";
  if (upper.includes("LOMA PLATA") || sample === "05") return "Loma Plata";
  if (upper.includes("SANTA ROSA") || sample === "06") return "Santa Rosa";
  return null;
}

function normalizeXmlMarca(value: unknown) {
  const upper = normalizeText(value).toUpperCase();
  if (!upper || /^[-.\s]+$/.test(upper)) return null;
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
    const emissionRaw = firstValue(row, ["EMISION"]);
    const dueRaw = firstValue(row, ["FCHVEN"]);
    const emissionDate = normalizeDateLike(emissionRaw) ?? normalizeCompactDate(emissionRaw);
    const dueDate = normalizeDateLike(dueRaw) ?? normalizeCompactDate(dueRaw);
    const invoiceLongNumber = text(row, ["DOCUMENTO"]);
    const invoiceShortNumber = extractShortInvoiceNumber(firstValue(row, ["DOCUMENTO"]));
    const productCode = text(row, ["CODIGO"]);
    const manufacturerCode = text(row, ["CODFAB"]);
    const productGroup = text(row, ["GRUPO"]);
    const sourceBrand = firstValue(row, ["MARCA"]);
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
    const signedUnitBase = isCreditNote ? -Math.abs(unitBase) : unitBase;
    const signedTotalBase = isCreditNote ? -Math.abs(totalBase) : totalBase;

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
      manufacturerCode,
      productName,
      quantity,
      unitValueBase: signedUnitBase,
      totalValueBase: signedTotalBase,
      ivaRate,
      unitValueWithIva: applyIva(signedUnitBase, ivaRate),
      totalValueWithIva: applyIva(signedTotalBase, ivaRate),
      currency,
      exchangeRate: number(row, ["TIPCAM"]) || null,
      paymentCondition: text(row, ["CNDPAG"]),
      lineType: inferCanonicalBillingType(productGroup, productName, productCode),
      timeType: "Cliente",
      productGroup,
      productFamily: null,
      productBrand:
        normalizeXmlMarca(sourceBrand) ??
        inferProductBrand(productGroup, manufacturerCode, productName),
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
    const canonicalStartDate = normalizeDateLike(firstValue(row, ["Fch. Inicial"]));
    const canonicalStartTime = text(row, ["Hora Inicial"]);
    const canonicalEndDate = normalizeDateLike(firstValue(row, ["Fch. Final"]));
    const canonicalEndTime = text(row, ["Hora Final"]);
    const workDuration = lineType === "Servicio"
      ? calculateCommissionDuration({
          startDate: canonicalStartDate,
          startTime: canonicalStartTime,
          endDate: canonicalEndDate,
          endTime: canonicalEndTime,
          reportedHours: quantity,
        })
      : null;
    // El reloj es la fuente primaria. CANTIDAD queda como respaldo cuando
    // las marcas estan incompletas o forman una duracion invalida.
    const serviceHours = lineType === "Servicio"
      ? workDuration?.validHours ?? quantity
      : 0;
    const serviceHoursSource = lineType !== "Servicio"
      ? null
      : workDuration?.validHours != null
        ? "RELOJ"
        : "CANTIDAD";

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
      serviceHours,
      kilometreQuantity: lineType === "Kilometraje" ? quantity : 0,
      thirdPartyValue: lineType === "Otros" ? lineTotal : 0,
      kilometreValue: lineType === "Kilometraje" ? lineTotal : 0,
      serviceValue: lineType === "Servicio" ? lineTotal : 0,
      sparePartsValue: lineType === "Repuestos" ? lineTotal : 0,
      raw: {
        ...row,
        canonical_internal_number: text(row, ["Nro. Interno"]),
        canonical_start_date: canonicalStartDate,
        canonical_start_time: canonicalStartTime,
        canonical_end_date: canonicalEndDate,
        canonical_end_time: canonicalEndTime,
        canonical_reported_service_hours: lineType === "Servicio" ? quantity : null,
        canonical_clock_service_hours: workDuration?.calculatedHours ?? null,
        canonical_service_hours_source: serviceHoursSource,
        canonical_duration_status: workDuration?.status ?? null,
        canonical_duration_reasons: workDuration?.reasons ?? [],
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

function normalizeXmlMonedaCompras(value: unknown): string | null {
  const sample = normalizeUpper(value);
  if (!sample) return null;
  if (sample.includes("USD") || sample.includes("DOLAR")) return "USD";
  if (sample.includes("GRS") || sample.includes("GS") || sample.includes("PYG") || sample.includes("GUARANI")) return "GS";
  return sample;
}

export function mapPedidoCompraSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalPedidoCompraRow> {
  const rows = sheet.rows.map((row, index) => {
    const nroPedido = text(row, ["Nr.PedCompra"]);
    const item = text(row, ["Item"]);

    return {
      rowId: buildRowId(nroPedido, item, String(index + 1)) || `pedido-compra-row-${index + 1}`,
      nroPedido,
      item,
      emissionDate: normalizeDateLike(firstValue(row, ["Fch Emision"])),
      branch: normalizeXmlSucursal(firstValue(row, ["FILIAL"])),
      supplierCode: text(row, ["Proveedor"]),
      supplierName: text(row, ["Razon Social"]),
      currency: normalizeXmlMonedaCompras(firstValue(row, ["MONEDA"])),
      paymentCondition: text(row, ["CNDPAG"]),
      naturaleza: text(row, ["NATURALEZA"]),
      productCode: text(row, ["Producto"]),
      description: text(row, ["Descripcion"]),
      unit: text(row, ["Unidad"]),
      quantity: number(row, ["Cantidad"]) ?? 0,
      unitPrice: number(row, ["Prc.Unitario"]) ?? 0,
      total: number(row, ["Valor Total"]) ?? 0,
      deliveredQuantity: number(row, ["Ctd. Entrega"]) ?? 0,
      pendingQuantity: number(row, ["PENDIENTE"]) ?? 0,
      deliveryType: text(row, ["TIPENT"]),
      raw: row,
    } satisfies CanonicalPedidoCompraRow;
  });

  return {
    sourceSystem: "new_xml_pedidos_compra",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapSolicitudCompraSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalSolicitudCompraRow> {
  const rows = sheet.rows.map((row, index) => {
    const nroSolicitud = text(row, ["Nro.Solc.Com"]);
    const item = text(row, ["Item Sl.Comp"]);

    return {
      rowId: buildRowId(nroSolicitud, item, String(index + 1)) || `solicitud-compra-row-${index + 1}`,
      nroSolicitud,
      item,
      emissionDate: normalizeDateLike(firstValue(row, ["Fch Emision"])),
      branch: normalizeXmlSucursal(firstValue(row, ["FILIAL"])),
      requester: text(row, ["Solicitante"]),
      currency: normalizeXmlMonedaCompras(firstValue(row, ["MONEDA"])),
      productCode: text(row, ["Producto"]),
      manufacturerCode: text(row, ["Cod Faricant", "Cod Fabricant"]),
      requestedBrand: normalizeXmlMarca(firstValue(row, ["MARCA"])),
      description: text(row, ["Descripcion"]),
      unit: text(row, ["Unid. Medida"]),
      quantity: number(row, ["Cantidad"]) ?? 0,
      unitPrice: number(row, ["Prc Unitario"]) ?? 0,
      total: number(row, ["Val.Total"]) ?? 0,
      observation: text(row, ["Observacion"]),
      raw: row,
    } satisfies CanonicalSolicitudCompraRow;
  });

  return {
    sourceSystem: "new_xml_solicitudes_compra",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapClienteSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalClienteRow> {
  const vistos = new Set<string>();
  const rows: CanonicalClienteRow[] = [];

  sheet.rows.forEach((row, index) => {
    const codEntidad = text(row, ["Codigo"]);
    if (!codEntidad) return;

    // Un mismo cliente puede aparecer una vez por sucursal (ej. la propia
    // CDM, dada de alta en TOTVS 6 veces, una por Tienda) -- nos quedamos
    // con la primera fila que aparece para ese codigo, decision explicita
    // del usuario en vez de crear un registro separado por sucursal.
    const key = normalizeStableKey(codEntidad);
    if (vistos.has(key)) return;
    vistos.add(key);

    const region = text(row, ["DISTRI"]);
    const localidad = text(row, ["Municipio"]);

    rows.push({
      rowId: buildRowId(codEntidad, String(index + 1)) || `cliente-row-${index + 1}`,
      codEntidad,
      nombre: text(row, ["Nombre"]) || `Cliente ${index + 1}`,
      ruc: text(row, ["RUC"]),
      direccion: text(row, ["Direccion"]),
      localidad,
      correoPrincipal: text(row, ["E-Mail"]),
      telefono: text(row, ["Telefono"]),
      region,
      sucursal: normalizeXmlSucursal(region) ?? normalizeXmlSucursal(localidad),
      activo: normalizeUpper(firstValue(row, ["ESTATUS"])) !== "INACTIVO",
      raw: row,
    });
  });

  return {
    sourceSystem: "new_xml_clientes",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}

export function mapStockSheet(
  sourceFileName: string,
  sheet: SpreadsheetXmlSheet,
): CanonicalImportEnvelope<CanonicalStockRow> {
  const rows = sheet.rows.map((row, index) => {
    const productCode = text(row, ["Producto"]);
    const branch = normalizeXmlSucursal(firstValue(row, ["FILIAL"]));
    const warehouse = text(row, ["LOCAL"]);

    return {
      rowId: buildRowId(productCode, branch, warehouse, String(index + 1)) || `stock-row-${index + 1}`,
      productCode,
      description: text(row, ["Descripcion"]),
      unit: text(row, ["Unidad"]),
      manufacturerCode: text(row, ["Cod Faricant", "Cod Fabricant"]),
      branch,
      warehouse,
      balance: number(row, ["Saldo Actual"]) ?? 0,
      raw: row,
    } satisfies CanonicalStockRow;
  });

  return {
    sourceSystem: "new_xml_stock",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
  };
}
