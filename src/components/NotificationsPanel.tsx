import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type ServicioNotificacion = {
  id: string;
  fecha_programada: string | null;
  trabajo_descripcion: string | null;
  visto_por: string[] | null;
};

export function NotificationsPanel({ count }: { count: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ServicioNotificacion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("servicios")
      .select("id, fecha_programada, trabajo_descripcion, visto_por, tecnico_responsable_id, auxiliares")
      .or(`tecnico_responsable_id.eq.${user.id},auxiliares.cs.{${user.id}}`)
      .order("fecha_programada", { ascending: true })
      .limit(12);

    if (!error) {
      setItems(((data ?? []) as ServicioNotificacion[]).filter((s) => !(s.visto_por ?? []).includes(user.id)));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open, user?.id]);

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] tabular-nums">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-2">
        <div className="px-2 py-1.5 text-sm font-semibold">Notificaciones</div>
        {loading ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">No tenes servicios pendientes de ver.</div>
        ) : (
          <div className="max-h-[360px] space-y-1 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full rounded-md px-2 py-2 text-left hover:bg-accent"
                onClick={() => openServicio(item)}
              >
                <div className="text-xs font-medium line-clamp-2">
                  {item.trabajo_descripcion ?? "Servicio asignado"}
                </div>
                {item.fecha_programada && (
                  <div className="mt-1 text-[11px] text-muted-foreground">{item.fecha_programada}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
