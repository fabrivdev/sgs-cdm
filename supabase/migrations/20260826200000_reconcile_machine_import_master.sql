-- Maestro de importaciones: conserva una fila física de la planilla y su
-- procedencia. La carga puede repetirse sin duplicar source_id.
CREATE TABLE IF NOT EXISTS public.maquinaria_importacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  source_row integer,
  source_sheet text NOT NULL DEFAULT 'MAESTRO DE IMPORTACIONES',
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  llave_interna text,
  prioridad text,
  np_numero text,
  proveedor text,
  producto text,
  modelo text,
  cantidad integer,
  estado_fuente text,
  oc text,
  po text,
  eta date,
  transporte text,
  invoice_supplier text,
  tipo_cambio numeric,
  precio_oc numeric,
  descuentos numeric,
  precio_teorico_oc numeric,
  producto_facturado text,
  diferencia numeric,
  descuento_especial numeric,
  flete_seguro numeric,
  proveedor_flete text,
  origen text,
  destino text,
  notas text,
  ata date,
  costo_final_sin_iva numeric,
  costo_final numeric,
  chasis text,
  venta_facturada text,
  factura_venta text,
  valor_venta numeric,
  utilidad numeric,
  margen_porcentaje numeric,
  operacion_id uuid REFERENCES public.maquinaria_operaciones(id) ON DELETE SET NULL,
  linea_id uuid REFERENCES public.maquinaria_operacion_lineas(id) ON DELETE SET NULL,
  unidad_id uuid REFERENCES public.maquinaria_unidades_operacion(id) ON DELETE SET NULL,
  situacion_vinculo text NOT NULL DEFAULT 'SIN PEDIDO',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maquinaria_importacion_lineas_vinculo_check CHECK (situacion_vinculo IN ('SIN PEDIDO','PEDIDO VINCULADO','CHASIS VINCULADO','CONFLICTO DE CHASIS'))
);

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_importacion_lineas_source_unique
  ON public.maquinaria_importacion_lineas (source_sheet, source_id);
CREATE INDEX IF NOT EXISTS maquinaria_importacion_lineas_np_idx
  ON public.maquinaria_importacion_lineas (upper(btrim(np_numero)));
CREATE INDEX IF NOT EXISTS maquinaria_importacion_lineas_chasis_idx
  ON public.maquinaria_importacion_lineas (public.normalizar_chasis_notificacion(chasis));

CREATE OR REPLACE FUNCTION public.maquinaria_importar_maestro_importaciones(p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  f jsonb; v_op uuid; v_chasis_op uuid; v_linea uuid; v_unidad uuid;
  v_source text; v_np text; v_chasis text; v_chasis_norm text;
  v_conflicto boolean; v_total integer := 0; v_vinculadas integer := 0;
  v_sin_np integer := 0; v_chasis_vinculados integer := 0; v_conflictos integer := 0;
  v_modelo text; v_producto text;
BEGIN
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'p_filas debe ser un arreglo JSON'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden cargar el maestro de importaciones' USING ERRCODE = '42501';
  END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    v_source := coalesce(nullif(btrim(f->>'source_id'), ''), 'MAESTRO_DE_IMPORTACIONES:' || coalesce(f->>'source_row', md5(f::text)));
    v_np := nullif(btrim(coalesce(f->>'np_numero', f->>'nro_nota_pedido')), '');
    v_modelo := nullif(btrim(f->>'modelo'), ''); v_producto := nullif(btrim(f->>'producto'), '');
    v_chasis := nullif(btrim(coalesce(f->>'chasis', f->>'nro_chasis')), '');
    IF upper(coalesce(v_chasis, '')) IN ('0','S/CHASIS','SIN CHASIS','N/A','NA','O KM','0 KM') THEN v_chasis := NULL; END IF;
    v_chasis_norm := public.normalizar_chasis_notificacion(v_chasis);
    v_op := NULL; v_chasis_op := NULL; v_linea := NULL; v_unidad := NULL; v_conflicto := false;
    IF v_np IS NOT NULL THEN
      SELECT id INTO v_op FROM public.maquinaria_operaciones WHERE upper(btrim(np_numero)) = upper(v_np) AND estado <> 'CANCELADA' LIMIT 1;
      IF v_op IS NOT NULL THEN
        SELECT l.id INTO v_linea
        FROM public.maquinaria_operacion_lineas l
        WHERE l.operacion_id = v_op
          AND public.parque_modelo_clave(l.modelo) = public.parque_modelo_clave(v_modelo)
          AND public.parque_modelo_clave(l.producto) = public.parque_modelo_clave(v_producto)
        ORDER BY l.linea_numero LIMIT 1;
      END IF;
    ELSE v_sin_np := v_sin_np + 1; END IF;
    IF v_chasis_norm IS NOT NULL THEN
      SELECT u.id, u.linea_id, l.operacion_id INTO v_unidad, v_linea, v_chasis_op
      FROM public.maquinaria_unidades_operacion u
      JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
      WHERE public.normalizar_chasis_notificacion(u.chasis) = v_chasis_norm LIMIT 1;
      IF v_unidad IS NOT NULL AND v_op IS NOT NULL AND v_chasis_op <> v_op THEN
        v_conflicto := true; v_conflictos := v_conflictos + 1; v_linea := NULL; v_unidad := NULL;
      ELSIF v_unidad IS NOT NULL AND v_op IS NULL THEN
        v_op := v_chasis_op;
      END IF;
    END IF;
    IF v_linea IS NULL AND v_op IS NOT NULL THEN
      SELECT l.id INTO v_linea FROM public.maquinaria_operacion_lineas l WHERE l.operacion_id = v_op AND public.parque_modelo_clave(l.modelo) = public.parque_modelo_clave(v_modelo) AND public.parque_modelo_clave(l.producto) = public.parque_modelo_clave(v_producto) ORDER BY l.linea_numero LIMIT 1;
    END IF;
    IF v_linea IS NOT NULL AND v_unidad IS NULL THEN
      IF v_chasis_norm IS NULL THEN
        SELECT u.id INTO v_unidad FROM public.maquinaria_unidades_operacion u WHERE u.linea_id = v_linea ORDER BY u.numero_unidad LIMIT 1;
      ELSE
        SELECT u.id INTO v_unidad
        FROM public.maquinaria_unidades_operacion u
        WHERE u.linea_id = v_linea
          AND (public.normalizar_chasis_notificacion(u.chasis) IS NULL OR public.normalizar_chasis_notificacion(u.chasis) = v_chasis_norm)
        ORDER BY (public.normalizar_chasis_notificacion(u.chasis) = v_chasis_norm) DESC, u.numero_unidad
        LIMIT 1;
        IF v_unidad IS NULL AND NOT v_conflicto THEN
          v_conflicto := true; v_conflictos := v_conflictos + 1;
        END IF;
      END IF;
    END IF;
    IF v_unidad IS NOT NULL AND v_chasis_norm IS NOT NULL THEN v_chasis_vinculados := v_chasis_vinculados + 1; END IF;
    INSERT INTO public.maquinaria_importacion_lineas (
      source_id, source_row, datos_fuente, llave_interna, prioridad, np_numero, proveedor, producto, modelo, cantidad,
      estado_fuente, oc, po, eta, transporte, invoice_supplier, tipo_cambio, precio_oc, descuentos,
      precio_teorico_oc, producto_facturado, diferencia, descuento_especial, flete_seguro, proveedor_flete, origen, destino, notas, ata,
      costo_final_sin_iva, costo_final, chasis, venta_facturada, factura_venta, valor_venta, utilidad, margen_porcentaje,
      operacion_id, linea_id, unidad_id, situacion_vinculo, actualizado_en
    ) VALUES (
      v_source, nullif(f->>'source_row','')::integer, f, nullif(f->>'llave_interna',''), nullif(f->>'prioridad',''), v_np,
      nullif(f->>'proveedor',''), v_producto, v_modelo, nullif(f->>'cantidad','')::integer,
      nullif(f->>'estado',''), nullif(f->>'oc',''), nullif(f->>'po',''), nullif(f->>'eta','')::date,
      nullif(f->>'transporte',''), nullif(f->>'invoice_supplier',''), nullif(f->>'tipo_cambio','')::numeric,
      nullif(f->>'precio_oc','')::numeric, nullif(f->>'descuentos','')::numeric, nullif(f->>'precio_teorico_oc','')::numeric,
      nullif(f->>'producto_facturado',''), nullif(f->>'diferencia','')::numeric, nullif(f->>'descuento_especial','')::numeric,
      nullif(f->>'flete_seguro','')::numeric, nullif(f->>'proveedor_flete',''),
      nullif(f->>'origen',''), nullif(f->>'destino',''), nullif(f->>'notas',''), nullif(f->>'ata','')::date,
      nullif(f->>'costo_final_sin_iva','')::numeric, nullif(f->>'costo_final','')::numeric, v_chasis, nullif(f->>'venta_facturada',''), nullif(coalesce(f->>'factura_venta', f->>'cod_interno_factura'),'') ,
      nullif(f->>'valor_venta','')::numeric, nullif(f->>'utilidad','')::numeric, nullif(coalesce(f->>'margen_porcentaje', f->>'margen'),'')::numeric,
      v_op, v_linea, v_unidad, CASE WHEN v_conflicto THEN 'CONFLICTO DE CHASIS' WHEN v_unidad IS NOT NULL AND v_chasis_norm IS NOT NULL THEN 'CHASIS VINCULADO' WHEN v_op IS NOT NULL THEN 'PEDIDO VINCULADO' ELSE 'SIN PEDIDO' END, now()
    ) ON CONFLICT (source_sheet, source_id) DO UPDATE SET
      source_row=EXCLUDED.source_row, datos_fuente=EXCLUDED.datos_fuente, llave_interna=EXCLUDED.llave_interna, prioridad=EXCLUDED.prioridad,
      np_numero=EXCLUDED.np_numero, proveedor=EXCLUDED.proveedor, producto=EXCLUDED.producto, modelo=EXCLUDED.modelo,
      cantidad=EXCLUDED.cantidad, estado_fuente=EXCLUDED.estado_fuente, oc=EXCLUDED.oc, po=EXCLUDED.po, eta=EXCLUDED.eta,
      transporte=EXCLUDED.transporte, invoice_supplier=EXCLUDED.invoice_supplier, tipo_cambio=EXCLUDED.tipo_cambio,
      precio_oc=EXCLUDED.precio_oc, descuentos=EXCLUDED.descuentos, precio_teorico_oc=EXCLUDED.precio_teorico_oc,
      producto_facturado=EXCLUDED.producto_facturado, diferencia=EXCLUDED.diferencia, descuento_especial=EXCLUDED.descuento_especial,
      flete_seguro=EXCLUDED.flete_seguro, proveedor_flete=EXCLUDED.proveedor_flete,
      origen=EXCLUDED.origen, destino=EXCLUDED.destino, notas=EXCLUDED.notas, ata=EXCLUDED.ata,
      costo_final_sin_iva=EXCLUDED.costo_final_sin_iva, costo_final=EXCLUDED.costo_final,
      chasis=EXCLUDED.chasis, venta_facturada=EXCLUDED.venta_facturada, factura_venta=EXCLUDED.factura_venta,
      valor_venta=EXCLUDED.valor_venta, utilidad=EXCLUDED.utilidad, margen_porcentaje=EXCLUDED.margen_porcentaje,
      operacion_id=EXCLUDED.operacion_id, linea_id=EXCLUDED.linea_id, unidad_id=EXCLUDED.unidad_id,
      situacion_vinculo=EXCLUDED.situacion_vinculo, actualizado_en=now();
    IF v_unidad IS NOT NULL AND v_chasis_norm IS NOT NULL AND NOT v_conflicto THEN
      UPDATE public.maquinaria_unidades_operacion SET chasis=coalesce(nullif(btrim(chasis),''), v_chasis), actualizado_en=now() WHERE id=v_unidad;
    END IF;
    v_total := v_total + 1; IF v_op IS NOT NULL THEN v_vinculadas := v_vinculadas + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('filas_procesadas',v_total,'pedidos_vinculados',v_vinculadas,'filas_sin_np',v_sin_np,'chasis_vinculados',v_chasis_vinculados,'conflictos_chasis',v_conflictos);
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_importar_maestro_importaciones(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_importar_maestro_importaciones(jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.maquinaria_planificador_resumen WITH (security_invoker = true) AS
SELECT 'PEDIDO'::text AS tipo_registro, l.id, l.operacion_id, NULL::uuid AS importacion_linea_id,
  o.np_numero, coalesce(o.cliente_nombre, 'Cliente por validar') AS cliente_nombre, l.marca::text AS marca,
  l.producto, l.modelo, l.cantidad, NULL::text AS estado_fuente, l.abastecimiento AS abastecimiento,
  NULL::text AS oc, NULL::text AS po, NULL::date AS eta, NULL::date AS ata, NULL::text AS proveedor,
  NULL::text AS invoice_supplier, NULL::numeric AS costo_final, u.chasis, NULL::text AS venta_facturada,
  NULL::numeric AS valor_venta, NULL::text AS situacion_vinculo, o.np_fecha AS fecha_referencia
FROM public.maquinaria_operacion_lineas l JOIN public.maquinaria_operaciones o ON o.id=l.operacion_id
LEFT JOIN LATERAL (SELECT chasis FROM public.maquinaria_unidades_operacion WHERE linea_id=l.id ORDER BY numero_unidad LIMIT 1) u ON true
UNION ALL
SELECT 'IMPORTACION'::text, i.id, i.operacion_id, i.id, i.np_numero, coalesce(o.cliente_nombre,'Sin pedido'), NULL::text,
  i.producto, i.modelo, i.cantidad, i.estado_fuente, NULL::text, i.oc, i.po, i.eta, i.ata, i.proveedor,
  i.invoice_supplier, i.costo_final, i.chasis, i.venta_facturada, i.valor_venta, i.situacion_vinculo, i.eta
FROM public.maquinaria_importacion_lineas i LEFT JOIN public.maquinaria_operaciones o ON o.id=i.operacion_id;

ALTER TABLE public.maquinaria_importacion_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso modulo parque" ON public.maquinaria_importacion_lineas;
CREATE POLICY "Acceso modulo parque" ON public.maquinaria_importacion_lineas FOR ALL TO authenticated
USING (public.has_module_access(auth.uid(), 'parque')) WITH CHECK (public.has_module_access(auth.uid(), 'parque'));
GRANT SELECT ON public.maquinaria_planificador_resumen TO authenticated;
NOTIFY pgrst, 'reload schema';
