import {
  readReceivablesPreflightFile,
  type ReceivablesPreflight,
} from "@/lib/imports/receivablesPreflight";

export interface ReceivablesRpcError {
  code?: string;
  message?: string;
}

export interface ReceivablesRpcClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: ReceivablesRpcError | null }>;
}

interface ReceivablesBatchResult {
  insertadas?: number;
  sin_cambios?: number;
  conflictos?: number;
  vinculadas?: number;
}

interface ReceivablesLoadStart {
  carga_id: string;
  estado: "VALIDANDO" | "IMPORTANDO" | "COMPLETA";
  reutilizada: boolean;
  snapshot_version: number;
  reemplaza_carga_id: string | null;
}

export interface ReceivablesPersistResult {
  cargaId: string;
  preflight: ReceivablesPreflight;
  lotes: number;
  insertadas: number;
  sinCambios: number;
  vinculadas: number;
  snapshotVersion: number;
  reusedCompleteSnapshot: boolean;
}

class ReceivablesRpcFailure extends Error {
  readonly code?: string;

  constructor(error: ReceivablesRpcError) {
    super(error.message || "Error sin detalle en el RPC de cuentas por cobrar");
    this.code = error.code;
  }
}

async function callRpc<T>(client: ReceivablesRpcClient, name: string, params: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new ReceivablesRpcFailure(error);
  return data as T;
}

async function sha256Hex(file: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error("El navegador no permite calcular SHA-256 para identificar el archivo.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function explainFailure(error: unknown, cargaId: string | null, cancelError: unknown) {
  const failure = error instanceof ReceivablesRpcFailure ? error : null;
  let message = error instanceof Error ? error.message : String(error);
  if (failure?.code === "PGRST202" || failure?.code === "42883") {
    message = "Falta aplicar la migración de cuentas por cobrar antes de confirmar esta fuente.";
  } else if (failure?.code === "42501") {
    message = "El usuario actual no tiene permiso admin.importaciones para importar cuentas por cobrar.";
  } else if (failure?.code === "23505") {
    message = `Cuentas por cobrar contiene una clave del mismo corte ya cargada con otra huella. ${message}`;
  } else if (failure?.code === "23514") {
    message = `La carga de cuentas por cobrar no concilia con el preflight. ${message}`;
  }
  if (cancelError) {
    const cancelMessage = cancelError instanceof Error ? cancelError.message : String(cancelError);
    message += ` No se pudo cancelar automáticamente la carga ${cargaId}: ${cancelMessage}`;
  }
  return new Error(message);
}

export async function persistReceivablesFile(options: {
  file: File;
  client: ReceivablesRpcClient;
  cutoffDate: string;
}): Promise<ReceivablesPersistResult> {
  const { file, client, cutoffDate } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw new Error("Confirmá una fecha de corte válida para cuentas por cobrar.");
  const preflight = await readReceivablesPreflightFile(file, file.name, { cutoffDate, sourceLastModified: file.lastModified });
  const fileSha256 = await sha256Hex(file);
  let cargaId: string | null = null;
  let lotes = 0;
  let insertadas = 0;
  let sinCambios = 0;
  let vinculadas = 0;

  try {
    const started = await callRpc<ReceivablesLoadStart>(client, "totvs_iniciar_cxc_carga_v1", {
      p_metadata: {
        archivo_nombre: file.name,
        archivo_sha256: fileSha256,
        archivo_tamano: file.size,
        fecha_corte: preflight.cutoffDate,
        corte_evidencia: preflight.cutoffEvidence,
      },
    });
    cargaId = started?.carga_id ?? null;
    if (!cargaId) throw new Error("El backend no devolvió el identificador de la carga de cuentas por cobrar.");
    if (started.estado === "COMPLETA") {
      return {
        cargaId,
        preflight,
        lotes: 0,
        insertadas: 0,
        sinCambios: preflight.documentRows,
        vinculadas: preflight.documentRows,
        snapshotVersion: started.snapshot_version,
        reusedCompleteSnapshot: true,
      };
    }

    const persistedPreflight = await readReceivablesPreflightFile(file, file.name, {
      batchSize: 500,
      cutoffDate: preflight.cutoffDate,
      sourceLastModified: file.lastModified,
      onDocumentBatch: async (rows) => {
        const validation = await callRpc<ReceivablesBatchResult>(client, "totvs_importar_cxc_lote_v1", {
          p_carga_id: cargaId,
          p_modo: "validate",
          p_filas: rows,
        });
        if (Number(validation.conflictos ?? 0) > 0) {
          throw new ReceivablesRpcFailure({
            code: "23505",
            message: `${validation.conflictos} claves del mismo corte ya existen con otra huella.`,
          });
        }
        const imported = await callRpc<ReceivablesBatchResult>(client, "totvs_importar_cxc_lote_v1", {
          p_carga_id: cargaId,
          p_modo: "import",
          p_filas: rows,
        });
        lotes += 1;
        insertadas += Number(imported.insertadas ?? 0);
        sinCambios += Number(imported.sin_cambios ?? 0);
        vinculadas += Number(imported.vinculadas ?? 0);
      },
    });

    if (persistedPreflight.documentRows !== preflight.documentRows || persistedPreflight.sourceNetBalance !== preflight.sourceNetBalance) {
      throw new Error("El archivo cambió entre el preflight y la persistencia; volvé a leerlo.");
    }

    await callRpc(client, "totvs_finalizar_cxc_carga_v1", {
      p_carga_id: cargaId,
      p_control: {
        documentos: preflight.documentRows,
        filas_saldo_positivo: preflight.positiveBalanceRows,
        filas_saldo_cero: preflight.zeroBalanceRows,
        filas_saldo_negativo: preflight.negativeBalanceRows,
        valor_bruto: preflight.grossValue,
        saldo_neto_fuente: preflight.sourceNetBalance,
        saldo_positivo: preflight.positiveBalance,
        saldo_negativo: preflight.negativeBalance,
        facturas_elegibles: preflight.eligibleInvoiceRows,
        saldo_pendiente_elegible_usd: preflight.eligiblePendingUsd,
        facturas_vencidas: preflight.overdueInvoiceRows,
        saldo_vencido_usd: preflight.overdueUsd,
        facturas_vence_hoy: preflight.dueTodayInvoiceRows,
        saldo_vence_hoy_usd: preflight.dueTodayUsd,
        facturas_futuras: preflight.futureInvoiceRows,
        saldo_futuro_usd: preflight.futureUsd,
        positivos_no_factura: preflight.excludedPositiveNonInvoiceRows,
        saldo_positivo_no_factura_usd: preflight.excludedPositiveNonInvoiceUsd,
        anticipos_cliente: preflight.customerAdvanceRows,
        saldo_anticipos_cliente_usd: preflight.customerAdvanceBalance,
        anticipos_cliente_saldo_positivo: preflight.customerAdvancePositiveRows,
        saldo_anticipos_positivo_usd: preflight.customerAdvancePositiveBalance,
        anticipos_cliente_saldo_cero: preflight.customerAdvanceZeroRows,
        anticipos_cliente_saldo_negativo: preflight.customerAdvanceNegativeRows,
        saldo_anticipos_negativo_usd: preflight.customerAdvanceNegativeBalance,
        anticipos_cliente_vinculados: preflight.customerAdvanceLinkedRows,
        cobertura_aplicacion_anticipos: preflight.customerAdvanceApplicationCoverage,
      },
    });

    return {
      cargaId,
      preflight,
      lotes,
      insertadas,
      sinCambios,
      vinculadas,
      snapshotVersion: started.snapshot_version,
      reusedCompleteSnapshot: false,
    };
  } catch (error) {
    let cancelError: unknown = null;
    if (cargaId) {
      try {
        await callRpc(client, "totvs_cancelar_cxc_carga_v1", { p_carga_id: cargaId });
      } catch (rollbackError) {
        cancelError = rollbackError;
      }
    }
    throw explainFailure(error, cargaId, cancelError);
  }
}
