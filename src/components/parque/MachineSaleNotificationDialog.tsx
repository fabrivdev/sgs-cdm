import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileText, Tractor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AppNotification } from "@/lib/notifications";
import { machineSaleNotificationData } from "@/lib/notifications";
import { MARCAS, SUCURSALES, type Marca, type Sucursal } from "@/lib/constants";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
} from "@/components/ui/responsive-drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModeloMaquinaSelect } from "./ModeloMaquinaSelect";

type Cliente = { id: string; nombre: string };

interface Props {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

type FormState = {
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
};

const emptyForm: FormState = {
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
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-PY");
}

export function MachineSaleNotificationDialog({ notification, open, onOpenChange, onResolved }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const data = useMemo(
    () => (notification ? machineSaleNotificationData(notification) : {}),
    [notification],
  );

  useEffect(() => {
    if (!open || !notification) return;
    setForm({
      ...emptyForm,
      cliente_id: data.cliente_id ?? "",
      marca: data.marca === "HORSCH" ? "HORSCH" : "CLAAS",
      subgrupo: MACHINE_SUBGROUPS.includes(data.subgrupo as (typeof MACHINE_SUBGROUPS)[number])
        ? String(data.subgrupo)
        : "OTRO",
      modelo_tipo: data.modelo_tipo ?? "",
      serie: data.chasis ?? "",
      anio: "",
      sucursal: data.sucursal ?? "",
      notas: `Alta sugerida desde la factura ${data.factura ?? "sin número"}`,
    });

    void (async () => {
      const rows: Cliente[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await supabase
          .from("clientes")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre")
          .range(from, from + pageSize - 1);
        if (error) {
          toast.error("No se pudo cargar el listado de clientes");
          break;
        }
        const typedPage = (page ?? []) as Cliente[];
        rows.push(...typedPage);
        if (typedPage.length < pageSize) break;
      }
      setClientes(rows);
    })();
  }, [data, notification, open]);

  const selectedClient = clientes.find((client) => client.id === form.cliente_id)?.nombre
    ?? data.cliente_nombre
    ?? "";

  const confirm = async () => {
    if (!notification) return;
    if (!form.cliente_id) return toast.error("Seleccioná el cliente de la máquina");
    if (!form.serie.trim()) return toast.error("Verificá el chasis antes de confirmar");
    setSaving(true);
    const { error } = await supabase.rpc("confirmar_notificacion_alta_maquina", {
      p_notificacion_id: notification.id,
      p_cliente_id: form.cliente_id,
      p_marca: form.marca,
      p_subgrupo: form.subgrupo as (typeof MACHINE_SUBGROUPS)[number],
      p_modelo_tipo: form.modelo_tipo || null,
      p_serie: form.serie.trim(),
      p_anio: form.anio ? Number(form.anio) : null,
      p_sucursal: (form.sucursal || undefined) as Sucursal | undefined,
      p_localidad: form.localidad || null,
      p_vendedor: form.vendedor || null,
      p_notas: form.notas || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Máquina incorporada al parque");
    onResolved();
    onOpenChange(false);
  };

  const discard = async () => {
    if (!notification) return;
    setSaving(true);
    const { error } = await supabase.rpc("descartar_notificacion_venta_maquina", {
      p_notificacion_id: notification.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Aviso descartado");
    onResolved();
    onOpenChange(false);
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="lg">
      <ResponsiveDrawerHeader>
        <div className="flex items-center gap-2 pr-8">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Tractor className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold">Confirmar alta al parque</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Revisá la precarga obtenida de la venta facturada.</p>
          </div>
        </div>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody>
        <div className="grid gap-5">
          <section className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <FileText className="h-4 w-4 text-primary" />
              Factura {data.factura ?? "—"}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Fecha</span><span className="text-right text-foreground">{formatDate(data.fecha_factura)}</span>
              <span>Cliente detectado</span><span className="truncate text-right text-foreground">{data.cliente_nombre ?? "—"}</span>
              <span>Producto</span><span className="truncate text-right text-foreground">{data.producto ?? data.producto_codigo ?? "—"}</span>
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Propietario</h3>
            <div className="grid gap-1.5">
              <Label className="text-[12px]">Cliente *</Label>
              <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !form.cliente_id && "text-muted-foreground")}>
                    <span className="truncate">{form.cliente_id ? selectedClient : "Seleccionar cliente..."}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((client) => (
                          <CommandItem
                            key={client.id}
                            value={client.nombre}
                            onSelect={() => {
                              setForm((current) => ({ ...current, cliente_id: client.id }));
                              setClienteOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.cliente_id === client.id ? "opacity-100" : "opacity-0")} />
                            {client.nombre}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Máquina</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Marca *</Label>
                <Select value={form.marca} onValueChange={(marca) => setForm((current) => ({ ...current, marca: marca as Marca, modelo_tipo: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARCAS.filter((brand) => brand !== "OTROS").map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Subgrupo</Label>
                <Select value={form.subgrupo} onValueChange={(subgrupo) => setForm((current) => ({ ...current, subgrupo, modelo_tipo: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_SUBGROUPS.map((subgroup) => <SelectItem key={subgroup} value={subgroup}>{subgroup}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Chasis / serie *</Label>
                <Input value={form.serie} onChange={(event) => setForm((current) => ({ ...current, serie: event.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Año</Label>
                <Input type="number" value={form.anio} onChange={(event) => setForm((current) => ({ ...current, anio: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[12px]">Modelo</Label>
              <ModeloMaquinaSelect
                marca={form.marca}
                subgrupo={form.subgrupo}
                value={form.modelo_tipo}
                onValueChange={(modelo_tipo) => setForm((current) => ({ ...current, modelo_tipo }))}
              />
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ubicación y referencia</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Sucursal</Label>
                <Select value={form.sucursal || "none"} onValueChange={(value) => setForm((current) => ({ ...current, sucursal: value === "none" ? "" : value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin sucursal —</SelectItem>
                    {SUCURSALES.map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Localidad</Label>
                <Input value={form.localidad} onChange={(event) => setForm((current) => ({ ...current, localidad: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[12px]">Vendedor</Label>
              <Input value={form.vendedor} onChange={(event) => setForm((current) => ({ ...current, vendedor: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[12px]">Notas</Label>
              <Input value={form.notas} onChange={(event) => setForm((current) => ({ ...current, notas: event.target.value }))} />
            </div>
          </section>
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter className="justify-between">
        <Button variant="ghost" className="text-muted-foreground" onClick={discard} disabled={saving}>Descartar aviso</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cerrar</Button>
          <Button onClick={confirm} disabled={saving}>{saving ? "Guardando..." : "Confirmar alta"}</Button>
        </div>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
