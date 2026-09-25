import { supabase } from "@/integrations/supabase/client";
import { PRODUCTIVITY_GOAL_KEY, readProductivityGoal } from "./productivityGoal";

export { PRODUCTIVITY_GOAL_KEY } from "./productivityGoal";
export const loadProductivityGoalSetting = () => readProductivityGoal(supabase);

export async function loadMonthlyProductivityGoal(): Promise<number> {
  return (await loadProductivityGoalSetting()).value ?? 0;
}

export async function saveMonthlyProductivityGoal(value: number): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error("La meta mensual debe ser mayor que cero");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("app_configuracion").upsert({
    clave: PRODUCTIVITY_GOAL_KEY,
    valor_numero: value,
    descripcion: "Meta mensual de horas registradas por tecnico",
    actualizado_en: new Date().toISOString(),
  });
  if (error) throw error;
  // Confirm through the same reader used by Orders; a successful write alone
  // does not prove the setting is visible to this session.
  const saved = await loadProductivityGoalSetting();
  if (saved.value === null) throw new Error("No se pudo verificar la meta guardada. Reintentá la lectura.");
  if (saved.value !== value) throw new Error("La meta leída no coincide con la guardada. Reintentá la lectura.");
}
