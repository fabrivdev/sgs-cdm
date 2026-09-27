import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadWorkLog } from "./workLog";
import { validOperationsRange } from "./data";
import { productivityPeriod } from "./productivityPeriod";

export function useWorkLog(from: string, to: string, enabled: boolean, os: string | null = null) {
  const { user } = useAuth();
  const period = productivityPeriod(from, to);
  const queryFrom = os === null ? period.from : from;
  const queryTo = os === null ? period.to : to;
  return useQuery({
    queryKey: ["service-orders-work-log", "v1", user?.id, queryFrom, queryTo, os],
    enabled: Boolean(user && queryFrom && queryTo) && enabled && validOperationsRange(from, to),
    queryFn: ({ signal }) => queryFrom && queryTo ? loadWorkLog(supabase, queryFrom, queryTo, os, signal) : Promise.resolve([]),
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
}
