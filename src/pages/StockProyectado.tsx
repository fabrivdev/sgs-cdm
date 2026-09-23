import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardList, PackageCheck, ShoppingCart } from "lucide-react";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pageShell } from "@/lib/ui-classes";
import {
  PROJECTED_STOCK_START,
  parseProjectedMachineStock,
  projectedStockTotals,
  type ProjectedMachineStockRow,
} from "@/lib/projectedMachineStock";

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const units = (value: number) => value.toLocaleString("es-PY", { maximumFractionDigits: 2 });
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-PY");

export default function StockProyectado() {
  const { can } = useAuth();
  const [cutoff, setCutoff] = useState(today);
  const [rows, setRows] = useState<ProjectedMachineStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [program, setProgram] = useState("all");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as unknown as RpcClient).rpc("parque_stock_proyectado_v1", { p_corte: cutoff });
    if (error) {
      setRows([]);
      setLoadError(error.message?.includes("schema cache") || error.message?.includes("function")
        ? "Falta aplicar la migración de Stock proyectado."
        : error.message || "No se pudo calcular el stock proyectado.");
    } else {
      setRows(parseProjectedMachineStock(data).filas);
    }
    setLoading(false);
  }, [cutoff]);

  useEffect(() => { void load(); }, [load]);

  const options = useMemo(() => ({
    programs: [...new Set(rows.map((row) => row.programa))].sort(),
    brands: [...new Set(rows.map((row) => row.marca))].sort(),
    types: [...new Set(rows.map((row) => row.tipo))].sort(),
  }), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleUpperCase("es");
    return rows.filter((row) => {
      if (program !== "all" && row.programa !== program) return false;
      if (brand !== "all" && row.marca !== brand) return false;
      if (type !== "all" && row.tipo !== type) return false;
      return !term || [row.programa, row.marca, row.tipo, row.modelo]
        .some((value) => value.toLocaleUpperCase("es").includes(term));
    });
  }, [brand, program, q, rows, type]);

  const totals = useMemo(() => projectedStockTotals(filtered), [filtered]);
  const columns: SalesColumn<ProjectedMachineStockRow>[] = [
    { key: "programa", label: "Programa", kind: "text", value: (row) => row.programa },
    { key: "marca", label: "Marca", kind: "text", value: (row) => row.marca },
    { key: "tipo", label: "Tipo", kind: "text", value: (row) => row.tipo },
    { key: "modelo", label: "Modelo", kind: "text", value: (row) => row.modelo },
    { key: "stock", label: "Stock", kind: "number", align: "center", value: (row) => row.stock },
    { key: "pedidos_compra", label: "OC", kind: "number", align: "center", value: (row) => row.pedidos_compra },
    { key: "disponibilidad", label: "Disponible", kind: "number", align: "center", value: (row) => row.disponibilidad },
    { key: "ventas_pendientes", label: "Ventas pend.", kind: "number", align: "center", value: (row) => row.ventas_pendientes },
    { key: "stock_proyectado", label: "Proyectado", kind: "number", align: "center", value: (row) => row.stock_proyectado },
  ];
  const table = useSectionTable({
    rows: filtered,
    columns,
    title: "Stock proyectado",
    fileName: `stock-proyectado-${cutoff}.xlsx`,
    initialSort: { key: "marca", direction: "asc" },
    disabled: loading || !!loadError,
  });
  const viewColumns: CompactListColumn<ProjectedMachineStockRow>[] = columns.map((column) => {
    const layout: Record<string, Pick<CompactListColumn<ProjectedMachineStockRow>, "width" | "hiddenBelow">> = {
      programa: { width: "lg:w-[9%]", hiddenBelow: "lg" },
      marca: { width: "w-[18%] md:w-[12%] lg:w-[9%]" },
      tipo: { width: "md:w-[18%] lg:w-[15%]", hiddenBelow: "md" },
      modelo: { width: "w-[40%] md:w-[26%] lg:w-[24%]" },
      stock: { width: "w-[14%] md:w-[9%] lg:w-[8%]" },
      pedidos_compra: { width: "md:w-[8%]", hiddenBelow: "md" },
      disponibilidad: { width: "lg:w-[9%]", hiddenBelow: "lg" },
      ventas_pendientes: { width: "md:w-[11%] lg:w-[10%]", hiddenBelow: "md" },
      stock_proyectado: { width: "w-[18%] md:w-[11%] lg:w-[8%]" },
    };
    return {
      ...column,
      ...layout[column.key],
      render: (row) => column.key === "modelo" ? (
        <CompactListInfo label={row.modelo} fields={[
          ["Programa", row.programa], ["Marca", row.marca], ["Tipo", row.tipo],
          ["Arribos", units(row.arribos_periodo)], ["Facturas/NC", units(row.ventas_netas_periodo)],
        ]} />
      ) : column.kind === "number" ? (
        <span className={column.key === "stock_proyectado" && row.stock_proyectado < 0 ? "font-semibold text-destructive" : undefined}>
          {units(Number(column.value(row)))}
        </span>
      ) : String(column.value(row) ?? "—"),
    };
  });
  const activeCount = (q ? 1 : 0) + (program !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0);
  const clear = () => { setQ(""); setProgram("all"); setBrand("all"); setType("all"); };

  return (
    <div className={pageShell}>
      <PageHeader title="Stock proyectado" />
      <KpiStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiItem label="Stock" value={units(totals.stock)} tone="positive" icon={<Boxes className="h-4 w-4" />} />
        <KpiItem label="Órdenes de compra" value={units(totals.pedidosCompra)} tone="info" icon={<ShoppingCart className="h-4 w-4" />} />
        <KpiItem label="Ventas pendientes" value={units(totals.ventasPendientes)} tone="warning" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiItem label="Stock proyectado" value={units(totals.stockProyectado)} tone={totals.stockProyectado < 0 ? "danger" : "positive"} icon={<PackageCheck className="h-4 w-4" />} />
      </KpiStrip>

      <div className="space-y-3">
        <FiltersBar
          search={{ value: q, onChange: setQ, placeholder: "Modelo, marca o tipo…", width: "w-[220px]" }}
          activeCount={activeCount}
          onClear={clear}
          secondaryActions={can("datos:exportar") ? <SectionActionsMenu options={table.action ? [table.action] : []} /> : undefined}
          expanded={<FilterSelect label="Programa" value={program} onChange={setProgram} placeholder="Programa" width="w-full" options={[{ value: "all", label: "Todos" }, ...options.programs.map((value) => ({ value, label: value }))]} />}
        >
          <div data-filter-field className="flex w-[155px] min-w-0 flex-col gap-2">
            <span className="block h-4 truncate whitespace-nowrap text-xs text-muted-foreground">Fecha de corte</span>
            <Input aria-label="Fecha de corte" type="date" min={PROJECTED_STOCK_START} max={today()} value={cutoff} onChange={(event) => setCutoff(event.target.value)} className="h-9 text-[13px]" />
          </div>
          <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Marca" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.brands.map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Tipo" value={type} onChange={setType} placeholder="Tipo" width="w-[165px]" options={[{ value: "all", label: "Todos" }, ...options.types.map((value) => ({ value, label: value }))]} />
        </FiltersBar>

        <div className="overflow-hidden rounded-md border bg-card">
          <CompactListTable
            rows={table.ordered}
            columns={viewColumns}
            id={(row) => `${row.programa}:${row.marca}:${row.modelo}`}
            label="Stock proyectado de máquinas nuevas"
            sort={table.sort}
            heading={table.heading}
            status={loading ? "Calculando…" : loadError ? <span className="text-destructive">{loadError}</span> : !filtered.length ? `Sin movimientos al ${shortDate(cutoff)}.` : undefined}
          />
        </div>
      </div>
    </div>
  );
}
