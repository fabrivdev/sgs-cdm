/* eslint-disable @typescript-eslint/no-explicit-any -- La RPC queda tipada al regenerar los tipos después de aplicar su migración. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LineaAnalisis = {
  id: string;
  fecha: string;
  factura: string;
  os: string | null;
  cliente: string;
  sucursal: string;
  tipo_tiempo: string;
  componente: string;
  total_venta: number;
  cantidad: number;
};

type Dimension = "mes" | "sucursal" | "cliente" | "componente" | "tipo_tiempo";
type Metric = "usd" | "facturas" | "cantidad";

const DIMENSION_LABEL: Record<Dimension, string> = { mes: "Mes", sucursal: "Sucursal", cliente: "Cliente", componente: "Componente", tipo_tiempo: "Tipo de tiempo" };
const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

function dimensionValue(line: LineaAnalisis, dimension: Dimension) {
  if (dimension === "mes") {
    const key = line.fecha.slice(0, 7);
    const [year, month] = key.split("-");
    return { key, label: `${month}/${year}` };
  }
  if (dimension === "sucursal") return { key: line.sucursal, label: line.sucursal };
  if (dimension === "cliente") return { key: line.cliente, label: line.cliente };
  if (dimension === "tipo_tiempo") return { key: line.tipo_tiempo, label: line.tipo_tiempo };
  return { key: line.componente, label: line.componente };
}

function metricValue(cell: { usd: number; facturas: Set<string>; cantidad: number }, metric: Metric) {
  return metric === "usd" ? cell.usd : metric === "facturas" ? cell.facturas.size : cell.cantidad;
}
function formatMetric(value: number, metric: Metric) {
  if (metric === "usd") return usd.format(value);
  return metric === "facturas" ? Math.round(value).toLocaleString("es-PY") : quantity.format(value);
}

export function ServiciosAnalisis({ desde, hasta, sucursal, buscar, tipoTiempo }: { desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string }) {
  const [lines, setLines] = useState<LineaAnalisis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowDim, setRowDim] = useState<Dimension>("mes");
  const [colDim, setColDim] = useState<Dimension>("componente");
  const [metric, setMetric] = useState<Metric>("usd");

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null);
    (supabase as any)
      .rpc("ventas_servicios_lineas", { p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo })
      .then(({ data, error: rpcError }: any) => {
        if (!alive) return;
        if (rpcError) { setError(rpcError.message ?? "No se pudo cargar el análisis."); setLines([]); }
        else setLines((data as LineaAnalisis[]) ?? []);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [desde, hasta, sucursal, tipoTiempo]);

  const filteredLines = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((line) => [line.cliente, line.factura, line.os, line.tipo_tiempo, line.componente].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [lines, buscar]);

  const pivot = useMemo(() => {
    type Cell = { usd: number; facturas: Set<string>; cantidad: number };
    type Row = Cell & { key: string; label: string; cells: Map<string, Cell> };
    const columns = new Map<string, string>();
    const rows = new Map<string, Row>();
    filteredLines.forEach((line) => {
      const row = dimensionValue(line, rowDim);
      const column = dimensionValue(line, colDim);
      columns.set(column.key, column.label);
      const current = rows.get(row.key) ?? { key: row.key, label: row.label, usd: 0, facturas: new Set<string>(), cantidad: 0, cells: new Map<string, Cell>() };
      const cell = current.cells.get(column.key) ?? { usd: 0, facturas: new Set<string>(), cantidad: 0 };
      const invoiceKey = `${line.factura}__${line.fecha}`;
      current.usd += Number(line.total_venta || 0); current.facturas.add(invoiceKey); current.cantidad += Number(line.cantidad || 0);
      cell.usd += Number(line.total_venta || 0); cell.facturas.add(invoiceKey); cell.cantidad += Number(line.cantidad || 0);
      current.cells.set(column.key, cell); rows.set(row.key, current);
    });
    return {
      columns: [...columns].map(([key, label]) => ({ key, label })).sort((a, b) => a.key.localeCompare(b.key)),
      rows: [...rows.values()].sort((a, b) => metricValue(b, metric) - metricValue(a, metric)),
    };
  }, [filteredLines, rowDim, colDim, metric]);

  const dimensionOptions: Dimension[] = ["mes", "sucursal", "cliente", "componente", "tipo_tiempo"];

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
        <label className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">Filas</span>
          <select value={rowDim} onChange={(event) => {
            const next = event.target.value as Dimension;
            setRowDim(next);
            if (next === colDim) setColDim(dimensionOptions.find((option) => option !== next) ?? colDim);
          }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">
            {dimensionOptions.map((option) => <option key={option} value={option}>{DIMENSION_LABEL[option]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">Columnas</span>
          <select value={colDim} onChange={(event) => {
            const next = event.target.value as Dimension;
            setColDim(next);
            if (next === rowDim) setRowDim(dimensionOptions.find((option) => option !== next) ?? rowDim);
          }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">
            {dimensionOptions.map((option) => <option key={option} value={option}>{DIMENSION_LABEL[option]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">Medida</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">
            <option value="usd">USD facturados</option><option value="facturas">Facturas</option><option value="cantidad">Cantidad operativa</option>
          </select>
        </label>
      </div>

      {loading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando…</div>
        : error ? <div className="py-12 text-center text-[12px] text-destructive">{error}</div>
        : (
          <div className="overflow-x-auto rounded-md border">
            <div className="min-w-max">
              <div className="grid items-center border-b bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground" style={{ gridTemplateColumns: `220px repeat(${Math.max(pivot.columns.length, 1)}, minmax(120px, 1fr)) 140px` }}>
                <div>{DIMENSION_LABEL[rowDim]}</div>
                {pivot.columns.map((column) => <div key={column.key} className="text-right">{column.label}</div>)}
                <div className="text-right">Total</div>
              </div>
              <div className="max-h-[440px] overflow-y-auto">
                {!pivot.rows.length ? <div className="w-[700px] py-12 text-center text-[12px] text-muted-foreground">No hay datos para esta combinación.</div>
                  : pivot.rows.map((row) => (
                    <div key={row.key} className="grid items-center border-b px-3 py-2 text-[12px] last:border-0" style={{ gridTemplateColumns: `220px repeat(${Math.max(pivot.columns.length, 1)}, minmax(120px, 1fr)) 140px` }}>
                      <div className="truncate font-medium" title={row.label}>{row.label}</div>
                      {pivot.columns.map((column) => <div key={column.key} className="text-right tabular-nums text-muted-foreground">{row.cells.get(column.key) ? formatMetric(metricValue(row.cells.get(column.key)!, metric), metric) : "—"}</div>)}
                      <div className="text-right font-semibold tabular-nums">{formatMetric(metricValue(row, metric), metric)}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
