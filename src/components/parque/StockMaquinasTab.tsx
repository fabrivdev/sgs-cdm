import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { cargarTodo } from "@/hooks/useCatalogos";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MarcaBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

type StockMaquina = {
  carga_id: string;
  id: string;
  producto_codigo: string;
  sucursal: string | null;
  filial_original: string | null;
  deposito: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  estado: string | null;
  chasis: string | null;
  saldo_actual: number;
  importado_en: string;
  datos_fuente: Json;
};

function pendingParkTransfer(row: StockMaquina) {
  return !!row.datos_fuente
    && !Array.isArray(row.datos_fuente)
    && typeof row.datos_fuente === "object"
    && row.datos_fuente.pendiente_transferencia_parque === true;
}

export type StockMaquinasResumen = {
  total: number;
  nuevas: number;
  usadas: number;
  marcas: number;
};

export function StockMaquinasTab({ onResumenChange }: { onResumenChange?: (value: StockMaquinasResumen) => void }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<StockMaquina[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState("all");
  const [condition, setCondition] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const stock = await cargarTodo<StockMaquina>(supabase.from("parque_stock_maquinas").select("*").order("id"));
      setRows(stock);
      onResumenChange?.({
        total: stock.reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        nuevas: stock.filter((row) => row.estado === "Nuevo").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        usadas: stock.filter((row) => row.estado === "Usado").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        marcas: new Set(stock.map((row) => row.marca).filter(Boolean)).size,
      });
    } catch (error) {
      console.error(error);
      setLoadError("No se pudo cargar el stock. Verificá que el SQL de instalación esté aplicado.");
    }
    setLoading(false);
  }, [onResumenChange]);

  useEffect(() => { void load(); }, [load]);

  const options = useMemo(() => ({
    branches: [...new Set(rows.map((row) => row.sucursal).filter((value): value is string => !!value))].sort(),
    brands: [...new Set(rows.map((row) => row.marca).filter((value): value is string => !!value))].sort(),
    types: [...new Set(rows.map((row) => row.tipo).filter((value): value is string => !!value))].sort(),
  }), [rows]);

  const duplicateChassis = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const chassis = row.chasis?.trim().toUpperCase();
      if (chassis) counts.set(chassis, (counts.get(chassis) ?? 0) + 1);
    });
    return new Set([...counts].filter(([, count]) => count > 1).map(([chassis]) => chassis));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleUpperCase("es");
    return rows.filter((row) => {
      if (branch !== "all" && row.sucursal !== branch) return false;
      if (brand !== "all" && row.marca !== brand) return false;
      if (type !== "all" && row.tipo !== type) return false;
      if (condition !== "all" && row.estado !== condition) return false;
      if (!term) return true;
      return [row.producto_codigo, row.marca, row.modelo, row.tipo, row.chasis, row.deposito]
        .some((value) => (value ?? "").toLocaleUpperCase("es").includes(term));
    });
  }, [rows, q, branch, brand, type, condition]);

  const columns: SalesColumn<StockMaquina>[] = [
    { key: "sucursal", label: "Sucursal", kind: "text", value: r => r.sucursal ?? r.filial_original },
    ...(["deposito", "producto_codigo", "tipo", "marca", "modelo", "estado", "chasis"] as const).map((key, i) => ({ key, label: ["Depósito", "Producto", "Tipo", "Marca", "Modelo", "Condición", "Chasis"][i], kind: "text" as const, value: (r: StockMaquina) => r[key] })),
    { key: "saldo", label: "Saldo", kind: "number", align: "center", value: r => Number(r.saldo_actual) },
  ];
  const list = useSectionTable({ rows: filtered, columns, title: "Stock de máquinas", fileName: "stock-maquinas.xlsx", initialSort: { key: "marca", direction: "asc" }, disabled: loading || !!loadError });
  const lastImport = rows.reduce<string | null>((latest, row) => !latest || row.importado_en > latest ? row.importado_en : latest, null);
  const activeCount = (q ? 1 : 0) + (branch !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0) + (condition !== "all" ? 1 : 0);

  const viewColumns: CompactListColumn<StockMaquina>[] = columns.map(column => {
    const layout: Record<string, Pick<CompactListColumn<StockMaquina>, "width" | "hiddenBelow">> = {
      sucursal: {width:"md:w-[12%] lg:w-[11%]",hiddenBelow:"md"},
      deposito: {width:"lg:w-[10%]",hiddenBelow:"lg"},
      producto_codigo: {width:"md:w-[14%] lg:w-[12%]",hiddenBelow:"md"},
      tipo: {width:"lg:w-[11%]",hiddenBelow:"lg"},
      marca: {width:"md:w-[10%] lg:w-[8%]",hiddenBelow:"md"},
      modelo: {width:"w-[43%] md:w-[25%] lg:w-[18%]"},
      estado: {width:"md:w-[12%] lg:w-[8%]",hiddenBelow:"md"},
      chasis: {width:"w-[40%] md:w-[19%] lg:w-[16%]"},
      saldo: {width:"w-[17%] md:w-[8%] lg:w-[6%]"},
    };
    return {...column,...layout[column.key], className:["producto_codigo","chasis"].includes(column.key)?"font-mono":undefined,
      render:row=>{
        const repeated = !!row.chasis && duplicateChassis.has(row.chasis.trim().toUpperCase());
        const pendingTransfer = pendingParkTransfer(row);
        if(column.key==="marca")return <MarcaBadge marca={row.marca} className="max-w-full whitespace-nowrap text-[10px]" />;
        if(column.key==="modelo")return <CompactListInfo label={row.modelo??"—"} fields={columns.map(c=>[c.label,String(c.value(row)??"—")] as const).concat([["Chasis repetido",repeated?"Sí":"No"],["Ingreso desde Parque",pendingTransfer?"Pendiente de autorizar":"No"]])} />;
        if(column.key==="estado")return <Badge variant="outline" className={cn("max-w-full whitespace-nowrap text-[10px]", row.estado==="Nuevo"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-amber-200 bg-amber-50 text-amber-700")}>{row.estado??"—"}</Badge>;
        if(column.key==="chasis")return <span className="flex min-w-0 items-center gap-1"><span className="truncate">{row.chasis??"—"}</span>{(repeated||pendingTransfer)&&<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" role="img" aria-label={pendingTransfer?"Ingreso desde Parque pendiente de autorizar":"Chasis repetido"} />}</span>;
        if(column.key==="saldo")return Number(row.saldo_actual).toLocaleString("es-PY");
        return String(column.value(row)??"—");
      },title:row=>column.key==="chasis"&&pendingParkTransfer(row)?`${row.chasis} · Ingreso desde Parque pendiente de autorizar`:column.key==="chasis"&&row.chasis&&duplicateChassis.has(row.chasis.trim().toUpperCase())?`${row.chasis} · Este chasis aparece en más de una referencia del archivo`:String(column.value(row)??"—")};
  });

  const clear = () => { setQ(""); setBranch("all"); setBrand("all"); setType("all"); setCondition("all"); };

  return (
    <div className="space-y-3">
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Código, modelo o chasis…", label: "Buscar", width: "w-[210px]" }}
        activeCount={activeCount}
        onClear={clear}
        meta={`${filtered.length} referencia${filtered.length === 1 ? "" : "s"}${lastImport ? ` · Actualizado ${new Date(lastImport).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}` : ""}`}
        secondaryActions={can("datos:exportar") ? <SectionActionsMenu options={list.action ? [list.action] : []} /> : undefined}
        expanded={
          <FilterSelect label="Condición" value={condition} onChange={setCondition} placeholder="Condición" width="w-full" options={[{ value: "all", label: "Todas" }, { value: "Nuevo", label: "Nuevas" }, { value: "Usado", label: "Usadas" }]} />
        }
      >
        <FilterSelect label="Sucursal" value={branch} onChange={setBranch} placeholder="Sucursal" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.branches.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Marca" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.brands.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Tipo" value={type} onChange={setType} placeholder="Tipo" width="w-[150px]" options={[{ value: "all", label: "Todos" }, ...options.types.map((value) => ({ value, label: value }))]} />

      </FiltersBar>

      <div className="overflow-hidden rounded-md border bg-card">
        <CompactListTable rows={list.ordered} columns={viewColumns} id={row=>row.id} label="Stock de máquinas" sort={list.sort} heading={list.heading}
          status={loading?"Cargando stock…":loadError?<span className="text-destructive">{loadError}</span>:!filtered.length?<><PackageOpen className="mx-auto mb-2 h-6 w-6" />Sin máquinas en stock.</>:undefined} />
      </div>
    </div>
  );
}
