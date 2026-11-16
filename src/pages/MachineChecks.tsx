import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { TableScroll } from "@/components/ventas/TableScroll";
import { toast } from "sonner";

const stages = { recibimiento: "Recibimiento", preentrega: "Preentrega", entrega_tecnica: "Entrega técnica" } as const;
type Stage = keyof typeof stages;
type Control = { finalizado: string | null; informado: string | null; situacion: string | null; os_numero: string | null; actualizado: string | null };
type Machine = { chasis: string; marca: string; modelo: string | null; ata: string | null; habilitada: boolean; controles: Partial<Record<Stage, Control>> };
type Order = { numero: string; responsable: string | null; estado: string | null; problema: string | null; tecnicos: string[] };
const empty: Control = { finalizado: null, informado: null, situacion: null, os_numero: null, actualizado: null };
const stageKeys = Object.keys(stages) as Stage[];
const dateLabel = (value: string | null) => value?.split("-").reverse().join("/") ?? "—";

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  // Las funciones se incorporan a los tipos generados al aplicar la migración.
  const client = supabase as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export default function MachineChecks() {
  const { user, roles } = useAuth();
  const cache = useQueryClient();
  const key = ["machine-checks", user?.id];
  const machines = useQuery({ queryKey: key, queryFn: () => rpc<Machine[]>("servicios_controles_listar") });
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("todas");
  const [selection, setSelection] = useState<{ machine: Machine; stage: Stage } | null>(null);
  const canEdit = selection?.machine.habilitada && roles.some(role => ["admin", "superadmin", "jefatura", "gerencia"].includes(role));
  const [draft, setDraft] = useState<Control>(empty);
  const orders = useQuery({
    queryKey: ["machine-check-orders", user?.id, selection?.machine.chasis],
    queryFn: () => rpc<Order[]>("servicios_controles_os", { p_chasis: selection!.machine.chasis }),
    enabled: !!selection?.machine.habilitada,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!selection) return;
      await rpc("servicios_controles_guardar", {
        p_chasis: selection.machine.chasis, p_etapa: selection.stage, p_finalizado: draft.finalizado,
        p_informado: draft.informado, p_situacion: draft.situacion, p_os: draft.os_numero, p_version: draft.actualizado,
      });
    },
    onSuccess: async () => {
      setSelection(null);
      await cache.invalidateQueries({ queryKey: key });
      toast.success("Control guardado");
    },
    onError: error => toast.error(error.message),
  });
  const visible = (machines.data ?? []).filter(machine =>
    (brand === "todas" || machine.marca === brand)
    && [machine.chasis, machine.modelo].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const order = orders.data?.find(item => item.numero === draft.os_numero);
  const setField = (field: keyof Control, value: string) => setDraft(previous => ({ ...previous, [field]: value || null }));

  return <PageShell>
    <PageHeader title="Controles de máquinas" />
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: "Chasis o modelo" }}>
      <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Todas"
        options={["todas", "CLAAS", "HORSCH"].map(value => ({ value, label: value === "todas" ? "Todas" : value }))} />
    </FiltersBar>
    {machines.isPending ? <LoadingScreen /> : machines.isError ?
      <div role="alert">No se pudieron cargar los controles. <Button variant="outline" onClick={() => machines.refetch()}>Reintentar</Button></div> :
      <TableScroll rows={visible.length}>
        <Table>
          <TableHeader><TableRow>
            {["Chasis", "Marca", "Modelo", "Arribo", ...Object.values(stages)].map(label => <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {visible.map(machine => <TableRow key={machine.chasis}>
              <TableCell>{machine.chasis}</TableCell><TableCell>{machine.marca}</TableCell>
              <TableCell>{machine.modelo || "—"}</TableCell><TableCell>{dateLabel(machine.ata)}</TableCell>
              {stageKeys.map(stage => {
                const check = machine.controles[stage];
                return <TableCell key={stage}><Button variant="link" size="sm" className="h-auto p-0"
                  aria-label={stages[stage] + " de " + machine.chasis}
                  onClick={() => { setDraft(check ?? empty); setSelection({ machine, stage }); }}>
                  {check?.finalizado ? dateLabel(check.finalizado) : check?.situacion ?? "Pendiente"}
                </Button></TableCell>;
              })}
            </TableRow>)}
            {!visible.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableScroll>}
    <ResponsiveDrawer open={!!selection} onOpenChange={open => { if (!open && !save.isPending) setSelection(null); }}
      title={selection ? stages[selection.stage] : "Control"}>
      {selection && <>
        <ResponsiveDrawerHeader><h2 className="font-semibold">{stages[selection.stage]} · {selection.machine.chasis}</h2></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">Finalización<Input type="date" value={draft.finalizado ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("finalizado", e.target.value)} /></label>
            <label className="grid gap-1">Informado a fábrica<Input type="date" value={draft.informado ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("informado", e.target.value)} /></label>
            <label className="grid gap-1">Situación<select className="h-10 rounded-md border bg-background px-3"
              value={draft.situacion ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("situacion", e.target.value)}>
              <option value="">—</option>{["Finalizado", "A cobrar", "Cobrado"].map(value => <option key={value}>{value}</option>)}
            </select></label>
            <label className="grid gap-1">N.º de OS<select className="h-10 rounded-md border bg-background px-3"
              value={draft.os_numero ?? ""} disabled={!canEdit || save.isPending || !orders.data} onChange={e => setField("os_numero", e.target.value)}>
              <option value="">—</option>
              {!order && draft.os_numero && <option>{draft.os_numero}</option>}
              {orders.data?.map(item => <option key={item.numero}>{item.numero}</option>)}
            </select></label>
          </div>
          {orders.isError && <div role="alert" className="mt-3">No se pudieron cargar las OS. <Button variant="outline" onClick={() => orders.refetch()}>Reintentar</Button></div>}
          {order && <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries({ Responsable: order.responsable, Técnicos: order.tecnicos.join(", "), Estado: order.estado, Descripción: order.problema })
              .map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value || "—"}</dd></div>)}
          </dl>}
        </ResponsiveDrawerBody>
        {canEdit && <ResponsiveDrawerFooter>
          <Button disabled={save.isPending || (!draft.actualizado && !draft.finalizado && !draft.informado && !draft.situacion && !draft.os_numero)}
            onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
        </ResponsiveDrawerFooter>}
      </>}
    </ResponsiveDrawer>
  </PageShell>;
}
