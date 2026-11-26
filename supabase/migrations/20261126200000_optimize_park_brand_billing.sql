-- Optimize the brand/rubro endpoints used by Parque (including C/Ambas).
BEGIN;

CREATE INDEX IF NOT EXISTS idx_facturacion_factura_normalizada_fecha
  ON public.facturacion (public.parque_normalizar_clave(cod_factura), fecha);
CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_factura_normalizada_fecha
  ON public.facturacion_lineas_importadas (public.parque_normalizar_clave(factura), fecha_factura);
CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_interna_normalizada_fecha
  ON public.facturacion_lineas_importadas (public.parque_normalizar_clave(codigo_interno_factura), fecha_factura);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_normalizado ON public.clientes (lower(trim(nombre)));

CREATE OR REPLACE FUNCTION public.parque_facturacion_atribuida_rango(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  cliente_id uuid,
  fecha date,
  total_venta numeric,
  grupo_fx text,
  rubro text,
  marca text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH totvs_rango AS MATERIALIZED (
    SELECT
      fl.id,
      fl.fecha_factura::date AS fecha,
      public.parque_normalizar_clave(fl.factura) AS factura_clave,
      public.parque_normalizar_clave(fl.codigo_interno_factura) AS interna_clave,
      lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo_fx,
      lower(trim(fl.entidad_nombre)) AS nombre_clave,
      fl.marca_normalizada,
      fl.total_venta,
      fl.sucursal
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.fecha_factura >= greatest(p_desde::timestamptz, timestamptz '2026-07-01 00:00:00+00')
      AND fl.fecha_factura < (p_hasta + 1)::timestamptz
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuestos', 'repuesto', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  facturas_rango AS MATERIALIZED (
    SELECT public.parque_normalizar_clave(f.cod_factura) AS factura_clave
    FROM public.facturacion f
    WHERE f.fecha BETWEEN p_desde AND least(p_hasta, date '2026-06-30')
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuestos', 'repuesto', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
      AND public.parque_normalizar_clave(f.cod_factura) <> ''
    UNION
    SELECT factura_clave FROM totvs_rango WHERE factura_clave <> ''
    UNION
    SELECT interna_clave FROM totvs_rango WHERE interna_clave <> ''
  ),
  candidatos AS MATERIALIZED (
    SELECT DISTINCT
      fr.factura_clave,
      pm.cliente_id,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM public.ordenes_servicio_importadas osi
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(osi.factura, ''), ';') AS token(factura)
    JOIN facturas_rango fr
      ON fr.factura_clave = public.parque_normalizar_clave(token.factura)
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
  ),
  propietarios_por_factura AS MATERIALIZED (
    SELECT
      c.factura_clave,
      min(c.cliente_id::text)::uuid AS cliente_id,
      CASE
        WHEN count(DISTINCT c.marca) FILTER (WHERE c.marca IS NOT NULL) = 1
          THEN min(c.marca) FILTER (WHERE c.marca IS NOT NULL)
        ELSE NULL
      END AS marca
    FROM candidatos c
    GROUP BY c.factura_clave
    HAVING count(DISTINCT c.cliente_id) = 1
  ),
  historico AS (
    SELECT
      coalesce(propietario.cliente_id, f.cliente_id) AS cliente_id,
      f.fecha::date AS fecha,
      coalesce(f.total_venta, 0)::numeric AS total_venta,
      lower(trim(coalesce(f.grupo_fx, ''))) AS grupo_fx,
      CASE
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuestos', 'repuesto')
          THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) = 'kilometraje'
          THEN 'KILOMETRAJE'
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('mano de obra', 'servicio', 'servicios')
          THEN 'SERVICIO'
        ELSE 'OTROS'
      END AS rubro,
      coalesce(
        propietario.marca,
        nullif(upper(trim(to_jsonb(f) ->> 'marca_normalizada')), ''),
        CASE upper(trim(coalesce(f.grupo, '')))
          WHEN 'SERVICE - CLAAS' THEN 'CLAAS'
          WHEN 'REPUESTOS - CLAAS' THEN 'CLAAS'
          WHEN 'REPUESTOS CLAAS - PROMOCION' THEN 'CLAAS'
          WHEN 'REPUESTOS - CABEZALES/PLATAFOR' THEN 'CLAAS'
          WHEN 'REPUESTOS TRACTOR' THEN 'CLAAS'
          WHEN 'REPUESTOS DIVERSOS --' THEN 'CLAAS'
          WHEN 'SERVICE - HORSCH' THEN 'HORSCH'
          WHEN 'REPUESTOS PLANTADORA' THEN 'HORSCH'
          WHEN 'REPUESTOS PULVERIZADORAS' THEN 'HORSCH'
          ELSE 'OTROS'
        END
      ) AS marca
    FROM public.facturacion f
    LEFT JOIN propietarios_por_factura propietario
      ON propietario.factura_clave = public.parque_normalizar_clave(f.cod_factura)
    WHERE f.fecha BETWEEN p_desde AND p_hasta
      AND f.fecha < date '2026-07-01'
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuestos', 'repuesto', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  clientes_por_nombre AS MATERIALIZED (
    SELECT DISTINCT ON (lower(trim(c.nombre)))
      lower(trim(c.nombre)) AS nombre_clave, c.id AS cliente_id
    FROM public.clientes c
    ORDER BY lower(trim(c.nombre)), c.creado_en
  ),
  totvs_con_propietario AS MATERIALIZED (
    SELECT fl.*,
      coalesce(pf.cliente_id, pi.cliente_id) AS cliente_os,
      CASE WHEN pf.cliente_id IS NOT NULL THEN pf.marca ELSE pi.marca END AS marca_os
    FROM totvs_rango fl
    LEFT JOIN propietarios_por_factura pf ON pf.factura_clave = fl.factura_clave
    LEFT JOIN propietarios_por_factura pi ON pi.factura_clave = fl.interna_clave
  ),
  claves_sin_os AS MATERIALIZED (
    SELECT DISTINCT t.factura_clave, t.interna_clave, t.fecha, t.sucursal
    FROM totvs_con_propietario t
    WHERE t.cliente_os IS NULL AND (t.factura_clave <> '' OR t.interna_clave <> '')
  ),
  clientes_por_factura AS MATERIALIZED (
    SELECT DISTINCT ON (k.factura_clave, k.interna_clave, k.fecha, k.sucursal)
      k.factura_clave, k.interna_clave, k.fecha, k.sucursal, f.cliente_id
    FROM claves_sin_os k
    CROSS JOIN LATERAL (VALUES (k.factura_clave, 0), (k.interna_clave, 1)) AS llave(factura_clave, prioridad)
    JOIN public.facturacion f ON public.parque_normalizar_clave(f.cod_factura) = llave.factura_clave
      AND f.fecha = k.fecha
      AND (k.sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = k.sucursal)
    WHERE llave.factura_clave <> '' AND f.cliente_id IS NOT NULL
    ORDER BY k.factura_clave, k.interna_clave, k.fecha, k.sucursal,
      llave.prioridad, f.importado_en DESC, f.id
  ),
  nuevo_sistema AS (
    SELECT
      coalesce(t.cliente_os, cf.cliente_id, cn.cliente_id) AS cliente_id,
      t.fecha,
      coalesce(t.total_venta, 0)::numeric AS total_venta,
      t.grupo_fx,
      CASE
        WHEN t.grupo_fx IN ('repuestos', 'repuesto') THEN 'REPUESTOS'
        WHEN t.grupo_fx = 'kilometraje' THEN 'KILOMETRAJE'
        ELSE 'SERVICIO'
      END AS rubro,
      coalesce(t.marca_os, nullif(upper(trim(t.marca_normalizada::text)), ''), 'OTROS') AS marca
    FROM totvs_con_propietario t
    LEFT JOIN clientes_por_factura cf
      ON t.cliente_os IS NULL AND cf.factura_clave = t.factura_clave AND cf.interna_clave = t.interna_clave
      AND cf.fecha = t.fecha AND cf.sucursal IS NOT DISTINCT FROM t.sucursal
    LEFT JOIN clientes_por_nombre cn
      ON t.cliente_os IS NULL AND cf.cliente_id IS NULL AND cn.nombre_clave = t.nombre_clave
  )
  SELECT * FROM historico WHERE cliente_id IS NOT NULL
  UNION ALL
  SELECT * FROM nuevo_sistema WHERE cliente_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.parque_facturacion_legacy_fallback_rango(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  cliente_id uuid,
  fecha date,
  total_venta numeric,
  grupo_fx text,
  rubro text,
  marca text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.cliente_id,
    f.fecha::date,
    coalesce(f.total_venta, 0)::numeric,
    lower(trim(coalesce(f.grupo_fx, ''))) AS grupo_fx,
    CASE
      WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos') THEN 'REPUESTOS'
      WHEN lower(trim(coalesce(f.grupo_fx, ''))) = 'kilometraje' THEN 'KILOMETRAJE'
      ELSE 'SERVICIO'
    END AS rubro,
    coalesce(
      nullif(upper(trim(to_jsonb(f) ->> 'marca_normalizada')), ''),
      CASE
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - CLAAS', 'REPUESTOS - CLAAS', 'REPUESTOS CLAAS - PROMOCION',
          'REPUESTOS - CABEZALES/PLATAFOR', 'REPUESTOS TRACTOR', 'REPUESTOS DIVERSOS --'
        ) THEN 'CLAAS'
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - HORSCH', 'REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS'
        ) THEN 'HORSCH'
        ELSE 'OTROS'
      END
    ) AS marca
  FROM public.facturacion f
  WHERE (
      auth.uid() IS NULL
      OR public.has_module_access(auth.uid(), 'parque')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
    AND f.cliente_id IS NOT NULL
    AND NOT coalesce(f.excluido_de_reportes, false)
    AND f.fecha BETWEEN greatest(p_desde, date '2026-07-01') AND p_hasta
    AND public.parque_normalizar_clave(f.cod_factura) <> ''
    AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
      'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.facturacion_lineas_importadas fl
      WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
        AND public.parque_normalizar_clave(fl.factura) = public.parque_normalizar_clave(f.cod_factura)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.facturacion_lineas_importadas fl
      WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
        AND public.parque_normalizar_clave(fl.codigo_interno_factura) = public.parque_normalizar_clave(f.cod_factura)
    );
$$;

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion_filtros(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date,
  p_marca text,
  p_rubro text
)
RETURNS TABLE (
  cliente_id uuid,
  fact_actual numeric,
  fact_prev numeric,
  tiene_rep_rango boolean,
  tiene_srv_rango boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET plan_cache_mode = force_custom_plan
AS $$
  WITH autorizado AS (
    SELECT 1
    WHERE auth.uid() IS NULL
      OR public.has_module_access(auth.uid(), 'parque')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ),
  base AS MATERIALIZED (
    SELECT *
    FROM public.parque_facturacion_atribuida_rango(
      least(p_desde, p_prev_desde), greatest(p_hasta, p_prev_hasta)
    )
    UNION ALL
    SELECT *
    FROM public.parque_facturacion_legacy_fallback_rango(
      least(p_desde, p_prev_desde), greatest(p_hasta, p_prev_hasta)
    )
  ),
  facturacion AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta
          AND CASE
            WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
            WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS') THEN f.rubro = 'REPUESTOS'
            WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA') THEN f.rubro = 'SERVICIO'
            WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM') THEN f.rubro = 'KILOMETRAJE'
            ELSE false
          END
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
          AND CASE
            WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
            WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS') THEN f.rubro = 'REPUESTOS'
            WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA') THEN f.rubro = 'SERVICIO'
            WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM') THEN f.rubro = 'KILOMETRAJE'
            ELSE false
          END
      ), 0) AS fact_prev,
      coalesce(bool_or(f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'), false) AS tiene_rep,
      coalesce(bool_or(f.fecha BETWEEN p_desde AND p_hasta AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')), false) AS tiene_srv
    FROM base f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis_rango(p_desde, p_hasta) a
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN a.marca IN ('CLAAS', 'HORSCH')
      ELSE a.marca = upper(trim(p_marca))
    END
  ),
  clientes AS (
    SELECT cliente_id FROM facturacion
    UNION
    SELECT cliente_id FROM actividad_os
  )
  SELECT
    c.cliente_id,
    coalesce(f.fact_actual, 0),
    coalesce(f.fact_prev, 0),
    coalesce(f.tiene_rep, false),
    coalesce(f.tiene_srv, false) OR a.cliente_id IS NOT NULL
  FROM clientes c
  CROSS JOIN autorizado
  LEFT JOIN facturacion f USING (cliente_id)
  LEFT JOIN actividad_os a USING (cliente_id);
$$;

REVOKE ALL ON FUNCTION public.parque_resumen_facturacion_filtros(date,date,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(date,date,date,date,text,text) TO authenticated;

COMMIT;
