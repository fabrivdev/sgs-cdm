-- Cache derivada de ultima actividad. Las fuentes de verdad siguen siendo
-- facturacion, ordenes_servicio_importadas y parque_maquinas.

-- La reconstruccion historica ocurre una sola vez durante esta migracion.
-- No debe heredar el limite corto usado por las consultas interactivas.
SET LOCAL statement_timeout = '0';

CREATE TABLE IF NOT EXISTS public.parque_ultima_actividad (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  marca text NOT NULL DEFAULT 'OTROS' CHECK (marca IN ('CLAAS', 'HORSCH', 'OTROS')),
  ultima_venta_repuestos date,
  ultimo_servicio_facturado date,
  ultima_os date,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, marca)
);

CREATE INDEX IF NOT EXISTS idx_parque_ultima_actividad_cliente
  ON public.parque_ultima_actividad (cliente_id);

ALTER TABLE public.parque_ultima_actividad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parque ultima actividad select" ON public.parque_ultima_actividad;
CREATE POLICY "Parque ultima actividad select"
  ON public.parque_ultima_actividad FOR SELECT TO authenticated
  USING (
    public.has_module_access(auth.uid(), 'parque')
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gerencia'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.parque_maquinas pm
        WHERE pm.cliente_id = parque_ultima_actividad.cliente_id
          AND pm.activo = true
          AND (pm.sucursal IS NULL OR pm.sucursal = public.get_user_sucursal(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Parque ultima actividad admin manage" ON public.parque_ultima_actividad;
CREATE POLICY "Parque ultima actividad admin manage"
  ON public.parque_ultima_actividad FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

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
  IF auth.uid() IS NOT NULL
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
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
        WHEN upper(trim(coalesce(f.marca_normalizada::text, ''))) IN ('CLAAS', 'HORSCH')
          THEN upper(trim(f.marca_normalizada::text))
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
      AND lower(trim(coalesce(f.grupo_fx, ''))) IN (
        'repuesto', 'repuestos', 'mano de obra', 'servicio', 'servicios', 'kilometraje'
      )
    GROUP BY f.cliente_id, 2
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
    SELECT cliente_id, marca FROM facturacion_resumen
    UNION
    SELECT cliente_id, marca FROM os_resumen
  )
  SELECT
    c.cliente_id, c.marca, f.ultima_venta_repuestos,
    f.ultimo_servicio_facturado, o.ultima_os, now()
  FROM claves c
  LEFT JOIN facturacion_resumen f USING (cliente_id, marca)
  LEFT JOIN os_resumen o USING (cliente_id, marca);

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas()
RETURNS TABLE (cliente_id uuid, ult_repuesto date, ult_servicio date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    a.cliente_id,
    max(a.ultima_venta_repuestos),
    greatest(max(a.ultimo_servicio_facturado), max(a.ultima_os))
  FROM public.parque_ultima_actividad a
  GROUP BY a.cliente_id;
$$;

CREATE OR REPLACE FUNCTION public.parque_ultimas_facturas_marca(p_marca text)
RETURNS TABLE (cliente_id uuid, ult_repuesto date, ult_servicio date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    a.cliente_id,
    max(a.ultima_venta_repuestos),
    greatest(max(a.ultimo_servicio_facturado), max(a.ultima_os))
  FROM public.parque_ultima_actividad a
  WHERE CASE
    WHEN upper(trim(coalesce(p_marca, ''))) IN ('', 'ALL', 'TODOS') THEN true
    WHEN upper(trim(p_marca)) IN ('AMBAS', 'C/AMBAS') THEN a.marca IN ('CLAAS', 'HORSCH')
    ELSE a.marca = upper(trim(p_marca))
  END
  GROUP BY a.cliente_id;
$$;

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
  IF NEW.cliente_id IS NULL OR coalesce(NEW.excluido_de_reportes, false) THEN
    RETURN NEW;
  END IF;

  v_marca := CASE
    WHEN upper(trim(coalesce(NEW.marca_normalizada::text, ''))) IN ('CLAAS', 'HORSCH')
      THEN upper(trim(NEW.marca_normalizada::text))
    WHEN upper(trim(coalesce(NEW.grupo, ''))) IN (
      'SERVICE - CLAAS', 'REPUESTOS - CLAAS', 'REPUESTOS CLAAS - PROMOCION',
      'REPUESTOS - CABEZALES/PLATAFOR', 'REPUESTOS TRACTOR', 'REPUESTOS DIVERSOS --'
    ) THEN 'CLAAS'
    WHEN upper(trim(coalesce(NEW.grupo, ''))) IN (
      'SERVICE - HORSCH', 'REPUESTOS PLANTADORA', 'REPUESTOS PULVERIZADORAS'
    ) THEN 'HORSCH'
    ELSE 'OTROS'
  END;
  v_rubro := lower(trim(coalesce(NEW.grupo_fx, '')));

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
    CASE WHEN v_rubro IN ('repuesto', 'repuestos') THEN NEW.fecha ELSE NULL END,
    CASE WHEN v_rubro IN ('mano de obra', 'servicio', 'servicios', 'kilometraje')
      THEN NEW.fecha ELSE NULL END,
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

CREATE OR REPLACE FUNCTION public.actualizar_parque_actividad_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fecha date;
  v_cliente_id uuid;
  v_marca text;
BEGIN
  IF public.parque_normalizar_clave(NEW.nro_chasis) = ''
    OR public.parque_normalizar_clave(NEW.situacion_os) IN (
      'ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'
    )
  THEN
    RETURN NEW;
  END IF;

  v_fecha := greatest(
    coalesce(NEW.fecha_abierta_os, '-infinity'::timestamptz),
    coalesce(NEW.fecha_cierre_os, '-infinity'::timestamptz),
    coalesce(NEW.fecha_emision_factura, '-infinity'::timestamptz)
  )::date;
  IF v_fecha IS NULL OR v_fecha = '-infinity'::date THEN RETURN NEW; END IF;

  SELECT
    pm.cliente_id,
    CASE WHEN upper(trim(pm.marca::text)) IN ('CLAAS', 'HORSCH')
      THEN upper(trim(pm.marca::text)) ELSE 'OTROS' END
  INTO v_cliente_id, v_marca
  FROM public.parque_maquinas pm
  WHERE pm.activo = true
    AND pm.cliente_id IS NOT NULL
    AND public.parque_normalizar_clave(pm.serie)
      = public.parque_normalizar_clave(NEW.nro_chasis)
  ORDER BY pm.actualizado_en DESC NULLS LAST
  LIMIT 1;

  IF v_cliente_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.parque_ultima_actividad (
    cliente_id, marca, ultima_os, actualizado_en
  ) VALUES (v_cliente_id, v_marca, v_fecha, now())
  ON CONFLICT (cliente_id, marca) DO UPDATE SET
    ultima_os = greatest(parque_ultima_actividad.ultima_os, excluded.ultima_os),
    actualizado_en = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actualizar_parque_actividad_facturacion_trigger
  ON public.facturacion;
CREATE TRIGGER actualizar_parque_actividad_facturacion_trigger
AFTER INSERT OR UPDATE OF cliente_id, fecha, grupo, grupo_fx, marca_normalizada, excluido_de_reportes
ON public.facturacion
FOR EACH ROW EXECUTE FUNCTION public.actualizar_parque_actividad_facturacion();

DROP TRIGGER IF EXISTS actualizar_parque_actividad_os_trigger
  ON public.ordenes_servicio_importadas;
CREATE TRIGGER actualizar_parque_actividad_os_trigger
AFTER INSERT OR UPDATE OF nro_chasis, situacion_os, fecha_abierta_os, fecha_cierre_os, fecha_emision_factura
ON public.ordenes_servicio_importadas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_parque_actividad_os();

REVOKE ALL ON FUNCTION public.refrescar_parque_ultima_actividad() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refrescar_parque_ultima_actividad() TO authenticated;
REVOKE ALL ON FUNCTION public.parque_ultimas_facturas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parque_ultimas_facturas_marca(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_ultimas_facturas_marca(text) TO authenticated;

SELECT public.refrescar_parque_ultima_actividad();
NOTIFY pgrst, 'reload schema';
