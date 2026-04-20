import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useUnseen() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let lastNotified = 0;

    const load = async () => {
      const { data } = await supabase
        .from("servicios")
        .select("id, visto_por, tecnico_responsable_id, auxiliares")
        .or(`tecnico_responsable_id.eq.${user.id},auxiliares.cs.{${user.id}}`);
      const unseen = (data ?? []).filter((s: { visto_por: string[] | null }) => !(s.visto_por ?? []).includes(user.id));
      setCount(unseen.length);
      if (unseen.length > lastNotified && lastNotified !== 0) {
        toast(`Tenés ${unseen.length} servicio(s) nuevo(s) asignado(s)`);
      }
      lastNotified = unseen.length;
    };

    load();
    const channel = supabase
      .channel("servicios-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "servicios" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return count;
}
