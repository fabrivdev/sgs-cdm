-- Trazabilidad unificada por chasis: pedido -> importacion -> stock -> parque.
-- El stock deja de colapsar unidades distintas por producto_codigo y su
-- disponibilidad se deriva de las relaciones activas, no de etiquetas manuales.

ALTER TABLE public.parque_stock_maquinas
  DROP CONSTRAINT IF EXISTS parque_stock_maquinas_producto_codigo_key;

ALTER TABLE public.parque_stock_maquinas
  ADD COLUMN IF NOT EXISTS stock_key text,
  ADD COLUMN IF NOT EXISTS source_row integer,
  ADD COLUMN IF NOT EXISTS datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.parque_stock_maquinas s
SET stock_key = CASE
  WHEN public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL
    THEN 'CHASIS:' || public.normalizar_chasis_notificacion(s.chasis)
  ELSE concat_ws(':',
    'PRODUCTO',
    public.parque_normalizar_clave(s.producto_codigo),
    public.parque_normalizar_clave(s.sucursal::text),
    public.parque_normalizar_clave(s.deposito)
  )
END
WHERE nullif(btrim(s.stock_key), '') IS NULL;

ALTER TABLE public.parque_stock_maquinas
  ALTER COLUMN stock_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS parque_stock_maquinas_stock_key_idx
  ON public.parque_stock_maquinas (stock_key);
CREATE INDEX IF NOT EXISTS parque_stock_maquinas_chasis_normalizado_idx
  ON public.parque_stock_maquinas (public.normalizar_chasis_notificacion(chasis))
  WHERE public.normalizar_chasis_notificacion(chasis) IS NOT NULL;

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

  -- La funcion corre en una sola transaccion: si una fila falla, la foto
  -- anterior permanece intacta.
  DELETE FROM public.parque_stock_maquinas;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    IF nullif(btrim(v_fila->>'producto_codigo'), '') IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.parque_stock_maquinas (
      producto_codigo,
      stock_key,
      source_row,
      sucursal,
      filial_original,
      deposito,
      tipo,
      marca,
      modelo,
      estado,
      chasis,
      saldo_actual,
      carga_id,
      datos_fuente,
      importado_en
    ) VALUES (
      btrim(v_fila->>'producto_codigo'),
      coalesce(
        nullif(btrim(v_fila->>'stock_key'), ''),
        CASE
          WHEN public.normalizar_chasis_notificacion(v_fila->>'chasis') IS NOT NULL
            THEN 'CHASIS:' || public.normalizar_chasis_notificacion(v_fila->>'chasis')
          ELSE concat_ws(':',
            'PRODUCTO',
            public.parque_normalizar_clave(v_fila->>'producto_codigo'),
            public.parque_normalizar_clave(v_fila->>'sucursal'),
            public.parque_normalizar_clave(v_fila->>'deposito'),
            coalesce(v_fila->>'source_row', '0')
          )
        END
      ),
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
      p_carga_id,
      coalesce(v_fila->'datos_fuente', '{}'::jsonb),
      now()
    );

    v_insertadas := v_insertadas + 1;
    IF public.normalizar_chasis_notificacion(v_fila->>'chasis') IS NOT NULL THEN
      v_con_chasis := v_con_chasis + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'filas_insertadas', v_insertadas,
    'filas_con_chasis', v_con_chasis,
    'filas_sin_chasis', v_insertadas - v_con_chasis
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.maquinaria_stock_trazabilidad
WITH (security_invoker = true)
AS
WITH stock_base AS (
  SELECT
    s.*,
    public.normalizar_chasis_notificacion(s.chasis) AS chasis_normalizado,
    count(*) FILTER (
      WHERE public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL
    ) OVER (
      PARTITION BY public.normalizar_chasis_notificacion(s.chasis)
    ) AS repeticiones_chasis
  FROM public.parque_stock_maquinas s
), vinculada AS (
  SELECT
    sb.*,
    u.id AS unidad_operacion_id,
    l.id AS linea_operacion_id,
    o.id AS operacion_id,
    o.np_numero,
    o.np_fecha,
    coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
    o.comercial,
    o.estado AS estado_operacion,
    coalesce(
      nullif(l.datos_extraidos->'historico_pedido'->>'estado', ''),
      nullif(l.datos_extraidos->>'estado_fuente', '')
    ) AS estado_pedido_fuente,
    i.id AS importacion_linea_id,
    i.estado_fuente AS estado_importacion_fuente,
    i.oc,
    i.po,
    i.eta,
    i.ata,
    i.proveedor,
    i.situacion_vinculo,
    p.id AS parque_maquina_id,
    p.cliente_id AS parque_cliente_id
  FROM stock_base sb
  LEFT JOIN public.maquinaria_unidades_operacion u
    ON public.normalizar_chasis_notificacion(u.chasis) = sb.chasis_normalizado
  LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  LEFT JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  LEFT JOIN public.clientes c ON c.id = o.cliente_id
  LEFT JOIN LATERAL (
    SELECT mi.*
    FROM public.maquinaria_importacion_lineas mi
    WHERE mi.unidad_id = u.id
       OR (
         sb.chasis_normalizado IS NOT NULL
         AND public.normalizar_chasis_notificacion(mi.chasis) = sb.chasis_normalizado
       )
    ORDER BY
      (mi.unidad_id = u.id) DESC,
      mi.actualizado_en DESC,
      mi.source_row
    LIMIT 1
  ) i ON true
  LEFT JOIN public.parque_maquinas p
    ON public.normalizar_chasis_notificacion(p.serie) = sb.chasis_normalizado
)
SELECT
  v.*,
  CASE
    WHEN v.chasis_normalizado IS NULL THEN 'SIN_CHASIS'
    WHEN v.repeticiones_chasis > 1 THEN 'CONFLICTO'
    WHEN v.parque_maquina_id IS NOT NULL THEN 'EN_PARQUE'
    WHEN lower(coalesce(v.estado_pedido_fuente, '')) = 'completado'
      OR v.estado_operacion IN ('FACTURADA', 'CERRADA') THEN 'VENDIDO_PENDIENTE_ENTREGA'
    WHEN lower(coalesce(v.estado_pedido_fuente, '')) = 'pendiente'
      AND coalesce(v.estado_operacion, '') <> 'CANCELADA' THEN 'RESERVADO'
    WHEN v.operacion_id IS NOT NULL
      AND v.estado_operacion NOT IN ('CANCELADA', 'CERRADA') THEN 'RESERVADO'
    ELSE 'DISPONIBLE'
  END AS estado_disponibilidad,
  CASE
    WHEN v.parque_maquina_id IS NOT NULL THEN 'Parque de clientes'
    WHEN lower(coalesce(v.estado_pedido_fuente, '')) = 'completado'
      OR v.estado_operacion IN ('FACTURADA', 'CERRADA') THEN concat_ws(' · ', v.np_numero, v.cliente_nombre)
    WHEN v.operacion_id IS NOT NULL AND coalesce(v.estado_operacion, '') <> 'CANCELADA'
      THEN concat_ws(' · ', v.np_numero, v.cliente_nombre)
    ELSE NULL
  END AS disponibilidad_detalle
FROM vinculada v;

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  coalesce(u.id, l.id) AS id,
  l.id AS linea_id,
  o.id AS operacion_id,
  o.np_numero,
  o.np_fecha,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre,
  o.comercial,
  l.linea_numero,
  l.marca::text AS marca,
  l.producto,
  l.modelo,
  CASE WHEN u.id IS NOT NULL THEN 1 ELSE l.cantidad END AS cantidad,
  l.condicion,
  l.abastecimiento,
  coalesce(
    nullif(l.datos_extraidos->'historico_pedido'->>'estado', ''),
    nullif(l.datos_extraidos->>'estado_fuente', ''),
    o.estado
  ) AS estado_fuente,
  u.id AS unidad_id,
  u.chasis,
  u.valor_facturado,
  u.moneda,
  t.estado_disponibilidad,
  t.disponibilidad_detalle,
  mi.id AS importacion_linea_id,
  mi.estado_fuente AS estado_importacion_fuente,
  mi.eta,
  mi.ata,
  mi.proveedor,
  coalesce(
    nullif(l.datos_extraidos->'historico_pedido'->>'factura_numero', ''),
    mi.factura_venta
  ) AS factura_venta,
  nullif(l.datos_extraidos->'historico_pedido'->>'factura_fecha', '')::date AS factura_fecha,
  nullif(l.datos_extraidos->'historico_pedido'->>'costo_producto', '')::numeric AS costo_producto,
  coalesce(
    u.valor_facturado,
    nullif(l.datos_extraidos->'historico_pedido'->>'valor_factura', '')::numeric,
    mi.valor_venta
  ) AS valor_venta,
  o.observaciones,
  o.actualizado_en
FROM public.maquinaria_operacion_lineas l
JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT imp.*
  FROM public.maquinaria_importacion_lineas imp
  WHERE imp.linea_id = l.id
     OR imp.unidad_id = u.id
     OR (
       public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(imp.chasis)
         = public.normalizar_chasis_notificacion(u.chasis)
     )
  ORDER BY
    (imp.unidad_id = u.id) DESC,
    (imp.linea_id = l.id) DESC,
    imp.actualizado_en DESC
  LIMIT 1
) mi ON true;

CREATE OR REPLACE VIEW public.maquinaria_importaciones_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  i.*,
  l.marca::text AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
  o.np_fecha,
  o.comercial,
  t.estado_disponibilidad,
  t.disponibilidad_detalle,
  t.sucursal AS stock_sucursal,
  t.deposito AS stock_deposito,
  t.saldo_actual AS stock_saldo
FROM public.maquinaria_importacion_lineas i
LEFT JOIN public.maquinaria_operaciones o ON o.id = i.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = i.linea_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.chasis_normalizado = public.normalizar_chasis_notificacion(i.chasis)
  ORDER BY (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true;

GRANT SELECT ON public.maquinaria_stock_trazabilidad TO authenticated;
GRANT SELECT ON public.maquinaria_pedidos_lineas_operativas TO authenticated;
GRANT SELECT ON public.maquinaria_importaciones_lineas_operativas TO authenticated;

NOTIFY pgrst, 'reload schema';
