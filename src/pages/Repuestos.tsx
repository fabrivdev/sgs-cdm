import { useEffect, useState } from "react";
import { History, PackageSearch, Search, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarcaBadge } from "@/components/StatusBadges";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { metaText, pageDescription, pageShell, pageTitle } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import type { Marca } from "@/lib/constants";

interface ProductoRow {
  codigo_interno: string;
  codigo_fabricante: string | null;
  descripcion: string;
  unidad: string | null;
  grupo: string | null;
  familia: string | null;
  marca: Marca;
  activo: boolean;
}

interface StockRow {
  id: string;
  sucursal: string | null;
  deposito: string | null;
  saldo_actual: number;
}

interface VentaPorPeriodo {
  mes: string;
  cantidad: number;
  total: number;
}

const MIN_SEARCH_LENGTH = 2;
const MAX_RESULTS = 30;

const formatMes = (mes: string) => {
  const [anio, mesNum] = mes.split("-");
  const nombre = new Date(Number(anio), Number(mesNum) - 1, 1).toLocaleDateString("es-PY", {
    month: "short",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

export default function Repuestos() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [resultados, setResultados] = useState<ProductoRow[] | null>(null);
  const [stockPorCodigo, setStockPorCodigo] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [seleccionado, setSeleccionado] = useState<ProductoRow | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [ventas, setVentas] = useState<VentaPorPeriodo[] | null>(null);
  const [ventasLoading, setVentasLoading] = useState(false);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      setResultados(null);
      setStockPorCodigo({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    (supabase.from("productos" as any) as any)
      .select("codigo_interno, codigo_fabricante, descripcion, unidad, grupo, familia, marca, activo")
      // Este catálogo es de Repuestos: el maestro de TOTVS trae también activos
      // fijos, mercadería y otros rubros con otros prefijos de código — se
      // dejan afuera acá, no son repuestos.
      .ilike("codigo_interno", "REP%")
      .or(`codigo_interno.ilike.%${term}%,descripcion.ilike.%${term}%,codigo_fabricante.ilike.%${term}%`)
      .order("descripcion")
      .limit(MAX_RESULTS)
      .then(({ data, error }: any) => {
        if (cancelled) return;
        const rows = error ? [] : ((data ?? []) as ProductoRow[]);
        setResultados(rows);
        setLoading(false);

        if (rows.length === 0) {
          setStockPorCodigo({});
          return;
        }

        // Stock total por producto, para verlo de un vistazo sin tener que abrir cada uno.
        (supabase.from("repuestos_stock" as any) as any)
          .select("producto_codigo, saldo_actual")
          .in("producto_codigo", rows.map((r) => r.codigo_interno))
          .then(({ data: stockData, error: stockError }: any) => {
            if (cancelled || stockError) return;
            const totals: Record<string, number> = {};
            for (const row of (stockData ?? []) as { producto_codigo: string; saldo_actual: number }[]) {
              totals[row.producto_codigo] = (totals[row.producto_codigo] ?? 0) + Number(row.saldo_actual || 0);
            }
            setStockPorCodigo(totals);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!seleccionado) {
      setStock(null);
      setVentas(null);
      return;
    }

    let cancelled = false;
    setStockLoading(true);

    (supabase.from("repuestos_stock" as any) as any)
      .select("id, sucursal, deposito, saldo_actual")
      .eq("producto_codigo", seleccionado.codigo_interno)
      .order("sucursal")
      .then(({ data, error }: any) => {
        if (cancelled) return;
        setStock(error ? [] : ((data ?? []) as StockRow[]));
        setStockLoading(false);
      });

    setVentasLoading(true);
    (supabase.from("facturacion_lineas_importadas" as any) as any)
      .select("fecha_factura, cantidad, total_venta")
      .eq("cod_mercaderia", seleccionado.codigo_interno)
      .eq("grupo_normalizado", "Repuestos")
      .order("fecha_factura", { ascending: true })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error || !data) {
          setVentas([]);
          setVentasLoading(false);
          return;
        }

        const porMes = new Map<string, { cantidad: number; total: number }>();
        for (const row of data as { fecha_factura: string | null; cantidad: number | null; total_venta: number | null }[]) {
          if (!row.fecha_factura) continue;
          const mes = row.fecha_factura.slice(0, 7);
          const actual = porMes.get(mes) ?? { cantidad: 0, total: 0 };
          actual.cantidad += Number(row.cantidad || 0);
          actual.total += Number(row.total_venta || 0);
          porMes.set(mes, actual);
        }

        const filas = Array.from(porMes.entries())
          .map(([mes, v]) => ({ mes, ...v }))
          .sort((a, b) => a.mes.localeCompare(b.mes));
        setVentas(filas);
        setVentasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seleccionado]);

  const totalStock = (stock ?? []).reduce((sum, row) => sum + Number(row.saldo_actual || 0), 0);

  return (
    <div className={pageShell}>
      <div>
        <h1 className={pageTitle}>Catálogo y Stock</h1>
        <p className={pageDescription}>Catálogo de repuestos y stock por sucursal, importados desde TOTVS.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSeleccionado(null);
              }}
              placeholder="Buscar por código o descripción…"
              className="pl-8"
            />
          </div>

          {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH && (
            <p className={metaText}>Escribí al menos {MIN_SEARCH_LENGTH} caracteres.</p>
          )}

          {loading && <p className={metaText}>Buscando…</p>}

          {!loading && resultados && resultados.length === 0 && (
            <p className={metaText}>Sin resultados para "{debouncedSearch}".</p>
          )}

          {!loading && resultados && resultados.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="hidden sm:table-cell">Familia</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((producto) => {
                    const stockTotal = stockPorCodigo[producto.codigo_interno] ?? 0;
                    return (
                      <TableRow
                        key={producto.codigo_interno}
                        className={cn(
                          "cursor-pointer",
                          seleccionado?.codigo_interno === producto.codigo_interno && "bg-muted/60",
                        )}
                        onClick={() => setSeleccionado(producto)}
                      >
                        <TableCell className="font-mono text-xs">{producto.codigo_interno}</TableCell>
                        <TableCell className="max-w-[280px] truncate">{producto.descripcion}</TableCell>
                        <TableCell>
                          <MarcaBadge marca={producto.marca} />
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                          {producto.familia ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            stockTotal === 0 && "text-destructive",
                          )}
                        >
                          {stockTotal}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {resultados === null && search.trim().length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <PackageSearch className="h-8 w-8" />
              <p className="text-sm">Buscá un producto para ver su stock y su historial de ventas.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {seleccionado && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{seleccionado.descripcion}</div>
                <div className={metaText}>
                  {seleccionado.codigo_interno}
                  {seleccionado.codigo_fabricante ? ` · Fabricante: ${seleccionado.codigo_fabricante}` : ""}
                </div>
              </div>
              <MarcaBadge marca={seleccionado.marca} />
            </div>

            <div className="flex items-center gap-2 text-sm font-medium">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              Stock total: {totalStock.toLocaleString("es-PY")} {seleccionado.unidad ?? ""}
            </div>

            {stockLoading && <p className={metaText}>Cargando stock…</p>}

            {!stockLoading && stock && stock.length === 0 && (
              <p className={metaText}>Sin stock registrado para este producto en ninguna sucursal.</p>
            )}

            {!stockLoading && stock && stock.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sucursal</TableHead>
                      <TableHead className="hidden sm:table-cell">Depósito</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.sucursal ?? "Sin sucursal"}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                          {row.deposito ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">{row.saldo_actual}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-muted-foreground" />
                Historial de ventas por período
              </div>

              {ventasLoading && <p className={metaText}>Cargando historial…</p>}

              {!ventasLoading && ventas && ventas.length === 0 && (
                <p className={metaText}>
                  Sin historial de ventas registrado todavía para este producto. Se va a ir completando con cada
                  importación de facturación de Servicios.
                </p>
              )}

              {!ventasLoading && ventas && ventas.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Cantidad vendida</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.map((fila) => (
                        <TableRow key={fila.mes}>
                          <TableCell>{formatMes(fila.mes)}</TableCell>
                          <TableCell className="text-right">{fila.cantidad}</TableCell>
                          <TableCell className="text-right font-medium">
                            {fila.total.toLocaleString("es-PY", { maximumFractionDigits: 0 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
