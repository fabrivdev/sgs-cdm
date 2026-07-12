import type { Database } from "@/integrations/supabase/types";
import type {
  CanonicalBillingCrosswalk,
  CanonicalBillingRow,
  CanonicalImportEnvelope,
  CanonicalServiceOrderRow,
} from "@/lib/imports/canonical";
import {
  compareIsoDate,
  isLegacyDate,
  NEW_SYSTEM_START,
  resolveImportEra,
  shouldReplaceNewSystemSlice,
} from "@/lib/imports/cutoff";
import { roundMoney } from "@/lib/imports/fiscal";

type FactLineInsert = Database["public"]["Tables"]["facturacion_lineas_importadas"]["Insert"];
type ServiceOrderInsert = Database["public"]["Tables"]["ordenes_servicio_importadas"]["Insert"];
type ImportInsert = Database["public"]["Tables"]["importaciones"]["Insert"];

export interface ImportDateSummary {
  minDate: string | null;
  maxDate: string | null;
  totalRows: number;
  legacyRows: number;
  newRows: number;
}

export interface ReplacementWindow {
  shouldReplace: boolean;
  from: string | null;
  to: string | null;
  reason: string;
}

export function summarizeDates(
  rows: Array<{ emissionDate?: string | null; openDate?: string | null; invoiceDate?: string | null }>,
): ImportDateSummary {
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let legacyRows = 0;
  let newRows = 0;

  for (const row of rows) {
    const date = row.emissionDate ?? row.openDate ?? row.invoiceDate ?? null;
    if (!date) continue;
    if (!minDate || compareIsoDate(date, minDate) < 0) minDate = date;
    if (!maxDate || compareIsoDate(date, maxDate) > 0) maxDate = date;
    if (isLegacyDate(date)) legacyRows += 1;
    else newRows += 1;
  }

  return {
    minDate,
    maxDate,
    totalRows: rows.length,
    legacyRows,
    newRows,
  };
}

export function resolveReplacementWindow(summary: ImportDateSummary): ReplacementWindow {
  if (!summary.maxDate || !shouldReplaceNewSystemSlice(summary.maxDate)) {
    return {
      shouldReplace: false,
      from: null,
      to: null,
      reason: "El archivo no trae datos del nuevo sistema para reemplazar.",
    };
  }

  const from = summary.minDate && compareIsoDate(summary.minDate, NEW_SYSTEM_START) >= 0 ? summary.minDate : NEW_SYSTEM_START;
  return {
    shouldReplace: true,
    from,
    to: summary.maxDate,
    reason: "Solo debe reemplazarse el tramo del nuevo sistema; el historico legado queda congelado.",
  };
}

export function buildImportMetadataEnvelope<T>(
  envelope: CanonicalImportEnvelope<T>,
  extra: Record<string, unknown> = {},
) {
  const anyRows = envelope.rows as Array<any>;
  const summary = summarizeDates(anyRows);
  return {
    sourceSystem: envelope.sourceSystem,
    worksheetName: envelope.worksheetName,
    sourceFileName: envelope.sourceFileName,
    importedAt: envelope.importedAt,
    dateSummary: summary,
    replacementWindow: resolveReplacementWindow(summary),
    ...extra,
  };
}

export function mapCanonicalBillingToFactLine(
  row: CanonicalBillingRow,
  crosswalk?: CanonicalBillingCrosswalk,
): FactLineInsert {
  return {
    origen_sistema: crosswalk?.matchedBy === "none" ? "new_xml_facturacion_directa" : "new_xml_facturacion_os",
    codigo_interno_factura: row.documentNumber ?? row.invoiceLongNumber,
    factura: row.invoiceShortNumber ?? row.invoiceLongNumber,
    entidad_nombre: row.clientName,
    fecha_factura: row.emissionDate,
    sucursal: (row.branch as any) ?? null,
    subgrupo_original: row.productGroup,
    grupo_normalizado: crosswalk?.inferredLineType ?? row.lineType,
    marca_normalizada: (crosswalk?.productBrand as any) ?? "OTROS",
    tipo_facturacion: (crosswalk?.inferredLineType === "Servicio" || crosswalk?.inferredLineType === "Kilometraje"
      ? "Servicio"
      : "Repuesto") as any,
    tipo_tiempo: crosswalk?.inferredTimeType ?? row.timeType,
    observacion: row.productName,
    cod_mercaderia: row.productCode,
    codigo_fabricante: row.manufacturerCode,
    mercaderia: row.productName,
    cantidad: row.quantity,
    valor_unitario: roundMoney(row.unitValueWithIva || row.unitValueBase),
    total_venta: roundMoney(row.totalValueWithIva || row.totalValueBase),
    raw_data: {
      ...row.raw,
      canonical_currency: row.currency,
      canonical_iva_rate: row.ivaRate,
      canonical_line_type: row.lineType,
      canonical_time_type: row.timeType,
      linked_service_order: crosswalk?.serviceOrderNumber ?? row.linkedServiceOrder,
      linked_trabajo: crosswalk?.trabajoId ?? row.linkedTrabajo,
      import_era: resolveImportEra(row.emissionDate),
      is_direct_sale: row.isDirectSale,
    } as any,
  };
}

export function mapCanonicalOsToImportRow(row: CanonicalServiceOrderRow): ServiceOrderInsert {
  return {
    os_numero: row.serviceOrderNumber,
    cliente_nombre: row.ownerName ?? row.billedClientName,
    situacion_os: row.status,
    situacion_facturacion: row.billingStatus,
    responsable: row.technician,
    cod_mecanico: null,
    factura: row.invoiceNumber,
    cod_interno: row.ownerCode ?? row.billedClientCode,
    fecha_abierta_os: row.openDate,
    fecha_emision_factura: row.invoiceDate,
    nro_chasis: row.chassis,
    marca: row.brand,
    tipo_tiempo: row.timeType,
    problema: row.productName,
    km_cantidad: roundMoney(row.kilometreQuantity),
    km_valor_unitario: null,
    servicios_cantidad: roundMoney(row.serviceHours),
    servicios_valor_unitario: null,
    terceros_valor: roundMoney(row.thirdPartyValue),
    kilometro_valor: roundMoney(row.kilometreValue),
    servicios_valor: roundMoney(row.serviceValue),
    repuesto_valor: roundMoney(row.sparePartsValue),
    raw_data: {
      ...row.raw,
      canonical_group: row.group,
      canonical_model: row.model,
      canonical_currency: row.currency,
      import_era: resolveImportEra(row.openDate ?? row.invoiceDate),
    } as any,
  };
}

export function buildImportInsert(args: {
  tipo: ImportInsert["tipo"];
  archivoNombre: string;
  origenSistema: string;
  totalFilas: number;
  insertados?: number;
  duplicados?: number;
  metadata?: Record<string, unknown>;
  usuarioId?: string | null;
}): ImportInsert {
  return {
    tipo: args.tipo,
    archivo_nombre: args.archivoNombre,
    origen_sistema: args.origenSistema,
    total_filas: args.totalFilas,
    insertados: args.insertados ?? 0,
    duplicados: args.duplicados ?? 0,
    usuario_id: args.usuarioId ?? null,
    metadata: (args.metadata ?? {}) as any,
  };
}
