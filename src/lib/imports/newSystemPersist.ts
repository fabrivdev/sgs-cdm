// Logica de persistencia del trio OS + Facturacion + Productos del sistema
// nuevo, extraida de ImportarTab.tsx (confirmarNuevoSistemaXml) para que el
// importador unificado (y cualquier otro que aparezca despues) la pueda
// llamar sin duplicarla. El comportamiento es identico al original -- solo
// se parametrizaron los closures sobre estado de React (usuario, nombres
// de archivo) para que sea una funcion pura de I/O, sin UI.

import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "@/hooks/useCatalogos";
import {
  NEW_SYSTEM_START,
  aggregateNewSystemServiceOrders,
  isMissingBillingLinesTableError,
  isMissingOsImportTableError,
  matchSucursal,
  matchSucursalFromRegion,
  normCode,
  normText,
  persistCommissionTimeEntries,
  type NewSystemImportBundle,
} from "@/lib/imports";
import { validateBillingSourceBatch } from "@/lib/imports/billingLineStableReimport";
import { persistedBillingTimeType } from "@/lib/imports/billingTimeType";
import {
  accreditExistingBillingSource,
  buildBillingSnapshotScope,
  type BillingSourceAccreditationRpcClient,
  type BillingSnapshotDeclaration,
} from "@/lib/imports/billingSourceAccreditation";
import type { SourceFileIdentity } from "@/lib/imports/sourceIdentity";
import {
  describeImportError,
  emitImportProgress,
  runImportProgressStep,
  type ImportProgressCallback,
} from "@/lib/imports/importProgress";

export { persistedBillingTimeType } from "@/lib/imports/billingTimeType";

// La ausencia en una exportacion de OS no representa una anulacion. El estado
// operativo se toma exclusivamente de situacion_os, informada por la fuente.
const RECONCILE_SERVICE_ORDERS_BY_ABSENCE = false;

export interface PersistNewSystemBundleArgs {
  bundle: NewSystemImportBundle;
  userId: string;
  onProgress?: ImportProgressCallback;
  billingSnapshotDeclaration?: BillingSnapshotDeclaration | null;
  mode?: "validate" | "persist" | "accredit";
  accreditation?: {
    supportingLoadId: string;
    sourceIdentity: SourceFileIdentity;
  };
  skipServiceOrders?: boolean;
  fileNames: {
    facturacion: string | null;
    ordenesServicio: string | null;
    productos: string | null;
  };
}

export type PersistNewSystemServiceOrdersArgs = Pick<
  PersistNewSystemBundleArgs,
  "bundle" | "userId" | "onProgress" | "fileNames"
>;

type ServiceOrderBatchRpcClient = {
  rpc: (
    name: "totvs_importar_ordenes_servicio_lote_v1",
    params: {
      p_importacion_id: string;
      p_lote_numero: number;
      p_filas: Record<string, unknown>[];
    },
  ) => Promise<{
    data: { persistidas?: unknown[]; excluidas?: unknown[]; total?: number } | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export class ServiceOrderImportFailure extends Error {
  readonly confirmedServiceOrders: number;

  constructor(message: string, confirmedServiceOrders: number) {
    super(message);
    this.confirmedServiceOrders = confirmedServiceOrders;
  }
}

export interface PersistNewSystemBundleResult {
  facturacionLineas: number;
  facturacionExcluidas: number;
  ordenesServicioOmitidas: number;
  ordenesServicio: number;
  ordenesServicioArchivadas: number;
  ordenesServicioBloqueadas: number;
  jornadasDesactivadas: number;
  facturacionDesde: string | null;
  facturacionHasta: string | null;
  historialRepuestosActualizado: boolean;
  historialRepuestosError: string | null;
  consolidacionTecnicaError?: string | null;
}

export type AccreditHistoricalBillingSourceArgs = Omit<
  PersistNewSystemBundleArgs,
  "mode" | "accreditation"
> & {
  supportingLoadId: string;
  sourceIdentity: SourceFileIdentity;
};

export function accreditHistoricalBillingSource({
  supportingLoadId,
  sourceIdentity,
  ...args
}: AccreditHistoricalBillingSourceArgs) {
  return persistNewSystemBundle({
    ...args,
    mode: "accredit",
    accreditation: { supportingLoadId, sourceIdentity },
  });
}

export function prepareBillingPersistenceRows(bundle: NewSystemImportBundle) {
  const crosswalkByRowId = new Map(bundle.billingCrosswalk.map((row) => [row.billingRowId, row]));
  return bundle.facturacion.rows.map((row) => {
    const crosswalk = crosswalkByRowId.get(row.rowId);
    const canonicalTimeType = crosswalk?.inferredTimeType ?? row.timeType;
    return {
      origen_sistema: crosswalk?.matchedBy === "none" ? "new_xml_facturacion_directa" : "new_xml_facturacion_os",
      codigo_interno_factura: row.documentNumber ?? row.invoiceLongNumber,
      factura: row.invoiceShortNumber ?? row.invoiceLongNumber,
      entidad_nombre: row.clientName,
      vendedor: row.seller ?? null,
      fecha_factura: row.emissionDate,
      sucursal: matchSucursalFromRegion(row.branch) ?? matchSucursal(row.branch),
      subgrupo_original: crosswalk?.productGroup ?? row.productGroup,
      grupo_normalizado: crosswalk?.inferredLineType ?? row.lineType,
      marca_normalizada: (crosswalk?.productBrand as any) ?? "OTROS",
      tipo_facturacion: crosswalk?.inferredLineType === "Repuestos" ? "Repuesto" : "Servicio",
      tipo_tiempo: persistedBillingTimeType(canonicalTimeType),
      observacion: row.productName,
      cod_mercaderia: row.productCode,
      codigo_fabricante: row.manufacturerCode,
      mercaderia: row.productName,
      cantidad: Number((row.quantity || 0).toFixed(4)),
      valor_unitario: Number((row.unitValueWithIva || row.unitValueBase || 0).toFixed(2)),
      total_venta: Number((row.totalValueWithIva || row.totalValueBase || 0).toFixed(2)),
      moneda: row.currency,
      raw_data: {
        ...row.raw,
        linked_service_order: crosswalk?.serviceOrderNumber ?? null,
        linked_service_order_evidence: crosswalk?.serviceOrderEvidence ?? "missing",
        linked_service_order_known_values: crosswalk?.knownServiceOrders ?? [],
        canonical_line_type: crosswalk?.inferredLineType ?? row.lineType,
        canonical_time_type: canonicalTimeType,
        canonical_time_type_evidence: crosswalk?.timeTypeEvidence ?? "missing",
        canonical_time_type_known_values: crosswalk?.knownTimeTypes ?? [],
        canonical_time_type_has_unknown: crosswalk?.hasUnknownTimeType ?? true,
        product_brand: crosswalk?.productBrandEvidence === "missing"
          ? null
          : crosswalk?.productBrand ?? null,
        product_brand_evidence: crosswalk?.productBrandEvidence ?? "missing",
        product_brand_known_values: crosswalk?.knownProductBrands ?? [],
        product_group: crosswalk?.productGroup ?? null,
        product_family: crosswalk?.productFamily ?? null,
        import_cutoff_mode: `legacy<=2026-06-30 / new>=${NEW_SYSTEM_START}`,
      },
    };
  });
}

export function indexFirstBillingRowsById(
  rows: NewSystemImportBundle["facturacion"]["rows"],
) {
  const byId = new Map<string, NewSystemImportBundle["facturacion"]["rows"][number]>();
  for (const row of rows) {
    if (!byId.has(row.rowId)) byId.set(row.rowId, row);
  }
  return byId;
}

export function prepareServiceOrderPersistenceRows(bundle: NewSystemImportBundle) {
  // Este enriquecimiento usa solo el contenido ya leido de los XML; no exige
  // que facturacion valide ni persista, por lo que mantiene independiente la OS.
  const invoiceDateByServiceOrder = new Map<string, string>();
  const billingRowById = indexFirstBillingRowsById(bundle.facturacion.rows);
  for (const crosswalk of bundle.billingCrosswalk) {
    if (!crosswalk.serviceOrderNumber) continue;
    const billingRow = billingRowById.get(crosswalk.billingRowId);
    const billingDate = billingRow?.emissionDate ?? billingRow?.dueDate ?? null;
    if (!billingDate) continue;
    const current = invoiceDateByServiceOrder.get(crosswalk.serviceOrderNumber);
    if (!current || billingDate > current) {
      invoiceDateByServiceOrder.set(crosswalk.serviceOrderNumber, billingDate);
    }
  }

  return aggregateNewSystemServiceOrders(bundle.ordenesServicioPayload).map((row) => ({
    ...row,
    fecha_emision_factura: row.fecha_emision_factura
      ?? invoiceDateByServiceOrder.get(row.os_numero)
      ?? null,
  }));
}

export function filterRowsForConfirmedServiceOrderExclusions<
  T extends { serviceOrderNumber: string },
>(rows: T[], exclusions: Iterable<string>) {
  const excluded = new Set(
    Array.from(exclusions, (value) => String(value).trim().toUpperCase()).filter(Boolean),
  );
  return rows.filter((row) => !excluded.has(row.serviceOrderNumber.trim().toUpperCase()));
}

export function missingPersistedServiceOrderNumbers(
  expected: string[],
  persisted: Array<{ os_numero?: unknown }> | null | undefined,
) {
  const found = new Set(
    (persisted ?? []).map((row) => String(row.os_numero ?? "").trim()).filter(Boolean),
  );
  return expected.filter((osNumero) => !found.has(osNumero));
}

const missingPartsHistoryRefresh = (error: any) =>
  error?.code === "PGRST202"
  || error?.code === "42883"
  || String(error?.message ?? "").includes("repuestos_actualizar_ventas_periodo");

const missingServiceOrderBatchRpc = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202"
  || error?.code === "42883"
  || String(error?.message ?? "").includes("totvs_importar_ordenes_servicio_lote_v1");

const missingServiceOrderReconciliation = (error: any) =>
  error?.code === "PGRST202"
  || error?.code === "42883"
  || /ordenes_servicio_(reconciliar_snapshot|importadas_archivo)/.test(String(error?.message ?? ""));

const postBillingStageError = (stage: string, error: unknown) => {
  const detail = describeImportError(error, stage);
  return new Error(
    `La facturacion quedo confirmada, pero fallo la etapa posterior ${stage}. `
    + `Es seguro reintentar el mismo paquete: la facturacion reutilizara sus UUID. Detalle: ${detail}`,
  );
};

export async function persistNewSystemServiceOrders({
  bundle,
  userId,
  onProgress,
  fileNames,
}: PersistNewSystemServiceOrdersArgs) {
  const payload = prepareServiceOrderPersistenceRows(bundle);
  const importMetadata = {
    ...(bundle.importaciones.ordenesServicio.metadata as Record<string, unknown>),
    archivos_relacionados: fileNames,
  };
  const { data: osImport, error: importError } = await supabase
    .from("importaciones")
    .insert({
      ...bundle.importaciones.ordenesServicio,
      insertados: 0,
      duplicados: 0,
      usuario_id: userId,
      metadata: importMetadata as any,
    } as any)
    .select("id")
    .single();
  if (importError) throw new ServiceOrderImportFailure(String(importError.message ?? importError), 0);

  let confirmed = 0;
  let excluded = 0;
  const excludedServiceOrderNumbers = new Set<string>();
  let batch = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500).map((row) => ({
      ...row,
      actualizado_en: new Date().toISOString(),
    }));
    batch += 1;
    emitImportProgress(onProgress, {
      phase: "service-orders.persist",
      sourceFile: fileNames.ordenesServicio ?? undefined,
      status: "started",
      completed: confirmed + excluded,
      total: payload.length,
      batch,
    });
    const expectedNumbers = chunk.map((row) => row.os_numero.trim().toUpperCase());
    const { data, error } = await (supabase as unknown as ServiceOrderBatchRpcClient).rpc(
      "totvs_importar_ordenes_servicio_lote_v1",
      { p_importacion_id: osImport.id, p_lote_numero: batch, p_filas: chunk },
    );
    if (error) {
      emitImportProgress(onProgress, {
        phase: "service-orders.persist",
        sourceFile: fileNames.ordenesServicio ?? undefined,
        status: "failed",
        completed: confirmed + excluded,
        total: payload.length,
        batch,
        error: String(error.message ?? error),
      });
      const detail = isMissingOsImportTableError(error) || missingServiceOrderBatchRpc(error)
        ? "Falta aplicar la migración del importador transaccional de órdenes de servicio."
        : String(error.message ?? error);
      throw new ServiceOrderImportFailure(detail, confirmed);
    }
    const persistedNumbers = Array.isArray(data?.persistidas)
      ? data.persistidas.map((value) => String(value).trim().toUpperCase())
      : [];
    const excludedNumbers = Array.isArray(data?.excluidas)
      ? data.excluidas.map((value) => String(value).trim().toUpperCase())
      : [];
    const persistedSet = new Set(persistedNumbers);
    const excludedSet = new Set(excludedNumbers);
    const returnedNumbers = new Set([...persistedNumbers, ...excludedNumbers]);
    const missingNumbers = expectedNumbers.filter((osNumero) => !returnedNumbers.has(osNumero));
    const unexpectedNumbers = [...returnedNumbers].filter((osNumero) => !expectedNumbers.includes(osNumero));
    const overlappingNumbers = [...persistedSet].filter((osNumero) => excludedSet.has(osNumero));
    const contractFailures = [
      Number(data?.total) !== expectedNumbers.length ? `total ${String(data?.total)} de ${expectedNumbers.length}` : null,
      persistedSet.size !== persistedNumbers.length ? "persistidas duplicadas" : null,
      excludedSet.size !== excludedNumbers.length ? "excluidas duplicadas" : null,
      overlappingNumbers.length ? `en ambos estados: ${overlappingNumbers.join(", ")}` : null,
      missingNumbers.length ? `faltan: ${missingNumbers.join(", ")}` : null,
      unexpectedNumbers.length ? `sobran: ${unexpectedNumbers.join(", ")}` : null,
    ].filter(Boolean);
    const verificationFailure = contractFailures.length
      ? `La respuesta transaccional de OS no coincide con el lote (${contractFailures.join("; ")}).`
      : null;
    if (verificationFailure) {
      emitImportProgress(onProgress, {
        phase: "service-orders.persist",
        sourceFile: fileNames.ordenesServicio ?? undefined,
        status: "failed",
        completed: confirmed + excluded,
        total: payload.length,
        batch,
        error: verificationFailure,
      });
      throw new ServiceOrderImportFailure(verificationFailure, confirmed);
    }
    confirmed += persistedNumbers.length;
    excluded += excludedNumbers.length;
    for (const osNumero of excludedNumbers) excludedServiceOrderNumbers.add(osNumero);
    emitImportProgress(onProgress, {
      phase: "service-orders.persist",
      sourceFile: fileNames.ordenesServicio ?? undefined,
      status: "succeeded",
      completed: confirmed + excluded,
      total: payload.length,
      batch,
    });
  }

  await persistCommissionTimeEntries({
    rows: filterRowsForConfirmedServiceOrderExclusions(
      bundle.ordenesServicio.rows,
      excludedServiceOrderNumbers,
    ),
    importId: osImport.id,
    strict: false,
  });
  const { error: closeError } = await supabase
    .from("importaciones")
    .update({ duplicados: 0 } as any)
    .eq("id", osImport.id);
  if (closeError) throw new ServiceOrderImportFailure(String(closeError.message ?? closeError), confirmed);

  return { ordenesServicio: confirmed, ordenesServicioOmitidas: excluded };
}

export async function actualizarVentasRepuestosPeriodo(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return { actualizado: false, error: null as string | null };

  const { error } = await (supabase.rpc as any)("repuestos_actualizar_ventas_periodo", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (!error) return { actualizado: true, error: null as string | null };

  const message = missingPartsHistoryRefresh(error)
    ? "Falta aplicar la migración que actualiza las ventas de repuestos después de importar."
    : [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "No se pudo actualizar el historial de repuestos.";
  return { actualizado: false, error: message };
}

export async function persistNewSystemBundle({
  bundle,
  userId,
  mode = "persist",
  accreditation,
  skipServiceOrders = false,
  onProgress,
  billingSnapshotDeclaration = null,
  fileNames,
}: PersistNewSystemBundleArgs): Promise<PersistNewSystemBundleResult> {
  if (mode === "persist" && !skipServiceOrders) {
    throw new Error(
      "La persistencia directa de OS esta deshabilitada. Usa el importador TOTVS principal para respetar exclusiones y auditoria.",
    );
  }
  if (mode === "accredit" && !accreditation) {
    throw new Error("La acreditacion retrospectiva requiere la carga historica y la identidad del archivo original.");
  }
  const osWindow = bundle.diagnostics.replacement.ordenesServicio;
  if (RECONCILE_SERVICE_ORDERS_BY_ABSENCE && osWindow.shouldReplace) {
    // La reconciliacion debe existir antes de cualquier escritura. Sin este
    // preflight, publicar el frontend antes de aplicar la migracion podria
    // dejar una importacion parcial tras reemplazar la facturacion.
    const { error: reconciliationSchemaError } = await (supabase
      .from("ordenes_servicio_importadas_archivo" as any)
      .select("id")
      .limit(1) as any);
    if (reconciliationSchemaError) {
      if (missingServiceOrderReconciliation(reconciliationSchemaError)) {
        throw new Error(
          "Falta aplicar la migración de reconciliación de órdenes de servicio antes de importar el XML.",
        );
      }
      throw reconciliationSchemaError;
    }
  }

  const cliExistentes = await runImportProgressStep({
    callback: onProgress,
    phase: "billing.clients",
    operation: "clientes.select.all",
    completed: 0,
    total: null,
    action: () => cargarTodo<any>(supabase.from("clientes").select("*")),
  });

  const cliByCod = new Map<string, string>();
  const cliByNombre = new Map<string, string>();
  const clientCodeKeys = (value: unknown) => {
    const normalized = normCode(value);
    const compact = normalized.replace(/[^a-z0-9]/g, "");
    return normalized === compact ? [normalized] : [normalized, compact];
  };
  const indexClientCode = (value: unknown, id: string) => {
    for (const key of clientCodeKeys(value)) if (key) cliByCod.set(key, id);
  };
  const resolveClientCode = (value: unknown) => {
    for (const key of clientCodeKeys(value)) {
      const id = cliByCod.get(key);
      if (id) return id;
    }
    return undefined;
  };
  for (const c of cliExistentes as any[]) {
    if (c.cod_entidad) indexClientCode(c.cod_entidad, c.id);
    // En el maestro nuevo CLIENTE suele ser el RUC, mientras clientes
    // migrados conservan un cod_entidad legado distinto. Ambos identifican
    // al mismo registro y deben resolver al mismo id.
    if (c.ruc) indexClientCode(c.ruc, c.id);
    if (c.nombre) cliByNombre.set(normText(c.nombre), c.id);
  }

  const factCrosswalkByRowId = new Map(bundle.billingCrosswalk.map((row) => [row.billingRowId, row]));

  const facturacionResumenRows = bundle.facturacion.rows
    .map((row) => {
      const crosswalk = factCrosswalkByRowId.get(row.rowId);
      const fecha = row.emissionDate ?? row.dueDate;
      if (!fecha) return null;

      return {
        fecha,
        sucursal: matchSucursalFromRegion(row.branch) ?? matchSucursal(row.branch),
        tipo: crosswalk?.inferredLineType === "Repuestos" ? "Repuesto" : "Servicio",
        cliente_id:
          (row.clientCode && resolveClientCode(row.clientCode)) ?? cliByNombre.get(normText(row.clientName)) ?? null,
        entidad_nombre: row.clientName,
        cod_entidad: row.clientCode,
        total_venta: Number((row.totalValueWithIva || row.totalValueBase || 0).toFixed(2)),
        cantidad: Number((row.quantity || 0).toFixed(4)),
        grupo: crosswalk?.productGroup ?? row.productGroup,
        grupo_fx: crosswalk?.inferredLineType ?? row.lineType,
        cod_factura: row.invoiceShortNumber ?? row.invoiceLongNumber ?? row.documentNumber ?? `XML-${row.rowId.slice(0, 12)}`,
        moneda: row.currency,
      };
    })
    .filter(Boolean) as any[];

  // La moneda entra en la clave de agrupacion para que una fila de
  // "facturacion" nunca sume lineas en USD y en GS bajo un mismo total --
  // sin esto, agrupar solo por factura/tipo/fecha/etc podria mezclar dos
  // monedas distintas en un mismo total_venta.
  const facturacionResumenByKey = new Map<string, any>();
  for (const row of facturacionResumenRows) {
    const key = [
      row.cod_factura,
      row.tipo,
      row.fecha,
      row.cod_entidad ?? "",
      row.entidad_nombre ?? "",
      row.sucursal ?? "",
      row.grupo ?? "",
      row.grupo_fx ?? "",
      row.moneda ?? "",
    ].join("||");
    const current = facturacionResumenByKey.get(key);
    if (!current) {
      facturacionResumenByKey.set(key, { ...row });
      continue;
    }
    current.total_venta = Number((Number(current.total_venta || 0) + Number(row.total_venta || 0)).toFixed(2));
    current.cantidad = Number((Number(current.cantidad || 0) + Number(row.cantidad || 0)).toFixed(4));
  }
  const facturacionResumen = Array.from(facturacionResumenByKey.values());

  const facturacionLineasSinValidar = prepareBillingPersistenceRows(bundle);

  // Esta validacion ocurre antes del primer INSERT/UPDATE/DELETE del flujo.
  // El RPC repite las mismas invariantes bajo transaccion para cerrar carreras.
  const facturacionValidada = validateBillingSourceBatch(facturacionLineasSinValidar);
  const facturacionLineas = facturacionValidada.rows;

  const ordenesServicioPayload = prepareServiceOrderPersistenceRows(bundle);

  const billingWindow = bundle.diagnostics.replacement.facturacion;
  const billingDates = facturacionLineas.map((row) => row.fecha_factura).filter((value): value is string => Boolean(value));
  const observedBillingFrom = billingWindow.from ?? (billingDates.length ? [...billingDates].sort()[0] : null);
  const observedBillingTo = billingWindow.to ?? (billingDates.length ? [...billingDates].sort().at(-1)! : null);
  const billingSnapshotScope = buildBillingSnapshotScope(
    billingSnapshotDeclaration,
    {
      sourceFileSha256: String(
        (bundle.importaciones.facturacion.metadata as Record<string, unknown>).sourceFileSha256 ?? "",
      ),
      sourceFileByteSize: Number(
        (bundle.importaciones.facturacion.metadata as Record<string, unknown>).sourceFileByteSize ?? 0,
      ),
      observedLineCount: facturacionLineas.length,
      observedBranches: facturacionLineas.map((row) => String(row.sucursal ?? "")),
    },
  );
  const facturacionDesde = billingSnapshotScope?.from ?? observedBillingFrom;
  const facturacionHasta = billingSnapshotScope?.to ?? observedBillingTo;
  const replaceBillingSummary = billingSnapshotScope !== null;
  const osNumeros = Array.from(new Set(ordenesServicioPayload.map((row) => row.os_numero).filter(Boolean)));

  const importEnvelope = {
    ...bundle.importaciones.facturacion,
    metadata: {
      ...(bundle.importaciones.facturacion.metadata as Record<string, unknown>),
      archivos_relacionados: fileNames,
      duplicados_exactos_colapsados: facturacionValidada.collapsedExactDuplicates,
      sourcePeriodFrom: facturacionDesde,
      sourcePeriodTo: facturacionHasta,
      snapshot_scope: billingSnapshotScope,
      technicalLoadState: "COMPLETE_ON_RPC_SUCCESS",
    },
  };
  const billingResponse = await runImportProgressStep({
    callback: onProgress,
    phase: mode === "validate" ? "billing.validate" : mode === "accredit" ? "billing.accredit" : "billing.persist",
    sourceFile: fileNames.facturacion ?? undefined,
    operation: mode === "validate"
      ? "facturacion_validar_totvs_lote_v1"
      : mode === "accredit"
        ? "facturacion_acreditar_fuente_existente_v1"
        : "facturacion_importar_totvs_lote_con_fuente_v1",
    completed: 0,
    total: facturacionLineas.length,
    batch: 1,
    batchRows: facturacionLineas.length,
    resultError: (response) => response.error,
    action: () => mode === "accredit"
      ? accreditExistingBillingSource(
        supabase as unknown as BillingSourceAccreditationRpcClient,
        {
          supportingLoadId: accreditation!.supportingLoadId,
          sourceIdentity: accreditation!.sourceIdentity,
          importEnvelope,
          summary: facturacionResumen,
          lines: facturacionLineas,
          from: facturacionDesde,
          to: facturacionHasta,
          replaceSummary: replaceBillingSummary,
        },
      )
      : (supabase.rpc as any)(
        mode === "validate" ? "facturacion_validar_totvs_lote_v1" : "facturacion_importar_totvs_lote_con_fuente_v1",
        {
          p_importacion: importEnvelope,
          p_resumen: facturacionResumen,
          p_lineas: facturacionLineas,
          p_desde: facturacionDesde,
          p_hasta: facturacionHasta,
          p_reemplazar_resumen: replaceBillingSummary,
        },
      ),
  });
  const { data: facturacionData, error: facturacionError } = billingResponse;
  if (facturacionError) {
    if (isMissingBillingLinesTableError(facturacionError) || facturacionError.code === "PGRST202") {
      throw new Error("Falta aplicar la migracion transaccional de facturacion TOTVS antes de importar el XML.");
    }
    throw new Error(describeImportError(
      facturacionError,
      mode === "validate" ? "billing.validate" : mode === "accredit" ? "billing.accredit" : "billing.persist",
    ));
  }

  const facturacionResultado = (facturacionData ?? {}) as Record<string, unknown>;
  const facturacionExcluidas = Number(facturacionResultado.excluidas_confirmadas ?? 0);
  const facturacionAceptadas = Number(facturacionResultado.lineas_activas ?? facturacionLineas.length - facturacionExcluidas);
  let consolidacionTecnicaError: string | null = null;
  if (mode !== "validate") {
    const supportingLoadId = String(
      facturacionResultado.supporting_load_id
        ?? facturacionResultado.importacion_id
        ?? accreditation?.supportingLoadId
        ?? "",
    ) || null;
    if (supportingLoadId) {
      try {
        const refreshRpc = supabase.rpc as unknown as (
          name: string,
          params: Record<string, unknown>,
        ) => PromiseLike<{
          data: { status?: string; error?: string } | null;
          error: { code?: string; message?: string } | null;
        }>;
        const { data, error } = await refreshRpc("totvs_refrescar_consolidacion_post_import_v1", {
          p_mayor_carga_id: null,
          p_facturacion_carga_id: supportingLoadId,
        });
        if (error && !["PGRST202", "42883"].includes(error.code ?? "")) {
          consolidacionTecnicaError = error.message ?? "No se pudo refrescar la consolidacion tecnica.";
        } else if (data?.status === "FAILED") {
          consolidacionTecnicaError = data.error ?? "No se pudo refrescar la consolidacion tecnica.";
        }
      } catch (refreshError) {
        consolidacionTecnicaError = refreshError instanceof Error
          ? refreshError.message
          : String(refreshError);
      }
    }
  }

  let historialRepuestos = { actualizado: false, error: null as string | null };
  if (mode !== "validate") {
    // Estas proyecciones dependen de la facturacion activa, por lo que deben
    // reconciliarse tambien en una acreditacion historica y aun si una etapa
    // posterior de OS falla. Sus RPC ya son idempotentes.
    const { error: refreshParkError } = await (supabase.rpc as any)("refrescar_parque_ultima_actividad");
    if (refreshParkError) {
      console.error("No se pudo reconciliar la ultima actividad del Parque", refreshParkError);
    }
    historialRepuestos = await actualizarVentasRepuestosPeriodo(facturacionDesde, facturacionHasta);
  }

  if (mode === "validate" || mode === "accredit") {
    return {
      facturacionLineas: facturacionAceptadas,
      facturacionExcluidas,
      ordenesServicioOmitidas: 0,
      ordenesServicio: ordenesServicioPayload.length,
      ordenesServicioArchivadas: 0,
      ordenesServicioBloqueadas: 0,
      jornadasDesactivadas: 0,
      facturacionDesde,
      facturacionHasta,
      historialRepuestosActualizado: historialRepuestos.actualizado,
      historialRepuestosError: historialRepuestos.error,
      consolidacionTecnicaError,
    };
  }

  if (skipServiceOrders) {
    return {
      facturacionLineas: facturacionAceptadas,
      facturacionExcluidas,
      ordenesServicioOmitidas: 0,
      ordenesServicio: 0,
      ordenesServicioArchivadas: 0,
      ordenesServicioBloqueadas: 0,
      jornadasDesactivadas: 0,
      facturacionDesde,
      facturacionHasta,
      historialRepuestosActualizado: historialRepuestos.actualizado,
      historialRepuestosError: historialRepuestos.error,
      consolidacionTecnicaError,
    };
  }

  const { data: osImp, error: osImpError } = await supabase
    .from("importaciones")
    .insert({
      ...bundle.importaciones.ordenesServicio,
      insertados: 0,
      duplicados: 0,
      usuario_id: userId,
      metadata: {
        ...(bundle.importaciones.ordenesServicio.metadata as Record<string, unknown>),
        archivos_relacionados: fileNames,
      } as any,
    } as any)
    .select("id")
    .single();
  if (osImpError) throw postBillingStageError("registro de ordenes de servicio", osImpError);

  let ordenesServicioPersistidas = 0;
  let ordenesServicioCompletadas = 0;
  let loteOrdenesServicio = 0;
  for (let i = 0; i < ordenesServicioPayload.length; i += 500) {
    const chunk = ordenesServicioPayload.slice(i, i + 500).map((row) => ({
      ...row,
      actualizado_en: new Date().toISOString(),
    }));
    loteOrdenesServicio += 1;
    const { error } = await runImportProgressStep({
      callback: onProgress,
      phase: "service-orders.batch",
      sourceFile: fileNames.ordenesServicio ?? undefined,
      operation: "ordenes_servicio_importadas.upsert",
      completed: ordenesServicioCompletadas,
      total: ordenesServicioPayload.length,
      batch: loteOrdenesServicio,
      batchRows: chunk.length,
      resultError: (response: { error?: unknown }) => response.error,
      action: () => (supabase.from("ordenes_servicio_importadas" as any).upsert(chunk as any, {
        onConflict: "os_numero",
      }) as any),
    });
    if (error) {
      if (isMissingOsImportTableError(error)) {
        throw postBillingStageError(
          "persistencia de ordenes de servicio",
          new Error("Falta aplicar la migracion de ordenes de servicio."),
        );
      }
      throw postBillingStageError("persistencia de ordenes de servicio", error);
    }
    ordenesServicioCompletadas += chunk.length;
    ordenesServicioPersistidas += chunk.length;
  }
  const ordenesServicioOmitidas = ordenesServicioPayload.length - ordenesServicioPersistidas;

  // El mismo XML alimenta el detalle de comisiones sin volver a importar
  // clientes, productos, facturacion ni el resumen de la OS. Hasta que la
  // migracion se aplique, esta extension es opcional y no bloquea el flujo
  // historico del importador.
  try {
    await persistCommissionTimeEntries({
      rows: bundle.ordenesServicio.rows,
      importId: osImp.id,
      strict: false,
    });
  } catch (error) {
    throw postBillingStageError("detalle de comisiones", error);
  }

  let ordenesServicioArchivadas = 0;
  let ordenesServicioBloqueadas = 0;
  let jornadasDesactivadas = 0;
  if (RECONCILE_SERVICE_ORDERS_BY_ABSENCE && osWindow.shouldReplace && osWindow.from && osWindow.to) {
    const { data, error } = await (supabase.rpc as any)("ordenes_servicio_reconciliar_snapshot", {
      p_importacion_id: osImp.id,
      p_desde: osWindow.from,
      p_hasta: osWindow.to,
      p_os_numeros: osNumeros,
    });
    if (error) {
      if (missingServiceOrderReconciliation(error)) {
        throw postBillingStageError(
          "reconciliacion de ordenes de servicio",
          new Error("Falta aplicar la migracion de reconciliacion de ordenes de servicio."),
        );
      }
      throw postBillingStageError("reconciliacion de ordenes de servicio", error);
    }

    const reconciliation = (data ?? {}) as Record<string, unknown>;
    ordenesServicioArchivadas = Number(reconciliation.archivadas ?? 0);
    jornadasDesactivadas = Number(reconciliation.jornadas_desactivadas ?? 0);
    ordenesServicioBloqueadas = Number(reconciliation.bloqueadas ?? 0);
  }

  const { error: updateOsImpError } = await supabase
    .from("importaciones")
    .update({
      insertados: ordenesServicioPersistidas,
      duplicados: 0,
    } as any)
    .eq("id", osImp.id);
  if (updateOsImpError) throw postBillingStageError("cierre del registro de ordenes de servicio", updateOsImpError);

  return {
    facturacionLineas: facturacionAceptadas,
    facturacionExcluidas,
    ordenesServicioOmitidas,
    ordenesServicio: ordenesServicioPersistidas,
    ordenesServicioArchivadas,
    ordenesServicioBloqueadas,
    jornadasDesactivadas,
    facturacionDesde,
    facturacionHasta,
    historialRepuestosActualizado: historialRepuestos.actualizado,
    historialRepuestosError: historialRepuestos.error,
    consolidacionTecnicaError,
  };
}
