import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MARCAS, SUCURSALES, type Marca, type Sucursal } from "@/lib/constants";
import { toast } from "sonner";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal }
interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  cliente_id: string | null;
  marca: Marca;
  trabajo_descripcion: string;
  observaciones: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  servicio: Servicio | null;
  profiles: Profile[];
  clientes: Cliente[];
  onSaved: () => void;
}

export function ServicioFormDialog({ open, onOpenChange, servicio, profiles, clientes, onSaved }: Props) {
  const { user, profile, isAdmin } = useAuth();
  const [fecha, setFecha] = useState("");
  const [sucursal, setSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [marca, setMarca] = useState<Marca>("CLAAS");
  const [responsableId, setResponsableId] = useState<string>("");
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (servicio) {
      setFecha(servicio.fecha_programada);
      setSucursal(servicio.sucursal);
      setMarca(servicio.marca);
      setResponsableId(servicio.tecnico_responsable_id ?? "");
      setAuxiliares(servicio.auxiliares);
      setClienteId(servicio.cliente_id ?? "");
      setTrabajo(servicio.trabajo_descripcion);
      setObservaciones(servicio.observaciones ?? "");
    } else {
      setFecha(new Date().toISOString().slice(0, 10));
      setSucursal(isAdmin ? SUCURSALES[0] : (profile?.sucursal ?? SUCURSALES[0]));
      setMarca("CLAAS");
      setResponsableId("");
      setAuxiliares([]);
      setClienteId("");
      setNuevoCliente("");
      setTrabajo("");
      setObservaciones("");
    }
  }, [servicio, open, isAdmin, profile]);

  const profilesSucursal = profiles.filter((p) => p.sucursal === sucursal);
  const clientesSucursal = clientes.filter((c) => c.sucursal === sucursal);

  const submit = async () => {
    if (!fecha || !trabajo) { toast.error("Completá fecha y descripción del trabajo"); return; }
    setBusy(true);
    let cli = clienteId;
    if (nuevoCliente.trim()) {
      const { data, error } = await supabase.from("clientes").insert({ nombre: nuevoCliente.trim(), sucursal }).select("id").single();
      if (error) { toast.error(error.message); setBusy(false); return; }
      cli = data.id;
    }

    const payload = {
      fecha_programada: fecha,
      sucursal,
      marca,
      tecnico_responsable_id: responsableId || null,
      auxiliares,
      cliente_id: cli || null,
      trabajo_descripcion: trabajo,
      observaciones: observaciones || null,
      creado_por: user?.id,
      // dia_semana and semana are auto-computed by DB trigger
      dia_semana: "",
      semana: 0,
    };

    const { error } = servicio
      ? await supabase.from("servicios").update(payload).eq("id", servicio.id)
      : await supabase.from("servicios").insert(payload);

    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(servicio ? "Servicio actualizado" : "Servicio creado"); onOpenChange(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{servicio ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha programada</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sucursal</Label>
                <Select value={sucursal} onValueChange={(v) => setSucursal(v as Sucursal)} disabled={!isAdmin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Marca</Label>
                <Select value={marca} onValueChange={(v) => setMarca(v as Marca)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Técnico responsable</Label>
                <Select value={responsableId || "none"} onValueChange={(v) => setResponsableId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin asignar —</SelectItem>
                    {profilesSucursal.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Auxiliares</Label>
              <div className="rounded-md border p-2 max-h-32 overflow-y-auto space-y-1">
                {profilesSucursal.length === 0 && <p className="text-xs text-muted-foreground">Sin técnicos en esta sucursal.</p>}
                {profilesSucursal.filter((p) => p.id !== responsableId).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={auxiliares.includes(p.id)}
                      onCheckedChange={(c) =>
                        setAuxiliares((prev) => c ? [...prev, p.id] : prev.filter((x) => x !== p.id))
                      }
                    />
                    {p.nombre}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente existente</Label>
                <Select value={clienteId || "none"} onValueChange={(v) => setClienteId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Ninguno —</SelectItem>
                    {clientesSucursal.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>O cargar nuevo cliente</Label>
                <Input value={nuevoCliente} onChange={(e) => setNuevoCliente(e.target.value)} placeholder="Nombre del cliente" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción del trabajo</Label>
              <Textarea value={trabajo} onChange={(e) => setTrabajo(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Observaciones</Label>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
