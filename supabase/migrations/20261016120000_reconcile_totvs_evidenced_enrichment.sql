BEGIN;

CREATE OR REPLACE FUNCTION public.facturacion_totvs_preparar_reimportacion(p_guardada jsonb, p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_entrada jsonb := p_entrada;
  v_comparable jsonb := p_guardada;
  v_os_guardada text := nullif(upper(btrim(p_guardada->'raw_data'->>'linked_service_order')), '');
  v_os_entrante text := nullif(upper(btrim(p_entrada->'raw_data'->>'linked_service_order')), '');
  v_os_ausente boolean;
  v_os_igual boolean;
  v_os_completa boolean;
  v_default_cliente boolean;
  v_completar_os boolean;
  v_completar_tiempo boolean;
  v_completar_marca boolean;
  v_normalizar_grupo boolean;
  v_os_compatible boolean;
  v_tiempo_ausente boolean;
  v_marca_ausente boolean;
  v_completar_vendedor boolean;
  v_limpiar_tiempo boolean;
BEGIN
  -- Ausencia exige metadata explicita; una contradiccion o evidencia parcial
  -- nunca se convierte en ausencia para eludir la guarda comercial.
  v_os_ausente := v_os_entrante IS NULL
    AND p_entrada->'raw_data'->>'linked_service_order_evidence' = 'missing'
    AND p_entrada->'raw_data'->'linked_service_order_known_values' = '[]'::jsonb;
  v_os_completa := v_os_entrante IS NOT NULL
    AND p_entrada->'raw_data'->>'linked_service_order_evidence' = 'complete'
    AND jsonb_typeof(p_entrada->'raw_data'->'linked_service_order_known_values') = 'array'
    AND jsonb_array_length(p_entrada->'raw_data'->'linked_service_order_known_values') > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_entrada->'raw_data'->'linked_service_order_known_values') k(os)
      WHERE upper(btrim(k.os)) IS DISTINCT FROM v_os_entrante
    );
  v_os_igual := v_os_guardada IS NOT NULL AND v_os_entrante=v_os_guardada AND v_os_completa;
  v_os_compatible := v_os_guardada IS NOT NULL AND coalesce(v_os_ausente OR v_os_igual, false);
  v_tiempo_ausente := p_entrada->>'tipo_tiempo' IS NULL
    AND p_entrada->'raw_data'->>'canonical_time_type_evidence' = 'missing'
    AND p_entrada->'raw_data'->'canonical_time_type_known_values' = '[]'::jsonb;
  v_marca_ausente := upper(btrim(p_entrada->>'marca_normalizada')) = 'OTROS'
    AND p_entrada->'raw_data'->>'product_brand' IS NULL
    AND p_entrada->'raw_data'->>'product_brand_evidence' = 'missing'
    AND p_entrada->'raw_data'->'product_brand_known_values' = '[]'::jsonb;

  IF v_os_compatible AND v_os_ausente THEN
    v_entrada := jsonb_set(v_entrada, '{raw_data,linked_service_order}', p_guardada->'raw_data'->'linked_service_order');
  END IF;
  IF v_os_compatible AND v_tiempo_ausente THEN
    v_entrada := jsonb_set(v_entrada, '{tipo_tiempo}', coalesce(p_guardada->'tipo_tiempo', 'null'::jsonb));
  END IF;
  IF v_os_compatible AND v_marca_ausente THEN
    v_entrada := jsonb_set(v_entrada, '{marca_normalizada}', p_guardada->'marca_normalizada');
  END IF;

  v_completar_vendedor := nullif(btrim(p_guardada->>'vendedor'), '') IS NULL
    AND nullif(btrim(p_entrada->>'vendedor'), '') IS NOT NULL;
  -- Solo el antiguo default identificable, sin OS ni evidencia explicita.
  -- No alcanza con que la OS no aparezca en el XML actual.
  v_default_cliente := v_os_guardada IS NULL
    AND p_guardada->>'tipo_tiempo' = 'Cliente'
    AND p_guardada->'raw_data'->>'canonical_time_type' = 'Cliente'
    AND p_guardada->'raw_data'->>'canonical_time_type_evidence' IS NULL
    AND p_guardada->'raw_data'->>'canonical_time_type_known_values' IS NULL
    AND p_guardada->'raw_data'->>'linked_service_order_evidence' IS NULL
    AND p_guardada->'raw_data'->>'linked_service_order_known_values' IS NULL;
  v_limpiar_tiempo := v_default_cliente AND coalesce(v_os_ausente AND v_tiempo_ausente,false);

  -- Un XML mas completo puede aportar el vinculo que antes faltaba. Solo se
  -- incorpora evidencia completa, univoca y sin reemplazar un valor conocido.
  v_completar_os := v_os_guardada IS NULL AND coalesce(v_os_completa,false)
    AND coalesce(p_guardada->'raw_data'->>'linked_service_order_evidence','missing')='missing'
    AND coalesce(p_guardada->'raw_data'->'linked_service_order_known_values','null'::jsonb) IN ('null'::jsonb,'[]'::jsonb);
  v_completar_tiempo := v_completar_os
    AND (v_default_cliente OR (
      p_guardada->>'tipo_tiempo' IS NULL
      AND coalesce(p_guardada->'raw_data'->>'canonical_time_type','Desconocido')='Desconocido'
      AND coalesce(p_guardada->'raw_data'->>'canonical_time_type_evidence','missing')='missing'
      AND coalesce(p_guardada->'raw_data'->'canonical_time_type_known_values','null'::jsonb) IN ('null'::jsonb,'[]'::jsonb)
    ))
    AND p_entrada->>'tipo_tiempo' IN ('Cliente','Garantia','Interno')
    AND p_entrada->'raw_data'->>'canonical_time_type_evidence'='complete'
    AND p_entrada->'raw_data'->'canonical_time_type_has_unknown'='false'::jsonb
    AND jsonb_typeof(p_entrada->'raw_data'->'canonical_time_type_known_values')='array'
    AND jsonb_array_length(p_entrada->'raw_data'->'canonical_time_type_known_values')>0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_entrada->'raw_data'->'canonical_time_type_known_values') k(tipo)
      WHERE upper(btrim(k.tipo)) IS DISTINCT FROM upper(btrim(p_entrada->>'tipo_tiempo')));
  -- La marca del maestro puede acreditarse aunque no exista una OS vinculada.
  v_completar_marca := (p_guardada->>'marca_normalizada' IS NULL OR upper(btrim(p_guardada->>'marca_normalizada'))='OTROS')
    AND coalesce(p_guardada->'raw_data'->>'product_brand','OTROS')='OTROS'
    AND coalesce(p_guardada->'raw_data'->>'product_brand_evidence','missing')='missing'
    AND coalesce(p_guardada->'raw_data'->'product_brand_known_values','null'::jsonb) IN ('null'::jsonb,'[]'::jsonb)
    AND p_entrada->'raw_data'->>'product_brand_evidence' IN ('service_order','product','billing','inferred')
    AND nullif(btrim(p_entrada->'raw_data'->>'product_brand'),'') IS NOT NULL
    AND upper(btrim(p_entrada->'raw_data'->>'product_brand'))=upper(btrim(p_entrada->>'marca_normalizada'))
    AND jsonb_typeof(p_entrada->'raw_data'->'product_brand_known_values')='array'
    AND jsonb_array_length(p_entrada->'raw_data'->'product_brand_known_values')>0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_entrada->'raw_data'->'product_brand_known_values') k(marca)
      WHERE upper(btrim(k.marca)) IS DISTINCT FROM upper(btrim(p_entrada->>'marca_normalizada')));
  IF v_completar_os THEN
    v_comparable := jsonb_set(v_comparable,'{raw_data,linked_service_order}',p_entrada->'raw_data'->'linked_service_order');
  END IF;
  IF v_completar_tiempo THEN
    v_comparable := jsonb_set(v_comparable,'{tipo_tiempo}',p_entrada->'tipo_tiempo');
  END IF;
  IF v_completar_marca THEN
    v_comparable := jsonb_set(v_comparable,'{marca_normalizada}',p_entrada->'marca_normalizada');
  END IF;
  -- Un cambio de capitalizacion no cambia el rubro comercial.
  v_normalizar_grupo := nullif(btrim(p_guardada->>'grupo_normalizado'),'') IS NOT NULL
    AND nullif(btrim(p_entrada->>'grupo_normalizado'),'') IS NOT NULL
    AND upper(btrim(p_guardada->>'grupo_normalizado')) = upper(btrim(p_entrada->>'grupo_normalizado'))
    AND p_guardada->>'grupo_normalizado' IS DISTINCT FROM p_entrada->>'grupo_normalizado'
    AND p_entrada->'raw_data'->>'canonical_line_type' = p_entrada->>'grupo_normalizado';
  IF v_normalizar_grupo THEN
    v_comparable := jsonb_set(v_comparable,'{grupo_normalizado}',p_entrada->'grupo_normalizado');
  END IF;
  IF v_completar_vendedor THEN
    v_comparable := jsonb_set(v_comparable, '{vendedor}', p_entrada->'vendedor');
  END IF;
  IF v_limpiar_tiempo THEN
    v_comparable := jsonb_set(v_comparable, '{tipo_tiempo}', 'null'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'entrada',v_entrada,
    'guardada_comparable',v_comparable,
    'completar_vendedor',coalesce(v_completar_vendedor,false),
    'limpiar_tiempo',coalesce(v_limpiar_tiempo,false),
    'completar_os',coalesce(v_completar_os,false),
    'completar_tiempo',coalesce(v_completar_tiempo,false),
    'completar_marca',coalesce(v_completar_marca,false),
    'normalizar_grupo',coalesce(v_normalizar_grupo,false),
    'conservar_os',v_os_compatible AND coalesce(v_os_ausente,false),
    'conservar_tiempo',v_os_compatible AND coalesce(v_tiempo_ausente,false),
    'conservar_marca',v_os_compatible AND coalesce(v_marca_ausente,false)
  );
END;
$function$;

-- Modifica el core activo con anclas verificadas. Una definicion inesperada
-- aborta la transaccion antes de alterar la base.
DO $migration$
DECLARE
  v_definition text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.facturacion_importar_totvs_lote_core_consolidacion_v1(jsonb,jsonb,jsonb,date,date,boolean)'
  )) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Falta el core de facturacion TOTVS; no se aplica la migracion';
  END IF;
  INSERT INTO public.facturacion_totvs_importador_versiones(version,definicion_rpc)
  VALUES ('20261016120000_core_anterior',v_definition)
  ON CONFLICT(version) DO NOTHING;

  FOR v_anchor, v_replacement IN
    SELECT anchor, replacement FROM (VALUES
      ($old$'completar_os',false,'completar_tiempo',false,'completar_marca',false,$old$,
       $new$'completar_os',false,'completar_tiempo',false,'completar_marca',false,'normalizar_grupo',false,$new$),
      ($old$OR (r.plan->>'completar_os')::boolean;

  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_reparaciones_esperadas(id);$old$,
       $new$OR (r.plan->>'completar_os')::boolean
     OR (r.plan->>'completar_marca')::boolean
     OR (r.plan->>'normalizar_grupo')::boolean;

  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_reparaciones_esperadas(id);$new$),
      ($old$'marca_anterior',f.marca_normalizada,$old$,
       $new$'grupo_anterior',f.grupo_normalizado,
      'grupo_nuevo',CASE WHEN (r.plan->>'normalizar_grupo')::boolean THEN u.linea->>'grupo_normalizado' ELSE f.grupo_normalizado END,
      'marca_anterior',f.marca_normalizada,$new$),
      ($old$marca_normalizada = CASE WHEN (r.plan->>'completar_marca')::boolean THEN (u.linea->>'marca_normalizada')::public.marca ELSE f.marca_normalizada END,$old$,
       $new$grupo_normalizado = CASE WHEN (r.plan->>'normalizar_grupo')::boolean THEN u.linea->>'grupo_normalizado' ELSE f.grupo_normalizado END,
        marca_normalizada = CASE WHEN (r.plan->>'completar_marca')::boolean THEN (u.linea->>'marca_normalizada')::public.marca ELSE f.marca_normalizada END,$new$),
      ($old$raw_data = f.raw_data
          || CASE WHEN (r.plan->>'completar_os')::boolean$old$,
       $new$raw_data = f.raw_data
          || CASE WHEN (r.plan->>'normalizar_grupo')::boolean THEN jsonb_build_object(
               'canonical_line_type',u.linea->'raw_data'->'canonical_line_type'
             ) ELSE '{}'::jsonb END
          || CASE WHEN (r.plan->>'completar_os')::boolean$new$)
    ) AS changes(anchor,replacement)
  LOOP
    v_anchor := replace(v_anchor, E'\r\n', E'\n');
    v_replacement := replace(v_replacement, E'\r\n', E'\n');
    IF (length(v_definition)-length(replace(v_definition,v_anchor,''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'La definicion activa de facturacion TOTVS cambio; revisar ancla: %', left(v_anchor,90);
    END IF;
    v_definition := replace(v_definition,v_anchor,v_replacement);
  END LOOP;
  EXECUTE v_definition;
END;
$migration$;

COMMIT;
