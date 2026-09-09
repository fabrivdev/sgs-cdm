/* eslint-disable @typescript-eslint/no-explicit-any -- La RPC queda tipada al regenerar los tipos después de aplicar su migración. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Receipt, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel, SectionHeader } from "@/components/layout/AppPrimitives";
import { FilterDate, FilterSelect, FiltersBar } from "@/components/filters/FiltersBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeletonRows } from "@/components/LoadingSkeletons";
import { SUCURSALES } from "@/lib/constants";

export type VentasArea = "servicios" | "repuestos" | "maquinas";

type Breakdown = { concepto: string; importe: number };
type SalesDocument = {
  id: string;
  fecha: string;
  factura: string;
  cliente: string;
  sucursal: string | null;
  metodologia: "historico" | "actual";
  vinculada_os: boolean;
  total_venta: number;
  conceptos: Breakdown[];
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
  sucursales: { sucursal: string; importe: number }[];
  documentos: SalesDocument[];
};

const AREA_COPY: Record<VentasArea, { title: string; empty: string }> = {
  servicios: { title: "Ventas de Servicios", empty: "No hay facturación de Servicios en el período." },
  repuestos: { title: "Ventas de Repuestos", empty: "No hay facturación de Repuestos en el período." },
  maquinas: { title: "Ventas de Máquinas", empty: "No hay facturación de Máquinas en el período." },
};

const usd = new Intl.NumberFormat("es-PY", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PY").format(new Date(`${value}T00:00:00`));
}

function uniqueConcepts(items: Breakdown[]) {
  return Array.from(new Set((items ?? []).map((item) => item.concepto))).join(" · ") || "—";
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
      p_area: area,
      p_desde: desde,
      p_hasta: hasta,
      p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null,
      p_limite: 300,
    });

    if (rpcError) {
      setError(rpcError.message ?? "No se pudo cargar Ventas.");
      setData(null);
    } else {
      setData(response as SalesResponse);
    }
    setLoading(false);
  }, [area, buscar, desde, hasta, sucursal]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFilters = Number(sucursal !== "TODAS") + Number(Boolean(buscar));
  const copy = AREA_COPY[area];
  const onlyHistorical = Boolean(data && data.historico !== 0 && data.actual === 0);

  return (
    <PageShell>
      <PageHeader title={copy.title} />

      <FiltersBar
        search={{ value: buscar, onChange: setBuscar, placeholder: "Factura, cliente o concepto…" }}
        activeCount={activeFilters}
        onClear={() => { setBuscar(""); setSucursal("TODAS"); }}
        meta={data ? `${data.facturas.toLocaleString("es-PY")} facturas` : undefined}
      >
        <FilterDate label="Desde" value={desde} onChange={setDesde} max={hasta} />
        <FilterDate label="Hasta" value={hasta} onChange={setHasta} min={desde} />
        <FilterSelect
          label="Sucursal"
          value={sucursal}
          onChange={setSucursal}
          placeholder="Todas"
          options={[{ value: "TODAS", label: "Todas" }, ...SUCURSALES.map((value) => ({ value, label: value }))]}
        />
      </FiltersBar>

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <>
          <KpiStrip>
            <KpiItem label="Facturado" value={loading ? "—" : usd.format(data?.total ?? 0)} icon={<Receipt />} />
            <KpiItem label="Facturas" value={loading ? "—" : (data?.facturas ?? 0).toLocaleString("es-PY")} icon={<FileText />} />
            <KpiItem label="Clientes" value={loading ? "—" : (data?.clientes ?? 0).toLocaleString("es-PY")} icon={<Users />} />
            <KpiItem label="Promedio por factura" value={loading ? "—" : usd.format(data?.promedio ?? 0)} />
          </KpiStrip>

          {(data?.cruza_corte || onlyHistorical) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {data.cruza_corte
                  ? `El período combina histórico (${usd.format(data.historico)}) y sistema actual (${usd.format(data.actual)}). La separación por OS o mostrador solo existe desde el 01/07/2026.`
                  : "En el histórico no existe una separación confiable entre OS y mostrador; se conserva el rubro contable original."}
              </span>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
            <Panel className="overflow-hidden p-0">
              <div className="px-3.5 pt-3">
                <SectionHeader title="Facturas" meta={data && data.facturas > data.documentos.length ? `Últimas ${data.documentos.length}` : undefined} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Facturado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? <TableSkeletonRows columns={6} rows={7} /> : data?.documentos.length ? data.documentos.map((row) => (
                    <TableRow key={`${row.id}-${row.fecha}-${row.factura}`}>
                      <TableCell className="whitespace-nowrap">{formatDate(row.fecha)}</TableCell>
                      <TableCell className="font-medium">{row.factura}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={row.cliente}>{row.cliente || "—"}</TableCell>
                      <TableCell>{row.sucursal || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span>{uniqueConcepts(row.conceptos)}</span>
                          {row.metodologia === "historico" && <Badge variant="outline" className="text-[9px]">Histórico</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{usd.format(row.total_venta)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{copy.empty}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Panel>

            <div className="space-y-3">
              <Panel>
                <SectionHeader title="Composición" />
                <div className="mt-2 divide-y">
                  {(data?.desglose ?? []).map((item) => (
                    <div key={item.concepto} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                      <span>{item.concepto}</span>
                      <span className="font-medium tabular-nums">{usd.format(item.importe)}</span>
                    </div>
                  ))}
                  {!loading && !data?.desglose.length && <div className="py-5 text-center text-[11px] text-muted-foreground">Sin datos</div>}
                </div>
              </Panel>

              <Panel>
                <SectionHeader title="Por sucursal" />
                <div className="mt-2 divide-y">
                  {(data?.sucursales ?? []).map((item) => (
                    <div key={item.sucursal} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                      <span>{item.sucursal}</span>
                      <span className="font-medium tabular-nums">{usd.format(item.importe)}</span>
                    </div>
                  ))}
                  {!loading && !data?.sucursales.length && <div className="py-5 text-center text-[11px] text-muted-foreground">Sin datos</div>}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
