-- Cierra los hallazgos de la auditoria del 20/08/2026:
-- 1. Recupera facturas legacy posteriores al corte solo cuando no existe
--    una factura equivalente en el sistema nuevo.
-- 2. Aplica la misma regla a la vista normal, filtros y ultima actividad.
-- 3. Protege la tabla tecnica de atribucion factura -> cliente.
-- 4. Impide que una sesion de la app quite o degrade el superadministrador.

-- ---------------------------------------------------------------------
-- Facturacion legacy posterior al corte sin equivalente nuevo.
-- La factura normalizada es la clave de deduplicacion auditada: las 741
-- coincidencias quedan en la fuente nueva y solo las 19 no coincidentes
-- pueden pasar por este fallback. Los rubros ajenos a Parque siguen fuera.
-- ---------------------------------------------------------------------

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
        AND public.parque_normalizar_clave(f.cod_factura) IN (
          public.parque_normalizar_clave(fl.factura),
          public.parque_normalizar_clave(fl.codigo_interno_factura)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.parque_facturacion_legacy_fallback_rango(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_facturacion_legacy_fallback_rango(date, date)
  TO authenticated;

-- Vista con filtros: conserva el motor existente y agrega solo el fallback.
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
SET search_path = public
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

REVOKE ALL ON FUNCTION public.parque_resumen_facturacion_filtros(
  date, date, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion_filtros(
  date, date, date, date, text, text
) TO authenticated;

-- Ruta rapida sin filtros. No ejecuta la atribucion cara por chasis.
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
SECURITY DEFINER
SET search_path = public
AS $$
  WITH autorizado AS (
    SELECT 1
    WHERE auth.uid() IS NULL
      OR public.has_module_access(auth.uid(), 'parque')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ),
  movimientos AS MATERIALIZED (
    SELECT
      f.cliente_id,
      f.fecha::date AS fecha,
      coalesce(f.total_venta, 0)::numeric AS total_venta,
      CASE
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos') THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(f.grupo_fx, ''))) = 'kilometraje' THEN 'KILOMETRAJE'
        ELSE 'SERVICIO'
      END AS rubro
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND f.fecha < date '2026-07-01'
      AND (f.fecha BETWEEN p_desde AND p_hasta OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta)
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )

    UNION ALL

    SELECT cliente_id, fecha, total_venta, rubro
    FROM public.parque_facturacion_legacy_fallback_rango(
      least(p_desde, p_prev_desde), greatest(p_hasta, p_prev_hasta)
    )

    UNION ALL

    SELECT
      fl.cliente_id,
      fl.fecha_factura::date,
      coalesce(fl.total_venta, 0)::numeric,
      CASE
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('repuesto', 'repuestos') THEN 'REPUESTOS'
        WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) = 'kilometraje' THEN 'KILOMETRAJE'
        ELSE 'SERVICIO'
      END
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND (fl.fecha_factura::date BETWEEN p_desde AND p_hasta OR fl.fecha_factura::date BETWEEN p_prev_desde AND p_prev_hasta)
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
  ),
  facturacion AS (
    SELECT
      cliente_id,
      coalesce(sum(total_venta) FILTER (WHERE fecha BETWEEN p_desde AND p_hasta), 0) AS fact_actual,
      coalesce(sum(total_venta) FILTER (WHERE fecha BETWEEN p_prev_desde AND p_prev_hasta), 0) AS fact_prev,
      coalesce(bool_or(fecha BETWEEN p_desde AND p_hasta AND rubro = 'REPUESTOS'), false) AS tiene_rep,
      coalesce(bool_or(fecha BETWEEN p_desde AND p_hasta AND rubro IN ('SERVICIO', 'KILOMETRAJE')), false) AS tiene_srv
    FROM movimientos
    GROUP BY cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT cliente_id
    FROM public.parque_actividad_os_chasis_rango(p_desde, p_hasta)
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

REVOKE ALL ON FUNCTION public.parque_resumen_facturacion(date, date, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(date, date, date, date)
  TO authenticated;

-- La cache de ultima actividad usa exactamente la misma deduplicacion.
CREATE OR REPLACE FUNCTION public.refrescar_parque_ultima_actividad()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar el resumen del Parque'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.parque_ultima_actividad;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_venta_repuestos,
    ultimo_servicio_facturado, ultima_os, actualizado_en
  )
  WITH facturacion_unificada AS (
    SELECT
      cliente_id,
      marca,
      max(fecha) FILTER (WHERE rubro = 'REPUESTOS') AS ultima_venta_repuestos,
      max(fecha) FILTER (WHERE rubro IN ('SERVICIO', 'KILOMETRAJE')) AS ultimo_servicio_facturado
    FROM (
      SELECT
        f.cliente_id,
        f.fecha::date AS fecha,
        CASE
          WHEN lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos') THEN 'REPUESTOS'
          WHEN lower(trim(coalesce(f.grupo_fx, ''))) = 'kilometraje' THEN 'KILOMETRAJE'
          ELSE 'SERVICIO'
        END AS rubro,
        coalesce(
          nullif(upper(trim(to_jsonb(f) ->> 'marca_normalizada')), ''),
          CASE
            WHEN upper(trim(coalesce(f.grupo, ''))) LIKE '%CLAAS%' THEN 'CLAAS'
            WHEN upper(trim(coalesce(f.grupo, ''))) LIKE '%HORSCH%'
              OR upper(trim(coalesce(f.grupo, ''))) IN ('REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS') THEN 'HORSCH'
            ELSE 'OTROS'
          END
        ) AS marca
      FROM public.facturacion f
      WHERE f.cliente_id IS NOT NULL
        AND NOT coalesce(f.excluido_de_reportes, false)
        AND f.fecha < date '2026-07-01'
        AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )

      UNION ALL

      SELECT cliente_id, fecha, rubro, marca
      FROM public.parque_facturacion_legacy_fallback_rango(date '2026-07-01', date '9999-12-31')

      UNION ALL

      SELECT
        fl.cliente_id,
        fl.fecha_factura::date,
        CASE
          WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('repuesto', 'repuestos') THEN 'REPUESTOS'
          WHEN lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) = 'kilometraje' THEN 'KILOMETRAJE'
          ELSE 'SERVICIO'
        END,
        coalesce(nullif(upper(trim(fl.marca_normalizada::text)), ''), 'OTROS')
      FROM public.facturacion_lineas_importadas fl
      WHERE fl.cliente_id IS NOT NULL
        AND fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
        AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
          'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
    ) movimientos
    GROUP BY cliente_id, marca
  ),
  os_resumen AS (
    SELECT
      pm.cliente_id,
      CASE WHEN upper(trim(pm.marca::text)) IN ('CLAAS', 'HORSCH')
        THEN upper(trim(pm.marca::text)) ELSE 'OTROS' END AS marca,
      max(greatest(
        coalesce(osi.fecha_abierta_os, '-infinity'::timestamptz),
        coalesce(osi.fecha_cierre_os, '-infinity'::timestamptz),
        coalesce(osi.fecha_emision_factura, '-infinity'::timestamptz)
      ))::date AS ultima_os
    FROM public.ordenes_servicio_importadas osi
    JOIN public.parque_maquinas pm
      ON public.parque_normalizar_clave(pm.serie) = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN ('ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO')
      AND coalesce(osi.fecha_abierta_os, osi.fecha_cierre_os, osi.fecha_emision_factura) IS NOT NULL
    GROUP BY pm.cliente_id, 2
  ),
  claves AS (
    SELECT cliente_id, marca FROM facturacion_unificada
    UNION
    SELECT cliente_id, marca FROM os_resumen
  )
  SELECT
    c.cliente_id, c.marca, f.ultima_venta_repuestos,
    f.ultimo_servicio_facturado, o.ultima_os, now()
  FROM claves c
  LEFT JOIN facturacion_unificada f USING (cliente_id, marca)
  LEFT JOIN os_resumen o USING (cliente_id, marca);

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.refrescar_parque_ultima_actividad()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refrescar_parque_ultima_actividad()
  TO authenticated;

-- El trigger legacy deja de cachear una fila si la factura nueva ya existe.
CREATE OR REPLACE FUNCTION public.actualizar_parque_actividad_facturacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_marca text;
  v_rubro text;
BEGIN
  IF NEW.cliente_id IS NULL OR coalesce(NEW.excluido_de_reportes, false) THEN RETURN NEW; END IF;

  IF NEW.fecha >= date '2026-07-01' AND EXISTS (
    SELECT 1
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND public.parque_normalizar_clave(NEW.cod_factura) <> ''
      AND public.parque_normalizar_clave(NEW.cod_factura) IN (
        public.parque_normalizar_clave(fl.factura),
        public.parque_normalizar_clave(fl.codigo_interno_factura)
      )
  ) THEN
    RETURN NEW;
  END IF;

  v_marca := coalesce(
    nullif(upper(trim(to_jsonb(NEW) ->> 'marca_normalizada')), ''),
    CASE
      WHEN upper(trim(coalesce(NEW.grupo, ''))) LIKE '%CLAAS%' THEN 'CLAAS'
      WHEN upper(trim(coalesce(NEW.grupo, ''))) LIKE '%HORSCH%'
        OR upper(trim(coalesce(NEW.grupo, ''))) IN ('REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS') THEN 'HORSCH'
      ELSE 'OTROS'
    END
  );
  v_rubro := lower(trim(coalesce(NEW.grupo_fx, '')));

  IF v_rubro NOT IN ('repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje') THEN RETURN NEW; END IF;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_venta_repuestos,
    ultimo_servicio_facturado, actualizado_en
  ) VALUES (
    NEW.cliente_id,
    v_marca,
    CASE WHEN v_rubro IN ('repuesto', 'repuestos') THEN NEW.fecha END,
    CASE WHEN v_rubro IN ('mano de obra', 'servicio', 'servicios', 'kilometraje') THEN NEW.fecha END,
    now()
  )
  ON CONFLICT (cliente_id, marca) DO UPDATE SET
    ultima_venta_repuestos = greatest(parque_ultima_actividad.ultima_venta_repuestos, excluded.ultima_venta_repuestos),
    ultimo_servicio_facturado = greatest(parque_ultima_actividad.ultimo_servicio_facturado, excluded.ultimo_servicio_facturado),
    actualizado_en = now();

  RETURN NEW;
END;
$$;

-- Actualizacion puntual y rapida de la cache para los fallback ya cargados.
INSERT INTO public.parque_ultima_actividad (
  cliente_id, marca, ultima_venta_repuestos,
  ultimo_servicio_facturado, actualizado_en
)
SELECT
  cliente_id,
  marca,
  max(fecha) FILTER (WHERE rubro = 'REPUESTOS'),
  max(fecha) FILTER (WHERE rubro IN ('SERVICIO', 'KILOMETRAJE')),
  now()
FROM public.parque_facturacion_legacy_fallback_rango(
  date '2026-07-01', date '9999-12-31'
)
GROUP BY cliente_id, marca
ON CONFLICT (cliente_id, marca) DO UPDATE SET
  ultima_venta_repuestos = greatest(
    parque_ultima_actividad.ultima_venta_repuestos,
    excluded.ultima_venta_repuestos
  ),
  ultimo_servicio_facturado = greatest(
    parque_ultima_actividad.ultimo_servicio_facturado,
    excluded.ultimo_servicio_facturado
  ),
  actualizado_en = now();

-- ---------------------------------------------------------------------
-- Seguridad de la tabla tecnica factura -> cliente.
-- ---------------------------------------------------------------------

ALTER TABLE public.parque_factura_os_cliente ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.parque_factura_os_cliente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.parque_factura_os_cliente TO authenticated;

DROP POLICY IF EXISTS parque_factura_os_cliente_select ON public.parque_factura_os_cliente;
CREATE POLICY parque_factura_os_cliente_select
ON public.parque_factura_os_cliente
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.has_module_access(auth.uid(), 'parque')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
);

CREATE OR REPLACE FUNCTION public.parque_refrescar_factura_os_cliente()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar la atribucion de facturas'
      USING ERRCODE = '42501';
  END IF;

  TRUNCATE public.parque_factura_os_cliente;

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

REVOKE ALL ON FUNCTION public.parque_refrescar_factura_os_cliente()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_refrescar_factura_os_cliente()
  TO authenticated;

-- ---------------------------------------------------------------------
-- Superadministrador: el frontend no es la unica barrera.
-- SQL Editor/service_role puede seguir administrando la cuenta de
-- emergencia, pero una sesion normal no puede crear, quitar ni degradar
-- el rol ni desactivar/desvincular su perfil.
-- ---------------------------------------------------------------------

-- Superadmin implica admin en todas las politicas y funciones historicas
-- que ya consultan has_role(..., 'admin'). Asi no depende de conservar dos
-- filas de rol paralelas para que la base y el frontend coincidan.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE (
        ur.role = _role
        OR (
          _role = 'admin'::public.app_role
          AND ur.role = 'superadmin'::public.app_role
        )
      )
      AND (
        ur.user_id = _user_id
        OR ur.user_id IN (
          SELECT p.id
          FROM public.profiles p
          WHERE p.auth_user_id = _user_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.proteger_rol_superadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
    AND NEW.role = 'superadmin'::public.app_role THEN
    RAISE EXCEPTION 'El rol superadministrador no se asigna desde la aplicacion'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'superadmin'::public.app_role THEN
    RAISE EXCEPTION 'El rol superadministrador esta protegido'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_rol_superadmin_trigger ON public.user_roles;
CREATE TRIGGER proteger_rol_superadmin_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_superadmin();

CREATE OR REPLACE FUNCTION public.proteger_perfil_superadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_auth_user_id := coalesce(OLD.auth_user_id, OLD.id);
  IF public.has_role(v_auth_user_id, 'superadmin'::public.app_role) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'El perfil superadministrador esta protegido'
        USING ERRCODE = '42501';
    END IF;

    IF coalesce(NEW.activo, false) = false
      OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
      RAISE EXCEPTION 'El perfil superadministrador esta protegido'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_perfil_superadmin_trigger ON public.profiles;
CREATE TRIGGER proteger_perfil_superadmin_trigger
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_superadmin();

NOTIFY pgrst, 'reload schema';
