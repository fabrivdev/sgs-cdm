import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Settings2, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMachineCatalog } from "@/hooks/useMachineCatalog";
import { upperMachineText } from "@/lib/machineOrderValidation";
import { MACHINE_SUBGROUPS } from "@/lib/machineModels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Entry = { id: string; nombre: string; active: boolean; marca?: string; subgrupo?: string };
export function MachineCatalogManager({ kind, disabled = false }: { kind: "marca" | "modelo"; disabled?: boolean }) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [subgroup, setSubgroup] = useState("");
  const [pending, setPending] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const catalog = useMachineCatalog(open);
  const queryClient = useQueryClient();
  if (!isAdmin && !isSuperAdmin) return null;
  const entries: Entry[] = kind === "marca"
    ? (catalog.data?.brands ?? []).map(b => ({ id: b.nombre, nombre: b.nombre, active: b.activa }))
    : (catalog.data?.models ?? []).map(m => ({ id: m.id, nombre: m.nombre, active: m.activo, marca: m.marca_nombre, subgrupo: m.subgrupo }));
  const filtered = entries.filter(e => (showInactive || e.active) && `${e.nombre} ${e.marca ?? ""} ${e.subgrupo ?? ""}`.includes(upperMachineText(search))).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const save = async (entry: Entry, action: "editar" | "eliminar" | "restaurar") => {
    if (busy) return;
    if (action === "editar" && !name.trim()) return toast.error("Escribí un nombre");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("maquinaria_gestionar_catalogo" as never, {
        p_tipo: kind, p_id: entry.id, p_accion: action,
        p_nombre: action === "editar" ? name.trim() : null,
        p_subgrupo: kind === "modelo" && action === "editar" ? subgroup : null,
      } as never);
      if (error) throw error;
      await Promise.all(["machine-catalog-review", "maquinaria-marcas-catalogo", "parque-modelos-catalogo"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      setEditing(null); setPending(null);
      toast.success(action === "eliminar" ? "Quitado del listado. El historial se conserva." : "Catálogo actualizado");
    } catch (error) { toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "No se pudo actualizar el catálogo"); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-[11px] text-muted-foreground" disabled={disabled} onClick={() => setOpen(true)}><Settings2 className="mr-1 h-3 w-3" />Gestionar {kind === "marca" ? "marcas" : "modelos"}</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) { setOpen(v); setEditing(null); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Catálogo de {kind === "marca" ? "marcas" : "modelos"}</DialogTitle><DialogDescription>Los cambios se aplican al listado para futuras cargas. Los pedidos y máquinas existentes conservan sus datos.</DialogDescription></DialogHeader>
        <Input aria-label="Buscar en el catálogo" placeholder="BUSCAR NOMBRE O MARCA" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Mostrar eliminados del listado</label>
        {catalog.isLoading && <p>Cargando catálogo…</p>}
        {catalog.isError && <p className="text-sm text-destructive">No se pudo cargar el catálogo. <button onClick={() => catalog.refetch()} className="underline">Reintentar</button></p>}
        {editing && <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm">Editar {editing.nombre}</p>
          <Input aria-label="Nuevo nombre" value={name} onChange={e => setName(upperMachineText(e.target.value))} disabled={busy} />
          {kind === "modelo" && <select aria-label="Subgrupo del modelo" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={subgroup} onChange={e => setSubgroup(e.target.value)} disabled={busy}>{MACHINE_SUBGROUPS.map(s => <option key={s}>{s}</option>)}</select>}
          <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => save(editing, "editar")}>Guardar</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button></div>
        </div>}
        <div className="divide-y">{filtered.map(entry => <div key={entry.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium break-words">{entry.nombre}{!entry.active && " · ELIMINADO"}</p>{entry.marca && <p className="text-xs text-muted-foreground">{entry.marca} · {entry.subgrupo}</p>}</div>
          {entry.active ? <><Button size="icon" variant="ghost" aria-label={`Editar ${entry.nombre}`} disabled={busy} onClick={() => { setEditing(entry); setName(entry.nombre); setSubgroup(entry.subgrupo ?? "OTRO"); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Eliminar ${entry.nombre} del listado`} disabled={busy} onClick={() => setPending(entry)}><Trash2 className="h-4 w-4 text-destructive" /></Button></> : <Button size="sm" variant="outline" disabled={busy} onClick={() => save(entry, "restaurar")}><RotateCcw className="mr-1 h-3 w-3" />Restaurar</Button>}
        </div>)}</div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pending} onOpenChange={v => { if (!v && !busy) setPending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Quitar {pending?.nombre} del listado?</AlertDialogTitle><AlertDialogDescription>Dejará de ofrecerse en nuevas cargas. Los registros existentes se conservan y podés restaurarlo después.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => pending && save(pending, "eliminar")}>Eliminar del listado</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
