import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadOperationsData, validOperationsRange } from "./data";

export function useServiceOrders(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["service-orders", user?.id, from, to],
    enabled: Boolean(user) && validOperationsRange(from, to),
    queryFn: ({ signal }) => loadOperationsData(supabase, from, to, signal),
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
}
