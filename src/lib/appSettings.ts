import { supabase } from "@/integrations/supabase/client";

export const PRODUCTIVITY_GOAL_KEY = "meta_horas_mensual_tecnico";
export const DEFAULT_MONTHLY_PRODUCTIVITY_GOAL = 132;

export async function loadMonthlyProductivityGoal(): Promise<number> {
  // This table is introduced by the matching migration and is not yet in generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("app_configuracion")
    .select("valor_numero")
    .eq("clave", PRODUCTIVITY_GOAL_KEY)
    .maybeSingle();

  if (error) return DEFAULT_MONTHLY_PRODUCTIVITY_GOAL;
  const value = Number(data?.valor_numero);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONTHLY_PRODUCTIVITY_GOAL;
}

export async function saveMonthlyProductivityGoal(value: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("app_configuracion").upsert({
    clave: PRODUCTIVITY_GOAL_KEY,
    valor_numero: value,
    descripcion: "Meta mensual de horas registradas por tecnico",
    actualizado_en: new Date().toISOString(),
  });
  if (error) throw error;
}
