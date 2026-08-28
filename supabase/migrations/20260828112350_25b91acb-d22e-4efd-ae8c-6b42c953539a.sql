-- Corrige instalaciones con la funcion de reemplazo ya creada. El proyecto
-- usa safeupdate, que exige una clausula WHERE incluso cuando el reemplazo
-- total es deliberado y se ejecuta dentro de una transaccion atomica.

CREATE OR REPLACE FUNCTION public.parque_reemplazar_stock_maquinas(
  p_carga_id uuid,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fila jsonb;
  v_insertadas integer := 0;
  v_con_chasis integer := 0;
  v_unidad_id uuid;
  v_vinculo_temporal_id bigint;
  v_stock_key text;
  v_chasis_normalizado text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden reemplazar el stock de maquinas'
      USING ERRCODE = '42501';
  END IF;

  IF p_carga_id IS NULL OR jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La carga y las filas de stock son obligatorias';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS maquinaria_stock_vinculos_anteriores (
    id bigserial PRIMARY KEY,
    stock_key text,
    chasis_normalizado text,
    unidad_operacion_id uuid
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.maquinaria_stock_vinculos_anteriores;

  INSERT INTO pg_temp.maquinaria_stock_vinculos_anteriores (
    stock_key, chasis_normalizado, unidad_operacion_id
  )
  SELECT
    s.stock_key,
    public.normalizar_chasis_notificacion(s.chasis),
    s.unidad_operacion_id
  FROM public.parque_stock_maquinas s
  WHERE s.unidad_operacion_id IS NOT NULL;

  DELETE FROM public.parque_stock_maquinas
  WHERE id IS NOT NULL;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    IF nullif(btrim(v_fila->>'producto_codigo'), '') IS NULL THEN
      CONTINUE;
    END IF;

    v_chasis_normalizado := public.normalizar_chasis_notificacion(v_fila->>'chasis');
    v_stock_key := coalesce(
      nullif(btrim(v_fila->>'stock_key'), ''),
      CASE
        WHEN v_chasis_normalizado IS NOT NULL THEN 'CHASIS:' || v_chasis_normalizado
        ELSE concat_ws(':',
          'PRODUCTO',
          public.parque_normalizar_clave(v_fila->>'producto_codigo'),
          public.parque_normalizar_clave(v_fila->>'sucursal'),
          public.parque_normalizar_clave(v_fila->>'deposito'),
          coalesce(v_fila->>'source_row', '0')
        )
      END
    );

    v_unidad_id := NULL;
    v_vinculo_temporal_id := NULL;
    SELECT va.id, va.unidad_operacion_id
      INTO v_vinculo_temporal_id, v_unidad_id
    FROM pg_temp.maquinaria_stock_vinculos_anteriores va
    WHERE va.unidad_operacion_id IS NOT NULL
      AND (
        va.stock_key = v_stock_key
        OR (
          v_chasis_normalizado IS NOT NULL
          AND va.chasis_normalizado = v_chasis_normalizado
        )
      )
    ORDER BY (va.stock_key = v_stock_key) DESC, va.id
    LIMIT 1;

    INSERT INTO public.parque_stock_maquinas (
      producto_codigo, stock_key, source_row, sucursal, filial_original,
      deposito, tipo, marca, modelo, estado, chasis, saldo_actual, carga_id,
      datos_fuente, unidad_operacion_id, importado_en
    ) VALUES (
      btrim(v_fila->>'producto_codigo'), v_stock_key,
      nullif(v_fila->>'source_row', '')::integer,
      nullif(v_fila->>'sucursal', '')::public.sucursal,
      nullif(btrim(v_fila->>'filial_original'), ''),
      nullif(btrim(v_fila->>'deposito'), ''),
      nullif(btrim(v_fila->>'tipo'), ''),
      nullif(btrim(v_fila->>'marca'), ''),
      nullif(btrim(v_fila->>'modelo'), ''),
      CASE WHEN v_fila->>'estado' IN ('Nuevo', 'Usado') THEN v_fila->>'estado' END,
      nullif(btrim(v_fila->>'chasis'), ''),
      coalesce(nullif(v_fila->>'saldo_actual', '')::numeric, 0),
      p_carga_id, coalesce(v_fila->'datos_fuente', '{}'::jsonb),
      v_unidad_id, now()
    );

    IF v_vinculo_temporal_id IS NOT NULL THEN
      UPDATE pg_temp.maquinaria_stock_vinculos_anteriores
      SET unidad_operacion_id = NULL
      WHERE id = v_vinculo_temporal_id;
    END IF;

    v_insertadas := v_insertadas + 1;
    IF v_chasis_normalizado IS NOT NULL THEN
      v_con_chasis := v_con_chasis + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'filas_insertadas', v_insertadas,
    'filas_con_chasis', v_con_chasis,
    'filas_sin_chasis', v_insertadas - v_con_chasis,
    'reservas_conservadas', (
      SELECT count(*) FROM public.parque_stock_maquinas
      WHERE unidad_operacion_id IS NOT NULL
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb)
  TO authenticated;

-- Una maquina OTROS heredada puede seguir corrigiendose si su marca no
-- cambia. Nuevas altas o cambios hacia una marca no admitida siguen bloqueados.
CREATE OR REPLACE FUNCTION public.validar_marca_admitida_parque()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.marca IS NOT DISTINCT FROM OLD.marca THEN
    RETURN NEW;
  END IF;

  IF NOT public.maquinaria_marca_admitida(NEW.marca) THEN
    RAISE EXCEPTION 'La marca % no esta admitida para el parque', NEW.marca
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';