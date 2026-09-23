-- Future machine-sale notifications inherit the seller carried by the
-- canonical invoice line. Existing notifications and Park rows are not
-- backfilled by this migration.

CREATE OR REPLACE FUNCTION public.completar_vendedor_notificacion_venta_maquina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendedor text;
BEGIN
  IF NEW.tipo NOT IN ('venta_maquina_sin_parque', 'venta_maquina_reingreso')
     OR nullif(btrim(coalesce(NEW.datos ->> 'vendedor', '')), '') IS NOT NULL
     OR nullif(NEW.datos ->> 'facturacion_linea_id', '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(btrim(f.vendedor), '')
  INTO v_vendedor
  FROM public.facturacion_lineas_importadas f
  WHERE f.id::text = NEW.datos ->> 'facturacion_linea_id';

  IF v_vendedor IS NOT NULL THEN
    NEW.datos := coalesce(NEW.datos, '{}'::jsonb)
      || jsonb_build_object('vendedor', v_vendedor);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS completar_vendedor_notificacion_venta_maquina_trigger
  ON public.notificaciones;
CREATE TRIGGER completar_vendedor_notificacion_venta_maquina_trigger
BEFORE INSERT OR UPDATE OF datos ON public.notificaciones
FOR EACH ROW
EXECUTE FUNCTION public.completar_vendedor_notificacion_venta_maquina();
