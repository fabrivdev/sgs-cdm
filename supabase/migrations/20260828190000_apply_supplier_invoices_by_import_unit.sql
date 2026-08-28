-- Facturas de proveedor por subconjunto de maquinas importadas. Una operacion
-- puede recibir varias facturas y cada factura puede incluir una o mas
-- unidades fisicas, sin afectar las demas unidades del pedido.

ALTER TABLE public.maquinaria_importacion_unidades
  ADD COLUMN IF NOT EXISTS factura_proveedor_moneda text;

CREATE TABLE IF NOT EXISTS public.maquinaria_facturas_importacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id uuid NOT NULL
    REFERENCES public.maquinaria_operaciones(id) ON DELETE CASCADE,
  proveedor text,
  factura_numero text NOT NULL,
  factura_fecha date,
  moneda text,
  valor_total numeric(16,2),
  documento_id uuid
    REFERENCES public.maquinaria_documentos(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacion_id, factura_numero)
);

CREATE TABLE IF NOT EXISTS public.maquinaria_factura_importacion_unidades (
  factura_id uuid NOT NULL
    REFERENCES public.maquinaria_facturas_importacion(id) ON DELETE CASCADE,
  importacion_unidad_id uuid NOT NULL
    REFERENCES public.maquinaria_importacion_unidades(id) ON DELETE CASCADE,
  chasis text,
  costo_unidad numeric(16,2),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factura_id, importacion_unidad_id),
  UNIQUE (importacion_unidad_id)
);

CREATE INDEX IF NOT EXISTS maquinaria_facturas_importacion_operacion_idx
  ON public.maquinaria_facturas_importacion(operacion_id, factura_fecha DESC);

ALTER TABLE public.maquinaria_facturas_importacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_factura_importacion_unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso modulo parque" ON public.maquinaria_facturas_importacion;
CREATE POLICY "Acceso modulo parque" ON public.maquinaria_facturas_importacion
FOR ALL TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'))
WITH CHECK (public.has_module_access(auth.uid(), 'parque'));

DROP POLICY IF EXISTS "Acceso modulo parque" ON public.maquinaria_factura_importacion_unidades;
CREATE POLICY "Acceso modulo parque" ON public.maquinaria_factura_importacion_unidades
FOR ALL TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'))
WITH CHECK (public.has_module_access(auth.uid(), 'parque'));

CREATE OR REPLACE FUNCTION public.maquinaria_aplicar_factura_importacion(
  p_operacion_id uuid,
  p_factura_numero text,
  p_factura_fecha date,
  p_proveedor text,
  p_moneda text,
  p_valor_total numeric,
  p_unidades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_factura_id uuid;
  v_importacion_operativa_id uuid;
  v_operacion_estado text;
  v_item jsonb;
  v_importacion_unidad_id uuid;
  v_pedido_unidad_id uuid;
  v_chasis text;
  v_chasis_actual text;
  v_costo numeric;
  v_cantidad integer;
  v_actualizadas integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden confirmar facturas de importacion'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.estado INTO v_operacion_estado
  FROM public.maquinaria_operaciones o
  WHERE o.id = p_operacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La operacion no existe o esta cancelada';
  END IF;

  IF nullif(btrim(p_factura_numero), '') IS NULL THEN
    RAISE EXCEPTION 'El numero de factura es obligatorio';
  END IF;
  IF jsonb_typeof(p_unidades) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_unidades) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una maquina incluida en la factura';
  END IF;
  IF p_valor_total IS NOT NULL AND p_valor_total < 0 THEN
    RAISE EXCEPTION 'El valor total de la factura no puede ser negativo';
  END IF;

  -- Rechaza ids repetidos antes de modificar datos.
  SELECT count(*) INTO v_cantidad
  FROM (
    SELECT value ->> 'importacion_unidad_id' AS id
    FROM jsonb_array_elements(p_unidades)
    GROUP BY value ->> 'importacion_unidad_id'
  ) unicas;
  IF v_cantidad <> jsonb_array_length(p_unidades) THEN
    RAISE EXCEPTION 'La misma maquina aparece mas de una vez en la factura';
  END IF;

  INSERT INTO public.maquinaria_facturas_importacion (
    operacion_id, proveedor, factura_numero, factura_fecha, moneda,
    valor_total, creado_por, actualizado_en
  ) VALUES (
    p_operacion_id, nullif(btrim(p_proveedor), ''), btrim(p_factura_numero),
    p_factura_fecha, nullif(btrim(p_moneda), ''), p_valor_total,
    auth.uid(), now()
  )
  ON CONFLICT (operacion_id, factura_numero) DO UPDATE SET
    proveedor = excluded.proveedor,
    factura_fecha = excluded.factura_fecha,
    moneda = excluded.moneda,
    valor_total = excluded.valor_total,
    actualizado_en = now()
  RETURNING id INTO v_factura_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_unidades)
  LOOP
    BEGIN
      v_importacion_unidad_id := nullif(v_item ->> 'importacion_unidad_id', '')::uuid;
      v_costo := nullif(v_item ->> 'costo_unidad', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Una unidad o costo de la factura tiene formato invalido';
    END;
    v_chasis := nullif(btrim(v_item ->> 'chasis'), '');

    IF v_costo IS NOT NULL AND v_costo < 0 THEN
      RAISE EXCEPTION 'El costo de una maquina no puede ser negativo';
    END IF;

    SELECT iu.unidad_id, u.chasis
    INTO v_pedido_unidad_id, v_chasis_actual
    FROM public.maquinaria_importacion_unidades iu
    JOIN public.maquinaria_unidades_operacion u ON u.id = iu.unidad_id
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE iu.id = v_importacion_unidad_id
      AND iu.activa
      AND iu.operacion_id = p_operacion_id
      AND l.operacion_id = p_operacion_id
      AND l.abastecimiento = 'IMPORTAR'
    FOR UPDATE OF iu, u;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Una maquina seleccionada no esta vinculada a esta operacion';
    END IF;

    IF public.normalizar_chasis_notificacion(v_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_chasis_actual) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_chasis)
         <> public.normalizar_chasis_notificacion(v_chasis_actual) THEN
      RAISE EXCEPTION 'El chasis % no coincide con el ya confirmado para la unidad', v_chasis;
    END IF;

    -- Una unidad fisica solo puede pertenecer a una factura de proveedor.
    -- Si se corrige la factura, se mueve explicitamente a la nueva cabecera.
    DELETE FROM public.maquinaria_factura_importacion_unidades fiu
    WHERE fiu.importacion_unidad_id = v_importacion_unidad_id
      AND fiu.factura_id <> v_factura_id;

    INSERT INTO public.maquinaria_factura_importacion_unidades (
      factura_id, importacion_unidad_id, chasis, costo_unidad, actualizado_en
    ) VALUES (
      v_factura_id, v_importacion_unidad_id, v_chasis, v_costo, now()
    )
    ON CONFLICT (factura_id, importacion_unidad_id) DO UPDATE SET
      chasis = excluded.chasis,
      costo_unidad = excluded.costo_unidad,
      actualizado_en = now();

    UPDATE public.maquinaria_importacion_unidades
    SET invoice_supplier = btrim(p_factura_numero),
        factura_proveedor_fecha = p_factura_fecha,
        factura_proveedor_moneda = nullif(btrim(p_moneda), ''),
        costo_final = v_costo,
        chasis = coalesce(v_chasis, chasis),
        estado_fuente = CASE
          WHEN upper(coalesce(estado_fuente, '')) IN ('RECIBIDA', 'ARRIBADA')
            THEN estado_fuente
          ELSE 'EN TRANSITO'
        END,
        detalle_manual = true,
        actualizado_en = now()
    WHERE id = v_importacion_unidad_id;

    UPDATE public.maquinaria_unidades_operacion
    SET chasis = coalesce(nullif(btrim(chasis), ''), v_chasis),
        valor_facturado = v_costo,
        moneda = nullif(btrim(p_moneda), ''),
        estado = CASE WHEN estado = 'PENDIENTE' THEN 'EN_TRANSITO' ELSE estado END,
        actualizado_en = now()
    WHERE id = v_pedido_unidad_id;

    v_actualizadas := v_actualizadas + 1;
  END LOOP;

  INSERT INTO public.maquinaria_importaciones_operativas (
    operacion_id, proveedor, factura_numero, factura_fecha, moneda,
    valor_facturado, estado, actualizado_en
  ) VALUES (
    p_operacion_id, nullif(btrim(p_proveedor), ''), btrim(p_factura_numero),
    p_factura_fecha, nullif(btrim(p_moneda), ''), p_valor_total,
    'FACTURA_REVISADA', now()
  )
  ON CONFLICT (operacion_id) DO UPDATE SET
    proveedor = excluded.proveedor,
    factura_numero = excluded.factura_numero,
    factura_fecha = excluded.factura_fecha,
    moneda = excluded.moneda,
    valor_facturado = excluded.valor_facturado,
    estado = 'FACTURA_REVISADA',
    actualizado_en = now()
  RETURNING id INTO v_importacion_operativa_id;

  UPDATE public.maquinaria_operaciones
  SET estado = CASE
        WHEN estado IN ('FACTURADA', 'CERRADA') THEN estado
        ELSE 'EN_IMPORTACION'
      END,
      actualizado_en = now()
  WHERE id = p_operacion_id;

  RETURN jsonb_build_object(
    'factura_id', v_factura_id,
    'importacion_operativa_id', v_importacion_operativa_id,
    'unidades_actualizadas', v_actualizadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_aplicar_factura_importacion(
  uuid, text, date, text, text, numeric, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_aplicar_factura_importacion(
  uuid, text, date, text, text, numeric, jsonb
) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquinaria_facturas_importacion
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquinaria_factura_importacion_unidades
  TO authenticated;

CREATE OR REPLACE VIEW public.maquinaria_facturas_importacion_detalle
WITH (security_invoker = true)
AS
SELECT
  f.id AS factura_id, f.operacion_id, f.proveedor, f.factura_numero,
  f.factura_fecha, f.moneda, f.valor_total, f.documento_id,
  u.id AS importacion_unidad_id, u.numero_unidad,
  i.id AS importacion_linea_id, i.cantidad AS cantidad_lote,
  i.producto, i.modelo, fiu.chasis, fiu.costo_unidad,
  u.unidad_id AS pedido_unidad_id, f.actualizado_en
FROM public.maquinaria_facturas_importacion f
JOIN public.maquinaria_factura_importacion_unidades fiu ON fiu.factura_id = f.id
JOIN public.maquinaria_importacion_unidades u ON u.id = fiu.importacion_unidad_id
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id;

GRANT SELECT ON public.maquinaria_facturas_importacion_detalle TO authenticated;

NOTIFY pgrst, 'reload schema';
