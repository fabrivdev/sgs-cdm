/* eslint-disable @typescript-eslint/no-explicit-any -- tablas nuevas hasta regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  History,
  Package,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { money } from "@/components/dashboard/utils";
import { cn } from "@/lib/utils";

type HistoryRow = {
  os_numero: string;
  fecha_abierta_os: string | null;
  fecha_cierre_os: string | null;
  fecha_emision_factura: string | null;
  factura: string | null;
  tipo_tiempo: string | null;
  problema: string | null;
  servicios_cantidad: number | null;
  servicios_valor: number | null;
  km_cantidad: number | null;
  kilometro_valor: number | null;
  repuesto_valor: number | null;
  terceros_valor: number | null;
  situacion_os: string | null;
  situacion_facturacion: string | null;
  responsable: string | null;
  cliente_nombre: string | null;
  marca: string | null;
  raw_data: Record<string, unknown> | null;
};

type BillingLine = {
  id: string;
  factura: string | null;
  codigo_interno_factura: string | null;
  fecha_factura: string | null;
  grupo_normalizado: string | null;
  subgrupo_original: string | null;
  cod_mercaderia: string | null;
  codigo_fabricante: string | null;
  mercaderia: string | null;
  observacion: string | null;
  cantidad: number | null;
  valor_unitario: number | null;
  total_venta: number;
  raw_data: Record<string, unknown> | null;
};

type MachineMeta = {
  modelo_tipo?: string | null;
  marca?: string | null;
  marca_nombre?: string | null;
  subgrupo?: string | null;
  sucursal?: string | null;
  clientes?: { nombre?: string | null } | null;
};

type DrawerTarget = { chassis: string | null; os: string | null };
type HistoryTab = "resumen" | "servicios" | "repuestos";

const dateFormatter = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

function rawText(raw: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!raw) return null;
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function rowDate(row: HistoryRow) {
  return row.fecha_cierre_os || row.fecha_emision_factura || row.fecha_abierta_os;
}

function lineOs(line: BillingLine) {
  return rawText(line.raw_data, ["linked_service_order"]);
}

function lineComponent(line: BillingLine): "mo" | "km" | "repuestos" | "terceros" {
  const text = `${line.grupo_normalizado ?? ""} ${line.subgrupo_original ?? ""}`.toLowerCase();
  if (text.includes("repuesto")) return "repuestos";
  if (text.includes("kilometr")) return "km";
  if (text.includes("servic") || text.includes("mano de obra")) return "mo";
  return "terceros";
}

function orderFinancials(row: HistoryRow, lines: BillingLine[]) {
  const value = (component: ReturnType<typeof lineComponent>, fallback: number | null) => {
    const matches = lines.filter((line) => lineComponent(line) === component);
    return matches.length ? matches.reduce((sum, line) => sum + Number(line.total_venta || 0), 0) : Number(fallback || 0);
  };
  const mo = value("mo", row.servicios_valor);
  const km = value("km", row.kilometro_valor);
  const repuestos = value("repuestos", row.repuesto_valor);
  const terceros = value("terceros", row.terceros_valor);
  return { mo, km, repuestos, terceros, total: mo + km + repuestos + terceros };
}

function typeTone(type: string | null) {
  const normalized = String(type ?? "").toLowerCase();
  if (normalized.includes("garant")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized.includes("intern")) return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized.includes("cliente")) return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-border bg-muted/50 text-muted-foreground";
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return <div className="min-w-0 rounded-md border bg-background p-3">
    <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground"><span className="text-primary">{icon}</span>{label}</div>
    <div className="mt-1 truncate text-[18px] font-semibold leading-6 tabular-nums">{value}</div>
    {detail && <div className="truncate text-[10px] text-muted-foreground">{detail}</div>}
  </div>;
}

function Composition({ mo, km, repuestos, terceros }: { mo: number; km: number; repuestos: number; terceros: number }) {
  const items = [
    ["Mano de obra", mo],
    ["Kilometraje", km],
    ["Repuestos", repuestos],
    ["Terceros", terceros],
  ] as const;
  return <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[11px] sm:grid-cols-4">
    {items.filter(([, value]) => value !== 0).map(([label, value]) => <div key={label}>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{money(value)}</div>
    </div>)}
  </div>;
}

function Toolbar({ search, onSearch, from, to, onFrom, onTo, type, onType, showSearch = true }: {
  search: string; onSearch: (value: string) => void; from: string; to: string;
  onFrom: (value: string) => void; onTo: (value: string) => void; type: string; onType: (value: string) => void;
  showSearch?: boolean;
}) {
  return <div className={cn("grid gap-2 rounded-md border bg-muted/20 p-2", showSearch ? "sm:grid-cols-[minmax(180px,1fr)_150px_150px_135px]" : "sm:grid-cols-[150px_150px_135px]")}>
    {showSearch && <label className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar OS, factura o repuesto…" className="h-8 pl-8 text-[11px]" /></label>}
    <label className="relative"><span className="sr-only">Desde</span><Input type="date" value={from} onChange={(event) => onFrom(event.target.value)} max={to || undefined} className="h-8 text-[11px]" /></label>
    <label><span className="sr-only">Hasta</span><Input type="date" value={to} onChange={(event) => onTo(event.target.value)} min={from || undefined} className="h-8 text-[11px]" /></label>
    <select value={type} onChange={(event) => onType(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-[11px]">
      <option value="TODOS">Todos los tipos</option><option value="Cliente">Cliente</option><option value="Garantia">Garantía</option><option value="Interno">Interno</option><option value="No informado">No informado</option>
    </select>
  </div>;
}

function OrderCard({ row, lines, open, onToggle, partsOnly = false }: {
  row: HistoryRow; lines: BillingLine[]; open: boolean; onToggle: () => void; partsOnly?: boolean;
}) {
  const parts = lines.filter((line) => lineComponent(line) === "repuestos");
  const relevantLines = partsOnly ? parts : lines;
  const { mo, km, repuestos, terceros, total } = orderFinancials(row, lines);
  const invoices = Array.from(new Set(lines.map((line) => line.factura || line.codigo_interno_factura).filter(Boolean))) as string[];
  const when = rowDate(row);
  const itemCount = parts.reduce((sum, line) => sum + Math.abs(Number(line.cantidad || 0)), 0);
  if (partsOnly && !parts.length && Number(row.repuesto_valor || 0) === 0) return null;
  return <div className={cn("relative rounded-md border bg-background", open && "border-primary/35 shadow-sm")}>
    <button type="button" onClick={onToggle} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/25">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-mono text-[12px] font-semibold">OS {row.os_numero}</span>
          <span className="text-[10px] text-muted-foreground">{when ? dateFormatter.format(new Date(`${when}T00:00:00`)) : "Fecha no informada"}</span>
          <Badge variant="outline" className={cn("h-5 px-2 text-[9px]", typeTone(row.tipo_tiempo))}>{row.tipo_tiempo || "No informado"}</Badge>
          <Badge variant="secondary" className="h-5 px-2 text-[9px]">{row.situacion_os || "Sin estado"}</Badge>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {partsOnly ? `${parts.length ? `${integer.format(itemCount)} repuestos` : "Detalle no disponible"} · ${money(repuestos)}` : `${decimal.format(Number(row.servicios_cantidad || 0))} h · ${decimal.format(Number(row.km_cantidad || 0))} km · ${money(total)}`}
        </div>
      </div>
      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
    </button>
    {open && <div className="border-t px-3 py-3">
      {!partsOnly && <>
        {row.problema && <div className="mb-3"><div className="text-[10px] font-medium text-muted-foreground">Trabajo realizado</div><p className="mt-0.5 text-[12px] leading-5">{row.problema}</p></div>}
        <Composition mo={mo} km={km} repuestos={repuestos} terceros={terceros} />
        <div className="mt-3 grid gap-2 border-t pt-3 text-[10px] sm:grid-cols-3">
          <div><span className="text-muted-foreground">Técnico</span><div className="mt-0.5 font-medium">{row.responsable || "No informado"}</div></div>
          <div><span className="text-muted-foreground">Facturación</span><div className="mt-0.5 font-medium">{row.situacion_facturacion || (invoices.length ? "Facturada" : "Sin factura")}</div></div>
          <div><span className="text-muted-foreground">Facturas relacionadas</span><div className="mt-0.5 break-words font-mono font-medium">{invoices.length ? invoices.join(" · ") : row.factura || "—"}</div></div>
        </div>
      </>}
      {partsOnly && (parts.length ? <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[650px] text-[11px]">
          <thead className="bg-muted/50 text-left text-[10px] font-medium text-muted-foreground"><tr><th className="px-2.5 py-2">Cód. repuesto</th><th className="px-2.5 py-2">Cód. fabricante</th><th className="px-2.5 py-2">Repuesto</th><th className="px-2.5 py-2 text-right">Cant.</th><th className="px-2.5 py-2 text-right">Precio unit.</th><th className="px-2.5 py-2 text-right">Total</th></tr></thead>
          <tbody>{relevantLines.map((line) => <tr key={line.id} className="border-t"><td className="px-2.5 py-2 font-mono">{line.cod_mercaderia || "—"}</td><td className="px-2.5 py-2 font-mono">{line.codigo_fabricante || "—"}</td><td className="max-w-[230px] px-2.5 py-2">{line.mercaderia || line.observacion || "Sin descripción"}</td><td className="px-2.5 py-2 text-right tabular-nums">{decimal.format(Number(line.cantidad || 0))}</td><td className="px-2.5 py-2 text-right tabular-nums">{money(Number(line.valor_unitario || 0))}</td><td className="px-2.5 py-2 text-right font-semibold tabular-nums">{money(Number(line.total_venta || 0))}</td></tr>)}</tbody>
        </table>
        {invoices.length > 0 && <div className="border-t px-2.5 py-2 text-[10px] text-muted-foreground"><FileText className="mr-1.5 inline h-3 w-3" />Factura {invoices.join(" · ")}</div>}
      </div> : <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">La OS registra {money(Number(row.repuesto_valor || 0))} en repuestos, pero el histórico no conserva sus códigos de línea.</div>)}
    </div>}
  </div>;
}

export function MachineHistorySheet({ target, onOpenChange }: { target: DrawerTarget | null; onOpenChange: (open: boolean) => void }) {
  const targetChassis = target?.chassis ?? null;
  const targetOs = target?.os ?? null;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [lines, setLines] = useState<BillingLine[]>([]);
  const [machine, setMachine] = useState<MachineMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HistoryTab>(targetOs ? "servicios" : "resumen");
  const [expanded, setExpanded] = useState<string | null>(targetOs);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("TODOS");

  useEffect(() => {
    if (!targetChassis && !targetOs) return;
    let alive = true;
    setLoading(true); setError(null); setRows([]); setLines([]); setMachine(null);
    setTab(targetOs ? "servicios" : "resumen"); setExpanded(targetOs); setSearch(""); setFrom(""); setTo(""); setType("TODOS");
    const osQuery = (supabase.from("ordenes_servicio_importadas" as any) as any)
      .select("os_numero,fecha_abierta_os,fecha_cierre_os,fecha_emision_factura,factura,tipo_tiempo,problema,servicios_cantidad,servicios_valor,km_cantidad,kilometro_valor,repuesto_valor,terceros_valor,situacion_os,situacion_facturacion,responsable,cliente_nombre,marca,raw_data")
      .order("fecha_abierta_os", { ascending: false });
    const filteredOsQuery = targetOs ? osQuery.eq("os_numero", targetOs) : osQuery.ilike("nro_chasis", targetChassis);
    filteredOsQuery.then(async ({ data, error: osError }: { data: HistoryRow[] | null; error?: { message?: string } | null }) => {
      if (!alive) return;
      if (osError) { setError(osError.message || "No se pudo cargar el historial."); setLoading(false); return; }
      const nextRows = data ?? [];
      setRows(nextRows);
      const osNumbers = nextRows.map((row) => row.os_numero).filter(Boolean);
      const requests: PromiseLike<any>[] = [];
      if (osNumbers.length) requests.push((supabase.from("facturacion_lineas_importadas" as any) as any)
        .select("id,factura,codigo_interno_factura,fecha_factura,grupo_normalizado,subgrupo_original,cod_mercaderia,codigo_fabricante,mercaderia,observacion,cantidad,valor_unitario,total_venta,raw_data")
        .in("raw_data->>linked_service_order", osNumbers));
      if (targetChassis) requests.push((supabase.from("parque_maquinas" as any) as any)
        .select("modelo_tipo,marca,marca_nombre,subgrupo,sucursal,clientes(nombre)")
        .ilike("serie", targetChassis).limit(1).maybeSingle());
      const results = await Promise.all(requests);
      if (!alive) return;
      const lineResult = osNumbers.length ? results[0] : null;
      const machineResult = targetChassis ? results[results.length - 1] : null;
      setLines((lineResult?.data as BillingLine[] | null) ?? []);
      setMachine((machineResult?.data as MachineMeta | null) ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [targetChassis, targetOs]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const date = rowDate(row) ?? "";
    const matchesDate = (!from || date >= from) && (!to || date <= to);
    const matchesType = type === "TODOS" || String(row.tipo_tiempo ?? "No informado").toLowerCase().startsWith(type.toLowerCase());
    const haystack = `${row.os_numero} ${row.factura ?? ""} ${row.problema ?? ""} ${row.responsable ?? ""}`.toLowerCase();
    const rowLines = lines.filter((line) => lineOs(line) === row.os_numero);
    const lineHaystack = rowLines.map((line) => `${line.cod_mercaderia ?? ""} ${line.codigo_fabricante ?? ""} ${line.mercaderia ?? ""}`).join(" ").toLowerCase();
    return matchesDate && matchesType && (!search.trim() || `${haystack} ${lineHaystack}`.includes(search.trim().toLowerCase()));
  }), [from, lines, rows, search, to, type]);

  const totals = useMemo(() => filteredRows.reduce((acc, row) => {
    const osLines = lines.filter((line) => lineOs(line) === row.os_numero);
    acc.total += orderFinancials(row, osLines).total;
    acc.hours += Number(row.servicios_cantidad || 0); acc.km += Number(row.km_cantidad || 0);
    if (Number(row.repuesto_valor || 0) !== 0 || osLines.some((line) => lineComponent(line) === "repuestos")) acc.partsOrders += 1;
    if (osLines.some((line) => lineComponent(line) === "repuestos")) acc.detailedPartsOrders += 1;
    return acc;
  }, { total: 0, hours: 0, km: 0, partsOrders: 0, detailedPartsOrders: 0 }), [filteredRows, lines]);

  const latest = filteredRows.map(rowDate).filter(Boolean).sort().at(-1) ?? null;
  const model = machine?.modelo_tipo || rawText(rows[0]?.raw_data, ["MODELO", "Modelo", "modelo"]) || machine?.subgrupo || "Máquina";
  const client = machine?.clientes?.nombre || rows.find((row) => row.cliente_nombre)?.cliente_nombre || "Cliente no informado";
  const title = target?.os ? `Detalle de la OS ${target.os}` : "Historial de la máquina";

  return <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]">
      <SheetHeader className="border-b px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="text-[18px]">{title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"><span className="font-medium text-foreground">{model}</span>{target?.chassis && <span>Chasis {target.chassis}</span>}<span>· {client}</span></SheetDescription>
      </SheetHeader>
      <Tabs value={tab} onValueChange={(value) => setTab(value as HistoryTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-10 w-full justify-start rounded-none border-b bg-background px-5 py-0">
          <TabsTrigger value="resumen" className="h-10 rounded-none border-b-2 border-transparent px-4 text-[11px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><History className="mr-1.5 h-3.5 w-3.5" />Resumen</TabsTrigger>
          <TabsTrigger value="servicios" className="h-10 rounded-none border-b-2 border-transparent px-4 text-[11px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><Wrench className="mr-1.5 h-3.5 w-3.5" />Servicios</TabsTrigger>
          <TabsTrigger value="repuestos" className="h-10 rounded-none border-b-2 border-transparent px-4 text-[11px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><Package className="mr-1.5 h-3.5 w-3.5" />Repuestos</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? <div className="flex min-h-64 items-center justify-center text-[12px] text-muted-foreground">Cargando historial…</div>
            : error ? <div className="flex min-h-64 items-center justify-center text-[12px] text-destructive">{error}</div>
            : !rows.length ? <div className="flex min-h-64 items-center justify-center text-[12px] text-muted-foreground">No se encontraron órdenes de servicio para esta máquina.</div>
            : <>
              <TabsContent value="resumen" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <Metric icon={<Wrench className="h-3.5 w-3.5" />} label="Órdenes de servicio" value={integer.format(filteredRows.length)} />
                  <Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="Horas registradas" value={`${decimal.format(totals.hours)} h`} detail={`${decimal.format(totals.km)} km`} />
                  <Metric icon={<CalendarDays className="h-3.5 w-3.5" />} label="Última intervención" value={latest ? dateFormatter.format(new Date(`${latest}T00:00:00`)) : "—"} />
                  <Metric icon={<FileText className="h-3.5 w-3.5" />} label="Facturación vinculada" value={money(totals.total)} />
                </div>
                <Toolbar search={search} onSearch={setSearch} from={from} to={to} onFrom={setFrom} onTo={setTo} type={type} onType={setType} showSearch={false} />
                <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                  <div className="rounded-md border p-3"><h3 className="text-[12px] font-semibold">Actividad por tipo</h3><div className="mt-3 space-y-2">{["Cliente", "Garantia", "Interno", "No informado"].map((name) => { const count = filteredRows.filter((row) => String(row.tipo_tiempo || "No informado").toLowerCase().startsWith(name.toLowerCase())).length; const share = filteredRows.length ? (count / filteredRows.length) * 100 : 0; return <div key={name} className="grid grid-cols-[85px_1fr_28px] items-center gap-2 text-[10px]"><span>{name === "Garantia" ? "Garantía" : name}</span><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} /></div><span className="text-right tabular-nums text-muted-foreground">{count}</span></div>; })}</div></div>
                  <div className="rounded-md border p-3"><h3 className="text-[12px] font-semibold">Últimas intervenciones</h3><div className="mt-2 divide-y">{filteredRows.slice(0, 4).map((row) => <button key={row.os_numero} type="button" onClick={() => { setTab("servicios"); setExpanded(row.os_numero); }} className="grid w-full grid-cols-[1fr_auto] gap-3 py-2 text-left hover:text-primary"><div className="min-w-0"><div className="truncate font-mono text-[11px] font-semibold">OS {row.os_numero}</div><div className="truncate text-[10px] text-muted-foreground">{row.problema || "Sin descripción del trabajo"}</div></div><span className="text-[10px] text-muted-foreground">{rowDate(row) ? dateFormatter.format(new Date(`${rowDate(row)}T00:00:00`)) : "—"}</span></button>)}</div></div>
                </div>
              </TabsContent>
              <TabsContent value="servicios" className="mt-0 space-y-3">
                <Toolbar search={search} onSearch={setSearch} from={from} to={to} onFrom={setFrom} onTo={setTo} type={type} onType={setType} />
                <div className="space-y-2">{filteredRows.map((row) => <OrderCard key={row.os_numero} row={row} lines={lines.filter((line) => lineOs(line) === row.os_numero)} open={expanded === row.os_numero} onToggle={() => setExpanded(expanded === row.os_numero ? null : row.os_numero)} />)}{!filteredRows.length && <div className="py-12 text-center text-[11px] text-muted-foreground">No hay servicios con estos filtros.</div>}</div>
              </TabsContent>
              <TabsContent value="repuestos" className="mt-0 space-y-3">
                <Toolbar search={search} onSearch={setSearch} from={from} to={to} onFrom={setFrom} onTo={setTo} type={type} onType={setType} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric icon={<Boxes className="h-3.5 w-3.5" />} label="Órdenes con repuestos" value={integer.format(totals.partsOrders)} /><Metric icon={<Package className="h-3.5 w-3.5" />} label="Líneas identificadas" value={integer.format(lines.filter((line) => lineComponent(line) === "repuestos").length)} /><Metric icon={<Users className="h-3.5 w-3.5" />} label="Cobertura" value={totals.detailedPartsOrders === totals.partsOrders ? "Detallada" : totals.detailedPartsOrders ? "Mixta" : "Histórica"} /></div>
                <div className="space-y-2">{filteredRows.map((row) => <OrderCard key={row.os_numero} row={row} lines={lines.filter((line) => lineOs(line) === row.os_numero)} open={expanded === row.os_numero} onToggle={() => setExpanded(expanded === row.os_numero ? null : row.os_numero)} partsOnly />)}</div>
              </TabsContent>
            </>}
        </div>
      </Tabs>
    </SheetContent>
  </Sheet>;
}
