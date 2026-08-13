/* Las tablas nacen en la migración de esta entrega y todavía no forman parte
 * del archivo de tipos generado por Supabase. Se elimina este override cuando
 * se regeneren los tipos contra producción. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarcaSugerencia = "CLAAS" | "HORSCH";

export interface EstadoMaestroLegacy {
  cargado: boolean;
  archivo_nombre?: string;
  filas?: number;
  vinculadas?: number;
  canonicas?: number;
  sin_coincidencia?: number;
  completado_en?: string;
}

export interface ResultadoMaestroLegacy {
  filas: number;
  vinculadas: number;
  canonicas: number;
  sin_coincidencia: number;
}

export interface EstadoFacturacionHistorica {
  cargado: boolean;
  en_proceso: boolean;
  carga_id?: string;
  archivo_nombre?: string;
  filas_archivo?: number;
  filas_recibidas?: number;
  lineas_vinculadas?: number;
  productos_vinculados?: number;
  completado_en?: string;
  publicacion_estado?: "PROCESANDO" | "COMPLETADO" | null;
  publicacion_hasta?: string | null;
  publicado_en?: string | null;
}

export interface ResultadoFacturacionHistorica {
  carga_id: string;
  lineas_vinculadas: number;
  productos_vinculados: number;
}

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
  adi_intermitente_umbral: number;
  cv2_erratico_umbral: number;
  tendencia_caida_umbral: number;
  tendencia_caida_tope: number;
  stock_seguridad_tope: number;
  cobertura_margen_meses: number;
  pedido_unico_cobertura_meses: number;
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
  confianza_datos?: "ALTA" | "MEDIA" | "BAJA";
  tipo_stock_seguridad?: "ESTADISTICA" | "ESTIMADA";
  cobertura_aplicada_meses?: number;
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

export interface ResumenSugerenciaViva {
  total_piezas: number;
  piezas_sugeridas: number;
  unidades_sugeridas: number;
  piezas_nuevas_sin_historial: number;
  piezas_sin_ventas_recientes: number;
  piezas_confianza_baja?: number;
}

export interface SugerenciaVivaResponse {
  modelo: { id: string; version: number; nombre: string };
  fecha_analisis: string;
  resumen: ResumenSugerenciaViva;
  total_filtrado: number;
  rows: ResultadoSugerencia[];
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

export function useCalidadHistorialRepuestos(marca: MarcaSugerencia, sourceVersion?: string | null) {
  return useQuery({
    queryKey: ["repuestos", "historial-unificado", "calidad", marca, sourceVersion ?? "base"],
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

export function useEstadoMaestroLegacy() {
  return useQuery({
    queryKey: ["repuestos", "maestro-legacy", "estado"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("repuestos_estado_maestro_legacy");
      if (error) throw error;
      return data as EstadoMaestroLegacy;
    },
  });
}

export function useEstadoFacturacionHistorica() {
  return useQuery({
    queryKey: ["repuestos", "facturacion-historica", "estado"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("repuestos_estado_facturacion_historica");
      if (error) throw error;
      return data as EstadoFacturacionHistorica;
    },
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

async function consultarSugerenciaViva(
  marca: MarcaSugerencia,
  fechaAnalisis: string,
  filtros: FiltrosResultados,
  limite: number,
  offset: number,
) {
  const { data, error } = await (supabase.rpc as any)("repuestos_sugerencia_viva", {
    p_marca: marca,
    p_fecha_analisis: fechaAnalisis,
    p_buscar: filtros.buscar?.trim() || null,
    p_segmento: filtros.segmento || "TODOS",
    p_estado: filtros.estado || "TODOS",
    p_solo_sugeridos: Boolean(filtros.soloSugeridos),
    p_limite: limite,
    p_offset: offset,
  });
  if (error) {
    const details = [error.code ? `[${error.code}]` : null, error.message, error.details, error.hint].filter(Boolean);
    throw new Error(details.join(" | ") || "No se pudo calcular la sugerencia en vivo");
  }
  return data as SugerenciaVivaResponse;
}

export function useSugerenciaViva(
  marca: MarcaSugerencia,
  fechaAnalisis: string,
  filtros: FiltrosResultados,
  page: number,
  enabled = true,
  sourceVersion?: string | null,
) {
  return useQuery({
    queryKey: ["repuestos", "sugerencia-viva", marca, fechaAnalisis, filtros, page, sourceVersion ?? "base"],
    enabled: enabled && Boolean(fechaAnalisis),
    queryFn: () => consultarSugerenciaViva(
      marca,
      fechaAnalisis,
      filtros,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    ),
  });
}

export async function cargarSugerenciaViva(
  marca: MarcaSugerencia,
  fechaAnalisis: string,
  filtros: FiltrosResultados,
  onProgress?: (loaded: number, total: number) => void,
) {
  const chunkSize = 1000;
  const rows: ResultadoSugerencia[] = [];
  let offset = 0;
  let latest: SugerenciaVivaResponse | null = null;

  while (true) {
    let response: SugerenciaVivaResponse | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await consultarSugerenciaViva(marca, fechaAnalisis, filtros, chunkSize, offset);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error("No se pudo completar la exportación");

    latest = response;
    rows.push(...response.rows);
    onProgress?.(rows.length, response.total_filtrado);
    offset += response.rows.length;
    if (response.rows.length === 0 || rows.length >= response.total_filtrado) break;
  }

  if (!latest) throw new Error("No se encontraron resultados para exportar");
  return { ...latest, rows };
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

const sumarMesesFecha = (fecha: string, meses: number) => {
  const [year, month, day] = fecha.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1 + meses, day));
  return result.toISOString().slice(0, 10);
};

export async function refrescarHistorialUnificado(
  onProgress?: (completed: number, total: number) => void,
) {
  const state = await (supabase.rpc as any)("repuestos_estado_facturacion_historica");
  if (!state.error && state.data?.cargado) {
    const start = await (supabase.rpc as any)("repuestos_iniciar_publicacion_historial");
    if (start.error) throw new Error(mensajeErrorSupabase(start.error, "No se pudo iniciar la publicación del historial"));

    let cursor = String(start.data?.fecha_desde ?? "");
    const end = String(start.data?.fecha_hasta_exclusiva ?? "");
    if (!cursor || !end) throw new Error("La base no devolvió el período histórico que debe publicarse");
    const [startYear, startMonth] = cursor.split("-").map(Number);
    const [endYear, endMonth] = end.split("-").map(Number);
    const totalMonths = (endYear - startYear) * 12 + endMonth - startMonth;
    const total = Math.max(1, Math.ceil(totalMonths / 3));
    let completed = 0;
    onProgress?.(completed, total);

    while (cursor < end) {
      const next = [sumarMesesFecha(cursor, 3), end].sort()[0];
      const batch = await (supabase.rpc as any)("repuestos_publicar_historial_lote", {
        p_desde: cursor,
        p_hasta_exclusiva: next,
      });
      if (batch.error) throw new Error(mensajeErrorSupabase(batch.error, `No se pudo publicar el período ${cursor} a ${next}`));
      cursor = next;
      completed += 1;
      onProgress?.(completed, total);
    }

    const finish = await (supabase.rpc as any)("repuestos_finalizar_publicacion_historial");
    if (finish.error) throw new Error(mensajeErrorSupabase(finish.error, "No se pudo finalizar la publicación del historial"));
    const quality = await (supabase.rpc as any)("repuestos_resumen_calidad_historial", { p_marca: null });
    if (quality.error) throw new Error(mensajeErrorSupabase(quality.error, "No se pudo verificar el historial publicado"));
    return {
      actualizacion_id: 0,
      lineas_totales: quality.data?.lineas_totales ?? finish.data?.lineas_vinculadas ?? 0,
      confirmadas: quality.data?.confirmadas ?? finish.data?.lineas_vinculadas ?? 0,
      ambiguas: quality.data?.ambiguas ?? 0,
      sin_coincidencia: quality.data?.sin_coincidencia ?? 0,
      productos_con_demanda: finish.data?.productos_vinculados ?? 0,
    } as ResultadoRefrescoHistorial;
  }

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

const textoMaestroLegacy = (value: unknown) => String(value ?? "").trim();

const claveMaestroLegacy = (value: unknown) => textoMaestroLegacy(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

const campoMaestroLegacy = (
  row: Record<string, unknown>,
  ...aliases: string[]
) => {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [claveMaestroLegacy(key), value]),
  );
  for (const alias of aliases) {
    const value = normalized.get(claveMaestroLegacy(alias));
    if (value !== undefined && value !== null && textoMaestroLegacy(value)) return value;
  }
  return null;
};

const mensajeErrorSupabase = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const details = [
      value.code ? `[${String(value.code)}]` : null,
      value.message,
      value.details,
      value.hint,
    ].filter(Boolean).map(String);
    if (details.length) return details.join(" | ");
  }
  return fallback;
};

export async function importarMaestroLegacy(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("El archivo no contiene hojas");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const rows = rawRows.flatMap((row) => {
    const codigoLegacy = textoMaestroLegacy(campoMaestroLegacy(row, "Código", "Codigo"));
    if (!codigoLegacy) return [];
    return [{
      codigo_legacy: codigoLegacy,
      codigo_fabricante: textoMaestroLegacy(campoMaestroLegacy(row, "Cód. Fabricante", "Cod. Fabricante")) || null,
      descripcion: textoMaestroLegacy(campoMaestroLegacy(row, "Nombre", "Nombre Impresión", "Nombre Impresion")),
      situacion: textoMaestroLegacy(campoMaestroLegacy(row, "Situación", "Situacion")) || null,
      tipo: textoMaestroLegacy(campoMaestroLegacy(row, "Tipo")) || null,
    }];
  });
  if (rows.length === 0) {
    const headers = rawRows[0] ? Object.keys(rawRows[0]).join(", ") : "sin encabezados";
    throw new Error(`No se encontraron códigos del maestro anterior. Encabezados detectados: ${headers}`);
  }

  const start = await (supabase.rpc as any)("repuestos_iniciar_maestro_legacy", {
    p_archivo_nombre: file.name,
  });
  if (start.error) {
    throw new Error(mensajeErrorSupabase(start.error, "No se pudo iniciar la carga del maestro anterior"));
  }
  const cargaId = start.data as string;

  const chunkSize = 200;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const result = await (supabase.rpc as any)("repuestos_importar_maestro_legacy_lote", {
      p_carga_id: cargaId,
      p_filas: chunk,
    });
    if (result.error) {
      throw new Error(mensajeErrorSupabase(
        result.error,
        `No se pudo importar el lote ${Math.floor(offset / chunkSize) + 1}`,
      ));
    }
    onProgress?.(Math.min(offset + chunk.length, rows.length), rows.length);
  }

  const finish = await (supabase.rpc as any)("repuestos_finalizar_maestro_legacy", {
    p_carga_id: cargaId,
  });
  if (finish.error) {
    throw new Error(mensajeErrorSupabase(finish.error, "No se pudo finalizar la vinculación del maestro anterior"));
  }
  return finish.data as ResultadoMaestroLegacy;
}

const fechaExcelHistorica = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const text = textoMaestroLegacy(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year.toString().padStart(4, "0")}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const numeroHistorico = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = textoMaestroLegacy(value).replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};

export async function importarFacturacionHistorica(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => claveMaestroLegacy(name).includes("factrepuestos"));
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("El archivo no contiene la hoja 'Fact. Repuestos'");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  if (rawRows.length === 0) throw new Error("La hoja 'Fact. Repuestos' está vacía");

  const rows = rawRows.flatMap((row, index) => {
    const movimiento = textoMaestroLegacy(campoMaestroLegacy(row, "Tp. Movimento", "Tipo Movimiento")) || "S";
    const fecha = fechaExcelHistorica(campoMaestroLegacy(row, "Fecha Factura", "Fecha"));
    const codigoLegacy = textoMaestroLegacy(campoMaestroLegacy(row, "Cod. Mercaderia", "Cód. Mercadería"));
    if (movimiento.toUpperCase() !== "S" || !fecha || !codigoLegacy) return [];
    const documento = textoMaestroLegacy(campoMaestroLegacy(row, "Código Factura", "Codigo Factura"));
    const cantidad = numeroHistorico(campoMaestroLegacy(row, "Cant. Unit.", "Cantidad"));
    const totalVenta = numeroHistorico(campoMaestroLegacy(row, "Total Venta"));
    return [{
      linea_clave: `${index + 2}|${fecha}|${documento}|${codigoLegacy}`,
      fecha,
      documento: documento || null,
      codigo_legacy: codigoLegacy,
      descripcion: textoMaestroLegacy(campoMaestroLegacy(row, "Nombre Mercaderia", "Mercaderia")),
      entidad: textoMaestroLegacy(campoMaestroLegacy(row, "Entidad", "Cliente")),
      grupo: textoMaestroLegacy(campoMaestroLegacy(row, "Grupo")),
      sucursal: textoMaestroLegacy(campoMaestroLegacy(row, "Sucursal")),
      movimiento,
      cantidad,
      valor_unitario: numeroHistorico(campoMaestroLegacy(row, "Valor Medio", "Valor Unitario")),
      total_venta: totalVenta,
    }];
  });
  if (rows.length === 0) throw new Error("No se encontraron líneas de salida con fecha y código de mercadería");

  const start = await (supabase.rpc as any)("repuestos_iniciar_facturacion_historica", {
    p_archivo_nombre: file.name,
    p_filas_archivo: rows.length,
  });
  if (start.error) throw new Error(mensajeErrorSupabase(start.error, "No se pudo iniciar la carga histórica"));
  const cargaId = start.data as string;

  const chunkSize = 1000;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    let completed = false;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3 && !completed; attempt += 1) {
      const result = await (supabase.rpc as any)("repuestos_importar_facturacion_historica_lote", {
        p_carga_id: cargaId,
        p_filas: chunk,
      });
      if (!result.error) {
        completed = true;
        break;
      }
      lastError = result.error;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
    }
    if (!completed) {
      throw new Error(mensajeErrorSupabase(lastError, `No se pudo importar el lote ${Math.floor(offset / chunkSize) + 1}`));
    }
    onProgress?.(Math.min(offset + chunk.length, rows.length), rows.length);
  }

  const finish = await (supabase.rpc as any)("repuestos_finalizar_facturacion_historica", {
    p_carga_id: cargaId,
  });
  if (finish.error) throw new Error(mensajeErrorSupabase(finish.error, "No se pudo publicar el historial detallado"));
  return finish.data as ResultadoFacturacionHistorica;
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
