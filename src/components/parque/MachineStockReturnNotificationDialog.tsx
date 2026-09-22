import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, PackageCheck, Tractor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AppNotification } from "@/lib/notifications";
import { machineStockReturnNotificationData } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
} from "@/components/ui/responsive-drawer";

interface Props {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

function value(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "—";
}

export function MachineStockReturnNotificationDialog({ notification, open, onOpenChange, onResolved }: Props) {
  const [saving, setSaving] = useState(false);
  const data = useMemo(
    () => (notification ? machineStockReturnNotificationData(notification) : {}),
    [notification],
  );

  const confirm = async () => {
    if (!notification) return;
    setSaving(true);
    const { error } = await supabase.rpc("confirmar_notificacion_ingreso_stock_parque", {
      p_notificacion_id: notification.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ingreso a Stock confirmado");
    onResolved();
    onOpenChange(false);
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="md">
      <ResponsiveDrawerHeader>
        <div className="flex items-center gap-2 pr-8">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold">Confirmar ingreso a Stock</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">El mismo chasis sigue activo en el Parque de un cliente.</p>
          </div>
        </div>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody>
        <div className="grid gap-4">
          <section className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <Tractor className="h-4 w-4 text-primary" />
              {value(data.stock_modelo ?? data.parque_modelo)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Chasis</span><span className="truncate text-right font-mono text-foreground">{value(data.chasis)}</span>
              <span>Marca</span><span className="truncate text-right text-foreground">{value(data.stock_marca ?? data.parque_marca)}</span>
              <span>Propietario actual</span><span className="truncate text-right text-foreground">{value(data.cliente_nombre)}</span>
              <span>Sucursal del Parque</span><span className="truncate text-right text-foreground">{value(data.parque_sucursal)}</span>
            </div>
          </section>

          <section className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3 text-[12px] font-medium">
              <span className="truncate">{value(data.cliente_nombre)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0">Campos del Mañana</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
              <span>Sucursal de Stock</span><span className="truncate text-right text-foreground">{value(data.stock_sucursal)}</span>
              <span>Depósito</span><span className="truncate text-right text-foreground">{value(data.stock_deposito)}</span>
              <span>Condición</span><span className="truncate text-right text-foreground">Usada</span>
              <span>Saldo detectado</span><span className="truncate text-right text-foreground">{value(data.saldo_actual)}</span>
            </div>
          </section>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Confirmar desactiva la pertenencia activa al cliente y vincula esta unidad con Stock como parte de pago. Hasta entonces no se realiza ningún movimiento.</p>
          </div>
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Mantener pendiente</Button>
        <Button onClick={confirm} disabled={saving}>{saving ? "Confirmando..." : "Confirmar ingreso"}</Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
