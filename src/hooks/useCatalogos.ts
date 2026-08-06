import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

export async function cargarTodo<T>(qb: any): Promise<T[]> {
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await qb.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export function useClientesCatalogo() {
  return useQuery({
    queryKey: ["catalogos", "clientes"],
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      cargarTodo(
        supabase
          .from("clientes")
          .select("id, nombre, sucursal")
          .order("nombre", { ascending: true }),
      ),
  });
}

export function useProfilesCatalogo() {
  return useQuery({
    queryKey: ["catalogos", "profiles"],
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      cargarTodo(
        supabase
          .from("profiles")
          .select("id, nombre, sucursal")
          .order("nombre", { ascending: true }),
      ),
  });
}

export function useUserRolesCatalogo() {
  return useQuery({
    queryKey: ["catalogos", "user_roles"],
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      cargarTodo(
        supabase
          .from("user_roles")
          .select("user_id, role"),
      ),
  });
}
