-- Una fila del maestro puede representar varias maquinas fisicas. Esta capa
-- conserva la fila como cabecera comercial/logistica y materializa una unidad
-- independiente por cada cantidad, para que chasis, factura, fechas y pedido
-- puedan evolucionar por separado.

CREATE TABLE IF NOT EXISTS public.maquinaria_importacion_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_linea_id uuid NOT NULL
    REFERENCES public.maquinaria_importacion_lineas(id) ON DELETE CASCADE,
  numero_unidad integer NOT NULL CHECK (numero_unidad > 0),
  activa boolean NOT NULL DEFAULT true,
  chasis text,
  estado_fuente text,
  eta date,
  ata date,
  invoice_supplier text,
  factura_proveedor_fecha date,
  costo_final_sin_iva numeric,
  costo_final numeric,
  operacion_id uuid REFERENCES public.maquinaria_operaciones(id) ON DELETE SET NULL,
  linea_id uuid REFERENCES public.maquinaria_operacion_lineas(id) ON DELETE SET NULL,
  unidad_id uuid REFERENCES public.maquinaria_unidades_operacion(id) ON DELETE SET NULL,
  situacion_vinculo text NOT NULL DEFAULT 'SIN PEDIDO',
  vinculo_manual boolean NOT NULL DEFAULT false,
  detalle_manual boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (importacion_linea_id, numero_unidad),
  CONSTRAINT maquinaria_importacion_unidades_vinculo_check CHECK (
    situacion_vinculo IN (
      'SIN PEDIDO', 'PEDIDO VINCULADO', 'CHASIS VINCULADO',
      'CONFLICTO DE CHASIS'
    )
  )
);

CREATE INDEX IF NOT EXISTS maquinaria_importacion_unidades_linea_idx
  ON public.maquinaria_importacion_unidades(importacion_linea_id, activa, numero_unidad);
CREATE INDEX IF NOT EXISTS maquinaria_importacion_unidades_chasis_idx
  ON public.maquinaria_importacion_unidades(public.normalizar_chasis_notificacion(chasis));
CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_importacion_unidades_pedido_unidad_unique
  ON public.maquinaria_importacion_unidades(unidad_id)
  WHERE unidad_id IS NOT NULL;

-- Migra lo ya cargado. Si datos historicos vincularon mas de una fila de
-- importacion a la misma unidad de pedido, solo se conserva el vinculo mas
-- reciente; las demas unidades quedan disponibles para corregirlas.
WITH cabeceras AS (
  SELECT
    i.*,
    row_number() OVER (
      PARTITION BY i.unidad_id
      ORDER BY i.vinculo_manual DESC, i.actualizado_en DESC, i.id
    ) AS rango_vinculo
  FROM public.maquinaria_importacion_lineas i
), expandidas AS (
  SELECT c.*, gs.numero_unidad
  FROM cabeceras c
  CROSS JOIN LATERAL generate_series(1, greatest(coalesce(c.cantidad, 1), 1))
    AS gs(numero_unidad)
)
INSERT INTO public.maquinaria_importacion_unidades (
  importacion_linea_id, numero_unidad, chasis, estado_fuente, eta, ata,
  invoice_supplier, costo_final_sin_iva, costo_final,
  operacion_id, linea_id, unidad_id, situacion_vinculo, vinculo_manual
)
SELECT
  e.id, e.numero_unidad,
  CASE WHEN e.numero_unidad = 1 THEN e.chasis END,
  e.estado_fuente, e.eta, e.ata, e.invoice_supplier,
  e.costo_final_sin_iva, e.costo_final,
  CASE WHEN e.numero_unidad = 1 AND (e.unidad_id IS NULL OR e.rango_vinculo = 1)
    THEN e.operacion_id END,
  CASE WHEN e.numero_unidad = 1 AND (e.unidad_id IS NULL OR e.rango_vinculo = 1)
    THEN e.linea_id END,
  CASE WHEN e.numero_unidad = 1 AND e.rango_vinculo = 1 THEN e.unidad_id END,
  CASE
    WHEN e.numero_unidad = 1 AND (e.unidad_id IS NULL OR e.rango_vinculo = 1)
      THEN e.situacion_vinculo
    ELSE 'SIN PEDIDO'
  END,
  e.numero_unidad = 1 AND e.rango_vinculo = 1 AND e.vinculo_manual
FROM expandidas e
ON CONFLICT (importacion_linea_id, numero_unidad) DO NOTHING;

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_unidades_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cantidad integer := greatest(coalesce(NEW.cantidad, 1), 1);
BEGIN
  INSERT INTO public.maquinaria_importacion_unidades (
    importacion_linea_id, numero_unidad, chasis, estado_fuente, eta, ata,
    invoice_supplier, costo_final_sin_iva, costo_final
  )
  SELECT
    NEW.id, n,
    CASE WHEN n = 1 THEN NEW.chasis END,
    NEW.estado_fuente, NEW.eta, NEW.ata, NEW.invoice_supplier,
    NEW.costo_final_sin_iva, NEW.costo_final
  FROM generate_series(1, v_cantidad) AS n
  ON CONFLICT (importacion_linea_id, numero_unidad) DO UPDATE
  SET activa = true,
      estado_fuente = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          THEN maquinaria_importacion_unidades.estado_fuente
        ELSE EXCLUDED.estado_fuente
      END,
      eta = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.eta ELSE EXCLUDED.eta END,
      ata = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.ata ELSE EXCLUDED.ata END,
      invoice_supplier = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.invoice_supplier ELSE EXCLUDED.invoice_supplier END,
      costo_final_sin_iva = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final_sin_iva ELSE EXCLUDED.costo_final_sin_iva END,
      costo_final = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final ELSE EXCLUDED.costo_final END,
      chasis = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          OR maquinaria_importacion_unidades.vinculo_manual
          OR EXCLUDED.numero_unidad <> 1
          THEN maquinaria_importacion_unidades.chasis
        ELSE coalesce(EXCLUDED.chasis, maquinaria_importacion_unidades.chasis)
      END,
      actualizado_en = now();

  -- Nunca se elimina una unidad que ya tiene trazabilidad. Si baja la cantidad
  -- del maestro solo se desactivan los excedentes que siguen completamente libres.
  UPDATE public.maquinaria_importacion_unidades u
  SET activa = false, actualizado_en = now()
  WHERE u.importacion_linea_id = NEW.id
    AND u.numero_unidad > v_cantidad
    AND u.unidad_id IS NULL
    AND public.normalizar_chasis_notificacion(u.chasis) IS NULL
    AND u.invoice_supplier IS NULL
    AND u.ata IS NULL;

  -- El vinculo automatico historico de la cabecera se lleva solo a una unidad.
  -- Una decision manual en la unidad fisica siempre prevalece.
  IF NEW.unidad_id IS NOT NULL THEN
    UPDATE public.maquinaria_importacion_unidades u
    SET operacion_id = NEW.operacion_id,
        linea_id = NEW.linea_id,
        unidad_id = NEW.unidad_id,
        situacion_vinculo = NEW.situacion_vinculo,
        actualizado_en = now()
    WHERE u.importacion_linea_id = NEW.id
      AND u.numero_unidad = 1
      AND NOT u.vinculo_manual
      AND NOT EXISTS (
        SELECT 1 FROM public.maquinaria_importacion_unidades ocupada
        WHERE ocupada.unidad_id = NEW.unidad_id AND ocupada.id <> u.id
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_sincronizar_unidades_importacion_trigger
  ON public.maquinaria_importacion_lineas;
CREATE TRIGGER maquinaria_sincronizar_unidades_importacion_trigger
AFTER INSERT OR UPDATE OF cantidad, chasis, estado_fuente, eta, ata,
  invoice_supplier, costo_final_sin_iva, costo_final, operacion_id, linea_id,
  unidad_id, situacion_vinculo
ON public.maquinaria_importacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_unidades_importacion();

CREATE OR REPLACE FUNCTION public.maquinaria_proteger_unidad_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (
       NEW.chasis IS DISTINCT FROM OLD.chasis
       OR NEW.estado_fuente IS DISTINCT FROM OLD.estado_fuente
       OR NEW.eta IS DISTINCT FROM OLD.eta
       OR NEW.ata IS DISTINCT FROM OLD.ata
       OR NEW.invoice_supplier IS DISTINCT FROM OLD.invoice_supplier
       OR NEW.factura_proveedor_fecha IS DISTINCT FROM OLD.factura_proveedor_fecha
       OR NEW.costo_final_sin_iva IS DISTINCT FROM OLD.costo_final_sin_iva
       OR NEW.costo_final IS DISTINCT FROM OLD.costo_final
       OR NEW.operacion_id IS DISTINCT FROM OLD.operacion_id
       OR NEW.linea_id IS DISTINCT FROM OLD.linea_id
       OR NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
     )
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden modificar unidades de importacion'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_proteger_unidad_importacion_trigger
  ON public.maquinaria_importacion_unidades;
CREATE TRIGGER maquinaria_proteger_unidad_importacion_trigger
BEFORE UPDATE ON public.maquinaria_importacion_unidades
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_unidad_importacion();

ALTER TABLE public.maquinaria_importacion_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso modulo parque" ON public.maquinaria_importacion_unidades;
CREATE POLICY "Acceso modulo parque" ON public.maquinaria_importacion_unidades
FOR ALL TO authenticated
USING (public.has_module_access(auth.uid(), 'parque'))
WITH CHECK (public.has_module_access(auth.uid(), 'parque'));

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
  i.source_id, i.source_row, i.source_sheet, i.datos_fuente,
  i.llave_interna, i.prioridad,
  coalesce(o.np_numero, i.np_numero) AS np_numero,
  i.proveedor, i.producto, i.modelo,
  coalesce(u.estado_fuente, i.estado_fuente) AS estado_fuente,
  i.oc, i.po, coalesce(u.eta, i.eta) AS eta,
  i.transporte, coalesce(u.invoice_supplier, i.invoice_supplier) AS invoice_supplier,
  u.factura_proveedor_fecha,
  i.tipo_cambio, i.precio_oc, i.descuentos, i.precio_teorico_oc,
  i.producto_facturado, i.diferencia, i.descuento_especial,
  i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  coalesce(u.ata, i.ata) AS ata,
  coalesce(u.costo_final_sin_iva, i.costo_final_sin_iva) AS costo_final_sin_iva,
  coalesce(u.costo_final, i.costo_final) AS costo_final,
  coalesce(u.chasis, CASE WHEN u.numero_unidad = 1 THEN i.chasis END) AS chasis,
  i.venta_facturada, i.factura_venta, i.valor_venta, i.utilidad,
  i.margen_porcentaje,
  u.operacion_id, u.linea_id, u.unidad_id, u.situacion_vinculo,
  u.vinculo_manual, u.detalle_manual,
  i.creado_en, u.actualizado_en,
  l.marca::text AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre,
  o.np_fecha, o.comercial,
  t.estado_disponibilidad, t.disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito,
  t.saldo_actual AS stock_saldo
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.*
  FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id
     OR (
       st.unidad_operacion_id IS NULL
       AND st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
     )
  ORDER BY (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC
  LIMIT 1
) t ON true
WHERE u.activa;

CREATE OR REPLACE FUNCTION public.maquinaria_asignar_importacion(
  p_unidad_id uuid,
  p_importacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_operacion_id uuid;
  v_linea_id uuid;
  v_operacion_estado text;
  v_abastecimiento text;
  v_unidad_chasis text;
  v_importacion_chasis text;
  v_importacion_operacion uuid;
  v_importacion_unidad uuid;
  v_importacion_operacion_estado text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden asignar importaciones'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.id, l.id, o.estado, l.abastecimiento, u.chasis
  INTO v_operacion_id, v_linea_id, v_operacion_estado,
    v_abastecimiento, v_unidad_chasis
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE u.id = p_unidad_id
  FOR UPDATE OF u;

  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad del pedido no existe'; END IF;
  IF v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'No se puede asignar una importacion a un pedido cancelado';
  END IF;
  IF v_abastecimiento <> 'IMPORTAR' THEN
    RAISE EXCEPTION 'La linea del pedido no tiene origen IMPORTAR';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT iu.chasis, iu.operacion_id, iu.unidad_id, o.estado
    INTO v_importacion_chasis, v_importacion_operacion,
      v_importacion_unidad, v_importacion_operacion_estado
    FROM public.maquinaria_importacion_unidades iu
    LEFT JOIN public.maquinaria_operaciones o ON o.id = iu.operacion_id
    WHERE iu.id = p_importacion_id AND iu.activa
    FOR UPDATE OF iu;

    IF NOT FOUND THEN RAISE EXCEPTION 'La unidad de importacion ya no existe'; END IF;
    IF v_importacion_operacion IS NOT NULL
       AND v_importacion_operacion <> v_operacion_id
       AND coalesce(v_importacion_operacion_estado, '') <> 'CANCELADA' THEN
      RAISE EXCEPTION 'La maquina importada ya esta vinculada a otro pedido activo';
    END IF;
    IF v_importacion_unidad IS NOT NULL AND v_importacion_unidad <> p_unidad_id THEN
      RAISE EXCEPTION 'La maquina importada ya esta asignada a otra unidad';
    END IF;
    IF public.normalizar_chasis_notificacion(v_importacion_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_unidad_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_importacion_chasis)
         <> public.normalizar_chasis_notificacion(v_unidad_chasis) THEN
      RAISE EXCEPTION 'El chasis del pedido no coincide con el de la importacion';
    END IF;
  END IF;

  UPDATE public.maquinaria_importacion_unidades
  SET operacion_id = NULL, linea_id = NULL, unidad_id = NULL,
      situacion_vinculo = 'SIN PEDIDO', vinculo_manual = true,
      actualizado_en = now()
  WHERE unidad_id = p_unidad_id
    AND (p_importacion_id IS NULL OR id <> p_importacion_id);

  IF p_importacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importacion_unidades
    SET operacion_id = v_operacion_id, linea_id = v_linea_id,
        unidad_id = p_unidad_id,
        situacion_vinculo = CASE
          WHEN public.normalizar_chasis_notificacion(chasis) IS NOT NULL
            THEN 'CHASIS VINCULADO' ELSE 'PEDIDO VINCULADO' END,
        vinculo_manual = true, actualizado_en = now()
    WHERE id = p_importacion_id;

    UPDATE public.maquinaria_unidades_operacion
    SET chasis = coalesce(nullif(btrim(chasis), ''), nullif(btrim(v_importacion_chasis), '')),
        estado = CASE WHEN estado = 'PENDIENTE' THEN 'EN_TRANSITO' ELSE estado END,
        actualizado_en = now()
    WHERE id = p_unidad_id;

    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE unidad_operacion_id = p_unidad_id;
  END IF;

  RETURN jsonb_build_object(
    'unidad_id', p_unidad_id,
    'importacion_unidad_id', p_importacion_id,
    'vinculada', p_importacion_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_asignar_importacion(uuid, uuid)
  TO authenticated;

GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.maquinaria_importacion_unidades TO authenticated;

COMMENT ON TABLE public.maquinaria_importacion_unidades IS
  'Maquinas fisicas independientes de una linea del maestro; cada una equivale a cantidad 1.';

NOTIFY pgrst, 'reload schema';
