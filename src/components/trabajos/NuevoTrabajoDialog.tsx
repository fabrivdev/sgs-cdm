import { useEffect, useMemo, useRef, useState } from "react";
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
import { resolveWorkClientText, workClientGroups } from "@/lib/workClientSelection";
import { TrabajoClienteInput } from "./TrabajoClienteInput";
import type { Database } from "@/integrations/supabase/types";

interface Cliente { id: string; nombre: string; sucursal: Sucursal | null; ruc?: string | null; cod_entidad?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: Cliente[];
  trabajo?: {
    id: string; cliente_id?: string | null; codigo?: string | null;
    os_numero?: string | number | null; proxima_accion?: string | null;
    marca: Marca; sucursal: Sucursal; tipo_trabajo: TipoTrabajo;
    descripcion_problema: string; prioridad: Prioridad; legacy_servicio_id?: string | null;
  } | null;
  onSaved: (trabajoId?: string) => void;
}

const isMissingOsColumnError = (error: unknown) => {
  const detail = error as { message?: string; code?: string } | null;
  const message = String(detail?.message ?? "");
  const code = String(detail?.code ?? "");
  return code === "PGRST204" && message.includes("os_numero");
};

// Revalidar el maestro completo antes de crear, sin filtro por parque/sucursal.
async function readClientCatalog(): Promise<Cliente[]> {
  const rows: Cliente[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("clientes")
      .select("id, nombre, sucursal, ruc, cod_entidad").order("id").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

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
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const saving = useRef(false);
  const initializedFor = useRef<string | null>(null);
  const sessionGeneration = useRef(0);
  const clientTouched = useRef(false);
  const [knownClients, setKnownClients] = useState<Cliente[]>([]);
  const availableClients = useMemo(() => Array.from(new Map([
    ...knownClients, ...clientes,
  ].map(client => [client.id, client])).values()), [clientes, knownClients]);
  const clientGroups = useMemo(() => workClientGroups(availableClients), [availableClients]);

  useEffect(() => {
    if (!open) {
      if (initializedFor.current !== null) sessionGeneration.current++;
      initializedFor.current = null;
      return;
    }
    const session = trabajo?.id ?? "new";
    if (initializedFor.current === session) {
      // La llegada/refrescado del catálogo no debe borrar cambios del usuario.
      if (!clientTouched.current) {
        setForm(current => {
          const client = availableClients.find(row => row.id === current.cliente_id);
          return !client || current.cliente_text === client.nombre ? current : { ...current, cliente_text: client.nombre };
        });
      }
      return;
    }
    initializedFor.current = session;
    sessionGeneration.current++;
    setClientSearchOpen(false);
    clientTouched.current = false;
    if (trabajo) {
      const clienteId = trabajo.cliente_id ?? "";
      const cli = availableClients.find(c => c.id === clienteId);
      setForm({
        cliente_id: clienteId,
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
  }, [open, trabajo, availableClients, profile?.sucursal]);

  const guardar = async () => {
    if (saving.current) return;
    if (!form.descripcion_problema.trim()) {
      toast.error("Cargá el problema o trabajo a resolver");
      return;
    }
    saving.current = true;
    setBusy(true);
    const saveSession = sessionGeneration.current;
    try {
      let clienteId: string | null = form.cliente_id || null;
      if (!clienteId && form.cliente_text.trim()) {
        let resolution = resolveWorkClientText(form.cliente_text, clientGroups, trabajo?.cliente_id);
        if (resolution.kind === "new") {
          const latest = await readClientCatalog();
          if (saveSession !== sessionGeneration.current) return;
          // Incluir altas de un intento anterior aunque el catálogo aún no las devuelva.
          const refreshed = Array.from(new Map([...knownClients, ...latest].map(client => [client.id, client])).values());
          setKnownClients(refreshed);
          resolution = resolveWorkClientText(form.cliente_text, workClientGroups(refreshed), trabajo?.cliente_id);
        }
        if (resolution.kind === "ambiguous") {
          throw new Error("Hay clientes con este nombre y distintas identidades. Seleccioná el cliente por su RUC o código.");
        }
        if (resolution.kind === "existing") clienteId = resolution.client.id;
        else {
          const { data, error } = await supabase.from("clientes")
            .insert({ nombre: form.cliente_text.trim(), sucursal: form.sucursal })
            .select("id").single();
          if (error) throw error;
          clienteId = data.id;
          setKnownClients(current => [...current, { id: data.id, nombre: form.cliente_text.trim(), sucursal: form.sucursal }]);
        }
        if (saveSession !== sessionGeneration.current) return;
        // Si guardar el trabajo falla después del alta, el reintento usa el mismo ID.
        clientTouched.current = true;
        setForm(current => ({ ...current, cliente_id: clienteId ?? "" }));
      }
      const osNumero = form.os_numero.trim();
      const payload: Database["public"]["Tables"]["trabajos"]["Insert"] = {
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
      if (saveSession === sessionGeneration.current) onOpenChange(false);
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message ?? "No se pudo guardar");
    } finally { saving.current = false; setBusy(false); }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={next => { if (!saving.current) onOpenChange(next); }} size="lg"
      onEscapeKeyDown={event => {
        if (clientSearchOpen) { event.preventDefault(); setClientSearchOpen(false); }
      }}>
      <ResponsiveDrawerHeader>
        <h2 className="text-[14px] font-semibold">{editing ? "Editar trabajo" : "Nuevo trabajo"}</h2>
        <p className="text-[12px] text-muted-foreground mt-1">
          Sólo registrá el caso. La fecha y el técnico se asignan después desde el Planificador o Calendario.
        </p>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody>
        <fieldset disabled={busy} className="grid gap-4">
          <TrabajoClienteInput
            key={`${open}:${trabajo?.id ?? "new"}`}
            value={form.cliente_text}
            selectedId={form.cliente_id}
            groups={clientGroups}
            disabled={busy}
            expanded={clientSearchOpen}
            onExpandedChange={setClientSearchOpen}
            onChange={(text, id) => {
              clientTouched.current = true;
              setForm(current => ({ ...current, cliente_text: text, cliente_id: id }));
            }}
          />

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
            <Textarea aria-label="Trabajo o problema a resolver" rows={5} value={form.descripcion_problema}
              onChange={(e) => setForm(f => ({ ...f, descripcion_problema: e.target.value }))} />
          </Field>
        </fieldset>
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
