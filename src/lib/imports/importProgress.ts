export type ImportProgressStatus = "started" | "succeeded" | "failed";

export interface ImportProgressEvent {
  phase: string;
  sourceFile?: string;
  operation?: string;
  status: ImportProgressStatus;
  completed: number;
  total: number | null;
  durationMs: number;
  batch?: number;
  batchRows?: number;
  error?: string;
}

export type ImportProgressCallback = (event: ImportProgressEvent) => void;

/** Only diagnostics: never copy request objects, headers or credentials. */
export function importErrorFields(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {};
  const source = error as Record<string, unknown>;
  return Object.fromEntries([
    "code", "details", "hint", "status", "statusText", "stage", "operation", "batch", "batchRows", "durationMs",
  ].filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}

const safeErrorField = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

/**
 * Conserva el diagnostico util de errores remotos sin serializar el objeto
 * completo (que puede contener request, headers o contexto sensible).
 */
export function describeImportError(error: unknown, stage?: string): string {
  const parts: string[] = [];
  const fields = importErrorFields(error);
  stage = safeErrorField(fields.stage) || stage;
  if (stage?.trim()) parts.push(`Etapa: ${stage.trim()}`);

  if (error instanceof Error) {
    const message = safeErrorField(error.message) || safeErrorField(error.name);
    if (message.startsWith("Etapa: ")) return message;
    return describeImportError({ ...fields, message }, stage);
  }
  if (typeof error === "string") {
    if (error.trim()) parts.push(error.trim());
    return parts.join(" | ") || "Error desconocido";
  }
  if (!error || typeof error !== "object") {
    const value = safeErrorField(error);
    if (value) parts.push(value);
    return parts.join(" | ") || "Error desconocido";
  }

  const remote = error as Record<string, unknown>;
  const code = safeErrorField(remote.code);
  const message = safeErrorField(remote.message);
  const details = safeErrorField(remote.details);
  const hint = safeErrorField(remote.hint);
  const status = safeErrorField(remote.status);
  const statusText = safeErrorField(remote.statusText);
  if (code) parts.push(`Codigo: ${code}`);
  if (message) parts.push(message);
  if (details) parts.push(`Detalle: ${details}`);
  if (hint) parts.push(`Sugerencia: ${hint}`);
  if (status || statusText) parts.push(`HTTP: ${[status, statusText].filter(Boolean).join(" ")}`);
  if (remote.operation) parts.push(`RPC: ${safeErrorField(remote.operation)}`);
  if (remote.batch != null) parts.push(`Lote: ${safeErrorField(remote.batch)}`);
  if (remote.batchRows != null) parts.push(`Filas: ${safeErrorField(remote.batchRows)}`);
  if (typeof remote.durationMs === "number" && Number.isFinite(remote.durationMs)) {
    parts.push(`Duracion: ${Math.round(remote.durationMs)} ms`);
  }

  if (parts.length === (stage?.trim() ? 1 : 0)) parts.push("Error remoto sin detalle legible");
  return parts.join(" | ");
}

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export function emitImportProgress(
  callback: ImportProgressCallback | undefined,
  event: ImportProgressEvent,
) {
  if (!callback) return;
  try {
    callback(event);
  } catch {
    // El progreso es observacional: nunca puede cambiar la importacion.
  }
}

export async function runImportProgressStep<T>(options: {
  callback?: ImportProgressCallback;
  phase: string;
  sourceFile?: string;
  operation?: string;
  completed: number;
  total: number | null;
  batch?: number;
  batchRows?: number;
  action: () => Promise<T> | PromiseLike<T>;
  resultError?: (result: T) => unknown;
}): Promise<T> {
  const startedAt = monotonicNow();
  emitImportProgress(options.callback, {
    phase: options.phase,
    sourceFile: options.sourceFile,
    operation: options.operation,
    status: "started",
    completed: options.completed,
    total: options.total,
    durationMs: 0,
    batch: options.batch,
    batchRows: options.batchRows,
  });

  try {
    const result = await options.action();
    const reportedError = options.resultError?.(result);
    if (reportedError) {
      emitImportProgress(options.callback, {
        phase: options.phase,
        sourceFile: options.sourceFile,
        operation: options.operation,
        status: "failed",
        completed: options.completed,
        total: options.total,
        durationMs: Math.max(monotonicNow() - startedAt, 0),
        batch: options.batch,
        batchRows: options.batchRows,
        error: describeImportError(reportedError, options.phase),
      });
      return result;
    }
    emitImportProgress(options.callback, {
      phase: options.phase,
      sourceFile: options.sourceFile,
      operation: options.operation,
      status: "succeeded",
      completed: options.completed + (options.batchRows ?? 0),
      total: options.total,
      durationMs: Math.max(monotonicNow() - startedAt, 0),
      batch: options.batch,
      batchRows: options.batchRows,
    });
    return result;
  } catch (error) {
    emitImportProgress(options.callback, {
      phase: options.phase,
      sourceFile: options.sourceFile,
      operation: options.operation,
      status: "failed",
      completed: options.completed,
      total: options.total,
      durationMs: Math.max(monotonicNow() - startedAt, 0),
      batch: options.batch,
      batchRows: options.batchRows,
      error: describeImportError(error, options.phase),
    });
    throw error;
  }
}
