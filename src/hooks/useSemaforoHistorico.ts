import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SEMAFORO_PAGE_SIZE = 50;

export const SEMAFORO_COLORES = [
  { id: "VERDE_OSCURO", label: "Verde oscuro", descripcion: "10 o más unidades vendidas en 365 días", className: "bg-emerald-700" },
  { id: "VERDE_CLARO", label: "Verde claro", descripcion: "1 a 9 unidades vendidas en 365 días", className: "bg-emerald-400" },
  { id: "AMARILLO", label: "Amarillo", descripcion: "Última venta hace 366 a 730 días", className: "bg-amber-400" },
  { id: "NARANJA", label: "Naranja", descripcion: "Última venta hace 731 a 1.000 días", className: "bg-orange-500" },
  { id: "LILA", label: "Lila", descripcion: "Última venta hace 1.001 a 1.825 días", className: "bg-violet-400" },
  { id: "GRIS", label: "Gris", descripcion: "Última venta hace más de 1.825 días", className: "bg-slate-400" },
  { id: "ROJO", label: "Rojo", descripcion: "Sin venta confirmada; maestro anterior vinculado", className: "bg-red-500" },
  { id: "SIN_DATOS", label: "Sin datos", descripcion: "Sin venta confirmada ni equivalencia acreditada", className: "bg-slate-200" },
] as const;

export type SemaforoColor = typeof SEMAFORO_COLORES[number]["id"];

export interface SemaforoFiltros {
  busqueda: string;
  marca: string;
  color: string;
  sucursal: string;
}

export interface SemaforoFila {
  codigo_interno: string;
  codigo_fabricante: string | null;
  descripcion: string;
  marca: string;
  familia: string | null;
  stock_total: number;
  santa_rita: number;
  santa_rosa: number;
  campo_9: number;
  misiones: number;
  loma_plata: number;
  katuete: number;
  ultima_venta: string | null;
  dias_ultima_venta: number | null;
  unidades_365d: number;
  unidades_anio_actual: number;
  unidades_anio_anterior: number;
  unidades_hace_dos_anios: number;
  codigos_anteriores: number;
  codigo_anterior_ejemplo: string | null;
  saldo_kardex: number | null;
  valor_kardex_usd: number | null;
  kardex_cargado_en: string | null;
  kardex_archivo: string | null;
  saldo_coincide: boolean;
  color: SemaforoColor;
  fecha_analisis: string;
}

export interface SemaforoResumenColor {
  color: SemaforoColor;
  lineas: number;
  unidades_stock: number;
  valor_kardex_usd: number | null;
  lineas_valorizadas: number;
  saldos_coincidentes: number;
}

export interface SemaforoResultado {
  fecha_analisis: string;
  lineas: number;
  unidades_stock: number;
  valor_kardex_usd: number;
  lineas_valorizadas: number;
  saldos_coincidentes: number;
  kardex_cargado_en: string | null;
  por_color: SemaforoResumenColor[];
  sucursales: Array<{ nombre: string; lineas: number; unidades: number }>;
  rows: SemaforoFila[];
}

export async function fetchSemaforoHistorico(filtros: SemaforoFiltros, page: number, limit = SEMAFORO_PAGE_SIZE): Promise<SemaforoResultado> {
  const { data, error } = await supabase.rpc("repuestos_semaforo_historico_paginado" as never, {
    p_busqueda: filtros.busqueda.trim() || null,
    p_marca: filtros.marca || null,
    p_color: filtros.color || null,
    p_sucursal: filtros.sucursal || null,
    p_limite: limit,
    p_offset: page * limit,
  } as never);
  if (error) throw error;
  if (!data || typeof data !== "object" || !("rows" in data) || !("por_color" in data) || !("sucursales" in data)
    || !Array.isArray(data.rows) || !Array.isArray(data.por_color) || !Array.isArray(data.sucursales)) {
    throw new Error("El informe del semáforo devolvió un formato inválido");
  }
  return data as SemaforoResultado;
}

export function useSemaforoHistorico(filtros: SemaforoFiltros, page: number) {
  return useQuery({
    queryKey: ["repuestos", "semaforo_historico", filtros, page],
    queryFn: () => fetchSemaforoHistorico(filtros, page),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
