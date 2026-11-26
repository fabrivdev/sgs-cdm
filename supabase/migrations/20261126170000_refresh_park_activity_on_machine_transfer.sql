BEGIN;

-- Rebuild only the OS date. Fiscal activity stays with the invoiced customer.
CREATE OR REPLACE FUNCTION public.parque_recalcular_ultima_os(p_clientes uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Serialize with the full activity refresh performed by the import flows.
  LOCK TABLE public.parque_ultima_actividad IN SHARE ROW EXCLUSIVE MODE;

  WITH actividad AS (
    SELECT
      pm.cliente_id,
      CASE WHEN upper(trim(pm.marca::text)) IN ('CLAAS', 'HORSCH')
        THEN upper(trim(pm.marca::text)) ELSE 'OTROS' END AS marca,
      max(greatest(osi.fecha_abierta_os, osi.fecha_cierre_os, osi.fecha_emision_factura))::date AS ultima_os
    FROM public.parque_maquinas pm
    JOIN public.ordenes_servicio_importadas osi
      ON public.parque_normalizar_clave(osi.nro_chasis) = public.parque_normalizar_clave(pm.serie)
    WHERE pm.activo = true
      AND pm.cliente_id IS NOT NULL
      AND (p_clientes IS NULL OR pm.cliente_id = ANY(p_clientes))
      AND public.parque_normalizar_clave(pm.serie) <> ''
      AND public.parque_normalizar_clave(osi.nro_chasis) <> ''
      AND public.parque_normalizar_clave(osi.situacion_os) NOT IN ('ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO')
      AND coalesce(osi.fecha_abierta_os, osi.fecha_cierre_os, osi.fecha_emision_factura) IS NOT NULL
    GROUP BY pm.cliente_id, 2
  ), claves AS (
    SELECT cliente_id, marca FROM actividad
    UNION
    SELECT cliente_id, marca FROM public.parque_ultima_actividad
    WHERE ultima_os IS NOT NULL AND (p_clientes IS NULL OR cliente_id = ANY(p_clientes))
  )
  INSERT INTO public.parque_ultima_actividad AS resumen (cliente_id, marca, ultima_os)
  SELECT claves.cliente_id, claves.marca, actividad.ultima_os
  FROM claves
  LEFT JOIN actividad USING (cliente_id, marca)
  ON CONFLICT (cliente_id, marca) DO UPDATE
  SET ultima_os = EXCLUDED.ultima_os, actualizado_en = now()
  WHERE resumen.ultima_os IS DISTINCT FROM EXCLUDED.ultima_os;
END;
$$;

CREATE OR REPLACE FUNCTION public.parque_actualizar_actividad_por_cambio_maquina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  clientes uuid[];
BEGIN
  SELECT array_agg(DISTINCT afectados.cliente_id) FILTER (WHERE afectados.cliente_id IS NOT NULL)
  INTO clientes
  FROM maquinas_antes anterior
  JOIN maquinas_despues actual USING (id)
  CROSS JOIN LATERAL (VALUES (anterior.cliente_id), (actual.cliente_id)) afectados(cliente_id)
  WHERE ROW(anterior.cliente_id, anterior.activo, anterior.serie, anterior.marca)
    IS DISTINCT FROM ROW(actual.cliente_id, actual.activo, actual.serie, actual.marca);

  IF clientes IS NOT NULL THEN
    PERFORM public.parque_recalcular_ultima_os(clientes);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.parque_recalcular_ultima_os(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parque_actualizar_actividad_por_cambio_maquina() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS parque_actividad_por_cambio_maquina ON public.parque_maquinas;
CREATE TRIGGER parque_actividad_por_cambio_maquina
AFTER UPDATE ON public.parque_maquinas
REFERENCING OLD TABLE AS maquinas_antes NEW TABLE AS maquinas_despues
FOR EACH STATEMENT
EXECUTE FUNCTION public.parque_actualizar_actividad_por_cambio_maquina();

-- Correct transfers made before the trigger was installed.
SELECT public.parque_recalcular_ultima_os(NULL);

COMMIT;
