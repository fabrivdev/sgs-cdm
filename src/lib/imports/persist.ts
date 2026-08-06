import type { Database } from "@/integrations/supabase/types";
import type {
  CanonicalBillingCrosswalk,
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
    fecha_cierre_os: row.closeDate,
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
      canonical_auxiliary_technicians: row.auxiliaryTechnicians,
      canonical_time_type: row.timeType,
      canonical_currency: row.currency,
      import_era: resolveImportEra(row.openDate ?? row.invoiceDate),
    } as any,
  };
}

// clientes ya existe en el Database generado, pero el Insert no incluye
// nada especifico del import -- se tipa suelta igual que las demas de este
// archivo, por consistencia.
export interface ClienteInsert {
  cod_entidad: string;
  nombre: string;
  ruc: string | null;
  direccion: string | null;
  localidad: string | null;
  correo_principal: string | null;
  telefono: string | null;
  region: string | null;
  sucursal: string | null;
  activo: boolean;
}

export function mapCanonicalClienteToRow(row: CanonicalClienteRow): ClienteInsert {
  return {
    cod_entidad: row.codEntidad,
    nombre: row.nombre,
    ruc: row.ruc,
    direccion: row.direccion,
    localidad: row.localidad,
    correo_principal: row.correoPrincipal,
    telefono: row.telefono,
    region: row.region,
    sucursal: row.sucursal,
    activo: row.activo,
  };
}

// productos/repuestos_stock todavia no existen en el Database generado
// (falta aplicar la migracion + regenerar types.ts), asi que se tipan
// sueltas en vez de vs Database["public"]["Tables"][...] - mismo gap
// conocido que el resto de tablas nuevas de esta sesion.
export interface ProductoInsert {
  codigo_interno: string;
  codigo_fabricante: string | null;
  descripcion: string;
  unidad: string | null;
  grupo: string | null;
  familia: string | null;
  marca: string;
  activo: boolean;
}

export function mapCanonicalProductToRow(row: CanonicalProductRow): ProductoInsert | null {
  const codigoInterno = row.internalCode?.trim();
  if (!codigoInterno) return null;

  return {
    codigo_interno: codigoInterno,
    codigo_fabricante: row.manufacturerCode,
    descripcion: row.description,
    unidad: row.unit,
    grupo: row.group,
    familia: row.family,
    marca: row.brand ?? "OTROS",
    activo: row.isActive,
  };
}

export interface RepuestoStockInsert {
  producto_codigo: string;
  descripcion: string | null;
  unidad: string | null;
  codigo_fabricante: string | null;
  sucursal: string | null;
  deposito: string | null;
  saldo_actual: number;
}

export function mapCanonicalStockToRow(row: CanonicalStockRow): RepuestoStockInsert | null {
  const productoCodigo = row.productCode?.trim();
  if (!productoCodigo) return null;

  return {
    producto_codigo: productoCodigo,
    descripcion: row.description,
    unidad: row.unit,
    codigo_fabricante: row.manufacturerCode,
    sucursal: row.branch,
    deposito: row.warehouse,
    saldo_actual: row.balance,
  };
}

export interface CompraPedidoInsert {
  nro_pedido: string;
  item: string;
  fecha_emision: string | null;
  sucursal: string | null;
  proveedor_codigo: string | null;
  proveedor_nombre: string | null;
  moneda: string | null;
  condicion_pago: string | null;
  naturaleza: string | null;
  producto_codigo: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  valor_total: number;
  cantidad_entregada: number;
  cantidad_pendiente: number;
  tipo_entrega: string | null;
}

export function mapCanonicalPedidoCompraToRow(row: CanonicalPedidoCompraRow): CompraPedidoInsert | null {
  const nroPedido = row.nroPedido?.trim();
  const item = row.item?.trim();
  if (!nroPedido || !item) return null;

  return {
    nro_pedido: nroPedido,
    item,
    fecha_emision: row.emissionDate,
    sucursal: row.branch,
    proveedor_codigo: row.supplierCode,
    proveedor_nombre: row.supplierName,
    moneda: row.currency,
    condicion_pago: row.paymentCondition,
    naturaleza: row.naturaleza,
    producto_codigo: row.productCode,
    descripcion: row.description,
    unidad: row.unit,
    cantidad: row.quantity,
    precio_unitario: row.unitPrice,
    valor_total: row.total,
    cantidad_entregada: row.deliveredQuantity,
    cantidad_pendiente: row.pendingQuantity,
    tipo_entrega: row.deliveryType,
  };
}

export interface CompraSolicitudInsert {
  nro_solicitud: string;
  item: string;
  fecha_emision: string | null;
  sucursal: string | null;
  solicitante: string | null;
  moneda: string | null;
  producto_codigo: string | null;
  codigo_fabricante: string | null;
  marca_solicitada: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  valor_total: number;
  observacion: string | null;
}

export function mapCanonicalSolicitudCompraToRow(row: CanonicalSolicitudCompraRow): CompraSolicitudInsert | null {
  const nroSolicitud = row.nroSolicitud?.trim();
  const item = row.item?.trim();
  if (!nroSolicitud || !item) return null;

  return {
    nro_solicitud: nroSolicitud,
    item,
    fecha_emision: row.emissionDate,
    sucursal: row.branch,
    solicitante: row.requester,
    moneda: row.currency,
    producto_codigo: row.productCode,
    codigo_fabricante: row.manufacturerCode,
    marca_solicitada: row.requestedBrand,
    descripcion: row.description,
    unidad: row.unit,
    cantidad: row.quantity,
    precio_unitario: row.unitPrice,
    valor_total: row.total,
    observacion: row.observation,
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

const cleanTechnician = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized && !/^-+$/.test(normalized) ? normalized : "";
};

const auxiliaryTechniciansForRow = (row: ServiceOrderInsert) => {
  const raw = (row.raw_data ?? {}) as Record<string, unknown>;
  const canonical = Array.isArray(raw.canonical_auxiliary_technicians)
    ? raw.canonical_auxiliary_technicians
    : [];
  return Array.from(
    new Set(
      [...canonical, raw.TECAUX001, raw.TECAUX002]
        .map(cleanTechnician)
        .filter(Boolean),
    ),
  );
};

const addTechnicianTotals = (
  totalsByTechnician: Record<string, Record<string, number>>,
  technician: string,
  next: Record<string, number>,
) => {
  const previous = totalsByTechnician[technician] ?? serviceOrderTechnicianTotals({});
  totalsByTechnician[technician] = Object.fromEntries(
    Object.keys(next).map((key) => [
      key,
      sumImportNumber(previous[key], next[key], key === "kilometros" || key === "horas" ? 4 : 2),
    ]),
  );
};

const sameTechnicianSet = (left: string[], right: string[]) =>
  left.length > 0 &&
  left.length === right.length &&
  left.every((technician) => right.includes(technician));

export function aggregateNewSystemServiceOrders(rows: ServiceOrderInsert[]) {
  const byOs = new Map<string, any>();
  const sourceRowsByOs = new Map<string, ServiceOrderInsert[]>();

  for (const row of rows) {
    const osNumero = String(row.os_numero ?? "").trim();
    if (!osNumero) continue;
    sourceRowsByOs.set(osNumero, [...(sourceRowsByOs.get(osNumero) ?? []), row]);
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
    current.fecha_cierre_os = current.fecha_cierre_os ?? row.fecha_cierre_os;
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
    current.raw_data = {
      ...currentRaw,
      lineas_agregadas: Number(currentRaw.lineas_agregadas ?? 1) + 1,
      tipos_tiempo: timeTypes,
      facturas_por_tipo: invoicesByType,
      totales_por_tipo: totalsByType,
      productos_agregados: Array.from(
        new Set([...currentProducts.map(String), ...(row.problema ? [String(row.problema)] : [])]),
      ).slice(0, 20),
    };
  }

  for (const [osNumero, current] of byOs.entries()) {
    const sourceRows = sourceRowsByOs.get(osNumero) ?? [];
    const principals = Array.from(
      new Set(sourceRows.map((row) => cleanTechnician(row.responsable)).filter(Boolean)),
    );
    const auxiliaries = Array.from(
      new Set(sourceRows.flatMap(auxiliaryTechniciansForRow)),
    );
    const participants = Array.from(new Set([...principals, ...auxiliaries]));
    const totalsByTechnician: Record<string, Record<string, number>> = Object.fromEntries(
      participants.map((technician) => [technician, serviceOrderTechnicianTotals({})]),
    );

    for (const row of sourceRows) {
      const lineParticipants = Array.from(
        new Set([cleanTechnician(row.responsable), ...auxiliaryTechniciansForRow(row)].filter(Boolean)),
      );
      const totals = serviceOrderTechnicianTotals(row);
      const totalsWithoutKilometres = {
        ...totals,
        kilometros: 0,
        valor_kilometraje: 0,
      };
      for (const technician of lineParticipants) {
        addTechnicianTotals(totalsByTechnician, technician, totalsWithoutKilometres);
      }
    }

    let unassignedKilometres = 0;
    let unassignedKilometreValue = 0;
    for (const row of sourceRows) {
      const kilometreTotals = serviceOrderTechnicianTotals(row);
      if (kilometreTotals.kilometros === 0 && kilometreTotals.valor_kilometraje === 0) continue;

      const explicitPrincipal = cleanTechnician(row.responsable);
      const kilometreAuxiliaries = auxiliaryTechniciansForRow(row);
      let kilometrePrincipal = explicitPrincipal;

      if (!kilometrePrincipal && kilometreAuxiliaries.length > 0) {
        const exactMatches = Array.from(
          new Set(
            sourceRows
              .filter((candidate) =>
                cleanTechnician(candidate.responsable) &&
                sameTechnicianSet(auxiliaryTechniciansForRow(candidate), kilometreAuxiliaries),
              )
              .map((candidate) => cleanTechnician(candidate.responsable)),
          ),
        );
        if (exactMatches.length === 1) kilometrePrincipal = exactMatches[0];
      }

      if (!kilometrePrincipal && principals.length === 1) kilometrePrincipal = principals[0];

      if (kilometrePrincipal) {
        addTechnicianTotals(totalsByTechnician, kilometrePrincipal, {
          ...serviceOrderTechnicianTotals({}),
          kilometros: kilometreTotals.kilometros,
          valor_kilometraje: kilometreTotals.valor_kilometraje,
        });
      } else {
        unassignedKilometres = sumImportNumber(unassignedKilometres, kilometreTotals.kilometros, 4);
        unassignedKilometreValue = sumImportNumber(
          unassignedKilometreValue,
          kilometreTotals.valor_kilometraje,
        );
      }
    }

    current.responsable = principals[0] || null;
    current.raw_data = {
      ...(current.raw_data ?? {}),
      tecnicos_responsables: principals,
      tecnicos_auxiliares: auxiliaries,
      tecnicos_participantes: participants,
      totales_por_tecnico: totalsByTechnician,
      requiere_asignacion_tecnico: principals.length === 0,
      kilometros_sin_tecnico: unassignedKilometres,
      valor_kilometraje_sin_tecnico: unassignedKilometreValue,
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
