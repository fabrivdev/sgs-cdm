import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, Panel } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
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

function isComplete(control?: Control) {
  return Boolean(control?.finalizado || control?.situacion);
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
  const [chassis, setChassis] = useState<string | null>(null);
  const machine = machines.data?.find(row => row.chasis === chassis);
  const canEdit = !!machine?.habilitada && roles.some(role => ["admin", "superadmin", "jefatura", "gerencia"].includes(role));
  const orders = useQuery({
    queryKey: ["machine-check-orders", user?.id, chassis],
    queryFn: () => rpc<Order[]>("servicios_controles_os", { p_chasis: chassis }),
    enabled: !!machine?.habilitada,
  });
  const visible = (machines.data ?? []).filter(machine =>
    (brand === "todas" || machine.marca === brand)
    && (pendingStage === "todas" || (machine.habilitada
      && !machine.controles[pendingStage as Stage]?.finalizado
      && !machine.controles[pendingStage as Stage]?.situacion))
    && [machine.chasis, machine.modelo].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));

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
                onClick={() => setChassis(machine.chasis)}>
                {machine.chasis}
              </Button></TableCell><TableCell>{machine.marca ?? "—"}</TableCell>
              <TableCell>{machine.modelo || "—"}</TableCell><TableCell>{dateLabel(machine.ata)}</TableCell>
              {stageKeys.map(stage => <TableCell key={stage}>
                <Checkbox checked={isComplete(machine.controles[stage]) ? true
                  : !machine.habilitada || machine.historico?.length ? "indeterminate" : false}
                  aria-label={stages[stage] + " de " + machine.chasis}
                  onCheckedChange={() => setChassis(machine.chasis)} />
              </TableCell>)}
            </TableRow>)}
            {!visible.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableScroll></Panel>}
    <ResponsiveDrawer open={!!machine} onOpenChange={open => { if (!open) setChassis(null); }}
      title={machine?.chasis ?? "Control"}>
      {machine && <>
        <ResponsiveDrawerHeader><h2 className="font-semibold">{[machine.chasis, machine.modelo || machine.marca].filter(Boolean).join(" · ")}</h2></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-3">
          {machine.conflicto && <div role="status" className="text-sm text-muted-foreground">Chasis por conciliar en Importaciones</div>}
          {orders.isError && <div role="alert">No se pudieron cargar las OS. <Button variant="outline" onClick={() => orders.refetch()}>Reintentar</Button></div>}
          {stageKeys.map(stage => <StageControl key={machine.chasis + stage} stage={stage}
            chassis={machine.chasis} saved={machine.controles[stage] ?? empty} canEdit={canEdit}
            orders={orders.data} refresh={() => cache.invalidateQueries({ queryKey: key })} />)}
          {!!machine.historico?.length && <Panel className="mb-4 overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow className="bg-muted">
                {["Fila del Excel", "Etapa", "Finalización", "Informado", "Situación"].map(label => <TableHead key={label}>{label}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>{machine.historico.flatMap(record => stageKeys.flatMap(stage => {
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
        </ResponsiveDrawerBody>
      </>}
    </ResponsiveDrawer>
  </PageShell>;
}

function StageControl({ stage, chassis, saved, canEdit, orders, refresh }: {
  stage: Stage;
  chassis: string;
  saved: Control;
  canEdit: boolean;
  orders?: Order[];
  refresh: () => Promise<void>;
}) {
  const [edited, setEdited] = useState<Control | null>(null);
  const [search, setSearch] = useState("");
  const draft = edited ?? saved;
  const save = useMutation({
    mutationFn: () => rpc("servicios_controles_guardar", {
      p_chasis: chassis, p_etapa: stage, p_finalizado: draft.finalizado, p_informado: draft.informado,
      p_situacion: draft.situacion, p_os: draft.os_numero, p_version: draft.actualizado,
    }),
    onSuccess: async () => {
      await refresh();
      setEdited(null);
      toast.success("Control guardado");
    },
    onError: error => toast.error(error.message),
  });
  const update = (field: keyof Control, value: string) => setEdited({ ...draft, [field]: value || null });
  const toggle = (checked: boolean) => setEdited(checked
    ? { ...draft, situacion: draft.situacion ?? "Finalizado" }
    : { ...draft, finalizado: null, situacion: null });
  const order = orders?.find(item => item.numero === draft.os_numero);
  const matches = orders?.filter(item => item.numero.includes(search.trim())) ?? [];
  const disabled = !canEdit || save.isPending;
  return <Panel>
    <div className="mb-3 flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 font-medium">
        <Checkbox checked={isComplete(draft)} disabled={disabled} onCheckedChange={value => toggle(value === true)} />
        {stages[stage]}
      </label>
      {canEdit && <Button size="sm" disabled={disabled || JSON.stringify(draft) === JSON.stringify(saved)}
        onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar"}</Button>}
    </div>
    {canEdit ? <div className="grid gap-2 sm:grid-cols-3 text-sm">
      <label className="grid gap-1">Finalización<Input type="date" value={draft.finalizado ?? ""} disabled={disabled} onChange={event => update("finalizado", event.target.value)} /></label>
      <label className="grid gap-1">Informado a fábrica<Input type="date" value={draft.informado ?? ""} disabled={disabled} onChange={event => update("informado", event.target.value)} /></label>
      <label className="grid gap-1">Situación<select className="h-10 rounded-md border bg-background px-2"
        value={draft.situacion ?? ""} disabled={disabled} onChange={event => update("situacion", event.target.value)}>
        <option value="">—</option>{["Finalizado", "A cobrar", "Cobrado"].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label className="grid gap-1">Buscar OS<Input value={search} disabled={disabled || !orders} onChange={event => setSearch(event.target.value)} /></label>
      <label className="grid gap-1 sm:col-span-2">N.º de OS<select className="h-10 rounded-md border bg-background px-2"
        value={draft.os_numero ?? ""} disabled={disabled || !orders} onChange={event => update("os_numero", event.target.value)}>
        <option value="">—</option>
        {draft.os_numero && !matches.some(item => item.numero === draft.os_numero) && <option>{draft.os_numero}</option>}
        {matches.map(item => <option key={item.numero}>{item.numero}</option>)}
      </select></label>
      {search.trim() && !matches.length && <div role="status" className="text-muted-foreground sm:col-span-3">Sin coincidencias para este chasis</div>}
    </div> : <CheckDetails fields={{
      Finalización: dateLabel(draft.finalizado), "Informado a fábrica": dateLabel(draft.informado),
      Situación: draft.situacion, "N.º de OS": draft.os_numero,
    }} />}
    {order && <CheckDetails fields={{ Responsable: order.responsable, Técnicos: order.tecnicos.join(", "), Estado: order.estado, Descripción: order.problema }} />}
  </Panel>;
}

function CheckDetails({ fields }: { fields: Record<string, string | null> }) {
  return <dl className="grid gap-2 text-sm sm:grid-cols-2">
    {Object.entries(fields).map(([label, value]) => <div key={label}>
      <dt className="text-muted-foreground">{label}</dt><dd>{value || "—"}</dd>
    </div>)}
  </dl>;
}
