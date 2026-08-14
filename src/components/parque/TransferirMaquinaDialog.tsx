import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowRightLeft, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SUCURSALES, type Sucursal } from "@/lib/constants";

type ClienteSimple = { id: string; nombre: string };

export type MaquinaParaTransferir = {
  id: string;
  clienteIdActual: string | null;
  marca: string;
  modelo_tipo: string | null;
  serie: string;
  anio: number | null;
  subgrupo: string;
  notas: string | null;
};

interface Props {
  maquina: MaquinaParaTransferir | null;
  clienteNombreActual: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onTransferred: () => void;
}

export function TransferirMaquinaDialog({ maquina, clienteNombreActual, open, onOpenChange, onTransferred }: Props) {
  const [clientes, setClientes] = useState<ClienteSimple[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [nuevoClienteId, setNuevoClienteId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [crearClienteOpen, setCrearClienteOpen] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteSucursal, setNuevoClienteSucursal] = useState<Sucursal | "">("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNuevoClienteId("");
    setClienteSearch("");
    setCrearClienteOpen(false);
    setNuevoClienteNombre("");
    setNuevoClienteSucursal("");
    setMotivo("");
    (async () => {
      const all: ClienteSimple[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre")
          .range(from, from + pageSize - 1);
        if (error) break;
        const rows = (data ?? []) as ClienteSimple[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      setClientes(all);
    })();
  }, [open]);

  const nuevoCliente = clientes.find((c) => c.id === nuevoClienteId);
  const canConfirm = !!nuevoClienteId && nuevoClienteId !== maquina?.clienteIdActual;

  const crearCliente = async () => {
    const nombre = (nuevoClienteNombre || clienteSearch).trim();
    if (!nombre) return toast.error("Ingresá el nombre del cliente");
    setCreating(true);
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombre, sucursal: nuevoClienteSucursal || null })
      .select("id, nombre")
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);

    const creado = data as ClienteSimple;
    setClientes((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setNuevoClienteId(creado.id);
    setClienteSearch("");
    setNuevoClienteNombre("");
    setNuevoClienteSucursal("");
    setCrearClienteOpen(false);
    setPopoverOpen(false);
    toast.success("Cliente creado y seleccionado");
  };

  const confirmar = async () => {
    if (!maquina || !nuevoClienteId) return;
    setSaving(true);
    const notasActualizadas = motivo.trim()
      ? [maquina.notas, `Transferido a ${nuevoCliente?.nombre ?? "nuevo cliente"}: ${motivo.trim()}`]
          .filter(Boolean)
          .join("\n")
      : maquina.notas ?? null;
    const { error } = await supabase
      .from("parque_maquinas")
      .update({ cliente_id: nuevoClienteId, notas: notasActualizadas })
      .eq("id", maquina.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Máquina transferida a ${nuevoCliente?.nombre ?? "nuevo cliente"}`);
    onOpenChange(false);
    onTransferred();
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="sm">
      <ResponsiveDrawerHeader>
        <h2 className="text-[14px] font-semibold pr-8">Transferir máquina</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">Cambiar el cliente propietario de esta máquina</p>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        {maquina && (
          <div className="grid gap-5">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Máquina</div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <Badge className="text-[10px]">{maquina.marca}</Badge>
                <Badge variant="outline" className="text-[10px]">{maquina.subgrupo}</Badge>
                {maquina.anio && <span className="text-[12px] text-muted-foreground">{maquina.anio}</span>}
              </div>
              <div className="text-[13px] font-medium">{maquina.modelo_tipo ?? "—"}</div>
              <div className="text-[12px] text-muted-foreground">Serie: {maquina.serie}</div>
            </div>

            <div className="grid gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Dueño actual</div>
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-[13px] text-muted-foreground">{clienteNombreActual}</div>
              </div>
              <div className="flex justify-center">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px]">Nuevo propietario *</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn("w-full justify-between font-normal", !nuevoClienteId && "text-muted-foreground")}
                    >
                      {nuevoCliente ? nuevoCliente.nombre : "Buscar cliente..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput value={clienteSearch} onValueChange={setClienteSearch} placeholder="Buscar cliente..." />
                      <CommandList>
                        <CommandEmpty>
                          <div className="space-y-2 p-2 text-left">
                            <div className="text-[12px] text-muted-foreground">No se encontró ese cliente.</div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-full justify-start text-[12px]"
                              onClick={() => {
                                setNuevoClienteNombre(clienteSearch);
                                setCrearClienteOpen(true);
                                setPopoverOpen(false);
                              }}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Crear cliente
                            </Button>
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {clientes.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.nombre}
                              onSelect={() => {
                                setNuevoClienteId(c.id);
                                setPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", nuevoClienteId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {nuevoClienteId && nuevoClienteId === maquina.clienteIdActual && (
                  <p className="text-[11px] text-amber-600">Este cliente ya es el propietario actual.</p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start px-0 text-[12px] text-primary hover:bg-transparent"
                  onClick={() => {
                    setNuevoClienteNombre(clienteSearch);
                    setCrearClienteOpen((value) => !value);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Crear cliente nuevo
                </Button>
              </div>
            </div>

            {crearClienteOpen && (
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nuevo cliente</div>
                <div className="grid gap-1.5">
                  <Label className="text-[12px]">Nombre *</Label>
                  <Input
                    value={nuevoClienteNombre}
                    onChange={(e) => setNuevoClienteNombre(e.target.value)}
                    placeholder="Nombre del cliente"
                    onKeyDown={(e) => e.key === "Enter" && crearCliente()}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[12px]">Sucursal principal (opcional)</Label>
                  <select
                    value={nuevoClienteSucursal}
                    onChange={(e) => setNuevoClienteSucursal(e.target.value as Sucursal | "")}
                    className="h-9 rounded-md border bg-background px-3 text-[13px]"
                  >
                    <option value="">Sin definir</option>
                    {SUCURSALES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCrearClienteOpen(false)} disabled={creating}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={crearCliente} disabled={creating || !nuevoClienteNombre.trim()}>
                    {creating ? "Creando..." : "Crear y seleccionar"}
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-[12px]">Motivo (opcional)</Label>
              <Textarea
                placeholder="Venta, error de carga, cambio de titularidad..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                className="resize-none text-[13px]"
              />
              <p className="text-[10px] text-muted-foreground">Se guardará en las notas de la máquina.</p>
            </div>
          </div>
        )}
      </ResponsiveDrawerBody>
      <ResponsiveDrawerFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
        <Button onClick={confirmar} disabled={saving || !canConfirm} className="gap-2">
          <ArrowRightLeft className="h-4 w-4" />
          {saving ? "Transfiriendo..." : "Confirmar transferencia"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
