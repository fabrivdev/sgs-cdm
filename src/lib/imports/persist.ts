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
      source_os_number: row.sourceServiceOrderNumber,
      source_branch_code: row.branchCode,
      canonical_group: row.group,
      canonical_model: row.model,
      canonical_time_type: row.timeType,
      canonical_currency: row.currency,
      import_era: resolveImportEra(row.openDate ?? row.invoiceDate),
    } as any,
  };
}

const sumImportNumber = (current: unknown, next: unknown, decimals = 2) =>
  Number((Number(current || 0) + Number(next || 0)).toFixed(decimals));

const appendDistinctText = (current: unknown, next: unknown, maxItems = 4) => {
  const parts = String(current ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = String(next ?? "").trim();
  if (candidate && !parts.includes(candidate)) parts.push(candidate);
  return parts.slice(0, maxItems).join("; ");
};

const serviceOrderTypeTotals = (row: any) => ({
  kilometros: Number(row.km_cantidad || 0),
  horas: Number(row.servicios_cantidad || 0),
  valor_kilometraje: Number(row.kilometro_valor || 0),
  valor_servicio: Number(row.servicios_valor || 0),
  valor_repuestos: Number(row.repuesto_valor || 0),
  valor_terceros: Number(row.terceros_valor || 0),
});

const serviceOrderTechnicianTotals = (row: any) => ({
  kilometros: Number(row.km_cantidad || 0),
  horas: Number(row.servicios_cantidad || 0),
  valor_kilometraje: Number(row.kilometro_valor || 0),
  valor_servicio: Number(row.servicios_valor || 0),
  valor_repuestos: Number(row.repuesto_valor || 0),
  valor_terceros: Number(row.terceros_valor || 0),
});

export function aggregateNewSystemServiceOrders(rows: ServiceOrderInsert[]) {
  const byOs = new Map<string, any>();

  for (const row of rows) {
    const osNumero = String(row.os_numero ?? "").trim();
    if (!osNumero) continue;
    const current = byOs.get(osNumero);

    if (!current) {
      const timeType = String(row.tipo_tiempo ?? "Desconocido");
      const invoice = String(row.factura ?? "").trim();
      const technician = String(row.responsable ?? "").trim();
      byOs.set(osNumero, {
        ...row,
        raw_data: {
          ...((row.raw_data as any) ?? {}),
          lineas_agregadas: 1,
          productos_agregados: row.problema ? [String(row.problema)] : [],
          tipos_tiempo: [timeType],
          facturas_por_tipo: invoice ? { [timeType]: [invoice] } : {},
          totales_por_tipo: { [timeType]: serviceOrderTypeTotals(row) },
          tecnicos_participantes: technician ? [technician] : [],
          totales_por_tecnico: technician ? { [technician]: serviceOrderTechnicianTotals(row) } : {},
        },
      });
      continue;
    }

    current.km_cantidad = sumImportNumber(current.km_cantidad, row.km_cantidad, 4);
    current.kilometro_valor = sumImportNumber(current.kilometro_valor, row.kilometro_valor);
    current.servicios_cantidad = sumImportNumber(current.servicios_cantidad, row.servicios_cantidad, 4);
    current.servicios_valor = sumImportNumber(current.servicios_valor, row.servicios_valor);
    current.terceros_valor = sumImportNumber(current.terceros_valor, row.terceros_valor);
    current.repuesto_valor = sumImportNumber(current.repuesto_valor, row.repuesto_valor);

    current.problema = appendDistinctText(current.problema, row.problema);
    current.cliente_nombre = current.cliente_nombre ?? row.cliente_nombre;
    current.situacion_os = current.situacion_os ?? row.situacion_os;
    current.situacion_facturacion = current.situacion_facturacion ?? row.situacion_facturacion;
    current.responsable = current.responsable ?? row.responsable;
    current.cod_mecanico = current.cod_mecanico ?? row.cod_mecanico;
    current.factura = appendDistinctText(current.factura, row.factura, 20);
    current.cod_interno = current.cod_interno ?? row.cod_interno;
    current.fecha_abierta_os = current.fecha_abierta_os ?? row.fecha_abierta_os;
    current.fecha_emision_factura = current.fecha_emision_factura ?? row.fecha_emision_factura;
    current.nro_chasis = current.nro_chasis ?? row.nro_chasis;
    current.marca = current.marca ?? row.marca;

    const currentRaw = (current.raw_data ?? {}) as Record<string, any>;
    const rowTimeType = String(row.tipo_tiempo ?? "Desconocido");
    const timeTypes = Array.from(
      new Set([...(Array.isArray(currentRaw.tipos_tiempo) ? currentRaw.tipos_tiempo.map(String) : []), rowTimeType]),
    );
    current.tipo_tiempo = timeTypes.length > 1 ? "Mixto" : timeTypes[0] ?? "Desconocido";

    const invoicesByType = { ...(currentRaw.facturas_por_tipo ?? {}) } as Record<string, string[]>;
    const rowInvoice = String(row.factura ?? "").trim();
    invoicesByType[rowTimeType] = Array.from(
      new Set([...(invoicesByType[rowTimeType] ?? []).map(String), ...(rowInvoice ? [rowInvoice] : [])]),
    );

    const totalsByType = { ...(currentRaw.totales_por_tipo ?? {}) } as Record<string, any>;
    const previousTypeTotals = totalsByType[rowTimeType] ?? serviceOrderTypeTotals({});
    const nextTypeTotals = serviceOrderTypeTotals(row);
    totalsByType[rowTimeType] = Object.fromEntries(
      Object.keys(nextTypeTotals).map((key) => [
        key,
        sumImportNumber(previousTypeTotals[key], nextTypeTotals[key], key === "kilometros" || key === "horas" ? 4 : 2),
      ]),
    );

    const currentProducts = Array.isArray(currentRaw.productos_agregados) ? currentRaw.productos_agregados : [];
    const rowTechnician = String(row.responsable ?? "").trim();
    const currentTechnicians = Array.isArray(currentRaw.tecnicos_participantes)
      ? currentRaw.tecnicos_participantes.map(String)
      : [];
    const technicians = Array.from(new Set([...currentTechnicians, ...(rowTechnician ? [rowTechnician] : [])]));
    const totalsByTechnician = { ...(currentRaw.totales_por_tecnico ?? {}) } as Record<string, any>;
    if (rowTechnician) {
      const previousTechnicianTotals = totalsByTechnician[rowTechnician] ?? serviceOrderTechnicianTotals({});
      const nextTechnicianTotals = serviceOrderTechnicianTotals(row);
      totalsByTechnician[rowTechnician] = Object.fromEntries(
        Object.keys(nextTechnicianTotals).map((key) => [
          key,
          sumImportNumber(
            previousTechnicianTotals[key],
            nextTechnicianTotals[key],
            key === "kilometros" || key === "horas" ? 4 : 2,
          ),
        ]),
      );
    }
    current.raw_data = {
      ...currentRaw,
      lineas_agregadas: Number(currentRaw.lineas_agregadas ?? 1) + 1,
      tipos_tiempo: timeTypes,
      facturas_por_tipo: invoicesByType,
      totales_por_tipo: totalsByType,
      tecnicos_participantes: technicians,
      totales_por_tecnico: totalsByTechnician,
      productos_agregados: Array.from(
        new Set([...currentProducts.map(String), ...(row.problema ? [String(row.problema)] : [])]),
      ).slice(0, 20),
    };
  }

  return Array.from(byOs.values()) as ServiceOrderInsert[];
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
