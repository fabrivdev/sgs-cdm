export type ImportProgressStatus = "started" | "succeeded" | "failed";

export interface ImportProgressEvent {
  phase: string;
  sourceFile?: string;
  status: ImportProgressStatus;
  completed: number;
  total: number | null;
  batch?: number;
  error?: string;
}

export type ImportProgressCallback = (event: ImportProgressEvent) => void;

export function emitImportProgress(
  callback: ImportProgressCallback | undefined,
  event: ImportProgressEvent,
) {
  if (!callback) return;
  try {
    callback(event);
  } catch {
    // El progreso es observacional y nunca altera la importacion.
  }
}
