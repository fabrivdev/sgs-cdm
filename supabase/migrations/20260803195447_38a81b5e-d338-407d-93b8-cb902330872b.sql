-- Attribute Park billing to the current machine owner when an invoice is linked
-- to a service order with a known chassis. Direct client links remain as fallback.

CREATE OR REPLACE FUNCTION public.parque_normalizar_clave(p_valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT upper(regexp_replace(coalesce(p_valor, ''), '[^[:alnum:]]', '', 'g'));
$$;

CREATE INDEX IF NOT EXISTS idx_parque_maquinas_serie_normalizada
  ON public.parque_maquinas (public.parque_normalizar_clave(serie))
  WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_chasis_normalizado
  ON public.ordenes_servicio_importadas (
    public.parque_normalizar_clave(nro_chasis)
  )
  WHERE nro_chasis IS NOT NULL;

CREATE OR REPLACE FUNCTION public.parque_facturas_chasis_atribuidas()
RETURNS TABLE (
  factura_clave text,
  cliente_id uuid,
  marca text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH candidatos AS (
    SELECT DISTINCT
      public.parque_normalizar_clave(token.factura) AS factura_clave,
      pm.cliente_id,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM public.ordenes_servicio_importadas osi
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(osi.factura, ''), ';') AS token(factura)
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(token.factura) <> ''
  ),
  atribuciones_unicas AS (
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
  )
  SELECT a.factura_clave, a.cliente_id, a.marca
  FROM atribuciones_unicas a;
$$;

CREATE OR REPLACE FUNCTION public.parque_facturacion_atribuida()
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
SET search_path = public
AS $$
  WITH propietarios_por_factura AS MATERIALIZED (
    SELECT * FROM public.parque_facturas_chasis_atribuidas()
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
    WHERE f.fecha < date '2026-07-01'
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuestos',
        'repuesto',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  nuevo_sistema AS (
    SELECT
      coalesce(
        propietario.cliente_id,
        cliente_factura.cliente_id,
        cliente_nombre.cliente_id
      ) AS cliente_id,
      fl.fecha_factura::date AS fecha,
      coalesce(fl.total_venta, 0)::numeric AS total_venta,
      lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo_fx,
      CASE
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          IN ('repuestos', 'repuesto')
          THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          = 'kilometraje'
          THEN 'KILOMETRAJE'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, '')))
          IN ('mano de obra', 'servicio', 'servicios')
          THEN 'SERVICIO'
        ELSE 'OTROS'
      END AS rubro,
      coalesce(
        propietario.marca,
        nullif(upper(trim(fl.marca_normalizada::text)), ''),
        'OTROS'
      ) AS marca
    FROM public.facturacion_lineas_importadas fl
    LEFT JOIN LATERAL (
      SELECT p.cliente_id, p.marca
      FROM propietarios_por_factura p
      WHERE p.factura_clave IN (
        public.parque_normalizar_clave(fl.factura),
        public.parque_normalizar_clave(fl.codigo_interno_factura)
      )
        AND p.factura_clave <> ''
      ORDER BY CASE
        WHEN p.factura_clave = public.parque_normalizar_clave(fl.factura) THEN 0
        ELSE 1
      END
      LIMIT 1
    ) propietario ON true
    LEFT JOIN LATERAL (
      SELECT f.cliente_id
      FROM public.facturacion f
      WHERE f.cliente_id IS NOT NULL
        AND f.fecha = fl.fecha_factura::date
        AND (
          public.parque_normalizar_clave(f.cod_factura)
            = public.parque_normalizar_clave(fl.factura)
          OR public.parque_normalizar_clave(f.cod_factura)
            = public.parque_normalizar_clave(fl.codigo_interno_factura)
        )
        AND public.parque_normalizar_clave(f.cod_factura) <> ''
        AND (fl.sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = fl.sucursal)
      ORDER BY
        CASE
          WHEN public.parque_normalizar_clave(f.cod_factura)
            = public.parque_normalizar_clave(fl.factura) THEN 0
          ELSE 1
        END,
        f.importado_en DESC
      LIMIT 1
    ) cliente_factura ON propietario.cliente_id IS NULL
    LEFT JOIN LATERAL (
      SELECT c.id AS cliente_id
      FROM public.clientes c
      WHERE lower(trim(c.nombre)) = lower(trim(fl.entidad_nombre))
      ORDER BY c.creado_en
      LIMIT 1
    ) cliente_nombre
      ON propietario.cliente_id IS NULL
      AND cliente_factura.cliente_id IS NULL
    WHERE fl.fecha_factura IS NOT NULL
      AND fl.fecha_factura::date >= date '2026-07-01'
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuestos',
        'repuesto',
        'mano de obra',
        'servicio',
        'servicios',
        'kilometraje'
      )
  ),
  base AS (
    SELECT * FROM historico
    UNION ALL
    SELECT * FROM nuevo_sistema
  )
  SELECT
    b.cliente_id,
    b.fecha,
    b.total_venta,
    b.grupo_fx,
    b.rubro,
    b.marca
  FROM base b
  WHERE b.cliente_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date
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
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    f.cliente_id,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_desde AND p_hasta
    ), 0) AS fact_actual,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
    ), 0) AS fact_prev,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
    ), false) AS tiene_rep_rango,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta
      AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    ), false) AS tiene_srv_rango
  FROM public.parque_facturacion_atribuida() f
  WHERE f.fecha BETWEEN p_desde AND p_hasta
    OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
  GROUP BY f.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas()
RETURNS TABLE (
  cliente_id uuid,
  ult_repuesto date,
  ult_servicio date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    f.cliente_id,
    max(f.fecha) FILTER (WHERE f.rubro = 'REPUESTOS') AS ult_repuesto,
    max(f.fecha) FILTER (
      WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    ) AS ult_servicio
  FROM public.parque_facturacion_atribuida() f
  GROUP BY f.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion_marca(
  p_desde date,
  p_hasta date,
  p_prev_desde date,
  p_prev_hasta date,
  p_marca text
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
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtrada AS (
    SELECT *
    FROM public.parque_facturacion_atribuida() f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
  )
  SELECT
    f.cliente_id,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_desde AND p_hasta
    ), 0) AS fact_actual,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
    ), 0) AS fact_prev,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
    ), false) AS tiene_rep_rango,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta
      AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    ), false) AS tiene_srv_rango
  FROM filtrada f
  WHERE f.fecha BETWEEN p_desde AND p_hasta
    OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
  GROUP BY f.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas_marca(p_marca text)
RETURNS TABLE (
  cliente_id uuid,
  ult_repuesto date,
  ult_servicio date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    f.cliente_id,
    max(f.fecha) FILTER (WHERE f.rubro = 'REPUESTOS') AS ult_repuesto,
    max(f.fecha) FILTER (
      WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    ) AS ult_servicio
  FROM public.parque_facturacion_atribuida() f
  WHERE CASE
    WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
    WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
      THEN f.marca IN ('CLAAS', 'HORSCH')
    ELSE f.marca = upper(trim(p_marca))
  END
  GROUP BY f.cliente_id;
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
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtrada_marca AS (
    SELECT *
    FROM public.parque_facturacion_atribuida() f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS')
        THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
  ),
  filtrada AS (
    SELECT
      f.*,
      CASE
        WHEN upper(trim(coalesce(p_rubro, ''))) IN ('', 'ALL', 'TODOS') THEN true
        WHEN upper(trim(p_rubro)) IN ('REPUESTO', 'REPUESTOS')
          THEN f.rubro = 'REPUESTOS'
        WHEN upper(trim(p_rubro)) IN ('SERVICIO', 'SERVICIOS', 'MANO DE OBRA')
          THEN f.rubro = 'SERVICIO'
        WHEN upper(trim(p_rubro)) IN ('KILOMETRAJE', 'KM')
          THEN f.rubro = 'KILOMETRAJE'
        ELSE false
      END AS rubro_seleccionado
    FROM filtrada_marca f
  )
  SELECT
    f.cliente_id,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_desde AND p_hasta
        AND f.rubro_seleccionado
    ), 0) AS fact_actual,
    coalesce(sum(f.total_venta) FILTER (
      WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
        AND f.rubro_seleccionado
    ), 0) AS fact_prev,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'
    ), false) AS tiene_rep_rango,
    coalesce(bool_or(
      f.fecha BETWEEN p_desde AND p_hasta
      AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')
    ), false) AS tiene_srv_rango
  FROM filtrada f
  WHERE f.fecha BETWEEN p_desde AND p_hasta
    OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
  GROUP BY f.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_kpis()
RETURNS TABLE (
  total_maquinas integer,
  total_clientes integer,
  con_servicio_anio integer,
  contactados_mes integer,
  sin_contacto_60d integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inicio_mes date := date_trunc('month', CURRENT_DATE)::date;
  v_hace_anio date := (CURRENT_DATE - interval '1 year')::date;
  v_hace_60d date := (CURRENT_DATE - interval '60 days')::date;
BEGIN
  RETURN QUERY
  WITH clientes_maq AS (
    SELECT DISTINCT pm.cliente_id
    FROM public.parque_maquinas pm
    WHERE pm.activo = true AND pm.cliente_id IS NOT NULL
  ),
  facturacion_atribuida AS MATERIALIZED (
    SELECT * FROM public.parque_facturacion_atribuida()
  ),
  servicio_anio AS (
    SELECT DISTINCT f.cliente_id
    FROM facturacion_atribuida f
    WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      AND f.fecha >= v_hace_anio
  ),
  servicio_60d AS (
    SELECT DISTINCT f.cliente_id
    FROM facturacion_atribuida f
    WHERE f.rubro IN ('SERVICIO', 'KILOMETRAJE')
      AND f.fecha >= v_hace_60d
  ),
  ult_seg AS (
    SELECT s.cliente_id, max(s.fecha) AS ult_fecha
    FROM public.seguimiento_comercial s
    GROUP BY s.cliente_id
  )
  SELECT
    (SELECT count(*)::int FROM public.parque_maquinas WHERE activo = true),
    (SELECT count(*)::int FROM clientes_maq),
    (SELECT count(*)::int
      FROM clientes_maq cm
      WHERE cm.cliente_id IN (SELECT cliente_id FROM servicio_anio)),
    (SELECT count(*)::int
      FROM clientes_maq cm
      JOIN ult_seg us ON us.cliente_id = cm.cliente_id
      WHERE us.ult_fecha >= v_inicio_mes),
    (SELECT count(*)::int
      FROM clientes_maq cm
      WHERE cm.cliente_id NOT IN (SELECT cliente_id FROM servicio_60d)
        AND NOT EXISTS (
          SELECT 1
          FROM ult_seg us
          WHERE us.cliente_id = cm.cliente_id
            AND us.ult_fecha >= v_hace_60d
        ));
END;
$$;

REVOKE ALL ON FUNCTION public.parque_normalizar_clave(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parque_facturas_chasis_atribuidas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parque_facturacion_atribuida() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.parque_normalizar_clave(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_facturas_chasis_atribuidas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_facturacion_atribuida() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(date, date, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_marca(date, date, date, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas_marca(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(
  date, date, date, date, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_kpis() TO authenticated;