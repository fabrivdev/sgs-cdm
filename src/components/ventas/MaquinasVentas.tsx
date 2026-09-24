import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileDisclosure } from "@/hooks/useMobileDisclosure";
import { MobileSalesTable } from "./MobileSalesTable";
import { SalesViewSwitcher } from "./SalesViewSwitcher";
import { useSalesMobile, useSalesExplorerView } from "./salesMobileContext";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PeriodMode } from "@/components/dashboard/types";
import { money } from "@/components/dashboard/utils";
import { Panel } from "@/components/layout/AppPrimitives";
import { MarcaBadge } from "@/components/StatusBadges";


import { cn } from "@/lib/utils";
import { canonicalClientName } from "@/lib/clientIdentity";
import { shortPersonName } from "@/lib/personName";
import { RowCount, TableScroll, scrollHead, salesHeader } from "./TableScroll";
import { salesColumnClass } from "./salesTableFormat";
import { useSectionTable } from "@/components/exports/useSectionTable";
import type { SalesColumn } from "./salesTableInteraction";

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

function metricColumns<T extends MaquinasResumen>(total: number): SalesColumn<T>[] {
  return [
    { key: "vendidas", label: "Vendidas", kind: "number", align: "center", value: r => r.vendidas },
    { key: "notas_credito", label: "Nota Cr.", kind: "number", align: "center", value: r => r.notas_credito },
    { key: "netas", label: "Netas", kind: "number", align: "center", value: r => r.netas },
    { key: "clientes", label: "Clientes", kind: "number", align: "center", value: r => r.clientes },
    { key: "facturas", label: "Facturas", kind: "number", align: "center", value: r => r.facturas },
    { key: "total", label: "Facturación", kind: "number", align: "right", value: r => r.total, excelFormat: '"$" #,##0.00' },
    { key: "participacion", label: "Participación", kind: "number", align: "right", value: r => total ? r.total / total : null, excelFormat: "0%" },
  ];
}

export function MaquinasPanorama({ data, loading, error, periodMode, selectedPeriod, onSelectPeriod }: {
  data: MaquinasDashboardResponse | null;
  loading: boolean;
  error: string | null;
  periodMode: PeriodMode;
  selectedPeriod: string | null;
  onSelectPeriod: (period: string | null) => void;
}) {
  const mobile = useSalesMobile();
  const [collapsed, setCollapsed] = useMobileDisclosure(!!error);
  const isMobile = useIsMobile(1024);
  const total = Number(data?.resumen.total || 0);
  type Period = MaquinasResumen & { periodo: string };
  const columns: SalesColumn<Period>[] = [
    { key: "periodo", label: "Período", kind: "text", value: r => r.periodo || null, exportValue: r => r.periodo ? periodLabel(r.periodo, periodMode) : "Total del período" },
    { key: "total", label: "Facturado", kind: "number", align: "right", value: r => r.total, excelFormat: '"$" #,##0.00' },
    { key: "nuevas", label: "Nuevas", kind: "number", align: "center", value: r => r.nuevas ?? 0 },
    { key: "usadas", label: "Usadas", kind: "number", align: "center", value: r => r.usadas ?? 0 },
    ...metricColumns<Period>(total).filter(c => ["notas_credito", "netas", "clientes", "facturas", "participacion"].includes(c.key)).map(c => ({ ...c, label: c.key === "notas_credito" ? "Notas de crédito" : c.key === "netas" ? "Unidades netas" : c.label })),
  ];
  const table = useSectionTable({ rows: data?.periodos ?? [], columns, title: "Períodos de Máquinas", fileName: "ventas-maquinas-periodos.xlsx",
    initialSort: { key: "periodo", direction: "asc" }, disabled: loading || !!error,
    footer: data ? { ...data.resumen, periodo: "" } : undefined });
  const grid = "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_repeat(4,minmax(0,.75fr))_repeat(2,minmax(0,.7fr))_minmax(0,.8fr)]";
  return <Panel className={cn("sales-periods p-0 lg:p-3", mobile.active && mobile.view !== "periodos" && !error && "hidden")}>
    {!mobile.active && <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left lg:min-h-0 lg:px-0">
      <h2 className="text-[13px] font-semibold">Facturación por período</h2>
      <div className="flex items-center gap-2">
        {selectedPeriod && <span role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onSelectPeriod(null); }} className="rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</span>}
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </div>
    </button>}
    {(mobile.active || !collapsed) && (loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando facturación…</div>
      : error ? <div role="alert" className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : !data?.periodos.length ? <div className="py-8 text-center text-[12px] text-muted-foreground">No hay ventas de máquinas para este rango.</div>
      : isMobile ? <div><MobileSalesTable embedded countKey={mobile.active ? "netas" : undefined} countLabel="Unid." primaryLabel={mobile.active && periodMode === "mes" ? "Mes" : undefined} metricLabel={mobile.active ? "Facturación" : undefined} title="Facturación por período" rows={table.ordered} columns={columns.map(c => c.key === "periodo" ? {...c, render: (r: Period) => periodLabel(r.periodo, periodMode)} : c)} rowKey={r => r.periodo} sort={table.sort} toggleSort={table.toggleSort} footer={{...data.resumen, periodo:""}} onRowClick={r => { onSelectPeriod(selectedPeriod === r.periodo ? null : r.periodo); if (mobile.active) mobile.setView("detalle"); }} selected={r => selectedPeriod === r.periodo} /></div>
      : <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className="min-w-0">
        <TableScroll rows={data.periodos.length}>
        <div className={`grid ${grid} ${scrollHead} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>
          {columns.map(c => <div key={c.key} className={`min-w-0 ${salesColumnClass(c.label, c.key === "notas_credito" ? "quantity" : undefined)}`}>{table.heading(c.key)}</div>)}
        </div>
        {table.ordered.map(row => <button key={row.periodo} type="button" onClick={() => onSelectPeriod(selectedPeriod === row.periodo ? null : row.periodo)} className={cn(`grid w-full ${grid} items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent`, selectedPeriod === row.periodo && "bg-primary/5 outline outline-1 outline-primary/20")}>
          <div className="truncate font-medium capitalize">{periodLabel(row.periodo, periodMode)}</div>
          <div className="text-right font-semibold tabular-nums">{money(Number(row.total))}</div>
          <div className="text-center tabular-nums">{decimal.format(Number(row.nuevas ?? 0))}</div>
          <div className="text-center tabular-nums">{decimal.format(Number(row.usadas ?? 0))}</div>
          <div className="text-center tabular-nums text-muted-foreground">{decimal.format(Number(row.notas_credito))}</div>
          <div className="text-center font-medium tabular-nums">{decimal.format(Number(row.netas))}</div>
          <div className="text-center tabular-nums text-muted-foreground">{integer.format(Number(row.clientes))}</div>
          <div className="text-center tabular-nums text-muted-foreground">{integer.format(Number(row.facturas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(Number(row.total) / total * 100)}%` : "—"}</div>
        </button>)}
        </TableScroll>
        <div className={`grid ${grid} items-center border-t bg-muted/30 px-3 py-2 text-[12px] font-semibold`}>
          <div>Total del período</div>
          <div className="text-right tabular-nums">{money(total)}</div>
          <div className="text-center tabular-nums">{decimal.format(Number(data.resumen.nuevas ?? 0))}</div>
          <div className="text-center tabular-nums">{decimal.format(Number(data.resumen.usadas ?? 0))}</div>
          <div className="text-center tabular-nums text-muted-foreground">{decimal.format(Number(data.resumen.notas_credito))}</div>
          <div className="text-center tabular-nums">{decimal.format(Number(data.resumen.netas))}</div>
          <div className="text-center tabular-nums">{integer.format(Number(data.resumen.clientes))}</div>
          <div className="text-center tabular-nums">{integer.format(Number(data.resumen.facturas))}</div>
          <div className="text-right tabular-nums text-muted-foreground">{total ? "100%" : "—"}</div>
        </div>
      </div></div><RowCount rows={data.periodos.length} label="períodos" /></div>)}
  </Panel>;
}


const BRAND_ORDER = ["CLAAS", "HORSCH", "Otros"];

function SummaryTable({ label, grid, minWidth, rows, share, total, empty }: { label: string; grid: string; minWidth: string; rows: Array<MaquinasResumen & { key: string }>; share: (value: number) => string; total: number; empty: string }) {
  const isMobile = useIsMobile(1024);
  const columns: SalesColumn<MaquinasResumen & { key: string }>[] = [
    { key: "key", label, kind: "text", value: r => r.key }, ...metricColumns<MaquinasResumen & { key: string }>(total),
  ];
  const table = useSectionTable({ rows, columns, title: `Máquinas por ${label.toLowerCase()}`, fileName: `ventas-maquinas-${label.toLowerCase()}.xlsx`, initialSort: { key: "total", direction: "desc" } });
  if (isMobile) return <MobileSalesTable title={`Máquinas por ${label.toLowerCase()}`} rows={table.ordered} columns={columns} rowKey={r => r.key} sort={table.sort} toggleSort={table.toggleSort} empty={empty} />;
  return <div className="overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className={minWidth}>
    <TableScroll rows={rows.length}>
    <div className={`grid ${grid} ${scrollHead} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>{columns.map(c => <div key={c.key} className={`min-w-0 ${salesColumnClass(c.label)}`}>{table.heading(c.key)}</div>)}</div>
    {!rows.length ? <div className="py-10 text-center text-[12px] text-muted-foreground">{empty}</div> : table.ordered.map(row => <div key={row.key} className={`grid ${grid} items-center border-t px-3 py-2 text-[12px]`}><div className="truncate font-medium" title={row.key}>{label === "Marca" ? <MarcaBadge marca={row.key} className="text-[10px]" /> : row.key}</div><div className="text-center tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-center tabular-nums text-muted-foreground">{decimal.format(row.notas_credito)}</div><div className="text-center font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-center tabular-nums">{integer.format(row.clientes)}</div><div className="text-center tabular-nums">{integer.format(row.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums">{share(row.total)}</div></div>)}
    </TableScroll>
  </div></div>{rows.length > 0 && <RowCount rows={rows.length} label="filas" />}</div>;
}

function SummaryView({ summary, lines }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[] }) {
  const byBrand = useMemo(() => [...group(lines, line => brandLabel(line.marca))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => BRAND_ORDER.indexOf(a.key) - BRAND_ORDER.indexOf(b.key) || b.total - a.total), [lines]);
  const byCondition = useMemo(() => [...group(lines, line => conditionLabel(line.condicion))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => b.total - a.total), [lines]);
  const share = (value: number) => summary.total ? `${Math.round(value / summary.total * 100)}%` : "—";
  const grid = "grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,.75fr))_minmax(0,1fr)_minmax(0,.75fr)]";
  return <div className="mt-3 space-y-3">
    <SummaryTable label="Marca" grid={grid} minWidth="min-w-0" rows={byBrand} share={share} total={summary.total} empty="Sin ventas en el período." />
    <SummaryTable label="Condición" grid={grid} minWidth="min-w-0" rows={byCondition} share={share} total={summary.total} empty="Sin ventas en el período." />
  </div>;
}

function SellersTable({ summary, lines }: { summary: MaquinasResumen; lines: MaquinaVentaLinea[] }) {
  const bySeller = useMemo(() => [...group(lines, line => sellerLabel(line.comercial))].map(([key, values]) => ({ key, ...summarize(values) })).sort((a, b) => Number(a.key === "Sin vendedor") - Number(b.key === "Sin vendedor") || b.total - a.total), [lines]);
  const share = (value: number) => summary.total ? `${Math.round(value / summary.total * 100)}%` : "—";
  const grid = "grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,.75fr))_minmax(0,1fr)_minmax(0,.75fr)]";
  return <div className="mt-3">
    <SummaryTable label="Vendedor" grid={grid} minWidth="min-w-0" rows={bySeller} share={share} total={summary.total} empty="Sin vendedores identificados." />
  </div>;
}

function MachinesTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const isMobile = useIsMobile(1024);
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
  const columns: SalesColumn<SummaryRow>[] = [
    { key: "marca", label: "Marca", kind: "text", value: r => r.marca },
    { key: "tipo", label: "Tipo de máquina", kind: "text", value: r => r.tipo },
    { key: "condicion", label: "Condición", kind: "text", value: r => r.condicion },
    ...metricColumns<SummaryRow>(total).filter(c => c.key !== "participacion"),
    { key: "promedio", label: "Promedio / unidad neta", kind: "number", align: "right", excelFormat: '"$" #,##0.00', value: r => r.netas ? r.total / r.netas : null },
    { ...metricColumns<SummaryRow>(total).at(-1)!, label: "Participación neta" },
  ];
  const table = useSectionTable({ rows, columns, title: "Máquinas por tipo", fileName: "ventas-maquinas-tipos.xlsx", initialSort: { key: "total", direction: "desc" } });
  // Modelo is a separate export from the same complete filtered population.
  const modelsTable = useSectionTable({ rows: modelRows, columns: [{ key: "modelo", label: "Modelo", kind: "text", value: r => r.modelo }, ...columns],
    title: "Máquinas por modelo", fileName: "ventas-maquinas-modelos.xlsx", initialSort: table.sort, sortOverride: isMobile ? undefined : table.sort });
  if (isMobile) return <div className="mt-3 space-y-3">
    <MobileSalesTable title="Máquinas por tipo" rows={table.ordered} columns={columns} primaryKey="tipo" rowKey={r => r.key} sort={table.sort} toggleSort={table.toggleSort} />
    <MobileSalesTable title="Máquinas por modelo" rows={modelsTable.ordered} columns={[{key:"modelo",label:"Modelo",kind:"text",value:r=>r.modelo},...columns]} primaryKey="modelo" rowKey={r => r.key} sort={modelsTable.sort} toggleSort={modelsTable.toggleSort} />
  </div>;
  const grid = "grid-cols-[34px_minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,.7fr)_repeat(5,minmax(0,.6fr))_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,.85fr)]";
  return <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className="min-w-0">
    <TableScroll rows={rows.length}>
    <div className={`grid ${grid} ${scrollHead} items-center bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}><div />{columns.map(c => <div key={c.key} className={cn("min-w-0", salesColumnClass(c.label))}>{table.heading(c.key)}</div>)}</div>
    {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div> : table.ordered.map(row => {
      const open = expanded === row.key;
      const models = modelsTable.ordered.filter(model => model.marca === row.marca && model.tipo === row.tipo && model.condicion === row.condicion);
      const cells = (item: SummaryRow, model = false) => <>
        <div className={cn("min-w-0 truncate", !model && "font-medium")}>{model ? item.modelo : <MarcaBadge marca={item.marca} className="text-[10px]" />}</div>
        <div className="truncate" title={model ? undefined : item.tipo}>{model ? "" : item.tipo}</div>
        <div>{item.condicion}</div>
        <div className="text-center tabular-nums">{decimal.format(item.vendidas)}</div><div className="text-center tabular-nums text-muted-foreground">{decimal.format(item.notas_credito)}</div><div className="text-center font-medium tabular-nums">{decimal.format(item.netas)}</div><div className="text-center tabular-nums text-muted-foreground">{integer.format(item.clientes)}</div><div className="text-center tabular-nums text-muted-foreground">{integer.format(item.facturas)}</div><div className="text-right font-semibold tabular-nums">{money(item.total)}</div><div className="text-right tabular-nums text-muted-foreground">{item.netas ? money(item.total / item.netas) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(item.total / total * 100)}%` : "—"}</div>
      </>;
      return <div key={row.key}>
        <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.key)} className={`grid w-full ${grid} items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent`}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />{cells(row)}</button>
        {open && models.map(model => <div key={model.key} className={`grid ${grid} items-center border-t bg-muted/20 px-3 py-1.5 text-[11px]`}><div />{cells(model, true)}</div>)}
      </div>;
    })}
    </TableScroll>
  </div></div>{rows.length > 0 && <RowCount rows={rows.length} label="filas" />}</div>;
}

function ClientsTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const isMobile = useIsMobile(1024);
  const rows = useMemo(() => [...group(lines, line => line.cliente_facturado)].map(([cliente, values]) => ({ cliente, ultima: values.reduce((max, line) => line.fecha > max ? line.fecha : max, ""), ...summarize(values) })).sort((a, b) => Number(a.cliente.startsWith("Sin ")) - Number(b.cliente.startsWith("Sin ")) || b.total - a.total), [lines]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  type Client = typeof rows[number];
  const columns: SalesColumn<Client>[] = [
    { key: "cliente", label: "Cliente", kind: "text", value: r => r.cliente },
    ...metricColumns<Client>(total).filter(c => ["vendidas", "netas", "total"].includes(c.key)).map(c => c.key === "netas" ? { ...c, label: "Unidades netas" } : c),
    { key: "promedio", label: "Promedio / unidad neta", kind: "number", align: "right", excelFormat: '"$" #,##0.00', value: r => r.netas ? r.total / r.netas : null },
    ...metricColumns<Client>(total).filter(c => c.key === "facturas"),
    { key: "ultima", label: "Última venta", kind: "date", value: r => r.ultima?.slice(0, 10) || null },
    ...metricColumns<Client>(total).filter(c => c.key === "participacion"),
  ];
  const table = useSectionTable({ rows, columns, title: "Clientes de Máquinas", fileName: "ventas-maquinas-clientes.xlsx", initialSort: { key: "total", direction: "desc" } });
  if (isMobile) return <div className="mt-3"><MobileSalesTable title="Clientes de Máquinas" rows={table.ordered} columns={columns} rowKey={r => r.cliente} sort={table.sort} toggleSort={table.toggleSort} /></div>;
  const grid = "grid-cols-[minmax(0,1.8fr)_repeat(2,minmax(0,.65fr))_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,.75fr)_minmax(0,.8fr)_minmax(0,.7fr)]";
  return <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><div className="min-w-0">
      <TableScroll rows={rows.length}>
      <div className={`grid ${grid} ${scrollHead} bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground ${salesHeader}`}>{columns.map(c => <div key={c.key} className={`min-w-0 ${salesColumnClass(c.label)}`}>{table.heading(c.key)}</div>)}</div>
      {!rows.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">No hay clientes en el período.</div> : table.ordered.map(row => <div key={row.cliente} className={`grid ${grid} items-center border-t px-3 py-1.5 text-[12px]`}><div className="truncate font-medium" title={row.cliente}>{row.cliente}</div><div className="text-center tabular-nums">{decimal.format(row.vendidas)}</div><div className="text-center font-medium tabular-nums">{decimal.format(row.netas)}</div><div className="text-right font-semibold tabular-nums">{money(row.total)}</div><div className="text-right tabular-nums text-muted-foreground">{row.netas ? money(row.total / row.netas) : "—"}</div><div className="text-center tabular-nums text-muted-foreground">{integer.format(row.facturas)}</div><div className="whitespace-nowrap text-left tabular-nums text-muted-foreground">{row.ultima ? shortDate(row.ultima) : "—"}</div><div className="text-right tabular-nums text-muted-foreground">{total ? `${Math.round(row.total / total * 100)}%` : "—"}</div></div>)}
      </TableScroll>
  </div></div>{rows.length > 0 && <RowCount rows={rows.length} label="clientes" />}</div>;
}

function DetailTable({ lines }: { lines: MaquinaVentaLinea[] }) {
  const isMobile = useIsMobile(1024);
  const columns: SalesColumn<MaquinaVentaLinea>[] = [
    { key: "fecha", label: "Fecha", kind: "date", value: r => r.fecha?.slice(0, 10) },
    ...(["factura", "cliente_facturado", "marca", "tipo_maquina", "modelo", "chasis"] as const).map((key, i) => ({ key, label: ["Factura", "Cliente", "Marca", "Tipo", "Modelo", "Chasis"][i], kind: "text" as const, value: (r: MaquinaVentaLinea) => r[key] })),
    { key: "condicion", label: "Condición", kind: "text", value: r => conditionLabel(r.condicion) },
    { key: "comercial", label: "Vendedor", kind: "text", value: r => sellerLabel(r.comercial) },
    { key: "facturado", label: "Facturado", kind: "number", align: "right", value: r => r.facturado, excelFormat: '"$" #,##0.00' },
  ];
  const table = useSectionTable({ rows: lines, columns, title: "Detalle de Máquinas", fileName: "ventas-maquinas-detalle.xlsx", initialSort: { key: "fecha", direction: "desc" } });
  if (isMobile) return <div className="mt-3"><MobileSalesTable title="Detalle de Máquinas" rows={table.ordered} columns={columns.map(c => c.key === "factura" ? {...c, render:(r:MaquinaVentaLinea)=>`${r.es_nota_credito ? "NC " : ""}${r.factura}`} : c)} primaryKey="cliente_facturado" rowKey={r => r.id} sort={table.sort} toggleSort={table.toggleSort} /></div>;
  return <>
    <div className="mt-3 overflow-hidden rounded-md border"><div className="overflow-x-auto"><TableScroll rows={lines.length}><table className="w-full min-w-0 table-fixed text-[11px] [&_th]:whitespace-nowrap [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-middle">
      <thead className={`bg-muted/60 text-left text-muted-foreground ${scrollHead} ${salesHeader}`}><tr>{columns.map(c => <th key={c.key} className={c.align === "right" ? "text-right" : "text-left"}>{table.heading(c.key)}</th>)}</tr></thead>
      <tbody>{table.ordered.map(line => <tr key={line.id} className="border-t">
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
    </table>{!lines.length && <div className="py-12 text-center text-[12px] text-muted-foreground">No hay máquinas facturadas en el período.</div>}</TableScroll></div>{lines.length > 0 && <RowCount rows={lines.length} label="ventas" />}</div>
  </>;
}

export function MaquinasExplorer({ data, loading, error, desde, hasta, selectedPeriod = null }: { data: MaquinasDashboardResponse | null; loading: boolean; error: string | null; desde: string; hasta: string; selectedPeriod?: string | null }) {
  const [view, setView] = useSalesExplorerView<ExplorerView>("resumen", "detalle");
  const lines = useMemo(() => (data?.lineas ?? []).filter(line => line.fecha >= desde && line.fecha <= hasta).map(line => ({ ...line, cliente_facturado: canonicalClientName(line.cliente_facturado) })), [data, desde, hasta]);
  const summary = useMemo(() => summarize(lines), [lines]);
  const tabs: Array<[ExplorerView, string]> = [["resumen", "Resumen"], ["vendedores", "Vendedores"], ["clientes", "Clientes"], ["maquinas", "Máquinas"], ["detalle", "Detalle"]];
  return <Panel className="sales-explorer p-3">
    <div className="sales-explorer-heading flex min-h-8 flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between"><h2 className="truncate text-[13px] font-semibold">Indicadores comerciales</h2><SalesViewSwitcher<ExplorerView> value={view} onChange={setView} options={tabs} /></div>
    {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando ventas de máquinas…</div>
      : error ? <div role="alert" className="py-16 text-center text-[12px] text-destructive">{error}</div>
      : view === "resumen" ? <SummaryView summary={summary} lines={lines} />
      : view === "vendedores" ? <SellersTable summary={summary} lines={lines} />
      : view === "clientes" ? <ClientsTable lines={lines} />
      : view === "maquinas" ? <MachinesTable lines={lines} />
      : <DetailTable lines={lines} />}
  </Panel>;
}
