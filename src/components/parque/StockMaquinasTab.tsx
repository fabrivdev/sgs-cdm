import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, PackageOpen } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerHeader,
} from "@/components/ui/responsive-drawer";

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
  estado_disponibilidad: "DISPONIBLE" | "RESERVADO" | "VENDIDO_PENDIENTE_ENTREGA" | "EN_PARQUE" | "CONFLICTO" | "SIN_CHASIS";
  disponibilidad_detalle: string | null;
  repeticiones_chasis: number;
  operacion_id: string | null;
  np_numero: string | null;
  np_fecha: string | null;
  cliente_nombre: string | null;
  comercial: string | null;
  estado_pedido_fuente: string | null;
  importacion_linea_id: string | null;
  estado_importacion_fuente: string | null;
  oc: string | null;
  po: string | null;
  eta: string | null;
  ata: string | null;
  proveedor: string | null;
  situacion_vinculo: string | null;
  parque_maquina_id: string | null;
};

export type StockMaquinasResumen = {
  total: number;
  disponibles: number;
  reservadas: number;
  vendidasPendientes: number;
  conflictos: number;
};

const availabilityLabel: Record<StockMaquina["estado_disponibilidad"], string> = {
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  VENDIDO_PENDIENTE_ENTREGA: "Vendido · pendiente de entrega",
  EN_PARQUE: "En parque",
  CONFLICTO: "Conflicto",
  SIN_CHASIS: "Sin chasis",
};

const availabilityClass: Record<StockMaquina["estado_disponibilidad"], string> = {
  DISPONIBLE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  RESERVADO: "border-blue-200 bg-blue-50 text-blue-700",
  VENDIDO_PENDIENTE_ENTREGA: "border-violet-200 bg-violet-50 text-violet-700",
  EN_PARQUE: "border-slate-200 bg-slate-100 text-slate-700",
  CONFLICTO: "border-red-200 bg-red-50 text-red-700",
  SIN_CHASIS: "border-amber-200 bg-amber-50 text-amber-700",
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
  const [availability, setAvailability] = useState("all");
  const [selected, setSelected] = useState<StockMaquina | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("maquinaria_stock_trazabilidad" as "parque_stock_maquinas")
      .select("*")
      .order("marca")
      .order("modelo");

    if (!error) {
      const stock = (data ?? []) as StockMaquina[];
      setRows(stock);
      onResumenChange?.({
        total: stock.reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        disponibles: stock.filter((row) => row.estado_disponibilidad === "DISPONIBLE").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        reservadas: stock.filter((row) => row.estado_disponibilidad === "RESERVADO").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        vendidasPendientes: stock.filter((row) => row.estado_disponibilidad === "VENDIDO_PENDIENTE_ENTREGA").reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0),
        conflictos: stock.filter((row) => row.estado_disponibilidad === "CONFLICTO").length,
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

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleUpperCase("es");
    return rows.filter((row) => {
      if (branch !== "all" && row.sucursal !== branch) return false;
      if (brand !== "all" && row.marca !== brand) return false;
      if (type !== "all" && row.tipo !== type) return false;
      if (condition !== "all" && row.estado !== condition) return false;
      if (availability !== "all" && row.estado_disponibilidad !== availability) return false;
      if (!term) return true;
      return [row.producto_codigo, row.marca, row.modelo, row.tipo, row.chasis, row.deposito, row.np_numero, row.cliente_nombre]
        .some((value) => (value ?? "").toLocaleUpperCase("es").includes(term));
    });
  }, [rows, q, branch, brand, type, condition, availability]);

  const lastImport = rows.reduce<string | null>((latest, row) => !latest || row.importado_en > latest ? row.importado_en : latest, null);
  const activeCount = (q ? 1 : 0) + (branch !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0) + (condition !== "all" ? 1 : 0) + (availability !== "all" ? 1 : 0);

  const clear = () => { setQ(""); setBranch("all"); setBrand("all"); setType("all"); setCondition("all"); setAvailability("all"); };
  const exportRows = () => {
    const sheet = XLSX.utils.json_to_sheet(filtered.map((row) => ({
      Sucursal: row.sucursal ?? row.filial_original ?? "",
      Depósito: row.deposito ?? "",
      Producto: row.producto_codigo,
      Tipo: row.tipo ?? "",
      Marca: row.marca ?? "",
      Modelo: row.modelo ?? "",
      Estado: row.estado ?? "",
      Disponibilidad: availabilityLabel[row.estado_disponibilidad],
      Pedido: row.np_numero ?? "",
      Cliente: row.cliente_nombre ?? "",
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
        expanded={<div className="grid gap-2 sm:grid-cols-2">
          <FilterSelect label="Condición" value={condition} onChange={setCondition} placeholder="Condición" width="w-full" options={[{ value: "all", label: "Todas" }, { value: "Nuevo", label: "Nuevas" }, { value: "Usado", label: "Usadas" }]} />
          <FilterSelect label="Disponibilidad" value={availability} onChange={setAvailability} placeholder="Disponibilidad" width="w-full" options={[{ value: "all", label: "Todas" }, ...Object.entries(availabilityLabel).map(([value, label]) => ({ value, label }))]} />
        </div>}
      >
        <FilterSelect label="Sucursal" value={branch} onChange={setBranch} placeholder="Sucursal" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.branches.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Marca" value={brand} onChange={setBrand} placeholder="Marca" width="w-[125px]" options={[{ value: "all", label: "Todas" }, ...options.brands.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Tipo" value={type} onChange={setType} placeholder="Tipo" width="w-[150px]" options={[{ value: "all", label: "Todos" }, ...options.types.map((value) => ({ value, label: value }))]} />

      </FiltersBar>

      <div className="hidden max-h-[calc(100vh-300px)] overflow-y-auto rounded-md border bg-card md:block">
        <Table className="table-fixed">
          <TableHeader><TableRow>
            <TableHead className="w-[150px]">Disponibilidad</TableHead><TableHead className="w-[130px]">Ubicación</TableHead><TableHead>Máquina</TableHead><TableHead className="w-[105px]">Condición</TableHead><TableHead className="w-[170px]">Chasis</TableHead><TableHead className="w-[190px]">Reserva / pedido</TableHead><TableHead className="w-[64px]"><span className="sr-only">Detalle</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Cargando stock…</TableCell></TableRow>}
            {!loading && loadError && <TableRow><TableCell colSpan={7} className="h-24 text-center text-[13px] text-destructive">{loadError}</TableCell></TableRow>}
            {!loading && !loadError && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="h-28 text-center"><PackageOpen className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><span className="text-[13px] text-muted-foreground">Sin máquinas en stock.</span></TableCell></TableRow>}
            {!loading && filtered.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                <TableCell><Badge variant="outline" className={cn("whitespace-normal text-[10px]", availabilityClass[row.estado_disponibilidad])}>{availabilityLabel[row.estado_disponibilidad]}</Badge></TableCell>
                <TableCell className="text-[12px]"><div>{row.sucursal ?? row.filial_original ?? "—"}</div><div className="truncate text-[10px] text-muted-foreground" title={row.deposito ?? undefined}>{row.deposito ?? "Sin depósito"}</div></TableCell>
                <TableCell className="min-w-0 text-[12px]"><div className="flex items-center gap-2"><Badge variant="outline" className={cn("shrink-0 text-[9px] font-bold", brandClass(row.marca))}>{row.marca ?? "OTROS"}</Badge><span className="truncate font-medium">{row.modelo ?? row.producto_codigo}</span></div><div className="truncate pt-0.5 font-mono text-[10px] text-muted-foreground">{row.producto_codigo}{row.tipo ? ` · ${row.tipo}` : ""}</div></TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px]", row.estado === "Nuevo" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{row.estado ?? "—"}</Badge></TableCell>
                <TableCell className="truncate font-mono text-[11px]" title={row.chasis ?? undefined}>{row.chasis ?? "—"}</TableCell>
                <TableCell className="text-[11px]">{row.np_numero ? <><div className="font-medium">NP {row.np_numero}</div><div className="truncate text-muted-foreground">{row.cliente_nombre ?? "Sin cliente"}</div></> : <span className="text-muted-foreground">Sin pedido asignado</span>}</TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => { event.stopPropagation(); setSelected(row); }}><Eye className="h-4 w-4" /><span className="sr-only">Ver trazabilidad</span></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {loading && <div className="rounded-md border p-8 text-center text-[12px] text-muted-foreground">Cargando stock…</div>}
        {!loading && loadError && <div className="rounded-md border p-8 text-center text-[12px] text-destructive">{loadError}</div>}
        {!loading && !loadError && filtered.length === 0 && <div className="rounded-md border p-8 text-center text-[12px] text-muted-foreground">Sin máquinas en stock.</div>}
        {!loading && filtered.map((row) => <button key={row.id} type="button" onClick={() => setSelected(row)} className="w-full rounded-xl border bg-card p-3 text-left">
          <div className="flex items-start justify-between gap-2"><Badge variant="outline" className={cn("text-[10px]", availabilityClass[row.estado_disponibilidad])}>{availabilityLabel[row.estado_disponibilidad]}</Badge><Eye className="h-4 w-4 text-muted-foreground" /></div>
          <div className="mt-2 text-[13px] font-semibold">{row.modelo ?? row.producto_codigo}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.chasis ?? "Sin chasis"}</div>
          <div className="mt-2 flex justify-between text-[11px]"><span>{row.sucursal ?? row.filial_original ?? "Sin sucursal"}</span><span>{row.np_numero ? `NP ${row.np_numero}` : "Sin reserva"}</span></div>
        </button>)}
      </div>

      <StockDetail row={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function StockDetail({ row, onOpenChange }: { row: StockMaquina | null; onOpenChange: (open: boolean) => void }) {
  if (!row) return null;
  const sections = [
    { title: "Unidad física", values: [["Producto", row.producto_codigo], ["Modelo", row.modelo], ["Marca", row.marca], ["Tipo", row.tipo], ["Condición", row.estado], ["Chasis", row.chasis], ["Sucursal", row.sucursal ?? row.filial_original], ["Depósito", row.deposito], ["Saldo", Number(row.saldo_actual).toLocaleString("es-PY")]] },
    { title: "Pedido vinculado", values: [["NP", row.np_numero], ["Fecha", formatDate(row.np_fecha)], ["Cliente", row.cliente_nombre], ["Comercial", row.comercial], ["Estado de origen", row.estado_pedido_fuente]] },
    { title: "Importación vinculada", values: [["Estado", row.estado_importacion_fuente], ["Proveedor", row.proveedor], ["OC", row.oc], ["PO", row.po], ["ETA", formatDate(row.eta)], ["ATA", formatDate(row.ata)], ["Vínculo", row.situacion_vinculo]] },
  ].map((section) => ({ ...section, values: section.values.filter(([, value]) => value !== null && value !== undefined && value !== "") })).filter((section) => section.values.length);
  return <ResponsiveDrawer open onOpenChange={onOpenChange} size="lg">
    <ResponsiveDrawerHeader><div className="flex items-start justify-between gap-3"><div><h2 className="text-[16px] font-semibold">{row.modelo ?? row.producto_codigo}</h2><p className="font-mono text-[11px] text-muted-foreground">{row.chasis ?? "Sin chasis informado"}</p></div><Badge variant="outline" className={cn("text-[10px]", availabilityClass[row.estado_disponibilidad])}>{availabilityLabel[row.estado_disponibilidad]}</Badge></div></ResponsiveDrawerHeader>
    <ResponsiveDrawerBody className="space-y-4">
      {row.disponibilidad_detalle && <div className="rounded-lg bg-muted/50 p-3 text-[12px]">{row.disponibilidad_detalle}</div>}
      {row.repeticiones_chasis > 1 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">El chasis aparece {row.repeticiones_chasis} veces en stock. Revisá el archivo de origen.</div>}
      {sections.map((section) => <section key={section.title}><h3 className="mb-2 text-[12px] font-semibold">{section.title}</h3><dl className="grid gap-x-4 gap-y-2 rounded-lg border p-3 sm:grid-cols-2">{section.values.map(([label, value]) => <div key={label}><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="break-words text-[12px] font-medium">{value}</dd></div>)}</dl></section>)}
      {row.parque_maquina_id && <div className="rounded-lg border bg-slate-50 p-3 text-[12px] text-slate-700">Esta unidad ya forma parte del parque de un cliente.</div>}
    </ResponsiveDrawerBody>
  </ResponsiveDrawer>;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-PY");
}
