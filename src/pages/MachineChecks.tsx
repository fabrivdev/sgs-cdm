import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, Panel } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerFooter, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { TableScroll, salesHeader, scrollHead } from "@/components/ventas/TableScroll";
import { toast } from "sonner";

const stages = { recibimiento: "Recibimiento", preentrega: "Preentrega", entrega_tecnica: "Entrega técnica" } as const;
type Stage = keyof typeof stages;
type Control = { finalizado: string | null; informado: string | null; situacion: string | null; os_numero: string | null; actualizado: string | null };
type Machine = { chasis: string; marca: string | null; modelo: string | null; ata: string | null; habilitada: boolean;
  conflicto?: boolean; historico?: { fila: number; controles: Partial<Record<Stage, Control>> }[];
  controles: Partial<Record<Stage, Control>> };
type Order = { numero: string; responsable: string | null; estado: string | null; problema: string | null; tecnicos: string[] };
const empty: Control = { finalizado: null, informado: null, situacion: null, os_numero: null, actualizado: null };
const stageKeys = Object.keys(stages) as Stage[];
const dateLabel = (value: string | null) => value?.split("-").reverse().join("/") ?? "—";

function stageStatus(machine: Machine, stage: Stage) {
  const control = machine.controles[stage];
  if (control?.finalizado || control?.situacion) {
    return [control.situacion || "Realizada", control.os_numero ? null : "Sin OS"].filter(Boolean).join(" · ");
  }
  if (control?.os_numero || control?.informado) return "Por completar";
  if (machine.conflicto || machine.historico?.length) return "Por revisar";
  return machine.habilitada ? "Pendiente" : "Sin datos";
}

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
  const [pendingStage, setPendingStage] = useState("todas");
  const [orderSearch, setOrderSearch] = useState("");
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
      await cache.invalidateQueries({ queryKey: key });
      const updated = cache.getQueryData<Machine[]>(key)?.find(machine => machine.chasis === selection?.machine.chasis);
      if (updated && selection) {
        setSelection({ machine: updated, stage: selection.stage });
        setDraft(updated.controles[selection.stage] ?? empty);
      } else {
        setSelection(null);
      }
      toast.success("Control guardado");
    },
    onError: error => toast.error(error.message),
  });
  const visible = (machines.data ?? []).filter(machine =>
    (brand === "todas" || machine.marca === brand)
    && (pendingStage === "todas" || (machine.habilitada
      && !machine.controles[pendingStage as Stage]?.finalizado
      && !machine.controles[pendingStage as Stage]?.situacion))
    && [machine.chasis, machine.modelo].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const order = orders.data?.find(item => item.numero === draft.os_numero);
  const matchedOrders = orders.data?.filter(item => item.numero.includes(orderSearch.trim())) ?? [];
  const setField = (field: keyof Control, value: string) => setDraft(previous => ({ ...previous, [field]: value || null }));
  const openStage = (machine: Machine, stage: Stage) => {
    setDraft(machine.controles[stage] ?? empty);
    setOrderSearch("");
    setSelection({ machine, stage });
  };
  const changed = selection && JSON.stringify(draft) !== JSON.stringify(selection.machine.controles[selection.stage] ?? empty);

  return <PageShell>
    <PageHeader title="Controles de máquinas" />
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: "Chasis o modelo" }}>
      <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Todas"
        options={["todas", "CLAAS", "HORSCH"].map(value => ({ value, label: value === "todas" ? "Todas" : value }))} />
      <FilterSelect label="Etapa pendiente" value={pendingStage} onChange={setPendingStage} placeholder="Todas"
        options={[{ value: "todas", label: "Todas" }, ...stageKeys.map(value => ({ value, label: stages[value] }))]} />
    </FiltersBar>
    {machines.isPending ? <LoadingScreen /> : machines.isError ?
      <div role="alert">No se pudieron cargar los controles. <Button variant="outline" onClick={() => machines.refetch()}>Reintentar</Button></div> :
      <Panel className="overflow-hidden p-0">
      <TableScroll rows={visible.length} className="overflow-x-auto">
        <Table>
          <TableHeader className={scrollHead}><TableRow className={salesHeader + " bg-muted"}>
            {["Chasis", "Marca", "Modelo", "Arribo", ...Object.values(stages)].map(label => <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {visible.map(machine => <TableRow key={machine.chasis}>
              <TableCell><Button variant="link" size="sm" className="h-auto p-0"
                onClick={() => openStage(machine, stageKeys.find(stage => !machine.controles[stage]?.finalizado && !machine.controles[stage]?.situacion) ?? stageKeys[0])}>
                {machine.chasis}
              </Button></TableCell><TableCell>{machine.marca ?? "—"}</TableCell>
              <TableCell>{machine.modelo || "—"}</TableCell><TableCell>{dateLabel(machine.ata)}</TableCell>
              {stageKeys.map(stage => {
                return <TableCell key={stage} className="whitespace-nowrap">{stageStatus(machine, stage)}</TableCell>;
              })}
            </TableRow>)}
            {!visible.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableScroll></Panel>}
    <ResponsiveDrawer open={!!selection} onOpenChange={open => { if (!open && !save.isPending) setSelection(null); }}
      title={selection?.machine.chasis ?? "Control"}>
      {selection && <>
        <ResponsiveDrawerHeader><h2 className="font-semibold">{[selection.machine.chasis, selection.machine.modelo || selection.machine.marca].filter(Boolean).join(" · ")}</h2></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>
          {selection.machine.conflicto && <div role="status" className="mb-3 text-sm text-muted-foreground">Chasis por conciliar en Importaciones</div>}
          <Panel className="mb-4 overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow className="bg-muted">
                {["Etapa", "Finalización", "Informado", "Situación", "N.º de OS"].map(label => <TableHead key={label}>{label}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>{stageKeys.map(stage => {
                const control = selection.machine.controles[stage];
                return <TableRow key={stage} data-state={selection.stage === stage ? "selected" : undefined}>
                  <TableCell><Button variant="link" size="sm" className="h-auto p-0" disabled={save.isPending}
                    onClick={() => openStage(selection.machine, stage)}>{stages[stage]}</Button></TableCell>
                  <TableCell>{dateLabel(control?.finalizado ?? null)}</TableCell>
                  <TableCell>{dateLabel(control?.informado ?? null)}</TableCell>
                  <TableCell>{stageStatus(selection.machine, stage)}</TableCell>
                  <TableCell>{control?.os_numero ?? "—"}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </Panel>
          {!!selection.machine.historico?.length && <Panel className="mb-4 overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow className="bg-muted">
                {["Fila del Excel", "Etapa", "Finalización", "Informado", "Situación"].map(label => <TableHead key={label}>{label}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>{selection.machine.historico.flatMap(record => stageKeys.flatMap(stage => {
                const control = record.controles[stage];
                if (!control) return [];
                return [<TableRow key={record.fila + stage}>
                  <TableCell>{record.fila}</TableCell><TableCell>{stages[stage]}</TableCell>
                  <TableCell>{dateLabel(control.finalizado)}</TableCell><TableCell>{dateLabel(control.informado)}</TableCell>
                  <TableCell>{control.situacion ?? "—"}</TableCell>
                </TableRow>];
              }))}</TableBody>
            </Table>
          </Panel>}
          <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">{stages[selection.stage]}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">Finalización<Input type="date" value={draft.finalizado ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("finalizado", e.target.value)} /></label>
            <label className="grid gap-1">Informado a fábrica<Input type="date" value={draft.informado ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("informado", e.target.value)} /></label>
            <label className="grid gap-1">Situación<select className="h-10 rounded-md border bg-background px-3"
              value={draft.situacion ?? ""} disabled={!canEdit || save.isPending} onChange={e => setField("situacion", e.target.value)}>
              <option value="">—</option>{["Finalizado", "A cobrar", "Cobrado"].map(value => <option key={value}>{value}</option>)}
            </select></label>
            {canEdit && <label className="grid gap-1">Buscar OS<Input value={orderSearch}
              onChange={event => setOrderSearch(event.target.value)} disabled={!orders.data || save.isPending} /></label>}
            <label className="grid gap-1">N.º de OS<select className="h-10 rounded-md border bg-background px-3"
              value={draft.os_numero ?? ""} disabled={!canEdit || save.isPending || !orders.data} onChange={e => setField("os_numero", e.target.value)}>
              <option value="">—</option>
              {draft.os_numero && !matchedOrders.some(item => item.numero === draft.os_numero) && <option>{draft.os_numero}</option>}
              {matchedOrders.map(item => <option key={item.numero}>{item.numero}</option>)}
            </select></label>
          </div>
          {orderSearch.trim() && !matchedOrders.length && <div role="status" className="text-sm text-muted-foreground">Sin coincidencias para este chasis</div>}
          </fieldset>
          {orders.isError && <div role="alert" className="mt-3">No se pudieron cargar las OS. <Button variant="outline" onClick={() => orders.refetch()}>Reintentar</Button></div>}
          {order && <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries({ Responsable: order.responsable, Técnicos: order.tecnicos.join(", "), Estado: order.estado, Descripción: order.problema })
              .map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value || "—"}</dd></div>)}
          </dl>}
        </ResponsiveDrawerBody>
        {canEdit && <ResponsiveDrawerFooter>
          <Button disabled={save.isPending || !changed}
            onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
        </ResponsiveDrawerFooter>}
      </>}
    </ResponsiveDrawer>
  </PageShell>;
}
