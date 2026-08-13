import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "@/hooks/useCatalogos";
import type { Marca } from "@/lib/constants";

const STALE_TIME = 5 * 60 * 1000;
export const STOCK_PAGE_SIZE = 50;

const STOCK_MATRIZ_COLUMNS =
  "codigo_interno, descripcion, codigo_fabricante, marca, familia, unidad, santa_rita, santa_rosa, campo_9, misiones, loma_plata, katuete, total";

export interface StockMatrizRow {
  codigo_interno: string;
  descripcion: string;
  codigo_fabricante: string | null;
  marca: Marca;
  familia: string | null;
  unidad: string | null;
  santa_rita: number;
  santa_rosa: number;
  campo_9: number;
  misiones: number;
  loma_plata: number;
  katuete: number;
  total: number;
}

export interface VentaRepuestoHistorial {
  linea_id: string;
  producto_codigo: string;
  producto_codigo_fabricante: string | null;
  fecha_factura: string;
  cantidad: number;
  cantidad_original?: number;
  total_venta_usd: number;
  cliente: string | null;
  sucursal: string | null;
  factura: string | null;
  codigo_facturado: string | null;
  codigo_fabricante_facturado: string | null;
  descripcion_facturada: string | null;
  origen_sistema: string;
  conversion_aplicada?: boolean;
  factor_conversion?: number;
  unidad_original?: string | null;
  unidad_destino?: string | null;
  regla_conversion?: string | null;
  metodo_vinculo:
    | "vinculacion_confirmada"
    | "codigo_fabricante"
    | "codigo_interno"
    | "codigo_facturado_fabricante"
    | "descripcion_facturada_codigo_fabricante"
    | "descripcion_descripcion"
    | "descripcion_codigo_fabricante"
    | "descripcion_codigo_facturado";
}

export interface StockFiltros {
  busqueda: string;
  marca: string;
  familia: string;
  estadoStock: "con_stock" | "sin_stock" | "todos";
}

export const STOCK_FILTROS_VACIOS: StockFiltros = {
  busqueda: "",
  marca: "",
  familia: "",
  estadoStock: "con_stock",
};

export type StockSortKey =
  | "codigo_interno"
  | "descripcion"
  | "santa_rita"
  | "santa_rosa"
  | "campo_9"
  | "misiones"
  | "loma_plata"
  | "katuete"
  | "total";

/** Aplica los mismos filtros a cualquier query builder contra v_repuestos_stock_matriz, para que la página paginada y el export completo nunca queden desincronizados. */
function aplicarFiltrosStock(qb: any, filtros: StockFiltros) {
  let query = qb;
  const busqueda = filtros.busqueda.trim();
  if (busqueda) {
    query = query.or(`codigo_interno.ilike.%${busqueda}%,descripcion.ilike.%${busqueda}%,codigo_fabricante.ilike.%${busqueda}%`);
  }
  if (filtros.marca) query = query.eq("marca", filtros.marca);
  if (filtros.familia) query = query.eq("familia", filtros.familia);
  if (filtros.estadoStock === "con_stock") query = query.gt("total", 0);
  if (filtros.estadoStock === "sin_stock") query = query.eq("total", 0);
  return query;
}

export function useStockMatriz(filtros: StockFiltros, page: number, sortKey: StockSortKey, sortDir: "asc" | "desc") {
  return useQuery({
    queryKey: ["repuestos", "stock_matriz", filtros, page, sortKey, sortDir],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const from = page * STOCK_PAGE_SIZE;
      const to = from + STOCK_PAGE_SIZE - 1;

      let query = (supabase.from("v_repuestos_stock_matriz" as any) as any)
        .select(STOCK_MATRIZ_COLUMNS, { count: "exact" })
        .order(sortKey, { ascending: sortDir === "asc" });
      query = aplicarFiltrosStock(query, filtros);

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      return { rows: (data ?? []) as StockMatrizRow[], count: count ?? 0 };
    },
  });
}

/** Trae todas las filas que matchean los filtros (sin paginar), para exportar, en el mismo orden que se ve en pantalla. */
export async function fetchStockMatrizCompleto(
  filtros: StockFiltros,
  sortKey: StockSortKey,
  sortDir: "asc" | "desc",
): Promise<StockMatrizRow[]> {
  let query = (supabase.from("v_repuestos_stock_matriz" as any) as any)
    .select(STOCK_MATRIZ_COLUMNS)
    .order(sortKey, { ascending: sortDir === "asc" });
  query = aplicarFiltrosStock(query, filtros);

  return cargarTodo<StockMatrizRow>(query);
}

export interface StockKpis {
  totalCatalogo: number;
  conStock: number;
  enCero: number;
  ultimaImportacion: string | null;
}

export function useStockKpis() {
  return useQuery({
    queryKey: ["repuestos", "stock_kpis"],
    staleTime: STALE_TIME,
    queryFn: async (): Promise<StockKpis> => {
      const [totalRes, conStockRes, ultimaRes] = await Promise.all([
        (supabase.from("productos" as any) as any)
          .select("codigo_interno", { count: "exact", head: true })
          .ilike("codigo_interno", "REP%"),
        (supabase.from("v_repuestos_stock_matriz" as any) as any)
          .select("codigo_interno", { count: "exact", head: true })
          .gt("total", 0),
        (supabase.from("repuestos_stock" as any) as any)
          .select("importado_en")
          .order("importado_en", { ascending: false })
          .limit(1),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (conStockRes.error) throw conStockRes.error;
      if (ultimaRes.error) throw ultimaRes.error;

      const totalCatalogo = totalRes.count ?? 0;
      const conStock = conStockRes.count ?? 0;

      return {
        totalCatalogo,
        conStock,
        enCero: Math.max(totalCatalogo - conStock, 0),
        ultimaImportacion: ultimaRes.data?.[0]?.importado_en ?? null,
      };
    },
  });
}

export function useFamiliasStock() {
  return useQuery({
    queryKey: ["repuestos", "familias"],
    staleTime: STALE_TIME,
    queryFn: async () => {
      const rows = await cargarTodo<{ familia: string | null }>(
        (supabase.from("productos" as any) as any)
          .select("familia")
          .ilike("codigo_interno", "REP%")
          .not("familia", "is", null),
      );

      const familias = Array.from(new Set(rows.map((r) => r.familia).filter((f): f is string => !!f)));
      familias.sort((a, b) => a.localeCompare(b, "es"));
      return familias;
    },
  });
}

export function useVentasRepuesto(productoCodigo: string | null) {
  return useQuery({
    queryKey: ["repuestos", "ventas_unificadas", productoCodigo],
    enabled: Boolean(productoCodigo),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!productoCodigo) return [];

      const { data, error } = await (supabase.rpc as any)("repuesto_ventas_historial", {
        p_producto_codigo: productoCodigo,
      });

      if (error) {
        const details = [
          error.message,
          error.details,
          error.hint,
          error.code ? `Codigo ${error.code}` : null,
        ].filter(Boolean);

        throw new Error(details.join(" | ") || "No se pudo cargar el historial unificado.");
      }
      return (Array.isArray(data) ? data : []) as VentaRepuestoHistorial[];
    },
  });
}

export interface RepuestoHermano {
  codigo_interno: string;
  descripcion: string;
}

/**
 * SKU con el mismo codigo de fabricante o codigo de descripcion que este
 * producto (misma pieza fisica, distinta fila de origen/condicion --
 * Importado Nuevo / Nacional Nuevo / Nacional Usado). La factura de venta
 * solo registra el codigo de fabricante compartido, no cual de las
 * variantes se vendio -- no se puede resolver con matching, se avisa en
 * vez de adivinar.
 */
export function useRepuestoHermanos(productoCodigo: string | null) {
  return useQuery({
    queryKey: ["repuestos", "hermanos", productoCodigo],
    enabled: Boolean(productoCodigo),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!productoCodigo) return [];

      const { data, error } = await (supabase.rpc as any)("repuesto_hermanos", {
        p_producto_codigo: productoCodigo,
      });

      if (error) return [];
      return (Array.isArray(data) ? data : []) as RepuestoHermano[];
    },
  });
}
