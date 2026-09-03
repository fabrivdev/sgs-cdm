-- Concilia una factura de maquinaria con una linea de pedido existente solo
-- cuando el chasis coincide exactamente. Nombre, marca y modelo no deciden.

CREATE OR REPLACE FUNCTION public.maquinaria_conciliar_factura_venta(
  p_facturacion_linea_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_factura public.facturacion_lineas_importadas%ROWTYPE;
  v_texto text;
  v_chasis text;
  v_unidad_id uuid;
  v_linea_id uuid;
  v_operacion_id uuid;
  v_numero text;
  v_fecha date;
  v_valor numeric;
BEGIN
  SELECT *
  INTO v_factura
  FROM public.facturacion_lineas_importadas
  WHERE id = p_facturacion_linea_id;

  IF NOT FOUND
     OR coalesce(v_factura.cantidad, 0) <= 0
     OR coalesce(v_factura.total_venta, 0) <= 0
     OR upper(coalesce(v_factura.raw_data ->> 'canonical_document_kind', 'FACTURA')) = 'NOTACREDITO' THEN
    RETURN NULL;
  END IF;

  v_texto := concat_ws(' | ', v_factura.mercaderia, v_factura.observacion, v_factura.subgrupo_original);

  IF NOT (
    upper(coalesce(v_factura.grupo_normalizado, '')) = 'MAQUINARIAS'
    OR upper(coalesce(v_factura.raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
    OR left(upper(coalesce(v_factura.cod_mercaderia, '')), 5) = 'VEIC_'
    OR v_texto ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS)[[:space:]]*:'
  ) THEN
    RETURN NULL;
  END IF;

  v_chasis := public.extraer_chasis_venta_maquina(
    v_texto,
    v_factura.raw_data,
    nullif(v_factura.raw_data ->> 'linked_service_order', '')
  );

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.id, l.id, l.operacion_id
  INTO v_unidad_id, v_linea_id, v_operacion_id
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  WHERE public.normalizar_chasis_notificacion(u.chasis)
    = public.normalizar_chasis_notificacion(v_chasis)
  LIMIT 1;

  IF v_unidad_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_numero := coalesce(
    nullif(btrim(v_factura.codigo_interno_factura), ''),
    nullif(btrim(v_factura.factura), '')
  );
  v_fecha := v_factura.fecha_factura::date;
  v_valor := v_factura.total_venta;

  UPDATE public.maquinaria_unidades_operacion
  SET valor_facturado = v_valor,
      moneda = coalesce(nullif(btrim(v_factura.moneda), ''), moneda),
      estado = CASE
        WHEN estado IN ('PENDIENTE', 'EN_TRANSITO', 'DISPONIBLE') THEN 'FACTURADA'
        ELSE estado
      END,
      actualizado_en = now()
  WHERE id = v_unidad_id;

  UPDATE public.maquinaria_operacion_lineas
  SET datos_extraidos = jsonb_set(
        coalesce(datos_extraidos, '{}'::jsonb),
        '{historico_pedido}',
        coalesce(datos_extraidos -> 'historico_pedido', '{}'::jsonb)
          || jsonb_build_object(
            'estado', 'Completado',
            'factura_numero', v_numero,
            'factura_fecha', v_fecha,
            'valor_factura', v_valor,
            'moneda_factura', coalesce(nullif(btrim(v_factura.moneda), ''), 'USD'),
            'facturacion_linea_id', v_factura.id,
            'facturacion_conciliada_por', 'CHASIS_EXACTO'
          ),
        true
      ),
      actualizado_en = now()
  WHERE id = v_linea_id;

  UPDATE public.maquinaria_operaciones o
  SET estado = 'FACTURADA',
      actualizado_en = now()
  WHERE o.id = v_operacion_id
    AND o.estado NOT IN ('CERRADA', 'CANCELADA')
    AND EXISTS (
      SELECT 1
      FROM public.maquinaria_operacion_lineas l
      JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
      WHERE l.operacion_id = o.id
        AND u.estado IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.maquinaria_operacion_lineas l
      JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
      WHERE l.operacion_id = o.id
        AND u.estado NOT IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
    );

  RETURN v_unidad_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maquinaria_conciliar_factura_venta_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.maquinaria_conciliar_factura_venta(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maquinaria_conciliar_factura_venta_trigger
  ON public.facturacion_lineas_importadas;
CREATE TRIGGER maquinaria_conciliar_factura_venta_trigger
AFTER INSERT OR UPDATE OF grupo_normalizado, mercaderia, observacion,
  subgrupo_original, cod_mercaderia, cantidad, total_venta, moneda, raw_data,
  factura, codigo_interno_factura, fecha_factura
ON public.facturacion_lineas_importadas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_conciliar_factura_venta_trigger();

REVOKE ALL ON FUNCTION public.maquinaria_conciliar_factura_venta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_conciliar_factura_venta_trigger() FROM PUBLIC, anon, authenticated;

-- Aplica la misma regla a facturas ya importadas, incluida la del dia de hoy.
DO $backfill$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.facturacion_lineas_importadas
    WHERE coalesce(cantidad, 0) > 0
      AND coalesce(total_venta, 0) > 0
      AND upper(coalesce(raw_data ->> 'canonical_document_kind', 'FACTURA')) <> 'NOTACREDITO'
      AND (
        upper(coalesce(grupo_normalizado, '')) = 'MAQUINARIAS'
        OR upper(coalesce(raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
        OR left(upper(coalesce(cod_mercaderia, '')), 5) = 'VEIC_'
        OR concat_ws(' | ', mercaderia, observacion, subgrupo_original)
          ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS)[[:space:]]*:'
      )
    ORDER BY fecha_factura NULLS FIRST, importado_en
  LOOP
    PERFORM public.maquinaria_conciliar_factura_venta(v_id);
  END LOOP;
END;
$backfill$;

NOTIFY pgrst, 'reload schema';
