-- Migracion B (segunda de dos, requiere que 20260818120000_... ya haya
-- corrido y dejado cliente_id resuelto en facturacion_lineas_importadas).
--
-- Corrige los dos bugs de Parque/Clientes:
-- 1. parque_resumen_facturacion (la vista SIN filtros de marca/rubro, la
--    que se ve al abrir la pantalla) solo sumaba public.facturacion.
--    Ahora suma tambien facturacion_lineas_importadas (sistema nuevo,
--    fecha_factura >= 2026-07-01) usando la columna cliente_id que dejo
--    lista la Migracion A -- sin recalcular atribucion por chasis en cada
--    apertura de pantalla, por eso sigue siendo rapida.
-- 2. refrescar_parque_ultima_actividad() solo miraba public.facturacion
--    para "ultima venta/servicio", nunca facturacion_lineas_importadas.
--    Se agrega esa fuente al calculo, y un segundo trigger AFTER
--    INSERT/UPDATE en facturacion_lineas_importadas (espejo del que ya
--    existe sobre facturacion) para que la cache se actualice sola cuando
--    entra una factura nueva del sistema nuevo, sin esperar un refresh
--    manual.
--
-- El corte 2026-07-01 (viejo=facturacion, nuevo=facturacion_lineas_
-- importadas) es la misma convencion que ya usa parque_facturacion_
-- atribuida_rango y repuestos_publicar_facturacion_historica -- se reusa
-- tal cual para no duplicar facturas entre las dos fuentes.
--
-- IMPORTANTE -- paso manual despues de aplicar esta migracion:
-- refrescar_parque_ultima_actividad() exige un usuario admin autenticado
-- (auth.uid() IS NOT NULL) desde el arreglo de seguridad del 17/08. Una
-- migracion corrida desde el SQL Editor no tiene sesion, asi que llamarla
-- aca adentro fallaria con "Solo un administrador puede...". Por eso esta
-- migracion NO la llama sola. Despues de aplicarla, refresca la cache vos
-- mismo desde una sesion autenticada real: logueado como admin en la app,
-- abri la consola del navegador en cualquier pantalla y corre:
--   await window.supabase?.rpc('refrescar_parque_ultima_actividad')
-- (o el metodo que uses para acceder al cliente de supabase en consola).
-- Si no tenes esa referencia a mano, decime y te doy otra forma.

-- =====================================================================
-- 1. parque_resumen_facturacion: suma facturacion (< corte) +
--    facturacion_lineas_importadas (>= corte) por cliente, antes de
--    unir con la actividad de OS. Mismo shape de salida que antes.
-- =====================================================================

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
  WITH viejo AS (
    SELECT
      f.cliente_id,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_desde AND p_hasta
      ), 0) AS fact_actual,
      coalesce(sum(f.total_venta) FILTER (
        WHERE f.fecha BETWEEN p_prev_desde AND p_prev_hasta
      ), 0) AS fact_prev,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos')
      ), false) AS tiene_rep,
      coalesce(bool_or(
        f.fecha BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ), false) AS tiene_srv
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND f.fecha < date '2026-07-01'
      AND (
        f.fecha BETWEEN p_desde AND p_hasta
        OR f.fecha BETWEEN p_prev_desde AND p_prev_hasta
      )
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id
  ),
  nuevo AS (
    SELECT
      fl.cliente_id,
      coalesce(sum(fl.total_venta) FILTER (
        WHERE fl.fecha_factura::date BETWEEN p_desde AND p_hasta
      ), 0) AS fact_actual,
      coalesce(sum(fl.total_venta) FILTER (
        WHERE fl.fecha_factura::date BETWEEN p_prev_desde AND p_prev_hasta
      ), 0) AS fact_prev,
      coalesce(bool_or(
        fl.fecha_factura::date BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('repuesto', 'repuestos')
      ), false) AS tiene_rep,
      coalesce(bool_or(
        fl.fecha_factura::date BETWEEN p_desde AND p_hasta
        AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ), false) AS tiene_srv
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND (
        fl.fecha_factura::date BETWEEN p_desde AND p_hasta
        OR fl.fecha_factura::date BETWEEN p_prev_desde AND p_prev_hasta
      )
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY fl.cliente_id
  ),
  facturacion AS (
    SELECT
      cliente_id,
      sum(fact_actual) AS fact_actual,
      sum(fact_prev) AS fact_prev,
      bool_or(tiene_rep) AS tiene_rep_rango,
      bool_or(tiene_srv) AS tiene_srv_facturado
    FROM (
      SELECT * FROM viejo
      UNION ALL
      SELECT * FROM nuevo
    ) x
    GROUP BY cliente_id
  ),
  actividad_os AS (
    SELECT DISTINCT a.cliente_id
    FROM public.parque_actividad_os_chasis_rango(p_desde, p_hasta) a
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

REVOKE ALL ON FUNCTION public.parque_resumen_facturacion(
  date, date, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_resumen_facturacion(
  date, date, date, date
) TO authenticated;

-- =====================================================================
-- 2. refrescar_parque_ultima_actividad: agrega facturacion_lineas_
--    resumen (sistema nuevo) y unifica con facturacion_resumen (sistema
--    viejo) tomando la fecha mas reciente entre ambas fuentes por
--    cliente+marca. Guard de admin identico al que ya tiene la funcion
--    desde el arreglo de seguridad del 17/08 -- no se toca.
-- =====================================================================

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
  IF auth.uid() IS NULL
    OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar el resumen del Parque'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.parque_ultima_actividad;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_venta_repuestos,
    ultimo_servicio_facturado, ultima_os, actualizado_en
  )
  WITH facturacion_resumen AS (
    SELECT
      f.cliente_id,
      CASE
          WHEN upper(trim(coalesce(to_jsonb(f) ->> 'marca_normalizada', ''))) IN ('CLAAS', 'HORSCH')
            THEN upper(trim(to_jsonb(f) ->> 'marca_normalizada'))
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - CLAAS', 'REPUESTOS - CLAAS', 'REPUESTOS CLAAS - PROMOCION',
          'REPUESTOS - CABEZALES/PLATAFOR', 'REPUESTOS TRACTOR', 'REPUESTOS DIVERSOS --'
        ) THEN 'CLAAS'
        WHEN upper(trim(coalesce(f.grupo, ''))) IN (
          'SERVICE - HORSCH', 'REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS'
        ) THEN 'HORSCH'
        ELSE 'OTROS'
      END AS marca,
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN ('repuesto', 'repuestos')
      ) AS ultima_venta_repuestos,
      max(f.fecha) FILTER (
        WHERE lower(trim(coalesce(f.grupo_fx, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ) AS ultimo_servicio_facturado
    FROM public.facturacion f
    WHERE f.cliente_id IS NOT NULL
      AND NOT coalesce(f.excluido_de_reportes, false)
      AND f.fecha < date '2026-07-01'
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id, 2
  ),
  facturacion_lineas_resumen AS (
    SELECT
      fl.cliente_id,
      upper(fl.marca_normalizada::text) AS marca,
      max(fl.fecha_factura::date) FILTER (
        WHERE lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN ('repuesto', 'repuestos')
      ) AS ultima_venta_repuestos,
      max(fl.fecha_factura::date) FILTER (
        WHERE lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
          'mano de obra', 'servicio', 'servicios', 'kilometraje'
        )
      ) AS ultimo_servicio_facturado
    FROM public.facturacion_lineas_importadas fl
    WHERE fl.cliente_id IS NOT NULL
      AND fl.fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND lower(trim(coalesce(fl.grupo_normalizado, fl.subgrupo_original, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY fl.cliente_id, 2
  ),
  facturacion_unificada AS (
    SELECT
      cliente_id,
      marca,
      max(ultima_venta_repuestos) AS ultima_venta_repuestos,
      max(ultimo_servicio_facturado) AS ultimo_servicio_facturado
    FROM (
      SELECT * FROM facturacion_resumen
      UNION ALL
      SELECT * FROM facturacion_lineas_resumen
    ) x
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
      ON public.parque_normalizar_clave(pm.serie)
        = public.parque_normalizar_clave(osi.nro_chasis)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN (
        'ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'
      )
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

REVOKE ALL ON FUNCTION public.refrescar_parque_ultima_actividad() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refrescar_parque_ultima_actividad() TO authenticated;

-- =====================================================================
-- 3. Segundo trigger, espejo de actualizar_parque_actividad_facturacion
--    pero para facturacion_lineas_importadas. Usa el cliente_id que ya
--    dejo resuelto la Migracion A -- no repite atribucion por chasis.
--    Filtra por el mismo corte 2026-07-01 para no duplicar contra el
--    trigger existente sobre facturacion.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.actualizar_parque_actividad_facturacion_lineas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_marca text;
  v_rubro text;
BEGIN
  IF NEW.cliente_id IS NULL OR NEW.fecha_factura < timestamptz '2026-07-01 00:00:00+00' THEN
    RETURN NEW;
  END IF;

  v_marca := upper(NEW.marca_normalizada::text);
  v_rubro := lower(trim(coalesce(NEW.grupo_normalizado, NEW.subgrupo_original, '')));

  IF v_rubro NOT IN (
    'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_venta_repuestos,
    ultimo_servicio_facturado, actualizado_en
  ) VALUES (
    NEW.cliente_id,
    v_marca,
    CASE WHEN v_rubro IN ('repuesto', 'repuestos') THEN NEW.fecha_factura::date ELSE NULL END,
    CASE WHEN v_rubro IN ('mano de obra', 'servicio', 'servicios', 'kilometraje')
      THEN NEW.fecha_factura::date ELSE NULL END,
    now()
  )
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actualizar_parque_actividad_facturacion_lineas_trigger
  ON public.facturacion_lineas_importadas;
CREATE TRIGGER actualizar_parque_actividad_facturacion_lineas_trigger
AFTER INSERT OR UPDATE OF cliente_id, fecha_factura, grupo_normalizado, subgrupo_original, marca_normalizada
ON public.facturacion_lineas_importadas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_parque_actividad_facturacion_lineas();

NOTIFY pgrst, 'reload schema';
