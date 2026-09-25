import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadWorkLog } from "./workLog";
import { validOperationsRange } from "./data";

export function useWorkLog(from: string, to: string, enabled: boolean, os: string | null = null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["service-orders-work-log", "v1", user?.id, from, to, os],
    enabled: Boolean(user) && enabled && validOperationsRange(from, to),
    queryFn: ({ signal }) => loadWorkLog(supabase, from, to, os, signal),
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
}
