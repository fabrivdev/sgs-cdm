/* Las tablas nacen en la migración de esta entrega y todavía no forman parte
 * del archivo de tipos generado por Supabase. Se elimina este override cuando
 * se regeneren los tipos contra producción. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarcaSugerencia = "CLAAS" | "HORSCH";

export interface ModeloSugerencia {
  id: string;
  marca: MarcaSugerencia;
  version: number;
  nombre: string;
  activa: boolean;
  peso_reciente: number;
  peso_anterior: number;
  lead_time_meses: number;
  ciclo_planificacion_meses: number;
  origen_predeterminado: string;
  abc_limite_a: number;
  abc_limite_b: number;
  fsn_pedidos_f: number;
  fsn_dias_f: number;
  fsn_dias_n: number;
  xyz_cv_x: number;
  xyz_cv_y: number;
  xyz_meses_x: number;
  xyz_meses_y_min: number;
  xyz_meses_y_max: number;
  creado_en: string;
}

export interface SegmentoSugerencia {
  modelo_version_id: string;
  segmento: string;
  nivel_servicio: number | null;
  revision_meses: number;
  valor_z: number;
  descripcion: string | null;
}

export interface CorridaSugerencia {
  id: string;
  marca: MarcaSugerencia;
  modelo_version_id: string;
  nombre: string;
  fecha_analisis: string;
  estado: "procesando" | "completada" | "fallida";
  parametros_snapshot: Record<string, unknown>;
  fuentes_snapshot: Record<string, unknown>;
  total_piezas: number;
  piezas_sugeridas: number;
  unidades_sugeridas: number;
  piezas_sin_ventas: number;
  piezas_nuevas_sin_historial: number;
  piezas_sin_ventas_recientes: number;
  creado_en: string;
  completado_en: string | null;
}

export interface ResultadoSugerencia {
  corrida_id: string;
  producto_codigo: string;
  codigo_fabricante: string | null;
  descripcion: string;
  familia: string | null;
  marca: MarcaSugerencia;
  origen: string;
  estado_datos: string;
  incorporado_en: string | null;
  stock_minimo_estrategico: number;
  stock_global: number;
  unidades_12m: number;
  unidades_24m: number;
  total_vendido_12m: number;
  total_vendido_24m: number;
  pedidos_12m: number;
  pedidos_24m: number;
  meses_venta_12m: number;
  media_mensual_12m: number;
  desviacion_mensual_12m: number;
  coeficiente_variacion: number;
  ultima_venta: string | null;
  dias_ultima_venta: number | null;
  abc: string;
  fsn: string;
  xyz: string;
  codigo_mix: string | null;
  segmento: string;
  horizonte_meses: number;
  demanda_ponderada_mensual: number;
  demanda_horizonte: number;
  stock_seguridad: number;
  stock_objetivo: number;
  necesidad_neta: number;
  sugerencia_unidades: number;
  explicacion: Record<string, unknown>;
}

export interface FiltrosResultados {
  buscar?: string;
  segmento?: string;
  estado?: string;
  soloSugeridos?: boolean;
}

export interface CalidadHistorialRepuestos {
  preparado: boolean;
  lineas_totales: number;
  confirmadas: number;
  ambiguas: number;
  sin_coincidencia: number;
  productos_confirmados: number;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  actualizado_en: string | null;
}

export interface ResultadoRefrescoHistorial {
  actualizacion_id: number;
  lineas_totales: number;
  confirmadas: number;
  ambiguas: number;
  sin_coincidencia: number;
  productos_con_demanda: number;
}

const PAGE_SIZE = 50;

function cleanSearch(value: string) {
  return value.replace(/[(),]/g, " ").trim();
}

function aplicarFiltros(query: any, filtros: FiltrosResultados) {
  const search = cleanSearch(filtros.buscar ?? "");
  if (search) {
    query = query.or(
      `producto_codigo.ilike.%${search}%,codigo_fabricante.ilike.%${search}%,descripcion.ilike.%${search}%`,
    );
  }
  if (filtros.segmento && filtros.segmento !== "TODOS") query = query.eq("segmento", filtros.segmento);
  if (filtros.estado && filtros.estado !== "TODOS") query = query.eq("estado_datos", filtros.estado);
  if (filtros.soloSugeridos) query = query.gt("sugerencia_unidades", 0);
  return query;
}

export function useModeloActivo(marca: MarcaSugerencia) {
  return useQuery({
    queryKey: ["repuestos", "sugerencias", "modelo", marca],
    queryFn: async () => {
      const { data, error } = await (supabase.from("repuestos_modelo_versiones" as any) as any)
        .select("*")
        .eq("marca", marca)
        .eq("activa", true)
        .maybeSingle();
      if (error) throw error;
      return (data as ModeloSugerencia | null) ?? null;
    },
  });
}

export function useSegmentosModelo(modeloId?: string) {
  return useQuery({
    queryKey: ["repuestos", "sugerencias", "segmentos", modeloId],
    enabled: Boolean(modeloId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("repuestos_modelo_segmentos" as any) as any)
        .select("*")
        .eq("modelo_version_id", modeloId)
        .order("segmento");
      if (error) throw error;
      return (data ?? []) as SegmentoSugerencia[];
    },
  });
}

export function useCorridasSugerencia(marca: MarcaSugerencia) {
  return useQuery({
    queryKey: ["repuestos", "sugerencias", "corridas", marca],
    queryFn: async () => {
      const { data, error } = await (supabase.from("repuestos_corridas" as any) as any)
        .select("*")
        .eq("marca", marca)
        .eq("estado", "completada")
        .order("creado_en", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CorridaSugerencia[];
    },
  });
}

export function useCalidadHistorialRepuestos(marca: MarcaSugerencia) {
  return useQuery({
    queryKey: ["repuestos", "historial-unificado", "calidad", marca],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("repuestos_resumen_calidad_historial", {
        p_marca: marca,
      });
      if (error) throw error;
      return data as CalidadHistorialRepuestos;
    },
    retry: false,
  });
}

export function useResultadosSugerencia(
  corridaId: string | undefined,
  filtros: FiltrosResultados,
  page: number,
) {
  return useQuery({
    queryKey: ["repuestos", "sugerencias", "resultados", corridaId, filtros, page],
    enabled: Boolean(corridaId),
    queryFn: async () => {
      let query = (supabase.from("repuestos_corrida_resultados" as any) as any)
        .select("*", { count: "exact" })
        .eq("corrida_id", corridaId)
        .order("sugerencia_unidades", { ascending: false })
        .order("total_vendido_12m", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      query = aplicarFiltros(query, filtros);
      const { data, error, count } = await query;
      if (error) throw error;
      return {
        rows: (data ?? []) as ResultadoSugerencia[],
        count: count ?? 0,
        pageSize: PAGE_SIZE,
      };
    },
  });
}

export async function cargarTodosLosResultados(corridaId: string, filtros: FiltrosResultados) {
  const pageSize = 1000;
  const rows: ResultadoSugerencia[] = [];
  let offset = 0;
  while (true) {
    let query = (supabase.from("repuestos_corrida_resultados" as any) as any)
      .select("*")
      .eq("corrida_id", corridaId)
      .order("sugerencia_unidades", { ascending: false })
      .range(offset, offset + pageSize - 1);
    query = aplicarFiltros(query, filtros);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as ResultadoSugerencia[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

export async function ejecutarSugerencia(marca: MarcaSugerencia, fechaAnalisis: string) {
  const { data, error } = await (supabase.rpc as any)("repuestos_ejecutar_sugerencia", {
    p_marca: marca,
    p_fecha_analisis: fechaAnalisis,
    p_nombre: null,
  });
  if (error) throw error;
  return data as string;
}

export async function refrescarHistorialUnificado() {
  const { data, error } = await (supabase.rpc as any)("repuestos_refrescar_historial_unificado");
  if (error) {
    const details = [
      error.code ? `[${error.code}]` : null,
      error.message,
      error.details,
      error.hint,
    ].filter(Boolean);
    throw new Error(details.join(" | ") || "No se pudo preparar el historial");
  }
  return data as ResultadoRefrescoHistorial;
}

export async function guardarPlanificacionArticulo(input: {
  productoCodigo: string;
  stockMinimoEstrategico: number;
  origen: string;
  observaciones?: string;
}) {
  const { error } = await (supabase.rpc as any)("repuestos_guardar_planificacion_articulo", {
    p_producto_codigo: input.productoCodigo,
    p_stock_minimo_estrategico: input.stockMinimoEstrategico,
    p_origen: input.origen,
    p_observaciones: input.observaciones ?? null,
  });
  if (error) throw error;
}

export async function crearVersionModelo(input: {
  marca: MarcaSugerencia;
  nombre: string;
  parametros: Record<string, number | string>;
  segmentos: SegmentoSugerencia[];
}) {
  const { data, error } = await (supabase.rpc as any)("repuestos_crear_version_modelo", {
    p_marca: input.marca,
    p_nombre: input.nombre,
    p_parametros: input.parametros,
    p_segmentos: input.segmentos.map(({ segmento, nivel_servicio, revision_meses, valor_z, descripcion }) => ({
      segmento,
      nivel_servicio,
      revision_meses,
      valor_z,
      descripcion,
    })),
  });
  if (error) throw error;
  return data as string;
}
