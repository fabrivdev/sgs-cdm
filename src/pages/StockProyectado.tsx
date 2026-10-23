import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ClipboardList, PackageCheck, ShoppingCart } from "lucide-react";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { FilterDate, FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pageShell } from "@/lib/ui-classes";
import { MarcaBadge } from "@/components/StatusBadges";
import { MobileRecord } from "@/components/lists/MobileRecord";
import {
  PROJECTED_STOCK_START,
  parseProjectedMachineStock,
  projectedStockTotals,
  projectedStockYtdTotal,
  type ProjectedMachineStockRow,
} from "@/lib/projectedMachineStock";

import { loadProjectedStockYtd } from "@/lib/projectedStockYtd";

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const units = (value: number) => value.toLocaleString("es-PY", { maximumFractionDigits: 2 });
const brandTextContrast = (brand: string) => brand === "HORSCH" ? "text-[hsl(18_85%_32%)]" : brand === "CLAAS" ? "text-[hsl(75_46%_28%)]" : "";
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-PY");

export default function StockProyectado() {
  const { can, user, loading: authLoading, hasSectionAccess } = useAuth();
  const [cutoff, setCutoff] = useState(today);
  const stockAllowed = !authLoading && !!user && hasSectionAccess("parque.stock_proyectado");
  const salesAllowed = stockAllowed && hasSectionAccess("parque.ventas");
  const stockKey = JSON.stringify([user?.id, cutoff, stockAllowed]);
  const ytdKey = JSON.stringify([stockKey, salesAllowed]);
  const [stock, setStock] = useState<{ key: string; rows: ProjectedMachineStockRow[]; error: string | null } | null>(null);
  const [ytd, setYtd] = useState<{ key: string; rows: ProjectedMachineStockRow[]; error: string | null } | null>(null);
  const currentStock = stockAllowed && stock?.key === stockKey ? stock : null;
  const currentYtd = salesAllowed && ytd?.key === ytdKey ? ytd : null;
  const loading = authLoading || (stockAllowed && !currentStock);
  const loadError = currentStock?.error ?? (!authLoading && !stockAllowed ? "No tenés acceso a Stock proyectado." : null);
  const rows = useMemo(() => currentStock && !currentStock.error ? currentYtd?.rows ?? currentStock.rows : [], [currentStock, currentYtd]);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState("all");
  const [model, setModel] = useState("all");
  const [projectedState, setProjectedState] = useState("all");
  const [purchaseOrders, setPurchaseOrders] = useState("all");
  const [pendingSales, setPendingSales] = useState("all");

  useEffect(() => {
    let active = true;
    setStock(null);
    if (!stockAllowed) return;
    void (async () => {
      try {
        const { data, error } = await (supabase as unknown as RpcClient).rpc("parque_stock_proyectado_v1", { p_corte: cutoff });
        if (error) throw new Error(error.message?.includes("schema cache") || error.message?.includes("function")
          ? "Falta aplicar la migración de Stock proyectado."
          : error.message || "No se pudo calcular el stock proyectado.");
        const base = parseProjectedMachineStock(data).filas.map(row => ({ ...row, vendidas_ytd: null }));
        if (active) setStock({ key: stockKey, rows: base, error: null });
      } catch (cause) {
        if (active) setStock({ key: stockKey, rows: [], error: cause instanceof Error ? cause.message : "No se pudo calcular el stock proyectado." });
      }
    })();
    return () => { active = false; };
  }, [cutoff, stockAllowed, stockKey]);

  useEffect(() => {
    let active = true;
    setYtd(null);
    if (!salesAllowed || !currentStock || currentStock.error) return;
    void loadProjectedStockYtd(currentStock.rows, cutoff).then(
      enriched => { if (active) setYtd({ key: ytdKey, rows: enriched, error: null }); },
      cause => { if (active) setYtd({ key: ytdKey, rows: currentStock.rows, error: cause instanceof Error ? cause.message : "No se pudieron consultar las ventas YTD." }); },
    );
    return () => { active = false; };
  }, [currentStock, cutoff, salesAllowed, ytdKey]);

  const options = useMemo(() => ({
    brands: [...new Set(rows.map((row) => row.marca))].sort(),
    types: [...new Set(rows.map((row) => row.tipo))].sort(),
    models: [...new Set(rows.map((row) => row.modelo))].sort(),
  }), [rows]);

  useEffect(() => {
    if (!currentStock || currentStock.error) return;
    if (brand !== "all" && !options.brands.includes(brand)) setBrand("all");
    if (type !== "all" && !options.types.includes(type)) setType("all");
    if (model !== "all" && !options.models.includes(model)) setModel("all");
  }, [brand, type, model, options, currentStock]);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleUpperCase("es");
    return rows.filter((row) => {
      if (brand !== "all" && row.marca !== brand) return false;
      if (type !== "all" && row.tipo !== type) return false;
      if (model !== "all" && row.modelo !== model) return false;
      if (projectedState === "negative" && row.stock_proyectado >= 0) return false;
      if (projectedState === "zero" && row.stock_proyectado !== 0) return false;
      if (projectedState === "positive" && row.stock_proyectado <= 0) return false;
      if (purchaseOrders === "with" && row.pedidos_compra <= 0) return false;
      if (purchaseOrders === "without" && row.pedidos_compra !== 0) return false;
      if (pendingSales === "with" && row.ventas_pendientes <= 0) return false;
      if (pendingSales === "without" && row.ventas_pendientes !== 0) return false;
      return !term || [row.marca, row.tipo, row.modelo]
        .some((value) => value.toLocaleUpperCase("es").includes(term));
    });
  }, [brand, model, pendingSales, projectedState, purchaseOrders, q, rows, type]);

  const totals = useMemo(() => projectedStockTotals(filtered), [filtered]);
  const ytdTotal = projectedStockYtdTotal(filtered, !!currentYtd && !currentYtd.error);
  const exportScope = useRef({ filtered, allowed: false });
  exportScope.current = { filtered, allowed: !loading && !loadError && can("datos:exportar") };
  const columns: SalesColumn<ProjectedMachineStockRow>[] = [
    { key: "marca", label: "Marca", kind: "text", value: (row) => row.marca },
    { key: "tipo", label: "Tipo", kind: "text", value: (row) => row.tipo },
    { key: "modelo", label: "Modelo", kind: "text", value: (row) => row.modelo },
    { key: "vendidas_ytd", label: "Vendidas YTD", kind: "number", align: "center", value: (row) => row.vendidas_ytd, exportValue: (row) => row.vendidas_ytd ?? "No disponible" },
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
    exportGuard: () => exportScope.current.allowed && exportScope.current.filtered === filtered,
  });
  const viewColumns: CompactListColumn<ProjectedMachineStockRow>[] = columns.map((column) => {
    const layout: Record<string, Pick<CompactListColumn<ProjectedMachineStockRow>, "width" | "hiddenBelow">> = {
      marca: { width: "md:w-[13%] lg:w-[11%]", hiddenBelow: "md" },
      tipo: { width: "md:w-[19%] lg:w-[17%]", hiddenBelow: "md" },
      modelo: { width: "w-[52%] md:w-[29%] lg:w-[29%]" },
      vendidas_ytd: { width: "md:w-[11%]" },
      stock: { width: "w-[20%] md:w-[9%] lg:w-[8%]" },
      pedidos_compra: { width: "md:w-[8%]", hiddenBelow: "md" },
      disponibilidad: { width: "lg:w-[9%]", hiddenBelow: "lg" },
      ventas_pendientes: { width: "md:w-[11%] lg:w-[10%]", hiddenBelow: "md" },
      stock_proyectado: { width: "w-[28%] md:w-[11%] lg:w-[8%]" },
    };
    return {
      ...column,
      ...layout[column.key],
      render: (row) => column.key === "marca" ? <MarcaBadge marca={row.marca} className={brandTextContrast(row.marca)} /> : column.key === "modelo" ? (
        <CompactListInfo label={row.modelo} fields={[
          ["Marca", row.marca], ["Tipo", row.tipo],
          ...(row.identidad_estado === "sin_coincidencia_o_ambiguo" ? [["Identidad", "Pendiente de conciliación con catálogo"] as const] : []),
          ["Arribos", units(row.arribos_periodo)], ["Facturas/NC", units(row.ventas_netas_periodo)],
        ]} />
      ) : column.kind === "number" ? (
        <span title={column.key === "vendidas_ytd" ? currentYtd?.error ?? (!salesAllowed ? "Ventas YTD no disponibles para este acceso." : undefined) : undefined} className={column.key === "stock_proyectado" && row.stock_proyectado < 0 ? "font-semibold text-destructive" : undefined}>
          {column.value(row) == null ? "—" : units(Number(column.value(row)))}
        </span>
      ) : String(column.value(row) ?? "—"),
    };
  });
  const activeCount = (q ? 1 : 0) + (brand !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0)
    + (model !== "all" ? 1 : 0) + (projectedState !== "all" ? 1 : 0)
    + (purchaseOrders !== "all" ? 1 : 0) + (pendingSales !== "all" ? 1 : 0);
  const clear = () => {
    setQ(""); setBrand("all"); setType("all"); setModel("all");
    setProjectedState("all"); setPurchaseOrders("all"); setPendingSales("all");
  };

  return (
    <div className={pageShell}>
      <PageHeader title="Stock proyectado" meta={<span className="sm:hidden">Corte: {shortDate(cutoff)} · Máquinas nuevas</span>} />
      <KpiStrip mobilePrimary={[0, 4]} className="sm:grid-cols-2 xl:grid-cols-5">
        <KpiItem label="Vendidas YTD" value={ytdTotal == null ? "-" : units(ytdTotal)} tone="info" icon={<PackageCheck className="h-4 w-4" />} />
        <KpiItem label="Stock" value={loading || loadError ? "—" : units(totals.stock)} tone="positive" icon={<Boxes className="h-4 w-4" />} />
        <KpiItem label="Órdenes de compra" value={loading || loadError ? "—" : units(totals.pedidosCompra)} tone="info" icon={<ShoppingCart className="h-4 w-4" />} />
        <KpiItem label="Ventas pendientes" value={loading || loadError ? "—" : units(totals.ventasPendientes)} tone="warning" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiItem label="Stock proyectado" value={loading || loadError ? "—" : units(totals.stockProyectado)} tone={totals.stockProyectado < 0 ? "danger" : "positive"} icon={<PackageCheck className="h-4 w-4" />} />
      </KpiStrip>

      <div className="space-y-3">
        <FiltersBar
          search={{ value: q, onChange: setQ, placeholder: "Modelo, marca o tipo…" }}
          activeCount={activeCount}
          onClear={clear}
          secondaryActions={can("datos:exportar") ? <SectionActionsMenu options={table.action ? [table.action] : []} /> : undefined}
          expanded={<>
            <FilterSelect label="Modelo" value={model} onChange={setModel} placeholder="Modelo" width="w-full" options={[{ value: "all", label: "Todos" }, ...options.models.map((value) => ({ value, label: value }))]} />
            <FilterSelect label="Stock proyectado" value={projectedState} onChange={setProjectedState} placeholder="Todos" width="w-full" options={[
              { value: "all", label: "Todos" }, { value: "negative", label: "Negativo" },
              { value: "zero", label: "En cero" }, { value: "positive", label: "Positivo" },
            ]} />
            <FilterSelect label="Órdenes de compra" value={purchaseOrders} onChange={setPurchaseOrders} placeholder="Todas" width="w-full" options={[
              { value: "all", label: "Todas" }, { value: "with", label: "Con OC" }, { value: "without", label: "Sin OC" },
            ]} />
            <FilterSelect label="Ventas pendientes" value={pendingSales} onChange={setPendingSales} placeholder="Todas" width="w-full" options={[
              { value: "all", label: "Todas" }, { value: "with", label: "Con pendientes" }, { value: "without", label: "Sin pendientes" },
            ]} />
          </>}
        >
          <FilterDate label="Fecha de corte" min={PROJECTED_STOCK_START} max={today()} value={cutoff} onChange={setCutoff} />
          <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Marca" options={[{ value: "all", label: "Todas" }, ...options.brands.map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Tipo" value={type} onChange={setType} placeholder="Tipo" options={[{ value: "all", label: "Todos" }, ...options.types.map((value) => ({ value, label: value }))]} />
        </FiltersBar>

        <div className="overflow-hidden rounded-md border bg-card">
          <CompactListTable
            rows={table.ordered}
            columns={viewColumns}
            mobileColumns={[
              { ...viewColumns.find(c => c.key === "modelo")!, width: "w-[44%]", render: row => <CompactListInfo label={row.modelo}
                summary={<MobileRecord primary={row.modelo} secondary={<MarcaBadge marca={row.marca} className={`text-[10px] ${brandTextContrast(row.marca)}`} />} />}
                fields={[["Marca", row.marca], ["Tipo", row.tipo], ["Vendidas YTD", row.vendidas_ytd == null ? "No disponible" : units(row.vendidas_ytd)], ["Stock", units(row.stock)], ["OC", units(row.pedidos_compra)], ["Disponible", units(row.disponibilidad)], ["Ventas pendientes", units(row.ventas_pendientes)], ["Proyectado", units(row.stock_proyectado)], ["Arribos", units(row.arribos_periodo)], ["Facturas/NC", units(row.ventas_netas_periodo)]]} /> },
              { ...viewColumns.find(c => c.key === "vendidas_ytd")!, width: "w-[20%]", align: "right" },
              { ...viewColumns.find(c => c.key === "stock")!, width: "w-[18%]", align: "right" },
              { ...viewColumns.find(c => c.key === "stock_proyectado")!, label: "Proy.", width: "w-[18%]", align: "right" },
            ]}
            id={(row) => row.clave_fila ?? row.modelo_catalogo_id ?? `${row.programa}:${row.marca}:${row.tipo}:${row.modelo}`}
            label="Stock proyectado de máquinas nuevas"
            sort={table.sort}
            onSort={table.toggleSort}
            heading={table.heading}
            status={loading ? "Calculando…" : loadError ? <span className="text-destructive">{loadError}</span> : !filtered.length ? `Sin movimientos al ${shortDate(cutoff)}.` : undefined}
          />
        </div>
      </div>
    </div>
  );
}
