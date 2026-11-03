import { supabase } from "@/integrations/supabase/client";

export type ServiceDetailMachine = {
  chasis_clave: string; marca_parque: string | null; modelo_tipo: string | null;
};
const chassisKey = (value: string | null) => (value ?? "").replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();

// Existing canonical identity resolves park/stock priority and ambiguous values.
// Read only the exported chassis, once per batch; never join financial rows.
export async function loadServiceDetailMachines<T extends { chasis: string | null }>(rows: readonly T[]) {
  const keys = [...new Set(rows.map(row => chassisKey(row.chasis)).filter(Boolean))];
  const machines = new Map<string, ServiceDetailMachine>();
  for (let offset = 0; offset < keys.length; offset += 100) {
    const { data, error } = await supabase.rpc("ventas_servicios_maquinas_identidad")
      .in("chasis_clave", keys.slice(offset, offset + 100)).order("chasis_clave").range(0, 99);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Respuesta de identidad de maquinas invalida.");
    for (const machine of data) {
      if (machines.has(machine.chasis_clave)) throw new Error("Identidad de maquina duplicada.");
      machines.set(machine.chasis_clave, machine);
    }
  }
  return rows.map(row => {
    const machine = machines.get(chassisKey(row.chasis));
    return { ...row, marca_maquina: machine?.marca_parque || null, modelo_maquina: machine?.modelo_tipo || null };
  });
}
