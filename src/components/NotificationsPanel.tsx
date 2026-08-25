import { useCallback, useEffect, useState } from "react";
import { Bell, BriefcaseBusiness, Tractor } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AppNotification } from "@/lib/notifications";
import { MachineSaleNotificationDialog } from "@/components/parque/MachineSaleNotificationDialog";

type ServicioNotificacion = {
  id: string;
  fecha_programada: string | null;
  trabajo_descripcion: string | null;
  visto_por: string[] | null;
};

export function NotificationsPanel({ count }: { count: number }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [serviceItems, setServiceItems] = useState<ServicioNotificacion[]>([]);
  const [appItems, setAppItems] = useState<AppNotification[]>([]);
  const [selectedMachineAlert, setSelectedMachineAlert] = useState<AppNotification | null>(null);
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const servicesPromise = supabase
      .from("servicios")
      .select("id, fecha_programada, trabajo_descripcion, visto_por, tecnico_responsable_id, auxiliares")
      .or(`tecnico_responsable_id.eq.${user.id},auxiliares.cs.{${user.id}}`)
      .order("fecha_programada", { ascending: true })
      .limit(12);
    const notificationsPromise = isAdmin
      ? supabase.from("notificaciones")
          .select("id, tipo, titulo, mensaje, datos, estado, visto_por, creado_en")
          .eq("estado", "pendiente")
          .order("creado_en", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], error: null });

    const [servicesResult, notificationsResult] = await Promise.all([servicesPromise, notificationsPromise]);
    if (!servicesResult.error) {
      setServiceItems(
        ((servicesResult.data ?? []) as ServicioNotificacion[])
          .filter((service) => !(service.visto_por ?? []).includes(user.id)),
      );
    }
    if (!notificationsResult.error) {
      setAppItems((notificationsResult.data ?? []) as AppNotification[]);
    }
    setLoading(false);
  }, [isAdmin, user]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const openServicio = async (servicio: ServicioNotificacion) => {
    if (user && !(servicio.visto_por ?? []).includes(user.id)) {
      await supabase
        .from("servicios")
        .update({ visto_por: [...(servicio.visto_por ?? []), user.id] })
        .eq("id", servicio.id);
    }
    setOpen(false);
    navigate(`/?servicio=${servicio.id}`);
  };

  const openMachineAlert = async (notification: AppNotification) => {
    if (user && !(notification.visto_por ?? []).includes(user.id)) {
      await supabase.rpc("notificaciones_marcar_vista", {
        p_notificacion_id: notification.id,
      });
    }
    setSelectedMachineAlert(notification);
    setOpen(false);
    setMachineDialogOpen(true);
  };

  const totalItems = serviceItems.length + appItems.length;
  const unseenAppItems = appItems.filter((item) => !(item.visto_por ?? []).includes(user?.id ?? "")).length;
  const unseenItems = serviceItems.length + unseenAppItems;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
            <Bell className="h-4 w-4" />
            {count > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] tabular-nums">
                {count > 99 ? "99+" : count}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[13px] font-semibold">Notificaciones</span>
            {totalItems > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {totalItems} pendientes{unseenItems > 0 ? ` · ${unseenItems} sin leer` : ""}
              </span>
            )}
          </div>
          {loading ? (
            <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">Cargando...</div>
          ) : totalItems === 0 ? (
            <div className="px-2 py-8 text-center text-[12px] text-muted-foreground">No hay notificaciones pendientes.</div>
          ) : (
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {appItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full gap-2.5 rounded-lg border border-transparent px-2 py-2.5 text-left hover:border-primary/15 hover:bg-primary/5"
                  onClick={() => openMachineAlert(item)}
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <Tractor className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium">
                      {!(item.visto_por ?? []).includes(user?.id ?? "") && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />
                      )}
                      <span>{item.titulo}</span>
                    </span>
                    {item.mensaje && <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">{item.mensaje}</span>}
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-primary">Parque · Revisar alta</span>
                  </span>
                </button>
              ))}
              {serviceItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-accent"
                  onClick={() => openServicio(item)}
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <BriefcaseBusiness className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block line-clamp-2 text-[12px] font-medium">{item.trabajo_descripcion ?? "Servicio asignado"}</span>
                    {item.fecha_programada && <span className="mt-1 block text-[11px] text-muted-foreground">{item.fecha_programada}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <MachineSaleNotificationDialog
        notification={selectedMachineAlert}
        open={machineDialogOpen}
        onOpenChange={setMachineDialogOpen}
        onResolved={() => {
          setSelectedMachineAlert(null);
          void load();
        }}
      />
    </>
  );
}
