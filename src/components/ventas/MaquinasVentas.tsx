import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { PeriodMode } from "@/components/dashboard/types";
import { money } from "@/components/dashboard/utils";
import { Panel } from "@/components/layout/AppPrimitives";
import { Badge } from "@/components/ui/badge";
import { MachineHistorySheet } from "@/components/ventas/MachineHistorySheet";
import { cn } from "@/lib/utils";

export type MaquinaVentaLinea = {
  id: string;
  fecha: string;
  factura: string;
  cliente_facturado: string;
  sucursal: string | null;
  facturado: number;
  es_nota_credito: boolean;
  unidades: number;
  marca: string;
  tipo_maquina: string;
  modelo: string;
  chasis: string | null;
  propietario: string;
  operacion_id: string | null;
  np_numero: string | null;
  np_fecha: string | null;
  np_cliente: string | null;
  comercial: string | null;
  condicion: string | null;
  vinculo_np: "FACTURA_Y_CHASIS" | "CHASIS" | "PEDIDO_HISTORICO" | null;
  metodologia: "historico" | "actual";
  origen?: "Sistema anterior" | "Sistema actual";
  cod_mercaderia?: string | null;
  descripcion?: string | null;
};

export type MaquinasResumen = {
  total: number;
  facturas: number;
  clientes: number;
  vendidas: number;
  notas_credito: number;
  netas: number;
  promedio_unidad: number;
  con_np: number;
  sin_np: number;
  venta_bruta?: number;
  notas_credito_monto?: number;
};

export type MaquinasDashboardResponse = {
  resumen: MaquinasResumen;
  periodos: Array<MaquinasResumen & { periodo: string }>;
  por_maquina: Array<MaquinasResumen & { marca: string; tipo_maquina: string }>;
  por_modelo: Array<MaquinasResumen & { marca: string; tipo_maquina: string; modelo: string }>;
  lineas: MaquinaVentaLinea[];
  dimensiones: { marcas: string[]; tipos: string[] };
  comparacion?: { desde: string; hasta: string; total: number; netas: number; vendidas: number; notas_credito_monto: number };
};

type ExplorerView = "resumen" | "clientes" | "maquinas" | "detalle";
type SummaryRow = MaquinasResumen & { key: string; marca?: string; tipo?: string; modelo?: string };

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = (value: string) => value.slice(0, 10).split("-").reverse().join("/");

function summarize(lines: MaquinaVentaLinea[]): MaquinasResumen {
  const facturas = new Set<string>();
  const clientes = new Set<string>();
  let total = 0;
  let vendidas = 0;
  let notasCredito = 0;
  let netas = 0;
  let conNp = 0;
  let sinNp = 0;
  let gross = 0;
  let creditAmount = 0;
  for (const line of lines) {
    const units = Number(line.unidades || 0);
    total += Number(line.facturado || 0);
    if (Number(line.facturado || 0) > 0) gross += Number(line.facturado || 0);
    if (Number(line.facturado || 0) < 0) creditAmount += Math.abs(Number(line.facturado || 0));
    if (units > 0) vendidas += units;
    if (units < 0) notasCredito += Math.abs(units);
    netas += units;
    facturas.add(line.factura);
    clientes.add(line.cliente_facturado);
    if (line.np_numero) conNp += 1;
    else sinNp += 1;
  }
  return {
    total,
    facturas: facturas.size,
    clientes: clientes.size,
    vendidas,
    notas_credito: notasCredito,
    netas,
    promedio_unidad: netas ? total / netas : 0,
    con_np: conNp,
    sin_np: sinNp,
    venta_bruta: gross,
    notas_credito_monto: creditAmount,
  };
}

function group(lines: MaquinaVentaLinea[], keyOf: (line: MaquinaVentaLinea) => string) {
  const groups = new Map<string, MaquinaVentaLinea[]>();
  for (const line of lines) {
    const key = keyOf(line);
    const current = groups.get(key) ?? [];
    current.push(line);
    groups.set(key, current);
  }
  return groups;
}

function periodLabel(value: string, mode: PeriodMode) {
  const date = new Date(`${value}T00:00:00`);
  if (mode === "dia") return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short" }).format(date);
  if (mode === "semana") return `Sem. ${new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short" }).format(date)}`;
  if (mode === "anio") return String(date.getFullYear());
  return new Intl.DateTimeFormat("es-PY", { month: "short", year: "numeric" }).format(date);
}

export function MaquinasPanorama({ data, loading, error, periodMode, selectedPeriod, onSelectPeriod }: {
  data: MaquinasDashboardResponse | null;
  loading: boolean;
  error: string | null;
  periodMode: PeriodMode;
  selectedPeriod: string | null;
  onSelectPeriod: (period: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = Number(data?.resumen.total || 0);
  const grid = "grid-cols-[minmax(120px,1.2fr)_minmax(115px,1fr)_repeat(3,minmax(90px,.8fr))_repeat(2,minmax(80px,.75fr))_repeat(2,minmax(90px,.8fr))]";
  return <Panel className="p-3">
    <button type="button" onClick={() => setCollapsed(value => !value)} className="flex w-full items-start justify-between gap-2 text-left">
      <h2 className="text-[13px] font-semibold">Facturación por período</h2>
      <div className="flex items-center gap-2">
        {selectedPeriod && <span role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onSelectPeriod(null); }} className="rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</span>}
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </div>
    </button>
    {!collapsed && (loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando facturación…</div>
      : error ? <div role="alert" className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : !data?.periodos.length ? <div className="py-8 text-center text-[12px] text-muted-foreground">No hay ventas de máquinas para este rango.</div>
      : <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1040px]">
        <div className={`grid ${grid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
          <div>Período</div>
          {['Facturado', 'Vendidas', 'Notas de crédito', 'Unidades netas', 'Clientes', 'Facturas', 'Con NP', 'Participación'].map(label => <div key={label} className="whitespace-nowrap text-right">{label}</div>)}
        </div>
        {data.periodos.map(row => <button key={row.periodo} type="button" onClick={() => onSelectPeriod(selectedPeriod === row.periodo ? null : row.periodo)} className={cn(`grid w-full ${grid} items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent`, selectedPeriod === row.periodo && "bg-primary/5 outline outline-1 outline-primary/20")}>
          <div className="truncate font-medium capitalize">{periodLabel(row.periodo, periodMode)}</div>
          <div className="text-right font-semibold tabular-nums">{money(Number(row.total))}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(row.vendidas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{decimal.format(Number(row.notas_credito))}</div>
          <div className="text-right font-medium tabular-nums">{decimal.format(Number(row.netas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{integer.format(Number(row.clientes))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{integer.format(Number(row.facturas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{integer.format(Number(row.con_np))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(Number(row.total) / total * 100)}%` : "—"}</div>
        </button>)}
      </div></div>)}
  </Panel>;
}

function change(current: number, previous: number) {
  if (!previous) return null;
  return (current / previous - 1) * 100;
}

function deltaLabel(current: number, previous: number) {
  const value = change(current, previous);
  return value == null ? "Sin base comparable" : `${value >= 0 ? "+" : ""}${decimal.format(value)}%`;
}

function MixList({ title, rows, total }: { title: string; rows: Array<{ key: string; amount: number; units: number }>; total: number }) {
  const maximum = Math.max(0, ...rows.map(row => Math.max(0, row.amount)));
  return <section className="rounded-md border p-3">
    <h3 className="text-[11px] font-semibold">{title}</h3>
    <div className="mt-2 space-y-2.5">
      {rows.slice(0, 6).map(row => {
        const share = total ? row.amount / total * 100 : 0;
        return <div key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-[10px]"><span className="truncate font-medium" title={row.key}>{row.key}</span><span className="shrink-0 tabular-nums"><strong>{money(row.amount)}</strong> · {decimal.format(row.units)} un. · {decimal.format(share)}%</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${maximum ? Math.max(0, row.amount) / maximum * 100 : 0}%` }} /></div>
        </div>;
      })}
      {!rows.length && <div className="py-5 text-center text-[10px] text-muted-foreground">Sin datos en el período.</div>}
    </div>
  </section>;
}

function SummaryView({ summary, lines, comparison }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[]; comparison: MaquinasDashboardResponse["comparacion"] | null }) {
  const coverage = summary.con_np + summary.sin_np ? summary.con_np / (summary.con_np + summary.sin_np) * 100 : 0;
  const brands = useMemo(() => [...group(lines, line => line.marca)].map(([key, values]) => ({ key, amount: summarize(values).total, units: summarize(values).netas })).sort((a, b) => b.amount - a.amount), [lines]);
  const types = useMemo(() => [...group(lines, line => line.tipo_maquina)].map(([key, values]) => ({ key, amount: summarize(values).total, units: summarize(values).netas })).sort((a, b) => b.amount - a.amount), [lines]);
  const clients = useMemo(() => [...group(lines, line => line.cliente_facturado)].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => b.total - a.total), [lines]);
  const historical = lines.filter(line => line.metodologia === "historico").reduce((sum, line) => sum + Number(line.facturado || 0), 0);
  const current = summary.total - historical;
  return <div className="mt-3 space-y-3">
    <section className="overflow-hidden rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-2"><h3 className="text-[11px] font-semibold">Cómo se forma la venta del período</h3></div>
      <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="p-3"><div className="text-[10px] text-muted-foreground">Ventas emitidas</div><div className="mt-1 text-[18px] font-semibold tabular-nums">{money(Number(summary.venta_bruta ?? 0))}</div><div className="mt-1 text-[10px] text-muted-foreground">{decimal.format(summary.vendidas)} unidades vendidas</div></div>
        <div className="p-3"><div className="text-[10px] text-muted-foreground">Notas de crédito</div><div className="mt-1 text-[18px] font-semibold tabular-nums text-amber-700">-{money(Number(summary.notas_credito_monto ?? 0))}</div><div className="mt-1 text-[10px] text-muted-foreground">{decimal.format(summary.notas_credito)} unidades revertidas</div></div>
        <div className="p-3"><div className="text-[10px] text-muted-foreground">Facturación neta</div><div className="mt-1 text-[18px] font-semibold tabular-nums">{money(summary.total)}</div><div className="mt-1 text-[10px] text-muted-foreground">{decimal.format(summary.netas)} unidades netas · {integer.format(summary.facturas)} facturas</div></div>
      </div>
      {comparison && <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[10px]"><span className="text-muted-foreground">Contra {shortDate(comparison.desde)}–{shortDate(comparison.hasta)}</span><span><strong>{deltaLabel(summary.total, Number(comparison.total))}</strong> en facturación · <strong>{deltaLabel(summary.netas, Number(comparison.netas))}</strong> en unidades netas</span></div>}
    </section>
    <div className="grid gap-3 lg:grid-cols-2">
      <MixList title="Facturación por marca" rows={brands} total={summary.total} />
      <MixList title="Mix por tipo de máquina" rows={types} total={summary.total} />
    </div>
    <section className="grid overflow-hidden rounded-md border md:grid-cols-3 md:divide-x">
      <div className="p-3"><div className="text-[10px] text-muted-foreground">Principal cliente facturado</div><div className="mt-1 truncate text-[12px] font-semibold" title={clients[0]?.key}>{clients[0]?.key ?? "—"}</div><div className="mt-1 text-[10px] tabular-nums text-muted-foreground">{clients[0] ? `${money(clients[0].total)} · ${summary.total ? decimal.format(clients[0].total / summary.total * 100) : 0}% del neto` : "Sin ventas"}</div></div>
      <div className="p-3"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="text-muted-foreground">Trazabilidad con nota de pedido</span><strong>{decimal.format(coverage)}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${coverage}%` }} /></div><div className="mt-1 text-[10px] text-muted-foreground">{summary.con_np} máquinas con pedido · {summary.sin_np} sin vínculo</div></div>
      <div className="p-3"><div className="text-[10px] text-muted-foreground">Origen de la facturación</div><div className="mt-1 text-[11px]"><span className="font-semibold">{money(historical)}</span> sistema anterior</div><div className="mt-1 text-[11px]"><span className="font-semibold">{money(current)}</span> sistema actual</div></div>
    </section>
  </div>;
}

function MachinesTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = lines.reduce((sum, line) => sum + Number(line.facturado || 0), 0);
  const rows = useMemo(() => [...group(lines, line => `${line.marca}__${line.tipo_maquina}`)].map(([key, values]) => {
    const [marca, tipo] = key.split("__");
    return { key, marca, tipo, ...summarize(values) };
  }).sort((a, b) => b.total - a.total), [lines]);
  const modelRows = useMemo(() => [...group(lines, line => `${line.marca}__${line.tipo_maquina}__${line.modelo}`)].map(([key, values]) => {
    const [marca, tipo, ...model] = key.split("__");
    return { key, marca, tipo, modelo: model.join("__"), ...summarize(values) };
  }), [lines]);
  const grid = "grid-cols-[34px_minmax(110px,1fr)_minmax(180px,1.4fr)_repeat(5,minmax(78px,.72fr))_minmax(115px,1fr)_minmax(110px,.9fr)_80px]";
  return <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1160px]">
    <div className={`grid ${grid} items-center bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div />{['Marca', 'Tipo de máquina', 'Vendidas', 'NC', 'Netas', 'Clientes', 'Facturas', 'Facturación', 'Promedio / unidad neta', 'Participación neta'].map(label => <div key={label} className={label === 'Marca' || label === 'Tipo de máquina' ? '' : 'text-right'}>{label}</div>)}</div>
    {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div> : rows.map(row => {
      const open = expanded === row.key;
      const models = modelRows.filter(model => model.marca === row.marca && model.tipo === row.tipo).sort((a, b) => b.total - a.total);
      const cells = (item: SummaryRow, model = false) => <>
        <div className={cn("truncate", !model && "font-medium")}>{model ? item.modelo : item.marca}</div>
        <div className="truncate" title={model ? item.modelo : item.tipo}>{model ? "Modelo" : item.tipo}</div>
        <div className="text-right tabular-nums">{decimal.format(item.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(item.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(item.netas)}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(item.clientes)}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(item.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(item.total)}</div><div className="text-right tabular-nums text-muted-foreground">{item.netas ? money(item.total / item.netas) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(item.total / total * 100)}%` : "—"}</div>
      </>;
      return <div key={row.key}>
        <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.key)} className={`grid w-full ${grid} items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent`}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />{cells(row)}</button>
        {open && models.map(model => <div key={model.key} className={`grid ${grid} items-center border-t bg-muted/20 px-3 py-1.5 text-[11px]`}><div />{cells(model, true)}</div>)}
      </div>;
    })}
  </div></div>;
}

function ClientsTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const [perspective, setPerspective] = useState<"facturado" | "np">("facturado");
  const rows = useMemo(() => [...group(lines, line => perspective === "facturado" ? line.cliente_facturado : (line.np_cliente || "Sin cliente de NP"))].map(([cliente, values]) => ({ cliente, ultima: values.reduce((max, line) => line.fecha > max ? line.fecha : max, ""), ...summarize(values) })).sort((a, b) => Number(a.cliente.startsWith("Sin ")) - Number(b.cliente.startsWith("Sin ")) || b.total - a.total), [lines, perspective]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const grid = "grid-cols-[minmax(240px,1.7fr)_repeat(5,minmax(85px,.75fr))_minmax(120px,1fr)_90px_85px]";
  return <div className="mt-3 space-y-2">
    <label className="flex items-center gap-2 text-[11px]">Agrupar por <select aria-label="Agrupar clientes de máquinas por" value={perspective} onChange={event => setPerspective(event.target.value as "facturado" | "np")} className="h-8 rounded-md border bg-background px-2 text-[11px]"><option value="facturado">Clientes facturados</option><option value="np">Clientes de la NP</option></select></label>
    <div className="overflow-x-auto rounded-md border"><div className="min-w-[1050px]">
      <div className={`grid ${grid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Cliente</div>{['Vendidas', 'NC', 'Netas', 'Facturas', 'Última venta', 'Promedio / unidad neta', 'Facturación', 'Participación neta'].map(label => <div key={label} className="text-right">{label}</div>)}</div>
      {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes en el período.</div> : rows.map(row => <div key={row.cliente} className={`grid ${grid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium" title={row.cliente}>{row.cliente}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(row.facturas)}</div><div className="text-right tabular-nums text-muted-foreground">{row.ultima ? shortDate(row.ultima) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{row.netas ? money(row.total / row.netas) : "—"}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(row.total / total * 100)}%` : "—"}</div></div>)}
    </div></div>
  </div>;
}

function DetailTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const [history, setHistory] = useState<{ chassis: string | null; os: string | null } | null>(null);
  return <>
    <div className="mt-3 overflow-x-auto rounded-md border"><table className="w-full min-w-[1420px] text-[11px] [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
      <thead className="bg-muted/60 text-left text-muted-foreground"><tr><th>Fecha</th><th>Factura</th><th>NP</th><th className="w-[260px]">Cliente</th><th>Marca / tipo</th><th>Modelo</th><th>Chasis</th><th>Condición</th><th>Comercial</th><th>Situación</th><th className="text-right">Facturado</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.id} className="border-t">
        <td className="whitespace-nowrap">{shortDate(line.fecha)}</td>
        <td><span className="font-mono font-medium">{line.factura}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{line.origen ?? (line.metodologia === "historico" ? "Sistema anterior" : "Sistema actual")}</span></td>
        <td>{line.operacion_id ? <Link to={`/parque-operaciones?operacion=${encodeURIComponent(line.operacion_id)}`} className="inline-flex items-center gap-1 whitespace-nowrap font-mono font-medium text-primary hover:underline">{line.np_numero || "Abrir NP"}<ExternalLink className="h-3 w-3" /></Link> : line.np_numero ? <span className="whitespace-nowrap font-mono font-medium">{line.np_numero}</span> : <span className="text-muted-foreground">Sin NP</span>}<span className="mt-0.5 block text-[9px] text-muted-foreground">{line.vinculo_np === "FACTURA_Y_CHASIS" ? "Factura + chasis" : line.vinculo_np === "CHASIS" ? "Por chasis" : line.vinculo_np === "PEDIDO_HISTORICO" ? "Pedido del sistema anterior" : ""}</span></td>
        <td><div className="truncate font-medium" title={line.cliente_facturado}>{line.cliente_facturado}</div>{line.np_cliente && line.np_cliente !== line.cliente_facturado && <div className="truncate text-[9px] text-muted-foreground" title={line.np_cliente}>NP: {line.np_cliente}</div>}</td>
        <td><div className="font-medium">{line.marca}</div><div className="text-[9px] text-muted-foreground">{line.tipo_maquina}</div></td>
        <td className="max-w-[180px] truncate" title={line.modelo}>{line.modelo}</td>
        <td>{line.chasis ? <button type="button" onClick={() => setHistory({ chassis: line.chasis, os: null })} className="font-mono font-medium text-primary hover:underline">{line.chasis}</button> : <span className="text-muted-foreground">—</span>}</td>
        <td>{line.condicion || "—"}</td><td className="max-w-[150px] truncate" title={line.comercial || undefined}>{line.comercial || "—"}</td>
        <td><Badge variant="outline" className={cn("whitespace-nowrap text-[9px]", line.es_nota_credito ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{line.es_nota_credito ? "Nota de crédito" : "Venta"}</Badge></td>
        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(Number(line.facturado))}</td>
      </tr>)}</tbody>
    </table>{!lines.length && <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div>}</div>
    <MachineHistorySheet target={history} onOpenChange={open => { if (!open) setHistory(null); }} />
  </>;
}

export function MaquinasExplorer({ data, loading, error, desde, hasta, selectedPeriod = null }: { data: MaquinasDashboardResponse | null; loading: boolean; error: string | null; desde: string; hasta: string; selectedPeriod?: string | null }) {
  const [view, setView] = useState<ExplorerView>("resumen");
  const lines = useMemo(() => (data?.lineas ?? []).filter(line => line.fecha >= desde && line.fecha <= hasta), [data, desde, hasta]);
  const summary = useMemo(() => summarize(lines), [lines]);
  const comparison = useMemo(() => {
    if (!data) return null;
    if (!selectedPeriod) return data.comparacion ?? null;
    const index = data.periodos.findIndex(row => row.periodo === selectedPeriod);
    const previous = index > 0 ? data.periodos[index - 1] : null;
    return previous ? { desde: previous.periodo, hasta: previous.periodo, total: previous.total, netas: previous.netas, vendidas: previous.vendidas, notas_credito_monto: Number(previous.notas_credito_monto ?? 0) } : null;
  }, [data, selectedPeriod]);
  const tabs: Array<[ExplorerView, string]> = [["resumen", "Resumen"], ["clientes", "Clientes"], ["maquinas", "Máquinas"], ["detalle", "Detalle"]];
  return <Panel className="p-3">
    <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-[13px] font-semibold">Indicadores comerciales</h2><div className="grid h-8 grid-cols-4 overflow-hidden rounded-md border text-[11px]">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={cn("px-3 hover:bg-accent", view === key && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}</div></div>
    {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando ventas de máquinas…</div>
      : error ? <div role="alert" className="py-16 text-center text-[12px] text-destructive">{error}</div>
      : view === "resumen" ? <SummaryView summary={summary} lines={lines} comparison={comparison} />
      : view === "clientes" ? <ClientsTable lines={lines} />
      : view === "maquinas" ? <MachinesTable lines={lines} />
      : <DetailTable lines={lines} />}
  </Panel>;
}
