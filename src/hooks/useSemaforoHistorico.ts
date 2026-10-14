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
  familia?: string;
  deposito?: string;
  franja?: string;
  usd_min?: string;
  usd_max?: string;
  dias_min?: string;
  dias_max?: string;
  valorizacion?: string;
  compra_dias_min?: string;
  compra_dias_max?: string;
  orden?: string;
  direccion?: string;
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
  ultima_compra: string | null;
  dias_ultima_compra: number | null;
  fuente_compra: string | null;
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

export type SemaforoAgrupacion = "marca" | "familia" | "sucursal" | "deposito";
export interface SemaforoGrupo { nombre: string; lineas: number; unidades: number; valor_kardex_usd: number | null; ubicaciones_sin_valor: number; rotacion: number | null }

export interface SemaforoResultado {
  base_antiguedad: "ULTIMA_COMPRA_V1";
  version: string;
  ubicaciones_sin_valor: number;
  grupos: SemaforoGrupo[];
  franjas: Array<{ franja: string; lineas: number; valor_kardex_usd: number | null }>;
  facetas: { familias: string[]; depositos: string[]; sucursales: string[] };
  rotacion: { valor: number | null; estado: string };
  fecha_analisis: string;
  lineas: number;
  unidades_stock: number;
  valor_kardex_usd: number | null;
  lineas_valorizadas: number;
  saldos_coincidentes: number;
  kardex_cargado_en: string | null;
  por_color: SemaforoResumenColor[];
  sucursales: Array<{ nombre: string; lineas: number; unidades: number; valor_kardex_usd: number | null }>;
  rows: SemaforoFila[];
}

export async function fetchSemaforoHistorico(filtros: SemaforoFiltros, page: number, limit = SEMAFORO_PAGE_SIZE, agrupacion: SemaforoAgrupacion = "marca"): Promise<SemaforoResultado> {
  const { data: response, error } = await supabase.rpc("repuestos_analisis_valorizado" as never, {
    p_filtros: { ...filtros, busqueda: filtros.busqueda.trim() },
    p_agrupacion: agrupacion,
    p_limite: limit,
    p_offset: page * limit,
  } as never);
  if (error) {
    if (error.code === "PGRST202") throw new Error("Falta aplicar la actualización del análisis valorizado en la base de datos.");
    throw error;
  }
  const data: unknown = response;
  if (!data || typeof data !== "object" || !("rows" in data) || !("por_color" in data) || !("sucursales" in data)
    || !Array.isArray(data.rows) || !Array.isArray(data.por_color) || !Array.isArray(data.sucursales) || !("grupos" in data) || !Array.isArray(data.grupos) || !("franjas" in data) || !Array.isArray(data.franjas)) {
    throw new Error("El informe del semáforo devolvió un formato inválido");
  }
  if (!("facetas" in data) || !data.facetas || typeof data.facetas !== "object"
    || !("familias" in data.facetas) || !Array.isArray(data.facetas.familias)
    || !("depositos" in data.facetas) || !Array.isArray(data.facetas.depositos)
    || !("sucursales" in data.facetas) || !Array.isArray(data.facetas.sucursales)
    || !("version" in data) || typeof data.version !== "string") {
    throw new Error("El informe del semáforo devolvió un formato inválido");
  }
  if (!("base_antiguedad" in data) || data.base_antiguedad !== "ULTIMA_COMPRA_V1") throw new Error("Falta aplicar la actualización de antigüedad por última compra.");
  return data as unknown as SemaforoResultado;
}

export function useSemaforoHistorico(filtros: SemaforoFiltros, page: number, agrupacion: SemaforoAgrupacion = "marca") {
  return useQuery({
    queryKey: ["repuestos", "semaforo_historico", filtros, page, agrupacion],
    queryFn: () => fetchSemaforoHistorico(filtros, page, SEMAFORO_PAGE_SIZE, agrupacion),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
