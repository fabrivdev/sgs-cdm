-- Reserva persistente entre una unidad comercial y una unidad de stock.
-- La relacion sobrevive al reemplazo completo de la foto de stock siempre
-- que la fila pueda reconocerse por stock_key o por chasis.

ALTER TABLE public.parque_stock_maquinas
  ADD COLUMN IF NOT EXISTS unidad_operacion_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parque_stock_maquinas_unidad_operacion_id_fkey'
      AND conrelid = 'public.parque_stock_maquinas'::regclass
  ) THEN
    ALTER TABLE public.parque_stock_maquinas
      ADD CONSTRAINT parque_stock_maquinas_unidad_operacion_id_fkey
      FOREIGN KEY (unidad_operacion_id)
      REFERENCES public.maquinaria_unidades_operacion(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS parque_stock_maquinas_unidad_operacion_unique
  ON public.parque_stock_maquinas (unidad_operacion_id)
  WHERE unidad_operacion_id IS NOT NULL;

-- Vincula automaticamente solo coincidencias de chasis no ambiguas.
WITH stock_unico AS (
  SELECT
    min(s.id::text)::uuid AS stock_id,
    public.normalizar_chasis_notificacion(s.chasis) AS chasis_normalizado
  FROM public.parque_stock_maquinas s
  WHERE public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL
  GROUP BY public.normalizar_chasis_notificacion(s.chasis)
  HAVING count(*) = 1
), unidad_unica AS (
  SELECT
    min(u.id::text)::uuid AS unidad_id,
    public.normalizar_chasis_notificacion(u.chasis) AS chasis_normalizado
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
    AND o.estado <> 'CANCELADA'
  GROUP BY public.normalizar_chasis_notificacion(u.chasis)
  HAVING count(*) = 1
)
UPDATE public.parque_stock_maquinas s
SET unidad_operacion_id = u.unidad_id
FROM stock_unico su
JOIN unidad_unica u USING (chasis_normalizado)
WHERE s.id = su.stock_id
  AND s.unidad_operacion_id IS NULL;

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

  -- La funcion corre en una sola transaccion: si una fila falla, la foto
  -- anterior y sus reservas permanecen intactas.
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

CREATE OR REPLACE FUNCTION public.maquinaria_asignar_stock(
  p_unidad_id uuid,
  p_stock_id uuid,
  p_chasis text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_operacion_estado text;
  v_stock_chasis text;
  v_stock_saldo numeric;
  v_stock_unidad uuid;
  v_stock_operacion_estado text;
  v_chasis_final text := nullif(btrim(p_chasis), '');
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden asignar stock'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.estado
    INTO v_operacion_estado
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = p_unidad_id
  FOR UPDATE OF u;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La unidad de la operacion no existe';
  END IF;
  IF v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'No se puede reservar stock para una operacion cancelada';
  END IF;

  IF p_stock_id IS NOT NULL THEN
    SELECT s.chasis, s.saldo_actual, s.unidad_operacion_id
      INTO v_stock_chasis, v_stock_saldo, v_stock_unidad
    FROM public.parque_stock_maquinas s
    WHERE s.id = p_stock_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La unidad de stock ya no existe';
    END IF;
    IF coalesce(v_stock_saldo, 0) <= 0 THEN
      RAISE EXCEPTION 'La unidad seleccionada no tiene stock disponible';
    END IF;
    IF v_stock_unidad IS NOT NULL AND v_stock_unidad <> p_unidad_id THEN
      SELECT o.estado
        INTO v_stock_operacion_estado
      FROM public.maquinaria_unidades_operacion u
      JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
      JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
      WHERE u.id = v_stock_unidad;

      IF coalesce(v_stock_operacion_estado, '') = 'CANCELADA' THEN
        UPDATE public.parque_stock_maquinas
        SET unidad_operacion_id = NULL
        WHERE id = p_stock_id;
      ELSE
        RAISE EXCEPTION 'La unidad de stock ya esta reservada por otra operacion';
      END IF;
    END IF;

    IF public.normalizar_chasis_notificacion(v_stock_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_chasis_final) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_stock_chasis)
         <> public.normalizar_chasis_notificacion(v_chasis_final) THEN
      RAISE EXCEPTION 'El chasis ingresado no coincide con el chasis del stock';
    END IF;

    IF v_chasis_final IS NULL THEN
      v_chasis_final := nullif(btrim(v_stock_chasis), '');
    END IF;
  END IF;

  UPDATE public.parque_stock_maquinas
  SET unidad_operacion_id = NULL
  WHERE unidad_operacion_id = p_unidad_id
    AND (p_stock_id IS NULL OR id <> p_stock_id);

  IF p_stock_id IS NOT NULL THEN
    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = p_unidad_id
    WHERE id = p_stock_id;
  END IF;

  UPDATE public.maquinaria_unidades_operacion
  SET chasis = v_chasis_final,
      actualizado_en = now()
  WHERE id = p_unidad_id;

  RETURN jsonb_build_object(
    'unidad_id', p_unidad_id,
    'stock_id', p_stock_id,
    'chasis', v_chasis_final,
    'vinculada', p_stock_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_asignar_stock(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_asignar_stock(uuid, uuid, text) TO authenticated;

-- Se recrean porque el nuevo campo persistente cambia la forma de la vista.
DROP VIEW IF EXISTS public.maquinaria_importaciones_lineas_operativas;
DROP VIEW IF EXISTS public.maquinaria_pedidos_lineas_operativas;
DROP VIEW IF EXISTS public.maquinaria_stock_trazabilidad;

CREATE VIEW public.maquinaria_stock_trazabilidad
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
    u.id AS unidad_vinculada_id,
    (sb.unidad_operacion_id IS NOT NULL) AS vinculo_persistente,
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
    i.oc, i.po, i.eta, i.ata, i.proveedor, i.situacion_vinculo,
    p.id AS parque_maquina_id,
    p.cliente_id AS parque_cliente_id
  FROM stock_base sb
  LEFT JOIN LATERAL (
    SELECT mu.*
    FROM public.maquinaria_unidades_operacion mu
    WHERE mu.id = sb.unidad_operacion_id
       OR (
         sb.unidad_operacion_id IS NULL
         AND sb.chasis_normalizado IS NOT NULL
         AND public.normalizar_chasis_notificacion(mu.chasis) = sb.chasis_normalizado
       )
    ORDER BY (mu.id = sb.unidad_operacion_id) DESC, mu.actualizado_en DESC
    LIMIT 1
  ) u ON true
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
    ORDER BY (mi.unidad_id = u.id) DESC, mi.actualizado_en DESC, mi.source_row
    LIMIT 1
  ) i ON true
  LEFT JOIN public.parque_maquinas p
    ON public.normalizar_chasis_notificacion(p.serie) = sb.chasis_normalizado
)
SELECT
  v.*,
  CASE
    WHEN v.repeticiones_chasis > 1 AND NOT v.vinculo_persistente THEN 'CONFLICTO'
    WHEN v.parque_maquina_id IS NOT NULL THEN 'EN_PARQUE'
    WHEN lower(coalesce(v.estado_pedido_fuente, '')) = 'completado'
      OR v.estado_operacion IN ('FACTURADA', 'CERRADA') THEN 'VENDIDO_PENDIENTE_ENTREGA'
    WHEN v.unidad_vinculada_id IS NOT NULL
      AND coalesce(v.estado_operacion, '') <> 'CANCELADA' THEN 'RESERVADO'
    WHEN v.chasis_normalizado IS NULL THEN 'SIN_CHASIS'
    ELSE 'DISPONIBLE'
  END AS estado_disponibilidad,
  CASE
    WHEN v.parque_maquina_id IS NOT NULL THEN 'Parque de clientes'
    WHEN v.unidad_vinculada_id IS NOT NULL
      AND coalesce(v.estado_operacion, '') <> 'CANCELADA'
      THEN concat_ws(' · ', v.np_numero, v.cliente_nombre)
    ELSE NULL
  END AS disponibilidad_detalle
FROM vinculada v;

CREATE VIEW public.maquinaria_pedidos_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  coalesce(u.id, l.id) AS id,
  l.id AS linea_id, o.id AS operacion_id, o.np_numero, o.np_fecha,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre,
  o.comercial, l.linea_numero, l.marca::text AS marca, l.producto, l.modelo,
  CASE WHEN u.id IS NOT NULL THEN 1 ELSE l.cantidad END AS cantidad,
  l.condicion, l.abastecimiento,
  coalesce(
    nullif(l.datos_extraidos->'historico_pedido'->>'estado', ''),
    nullif(l.datos_extraidos->>'estado_fuente', ''), o.estado
  ) AS estado_fuente,
  u.id AS unidad_id, u.chasis, u.valor_facturado, u.moneda,
  t.estado_disponibilidad, t.disponibilidad_detalle,
  mi.id AS importacion_linea_id, mi.estado_fuente AS estado_importacion_fuente,
  mi.eta, mi.ata, mi.proveedor,
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
  o.observaciones, o.actualizado_en
FROM public.maquinaria_operacion_lineas l
JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.id
     OR (
       st.unidad_operacion_id IS NULL
       AND st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
     )
  ORDER BY (st.unidad_operacion_id = u.id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT imp.*
  FROM public.maquinaria_importacion_lineas imp
  WHERE imp.linea_id = l.id OR imp.unidad_id = u.id
     OR (
       public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(imp.chasis)
         = public.normalizar_chasis_notificacion(u.chasis)
     )
  ORDER BY (imp.unidad_id = u.id) DESC, (imp.linea_id = l.id) DESC,
    imp.actualizado_en DESC
  LIMIT 1
) mi ON true;

CREATE VIEW public.maquinaria_importaciones_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  i.*, l.marca::text AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
  o.np_fecha, o.comercial,
  t.estado_disponibilidad, t.disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito,
  t.saldo_actual AS stock_saldo
FROM public.maquinaria_importacion_lineas i
LEFT JOIN public.maquinaria_operaciones o ON o.id = i.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = i.linea_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = i.unidad_id
     OR (
       st.unidad_operacion_id IS NULL
       AND st.chasis_normalizado = public.normalizar_chasis_notificacion(i.chasis)
     )
  ORDER BY (st.unidad_operacion_id = i.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true;

GRANT SELECT ON public.maquinaria_stock_trazabilidad TO authenticated;
GRANT SELECT ON public.maquinaria_pedidos_lineas_operativas TO authenticated;
GRANT SELECT ON public.maquinaria_importaciones_lineas_operativas TO authenticated;

NOTIFY pgrst, 'reload schema';