import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, PackageOpen } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";

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
};

export type StockMaquinasResumen = {
  total: number;
  nuevas: number;
  usadas: number;
  marcas: number;
};

const brandClass = (brand: string | null) => {
  const normalized = (brand ?? "").toUpperCase();
  if (normalized === "CLAAS") return "border-marca-claas/30 bg-marca-claas-bg text-marca-claas";
  if (normalized === "HORSCH") return "border-marca-horsch/30 bg-marca-horsch-bg text-marca-horsch";
  return "border-border bg-muted text-muted-foreground";
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
    const { data, error } = await supabase
      .from("parque_stock_maquinas")
      .select("*")
      .order("marca")
      .order("modelo");

    if (!error) {
      const stock = (data ?? []) as StockMaquina[];
      setRows(stock);
      onResumenChange?.({
        total: stock.reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        nuevas: stock.filter((row) => row.estado === "Nuevo").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        usadas: stock.filter((row) => row.estado === "Usado").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        marcas: new Set(stock.map((row) => row.marca).filter(Boolean)).size,
      });
    } else {
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

  const lastImport = rows.reduce<string | null>((latest, row) => !latest || row.importado_en > latest ? row.importado_en : latest, null);
  const activeCount = (q ? 1 : 0) + (branch !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0) + (condition !== "all" ? 1 : 0);

  const clear = () => { setQ(""); setBranch("all"); setBrand("all"); setType("all"); setCondition("all"); };
  const exportRows = () => {
    const sheet = XLSX.utils.json_to_sheet(filtered.map((row) => ({
      Sucursal: row.sucursal ?? row.filial_original ?? "",
      Depósito: row.deposito ?? "",
      Producto: row.producto_codigo,
      Tipo: row.tipo ?? "",
      Marca: row.marca ?? "",
      Modelo: row.modelo ?? "",
      Estado: row.estado ?? "",
      Chasis: row.chasis ?? "",
      Saldo: row.saldo_actual,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Stock de máquinas");
    XLSX.writeFile(workbook, `stock-maquinas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Código, modelo o chasis…", label: "Buscar", width: "w-[210px]" }}
        activeCount={activeCount}
        onClear={clear}
        meta={`${filtered.length} referencia${filtered.length === 1 ? "" : "s"}${lastImport ? ` · Actualizado ${new Date(lastImport).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}` : ""}`}
        actions={can("datos:exportar") ? (
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={exportRows} title="Exportar stock a Excel">
            <Download className="h-4 w-4" /><span className="sr-only">Exportar stock</span>
          </Button>
        ) : undefined}
        expanded={
          <FilterSelect label="Condición" value={condition} onChange={setCondition} placeholder="Condición" width="w-full" options={[{ value: "all", label: "Todas" }, { value: "Nuevo", label: "Nuevas" }, { value: "Usado", label: "Usadas" }]} />
        }
      >
        <FilterSelect label="Sucursal" value={branch} onChange={setBranch} placeholder="Sucursal" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.branches.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Marca" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.brands.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Tipo" value={type} onChange={setType} placeholder="Tipo" width="w-[150px]" options={[{ value: "all", label: "Todos" }, ...options.types.map((value) => ({ value, label: value }))]} />

      </FiltersBar>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Sucursal</TableHead><TableHead>Depósito</TableHead><TableHead>Producto</TableHead><TableHead>Tipo</TableHead><TableHead>Marca</TableHead><TableHead>Modelo</TableHead><TableHead>Condición</TableHead><TableHead>Chasis</TableHead><TableHead className="text-right">Saldo</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Cargando stock…</TableCell></TableRow>}
            {!loading && loadError && <TableRow><TableCell colSpan={9} className="h-24 text-center text-sm text-destructive">{loadError}</TableCell></TableRow>}
            {!loading && !loadError && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="h-28 text-center"><PackageOpen className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Sin máquinas en stock.</span></TableCell></TableRow>}
            {!loading && filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs">{row.sucursal ?? row.filial_original ?? "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate text-xs" title={row.deposito ?? undefined}>{row.deposito ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{row.producto_codigo}</TableCell>
                <TableCell className="text-xs">{row.tipo ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px] font-bold tracking-wide", brandClass(row.marca))}>{row.marca ?? "OTROS"}</Badge></TableCell>
                <TableCell className="min-w-[180px] text-xs font-medium">{row.modelo ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px]", row.estado === "Nuevo" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{row.estado ?? "—"}</Badge></TableCell>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <span>{row.chasis ?? "—"}</span>
                    {row.chasis && duplicateChassis.has(row.chasis.trim().toUpperCase()) && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 text-[9px] text-amber-700" title="Este chasis aparece en más de una referencia del archivo">
                        Repetido
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{Number(row.saldo_actual).toLocaleString("es-PY")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
