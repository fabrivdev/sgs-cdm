-- Evita falsas transferencias cuando Facturacion y Parque apuntan a filas
-- distintas del maestro pero representan al mismo cliente. No modifica la
-- propiedad ni fusiona clientes: solamente suprime el aviso ambiguo.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_cliente_notificacion(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(
    regexp_replace(
      translate(
        upper(coalesce(btrim(p_nombre), '')),
        'ÁÉÍÓÚÜÑ',
        'AEIOUUN'
      ),
      '[^A-Z0-9]',
      '',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.notificacion_venta_mismo_cliente(
  p_parque_maquina_id text,
  p_cliente_facturado_id text,
  p_cliente_facturado_nombre text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parque_cliente_id uuid;
  v_parque_nombre text;
  v_parque_ruc text;
  v_facturado_cliente_id uuid;
  v_facturado_nombre text;
  v_facturado_ruc text;
  v_parque_nombre_norm text;
  v_facturado_nombre_norm text;
  v_parque_ruc_norm text;
  v_facturado_ruc_norm text;
BEGIN
  SELECT
    pm.cliente_id,
    cp.nombre,
    cp.ruc,
    cf.id,
    coalesce(nullif(btrim(cf.nombre), ''), nullif(btrim(p_cliente_facturado_nombre), '')),
    cf.ruc
  INTO
    v_parque_cliente_id,
    v_parque_nombre,
    v_parque_ruc,
    v_facturado_cliente_id,
    v_facturado_nombre,
    v_facturado_ruc
  FROM public.parque_maquinas pm
  LEFT JOIN public.clientes cp ON cp.id = pm.cliente_id
  LEFT JOIN public.clientes cf ON cf.id::text = nullif(btrim(p_cliente_facturado_id), '')
  WHERE pm.id::text = nullif(btrim(p_parque_maquina_id), '')
  LIMIT 1;

  IF NOT FOUND OR v_parque_cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_facturado_cliente_id IS NOT NULL
     AND v_parque_cliente_id = v_facturado_cliente_id THEN
    RETURN true;
  END IF;

  v_parque_ruc_norm := public.normalizar_cliente_notificacion(v_parque_ruc);
  v_facturado_ruc_norm := public.normalizar_cliente_notificacion(v_facturado_ruc);

  -- Dos RUC informados y distintos son evidencia suficiente de clientes
  -- diferentes, aunque el texto visible del nombre coincida.
  IF v_parque_ruc_norm IS NOT NULL AND v_facturado_ruc_norm IS NOT NULL THEN
    RETURN v_parque_ruc_norm = v_facturado_ruc_norm;
  END IF;

  v_parque_nombre_norm := public.normalizar_cliente_notificacion(v_parque_nombre);
  v_facturado_nombre_norm := public.normalizar_cliente_notificacion(v_facturado_nombre);

  RETURN v_parque_nombre_norm IS NOT NULL
    AND v_parque_nombre_norm = v_facturado_nombre_norm;
END;
$$;

CREATE OR REPLACE FUNCTION public.suprimir_transferencia_mismo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo <> 'venta_maquina_reingreso'
     OR NEW.estado <> 'pendiente'
     OR coalesce(NEW.datos ->> 'revision_sugerida', '') <> 'TRANSFERENCIA'
     OR nullif(NEW.datos ->> 'nc_linea_id', '') IS NOT NULL
     OR nullif(NEW.datos ->> 'nc_documento', '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.notificacion_venta_mismo_cliente(
    NEW.datos ->> 'parque_maquina_id',
    NEW.datos ->> 'cliente_id',
    NEW.datos ->> 'cliente_nombre'
  ) THEN
    RETURN NEW;
  END IF;

  -- Una insercion nueva se cancela. Si la misma clave ya existia y el
  -- generador intenta actualizarla, se conserva como auditoria descartada.
  IF TG_OP = 'INSERT' THEN
    RETURN NULL;
  END IF;

  NEW.estado := 'descartada';
  NEW.accionada_en := coalesce(NEW.accionada_en, now());
  NEW.actualizado_en := now();
  NEW.datos := coalesce(NEW.datos, '{}'::jsonb) || jsonb_build_object(
    'resolucion', 'mismo_cliente_canonico',
    'descartada_automaticamente', true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suprimir_transferencia_mismo_cliente_trigger
  ON public.notificaciones;
CREATE TRIGGER suprimir_transferencia_mismo_cliente_trigger
BEFORE INSERT OR UPDATE ON public.notificaciones
FOR EACH ROW
EXECUTE FUNCTION public.suprimir_transferencia_mismo_cliente();

-- Cierra los falsos positivos que ya estaban visibles. No confirma ventas,
-- no transfiere propiedad y no modifica Parque ni Stock.
UPDATE public.notificaciones n
SET estado = 'descartada',
    accionada_en = coalesce(n.accionada_en, now()),
    actualizado_en = now(),
    datos = coalesce(n.datos, '{}'::jsonb) || jsonb_build_object(
      'resolucion', 'mismo_cliente_canonico',
      'descartada_automaticamente', true
    )
WHERE n.tipo = 'venta_maquina_reingreso'
  AND n.estado = 'pendiente'
  AND coalesce(n.datos ->> 'revision_sugerida', '') = 'TRANSFERENCIA'
  AND nullif(n.datos ->> 'nc_linea_id', '') IS NULL
  AND nullif(n.datos ->> 'nc_documento', '') IS NULL
  AND public.notificacion_venta_mismo_cliente(
    n.datos ->> 'parque_maquina_id',
    n.datos ->> 'cliente_id',
    n.datos ->> 'cliente_nombre'
  );

REVOKE ALL ON FUNCTION public.normalizar_cliente_notificacion(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notificacion_venta_mismo_cliente(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suprimir_transferencia_mismo_cliente() FROM PUBLIC;

COMMENT ON FUNCTION public.notificacion_venta_mismo_cliente(text, text, text)
IS 'Reconcilia de forma conservadora el cliente facturado y el propietario actual: ID o RUC coincidente; si falta RUC, nombre normalizado coincidente.';

NOTIFY pgrst, 'reload schema';

COMMIT;
