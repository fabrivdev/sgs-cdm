import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EstadoBadge, MarcaBadge } from "@/components/StatusBadges";
import { ESTADOS, type Estado, type Marca, type Sucursal, type TipoTrabajo } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { MapPin, MoreVertical, Pencil, Trash2, Wrench } from "lucide-react";
import { ServicioFormDialog } from "@/components/ServicioFormDialog";

interface Servicio {
  id: string;
  fecha_programada: string;
  dia_semana: string;
  semana: number;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  cliente_id: string | null;
  marca: Marca;
  tipo_trabajo: TipoTrabajo;
  trabajo_descripcion: string;
  estado: Estado;
  observaciones: string | null;
  horas_trabajadas: number | null;
}
interface Profile { id: string; nombre: string; sucursal: Sucursal | null }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }

interface Props {
  servicio: Servicio | null;
  onOpenChange: (o: boolean) => void;
  profiles: Profile[];
  clientes: Cliente[];
  onChanged: () => void;
}

export function ServicioDetalleDialog({ servicio, onOpenChange, profiles, clientes, onChanged }: Props) {
  const { user, isAdmin, isCabecilla } = useAuth();
  const [estado, setEstado] = useState<Estado>("Pendiente");
  const [horas, setHoras] = useState<string>("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (servicio) {
      setEstado(servicio.estado);
      setHoras(servicio.horas_trabajadas?.toString() ?? "");
      setObs(servicio.observaciones ?? "");
    }
  }, [servicio]);

  if (!servicio) return null;

  const profById = Object.fromEntries(profiles.map((p) => [p.id, p.nombre]));
  const cliById = Object.fromEntries(clientes.map((c) => [c.id, c.nombre]));
  const isAssigned = user && (servicio.tecnico_responsable_id === user.id || servicio.auxiliares.includes(user.id));
  const canEdit = isAdmin || isCabecilla || isAssigned;
  const canManage = isAdmin || isCabecilla;
  const tipo = servicio.tipo_trabajo ?? "Visita de campo";

  const save = async () => {
    if (estado === "Completado" && !horas) { toast.error("Cargá las horas trabajadas para completar."); return; }
    setBusy(true);
    const { error } = await supabase.from("servicios").update({
      estado,
      horas_trabajadas: horas ? Number(horas) : null,
      observaciones: obs || null,
    }).eq("id", servicio.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Actualizado"); onChanged(); onOpenChange(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await supabase.from("servicios").delete().eq("id", servicio.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) toast.error(error.message);
    else { toast.success("Servicio eliminado"); onChanged(); onOpenChange(false); }
  };

  return (
    <>
      <Dialog open={!!servicio && !editOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 flex-wrap pr-8">
                Detalle del servicio
                <MarcaBadge marca={servicio.marca} />
                <Badge variant="outline" className="gap-1 text-[10px]">
                  {tipo === "Máquina en taller" ? <Wrench className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                  {tipo}
                </Badge>
              </DialogTitle>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setConfirmDelete(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row k="Fecha" v={`${format(parseISO(servicio.fecha_programada), "dd/MM/yyyy")} (${servicio.dia_semana}, sem ${servicio.semana})`} />
            <Row k="Sucursal" v={servicio.sucursal} />
            <Row
  k="Cliente"
  v={
    servicio.cliente_id
      ? cliById[servicio.cliente_id] ?? servicio.cliente_id
      : "—"
  }
/>
            <Row k="Responsable" v={servicio.tecnico_responsable_id ? profById[servicio.tecnico_responsable_id] : "—"} />
            <Row k="Auxiliares" v={servicio.auxiliares.map((a) => profById[a]).filter(Boolean).join(", ") || "—"} />
            <div>
              <div className="text-xs text-muted-foreground">Trabajo o problema a resolver</div>
              <div className="rounded-md bg-muted/40 p-2 text-sm">{servicio.trabajo_descripcion}</div>
            </div>

            {canEdit ? (
              <>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Horas trabajadas {estado === "Completado" && <span className="text-destructive">*</span>}</Label>
                  <Input type="number" step="0.5" min="0" value={horas} onChange={(e) => setHoras(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Observaciones</Label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
                </div>
              </>
            ) : (
              <>
                <Row k="Estado" v={<EstadoBadge estado={servicio.estado} />} />
                <Row k="Horas" v={servicio.horas_trabajadas ?? "—"} />
                <Row k="Observaciones" v={servicio.observaciones ?? "—"} />
              </>
            )}
          </div>
          {canEdit && (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {canManage && (
        <ServicioFormDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) onOpenChange(false);
          }}
          servicio={servicio}
          profiles={profiles}
          clientes={clientes}
          onSaved={() => { onChanged(); }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el servicio y sus datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm text-right">{v}</span>
    </div>
  );
}
