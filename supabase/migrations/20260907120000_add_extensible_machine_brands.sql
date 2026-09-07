-- Marcas extensibles para maquinaria. El enum public.marca se conserva como
-- compatibilidad con modulos historicos; marca_nombre es la fuente visible.

CREATE OR REPLACE FUNCTION public.maquinaria_normalizar_marca(p_marca text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(regexp_replace(upper(btrim(coalesce(p_marca, ''))), '\s+', ' ', 'g'), '');
$$;

CREATE TABLE IF NOT EXISTS public.maquinaria_marcas_catalogo (
  nombre text PRIMARY KEY,
  activa boolean NOT NULL DEFAULT true,
  admitida_parque boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_por uuid REFERENCES auth.users(id),
  CONSTRAINT maquinaria_marca_nombre_valido CHECK (
    nombre = public.maquinaria_normalizar_marca(nombre) AND nombre <> 'OTROS'
  )
);

INSERT INTO public.maquinaria_marcas_catalogo (nombre)
VALUES ('CLAAS'), ('HORSCH')
ON CONFLICT (nombre) DO UPDATE SET activa = true, admitida_parque = true, actualizado_en = now();

ALTER TABLE public.maquinaria_operacion_lineas ADD COLUMN IF NOT EXISTS marca_nombre text;
ALTER TABLE public.maquinaria_importacion_lineas ADD COLUMN IF NOT EXISTS marca_nombre text;
ALTER TABLE public.parque_maquinas ADD COLUMN IF NOT EXISTS marca_nombre text;
ALTER TABLE public.parque_modelos_catalogo ADD COLUMN IF NOT EXISTS marca_nombre text;

UPDATE public.maquinaria_operacion_lineas
SET marca_nombre = coalesce(
  nullif(public.maquinaria_normalizar_marca(datos_extraidos ->> 'marca_real'), 'OTROS'),
  nullif(public.maquinaria_normalizar_marca(datos_extraidos ->> 'marca'), 'OTROS'),
  nullif(public.maquinaria_normalizar_marca(datos_extraidos ->> 'marca_original'), 'OTROS'),
  nullif(public.maquinaria_normalizar_marca(datos_extraidos -> 'historico_pedido' ->> 'marca'), 'OTROS'),
  nullif(marca::text, 'OTROS')
)
WHERE marca_nombre IS NULL;

UPDATE public.maquinaria_importacion_lineas i
SET marca_nombre = coalesce(
  (SELECT l.marca_nombre FROM public.maquinaria_operacion_lineas l WHERE l.id = i.linea_id),
  nullif(public.maquinaria_normalizar_marca(i.proveedor), 'OTROS'),
  nullif(i.marca_importacion::text, 'OTROS')
)
WHERE i.marca_nombre IS NULL;

UPDATE public.parque_maquinas p
SET marca_nombre = coalesce(
  (SELECT l.marca_nombre
   FROM public.maquinaria_unidades_operacion u
   JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
   WHERE public.normalizar_chasis_notificacion(u.chasis) = public.normalizar_chasis_notificacion(p.serie)
     AND l.marca_nombre IS NOT NULL
   ORDER BY u.actualizado_en DESC LIMIT 1),
  nullif(p.marca::text, 'OTROS')
)
WHERE p.marca_nombre IS NULL;

UPDATE public.parque_modelos_catalogo
SET marca_nombre = nullif(marca::text, 'OTROS')
WHERE marca_nombre IS NULL;

INSERT INTO public.maquinaria_marcas_catalogo (nombre)
SELECT DISTINCT marca_nombre
FROM (
  SELECT marca_nombre FROM public.maquinaria_operacion_lineas
  UNION ALL SELECT marca_nombre FROM public.maquinaria_importacion_lineas
  UNION ALL SELECT marca_nombre FROM public.parque_maquinas
) marcas
WHERE marca_nombre IS NOT NULL AND marca_nombre <> 'OTROS'
ON CONFLICT (nombre) DO UPDATE SET activa = true, actualizado_en = now();

CREATE OR REPLACE FUNCTION public.maquinaria_registrar_marca_catalogo(p_marca text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_nombre text := public.maquinaria_normalizar_marca(p_marca);
BEGIN
  IF v_nombre IS NULL OR v_nombre = 'OTROS' THEN RETURN NULL; END IF;
  INSERT INTO public.maquinaria_marcas_catalogo (nombre, creado_por)
  VALUES (v_nombre, auth.uid())
  ON CONFLICT (nombre) DO UPDATE SET activa = true, actualizado_en = now();
  RETURN v_nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_preparar_linea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(coalesce(
    NEW.marca_nombre,
    NEW.datos_extraidos ->> 'marca_real',
    NEW.datos_extraidos ->> 'marca_original',
    NEW.datos_extraidos -> 'historico_pedido' ->> 'marca',
    nullif(NEW.marca::text, 'OTROS')
  ));
  NEW.elegible_parque := NEW.marca_nombre IS NOT NULL;
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_preparar_linea_trigger ON public.maquinaria_operacion_lineas;
CREATE TRIGGER maquinaria_preparar_linea_trigger
BEFORE INSERT OR UPDATE OF marca, marca_nombre, datos_extraidos ON public.maquinaria_operacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_preparar_linea();

CREATE OR REPLACE FUNCTION public.validar_marca_admitida_parque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(coalesce(NEW.marca_nombre, nullif(NEW.marca::text, 'OTROS')));
  IF NEW.marca_nombre IS NULL THEN
    RAISE EXCEPTION 'Selecciona o escribe la marca correcta' USING ERRCODE = '23514';
  END IF;
  NEW.marca := CASE NEW.marca_nombre WHEN 'CLAAS' THEN 'CLAAS'::public.marca WHEN 'HORSCH' THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_marca_admitida_parque_trigger ON public.parque_maquinas;
CREATE TRIGGER validar_marca_admitida_parque_trigger
BEFORE INSERT OR UPDATE OF marca, marca_nombre ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.validar_marca_admitida_parque();

CREATE OR REPLACE FUNCTION public.maquinaria_preparar_importacion_marca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(coalesce(
    NEW.marca_nombre,
    (SELECT l.marca_nombre FROM public.maquinaria_operacion_lineas l WHERE l.id = NEW.linea_id),
    nullif(NEW.proveedor, 'OTROS'),
    nullif(NEW.marca_importacion::text, 'OTROS')
  ));
  IF NEW.marca_nombre IS NOT NULL THEN NEW.proveedor := NEW.marca_nombre; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_preparar_importacion_marca_trigger ON public.maquinaria_importacion_lineas;
CREATE TRIGGER maquinaria_preparar_importacion_marca_trigger
BEFORE INSERT OR UPDATE OF marca_importacion, marca_nombre, proveedor, linea_id ON public.maquinaria_importacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_preparar_importacion_marca();

UPDATE public.parque_modelos_catalogo
SET marca_nombre = coalesce(marca_nombre, marca::text)
WHERE marca_nombre IS NULL;

ALTER TABLE public.parque_modelos_catalogo DROP CONSTRAINT IF EXISTS parque_modelos_catalogo_unique;
ALTER TABLE public.parque_modelos_catalogo
  ADD CONSTRAINT parque_modelos_catalogo_marca_nombre_unique UNIQUE (marca_nombre, subgrupo, clave_normalizada);

CREATE INDEX IF NOT EXISTS parque_modelos_catalogo_marca_nombre_idx
  ON public.parque_modelos_catalogo (marca_nombre, subgrupo, activo, nombre);

CREATE OR REPLACE FUNCTION public.sincronizar_modelo_maquina_catalogo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clave text;
  v_nombre text;
  v_canonico text;
BEGIN
  v_clave := public.parque_modelo_clave(NEW.modelo_tipo);
  IF v_clave = '' THEN NEW.modelo_tipo := NULL; RETURN NEW; END IF;
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(coalesce(NEW.marca_nombre, nullif(NEW.marca::text, 'OTROS')));
  v_nombre := public.parque_modelo_nombre(NEW.modelo_tipo);
  INSERT INTO public.parque_modelos_catalogo (marca, marca_nombre, subgrupo, nombre, clave_normalizada, activo, actualizado_en)
  VALUES (NEW.marca, NEW.marca_nombre, NEW.subgrupo, v_nombre, v_clave, true, now())
  ON CONFLICT (marca_nombre, subgrupo, clave_normalizada) DO UPDATE
  SET activo = true, actualizado_en = now()
  RETURNING nombre INTO v_canonico;
  NEW.modelo_tipo := v_canonico;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_modelo_maquina_catalogo ON public.parque_maquinas;
CREATE TRIGGER trg_sincronizar_modelo_maquina_catalogo
BEFORE INSERT OR UPDATE OF marca, marca_nombre, subgrupo, modelo_tipo ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_modelo_maquina_catalogo();

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_operativas
WITH (security_invoker = true)
AS
SELECT
  coalesce(u.id, l.id) AS id, l.id AS linea_id, o.id AS operacion_id, o.np_numero, o.np_fecha,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre, o.comercial, l.linea_numero,
  coalesce(l.marca_nombre, nullif(l.marca::text, 'OTROS')) AS marca,
  l.producto, l.modelo, CASE WHEN u.id IS NOT NULL THEN 1 ELSE l.cantidad END AS cantidad,
  l.condicion, l.abastecimiento,
  coalesce(nullif(l.datos_extraidos->'historico_pedido'->>'estado', ''), nullif(l.datos_extraidos->>'estado_fuente', ''), o.estado) AS estado_fuente,
  u.id AS unidad_id, u.chasis, u.valor_facturado, u.moneda, t.estado_disponibilidad, t.disponibilidad_detalle,
  mi.id AS importacion_linea_id, mi.estado_fuente AS estado_importacion_fuente, mi.eta, mi.ata, mi.proveedor,
  coalesce(nullif(l.datos_extraidos->'historico_pedido'->>'factura_numero', ''), mi.factura_venta) AS factura_venta,
  nullif(l.datos_extraidos->'historico_pedido'->>'factura_fecha', '')::date AS factura_fecha,
  nullif(l.datos_extraidos->'historico_pedido'->>'costo_producto', '')::numeric AS costo_producto,
  coalesce(u.valor_facturado, nullif(l.datos_extraidos->'historico_pedido'->>'valor_factura', '')::numeric, mi.valor_venta) AS valor_venta,
  o.observaciones, o.actualizado_en
FROM public.maquinaria_operacion_lineas l
JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT imp.* FROM public.maquinaria_importacion_lineas imp
  WHERE imp.linea_id = l.id OR imp.unidad_id = u.id OR (
    public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
    AND public.normalizar_chasis_notificacion(imp.chasis) = public.normalizar_chasis_notificacion(u.chasis)
  )
  ORDER BY (imp.unidad_id = u.id) DESC, (imp.linea_id = l.id) DESC, imp.actualizado_en DESC LIMIT 1
) mi ON true;

CREATE OR REPLACE VIEW public.maquinaria_pedidos_lineas_estado_actual
WITH (security_invoker = true)
AS SELECT detalle.*, operacion.estado AS estado_operacion
FROM public.maquinaria_pedidos_lineas_operativas detalle
JOIN public.maquinaria_operaciones operacion ON operacion.id = detalle.operacion_id;

CREATE OR REPLACE VIEW public.maquinaria_importacion_np_disponibles
WITH (security_invoker = true)
AS
SELECT o.id AS operacion_id, l.id AS linea_id, o.np_numero, o.cliente_nombre,
  coalesce(l.marca_nombre, nullif(l.marca::text, 'OTROS')) AS marca,
  l.subgrupo::text AS producto, l.modelo, count(u.id)::integer AS unidades_disponibles
FROM public.maquinaria_operaciones o
JOIN public.maquinaria_operacion_lineas l ON l.operacion_id = o.id
JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
WHERE o.estado <> 'CANCELADA' AND l.abastecimiento = 'IMPORTAR' AND u.estado <> 'CANCELADA'
  AND nullif(btrim(o.np_numero), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades iu WHERE iu.unidad_id = u.id AND iu.activa)
GROUP BY o.id, l.id, o.np_numero, o.cliente_nombre, l.marca_nombre, l.marca, l.subgrupo, l.modelo
HAVING count(u.id) > 0;

CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet, i.datos_fuente,
  i.llave_interna, i.prioridad, coalesce(o.np_numero, i.np_numero) AS np_numero,
  coalesce(i.marca_nombre, nullif(i.proveedor, 'OTROS')) AS proveedor,
  coalesce(l.subgrupo::text, i.subgrupo::text, i.producto) AS producto,
  i.modelo, u.estado_fuente, i.oc, i.po, u.eta, i.transporte, u.invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda, i.tipo_cambio, i.precio_oc,
  i.descuentos, i.precio_teorico_oc, i.producto_facturado, i.diferencia,
  i.descuento_especial, i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  u.ata, u.costo_final_sin_iva, u.costo_final, u.chasis, i.venta_facturada,
  i.factura_venta, i.valor_venta, i.utilidad, i.margen_porcentaje, u.operacion_id,
  u.linea_id, u.unidad_id, u.situacion_vinculo, u.vinculo_manual, u.detalle_manual,
  i.creado_en, u.actualizado_en,
  coalesce(l.marca_nombre, i.marca_nombre, nullif(l.marca::text, 'OTROS'),
    nullif(i.marca_importacion::text, 'OTROS'), nullif(upper(btrim(i.proveedor)), 'OTROS')) AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre, o.np_fecha, o.comercial,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'EN_PARQUE'
    WHEN t.estado_disponibilidad IS NOT NULL THEN t.estado_disponibilidad
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NULL THEN 'SIN_CHASIS'
    ELSE 'SIN_CONCILIAR'
  END AS estado_disponibilidad,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'Parque de clientes'
    WHEN t.disponibilidad_detalle IS NOT NULL THEN t.disponibilidad_detalle
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL THEN 'Chasis sin coincidencia en stock o parque'
    ELSE NULL
  END AS disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito, t.saldo_actual AS stock_saldo,
  i.fecha_pedido
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
LEFT JOIN public.maquinaria_unidades_operacion uo ON uo.id = u.unidad_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id OR (
    st.unidad_operacion_id IS NULL
    AND st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  )
  ORDER BY (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT p.id FROM public.parque_maquinas p
  WHERE public.normalizar_chasis_notificacion(p.serie) = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY p.actualizado_en DESC NULLS LAST, p.id LIMIT 1
) parque ON true
WHERE u.activa;

ALTER TABLE public.maquinaria_marcas_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Catalogo marcas select authenticated" ON public.maquinaria_marcas_catalogo;
CREATE POLICY "Catalogo marcas select authenticated" ON public.maquinaria_marcas_catalogo FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.maquinaria_marcas_catalogo TO authenticated;
GRANT SELECT ON public.maquinaria_pedidos_lineas_operativas, public.maquinaria_pedidos_lineas_estado_actual,
  public.maquinaria_importacion_np_disponibles, public.maquinaria_importacion_unidades_operativas TO authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_registrar_marca_catalogo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_registrar_marca_catalogo(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
