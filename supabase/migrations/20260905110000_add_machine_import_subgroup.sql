ALTER TABLE public.maquinaria_importacion_lineas
  ADD COLUMN IF NOT EXISTS subgrupo public.subgrupo_maquina;

CREATE OR REPLACE FUNCTION public.maquinaria_subgrupo_desde_producto(p_producto text)
RETURNS public.subgrupo_maquina
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_producto text := upper(regexp_replace(btrim(coalesce(p_producto, '')), '\s+', ' ', 'g'));
BEGIN
  IF v_producto = '' THEN RETURN NULL; END IF;

  IF v_producto IN ('C - PICADORA', 'C-PICADORA') THEN
    RETURN 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina;
  ELSIF v_producto IN ('M - PICADORA', 'M-PICADORA') THEN
    RETURN 'PICADORAS'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%DIRECT DISC%'
     OR v_producto LIKE '%PLATAFORMA%'
     OR v_producto LIKE '%CABEZAL%'
     OR v_producto LIKE '%HEADER%' THEN
    RETURN 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%COSECH%' THEN
    RETURN 'COSECHADORAS'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%SEMBR%'
     OR v_producto LIKE '%PLANTADORA%' THEN
    RETURN 'SEMBRADORAS'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%PULVER%' THEN
    RETURN 'PULVERIZADORAS'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%TRACT%' THEN
    RETURN 'TRACTORES'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%SUELO%' THEN
    RETURN 'SUELO'::public.subgrupo_maquina;
  ELSIF v_producto LIKE '%PICAD%' THEN
    RETURN 'PICADORAS'::public.subgrupo_maquina;
  ELSIF v_producto = 'OTRO' THEN
    RETURN 'OTRO'::public.subgrupo_maquina;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_clasificar_importacion_subgrupo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.subgrupo IS NULL THEN
    NEW.subgrupo := public.maquinaria_subgrupo_desde_producto(NEW.producto);
  ELSIF TG_OP = 'UPDATE'
    AND NEW.producto IS DISTINCT FROM OLD.producto
    AND NEW.subgrupo IS NOT DISTINCT FROM OLD.subgrupo THEN
    NEW.subgrupo := public.maquinaria_subgrupo_desde_producto(NEW.producto);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maquinaria_clasificar_importacion_subgrupo
  ON public.maquinaria_importacion_lineas;
CREATE TRIGGER trg_maquinaria_clasificar_importacion_subgrupo
BEFORE INSERT OR UPDATE OF producto, subgrupo
ON public.maquinaria_importacion_lineas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_clasificar_importacion_subgrupo();

UPDATE public.maquinaria_importacion_lineas
SET subgrupo = public.maquinaria_subgrupo_desde_producto(producto),
    actualizado_en = now()
WHERE subgrupo IS NULL
  AND public.maquinaria_subgrupo_desde_producto(producto) IS NOT NULL;

CREATE INDEX IF NOT EXISTS maquinaria_importacion_lineas_subgrupo_idx
  ON public.maquinaria_importacion_lineas (subgrupo);

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id,
  i.id AS importacion_linea_id,
  u.numero_unidad,
  i.cantidad AS cantidad_lote,
  1::integer AS cantidad,
  u.activa,
  i.source_id,
  i.source_row,
  i.source_sheet,
  i.datos_fuente,
  i.llave_interna,
  i.prioridad,
  coalesce(o.np_numero, i.np_numero) AS np_numero,
  i.proveedor,
  coalesce(l.subgrupo::text, i.subgrupo::text, i.producto) AS producto,
  i.modelo,
  u.estado_fuente,
  i.oc,
  i.po,
  u.eta,
  i.transporte,
  u.invoice_supplier,
  u.factura_proveedor_fecha,
  u.factura_proveedor_moneda,
  i.tipo_cambio,
  i.precio_oc,
  i.descuentos,
  i.precio_teorico_oc,
  i.producto_facturado,
  i.diferencia,
  i.descuento_especial,
  i.flete_seguro,
  i.proveedor_flete,
  i.origen,
  i.destino,
  i.notas,
  u.ata,
  u.costo_final_sin_iva,
  u.costo_final,
  u.chasis,
  i.venta_facturada,
  i.factura_venta,
  i.valor_venta,
  i.utilidad,
  i.margen_porcentaje,
  u.operacion_id,
  u.linea_id,
  u.unidad_id,
  u.situacion_vinculo,
  u.vinculo_manual,
  u.detalle_manual,
  i.creado_en,
  u.actualizado_en,
  coalesce(
    l.marca::text,
    i.marca_importacion::text,
    nullif(upper(btrim(i.proveedor)), '')
  ) AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
  o.np_fecha,
  o.comercial,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA')
      THEN 'EN_PARQUE'
    WHEN t.estado_disponibilidad IS NOT NULL
      THEN t.estado_disponibilidad
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NULL
      THEN 'SIN_CHASIS'
    ELSE 'SIN_CONCILIAR'
  END AS estado_disponibilidad,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA')
      THEN 'Parque de clientes'
    WHEN t.disponibilidad_detalle IS NOT NULL
      THEN t.disponibilidad_detalle
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
      THEN 'Chasis sin coincidencia en stock o parque'
    ELSE NULL
  END AS disponibilidad_detalle,
  t.sucursal AS stock_sucursal,
  t.deposito AS stock_deposito,
  t.saldo_actual AS stock_saldo,
  i.fecha_pedido
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i
  ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o
  ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l
  ON l.id = u.linea_id
LEFT JOIN public.maquinaria_unidades_operacion uo
  ON uo.id = u.unidad_id
LEFT JOIN public.clientes c
  ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id
     OR (
       st.unidad_operacion_id IS NULL
       AND st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
     )
  ORDER BY
    (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC,
    st.importado_en DESC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT p.id
  FROM public.parque_maquinas p
  WHERE public.normalizar_chasis_notificacion(p.serie)
    = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY p.actualizado_en DESC NULLS LAST, p.id
  LIMIT 1
) parque ON true
WHERE u.activa;

GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_subgrupo_desde_producto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maquinaria_subgrupo_desde_producto(text) TO authenticated;

COMMENT ON COLUMN public.maquinaria_importacion_lineas.subgrupo IS
  'Clasificacion canonica propia de la importacion; producto conserva el texto original.';

NOTIFY pgrst, 'reload schema';
