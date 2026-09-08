import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "./useCatalogos";
import type { MachineCatalog, MachineCatalogBrand, MachineCatalogModel, MachineCatalogAlias } from "@/lib/machineOrderValidation";

export function useMachineCatalog(enabled = true) {
  return useQuery({
    queryKey: ["machine-catalog-review"], enabled, staleTime: 30_000,
    queryFn: async (): Promise<MachineCatalog> => {
      const [brands, models, aliases] = await Promise.all([
        cargarTodo<MachineCatalogBrand>(supabase.from("maquinaria_marcas_catalogo").select("nombre,activa").order("nombre")),
        cargarTodo<MachineCatalogModel>(supabase.from("parque_modelos_catalogo").select("id,nombre,marca_nombre,subgrupo,activo").order("id")),
        cargarTodo<MachineCatalogAlias>(supabase.from("parque_modelos_alias").select("marca,alias,modelo_catalogo_id").order("id")),
      ]);
      return { brands, models, aliases };
    },
  });
}
