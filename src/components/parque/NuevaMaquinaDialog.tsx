import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";
import { ModeloMaquinaSelect } from "./ModeloMaquinaSelect";

type Cliente = { id: string; nombre: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function NuevaMaquinaDialog({ open, onOpenChange, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
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
    (async () => {
      const all: Cliente[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre")
          .range(from, from + pageSize - 1);
        if (error) break;
        const rows = (data ?? []) as Cliente[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      setClientes(all);
    })();
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
    await queryClient.invalidateQueries({ queryKey: ["parque-modelos-catalogo"] });
    toast.success("Máquina creada");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="lg">
      <ResponsiveDrawerHeader>
        <h2 className="text-base font-semibold pr-8">Nueva máquina</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Alta manual al parque del cliente</p>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        <div className="grid gap-5">
          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Identificación</h3>
            <div className="grid gap-1.5">
              <Label className="text-xs">Cliente *</Label>
              <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("w-full justify-between font-normal", !form.cliente_id && "text-muted-foreground")}
                  >
                    {form.cliente_id
                      ? clientes.find((c) => c.id === form.cliente_id)?.nombre
                      : "Seleccionar cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.nombre}
                            onSelect={() => {
                              setForm({ ...form, cliente_id: c.id });
                              setClientePopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.cliente_id === c.id ? "opacity-100" : "opacity-0")} />
                            {c.nombre}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Marca *</Label>
                <Select value={form.marca} onValueChange={(v) => setForm({ ...form, marca: v as Marca, modelo_tipo: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Subgrupo</Label>
                <Select value={form.subgrupo} onValueChange={(v) => setForm({ ...form, subgrupo: v, modelo_tipo: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_SUBGROUPS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Datos de la máquina</h3>
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
              <Label className="text-xs">Modelo</Label>
              <ModeloMaquinaSelect
                marca={form.marca}
                subgrupo={form.subgrupo}
                value={form.modelo_tipo}
                onValueChange={(modelo_tipo) => setForm({ ...form, modelo_tipo })}
              />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ubicación</h3>
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
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Comercial</h3>
            <div className="grid gap-1.5">
              <Label className="text-xs">Vendedor</Label>
              <Input value={form.vendedor} onChange={(e) => setForm({ ...form, vendedor: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Notas</Label>
              <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </section>
        </div>
      </ResponsiveDrawerBody>
      <ResponsiveDrawerFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
        <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Crear máquina"}</Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );


}
