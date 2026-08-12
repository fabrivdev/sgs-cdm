-- Evita recalcular todo el historial para cada consulta del Parque.
-- La atribucion por chasis se limita al rango actual + comparativo solicitado.

CREATE INDEX IF NOT EXISTS idx_facturacion_factura_normalizada_fecha
  ON public.facturacion (public.parque_normalizar_clave(cod_factura), fecha);

CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_factura_normalizada_fecha
  ON public.facturacion_lineas_importadas (
    public.parque_normalizar_clave(factura),
    fecha_factura
  );

CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_interna_normalizada_fecha
  ON public.facturacion_lineas_importadas (
    public.parque_normalizar_clave(codigo_interno_factura),
    fecha_factura
  );

CREATE INDEX IF NOT EXISTS idx_clientes_nombre_normalizado
  ON public.clientes (lower(trim(nombre)));

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
SET search_path = public
AS $$
  WITH facturas_rango AS MATERIALIZED (
    SELECT DISTINCT public.parque_normalizar_clave(f.cod_factura) AS factura_clave
    FROM public.facturacion f
    WHERE f.fecha BETWEEN p_desde AND p_hasta
      AND public.parque_normalizar_clave(f.cod_factura) <> ''

    UNION

    SELECT DISTINCT public.parque_normalizar_clave(fl.factura)
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.fecha_factura >= p_desde::timestamptz
      AND fl.fecha_factura < (p_hasta + 1)::timestamptz
      AND public.parque_normalizar_clave(fl.factura) <> ''

    UNION

    SELECT DISTINCT public.parque_normalizar_clave(fl.codigo_interno_factura)
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.fecha_factura >= p_desde::timestamptz
      AND fl.fecha_factura < (p_hasta + 1)::timestamptz
      AND public.parque_normalizar_clave(fl.codigo_interno_factura) <> ''
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
  nuevo_sistema AS (
    SELECT
      coalesce(propietario.cliente_id, cliente_factura.cliente_id, cliente_nombre.cliente_id) AS cliente_id,
      fl.fecha_factura::date AS fecha,
      coalesce(fl.total_venta, 0)::numeric AS total_venta,
      lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) AS grupo_fx,
      CASE
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('repuestos', 'repuesto')
          THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) = 'kilometraje'
          THEN 'KILOMETRAJE'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('mano de obra', 'servicio', 'servicios')
          THEN 'SERVICIO'
        ELSE 'OTROS'
      END AS rubro,
      coalesce(propietario.marca, nullif(upper(trim(fl.marca_normalizada::text)), ''), 'OTROS') AS marca
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
        AND public.parque_normalizar_clave(f.cod_factura) IN (
          public.parque_normalizar_clave(fl.factura),
          public.parque_normalizar_clave(fl.codigo_interno_factura)
        )
        AND public.parque_normalizar_clave(f.cod_factura) <> ''
        AND (fl.sucursal IS NULL OR f.sucursal IS NULL OR f.sucursal = fl.sucursal)
      ORDER BY
        CASE WHEN public.parque_normalizar_clave(f.cod_factura)
          = public.parque_normalizar_clave(fl.factura) THEN 0 ELSE 1 END,
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
      ON propietario.cliente_id IS NULL AND cliente_factura.cliente_id IS NULL
    WHERE fl.fecha_factura >= p_desde::timestamptz
      AND fl.fecha_factura < (p_hasta + 1)::timestamptz
      AND fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuestos', 'repuesto', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  )
  SELECT * FROM historico WHERE cliente_id IS NOT NULL
  UNION ALL
  SELECT * FROM nuevo_sistema WHERE cliente_id IS NOT NULL;
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
  WITH base AS MATERIALIZED (
    SELECT *
    FROM public.parque_facturacion_atribuida_rango(
      least(p_desde, p_prev_desde),
      greatest(p_hasta, p_prev_hasta)
    ) f
    WHERE CASE
      WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
      WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN f.marca IN ('CLAAS', 'HORSCH')
      ELSE f.marca = upper(trim(p_marca))
    END
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
      coalesce(bool_or(f.fecha BETWEEN p_desde AND p_hasta AND f.rubro = 'REPUESTOS'), false) AS tiene_rep_rango,
      coalesce(bool_or(f.fecha BETWEEN p_desde AND p_hasta AND f.rubro IN ('SERVICIO', 'KILOMETRAJE')), false) AS tiene_srv_facturado
    FROM base f
    GROUP BY f.cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis() a
    WHERE a.fecha BETWEEN p_desde AND p_hasta
      AND CASE
        WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
        WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN a.marca IN ('CLAAS', 'HORSCH')
        ELSE a.marca = upper(trim(p_marca))
      END
  ),
  clientes AS (
    SELECT f.cliente_id FROM facturacion f
    UNION
    SELECT a.cliente_id FROM actividad_os a
  )
  SELECT
    c.cliente_id,
    coalesce(f.fact_actual, 0),
    coalesce(f.fact_prev, 0),
    coalesce(f.tiene_rep_rango, false),
    coalesce(f.tiene_srv_facturado, false) OR a.cliente_id IS NOT NULL
  FROM clientes c
  LEFT JOIN facturacion f ON f.cliente_id = c.cliente_id
  LEFT JOIN actividad_os a ON a.cliente_id = c.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion(
  p_desde date, p_hasta date, p_prev_desde date, p_prev_hasta date
)
RETURNS TABLE (
  cliente_id uuid, fact_actual numeric, fact_prev numeric,
  tiene_rep_rango boolean, tiene_srv_rango boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT * FROM public.parque_resumen_facturacion_filtros(
    p_desde, p_hasta, p_prev_desde, p_prev_hasta, 'ALL', 'ALL'
  );
$$;

CREATE OR REPLACE FUNCTION public.parque_resumen_facturacion_marca(
  p_desde date, p_hasta date, p_prev_desde date, p_prev_hasta date, p_marca text
)
RETURNS TABLE (
  cliente_id uuid, fact_actual numeric, fact_prev numeric,
  tiene_rep_rango boolean, tiene_srv_rango boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT * FROM public.parque_resumen_facturacion_filtros(
    p_desde, p_hasta, p_prev_desde, p_prev_hasta, p_marca, 'ALL'
  );
$$;

REVOKE ALL ON FUNCTION public.parque_facturacion_atribuida_rango(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_facturacion_atribuida_rango(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_marca(date, date, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(date, date, date, date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
