import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";

const SUBGRUPOS = [
  "COSECHADORAS", "SEMBRADORAS", "PICADORAS", "PLATAFORMAS",
  "PULVERIZADORAS", "TRACTORES", "OTRO",
] as const;

type Cliente = { id: string; nombre: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function NuevaMaquinaDialog({ open, onOpenChange, onCreated }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    cliente_id: string;
    marca: Marca;
    subgrupo: string;
    modelo_tipo: string;
    serie: string;
    anio: string;
    sucursal: string;
    localidad: string;
    vendedor: string;
    notas: string;
  }>({
    cliente_id: "",
    marca: "CLAAS",
    subgrupo: "OTRO",
    modelo_tipo: "",
    serie: "",
    anio: "",
    sucursal: "",
    localidad: "",
    vendedor: "",
    notas: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      cliente_id: "",
      marca: "CLAAS",
      subgrupo: "OTRO",
      modelo_tipo: "",
      serie: "",
      anio: "",
      sucursal: "",
      localidad: "",
      vendedor: "",
      notas: "",
    }));
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setClientes((data ?? []) as Cliente[]));
  }, [open]);

  const guardar = async () => {
    if (!form.cliente_id) return toast.error("Seleccioná un cliente");
    if (!form.serie.trim()) return toast.error("Número de serie requerido");
    setSaving(true);
    const { error } = await supabase.from("parque_maquinas").insert({
      cliente_id: form.cliente_id,
      marca: form.marca,
      subgrupo: form.subgrupo as never,
      modelo_tipo: form.modelo_tipo || null,
      serie: form.serie.trim(),
      anio: form.anio ? Number(form.anio) : null,
      sucursal: (form.sucursal || null) as Sucursal | null,
      localidad: form.localidad || null,
      vendedor: form.vendedor || null,
      notas: form.notas || null,
      agregado_manualmente: true,
      activo: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Máquina creada");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva máquina</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Cliente *</Label>
            <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Marca *</Label>
              <Select value={form.marca} onValueChange={(v) => setForm({ ...form, marca: v as Marca })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Subgrupo</Label>
              <Select value={form.subgrupo} onValueChange={(v) => setForm({ ...form, subgrupo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBGRUPOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">N° de serie *</Label>
              <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Año</Label>
              <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Modelo / Tipo</Label>
            <Input value={form.modelo_tipo} onChange={(e) => setForm({ ...form, modelo_tipo: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Sucursal</Label>
              <Select value={form.sucursal || "none"} onValueChange={(v) => setForm({ ...form, sucursal: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin sucursal —</SelectItem>
                  {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Localidad</Label>
              <Input value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Vendedor</Label>
            <Input value={form.vendedor} onChange={(e) => setForm({ ...form, vendedor: e.target.value })} />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Notas</Label>
            <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Crear máquina"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
