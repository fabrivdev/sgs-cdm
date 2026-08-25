-- Corrige la deteccion de chasis en ventas de maquinas.
-- En descripciones estructuradas, CASIS/CHASIS identifica el chasis real;
-- SERIE puede contener una referencia comercial (por ejemplo FE01).

CREATE OR REPLACE FUNCTION public.extraer_chasis_venta_maquina(
  p_texto text,
  p_raw_data jsonb,
  p_os_numero text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chasis text;
  v_match text[];
BEGIN
  -- La descripcion facturada es la fuente prioritaria. Se busca CASIS/CHASIS
  -- antes que cualquier SERIE porque esta ultima no siempre es el chasis.
  v_match := regexp_match(
    coalesce(p_texto, ''),
    '(?i)(?:CHASIS|CASIS)[[:space:]]*:[[:space:]]*([A-Z0-9._/-]+)'
  );
  v_chasis := v_match[1];

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL THEN
    v_chasis := public.valor_json_insensible(
      p_raw_data,
      ARRAY['CHASIS', 'CASIS', 'NRO CHASIS']
    );
  END IF;

  -- SERIE queda solo como respaldo cuando no existe CASIS/CHASIS.
  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL THEN
    v_match := regexp_match(
      coalesce(p_texto, ''),
      '(?i)(?:NRO[[:space:]]+)?SERIE[[:space:]]*:[[:space:]]*([A-Z0-9._/-]+)'
    );
    v_chasis := v_match[1];
  END IF;

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL THEN
    v_chasis := public.valor_json_insensible(
      p_raw_data,
      ARRAY['NRO SERIE', 'SERIE']
    );
  END IF;

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL
     AND nullif(btrim(p_os_numero), '') IS NOT NULL THEN
    SELECT osi.nro_chasis
    INTO v_chasis
    FROM public.ordenes_servicio_importadas osi
    WHERE osi.os_numero = p_os_numero
      AND public.normalizar_chasis_notificacion(osi.nro_chasis) IS NOT NULL
    ORDER BY osi.actualizado_en DESC NULLS LAST, osi.importado_en DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN NULLIF(btrim(v_chasis), '');
END;
$$;

-- Revisa los avisos pendientes creados con la prioridad anterior:
-- 1. si el chasis correcto ya existe, resuelve el aviso;
-- 2. si cambio el chasis y no existe, reemplaza el aviso por uno corregido;
-- 3. si ya era correcto, conserva el aviso pendiente.
DO $$
DECLARE
  v_alerta record;
  v_linea public.facturacion_lineas_importadas%ROWTYPE;
  v_texto text;
  v_os_numero text;
  v_chasis text;
  v_chasis_norm text;
  v_chasis_anterior_norm text;
  v_maquina_id uuid;
BEGIN
  FOR v_alerta IN
    SELECT id, datos
    FROM public.notificaciones
    WHERE tipo = 'venta_maquina_sin_parque'
      AND estado = 'pendiente'
  LOOP
    SELECT *
    INTO v_linea
    FROM public.facturacion_lineas_importadas
    WHERE id::text = v_alerta.datos ->> 'facturacion_linea_id'
    LIMIT 1;

    IF v_linea.id IS NULL THEN
      UPDATE public.notificaciones
      SET estado = 'descartada',
          accionada_en = now(),
          actualizado_en = now(),
          datos = datos || jsonb_build_object(
            'motivo_resolucion', 'linea_facturada_no_encontrada'
          )
      WHERE id = v_alerta.id;
      CONTINUE;
    END IF;

    v_texto := concat_ws(' | ', v_linea.mercaderia, v_linea.observacion, v_linea.subgrupo_original);
    v_os_numero := nullif(v_linea.raw_data ->> 'linked_service_order', '');
    v_chasis := public.extraer_chasis_venta_maquina(v_texto, v_linea.raw_data, v_os_numero);
    v_chasis_norm := public.normalizar_chasis_notificacion(v_chasis);
    v_chasis_anterior_norm := public.normalizar_chasis_notificacion(v_alerta.datos ->> 'chasis');

    IF v_chasis_norm IS NULL THEN
      UPDATE public.notificaciones
      SET estado = 'descartada',
          accionada_en = now(),
          actualizado_en = now(),
          datos = datos || jsonb_build_object(
            'motivo_resolucion', 'chasis_no_identificable'
          )
      WHERE id = v_alerta.id;
      CONTINUE;
    END IF;

    SELECT pm.id
    INTO v_maquina_id
    FROM public.parque_maquinas pm
    WHERE public.normalizar_chasis_notificacion(pm.serie) = v_chasis_norm
    LIMIT 1;

    IF v_maquina_id IS NOT NULL THEN
      UPDATE public.notificaciones
      SET estado = 'confirmada',
          accionada_en = now(),
          actualizado_en = now(),
          datos = datos || jsonb_build_object(
            'chasis', v_chasis,
            'maquina_id', v_maquina_id,
            'motivo_resolucion', 'maquina_ya_existente_en_parque'
          )
      WHERE id = v_alerta.id;
    ELSIF v_chasis_anterior_norm IS DISTINCT FROM v_chasis_norm THEN
      UPDATE public.notificaciones
      SET estado = 'descartada',
          accionada_en = now(),
          actualizado_en = now(),
          datos = datos || jsonb_build_object(
            'chasis_corregido', v_chasis,
            'motivo_resolucion', 'aviso_recalculado_por_chasis'
          )
      WHERE id = v_alerta.id;

      PERFORM public.generar_notificacion_venta_maquina(v_linea.id);
    ELSE
      UPDATE public.notificaciones
      SET datos = datos || jsonb_build_object('chasis', v_chasis),
          actualizado_en = now()
      WHERE id = v_alerta.id;
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
