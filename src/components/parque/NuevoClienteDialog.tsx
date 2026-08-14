import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SUCURSALES, type Sucursal } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function NuevoClienteDialog({ open, onOpenChange, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [sucursal, setSucursal] = useState<Sucursal | "">("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNombre("");
    setSucursal("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("clientes")
      .insert({ nombre: nombre.trim(), sucursal: sucursal || null });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cliente creado");
    handleOpenChange(false);
    onCreated?.();
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={handleOpenChange} size="sm">
      <ResponsiveDrawerHeader><div className="text-[14px] font-semibold">Nuevo cliente</div></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Nombre *</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del cliente"
              onKeyDown={(e) => e.key === "Enter" && guardar()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Sucursal principal (opcional)</Label>
            <Select value={sucursal || "none"} onValueChange={(v) => setSucursal(v === "none" ? "" : (v as Sucursal))}>
              <SelectTrigger>
                <SelectValue placeholder="— Ninguna —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Ninguna —</SelectItem>
                {SUCURSALES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </ResponsiveDrawerBody>
      <ResponsiveDrawerFooter>
        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
        <Button onClick={guardar} disabled={saving || !nombre.trim()}>
          {saving ? "Guardando…" : "Crear cliente"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
