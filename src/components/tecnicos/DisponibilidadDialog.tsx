import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
} from "@/components/ui/responsive-drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Sucursal } from "@/lib/constants";
import { toast } from "sonner";

type TipoDisponibilidad = "Capacitacion" | "Vacaciones" | "Permiso" | "Taller interno" | "Otro";

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo?: boolean;
}

interface DisponibilidadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tecnicos: Profile[];
  fechaInicial?: string;
  onSaved: () => void;
}

const TIPOS: Array<{ value: TipoDisponibilidad; label: string }> = [
  { value: "Capacitacion", label: "Capacitacion" },
  { value: "Vacaciones", label: "Vacaciones" },
  { value: "Permiso", label: "Permiso" },
  { value: "Taller interno", label: "Taller interno" },
  { value: "Otro", label: "Otro" },
];

export function DisponibilidadDialog({
  open,
  onOpenChange,
  tecnicos,
  fechaInicial,
  onSaved,
}: DisponibilidadDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [fechaInicio, setFechaInicio] = useState(fechaInicial ?? today);
  const [fechaFin, setFechaFin] = useState(fechaInicial ?? today);
  const [tipo, setTipo] = useState<TipoDisponibilidad>("Capacitacion");
  const [observacion, setObservacion] = useState("");
  const [bloqueaAgenda, setBloqueaAgenda] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = fechaInicial ?? today;
    setFechaInicio(base);
    setFechaFin(base);
    setTipo("Capacitacion");
    setObservacion("");
    setBloqueaAgenda(true);
    setSelected([]);
    setSearch("");
  }, [fechaInicial, open, today]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tecnicos;
    return tecnicos.filter(
      (t) =>
        t.nombre.toLowerCase().includes(q) ||
        (t.sucursal ?? "").toLowerCase().includes(q),
    );
  }, [search, tecnicos]);

  const toggleTecnico = (id: string, checked: boolean) => {
    setSelected((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((x) => x !== id);
    });
  };

  const guardar = async () => {
    if (selected.length === 0) {
      toast.error("Selecciona al menos un tecnico.");
      return;
    }
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) {
      toast.error("Revisa el rango de fechas.");
      return;
    }

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const rows = selected.map((tecnico_id) => ({
        tecnico_id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        tipo,
        observacion: observacion.trim() || null,
        bloquea_agenda: bloqueaAgenda,
        creado_por: u.user?.id ?? null,
      }));

      const { error } = await supabase.from("tecnico_disponibilidad").insert(rows);
      if (error) throw error;

      toast.success("Disponibilidad registrada");
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo registrar la disponibilidad.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} size="md">
      <ResponsiveDrawerHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarOff className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Disponibilidad tecnica</h2>
            <p className="text-sm text-muted-foreground">Capacitacion, permiso o ausencia sin crear trabajo.</p>
          </div>
        </div>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Desde</Label>
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hasta</Label>
            <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDisponibilidad)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tecnicos</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tecnico o sucursal..."
              className="pl-9"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {filtrados.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Sin tecnicos.</p>
            ) : (
              filtrados.map((t) => {
                const checked = selected.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0",
                      checked && "bg-primary/5",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleTecnico(t.id, Boolean(v))} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{t.sucursal ?? "Sin sucursal"}</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <Checkbox checked={bloqueaAgenda} onCheckedChange={(v) => setBloqueaAgenda(Boolean(v))} />
          <span>
            <span className="block text-sm font-medium">Bloquea agenda</span>
            <span className="block text-xs text-muted-foreground">Se muestra como tecnico no disponible.</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label>Observacion</Label>
          <Textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Motivo o referencia breve..."
            rows={4}
          />
        </div>
      </ResponsiveDrawerBody>

      <ResponsiveDrawerFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={saving}>
          {saving ? "Guardando..." : "Guardar disponibilidad"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
