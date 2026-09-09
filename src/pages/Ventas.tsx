/* eslint-disable @typescript-eslint/no-explicit-any -- La RPC queda tipada al regenerar los tipos después de aplicar su migración. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Receipt, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { FilterDate, FilterSelect, FiltersBar } from "@/components/filters/FiltersBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeletonRows } from "@/components/LoadingSkeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SUCURSALES } from "@/lib/constants";

export type VentasArea = "servicios" | "repuestos" | "maquinas";
type Breakdown = { concepto: string; importe: number };
type BranchBreakdown = { sucursal: string; importe: number; facturas: number };
type SalesGroup = {
  clave: string;
  nombre: string;
  referencia: string | null;
  marca: string | null;
  cantidad: number;
  facturas: number;
  clientes: number;
  importe: number;
};
type SalesLine = {
  id: string;
  fecha: string;
  factura: string;
  cliente: string;
  sucursal: string | null;
  concepto: string;
  metodologia: "historico" | "actual";
  total_venta: number;
  cantidad: number;
  os_numero: string | null;
  codigo: string | null;
  codigo_fabricante: string | null;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  chasis: string | null;
};
type SalesResponse = {
  total: number;
  facturas: number;
  clientes: number;
  promedio: number;
  historico: number;
  actual: number;
  cruza_corte: boolean;
  desglose: Breakdown[];
  sucursales: BranchBreakdown[];
  grupos: SalesGroup[];
  lineas: SalesLine[];
};

const AREA_COPY: Record<VentasArea, { title: string; detailTab: string; empty: string; search: string }> = {
  servicios: { title: "Ventas de Servicios", detailTab: "Por OS", empty: "No hay ventas de Servicios en el período.", search: "OS, factura o cliente…" },
  repuestos: { title: "Ventas de Repuestos", detailTab: "Por repuesto", empty: "No hay ventas de Repuestos en el período.", search: "Código, repuesto, factura o cliente…" },
  maquinas: { title: "Ventas de Máquinas", detailTab: "Por máquina", empty: "No hay ventas de Máquinas en el período.", search: "Modelo, chasis, factura o cliente…" },
};

const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PY").format(new Date(`${value}T00:00:00`));
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{text}</TableCell></TableRow>;
}

function SummaryTable({ data, total, loading }: { data: Breakdown[]; total: number; loading: boolean }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Participación</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow></TableHeader>
      <TableBody>
        {loading ? <TableSkeletonRows columns={3} rows={4} /> : data.length ? data.map((row) => (
          <TableRow key={row.concepto}>
            <TableCell className="font-medium">{row.concepto}</TableCell>
            <TableCell className="text-right tabular-nums">{total ? `${((row.importe / total) * 100).toFixed(1)}%` : "—"}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{usd.format(row.importe)}</TableCell>
          </TableRow>
        )) : <EmptyRow columns={3} text="Sin datos" />}
      </TableBody>
    </Table>
  );
}

function GroupTable({ area, rows, loading, empty }: { area: VentasArea; rows: SalesGroup[]; loading: boolean; empty: string }) {
  const columns = area === "servicios" ? 5 : 6;
  return (
    <Table>
      <TableHeader>
        {area === "servicios" ? (
          <TableRow><TableHead>OS</TableHead><TableHead>Composición</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow>
        ) : area === "repuestos" ? (
          <TableRow><TableHead>Código</TableHead><TableHead>Cód. fabricante</TableHead><TableHead>Repuesto</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow>
        ) : (
          <TableRow><TableHead>Modelo</TableHead><TableHead>Chasis</TableHead><TableHead>Marca</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow>
        )}
      </TableHeader>
      <TableBody>
        {loading ? <TableSkeletonRows columns={columns} rows={7} /> : rows.length ? rows.map((row) => (
          <TableRow key={row.clave}>
            {area === "servicios" ? <>
              <TableCell className="font-medium">{row.nombre}</TableCell><TableCell>{row.referencia || "—"}</TableCell><TableCell className="text-right tabular-nums">{row.facturas}</TableCell><TableCell className="text-right tabular-nums">{row.clientes}</TableCell>
            </> : area === "repuestos" ? <>
              <TableCell className="font-medium">{row.clave}</TableCell><TableCell>{row.referencia || "—"}</TableCell><TableCell className="max-w-[340px] truncate" title={row.nombre}>{row.nombre}</TableCell><TableCell className="text-right tabular-nums">{number.format(row.cantidad)}</TableCell><TableCell className="text-right tabular-nums">{row.facturas}</TableCell>
            </> : <>
              <TableCell className="font-medium">{row.nombre}</TableCell><TableCell className="font-mono text-[12px]">{row.referencia || "—"}</TableCell><TableCell>{row.marca || "—"}</TableCell><TableCell className="text-right tabular-nums">{number.format(row.cantidad)}</TableCell><TableCell className="text-right tabular-nums">{row.facturas}</TableCell>
            </>}
            <TableCell className="text-right font-medium tabular-nums">{usd.format(row.importe)}</TableCell>
          </TableRow>
        )) : <EmptyRow columns={columns} text={empty} />}
      </TableBody>
    </Table>
  );
}

function InvoiceTable({ area, rows, loading, empty }: { area: VentasArea; rows: SalesLine[]; loading: boolean; empty: string }) {
  const identityLabel = area === "servicios" ? "OS" : area === "repuestos" ? "Código" : "Modelo / chasis";
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Factura</TableHead><TableHead>Cliente</TableHead><TableHead>{identityLabel}</TableHead><TableHead>Sucursal</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow></TableHeader>
      <TableBody>
        {loading ? <TableSkeletonRows columns={6} rows={7} /> : rows.length ? rows.map((row) => {
          const identity = area === "servicios"
            ? (row.os_numero || (row.metodologia === "historico" ? "No disponible" : "Sin OS"))
            : area === "repuestos"
              ? (row.codigo || row.codigo_fabricante || "Sin código")
              : `${row.modelo || row.descripcion || "Modelo no informado"} · ${row.chasis || "Sin chasis"}`;
          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{formatDate(row.fecha)}</TableCell>
              <TableCell className="font-medium">{row.factura}</TableCell>
              <TableCell className="max-w-[280px] truncate" title={row.cliente}>{row.cliente || "—"}</TableCell>
              <TableCell className="max-w-[300px] truncate" title={identity}>{identity}</TableCell>
              <TableCell>{row.sucursal || "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{usd.format(row.total_venta)}</TableCell>
            </TableRow>
          );
        }) : <EmptyRow columns={6} text={empty} />}
      </TableBody>
    </Table>
  );
}

export default function Ventas({ area }: { area: VentasArea }) {
  const now = useMemo(() => new Date(), []);
  const [desde, setDesde] = useState(`${now.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(isoDate(now));
  const [sucursal, setSucursal] = useState("TODAS");
  const [buscar, setBuscar] = useState("");
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!desde || !hasta || desde > hasta) {
      setError("Seleccioná un rango de fechas válido.");
      setData(null);
      setLoading(false);
      return;
    }
    const { data: response, error: rpcError } = await (supabase as any).rpc("ventas_area_resumen", {
      p_area: area, p_desde: desde, p_hasta: hasta,
      p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_limite: 500,
    });
    if (rpcError) {
      setError(rpcError.message ?? "No se pudo cargar Ventas.");
      setData(null);
    } else setData(response as SalesResponse);
    setLoading(false);
  }, [area, buscar, desde, hasta, sucursal]);

  useEffect(() => { void load(); }, [load]);

  const copy = AREA_COPY[area];
  const activeFilters = Number(sucursal !== "TODAS") + Number(Boolean(buscar));
  const onlyHistorical = Boolean(data && data.historico !== 0 && data.actual === 0);

  return (
    <PageShell>
      <PageHeader title={copy.title} />
      <FiltersBar search={{ value: buscar, onChange: setBuscar, placeholder: copy.search }} activeCount={activeFilters} onClear={() => { setBuscar(""); setSucursal("TODAS"); }} meta={data ? `${data.facturas.toLocaleString("es-PY")} facturas` : undefined}>
        <FilterDate label="Desde" value={desde} onChange={setDesde} max={hasta} />
        <FilterDate label="Hasta" value={hasta} onChange={setHasta} min={desde} />
        <FilterSelect label="Sucursal" value={sucursal} onChange={setSucursal} placeholder="Todas" options={[{ value: "TODAS", label: "Todas" }, ...SUCURSALES.map((value) => ({ value, label: value }))]} />
      </FiltersBar>

      {error ? <ErrorState description={error} onRetry={() => void load()} /> : <>
        <KpiStrip>
          <KpiItem label="Facturado" value={loading ? "—" : usd.format(data?.total ?? 0)} icon={<Receipt />} />
          <KpiItem label="Facturas" value={loading ? "—" : (data?.facturas ?? 0).toLocaleString("es-PY")} icon={<FileText />} />
          <KpiItem label="Clientes" value={loading ? "—" : (data?.clientes ?? 0).toLocaleString("es-PY")} icon={<Users />} />
          <KpiItem label="Promedio por factura" value={loading ? "—" : usd.format(data?.promedio ?? 0)} />
        </KpiStrip>

        {(data?.cruza_corte || onlyHistorical) && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{data.cruza_corte ? `El período combina histórico (${usd.format(data.historico)}) y sistema actual (${usd.format(data.actual)}). La separación OS/mostrador comienza el 01/07/2026.` : "En el histórico se conserva el rubro contable; el número de OS o el canal no está disponible de forma confiable."}</span></div>}

        <Tabs defaultValue="resumen">
          <TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="resumen">Resumen</TabsTrigger><TabsTrigger value="detalle">{copy.detailTab}</TabsTrigger><TabsTrigger value="facturas">Facturas</TabsTrigger><TabsTrigger value="sucursales">Por sucursal</TabsTrigger></TabsList>
          <TabsContent value="resumen"><Panel className="overflow-hidden p-0"><div className="px-3.5 pt-3"><SectionHeader title="Composición de ventas" /></div><SummaryTable data={data?.desglose ?? []} total={data?.total ?? 0} loading={loading} /></Panel></TabsContent>
          <TabsContent value="detalle"><Panel className="overflow-hidden p-0"><div className="px-3.5 pt-3"><SectionHeader title={copy.detailTab} meta={data ? `${data.grupos.length.toLocaleString("es-PY")} registros` : undefined} /></div><GroupTable area={area} rows={data?.grupos ?? []} loading={loading} empty={copy.empty} /></Panel></TabsContent>
          <TabsContent value="facturas"><Panel className="overflow-hidden p-0"><div className="px-3.5 pt-3"><SectionHeader title="Detalle facturado" meta={data && data.lineas.length === 500 ? "Últimas 500 líneas" : undefined} /></div><InvoiceTable area={area} rows={data?.lineas ?? []} loading={loading} empty={copy.empty} /></Panel></TabsContent>
          <TabsContent value="sucursales"><Panel className="overflow-hidden p-0"><div className="px-3.5 pt-3"><SectionHeader title="Ventas por sucursal" /></div><Table><TableHeader><TableRow><TableHead>Sucursal</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Facturado</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableSkeletonRows columns={3} rows={4} /> : data?.sucursales.length ? data.sucursales.map((row) => <TableRow key={row.sucursal}><TableCell className="font-medium">{row.sucursal}</TableCell><TableCell className="text-right tabular-nums">{row.facturas}</TableCell><TableCell className="text-right font-medium tabular-nums">{usd.format(row.importe)}</TableCell></TableRow>) : <EmptyRow columns={3} text="Sin datos" />}</TableBody></Table></Panel></TabsContent>
        </Tabs>
      </>}
    </PageShell>
  );
}
