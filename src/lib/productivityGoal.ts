export const PRODUCTIVITY_GOAL_KEY = "meta_horas_mensual_tecnico";

export type ProductivityGoal = {
  value: number | null;
  warning: string | null;
  reason: "ready" | "schema" | "access" | "not-visible" | "invalid" | "read-error";
};

/** Shared by Parameters and OS: an unreadable value is never a saved default. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readProductivityGoal(client: any, signal?: AbortSignal): Promise<ProductivityGoal> {
  try {
    signal?.throwIfAborted();
    const request = client.from("app_configuracion").select("valor_numero")
      .eq("clave", PRODUCTIVITY_GOAL_KEY).maybeSingle();
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    signal?.throwIfAborted();
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return { value: null, reason: "schema", warning: "Falta habilitar la configuración de productividad en la base." };
      if (["42501", "PGRST301"].includes(error.code)) return { value: null, reason: "access", warning: "Sin permiso para leer la meta de productividad." };
      return { value: null, reason: "read-error", warning: "No se pudo leer la meta de productividad." };
    }
    // RLS may hide a row without an error. Do not assert it was never configured.
    if (!data) return { value: null, reason: "not-visible", warning: "Meta de productividad no disponible para este usuario." };
    const value = typeof data.valor_numero === "number" || typeof data.valor_numero === "string" ? Number(data.valor_numero) : NaN;
    if (!Number.isFinite(value) || value <= 0) return { value: null, reason: "invalid", warning: "La meta guardada no es válida." };
    return { value, reason: "ready", warning: null };
  } catch {
    signal?.throwIfAborted();
    return { value: null, reason: "read-error", warning: "No se pudo leer la meta de productividad." };
  }
}
