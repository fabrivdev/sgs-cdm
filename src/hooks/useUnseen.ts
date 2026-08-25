import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useUnseen() {
  const { user, isAdmin } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let lastNotified = 0;

    const load = async () => {
      const servicesResult = await supabase
        .from("servicios")
        .select("id, visto_por, tecnico_responsable_id, auxiliares")
        .or(`tecnico_responsable_id.eq.${user.id},auxiliares.cs.{${user.id}}`);
      const notificationsResult = isAdmin
        ? await supabase.from("notificaciones")
            .select("id, visto_por")
            .eq("estado", "pendiente")
        : { data: [] };
      const unseenServices = (servicesResult.data ?? [])
        .filter((service: { visto_por: string[] | null }) => !(service.visto_por ?? []).includes(user.id));
      const unseenNotifications = (notificationsResult.data ?? [])
        .filter((notification: { visto_por: string[] | null }) => !(notification.visto_por ?? []).includes(user.id));
      const nextCount = unseenServices.length + unseenNotifications.length;
      setCount(nextCount);
      if (nextCount > lastNotified && lastNotified !== 0) {
        const delta = nextCount - lastNotified;
        toast(delta === 1 ? "Tenés una notificación nueva" : `Tenés ${delta} notificaciones nuevas`);
      }
      lastNotified = nextCount;
    };

    load();
    const channel = supabase
      .channel(`notificaciones-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "servicios" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, user]);

  return count;
}
