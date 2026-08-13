-- Motor v2.1: corrige la cobertura y la subestimacion del historial.
-- 1. Las cantidades vendidas se consideran sin importar la moneda.
-- 2. El ABC monetario conserva solo importes no-GS hasta contar con cambio.
-- 3. La demanda no puede quedar debajo del ritmo real de los ultimos 12m.
-- 4. La recurrencia minima se evalua tambien sobre 24 meses.

DO $migration$
DECLARE
  v_function text;
  v_updated text;
BEGIN
  v_function := pg_get_functiondef(
    'public.repuestos_ejecutar_sugerencia(text,date,text)'::regprocedure
  );

  v_updated := replace(
    v_function,
    E'      AND upper(coalesce(f.moneda, \'USD\')) <> \'GS\'\n',
    ''
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro el filtro de moneda esperado en repuestos_ejecutar_sugerencia';
  END IF;
  v_function := v_updated;

  v_updated := replace(
    v_function,
    'coalesce(f.total_venta, 0)::numeric AS total_vendido,',
    E'CASE\n        WHEN upper(coalesce(f.moneda, \'USD\')) IN (\'GS\', \'GRS\', \'PYG\') THEN 0\n        ELSE coalesce(f.total_venta, 0)\n      END::numeric AS total_vendido,'
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro el calculo monetario esperado en repuestos_ejecutar_sugerencia';
  END IF;
  v_function := v_updated;

  v_updated := replace(
    v_function,
    E'(\n        v_modelo.peso_reciente * (s.unidades_12m / 12.0)\n        + v_modelo.peso_anterior * ((s.unidades_24m - s.unidades_12m) / 12.0)\n      )::numeric AS demanda_ponderada_mensual,',
    E'greatest(\n        greatest(s.unidades_12m, 0) / 12.0,\n        v_modelo.peso_reciente * (s.unidades_12m / 12.0)\n        + v_modelo.peso_anterior * ((s.unidades_24m - s.unidades_12m) / 12.0)\n      )::numeric AS demanda_ponderada_mensual,'
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro la demanda ponderada esperada en repuestos_ejecutar_sugerencia';
  END IF;
  v_function := v_updated;

  v_updated := replace(
    v_function,
    'WHEN m.segmento_base = ''SERVICIO ECONOMICO'' AND m.pedidos_12m < 2 THEN ''BAJO PEDIDO''',
    'WHEN m.segmento_base = ''SERVICIO ECONOMICO'' AND m.pedidos_24m < 2 THEN ''BAJO PEDIDO'''
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro la regla de bajo pedido esperada';
  END IF;
  v_function := v_updated;

  v_updated := replace(
    v_function,
    'WHEN o.unidades_12m <= 0 OR o.pedidos_12m <= 1 THEN 0',
    'WHEN o.unidades_24m <= 0 OR o.pedidos_24m <= 1 THEN 0'
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro la regla final de frecuencia esperada';
  END IF;
  v_function := v_updated;

  v_updated := replace(
    v_function,
    'WHEN f.pedidos_12m <= 1 AND f.criticidad <> ''V'' THEN ''Frecuencia insuficiente''',
    'WHEN f.pedidos_24m <= 1 THEN ''Frecuencia insuficiente en 24 meses'''
  );
  IF v_updated = v_function THEN
    RAISE EXCEPTION 'No se encontro la explicacion de frecuencia esperada';
  END IF;
  v_function := v_updated;

  EXECUTE v_function;
END;
$migration$;

COMMENT ON FUNCTION public.repuestos_ejecutar_sugerencia(text, date, text) IS
  'Motor v2.1 ABC-FSN-XYZ: cantidades multimoneda, ABC monetario no-GS, demanda minima igual al ritmo 12m y recurrencia 24m.';

NOTIFY pgrst, 'reload schema';
