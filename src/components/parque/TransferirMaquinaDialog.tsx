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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowRightLeft, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNuevoClienteId("");
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
        <h2 className="text-base font-semibold pr-8">Transferir máquina</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Cambiar el cliente propietario de esta máquina</p>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        {maquina && (
          <div className="grid gap-5">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Máquina</div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <Badge className="text-[10px]">{maquina.marca}</Badge>
                <Badge variant="outline" className="text-[10px]">{maquina.subgrupo}</Badge>
                {maquina.anio && <span className="text-xs text-muted-foreground">{maquina.anio}</span>}
              </div>
              <div className="text-sm font-medium">{maquina.modelo_tipo ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Serie: {maquina.serie}</div>
            </div>

            <div className="grid gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Dueño actual</div>
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{clienteNombreActual}</div>
              </div>
              <div className="flex justify-center">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nuevo propietario *</Label>
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
                      <CommandInput placeholder="Buscar cliente..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
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
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                placeholder="Venta, error de carga, cambio de titularidad..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                className="resize-none text-sm"
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
