DO $$
DECLARE
  v_servicios_cantidad numeric;
  v_km_cantidad numeric;
  v_raw_data jsonb;
  v_totales_por_tecnico jsonb;
  v_correction_key constant text := 'intercambio_servicio_km_os_6137';
BEGIN
  SELECT
    servicios_cantidad,
    km_cantidad,
    COALESCE(raw_data, '{}'::jsonb)
  INTO
    v_servicios_cantidad,
    v_km_cantidad,
    v_raw_data
  FROM public.ordenes_servicio_importadas
  WHERE os_numero = '6137'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'No se encontro la OS historica 6137; no se aplicaron cambios.';
    RETURN;
  END IF;

  IF COALESCE(v_raw_data->'correcciones_manuales', '{}'::jsonb) ? v_correction_key THEN
    RAISE NOTICE 'La correccion de cantidades de la OS 6137 ya fue aplicada.';
    RETURN;
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      technician_name,
      CASE
        WHEN jsonb_typeof(technician_totals) = 'object' THEN
          (technician_totals - 'horas' - 'kilometros')
          || jsonb_build_object(
            'horas', technician_totals->'kilometros',
            'kilometros', technician_totals->'horas'
          )
        ELSE technician_totals
      END
    ),
    '{}'::jsonb
  )
  INTO v_totales_por_tecnico
  FROM jsonb_each(COALESCE(v_raw_data->'totales_por_tecnico', '{}'::jsonb))
    AS technician(technician_name, technician_totals);

  UPDATE public.ordenes_servicio_importadas
  SET
    servicios_cantidad = v_km_cantidad,
    km_cantidad = v_servicios_cantidad,
    raw_data =
      (v_raw_data - 'totales_por_tecnico' - 'correcciones_manuales')
      || jsonb_build_object(
        'totales_por_tecnico', v_totales_por_tecnico,
        'correcciones_manuales',
          COALESCE(v_raw_data->'correcciones_manuales', '{}'::jsonb)
          || jsonb_build_object(
            v_correction_key,
            jsonb_build_object(
              'aplicada_en', clock_timestamp(),
              'motivo', 'Las cantidades historicas de servicio y kilometraje estaban invertidas.',
              'servicios_cantidad_anterior', v_servicios_cantidad,
              'km_cantidad_anterior', v_km_cantidad,
              'servicios_cantidad_corregida', v_km_cantidad,
              'km_cantidad_corregida', v_servicios_cantidad
            )
          )
      ),
    actualizado_en = now()
  WHERE os_numero = '6137';
END;
$$;
