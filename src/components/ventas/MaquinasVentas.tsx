import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PeriodMode } from "@/components/dashboard/types";
import { money } from "@/components/dashboard/utils";
import { Panel } from "@/components/layout/AppPrimitives";
import { MarcaBadge } from "@/components/StatusBadges";


import { cn } from "@/lib/utils";
import { canonicalClientName } from "@/lib/clientIdentity";
import { shortPersonName } from "@/lib/personName";

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

type ExplorerView = "resumen" | "vendedores" | "clientes" | "maquinas" | "detalle";
type SummaryRow = MaquinasResumen & { key: string; marca?: string; tipo?: string; modelo?: string; condicion?: string };

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const conditionLabel = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "USADA" ? "Usada" : "Nueva";
};

const brandLabel = (value: string | null | undefined) => {
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (key.includes("CLAAS")) return "CLAAS";
  if (key.includes("HORSCH")) return "HORSCH";
  return "Otros";
};

const sellerLabel = (value: string | null | undefined) => {
  return shortPersonName(value).toLocaleUpperCase("es-PY") || "Sin vendedor";
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
    clientes.add(canonicalClientName(line.cliente_facturado));
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
      : <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className="min-w-[1000px]">
        <TableScroll rows={data.periodos.length}>
        <div className={`grid ${grid} ${scrollHead} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}>
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
        </TableScroll>
        <div className={`grid ${grid} items-center border-t bg-muted/30 px-3 py-2 text-[12px] font-semibold`}>
          <div>Total del período</div>
          <div className="text-right tabular-nums">{money(total)}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(data.resumen.nuevas ?? 0))}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(data.resumen.usadas ?? 0))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{decimal.format(Number(data.resumen.notas_credito))}</div>
          <div className="text-right tabular-nums">{decimal.format(Number(data.resumen.netas))}</div>
          <div className="text-right tabular-nums">{integer.format(Number(data.resumen.clientes))}</div>
          <div className="text-right tabular-nums">{integer.format(Number(data.resumen.facturas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{total ? "100%" : "—"}</div>
        </div>
      </div></div><RowCount rows={data.periodos.length} label="períodos" /></div>)}
  </Panel>;
}


const METRIC_HEADERS = ["Vendidas", "Nota Cr.", "Netas", "Clientes", "Facturas", "Facturación", "Participación"];
const BRAND_ORDER = ["CLAAS", "HORSCH", "Otros"];

function SummaryTable({ label, grid, minWidth, rows, share, empty }: { label: string; grid: string; minWidth: string; rows: Array<MaquinasResumen & { key: string }>; share: (value: number) => string; empty: string }) {
  return <div className="overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className={minWidth}>
    <TableScroll rows={rows.length}>
    <div className={`grid ${grid} ${scrollHead} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>{label}</div>{METRIC_HEADERS.map(head => <div key={head} className="whitespace-nowrap text-right">{head}</div>)}</div>
    {!rows.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">{empty}</div> : rows.map(row => <div key={row.key} className={`grid ${grid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium" title={row.key}>{label === "Marca" ? <MarcaBadge marca={row.key} className="text-[10px]" /> : row.key}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right tabular-nums">{integer.format(row.clientes)}</div><div className="text-right tabular-nums">{integer.format(row.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums">{share(row.total)}</div></div>)}
    </TableScroll>
  </div></div>{rows.length > 0 && <RowCount rows={rows.length} label="filas" />}</div>;
}

function SummaryView({ summary, lines }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[] }) {
  const byBrand = useMemo(() => [...group(lines, line => brandLabel(line.marca))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => BRAND_ORDER.indexOf(a.key) - BRAND_ORDER.indexOf(b.key) || b.total - a.total), [lines]);
  const byCondition = useMemo(() => [...group(lines, line => conditionLabel(line.condicion))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => b.total - a.total), [lines]);
  const share = (value: number) => summary.total ? `${Math.round(value / summary.total * 100)}%` : "—";
  const grid = "grid-cols-[minmax(140px,1.2fr)_repeat(5,minmax(90px,.75fr))_minmax(125px,1fr)_90px]";
  return <div className="mt-3 space-y-3">
    <SummaryTable label="Marca" grid={grid} minWidth="min-w-[880px]" rows={byBrand} share={share} empty="Sin ventas en el período." />
    <SummaryTable label="Condición" grid={grid} minWidth="min-w-[880px]" rows={byCondition} share={share} empty="Sin ventas en el período." />
  </div>;
}

function SellersTable({ summary, lines }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[] }) {
  const bySeller = useMemo(() => [...group(lines, line => sellerLabel(line.comercial))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => Number(a.key === "Sin vendedor") - Number(b.key === "Sin vendedor") || b.total - a.total), [lines]);
  const share = (value: number) => summary.total ? `${Math.round(value / summary.total * 100)}%` : "—";
  const grid = "grid-cols-[minmax(230px,1.5fr)_repeat(5,minmax(90px,.75fr))_minmax(125px,1fr)_90px]";
  return <div className="mt-3">
    <SummaryTable label="Vendedor" grid={grid} minWidth="min-w-[960px]" rows={bySeller} share={share} empty="Sin vendedores identificados." />
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
  const grid = "grid-cols-[34px_minmax(78px,.8fr)_minmax(140px,1.2fr)_48px_repeat(5,minmax(66px,.6fr))_minmax(100px,.9fr)_minmax(112px,.95fr)_minmax(100px,.85fr)]";
  return <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className="min-w-[960px]">
    <TableScroll rows={rows.length}>
    <div className={`grid ${grid} ${scrollHead} items-center bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div />{['Marca', 'Tipo de máquina', 'Condición', 'Vendidas', 'Nota Cr.', 'Netas', 'Clientes', 'Facturas', 'Facturación', 'Promedio / unidad neta', 'Participación neta'].map(label => <div key={label} className={cn("whitespace-nowrap", label !== 'Marca' && label !== 'Tipo de máquina' && label !== 'Condición' && 'text-right')}>{label}</div>)}</div>
    {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div> : rows.map(row => {
      const open = expanded === row.key;
      const models = modelRows.filter(model => model.marca === row.marca && model.tipo === row.tipo && model.condicion === row.condicion).sort((a, b) => b.total - a.total);
      const cells = (item: SummaryRow, model = false) => <>
        <div className={cn("min-w-0 truncate", !model && "font-medium")}>{model ? item.modelo : <MarcaBadge marca={item.marca} className="text-[10px]" />}</div>
        <div className="truncate" title={model ? undefined : item.tipo}>{model ? "" : item.tipo}</div>
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
  const grid = "grid-cols-[minmax(250px,1.8fr)_repeat(2,minmax(82px,.65fr))_minmax(130px,1fr)_minmax(145px,1.05fr)_minmax(90px,.75fr)_minmax(105px,.8fr)_85px]";
  return <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1040px]">
      <div className={`grid ${grid} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground`}><div>Cliente</div>{['Vendidas', 'Unidades netas', 'Facturación', 'Promedio / unidad neta', 'Facturas', 'Última venta', 'Participación'].map(label => <div key={label} className="whitespace-nowrap text-right">{label}</div>)}</div>
      {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes en el período.</div> : rows.map(row => <div key={row.cliente} className={`grid ${grid} items-center border-t px-3 py-1.5 text-[12px]`}><div className="truncate font-medium" title={row.cliente}>{row.cliente}</div><div className="text-right tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-right font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums text-muted-foreground">{row.netas ? money(row.total / row.netas) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{integer.format(row.facturas)}</div><div className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{row.ultima ? shortDate(row.ultima) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(row.total / total * 100)}%` : "—"}</div></div>)}
  </div></div>;
}

function DetailTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  return <>
    <div className="mt-3 overflow-x-auto rounded-md border"><table className="w-full min-w-[1240px] table-fixed text-[11px] [&_th]:whitespace-nowrap [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-middle">
      <thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="w-[82px]">Fecha</th><th className="w-[120px]">Factura</th><th className="w-[220px]">Cliente</th><th className="w-[90px]">Marca</th><th className="w-[165px]">Tipo</th><th className="w-[170px]">Modelo</th><th className="w-[145px]">Chasis</th><th className="w-[85px]">Condición</th><th className="w-[145px]">Vendedor</th><th className="w-[120px] text-right">Facturado</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.id} className="border-t">
        <td>{shortDate(line.fecha)}</td>
        <td className="truncate font-mono font-medium" title={line.factura}>{line.factura}</td>
        <td><div className="truncate font-medium" title={line.cliente_facturado}>{line.cliente_facturado}</div></td>
        <td><MarcaBadge marca={line.marca} className="text-[10px]" /></td>
        <td className="truncate" title={line.tipo_maquina}>{line.tipo_maquina}</td>
        <td className="truncate" title={line.modelo}>{line.modelo}</td>
        <td className="font-mono font-medium">{line.chasis ?? <span className="font-sans font-normal text-muted-foreground">—</span>}</td>
        <td>{conditionLabel(line.condicion)}</td><td className="truncate" title={sellerLabel(line.comercial)}>{sellerLabel(line.comercial)}</td>
        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(Number(line.facturado))}</td>
      </tr>)}</tbody>
    </table>{!lines.length && <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div>}</div>
  </>;
}

export function MaquinasExplorer({ data, loading, error, desde, hasta, selectedPeriod = null }: { data: MaquinasDashboardResponse | null; loading: boolean; error: string | null; desde: string; hasta: string; selectedPeriod?: string | null }) {
  const [view, setView] = useState<ExplorerView>("resumen");
  const lines = useMemo(() => (data?.lineas ?? []).filter(line => line.fecha >= desde && line.fecha <= hasta).map(line => ({ ...line, cliente_facturado: canonicalClientName(line.cliente_facturado) })), [data, desde, hasta]);
  const summary = useMemo(() => summarize(lines), [lines]);
  const tabs: Array<[ExplorerView, string]> = [["resumen", "Resumen"], ["vendedores", "Vendedores"], ["clientes", "Clientes"], ["maquinas", "Máquinas"], ["detalle", "Detalle"]];
  return <Panel className="p-3">
    <div className="flex min-h-8 items-center justify-between gap-3 border-b pb-3"><h2 className="truncate text-[13px] font-semibold">Indicadores comerciales</h2><div className="grid h-8 shrink-0 grid-cols-5 overflow-hidden rounded-md border text-[11px]">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={cn("whitespace-nowrap px-3 hover:bg-accent", view === key && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}</div></div>
    {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando ventas de máquinas…</div>
      : error ? <div role="alert" className="py-16 text-center text-[12px] text-destructive">{error}</div>
      : view === "resumen" ? <SummaryView summary={summary} lines={lines} />
      : view === "vendedores" ? <SellersTable summary={summary} lines={lines} />
      : view === "clientes" ? <ClientsTable lines={lines} />
      : view === "maquinas" ? <MachinesTable lines={lines} />
      : <DetailTable lines={lines} />}
  </Panel>;
}
