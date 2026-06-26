import { useEffect, useState } from "react";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARCAS, SUCURSALES, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { PRIORIDADES, trabajoOsNumero, type Prioridad } from "@/lib/trabajos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: Cliente[];
  trabajo?: any | null;
  onSaved: (trabajoId?: string) => void;
}

const isMissingOsColumnError = (error: unknown) => {
  const message = String((error as any)?.message ?? "");
  const code = String((error as any)?.code ?? "");
  return code === "PGRST204" && message.includes("os_numero");
};

/**
 * Caso madre = solo registra el problema. NO se asignan fechas ni técnicos acá.
 * Toda la programación se hace después desde el Planificador / Calendario.
 */
export function NuevoTrabajoDialog({ open, onOpenChange, clientes, trabajo, onSaved }: Props) {
  const { user, profile } = useAuth();
  const editing = !!trabajo;

  const [form, setForm] = useState({
    cliente_id: "",
    cliente_text: "",
    os_numero: "",
    marca: "CLAAS" as Marca,
    sucursal: (profile?.sucursal ?? "Santa Rita") as Sucursal,
    tipo_trabajo: "Visita de campo" as TipoTrabajo,
    descripcion_problema: "",
    prioridad: "media" as Prioridad,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (trabajo) {
      const cli = clientes.find(c => c.id === trabajo.cliente_id);
      setForm({
        cliente_id: trabajo.cliente_id ?? "",
        cliente_text: cli?.nombre ?? "",
        os_numero: trabajoOsNumero(trabajo),
        marca: trabajo.marca,
        sucursal: trabajo.sucursal,
        tipo_trabajo: trabajo.tipo_trabajo,
        descripcion_problema: trabajo.descripcion_problema,
        prioridad: trabajo.prioridad,
      });
    } else {
      setForm({
        cliente_id: "", cliente_text: "", os_numero: "", marca: "CLAAS",
        sucursal: (profile?.sucursal ?? "Santa Rita") as Sucursal,
        tipo_trabajo: "Visita de campo", descripcion_problema: "", prioridad: "media",
      });
    }
  }, [open, trabajo]);

  const guardar = async () => {
    if (!form.descripcion_problema.trim()) {
      toast.error("Cargá el problema o trabajo a resolver");
      return;
    }
    setBusy(true);
    try {
      let clienteId: string | null = form.cliente_id || null;
      if (!clienteId && form.cliente_text.trim()) {
        const ex = clientes.find(c => c.nombre.toLowerCase() === form.cliente_text.trim().toLowerCase());
        if (ex) clienteId = ex.id;
        else {
          const { data, error } = await supabase.from("clientes")
            .insert({ nombre: form.cliente_text.trim(), sucursal: form.sucursal })
            .select("id").single();
          if (error) throw error;
          clienteId = data.id;
        }
      }
      const osNumero = form.os_numero.trim();
      const payload: any = {
        cliente_id: clienteId,
        marca: form.marca,
        sucursal: form.sucursal,
        tipo_trabajo: form.tipo_trabajo,
        descripcion_problema: form.descripcion_problema.trim(),
        prioridad: form.prioridad,
        os_numero: osNumero || null,
        proxima_accion: osNumero ? `OS:${osNumero}` : null,
      };
      const savePayload = async (includeOs: boolean) => {
        const data = includeOs ? payload : { ...payload };
        if (!includeOs) delete data.os_numero;

        if (editing) {
          const { error } = await supabase.from("trabajos").update(data).eq("id", trabajo.id);
          if (error) throw error;
          return trabajo.id as string;
        }

        data.creado_por = user?.id;
        data.estado_general = "pendiente";
        const { data: created, error } = await supabase.from("trabajos").insert(data).select("id").single();
        if (error) throw error;
        return created.id as string;
      };

      let trabajoId: string | undefined;
      try {
        trabajoId = await savePayload(true);
      } catch (error) {
        if (!isMissingOsColumnError(error)) throw error;
        trabajoId = await savePayload(false);
        toast.warning("Trabajo guardado. La OS se podrá guardar cuando Lovable aplique la migración de base de datos.");
      }
      if (editing && trabajo?.legacy_servicio_id) {
        const { error: syncError } = await supabase
          .from("servicios")
          .update({
            cliente_id: clienteId,
            marca: form.marca,
            sucursal: form.sucursal,
            tipo_trabajo: form.tipo_trabajo,
            trabajo_descripcion: form.descripcion_problema.trim(),
          })
          .eq("id", trabajo.legacy_servicio_id);
        if (syncError) console.warn("No se pudo sincronizar el servicio legado", syncError);
      }
      toast.success(editing ? "Trabajo actualizado" : "Trabajo creado");
      onSaved(trabajoId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally { setBusy(false); }
  };

  const clientesFiltrados = (() => {
    const q = form.cliente_text.trim().toLowerCase();
    if (!q) return clientes.slice(0, 100);
    return clientes.filter(c => c.nombre.toLowerCase().includes(q)).slice(0, 100);
  })();

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="lg">
      <ResponsiveDrawerHeader>
        <h2 className="text-base font-semibold">{editing ? "Editar trabajo" : "Nuevo trabajo"}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Sólo registrá el caso. La fecha y el técnico se asignan después desde el Planificador o Calendario.
        </p>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input
              list="clientes-nuevotrabajo"
              value={form.cliente_text}
              onChange={(e) => {
                const v = e.target.value;
                const m = clientes.find(c => c.nombre.toLowerCase() === v.toLowerCase());
                setForm(f => ({ ...f, cliente_text: v, cliente_id: m?.id ?? "" }));
              }}
              placeholder="Buscar o escribir cliente..."
            />
            <datalist id="clientes-nuevotrabajo">
              {clientesFiltrados.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nro OS interna para importar Excel">
              <Input
                value={form.os_numero}
                onChange={(e) => setForm(f => ({ ...f, os_numero: e.target.value.replace(/[^\d]/g, "") }))}
                placeholder="Ej: 6166"
                inputMode="numeric"
              />
            </Field>
            <Field label="Sucursal">
              <Select value={form.sucursal} onValueChange={(v) => setForm(f => ({ ...f, sucursal: v as Sucursal }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SUCURSALES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Marca">
              <Select value={form.marca} onValueChange={(v) => setForm(f => ({ ...f, marca: v as Marca }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{MARCAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={form.tipo_trabajo} onValueChange={(v) => setForm(f => ({ ...f, tipo_trabajo: v as TipoTrabajo }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Visita de campo">Visita de campo</SelectItem>
                  <SelectItem value="Máquina en taller">Máquina en taller</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridad">
              <Select value={form.prioridad} onValueChange={(v) => setForm(f => ({ ...f, prioridad: v as Prioridad }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Trabajo o problema a resolver">
            <Textarea rows={5} value={form.descripcion_problema}
              onChange={(e) => setForm(f => ({ ...f, descripcion_problema: e.target.value }))} />
          </Field>
        </div>
      </ResponsiveDrawerBody>
      <ResponsiveDrawerFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? "Guardando…" : (editing ? "Guardar" : "Crear trabajo")}</Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
