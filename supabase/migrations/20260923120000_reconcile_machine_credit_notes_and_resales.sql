-- Una NC seguida por una nueva factura del mismo chasis no debe quedar
-- silenciada porque la maquina ya exista (activa o inactiva) en Parque.
-- Se genera una revision humana que permite distinguir refacturacion de una
-- venta real. La confirmacion reutiliza el mismo registro del chasis y deja
-- trazabilidad; nunca mueve Parque/Stock de forma automatica.

BEGIN;

-- La normalizacion anterior quitaba letras minusculas antes de convertirlas
-- a mayusculas. Eso podia confundir claves JSON como canonical_document_kind
-- y original_invoice_number. Se corrige conservando el orden de preferencia.
CREATE OR REPLACE FUNCTION public.valor_json_insensible(p_datos jsonb, p_claves text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(e.value), '')
  FROM jsonb_each_text(coalesce(p_datos, '{}'::jsonb)) AS e(key, value)
  WHERE regexp_replace(upper(e.key), '[^A-Z0-9]', '', 'g') = ANY (
    SELECT regexp_replace(upper(clave), '[^A-Z0-9]', '', 'g')
    FROM unnest(p_claves) AS clave
  )
  ORDER BY array_position(
    ARRAY(
      SELECT regexp_replace(upper(clave), '[^A-Z0-9]', '', 'g')
      FROM unnest(p_claves) AS clave
    ),
    regexp_replace(upper(e.key), '[^A-Z0-9]', '', 'g')
  )
  LIMIT 1;
$$;

ALTER TABLE public.parque_historial_propiedad
  DROP CONSTRAINT IF EXISTS parque_historial_propiedad_tipo_evento_check;

ALTER TABLE public.parque_historial_propiedad
  ADD CONSTRAINT parque_historial_propiedad_tipo_evento_check
  CHECK (tipo_evento IN ('ALTA','TRANSFERENCIA','BAJA','REINGRESO','REFACTURACION'));

CREATE OR REPLACE FUNCTION public.registrar_historial_propiedad_maquina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidad_id uuid;
  v_operacion_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT u.id, l.operacion_id
      INTO v_unidad_id, v_operacion_id
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE public.normalizar_chasis_notificacion(u.chasis)
      = public.normalizar_chasis_notificacion(NEW.serie)
    ORDER BY u.actualizado_en DESC
    LIMIT 1;

    INSERT INTO public.parque_historial_propiedad (
      maquina_id, cliente_nuevo_id, tipo_evento, operacion_id
    ) VALUES (NEW.id, NEW.cliente_id, 'ALTA', v_operacion_id);

    IF v_unidad_id IS NOT NULL THEN
      UPDATE public.maquinaria_unidades_operacion
      SET parque_maquina_id = NEW.id,
          estado = 'EN_PARQUE',
          actualizado_en = now()
      WHERE id = v_unidad_id;

      IF NOT EXISTS (
        SELECT 1
        FROM public.maquinaria_operacion_lineas l
        JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
        WHERE l.operacion_id = v_operacion_id
          AND l.elegible_parque
          AND u.estado NOT IN ('EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
      ) THEN
        UPDATE public.maquinaria_operaciones
        SET estado = 'CERRADA', actualizado_en = now()
        WHERE id = v_operacion_id;
      ELSE
        UPDATE public.maquinaria_operaciones
        SET estado = 'FACTURADA', actualizado_en = now()
        WHERE id = v_operacion_id
          AND estado NOT IN ('CERRADA', 'CANCELADA');
      END IF;
    END IF;
  ELSE
    SELECT l.operacion_id INTO v_operacion_id
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE u.parque_maquina_id = NEW.id
    ORDER BY u.actualizado_en DESC
    LIMIT 1;

    IF NOT OLD.activo AND NEW.activo THEN
      INSERT INTO public.parque_historial_propiedad (
        maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento,
        operacion_id, observaciones
      ) VALUES (
        NEW.id, OLD.cliente_id, NEW.cliente_id, 'REINGRESO', v_operacion_id,
        'Reingreso al Parque confirmado manualmente desde una nueva factura.'
      );
    ELSIF OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
      INSERT INTO public.parque_historial_propiedad (
        maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento, operacion_id
      ) VALUES (NEW.id, OLD.cliente_id, NEW.cliente_id, 'TRANSFERENCIA', v_operacion_id);
    ELSIF OLD.activo AND NOT NEW.activo THEN
      INSERT INTO public.parque_historial_propiedad (
        maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento, operacion_id
      ) VALUES (NEW.id, OLD.cliente_id, NEW.cliente_id, 'BAJA', v_operacion_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_notificacion_venta_maquina(p_linea_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linea public.facturacion_lineas_importadas%ROWTYPE;
  v_texto text;
  v_os_numero text;
  v_chasis text;
  v_chasis_norm text;
  v_marca public.marca;
  v_modelo text;
  v_tipo text;
  v_match text[];
  v_notificacion_id uuid;
  v_notificacion_tipo text;
  v_titulo text;
  v_clave text;
  v_parque public.parque_maquinas%ROWTYPE;
  v_cliente_actual_nombre text;
  v_nc record;
  v_revision_sugerida text;
BEGIN
  SELECT * INTO v_linea
  FROM public.facturacion_lineas_importadas
  WHERE id = p_linea_id;

  IF NOT FOUND
     OR coalesce(v_linea.cantidad, 0) <= 0
     OR coalesce(v_linea.total_venta, 0) <= 0
     OR upper(regexp_replace(
          coalesce(v_linea.raw_data ->> 'canonical_document_kind', 'FACTURA'),
          '[^A-Z0-9]', '', 'g'
        )) = 'NOTACREDITO' THEN
    RETURN NULL;
  END IF;

  v_texto := concat_ws(' | ', v_linea.mercaderia, v_linea.observacion, v_linea.subgrupo_original);
  v_os_numero := nullif(v_linea.raw_data ->> 'linked_service_order', '');

  IF NOT (
    upper(coalesce(v_linea.grupo_normalizado, '')) = 'MAQUINARIAS'
    OR upper(coalesce(v_linea.raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
    OR left(upper(coalesce(v_linea.cod_mercaderia, '')), 5) = 'VEIC_'
    OR v_texto ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
  ) THEN
    RETURN NULL;
  END IF;

  v_marca := v_linea.marca_normalizada;
  IF v_marca = 'OTROS'::public.marca THEN
    IF v_texto ~* 'CLAAS' THEN v_marca := 'CLAAS'::public.marca;
    ELSIF v_texto ~* 'HORSCH' THEN v_marca := 'HORSCH'::public.marca;
    END IF;
  END IF;
  IF v_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RETURN NULL;
  END IF;

  v_chasis := public.extraer_chasis_venta_maquina(v_texto, v_linea.raw_data, v_os_numero);
  v_chasis_norm := public.normalizar_chasis_notificacion(v_chasis);
  IF v_chasis_norm IS NULL THEN RETURN NULL; END IF;

  SELECT pm.* INTO v_parque
  FROM public.parque_maquinas pm
  WHERE public.normalizar_chasis_notificacion(pm.serie) = v_chasis_norm
  ORDER BY pm.actualizado_en DESC NULLS LAST
  LIMIT 1;

  IF v_parque.id IS NOT NULL THEN
    SELECT c.nombre INTO v_cliente_actual_nombre
    FROM public.clientes c
    WHERE c.id = v_parque.cliente_id;
  END IF;

  SELECT
    nc.id AS linea_id,
    coalesce(nullif(btrim(nc.factura), ''), nullif(btrim(nc.codigo_interno_factura), '')) AS documento,
    public.valor_json_insensible(
      nc.raw_data,
      ARRAY['original_invoice_number', 'factura_origen', 'factura_original', 'nfori']
    ) AS factura_original,
    nc.fecha_factura,
    nc.cliente_id,
    nc.entidad_nombre
  INTO v_nc
  FROM public.facturacion_lineas_importadas nc
  WHERE nc.id <> v_linea.id
    AND nc.fecha_factura IS NOT NULL
    AND v_linea.fecha_factura IS NOT NULL
    AND nc.fecha_factura <= v_linea.fecha_factura
    AND (
      upper(regexp_replace(
        coalesce(nc.raw_data ->> 'canonical_document_kind', ''),
        '[^A-Z0-9]', '', 'g'
      )) = 'NOTACREDITO'
      OR coalesce(nc.cantidad, 0) < 0
      OR coalesce(nc.total_venta, 0) < 0
    )
    AND (
      upper(coalesce(nc.grupo_normalizado, '')) = 'MAQUINARIAS'
      OR upper(coalesce(nc.raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
      OR left(upper(coalesce(nc.cod_mercaderia, '')), 5) = 'VEIC_'
      OR concat_ws(' | ', nc.mercaderia, nc.observacion, nc.subgrupo_original)
        ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
    )
    AND public.normalizar_chasis_notificacion(
      public.extraer_chasis_venta_maquina(
        concat_ws(' | ', nc.mercaderia, nc.observacion, nc.subgrupo_original),
        nc.raw_data,
        nullif(nc.raw_data ->> 'linked_service_order', '')
      )
    ) = v_chasis_norm
  ORDER BY nc.fecha_factura DESC, nc.importado_en DESC
  LIMIT 1;

  IF v_parque.id IS NULL THEN
    v_notificacion_tipo := 'venta_maquina_sin_parque';
    v_titulo := 'Nueva máquina facturada para revisar';
    v_revision_sugerida := 'ALTA';
  ELSIF NOT v_parque.activo THEN
    v_notificacion_tipo := 'venta_maquina_reingreso';
    v_titulo := 'Revisar nueva factura de máquina';
    v_revision_sugerida := 'REINGRESO';
  ELSIF v_nc.linea_id IS NOT NULL
        OR v_parque.cliente_id IS DISTINCT FROM v_linea.cliente_id THEN
    v_notificacion_tipo := 'venta_maquina_reingreso';
    v_titulo := CASE
      WHEN v_nc.linea_id IS NOT NULL THEN 'Revisar refacturación de máquina'
      ELSE 'Revisar transferencia de máquina'
    END;
    v_revision_sugerida := CASE
      WHEN v_nc.linea_id IS NOT NULL
           AND v_parque.cliente_id IS NOT DISTINCT FROM v_linea.cliente_id
        THEN 'REFACTURACION_PROBABLE'
      ELSE 'TRANSFERENCIA'
    END;
  ELSE
    -- Ya existe activa y no hay una NC reciente que justifique revisar el
    -- movimiento. Se conserva el comportamiento anterior y no se duplica.
    RETURN NULL;
  END IF;

  v_modelo := public.valor_json_insensible(v_linea.raw_data, ARRAY['MODELO', 'MODEL']);
  IF nullif(btrim(v_modelo), '') IS NULL THEN
    v_match := regexp_match(v_texto, '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)');
    v_modelo := regexp_replace(coalesce(v_match[1], ''), '(?i)[[:space:]]+(?:CHASIS|CASIS|SERIE|TIPO)[[:space:]]*:.*$', '');
  END IF;

  v_tipo := public.valor_json_insensible(v_linea.raw_data, ARRAY['TIPO', 'TIPO MAQUINA', 'SUBGRUPO']);
  IF nullif(btrim(v_tipo), '') IS NULL THEN
    v_match := regexp_match(v_texto, '(?i)TIPO[[:space:]]*:[[:space:]]*([^|;]+)');
    v_tipo := regexp_replace(coalesce(v_match[1], ''), '(?i)[[:space:]]+(?:MODELO|CHASIS|CASIS|SERIE)[[:space:]]*:.*$', '');
  END IF;

  v_clave := 'venta_maquina|'
    || coalesce(v_linea.factura, v_linea.codigo_interno_factura, v_linea.id::text)
    || '|' || v_chasis_norm;

  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, clave_unica, destinatario_roles, datos
  ) VALUES (
    v_notificacion_tipo,
    v_titulo,
    concat_ws(' · ', v_marca::text, nullif(btrim(v_modelo), ''), 'Chasis ' || v_chasis),
    v_clave,
    ARRAY['admin'::public.app_role, 'superadmin'::public.app_role],
    jsonb_build_object(
      'facturacion_linea_id', v_linea.id,
      'factura', coalesce(v_linea.factura, v_linea.codigo_interno_factura),
      'fecha_factura', v_linea.fecha_factura,
      'cliente_id', v_linea.cliente_id,
      'cliente_nombre', v_linea.entidad_nombre,
      'marca', v_marca,
      'chasis', v_chasis,
      'modelo_tipo', nullif(btrim(v_modelo), ''),
      'subgrupo', public.inferir_subgrupo_maquina_notificacion(concat_ws(' ', v_tipo, v_modelo, v_texto)),
      'sucursal', v_linea.sucursal,
      'producto_codigo', v_linea.cod_mercaderia,
      'producto', v_linea.mercaderia,
      'origen_sistema', v_linea.origen_sistema,
      'parque_maquina_id', v_parque.id,
      'parque_activa', v_parque.activo,
      'cliente_actual_id', v_parque.cliente_id,
      'cliente_actual_nombre', v_cliente_actual_nombre,
      'nc_linea_id', v_nc.linea_id,
      'nc_documento', v_nc.documento,
      'nc_factura_original', v_nc.factura_original,
      'nc_fecha', v_nc.fecha_factura,
      'nc_cliente_id', v_nc.cliente_id,
      'nc_cliente_nombre', v_nc.entidad_nombre,
      'revision_sugerida', v_revision_sugerida
    )
  )
  ON CONFLICT (clave_unica) DO UPDATE
  SET tipo = EXCLUDED.tipo,
      titulo = EXCLUDED.titulo,
      mensaje = EXCLUDED.mensaje,
      datos = EXCLUDED.datos,
      actualizado_en = now()
  RETURNING id INTO v_notificacion_id;

  RETURN v_notificacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.descartar_notificacion_venta_maquina(p_notificacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  UPDATE public.notificaciones
  SET estado = 'descartada', accionada_por = auth.uid(), accionada_en = now(), actualizado_en = now()
  WHERE id = p_notificacion_id
    AND tipo IN ('venta_maquina_sin_parque', 'venta_maquina_reingreso')
    AND estado = 'pendiente';
END;
$$;

DROP FUNCTION IF EXISTS public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text
);

CREATE FUNCTION public.confirmar_notificacion_alta_maquina(
  p_notificacion_id uuid,
  p_cliente_id uuid,
  p_marca public.marca,
  p_subgrupo public.subgrupo_maquina,
  p_modelo_tipo text,
  p_serie text,
  p_anio integer DEFAULT NULL,
  p_sucursal public.sucursal DEFAULT NULL,
  p_localidad text DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_subgrupo_personalizado text DEFAULT NULL,
  p_tipo_confirmacion text DEFAULT 'VENTA'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notificacion public.notificaciones%ROWTYPE;
  v_maquina public.parque_maquinas%ROWTYPE;
  v_maquina_id uuid;
  v_chasis_norm text;
  v_factura text;
  v_nc_documento text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  p_tipo_confirmacion := upper(btrim(coalesce(p_tipo_confirmacion, 'VENTA')));
  IF p_tipo_confirmacion NOT IN ('VENTA', 'REFACTURACION') THEN
    RAISE EXCEPTION 'El tipo de confirmacion debe ser VENTA o REFACTURACION';
  END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'Selecciona un cliente'; END IF;
  v_chasis_norm := public.normalizar_chasis_notificacion(p_serie);
  IF v_chasis_norm IS NULL THEN RAISE EXCEPTION 'El chasis es obligatorio'; END IF;
  IF p_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RAISE EXCEPTION 'La marca debe ser CLAAS o HORSCH';
  END IF;
  IF p_subgrupo = 'OTRO'::public.subgrupo_maquina
     AND nullif(btrim(p_subgrupo_personalizado), '') IS NULL THEN
    RAISE EXCEPTION 'Especifica el nuevo subgrupo';
  END IF;

  SELECT * INTO v_notificacion
  FROM public.notificaciones
  WHERE id = p_notificacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_notificacion.tipo NOT IN ('venta_maquina_sin_parque', 'venta_maquina_reingreso') THEN
    RAISE EXCEPTION 'Notificacion no encontrada';
  END IF;
  IF v_notificacion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La notificacion ya fue resuelta';
  END IF;
  IF public.normalizar_chasis_notificacion(v_notificacion.datos ->> 'chasis') IS DISTINCT FROM v_chasis_norm THEN
    RAISE EXCEPTION 'El chasis no coincide con la factura revisada';
  END IF;

  SELECT pm.* INTO v_maquina
  FROM public.parque_maquinas pm
  WHERE public.normalizar_chasis_notificacion(pm.serie) = v_chasis_norm
  ORDER BY pm.actualizado_en DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF p_tipo_confirmacion = 'REFACTURACION' AND v_maquina.id IS NULL THEN
    RAISE EXCEPTION 'No existe una maquina previa para confirmar la refacturacion';
  END IF;
  IF p_tipo_confirmacion = 'REFACTURACION'
     AND v_maquina.cliente_id IS DISTINCT FROM p_cliente_id THEN
    RAISE EXCEPTION 'La refacturacion debe conservar el propietario; confirma una nueva venta para transferirlo';
  END IF;

  IF v_maquina.id IS NULL THEN
    INSERT INTO public.parque_maquinas (
      cliente_id, marca, subgrupo, subgrupo_personalizado, modelo_tipo, serie, anio, sucursal,
      localidad, vendedor, notas, agregado_manualmente, activo
    ) VALUES (
      p_cliente_id, p_marca, p_subgrupo,
      CASE WHEN p_subgrupo = 'OTRO'::public.subgrupo_maquina
        THEN nullif(btrim(p_subgrupo_personalizado), '') ELSE NULL END,
      nullif(btrim(p_modelo_tipo), ''), btrim(p_serie), p_anio, p_sucursal,
      nullif(btrim(p_localidad), ''), nullif(btrim(p_vendedor), ''),
      nullif(btrim(p_notas), ''), false, true
    )
    RETURNING id INTO v_maquina_id;
  ELSE
    v_maquina_id := v_maquina.id;
    UPDATE public.parque_maquinas
    SET cliente_id = p_cliente_id,
        marca = p_marca,
        subgrupo = p_subgrupo,
        subgrupo_personalizado = CASE WHEN p_subgrupo = 'OTRO'::public.subgrupo_maquina
          THEN nullif(btrim(p_subgrupo_personalizado), '') ELSE NULL END,
        modelo_tipo = coalesce(nullif(btrim(p_modelo_tipo), ''), modelo_tipo),
        serie = btrim(p_serie),
        anio = coalesce(p_anio, anio),
        sucursal = coalesce(p_sucursal, sucursal),
        localidad = coalesce(nullif(btrim(p_localidad), ''), localidad),
        vendedor = coalesce(nullif(btrim(p_vendedor), ''), vendedor),
        notas = CASE
          WHEN nullif(btrim(p_notas), '') IS NULL THEN notas
          WHEN coalesce(notas, '') LIKE '%' || btrim(p_notas) || '%' THEN notas
          ELSE concat_ws(E'\n', nullif(btrim(notas), ''), btrim(p_notas))
        END,
        activo = true,
        actualizado_en = now()
    WHERE id = v_maquina.id;

    IF p_tipo_confirmacion = 'REFACTURACION' THEN
      v_factura := v_notificacion.datos ->> 'factura';
      v_nc_documento := v_notificacion.datos ->> 'nc_documento';
      INSERT INTO public.parque_historial_propiedad (
        maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento, observaciones
      ) VALUES (
        v_maquina.id, v_maquina.cliente_id, p_cliente_id, 'REFACTURACION',
        concat_ws(' · ',
          CASE WHEN nullif(v_nc_documento, '') IS NOT NULL THEN 'NC ' || v_nc_documento END,
          CASE WHEN nullif(v_factura, '') IS NOT NULL THEN 'Factura ' || v_factura END,
          'Sin movimiento fisico de la maquina'
        )
      );
    END IF;
  END IF;

  -- La foto de Stock no se altera: se marca como pendiente de actualizar y
  -- se bloquea su reserva mientras el chasis vuelva a estar activo en Parque.
  UPDATE public.parque_stock_maquinas s
  SET datos_fuente = coalesce(s.datos_fuente, '{}'::jsonb)
        - 'pendiente_transferencia_parque'
        - 'parque_coincidente_id'
        || jsonb_build_object(
          'salida_pendiente_por_factura', true,
          'facturacion_linea_id', v_notificacion.datos ->> 'facturacion_linea_id',
          'factura_salida', v_notificacion.datos ->> 'factura',
          'tipo_confirmacion_salida', p_tipo_confirmacion,
          'parque_maquina_id', v_maquina_id,
          'confirmada_por', auth.uid(),
          'confirmada_en', now()
        ),
      importado_en = now()
  WHERE s.saldo_actual > 0
    AND public.normalizar_chasis_notificacion(s.chasis) = v_chasis_norm;

  -- Conserva el aviso de parte de pago como historial, pero deja claro que
  -- fue compensado por la factura posterior. Si estaba pendiente, se cierra.
  UPDATE public.notificaciones n
  SET estado = CASE WHEN n.estado = 'pendiente' THEN 'confirmada' ELSE n.estado END,
      accionada_por = CASE WHEN n.estado = 'pendiente' THEN auth.uid() ELSE n.accionada_por END,
      accionada_en = CASE WHEN n.estado = 'pendiente' THEN now() ELSE n.accionada_en END,
      actualizado_en = now(),
      datos = n.datos || jsonb_build_object(
        'movimiento_compensado', true,
        'resolucion', 'factura_posterior_confirmada',
        'factura_salida', v_notificacion.datos ->> 'factura',
        'tipo_confirmacion_salida', p_tipo_confirmacion,
        'compensada_en', now()
      )
  WHERE n.tipo = 'stock_chasis_en_parque'
    AND (
      n.datos ->> 'parque_maquina_id' = v_maquina_id::text
      OR public.normalizar_chasis_notificacion(n.datos ->> 'chasis') = v_chasis_norm
    );

  UPDATE public.notificaciones
  SET estado = 'confirmada',
      accionada_por = auth.uid(),
      accionada_en = now(),
      actualizado_en = now(),
      datos = datos || jsonb_build_object(
        'maquina_id', v_maquina_id,
        'tipo_confirmacion', p_tipo_confirmacion,
        'parque_activa_antes', v_maquina.activo,
        'cliente_anterior_id', v_maquina.cliente_id
      )
  WHERE id = p_notificacion_id;

  RETURN v_maquina_id;
END;
$$;

-- Una fila que conserva parque_origen_id sigue siendo una foto de Stock. Si
-- el chasis fue reactivado en Parque, tampoco puede reservarse hasta que la
-- siguiente carga confirme su salida real del Stock.
CREATE OR REPLACE FUNCTION public.maquinaria_bloquear_stock_activo_en_parque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chasis_normalizado text;
BEGIN
  IF NEW.unidad_operacion_id IS NULL
     OR (
       TG_OP = 'UPDATE'
       AND NEW.unidad_operacion_id IS NOT DISTINCT FROM OLD.unidad_operacion_id
     ) THEN
    RETURN NEW;
  END IF;

  v_chasis_normalizado := public.normalizar_chasis_notificacion(NEW.chasis);
  IF v_chasis_normalizado IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.parque_maquinas p
    WHERE p.activo
      AND public.normalizar_chasis_notificacion(p.serie) = v_chasis_normalizado
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.unidad_operacion_id := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El chasis sigue activo en Parque; primero confirme su ingreso a Stock desde la notificacion'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.generar_notificacion_venta_maquina(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.descartar_notificacion_venta_maquina(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.descartar_notificacion_venta_maquina(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text, text, text
) IS 'Confirma manualmente una venta o refacturacion; reutiliza el mismo chasis, reactiva/trasfiere Parque cuando corresponde y conserva la historia de Stock.';

-- Reprocesa las ventas recientes: una NC previa hace que la factura posterior
-- quede pendiente de revision, no silenciada.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.facturacion_lineas_importadas
    WHERE fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND coalesce(cantidad, 0) > 0
      AND coalesce(total_venta, 0) > 0
      AND upper(regexp_replace(
        coalesce(raw_data ->> 'canonical_document_kind', 'FACTURA'),
        '[^A-Z0-9]', '', 'g'
      )) <> 'NOTACREDITO'
      AND (
        upper(coalesce(grupo_normalizado, '')) = 'MAQUINARIAS'
        OR upper(coalesce(raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
        OR left(upper(coalesce(cod_mercaderia, '')), 5) = 'VEIC_'
        OR concat_ws(' | ', mercaderia, observacion, subgrupo_original)
          ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
      )
    ORDER BY fecha_factura, importado_en
  LOOP
    PERFORM public.generar_notificacion_venta_maquina(v_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
