-- Una máquina que reaparece en Stock mientras sigue activa en Parque requiere
-- revisión humana. La carga solamente genera el aviso; no cambia propietario,
-- estado del Parque ni vínculo de Stock hasta que un administrador confirma.

BEGIN;

CREATE OR REPLACE FUNCTION public.generar_notificaciones_stock_en_parque(p_carga_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conflicto record;
  v_generadas integer := 0;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'La carga de stock es obligatoria';
  END IF;

  FOR v_conflicto IN
    WITH stock_unico AS (
      SELECT
        s.*,
        public.normalizar_chasis_notificacion(s.chasis) AS chasis_normalizado,
        count(*) OVER (
          PARTITION BY public.normalizar_chasis_notificacion(s.chasis)
        ) AS coincidencias_stock
      FROM public.parque_stock_maquinas s
      WHERE s.carga_id = p_carga_id
        AND s.saldo_actual > 0
        AND s.parque_origen_id IS NULL
        AND public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL
    ), parque_unico AS (
      SELECT
        p.*,
        c.nombre AS cliente_nombre,
        public.normalizar_chasis_notificacion(p.serie) AS chasis_normalizado,
        count(*) OVER (
          PARTITION BY public.normalizar_chasis_notificacion(p.serie)
        ) AS coincidencias_parque
      FROM public.parque_maquinas p
      LEFT JOIN public.clientes c ON c.id = p.cliente_id
      WHERE p.activo
        AND public.normalizar_chasis_notificacion(p.serie) IS NOT NULL
    )
    SELECT
      s.id AS stock_id,
      s.stock_key,
      s.producto_codigo,
      s.sucursal AS stock_sucursal,
      s.deposito AS stock_deposito,
      s.tipo AS stock_tipo,
      s.marca AS stock_marca,
      s.modelo AS stock_modelo,
      s.estado AS stock_estado,
      s.chasis,
      s.chasis_normalizado,
      s.saldo_actual,
      p.id AS parque_maquina_id,
      p.cliente_id,
      p.cliente_nombre,
      p.sucursal AS parque_sucursal,
      p.marca::text AS parque_marca,
      p.modelo_tipo AS parque_modelo
    FROM stock_unico s
    JOIN parque_unico p ON p.chasis_normalizado = s.chasis_normalizado
    WHERE s.coincidencias_stock = 1
      AND p.coincidencias_parque = 1
  LOOP
    UPDATE public.parque_stock_maquinas
    SET datos_fuente = coalesce(datos_fuente, '{}'::jsonb) || jsonb_build_object(
          'pendiente_transferencia_parque', true,
          'parque_coincidente_id', v_conflicto.parque_maquina_id,
          'cliente_origen', v_conflicto.cliente_nombre,
          'destino_sugerido', 'CAMPOS DEL MANANA'
        )
    WHERE id = v_conflicto.stock_id;

    INSERT INTO public.notificaciones (
      tipo, titulo, mensaje, clave_unica, destinatario_roles, datos
    ) VALUES (
      'stock_chasis_en_parque',
      'Posible máquina tomada como parte de pago',
      concat_ws(' · ',
        coalesce(v_conflicto.stock_marca, v_conflicto.parque_marca),
        coalesce(v_conflicto.stock_modelo, v_conflicto.parque_modelo),
        'Chasis ' || v_conflicto.chasis,
        coalesce(v_conflicto.cliente_nombre, 'Propietario sin identificar')
      ),
      'stock_parque|' || v_conflicto.parque_maquina_id::text || '|' || v_conflicto.chasis_normalizado,
      ARRAY['admin'::public.app_role, 'superadmin'::public.app_role],
      jsonb_build_object(
        'carga_id', p_carga_id,
        'stock_id', v_conflicto.stock_id,
        'stock_key', v_conflicto.stock_key,
        'producto_codigo', v_conflicto.producto_codigo,
        'stock_sucursal', v_conflicto.stock_sucursal,
        'stock_deposito', v_conflicto.stock_deposito,
        'stock_tipo', v_conflicto.stock_tipo,
        'stock_marca', v_conflicto.stock_marca,
        'stock_modelo', v_conflicto.stock_modelo,
        'stock_estado', v_conflicto.stock_estado,
        'saldo_actual', v_conflicto.saldo_actual,
        'chasis', v_conflicto.chasis,
        'chasis_normalizado', v_conflicto.chasis_normalizado,
        'parque_maquina_id', v_conflicto.parque_maquina_id,
        'cliente_id', v_conflicto.cliente_id,
        'cliente_nombre', v_conflicto.cliente_nombre,
        'parque_sucursal', v_conflicto.parque_sucursal,
        'parque_marca', v_conflicto.parque_marca,
        'parque_modelo', v_conflicto.parque_modelo,
        'destino', 'CAMPOS DEL MANANA'
      )
    )
    ON CONFLICT (clave_unica) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        mensaje = EXCLUDED.mensaje,
        datos = EXCLUDED.datos,
        estado = 'pendiente',
        visto_por = CASE
          WHEN public.notificaciones.estado = 'pendiente' THEN public.notificaciones.visto_por
          ELSE '{}'::uuid[]
        END,
        accionada_por = CASE
          WHEN public.notificaciones.estado = 'pendiente' THEN public.notificaciones.accionada_por
          ELSE NULL
        END,
        accionada_en = CASE
          WHEN public.notificaciones.estado = 'pendiente' THEN public.notificaciones.accionada_en
          ELSE NULL
        END,
        actualizado_en = now();

    v_generadas := v_generadas + 1;
  END LOOP;

  -- Si la siguiente foto de Stock ya no contiene la coincidencia, el aviso
  -- pendiente se cierra sin tocar la máquina ni inventar una transferencia.
  UPDATE public.notificaciones n
  SET estado = 'descartada',
      accionada_en = now(),
      actualizado_en = now(),
      datos = n.datos || jsonb_build_object('resolucion', 'coincidencia_ya_no_vigente')
  WHERE n.tipo = 'stock_chasis_en_parque'
    AND n.estado = 'pendiente'
    AND NOT EXISTS (
      SELECT 1
      FROM public.parque_stock_maquinas s
      JOIN public.parque_maquinas p
        ON p.id = nullif(n.datos ->> 'parque_maquina_id', '')::uuid
       AND p.activo
       AND public.normalizar_chasis_notificacion(p.serie)
           = public.normalizar_chasis_notificacion(s.chasis)
      WHERE s.saldo_actual > 0
        AND s.parque_origen_id IS NULL
        AND s.stock_key = n.datos ->> 'stock_key'
    );

  RETURN v_generadas;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_notificacion_ingreso_stock_parque(
  p_notificacion_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notificacion public.notificaciones%ROWTYPE;
  v_parque public.parque_maquinas%ROWTYPE;
  v_stock public.parque_stock_maquinas%ROWTYPE;
  v_chasis_normalizado text;
  v_coincidencias_stock integer;
  v_coincidencias_parque integer;
  v_cliente_nombre text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  SELECT * INTO v_notificacion
  FROM public.notificaciones
  WHERE id = p_notificacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_notificacion.tipo <> 'stock_chasis_en_parque' THEN
    RAISE EXCEPTION 'Notificacion no encontrada';
  END IF;
  IF v_notificacion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La notificacion ya fue resuelta';
  END IF;

  v_chasis_normalizado := public.normalizar_chasis_notificacion(v_notificacion.datos ->> 'chasis');
  IF v_chasis_normalizado IS NULL THEN
    RAISE EXCEPTION 'La notificacion no contiene un chasis valido';
  END IF;

  SELECT count(*) INTO v_coincidencias_parque
  FROM public.parque_maquinas p
  WHERE p.activo
    AND public.normalizar_chasis_notificacion(p.serie) = v_chasis_normalizado;

  SELECT count(*) INTO v_coincidencias_stock
  FROM public.parque_stock_maquinas s
  WHERE s.saldo_actual > 0
    AND s.parque_origen_id IS NULL
    AND public.normalizar_chasis_notificacion(s.chasis) = v_chasis_normalizado;

  IF v_coincidencias_parque <> 1 OR v_coincidencias_stock <> 1 THEN
    RAISE EXCEPTION 'El chasis ya no tiene una coincidencia unica entre Parque y Stock; revisar antes de confirmar';
  END IF;

  SELECT * INTO v_parque
  FROM public.parque_maquinas p
  WHERE p.activo
    AND public.normalizar_chasis_notificacion(p.serie) = v_chasis_normalizado
  FOR UPDATE;

  SELECT * INTO v_stock
  FROM public.parque_stock_maquinas s
  WHERE s.saldo_actual > 0
    AND s.parque_origen_id IS NULL
    AND public.normalizar_chasis_notificacion(s.chasis) = v_chasis_normalizado
  FOR UPDATE;

  IF v_parque.id::text IS DISTINCT FROM v_notificacion.datos ->> 'parque_maquina_id' THEN
    RAISE EXCEPTION 'La máquina activa de Parque cambió desde que se generó el aviso';
  END IF;

  SELECT c.nombre INTO v_cliente_nombre
  FROM public.clientes c
  WHERE c.id = v_parque.cliente_id;

  UPDATE public.parque_maquinas
  SET activo = false,
      notas = concat_ws(E'\n', nullif(btrim(notas), ''),
        concat('Parte de pago confirmada: ', coalesce(v_cliente_nombre, 'propietario sin identificar'),
          ' → Campos del Mañana. Chasis ', v_parque.serie, '.')),
      actualizado_en = now()
  WHERE id = v_parque.id;

  UPDATE public.parque_stock_maquinas
  SET parque_origen_id = v_parque.id,
      estado = 'Usado',
      datos_fuente = coalesce(datos_fuente, '{}'::jsonb)
        - 'pendiente_transferencia_parque'
        - 'parque_coincidente_id'
        || jsonb_build_object(
          'origen', 'PARTE_DE_PAGO_CONFIRMADA',
          'cliente_origen_id', v_parque.cliente_id,
          'cliente_origen', v_cliente_nombre,
          'destino', 'CAMPOS DEL MANANA',
          'notificacion_id', v_notificacion.id,
          'confirmada_por', auth.uid(),
          'confirmada_en', now()
        ),
      importado_en = now()
  WHERE id = v_stock.id;

  UPDATE public.notificaciones
  SET estado = 'confirmada',
      accionada_por = auth.uid(),
      accionada_en = now(),
      actualizado_en = now(),
      datos = datos || jsonb_build_object(
        'stock_id_confirmado', v_stock.id,
        'parque_maquina_id', v_parque.id,
        'cliente_origen', v_cliente_nombre,
        'destino', 'CAMPOS DEL MANANA',
        'movimiento', 'PARTE_DE_PAGO'
      )
  WHERE id = v_notificacion.id;

  RETURN v_stock.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_notificacion_stock_parque_si_desaparece()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activo AND NOT NEW.activo THEN
    UPDATE public.notificaciones
    SET estado = 'confirmada',
        accionada_por = coalesce(accionada_por, auth.uid()),
        accionada_en = coalesce(accionada_en, now()),
        actualizado_en = now(),
        datos = datos || jsonb_build_object('resolucion', 'parque_desactivado_por_otro_flujo')
    WHERE tipo = 'stock_chasis_en_parque'
      AND estado = 'pendiente'
      AND datos ->> 'parque_maquina_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolver_notificacion_stock_parque_trigger
  ON public.parque_maquinas;
CREATE TRIGGER resolver_notificacion_stock_parque_trigger
AFTER UPDATE OF activo ON public.parque_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.resolver_notificacion_stock_parque_si_desaparece();

-- Mientras el mismo chasis siga activo en Parque, la fila de Stock queda en
-- cuarentena: una recarga puede conservar el registro, pero no reservarlo para
-- otra operación. La autorización anterior desactiva primero Parque y recién
-- después habilita el Stock, por lo que no existe un traslado implícito.
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
     OR NEW.parque_origen_id IS NOT NULL
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

  -- El importador recompone toda la foto mediante INSERT. Se conserva la
  -- carga, pero se elimina cualquier reserva heredada hasta la autorización.
  IF TG_OP = 'INSERT' THEN
    NEW.unidad_operacion_id := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El chasis sigue activo en Parque; primero confirme su ingreso a Stock desde la notificación'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS zz_maquinaria_bloquear_stock_activo_en_parque_trigger
  ON public.parque_stock_maquinas;
CREATE TRIGGER zz_maquinaria_bloquear_stock_activo_en_parque_trigger
BEFORE INSERT OR UPDATE OF unidad_operacion_id
ON public.parque_stock_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_bloquear_stock_activo_en_parque();

-- El reemplazo conserva reservas y también el vínculo histórico con el Parque.
-- Solo al terminar de insertar la foto completa genera los avisos pendientes.
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
  v_avisos integer := 0;
  v_unidad_id uuid;
  v_parque_origen_id uuid;
  v_datos_anteriores jsonb;
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
    unidad_operacion_id uuid,
    parque_origen_id uuid,
    datos_fuente jsonb
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.maquinaria_stock_vinculos_anteriores;

  INSERT INTO pg_temp.maquinaria_stock_vinculos_anteriores (
    stock_key, chasis_normalizado, unidad_operacion_id, parque_origen_id, datos_fuente
  )
  SELECT
    s.stock_key,
    public.normalizar_chasis_notificacion(s.chasis),
    s.unidad_operacion_id,
    s.parque_origen_id,
    s.datos_fuente
  FROM public.parque_stock_maquinas s
  WHERE s.unidad_operacion_id IS NOT NULL
     OR s.parque_origen_id IS NOT NULL;

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
    v_parque_origen_id := NULL;
    v_datos_anteriores := '{}'::jsonb;
    v_vinculo_temporal_id := NULL;
    SELECT va.id, va.unidad_operacion_id, va.parque_origen_id, va.datos_fuente
      INTO v_vinculo_temporal_id, v_unidad_id, v_parque_origen_id, v_datos_anteriores
    FROM pg_temp.maquinaria_stock_vinculos_anteriores va
    WHERE (va.unidad_operacion_id IS NOT NULL
       OR va.parque_origen_id IS NOT NULL)
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
      datos_fuente, unidad_operacion_id, parque_origen_id, importado_en
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
      p_carga_id,
      coalesce(v_datos_anteriores, '{}'::jsonb) || coalesce(v_fila->'datos_fuente', '{}'::jsonb),
      v_unidad_id, v_parque_origen_id, now()
    );

    IF v_vinculo_temporal_id IS NOT NULL THEN
      UPDATE pg_temp.maquinaria_stock_vinculos_anteriores
      SET unidad_operacion_id = NULL,
          parque_origen_id = NULL
      WHERE id = v_vinculo_temporal_id;
    END IF;

    v_insertadas := v_insertadas + 1;
    IF v_chasis_normalizado IS NOT NULL THEN
      v_con_chasis := v_con_chasis + 1;
    END IF;
  END LOOP;

  v_avisos := public.generar_notificaciones_stock_en_parque(p_carga_id);

  RETURN jsonb_build_object(
    'filas_insertadas', v_insertadas,
    'filas_con_chasis', v_con_chasis,
    'filas_sin_chasis', v_insertadas - v_con_chasis,
    'reservas_conservadas', (
      SELECT count(*) FROM public.parque_stock_maquinas
      WHERE unidad_operacion_id IS NOT NULL
    ),
    'transferencias_conservadas', (
      SELECT count(*) FROM public.parque_stock_maquinas
      WHERE parque_origen_id IS NOT NULL
    ),
    'avisos_parque', v_avisos
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generar_notificaciones_stock_en_parque(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_notificacion_ingreso_stock_parque(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_notificacion_stock_parque_si_desaparece()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_bloquear_stock_activo_en_parque()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirmar_notificacion_ingreso_stock_parque(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.parque_reemplazar_stock_maquinas(uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.confirmar_notificacion_ingreso_stock_parque(uuid) IS
  'Confirma manualmente una parte de pago: desactiva Parque, vincula Stock y conserva origen/destino en la notificación y datos de stock.';

-- Detectar también cruces que ya existían antes de instalar esta migración.
DO $$
DECLARE
  v_carga_id uuid;
BEGIN
  SELECT s.carga_id INTO v_carga_id
  FROM public.parque_stock_maquinas s
  ORDER BY s.importado_en DESC
  LIMIT 1;

  IF v_carga_id IS NOT NULL THEN
    PERFORM public.generar_notificaciones_stock_en_parque(v_carga_id);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
