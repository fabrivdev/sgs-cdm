-- Use the indexed OS-to-invoice ownership already maintained during OS imports.
-- Keep it current when the machine owner or identification changes.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_facturacion_lineas_fecha_parque
  ON public.facturacion_lineas_importadas (fecha_factura);

CREATE OR REPLACE FUNCTION public.parque_reconstruir_indice_factura_os()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  -- Serialize refreshers and keep normal reads available during rebuild.
  LOCK TABLE public.parque_factura_os_cliente IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM public.parque_factura_os_cliente;

  INSERT INTO public.parque_factura_os_cliente (factura_clave, cliente_id, marca)
  WITH candidatos AS (
    SELECT DISTINCT
      public.parque_normalizar_clave(token.factura) AS factura_clave,
      pm.cliente_id,
      nullif(upper(trim(pm.marca::text)), '') AS marca
    FROM public.ordenes_servicio_importadas osi
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(osi.factura, ''), ';') AS token(factura)
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie) = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(token.factura) <> ''
  )
  SELECT
    factura_clave,
    min(cliente_id::text)::uuid,
    CASE WHEN count(DISTINCT marca) FILTER (WHERE marca IS NOT NULL) = 1
      THEN min(marca) FILTER (WHERE marca IS NOT NULL) END
  FROM candidatos
  GROUP BY factura_clave
  HAVING count(DISTINCT cliente_id) = 1;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.parque_refrescar_factura_os_cliente()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar la atribucion de facturas'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.parque_reconstruir_indice_factura_os();
END;
$$;

CREATE OR REPLACE FUNCTION public.parque_refrescar_indice_factura_por_maquina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM maquinas_antes a
      FULL JOIN maquinas_despues d USING (id)
      WHERE ROW(a.cliente_id, a.serie, a.marca)
        IS DISTINCT FROM ROW(d.cliente_id, d.serie, d.marca)
    ) THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM maquinas_despues WHERE cliente_id IS NOT NULL) THEN
      RETURN NULL;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM maquinas_antes WHERE cliente_id IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  PERFORM public.parque_reconstruir_indice_factura_os();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS parque_indice_factura_maquina_insert ON public.parque_maquinas;
CREATE TRIGGER parque_indice_factura_maquina_insert
AFTER INSERT ON public.parque_maquinas REFERENCING NEW TABLE AS maquinas_despues
FOR EACH STATEMENT EXECUTE FUNCTION public.parque_refrescar_indice_factura_por_maquina();

DROP TRIGGER IF EXISTS parque_indice_factura_maquina_update ON public.parque_maquinas;
CREATE TRIGGER parque_indice_factura_maquina_update
AFTER UPDATE ON public.parque_maquinas
REFERENCING OLD TABLE AS maquinas_antes NEW TABLE AS maquinas_despues
FOR EACH STATEMENT EXECUTE FUNCTION public.parque_refrescar_indice_factura_por_maquina();

DROP TRIGGER IF EXISTS parque_indice_factura_maquina_delete ON public.parque_maquinas;
CREATE TRIGGER parque_indice_factura_maquina_delete
AFTER DELETE ON public.parque_maquinas REFERENCING OLD TABLE AS maquinas_antes
FOR EACH STATEMENT EXECUTE FUNCTION public.parque_refrescar_indice_factura_por_maquina();


CREATE OR REPLACE FUNCTION public.parque_facturacion_atribuida_indexada_rango(
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
    LEFT JOIN public.parque_factura_os_cliente propietario
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
    LEFT JOIN public.parque_factura_os_cliente pf ON pf.factura_clave = fl.factura_clave
    LEFT JOIN public.parque_factura_os_cliente pi ON pi.factura_clave = fl.interna_clave
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
  ), intervalos AS (
    SELECT lower(rango) AS desde, upper(rango) - 1 AS hasta
    FROM unnest(
      CASE WHEN p_desde <= p_hasta THEN datemultirange(daterange(p_desde, p_hasta, '[]'))
        ELSE '{}'::datemultirange END
      + CASE WHEN p_prev_desde <= p_prev_hasta THEN datemultirange(daterange(p_prev_desde, p_prev_hasta, '[]'))
        ELSE '{}'::datemultirange END
    ) AS rango
  ), base AS (
    SELECT f.*
    FROM autorizado CROSS JOIN intervalos i
    CROSS JOIN LATERAL public.parque_facturacion_atribuida_indexada_rango(i.desde, i.hasta) f
    UNION ALL
    SELECT f.*
    FROM autorizado CROSS JOIN intervalos i
    CROSS JOIN LATERAL public.parque_facturacion_legacy_fallback_rango(i.desde, i.hasta) f
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

REVOKE ALL ON FUNCTION public.parque_reconstruir_indice_factura_os() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parque_refrescar_indice_factura_por_maquina() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parque_facturacion_atribuida_indexada_rango(date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parque_refrescar_factura_os_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_refrescar_factura_os_cliente() TO authenticated;
REVOKE ALL ON FUNCTION public.parque_resumen_facturacion_filtros(date,date,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(date,date,date,date,text,text) TO authenticated;

SELECT public.parque_reconstruir_indice_factura_os();

COMMIT;
