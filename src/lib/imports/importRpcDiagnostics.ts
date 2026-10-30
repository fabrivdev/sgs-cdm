import { importErrorFields, runImportProgressStep, type ImportProgressCallback } from "./importProgress";

interface RpcResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status?: number;
  statusText?: string;
}

/** Observe the existing sequential calls; do not retry or change their payloads. */
export function observeImportRpc(
  client: { rpc: (name: string, params: Record<string, unknown>) => PromiseLike<RpcResponse> },
  source: "mayor" | "cxc",
  sourceFile: string,
  callback?: ImportProgressCallback,
) {
  let batch = 1;
  let completed = 0;
  return {
    async rpc(name: string, params: Record<string, unknown>): Promise<RpcResponse> {
      const rows = Array.isArray(params.p_filas) ? params.p_filas.length : undefined;
      const phase = `${source}.${rows !== undefined ? params.p_modo === "validate" ? "validate" : "persist"
        : name.includes("iniciar") ? "start" : name.includes("cancelar") ? "cancel" : "finalize"}`;
      const started = performance.now();
      const context = () => ({ stage: phase, operation: name,
        ...(rows === undefined ? {} : { batch, batchRows: rows }),
        durationMs: Math.max(0, performance.now() - started) });
      const result = await runImportProgressStep({
        callback, phase, sourceFile, operation: name, completed, total: null,
        batch: rows === undefined ? undefined : batch,
        // Validation must not advance the number of persisted rows.
        batchRows: params.p_modo === "import" ? rows : undefined,
        resultError: response => response.error,
        action: async () => {
          try {
            const response = await client.rpc(name, params);
            return response.error ? { ...response, error: {
              ...importErrorFields(response.error), ...context(),
              code: response.error.code, message: response.error.message,
              status: response.status ?? (response.error as Record<string, unknown>).status,
              statusText: response.statusText ?? (response.error as Record<string, unknown>).statusText,
            } } : response;
          } catch (error) {
            const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message : typeof error === "string" ? error : "Error remoto";
            throw Object.assign(new Error(message),
              importErrorFields(error), context());
          }
        },
      });
      if (!result.error && rows !== undefined && params.p_modo === "import") {
        completed += rows;
        batch += 1;
      }
      return result;
    },
  };
}
