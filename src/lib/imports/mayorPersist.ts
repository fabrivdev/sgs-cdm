import { readMayorPreflightFile, type MayorPreflight } from "@/lib/imports/mayorPreflight";

export interface MayorRpcError {
  code?: string;
  message?: string;
}

export interface MayorRpcClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: MayorRpcError | null }>;
}

interface MayorBatchResult {
  total?: number;
  insertadas?: number;
  sin_cambios?: number;
  conflictos?: number;
  cuarentena?: number;
  vinculadas?: number;
}

export interface MayorPersistResult {
  cargaId: string;
  preflight: MayorPreflight;
  lotes: number;
  insertadas: number;
  sinCambios: number;
  vinculadas: number;
  cuarentena: number;
}

class MayorRpcFailure extends Error {
  readonly code?: string;

  constructor(error: MayorRpcError) {
    super(error.message || "Error sin detalle en el RPC del Libro Mayor");
    this.code = error.code;
  }
}

async function callRpc<T>(client: MayorRpcClient, name: string, params: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw new MayorRpcFailure(error);
  return data as T;
}

async function sha256Hex(file: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error("El navegador no permite calcular SHA-256 para identificar el archivo.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function explainFailure(error: unknown, cargaId: string | null, cancelError: unknown) {
  const failure = error instanceof MayorRpcFailure ? error : null;
  let message = error instanceof Error ? error.message : String(error);
  if (failure?.code === "PGRST202" || failure?.code === "42883") {
    message = "Falta aplicar la migración del Libro Mayor antes de confirmar esta fuente.";
  } else if (failure?.code === "42501") {
    message = "El usuario actual no tiene permiso admin.importaciones para importar el Libro Mayor.";
  } else if (failure?.code === "23505") {
    message = `El Libro Mayor contiene una clave ya cargada con otra huella. ${message}`;
  } else if (failure?.code === "23514") {
    message = `El Libro Mayor no concilia con sus controles. ${message}`;
  }
  if (cancelError) {
    const cancelMessage = cancelError instanceof Error ? cancelError.message : String(cancelError);
    message += ` No se pudo cancelar automáticamente la carga ${cargaId}: ${cancelMessage}`;
  }
  return new Error(message);
}

export async function persistMayorFile(options: {
  file: File;
  client: MayorRpcClient;
}): Promise<MayorPersistResult> {
  const { file, client } = options;
  const fileSha256 = await sha256Hex(file);
  let cargaId: string | null = null;
  let lotes = 0;
  let insertadas = 0;
  let sinCambios = 0;
  let vinculadas = 0;
  let cuarentena = 0;

  try {
    cargaId = await callRpc<string>(client, "totvs_iniciar_mayor_carga_v1", {
      p_metadata: {
        archivo_nombre: file.name,
        archivo_sha256: fileSha256,
        archivo_tamano: file.size,
      },
    });
    if (!cargaId) throw new Error("El backend no devolvió el identificador de la carga del Mayor.");

    const preflight = await readMayorPreflightFile(file, file.name, {
      batchSize: 500,
      onMovementBatch: async (rows) => {
        const validation = await callRpc<MayorBatchResult>(client, "totvs_importar_mayor_lote_v1", {
          p_carga_id: cargaId,
          p_modo: "validate",
          p_filas: rows,
        });
        if (Number(validation.conflictos ?? 0) > 0) {
          throw new MayorRpcFailure({
            code: "23505",
            message: `${validation.conflictos} claves ya existen con otra huella.`,
          });
        }

        const imported = await callRpc<MayorBatchResult>(client, "totvs_importar_mayor_lote_v1", {
          p_carga_id: cargaId,
          p_modo: "import",
          p_filas: rows,
        });
        lotes += 1;
        insertadas += Number(imported.insertadas ?? 0);
        sinCambios += Number(imported.sin_cambios ?? 0);
        vinculadas += Number(imported.vinculadas ?? 0);
        cuarentena += Number(imported.cuarentena ?? 0);
      },
    });

    await callRpc(client, "totvs_finalizar_mayor_carga_v1", {
      p_carga_id: cargaId,
      p_control: {
        movimientos: preflight.movementRows,
        aperturas: preflight.openings,
        filas_tpsldo_1: preflight.tpsldo["1"]?.rows ?? 0,
        filas_tpsldo_9: preflight.tpsldo["9"]?.rows ?? 0,
        cuarentena: preflight.missing.account,
        neto_tpsldo_1_pyg: preflight.tpsldo["1"]?.amountPyg ?? 0,
        neto_tpsldo_1_usd: preflight.tpsldo["1"]?.amountUsd ?? 0,
        neto_tpsldo_9_pyg: preflight.tpsldo["9"]?.amountPyg ?? 0,
        neto_tpsldo_9_usd: preflight.tpsldo["9"]?.amountUsd ?? 0,
      },
    });

    return { cargaId, preflight, lotes, insertadas, sinCambios, vinculadas, cuarentena };
  } catch (error) {
    let cancelError: unknown = null;
    if (cargaId) {
      try {
        await callRpc(client, "totvs_cancelar_mayor_carga_v1", { p_carga_id: cargaId });
      } catch (rollbackError) {
        cancelError = rollbackError;
      }
    }
    throw explainFailure(error, cargaId, cancelError);
  }
}
