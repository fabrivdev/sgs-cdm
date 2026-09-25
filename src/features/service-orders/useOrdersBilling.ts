import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { billingKey, loadOrderBilling } from "./billing";

/** Independent cache for exactly the displayed OS population, not the loader's history. */
export function useOrdersBilling(orders: readonly string[], cutoff: string, enabled: boolean) {
  const { user } = useAuth();
  const keys = [...new Set(orders.map(billingKey))].sort();
  return useQuery({
    queryKey: ["service-orders-billing", "os-tariffs-v2", user?.id, cutoff, keys],
    enabled: Boolean(user) && enabled && keys.length > 0,
    queryFn: ({ signal }) => loadOrderBilling(supabase, keys, cutoff, signal),
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
}
