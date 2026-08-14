import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Sucursal } from "@/lib/constants";

export interface ServicioTecnico {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

export function useServicioTecnicos(enabled = true) {
  return useQuery({
    queryKey: ["servicios", "tecnicos-activos"],
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ServicioTecnico[]> => {
      const { data, error } = await (supabase.rpc as any)("servicios_listar_tecnicos_activos");
      if (error) throw error;
      return ((data ?? []) as ServicioTecnico[]).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    },
  });
}
