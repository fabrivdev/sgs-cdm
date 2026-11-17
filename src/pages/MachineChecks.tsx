import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, Panel } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MarcaBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
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
  situacion_chasis?: keyof typeof chassisStatuses | null;
  conflicto?: boolean; historico?: { fila: number; controles: Partial<Record<Stage, Control>> }[];
  controles: Partial<Record<Stage, Control>> };
type Order = { numero: string; responsable: string | null; estado: string | null; problema: string | null; tecnicos: string[] };
const empty: Control = { finalizado: null, informado: null, situacion: null, os_numero: null, actualizado: null };
const stageKeys = Object.keys(stages) as Stage[];
const dateLabel = (value: string | null) => value?.split("-").reverse().join("/") ?? "—";
const initialFilters = { search: "", brand: "", stage: "", status: "", equipment: "", from: "", to: "" };
const chassisStatuses = {
  parque: { label: "En parque", color: "border-teal-200 bg-teal-50 text-teal-700" },
  pedido: { label: "Con pedido", color: "border-blue-200 bg-blue-50 text-blue-700" },
  stock: { label: "Stock", color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};
const options = (all: string, values: Record<string, string>) => [
  { value: "todas", label: all }, ...Object.entries(values).map(([value, label]) => ({ value, label })),
];

function isComplete(control?: Control) {
  return Boolean(control?.finalizado || control?.situacion);
}

function checkDisabled(machine: Machine, stage: Stage) {
  return machine.marca === "CLAAS" && stage === "recibimiento";
}

const exportColumns: SalesColumn<Machine>[] = [
  { key: "chasis", label: "Chasis", kind: "text", value: row => row.chasis },
  { key: "marca", label: "Marca", kind: "text", value: row => row.marca },
  { key: "modelo", label: "Modelo", kind: "text", value: row => row.modelo },
  { key: "situacion", label: "Situación", kind: "text", value: row => row.situacion_chasis ? chassisStatuses[row.situacion_chasis].label : null },
  { key: "arribo", label: "Arribo", kind: "date", value: row => row.ata },
  ...stageKeys.map((stage): SalesColumn<Machine> => ({
    key: stage, label: stages[stage], kind: "text",
    value: row => checkDisabled(row, stage) ? null : isComplete(row.controles[stage]) ? "Sí" : "No",
  })),
];

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
  const { user, roles, can } = useAuth();
  const cache = useQueryClient();
  const key = ["machine-checks", user?.id];
  const machines = useQuery({ queryKey: key, queryFn: () => rpc<Machine[]>("servicios_controles_listar") });
  const [filters, setFilters] = useState(initialFilters);
  const change = (field: keyof typeof filters) => (value: string) =>
    setFilters(previous => ({ ...previous, [field]: field !== "search" && value === "todas" ? "" : value }));
  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  const [chassis, setChassis] = useState<string | null>(null);
  const machine = machines.data?.find(row => row.chasis === chassis);
  const canEdit = !!machine?.habilitada && roles.some(role => ["admin", "superadmin", "jefatura", "gerencia"].includes(role));
  const orders = useQuery({
    queryKey: ["machine-check-orders", user?.id, chassis],
    queryFn: () => rpc<Order[]>("servicios_controles_os", { p_chasis: chassis }),
    enabled: !!machine?.habilitada,
  });
  const visible = (machines.data ?? []).filter(machine => {
    if (filters.brand && machine.marca !== filters.brand) return false;
    const equipment = machine.conflicto ? "conciliar" : machine.habilitada ? "habilitados" : "historico";
    if (filters.equipment && equipment !== filters.equipment) return false;
    if (filters.from && (!machine.ata || machine.ata < filters.from)) return false;
    if (filters.to && (!machine.ata || machine.ata > filters.to)) return false;
    const selectedStages = filters.stage ? [filters.stage as Stage] : stageKeys;
    if (filters.status && !selectedStages.some(stage => {
      const control = machine.controles[stage];
      switch (filters.status) {
        case "pendiente": return machine.habilitada && !isComplete(control) && !machine.historico?.length;
        case "sin-os": return isComplete(control) && !control?.os_numero;
        case "sin-informar": return !!control?.finalizado && !control.informado;
        case "a-cobrar": return control?.situacion === "A cobrar";
        case "cobrado": return control?.situacion === "Cobrado";
        default: return isComplete(control);
      }
    })) return false;
    const search = filters.search.trim().toLowerCase();
    return !search || [machine.chasis, machine.modelo, ...selectedStages.map(stage => machine.controles[stage]?.os_numero)]
      .some(value => value?.toLowerCase().includes(search));
  });

  return <PageShell>
    <PageHeader title="Puesta a punto" />
    <FiltersBar search={{ value: filters.search, onChange: change("search"), placeholder: "Chasis, modelo o N.º de OS" }}
      secondaryActions={can("datos:exportar") && <SectionActionsMenu options={[{
        id: "puesta-a-punto", label: "Exportar a Excel",
        disabled: invalidRange || machines.isPending || machines.isError || !visible.length,
        onSelect: async () => {
          const { exportSalesTable } = await import("@/components/ventas/salesTableExport");
          exportSalesTable({ rows: visible, columns: exportColumns, fileName: "puesta-a-punto.xlsx", sheetName: "Puesta a punto" });
        },
      }]} />}
      activeCount={Object.values(filters).filter(value => value.trim()).length}
      onClear={() => setFilters(initialFilters)}
      expanded={<>
        <FilterSelect label="Equipos" value={filters.equipment || "todas"} onChange={change("equipment")} placeholder="Todos"
          options={options("Todos", { habilitados: "Habilitados", historico: "Histórico", conciliar: "Chasis por conciliar" })} />
        <FilterDate label="Arribo desde" value={filters.from} onChange={change("from")} max={filters.to || undefined} />
        <FilterDate label="Arribo hasta" value={filters.to} onChange={change("to")} min={filters.from || undefined} />
      </>}>
      <FilterSelect label="Marca" value={filters.brand || "todas"} onChange={change("brand")} placeholder="Todas"
        options={options("Todas", { CLAAS: "CLAAS", HORSCH: "HORSCH" })} />
      <FilterSelect label="Etapa" value={filters.stage || "todas"} onChange={value =>
        setFilters(previous => ({ ...previous, stage: value === "todas" ? "" : value, status: value === "todas" ? previous.status : previous.status || "pendiente" }))}
        placeholder="Todas" options={options("Todas", stages)} />
      <FilterSelect label="Estado de la etapa" value={filters.status || "todas"} onChange={change("status")} placeholder="Todos"
        options={options("Todos", { pendiente: "Pendiente", realizada: "Realizada", "sin-os": "Realizada sin OS",
          "sin-informar": "Sin informar a fábrica", "a-cobrar": "A cobrar", cobrado: "Cobrado" })} />
    </FiltersBar>
    {invalidRange ? <p role="alert" className="text-sm text-destructive">El arribo desde debe ser anterior o igual al arribo hasta.</p>
      : machines.isPending ? <Panel className="p-0">
      <LoadingScreen variant="section" />
    </Panel> : machines.isError ?
      <div role="alert">No se pudieron cargar los controles. <Button variant="outline" onClick={() => machines.refetch()}>Reintentar</Button></div> :
      <Panel className="overflow-hidden p-0">
      <TableScroll rows={visible.length} className="overflow-x-auto">
        <Table>
          <TableHeader className={scrollHead}><TableRow className={salesHeader + " bg-muted"}>
            {["Chasis", "Marca", "Modelo", "Situación", "Arribo"].map(label => <TableHead key={label}>{label}</TableHead>)}
            {Object.values(stages).map(label => <TableHead key={label} className="text-center">{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {visible.map(machine => <TableRow key={machine.chasis}>
              <TableCell><Button variant="link" size="sm" className="h-auto p-0"
                onClick={() => setChassis(machine.chasis)}>
                {machine.chasis}
              </Button></TableCell><TableCell>{machine.marca ? <MarcaBadge marca={machine.marca} /> : "—"}</TableCell>
              <TableCell>{machine.modelo || "—"}</TableCell>
              <TableCell><ChassisStatus status={machine.situacion_chasis} /></TableCell>
              <TableCell>{dateLabel(machine.ata)}</TableCell>
              {stageKeys.map(stage => <TableCell key={stage} className="text-center [&:has([role=checkbox])]:px-3">
                <div className="flex justify-center">
                <Checkbox checked={isComplete(machine.controles[stage])}
                  disabled={checkDisabled(machine, stage)}
                  aria-label={stages[stage] + " de " + machine.chasis}
                  onCheckedChange={() => setChassis(machine.chasis)} />
                </div>
              </TableCell>)}
            </TableRow>)}
            {!visible.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableScroll></Panel>}
    <ResponsiveDrawer open={!!machine} onOpenChange={open => { if (!open) setChassis(null); }}
      title={machine?.chasis ?? "Control"}>
      {machine && <>
        <ResponsiveDrawerHeader><h2 className="font-semibold">{[machine.chasis, machine.modelo || machine.marca].filter(Boolean).join(" · ")}</h2></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-3">
          {machine.conflicto && <div role="status" className="text-sm text-muted-foreground">Chasis por conciliar en Importaciones</div>}
          {!machine.habilitada && !machine.conflicto && <div role="status" className="text-sm text-muted-foreground">Histórico · Solo consulta</div>}
          {orders.isError && <div role="alert">No se pudieron cargar las OS. <Button variant="outline" onClick={() => orders.refetch()}>Reintentar</Button></div>}
          {stageKeys.filter(stage => !checkDisabled(machine, stage)).map(stage => <StageControl key={machine.chasis + stage} stage={stage}
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

function ChassisStatus({ status }: { status: Machine["situacion_chasis"] }) {
  if (!status) return "—";
  const { label, color } = chassisStatuses[status];
  return <Badge variant="outline" className={`whitespace-nowrap text-[10px] ${color}`}>{label}</Badge>;
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
  const draft = edited ?? saved;
  const osNumber = draft.os_numero?.trim() || null;
  const order = orders?.find(item => item.numero === osNumber);
  const osChanged = osNumber !== saved.os_numero;
  const osError = osChanged && osNumber
    ? !/^\d{2}-\d+$/.test(osNumber)
      ? "Usá el formato 01-00000034."
      : orders && !order ? "La OS no figura para este chasis." : null
    : null;
  const save = useMutation({
    mutationFn: () => rpc("servicios_controles_guardar", {
      p_chasis: chassis, p_etapa: stage, p_finalizado: draft.finalizado, p_informado: draft.informado,
      p_situacion: draft.situacion, p_os: osNumber, p_version: draft.actualizado,
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
  const disabled = !canEdit || save.isPending;
  return <Panel>
    <div className="mb-3 flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 font-medium">
        <Checkbox checked={isComplete(draft)} disabled={disabled} onCheckedChange={value => toggle(value === true)} />
        {stages[stage]}
      </label>
      {canEdit && <Button size="sm" disabled={disabled || !!osError || (osChanged && !!osNumber && !order) || JSON.stringify(draft) === JSON.stringify(saved)}
        onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar"}</Button>}
    </div>
    {canEdit ? <div className="grid gap-2 sm:grid-cols-3 text-sm">
      <label className="grid gap-1">Finalización<Input type="date" value={draft.finalizado ?? ""} disabled={disabled} onChange={event => update("finalizado", event.target.value)} /></label>
      <label className="grid gap-1">Informado a fábrica<Input type="date" value={draft.informado ?? ""} disabled={disabled} onChange={event => update("informado", event.target.value)} /></label>
      <label className="grid gap-1">Situación<select className="h-10 rounded-md border bg-background px-2"
        value={draft.situacion ?? ""} disabled={disabled} onChange={event => update("situacion", event.target.value)}>
        <option value="">—</option>{["Finalizado", "A cobrar", "Cobrado"].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label className="grid gap-1">N.º de OS
        <Input placeholder="01-00000034" autoComplete="off" value={draft.os_numero ?? ""}
          aria-invalid={!!osError} disabled={disabled} onChange={event => update("os_numero", event.target.value)} />
      </label>
      {osError && <div role="status" className="self-end pb-2 text-destructive sm:col-span-2">{osError}</div>}
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
