import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  comercial: string | null;
  condicion: string | null;
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
  venta_bruta?: number;
  notas_credito_monto?: number;
  nuevas?: number;
  usadas?: number;
};

export type MaquinasDashboardResponse = {
  resumen: MaquinasResumen;
  periodos: Array<MaquinasResumen & { periodo: string }>;
  por_maquina: Array<MaquinasResumen & { marca: string; tipo_maquina: string; condicion?: string }>;
  por_modelo: Array<MaquinasResumen & { marca: string; tipo_maquina: string; modelo: string; condicion?: string }>;
  lineas: MaquinaVentaLinea[];
  dimensiones: { marcas: string[]; tipos: string[] };
  comparacion?: { desde: string; hasta: string; total: number; netas: number; vendidas: number; notas_credito_monto: number };
};

type ExplorerView = "resumen" | "clientes" | "maquinas" | "detalle";
type SummaryRow = MaquinasResumen & { key: string; marca?: string; tipo?: string; modelo?: string; condicion?: string };

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const conditionLabel = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "USADA" ? "Usada" : "Nueva";
};

const sellerLabel = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sin vendedor";
  const withoutCode = raw.replace(/^\d+\s*-\s*/, "").replace(/\s+/g, " ").trim();
  const key = withoutCode
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (key.includes("CARLOS") && key.includes("BENITEZ")) return "CARLOS JAVIER BENITEZ ZARZA";
  if (key.includes("ANDRES") && key.includes("CANETE")) return "LUIS ANDRES CAÑETE RODRIGUEZ";
  if (key.includes("RUBEN") && key.includes("CENTURION")) return "RUBEN JUAN ANTONIO CENTURION RAMOS";
  if (key.includes("HELWIN") && key.includes("LOPEZ")) return "HELWIN LOPEZ BORGES";
  if (key.includes("OSCAR") && key.includes("BENITEZ")) return "OSCAR DANIEL BENITEZ MEZA";
  if (key.includes("JUAN") && key.includes("APODACA")) return "JUAN DANIEL APODACA FERREIRA";
  return withoutCode.toLocaleUpperCase("es-PY");
};

function summarize(lines: MaquinaVentaLinea[]): MaquinasResumen {
  const facturas = new Set<string>();
  const clientes = new Set<string>();
  let total = 0;
  let vendidas = 0;
  let notasCredito = 0;
  let netas = 0;
  let gross = 0;
  let creditAmount = 0;
  let newUnits = 0;
  let usedUnits = 0;
  for (const line of lines) {
    const units = Number(line.unidades || 0);
    total += Number(line.facturado || 0);
    if (Number(line.facturado || 0) > 0) gross += Number(line.facturado || 0);
    if (Number(line.facturado || 0) < 0) creditAmount += Math.abs(Number(line.facturado || 0));
    if (units > 0) vendidas += units;
    if (units > 0 && conditionLabel(line.condicion) === "Nueva") newUnits += units;
    if (units > 0 && conditionLabel(line.condicion) === "Usada") usedUnits += units;
    if (units < 0) notasCredito += Math.abs(units);
    netas += units;
    facturas.add(line.factura);
    clientes.add(line.cliente_facturado);
  }
  return {
    total,
    facturas: facturas.size,
    clientes: clientes.size,
    vendidas,
    notas_credito: notasCredito,
    netas,
    promedio_unidad: netas ? total / netas : 0,
    venta_bruta: gross,
    notas_credito_monto: creditAmount,
    nuevas: newUnits,
    usadas: usedUnits,
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
  const grid = "grid-cols-[minmax(120px,1.2fr)_minmax(115px,1fr)_repeat(4,minmax(82px,.75fr))_repeat(2,minmax(80px,.7fr))_minmax(90px,.8fr)]";
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
          {['Facturado', 'Nuevas', 'Usadas', 'Notas de crédito', 'Unidades netas', 'Clientes', 'Facturas', 'Participación'].map(label => <div key={label} className="whitespace-nowrap text-right">{label}</div>)}
        </div>
        {data.periodos.map(row => <button key={row.periodo} type="button" onClick={() => onSelectPeriod(selectedPeriod === row.periodo ? null : row.periodo)} className={cn(`grid w-full ${grid} items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent`, selectedPeriod === row.periodo && "bg-primary/5 outline outline-1 outline-primary/20")}>
          <div className="truncate font-medium capitalize">{periodLabel(row.periodo, periodMode)}</div>
          <div className="text-right font-semibold tabular-nums">{money(Number(row.total))}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(row.nuevas ?? 0))}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(row.usadas ?? 0))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{decimal.format(Number(row.notas_credito))}</div>
          <div className="text-right font-medium tabular-nums">{decimal.format(Number(row.netas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{integer.format(Number(row.clientes))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{integer.format(Number(row.facturas))}</div>
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

function SummaryView({ summary, lines, comparison }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[]; comparison: MaquinasDashboardResponse["comparacion"] | null }) {
  const byCondition = useMemo(() => [...group(lines, line => conditionLabel(line.condicion))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => b.total - a.total), [lines]);
  const byMachine = useMemo(() => [...group(lines, line => `${line.marca}__${line.tipo_maquina}__${conditionLabel(line.condicion)}`)].map(([key, values]) => {
    const [marca, tipo, condicion] = key.split("__");
    return { key, marca, tipo, condicion, ...summarize(values) };
  }).sort((a, b) => a.marca.localeCompare(b.marca, "es") || a.tipo.localeCompare(b.tipo, "es") || a.condicion.localeCompare(b.condicion, "es")), [lines]);
  const bySeller = useMemo(() => [...group(lines, line => sellerLabel(line.comercial))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => Number(a.key === "Sin vendedor") - Number(b.key === "Sin vendedor") || b.total - a.total), [lines]);
  const cards: Array<[string, string]> = [
    ["Neto", money(summary.total)],
    ["Venta bruta", money(Number(summary.venta_bruta ?? 0))],
    ["Notas de crédito", `-${money(Number(summary.notas_credito_monto ?? 0))}`],
    ["Nuevas vendidas", decimal.format(Number(summary.nuevas ?? 0))],
    ["Usadas vendidas", decimal.format(Number(summary.usadas ?? 0))],
    ["Unidades netas", decimal.format(summary.netas)],
    ["Clientes", integer.format(summary.clientes)],
    ["Documentos", integer.format(summary.facturas)],
  ];
  const share = (value: number) => summary.total ? `${Math.round(value / summary.total * 100)}%` : "—";
  const conditionGrid = "grid-cols-[minmax(140px,1.2fr)_repeat(5,minmax(90px,.75fr))_minmax(125px,1fr)_90px]";
  const machineGrid = "grid-cols-[minmax(100px,.8fr)_minmax(180px,1.35fr)_minmax(100px,.8fr)_repeat(5,minmax(80px,.7fr))_minmax(125px,1fr)_85px]";
  const sellerGrid = "grid-cols-[minmax(230px,1.5fr)_repeat(5,minmax(90px,.75fr))_minmax(125px,1fr)_90px]";
  return <div className="mt-3 space-y-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
      {cards.map(([label, value]) => <div key={label} className="rounded-md border px-3 py-2"><p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums">{value}</p></div>)}
    </div>
    {comparison && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-[10px]"><span className="text-muted-foreground">Comparación con {shortDate(comparison.desde)}–{shortDate(comparison.hasta)}</span><span><strong>{deltaLabel(summary.total, Number(comparison.total))}</strong> en facturación · <strong>{deltaLabel(summary.netas, Number(comparison.netas))}</strong> en unidades netas</span></div>}

    <div className="overflow-x-auto rounded-md border"><div className="min-w-[880px]">
      <div className={`grid ${conditionGrid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Condición</div>{["Vendidas", "NC", "Netas", "Clientes", "Facturas", "Facturación", "Participación"].map(label => <div key={label} className="text-right">{label}</div>)}</div>
      {!byCondition.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin ventas en el período.</div> : byCondition.map(row => <div key={row.key} className={`grid ${conditionGrid} items-center border-t px-3 py-2 text-[12px]`}><div className="font-medium">{row.key}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums">{integer.format(row.clientes)}</div><div className="text-right tabular-nums">{integer.format(row.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums">{share(row.total)}</div></div>)}
    </div></div>

    <div className="overflow-x-auto rounded-md border"><div className="min-w-[1120px]">
      <div className={`grid ${machineGrid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Marca</div><div>Tipo de máquina</div><div>Condición</div>{["Vendidas", "NC", "Netas", "Clientes", "Facturas", "Facturación", "Participación"].map(label => <div key={label} className="text-right">{label}</div>)}</div>
      {!byMachine.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin datos por máquina.</div> : byMachine.map(row => <div key={row.key} className={`grid ${machineGrid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium">{row.marca}</div><div className="truncate">{row.tipo}</div><div>{row.condicion}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums">{integer.format(row.clientes)}</div><div className="text-right tabular-nums">{integer.format(row.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums">{share(row.total)}</div></div>)}
    </div></div>

    <div className="overflow-x-auto rounded-md border"><div className="min-w-[960px]">
      <div className={`grid ${sellerGrid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Vendedor</div>{["Vendidas", "NC", "Netas", "Clientes", "Facturas", "Facturación", "Participación"].map(label => <div key={label} className="text-right">{label}</div>)}</div>
      {!bySeller.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">Sin vendedores identificados.</div> : bySeller.map(row => <div key={row.key} className={`grid ${sellerGrid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium" title={row.key}>{row.key}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums">{integer.format(row.clientes)}</div><div className="text-right tabular-nums">{integer.format(row.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums">{share(row.total)}</div></div>)}
    </div></div>
  </div>;
}

function MachinesTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = lines.reduce((sum, line) => sum + Number(line.facturado || 0), 0);
  const rows = useMemo(() => [...group(lines, line => `${line.marca}__${line.tipo_maquina}__${conditionLabel(line.condicion)}`)].map(([key, values]) => {
    const [marca, tipo, condicion] = key.split("__");
    return { key, marca, tipo, condicion, ...summarize(values) };
  }).sort((a, b) => b.total - a.total), [lines]);
  const modelRows = useMemo(() => [...group(lines, line => `${line.marca}__${line.tipo_maquina}__${conditionLabel(line.condicion)}__${line.modelo}`)].map(([key, values]) => {
    const [marca, tipo, condicion, ...model] = key.split("__");
    return { key, marca, tipo, condicion, modelo: model.join("__"), ...summarize(values) };
  }), [lines]);
  const grid = "grid-cols-[34px_minmax(100px,.9fr)_minmax(170px,1.35fr)_minmax(90px,.7fr)_repeat(5,minmax(76px,.68fr))_minmax(115px,1fr)_minmax(110px,.9fr)_80px]";
  return <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1160px]">
    <div className={`grid ${grid} items-center bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div />{['Marca', 'Tipo de máquina', 'Condición', 'Vendidas', 'NC', 'Netas', 'Clientes', 'Facturas', 'Facturación', 'Promedio / unidad neta', 'Participación neta'].map(label => <div key={label} className={label === 'Marca' || label === 'Tipo de máquina' || label === 'Condición' ? '' : 'text-right'}>{label}</div>)}</div>
    {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div> : rows.map(row => {
      const open = expanded === row.key;
      const models = modelRows.filter(model => model.marca === row.marca && model.tipo === row.tipo && model.condicion === row.condicion).sort((a, b) => b.total - a.total);
      const cells = (item: SummaryRow, model = false) => <>
        <div className={cn("truncate", !model && "font-medium")}>{model ? item.modelo : item.marca}</div>
        <div className="truncate" title={model ? item.modelo : item.tipo}>{model ? "Modelo" : item.tipo}</div>
        <div>{item.condicion}</div>
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
  const rows = useMemo(() => [...group(lines, line => line.cliente_facturado)].map(([cliente, values]) => ({ cliente, ultima: values.reduce((max, line) => line.fecha > max ? line.fecha : max, ""), ...summarize(values) })).sort((a, b) => Number(a.cliente.startsWith("Sin ")) - Number(b.cliente.startsWith("Sin ")) || b.total - a.total), [lines]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const grid = "grid-cols-[minmax(240px,1.7fr)_repeat(5,minmax(85px,.75fr))_minmax(120px,1fr)_90px_85px]";
  return <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1050px]">
      <div className={`grid ${grid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Cliente</div>{['Vendidas', 'NC', 'Netas', 'Facturas', 'Última venta', 'Promedio / unidad neta', 'Facturación', 'Participación neta'].map(label => <div key={label} className="text-right">{label}</div>)}</div>
      {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes en el período.</div> : rows.map(row => <div key={row.cliente} className={`grid ${grid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium" title={row.cliente}>{row.cliente}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(row.facturas)}</div><div className="text-right tabular-nums text-muted-foreground">{row.ultima ? shortDate(row.ultima) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{row.netas ? money(row.total / row.netas) : "—"}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(row.total / total * 100)}%` : "—"}</div></div>)}
  </div></div>;
}

function DetailTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const [history, setHistory] = useState<{ chassis: string | null; os: string | null } | null>(null);
  return <>
    <div className="mt-3 overflow-x-auto rounded-md border"><table className="w-full min-w-[1240px] text-[11px] [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
      <thead className="bg-muted/60 text-left text-muted-foreground"><tr><th>Fecha</th><th>Factura</th><th className="w-[260px]">Cliente</th><th>Marca / tipo</th><th>Modelo</th><th>Chasis</th><th>Condición</th><th>Vendedor</th><th>Situación</th><th className="text-right">Facturado</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.id} className="border-t">
        <td className="whitespace-nowrap">{shortDate(line.fecha)}</td>
        <td><span className="font-mono font-medium">{line.factura}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{line.origen ?? (line.metodologia === "historico" ? "Sistema anterior" : "Sistema actual")}</span></td>
        <td><div className="truncate font-medium" title={line.cliente_facturado}>{line.cliente_facturado}</div></td>
        <td><div className="font-medium">{line.marca}</div><div className="text-[9px] text-muted-foreground">{line.tipo_maquina}</div></td>
        <td className="max-w-[180px] truncate" title={line.modelo}>{line.modelo}</td>
        <td>{line.chasis ? <button type="button" onClick={() => setHistory({ chassis: line.chasis, os: null })} className="font-mono font-medium text-primary hover:underline">{line.chasis}</button> : <span className="text-muted-foreground">—</span>}</td>
        <td>{conditionLabel(line.condicion)}</td><td className="max-w-[150px] truncate" title={sellerLabel(line.comercial)}>{sellerLabel(line.comercial)}</td>
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
