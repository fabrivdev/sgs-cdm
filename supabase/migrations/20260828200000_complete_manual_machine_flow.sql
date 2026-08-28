-- Cierra la sub-etapa C del flujo de maquinas:
-- 1) pedidos existentes editables sin perder unidades ni vinculos;
-- 2) importaciones manuales que pueden crearse y editarse;
-- 3) recepcion fisica de una unidad importada en stock, conservando la
--    reserva del pedido al que ya estaba vinculada.

ALTER TABLE public.maquinaria_importacion_lineas
  ADD COLUMN IF NOT EXISTS marca_importacion public.marca;

CREATE OR REPLACE FUNCTION public.maquinaria_puede_gestionar_flujo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.has_module_access(auth.uid(), 'parque')
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
    );
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_actualizar_operacion(
  p_operacion_id uuid,
  p_operacion jsonb,
  p_lineas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_linea jsonb;
  v_linea_id uuid;
  v_cantidad integer;
  v_cantidad_anterior integer;
  v_numero integer;
  v_cliente_id uuid;
  v_abastecimiento text;
  v_abastecimiento_anterior text;
  v_estado_operacion text;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden editar pedidos'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos una maquina';
  END IF;

  SELECT o.estado INTO v_estado_operacion
  FROM public.maquinaria_operaciones o
  WHERE o.id = p_operacion_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe'; END IF;
  IF v_estado_operacion = 'CANCELADA' THEN
    RAISE EXCEPTION 'No se puede editar un pedido cancelado';
  END IF;

  v_cliente_id := nullif(p_operacion ->> 'cliente_id', '')::uuid;
  IF v_cliente_id IS NULL
     AND nullif(btrim(p_operacion ->> 'cliente_nombre'), '') IS NOT NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE upper(btrim(c.nombre)) = upper(btrim(p_operacion ->> 'cliente_nombre'))
    ORDER BY c.activo DESC, c.creado_en
    LIMIT 1;
  END IF;

  UPDATE public.maquinaria_operaciones
  SET np_numero = nullif(btrim(p_operacion ->> 'np_numero'), ''),
      np_fecha = nullif(p_operacion ->> 'np_fecha', '')::date,
      cliente_id = v_cliente_id,
      cliente_nombre = nullif(btrim(p_operacion ->> 'cliente_nombre'), ''),
      comercial = nullif(btrim(p_operacion ->> 'comercial'), ''),
      observaciones = nullif(btrim(p_operacion ->> 'observaciones'), ''),
      actualizado_en = now()
  WHERE id = p_operacion_id;

  -- Libera temporalmente la numeracion para permitir reordenar o quitar
  -- lineas sin chocar con la restriccion unica durante el mismo guardado.
  UPDATE public.maquinaria_operacion_lineas
  SET linea_numero = linea_numero + 1000
  WHERE operacion_id = p_operacion_id;

  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_linea_id := nullif(v_linea ->> 'id', '')::uuid;
    v_cantidad := greatest(1, least(500, coalesce((v_linea ->> 'cantidad')::integer, 1)));
    v_abastecimiento := CASE
      WHEN upper(coalesce(v_linea ->> 'abastecimiento', 'DEFINIR')) IN ('STOCK','IMPORTAR')
        THEN upper(v_linea ->> 'abastecimiento')
      ELSE 'DEFINIR'
    END;

    IF v_linea_id IS NULL THEN
      INSERT INTO public.maquinaria_operacion_lineas (
        operacion_id, linea_numero, marca, producto, modelo, subgrupo,
        cantidad, condicion, abastecimiento, datos_extraidos,
        confianza_extraccion
      ) VALUES (
        p_operacion_id,
        coalesce((v_linea ->> 'linea_numero')::integer, 1),
        coalesce(nullif(upper(v_linea ->> 'marca'), '')::public.marca, 'OTROS'::public.marca),
        nullif(btrim(v_linea ->> 'producto'), ''),
        nullif(btrim(v_linea ->> 'modelo'), ''),
        coalesce(nullif(upper(v_linea ->> 'subgrupo'), '')::public.subgrupo_maquina, 'OTRO'::public.subgrupo_maquina),
        v_cantidad,
        CASE WHEN upper(coalesce(v_linea ->> 'condicion', 'NUEVA')) = 'USADA' THEN 'USADA' ELSE 'NUEVA' END,
        v_abastecimiento,
        coalesce(v_linea -> 'datos_extraidos', '{}'::jsonb),
        coalesce(v_linea -> 'confianza', '{}'::jsonb)
      ) RETURNING id INTO v_linea_id;

      FOR v_numero IN 1..v_cantidad LOOP
        INSERT INTO public.maquinaria_unidades_operacion (linea_id, numero_unidad)
        VALUES (v_linea_id, v_numero);
      END LOOP;
    ELSE
      SELECT l.cantidad, l.abastecimiento
      INTO v_cantidad_anterior, v_abastecimiento_anterior
      FROM public.maquinaria_operacion_lineas l
      WHERE l.id = v_linea_id AND l.operacion_id = p_operacion_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Una linea no pertenece a este pedido';
      END IF;

      IF v_abastecimiento IS DISTINCT FROM v_abastecimiento_anterior AND EXISTS (
        SELECT 1
        FROM public.maquinaria_unidades_operacion u
        LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
        LEFT JOIN public.maquinaria_importacion_unidades iu ON iu.unidad_id = u.id
        WHERE u.linea_id = v_linea_id
          AND (
            (v_abastecimiento = 'IMPORTAR' AND s.id IS NOT NULL)
            OR (v_abastecimiento = 'STOCK' AND iu.id IS NOT NULL)
            OR (v_abastecimiento = 'DEFINIR' AND (s.id IS NOT NULL OR iu.id IS NOT NULL))
          )
      ) THEN
        RAISE EXCEPTION 'Desvincula las unidades antes de cambiar el origen de la linea';
      END IF;

      IF v_cantidad < v_cantidad_anterior AND EXISTS (
        SELECT 1
        FROM public.maquinaria_unidades_operacion u
        LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
        LEFT JOIN public.maquinaria_importacion_unidades iu ON iu.unidad_id = u.id
        WHERE u.linea_id = v_linea_id
          AND u.numero_unidad > v_cantidad
          AND (
            nullif(btrim(u.chasis), '') IS NOT NULL
            OR u.estado <> 'PENDIENTE'
            OR s.id IS NOT NULL
            OR iu.id IS NOT NULL
          )
      ) THEN
        RAISE EXCEPTION 'No se puede reducir la cantidad: hay unidades excedentes con trazabilidad';
      END IF;

      UPDATE public.maquinaria_operacion_lineas
      SET linea_numero = coalesce((v_linea ->> 'linea_numero')::integer, linea_numero),
          marca = coalesce(nullif(upper(v_linea ->> 'marca'), '')::public.marca, 'OTROS'::public.marca),
          producto = nullif(btrim(v_linea ->> 'producto'), ''),
          modelo = nullif(btrim(v_linea ->> 'modelo'), ''),
          subgrupo = coalesce(nullif(upper(v_linea ->> 'subgrupo'), '')::public.subgrupo_maquina, 'OTRO'::public.subgrupo_maquina),
          cantidad = v_cantidad,
          condicion = CASE WHEN upper(coalesce(v_linea ->> 'condicion', 'NUEVA')) = 'USADA' THEN 'USADA' ELSE 'NUEVA' END,
          abastecimiento = v_abastecimiento,
          datos_extraidos = coalesce(v_linea -> 'datos_extraidos', datos_extraidos),
          confianza_extraccion = coalesce(v_linea -> 'confianza', confianza_extraccion),
          actualizado_en = now()
      WHERE id = v_linea_id;

      IF v_cantidad > v_cantidad_anterior THEN
        FOR v_numero IN (v_cantidad_anterior + 1)..v_cantidad LOOP
          INSERT INTO public.maquinaria_unidades_operacion (linea_id, numero_unidad)
          VALUES (v_linea_id, v_numero)
          ON CONFLICT (linea_id, numero_unidad) DO NOTHING;
        END LOOP;
      ELSIF v_cantidad < v_cantidad_anterior THEN
        DELETE FROM public.maquinaria_unidades_operacion
        WHERE linea_id = v_linea_id AND numero_unidad > v_cantidad;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.maquinaria_operacion_lineas l
    WHERE l.operacion_id = p_operacion_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_lineas) x
        WHERE nullif(x ->> 'id', '')::uuid = l.id
      )
      AND EXISTS (
        SELECT 1
        FROM public.maquinaria_unidades_operacion u
        LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
        LEFT JOIN public.maquinaria_importacion_unidades iu ON iu.unidad_id = u.id
        WHERE u.linea_id = l.id
          AND (
            nullif(btrim(u.chasis), '') IS NOT NULL
            OR u.estado <> 'PENDIENTE'
            OR s.id IS NOT NULL
            OR iu.id IS NOT NULL
          )
      )
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una linea con trazabilidad';
  END IF;

  DELETE FROM public.maquinaria_operacion_lineas l
  WHERE l.operacion_id = p_operacion_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lineas) x
      WHERE nullif(x ->> 'id', '')::uuid = l.id
    );

  IF v_estado_operacion NOT IN ('FACTURADA','CERRADA') THEN
    IF EXISTS (
      SELECT 1 FROM public.maquinaria_operacion_lineas
      WHERE operacion_id = p_operacion_id AND abastecimiento = 'IMPORTAR'
    ) THEN
      INSERT INTO public.maquinaria_importaciones_operativas (operacion_id)
      VALUES (p_operacion_id)
      ON CONFLICT (operacion_id) DO NOTHING;
      UPDATE public.maquinaria_operaciones
      SET estado = 'EN_IMPORTACION', actualizado_en = now()
      WHERE id = p_operacion_id;
    ELSE
      UPDATE public.maquinaria_operaciones
      SET estado = 'ABASTECIMIENTO', actualizado_en = now()
      WHERE id = p_operacion_id;
    END IF;
  END IF;

  RETURN p_operacion_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maquinaria_guardar_importacion(
  p_importacion_id uuid,
  p_datos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id uuid := coalesce(p_importacion_id, gen_random_uuid());
  v_cantidad integer := greatest(1, least(500, coalesce((p_datos ->> 'cantidad')::integer, 1)));
  v_minimo integer;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden gestionar importaciones'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_datos ->> 'producto'), '') IS NULL
     AND nullif(btrim(p_datos ->> 'modelo'), '') IS NULL THEN
    RAISE EXCEPTION 'Ingresa el producto o modelo de la maquina';
  END IF;

  IF p_importacion_id IS NULL THEN
    INSERT INTO public.maquinaria_importacion_lineas (
      id, source_id, source_sheet, datos_fuente, marca_importacion,
      np_numero, proveedor, producto, modelo, cantidad, estado_fuente,
      oc, po, eta, transporte, origen, destino, notas
    ) VALUES (
      v_id, 'MANUAL:' || v_id::text, 'CARGA MANUAL',
      jsonb_build_object('origen', 'CARGA MANUAL', 'creado_por', auth.uid()),
      coalesce(nullif(upper(p_datos ->> 'marca'), '')::public.marca, 'OTROS'::public.marca),
      nullif(btrim(p_datos ->> 'np_numero'), ''),
      nullif(btrim(p_datos ->> 'proveedor'), ''),
      nullif(btrim(p_datos ->> 'producto'), ''),
      nullif(btrim(p_datos ->> 'modelo'), ''),
      v_cantidad,
      coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), 'PLANIFICADA'),
      nullif(btrim(p_datos ->> 'oc'), ''),
      nullif(btrim(p_datos ->> 'po'), ''),
      nullif(p_datos ->> 'eta', '')::date,
      nullif(btrim(p_datos ->> 'transporte'), ''),
      nullif(btrim(p_datos ->> 'origen'), ''),
      nullif(btrim(p_datos ->> 'destino'), ''),
      nullif(btrim(p_datos ->> 'notas'), '')
    );
  ELSE
    PERFORM 1 FROM public.maquinaria_importacion_lineas
    WHERE id = p_importacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La importacion no existe'; END IF;

    SELECT coalesce(max(u.numero_unidad), 0) INTO v_minimo
    FROM public.maquinaria_importacion_unidades u
    WHERE u.importacion_linea_id = p_importacion_id
      AND (
        u.unidad_id IS NOT NULL
        OR nullif(btrim(u.chasis), '') IS NOT NULL
        OR u.invoice_supplier IS NOT NULL
        OR u.ata IS NOT NULL
      );
    IF v_cantidad < v_minimo THEN
      RAISE EXCEPTION 'No se puede reducir la cantidad por debajo de %: esas unidades ya tienen trazabilidad', v_minimo;
    END IF;

    UPDATE public.maquinaria_importacion_lineas
    SET marca_importacion = coalesce(nullif(upper(p_datos ->> 'marca'), '')::public.marca, 'OTROS'::public.marca),
        np_numero = nullif(btrim(p_datos ->> 'np_numero'), ''),
        proveedor = nullif(btrim(p_datos ->> 'proveedor'), ''),
        producto = nullif(btrim(p_datos ->> 'producto'), ''),
        modelo = nullif(btrim(p_datos ->> 'modelo'), ''),
        cantidad = v_cantidad,
        estado_fuente = coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), estado_fuente),
        oc = nullif(btrim(p_datos ->> 'oc'), ''),
        po = nullif(btrim(p_datos ->> 'po'), ''),
        eta = nullif(p_datos ->> 'eta', '')::date,
        transporte = nullif(btrim(p_datos ->> 'transporte'), ''),
        origen = nullif(btrim(p_datos ->> 'origen'), ''),
        destino = nullif(btrim(p_datos ->> 'destino'), ''),
        notas = nullif(btrim(p_datos ->> 'notas'), ''),
        actualizado_en = now()
    WHERE id = p_importacion_id;
  END IF;

  RETURN v_id;
END;
$function$;

-- Una unidad cuyo origen es IMPORTAR solo puede ocupar stock cuando el arribo
-- fue registrado y el chasis coincide exactamente con una fila real de stock.
CREATE OR REPLACE FUNCTION public.maquinaria_validar_origen_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_abastecimiento text;
BEGIN
  IF NEW.unidad_operacion_id IS NULL THEN RETURN NEW; END IF;

  SELECT l.abastecimiento INTO v_abastecimiento
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  WHERE u.id = NEW.unidad_operacion_id;

  IF v_abastecimiento = 'IMPORTAR' AND NOT EXISTS (
    SELECT 1 FROM public.maquinaria_importacion_unidades iu
    WHERE iu.unidad_id = NEW.unidad_operacion_id
      AND iu.activa
      AND iu.vinculo_manual
      AND iu.ata IS NOT NULL
      AND public.normalizar_chasis_notificacion(iu.chasis)
        = public.normalizar_chasis_notificacion(NEW.chasis)
  ) THEN
    RAISE EXCEPTION 'La maquina importada requiere arribo registrado y coincidencia exacta de chasis para entrar al stock'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_reserva_importada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_id uuid;
  v_coincidencias integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.unidad_id IS NOT NULL
     AND (
       OLD.unidad_id IS DISTINCT FROM NEW.unidad_id
       OR public.normalizar_chasis_notificacion(OLD.chasis)
          IS DISTINCT FROM public.normalizar_chasis_notificacion(NEW.chasis)
     ) THEN
    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE unidad_operacion_id = OLD.unidad_id
      AND public.normalizar_chasis_notificacion(chasis)
        = public.normalizar_chasis_notificacion(coalesce(OLD.chasis, NEW.chasis));
  END IF;

  IF NEW.unidad_id IS NOT NULL
     AND NEW.ata IS NOT NULL
     AND NEW.vinculo_manual
     AND public.normalizar_chasis_notificacion(NEW.chasis) IS NOT NULL THEN
    SELECT count(*), min(s.id::text)::uuid
    INTO v_coincidencias, v_stock_id
    FROM public.parque_stock_maquinas s
    WHERE public.normalizar_chasis_notificacion(s.chasis)
      = public.normalizar_chasis_notificacion(NEW.chasis);

    IF v_coincidencias = 1 THEN
      UPDATE public.parque_stock_maquinas
      SET unidad_operacion_id = NEW.unidad_id
      WHERE id = v_stock_id
        AND (unidad_operacion_id IS NULL OR unidad_operacion_id = NEW.unidad_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_sincronizar_reserva_importada_trigger
  ON public.maquinaria_importacion_unidades;
CREATE TRIGGER maquinaria_sincronizar_reserva_importada_trigger
AFTER INSERT OR UPDATE OF unidad_id, ata, chasis
ON public.maquinaria_importacion_unidades
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_reserva_importada();

-- Al importar el stock del sistema, reserva automaticamente solo si existe una
-- unica unidad importada, recibida y vinculada con el mismo chasis. Una
-- coincidencia duplicada se deja sin reserva para revision manual.
CREATE OR REPLACE FUNCTION public.maquinaria_vincular_stock_importado_recibido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidad_id uuid;
  v_coincidencias integer;
  v_abastecimiento text;
BEGIN
  IF public.normalizar_chasis_notificacion(NEW.chasis) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.unidad_operacion_id IS NOT NULL THEN
    SELECT l.abastecimiento INTO v_abastecimiento
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE u.id = NEW.unidad_operacion_id;
    IF v_abastecimiento IS DISTINCT FROM 'IMPORTAR' THEN RETURN NEW; END IF;
    -- Las reservas IMPORTAR preservadas por el reemplazo de stock tambien
    -- deben volver a demostrar que el chasis es unico y exacto.
    NEW.unidad_operacion_id := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parque_stock_maquinas s
    WHERE s.id IS DISTINCT FROM NEW.id
      AND public.normalizar_chasis_notificacion(s.chasis)
        = public.normalizar_chasis_notificacion(NEW.chasis)
  ) THEN
    UPDATE public.parque_stock_maquinas
    SET unidad_operacion_id = NULL
    WHERE id IS DISTINCT FROM NEW.id
      AND public.normalizar_chasis_notificacion(chasis)
        = public.normalizar_chasis_notificacion(NEW.chasis)
      AND unidad_operacion_id IS NOT NULL;
    NEW.unidad_operacion_id := NULL;
    RETURN NEW;
  END IF;

  SELECT count(*), min(iu.unidad_id::text)::uuid
  INTO v_coincidencias, v_unidad_id
  FROM public.maquinaria_importacion_unidades iu
  JOIN public.maquinaria_unidades_operacion u ON u.id = iu.unidad_id
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE iu.activa
    AND iu.vinculo_manual
    AND iu.ata IS NOT NULL
    AND l.abastecimiento = 'IMPORTAR'
    AND o.estado <> 'CANCELADA'
    AND public.normalizar_chasis_notificacion(iu.chasis)
      = public.normalizar_chasis_notificacion(NEW.chasis);

  IF v_coincidencias = 1 AND NOT EXISTS (
    SELECT 1 FROM public.parque_stock_maquinas s
    WHERE s.unidad_operacion_id = v_unidad_id
      AND s.id IS DISTINCT FROM NEW.id
  ) THEN
    NEW.unidad_operacion_id := v_unidad_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_asignar_stock_importado_recibido_trigger
  ON public.parque_stock_maquinas;
CREATE TRIGGER maquinaria_asignar_stock_importado_recibido_trigger
BEFORE INSERT OR UPDATE OF chasis
ON public.parque_stock_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_vincular_stock_importado_recibido();

-- El pedido pasa a disponible recien despues de la confirmacion del stock. Si
-- una coincidencia deja de ser unica, revierte a en transito.
CREATE OR REPLACE FUNCTION public.maquinaria_confirmar_stock_importado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid;
  v_abastecimiento text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.unidad_operacion_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.unidad_operacion_id IS DISTINCT FROM NEW.unidad_operacion_id) THEN
    SELECT l.operacion_id, l.abastecimiento
    INTO v_operacion_id, v_abastecimiento
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE u.id = OLD.unidad_operacion_id;

    IF v_abastecimiento = 'IMPORTAR' AND NOT EXISTS (
      SELECT 1 FROM public.parque_stock_maquinas s
      WHERE s.unidad_operacion_id = OLD.unidad_operacion_id
    ) THEN
      UPDATE public.maquinaria_unidades_operacion
      SET estado = CASE WHEN estado = 'DISPONIBLE' THEN 'EN_TRANSITO' ELSE estado END,
          actualizado_en = now()
      WHERE id = OLD.unidad_operacion_id;
      UPDATE public.maquinaria_operaciones
      SET estado = CASE WHEN estado = 'DISPONIBLE' THEN 'EN_IMPORTACION' ELSE estado END,
          actualizado_en = now()
      WHERE id = v_operacion_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.unidad_operacion_id IS NULL THEN RETURN NEW; END IF;

  SELECT l.operacion_id, l.abastecimiento
  INTO v_operacion_id, v_abastecimiento
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  WHERE u.id = NEW.unidad_operacion_id;

  IF v_abastecimiento <> 'IMPORTAR' OR NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_importacion_unidades iu
    WHERE iu.unidad_id = NEW.unidad_operacion_id
      AND iu.activa
      AND iu.vinculo_manual
      AND iu.ata IS NOT NULL
      AND public.normalizar_chasis_notificacion(iu.chasis)
        = public.normalizar_chasis_notificacion(NEW.chasis)
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.maquinaria_unidades_operacion
  SET chasis = coalesce(nullif(btrim(chasis), ''), NEW.chasis),
      estado = CASE WHEN estado IN ('PENDIENTE','EN_TRANSITO') THEN 'DISPONIBLE' ELSE estado END,
      actualizado_en = now()
  WHERE id = NEW.unidad_operacion_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_operacion_lineas l
    JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
    LEFT JOIN public.parque_stock_maquinas s ON s.unidad_operacion_id = u.id
    WHERE l.operacion_id = v_operacion_id
      AND l.abastecimiento IN ('STOCK','IMPORTAR')
      AND s.id IS NULL
  ) THEN
    UPDATE public.maquinaria_operaciones
    SET estado = CASE WHEN estado IN ('FACTURADA','CERRADA','CANCELADA') THEN estado ELSE 'DISPONIBLE' END,
        actualizado_en = now()
    WHERE id = v_operacion_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_confirmar_stock_importado_trigger
  ON public.parque_stock_maquinas;
CREATE TRIGGER maquinaria_confirmar_stock_importado_trigger
AFTER INSERT OR DELETE OR UPDATE OF unidad_operacion_id
ON public.parque_stock_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_confirmar_stock_importado();

CREATE OR REPLACE FUNCTION public.maquinaria_recibir_unidad_importacion(
  p_importacion_unidad_id uuid,
  p_fecha date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_unidad public.maquinaria_importacion_unidades%ROWTYPE;
  v_stock_id uuid;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden recibir importaciones'
      USING ERRCODE = '42501';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha de arribo es obligatoria';
  END IF;

  SELECT * INTO v_unidad
  FROM public.maquinaria_importacion_unidades
  WHERE id = p_importacion_unidad_id AND activa
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad importada no existe'; END IF;
  IF public.normalizar_chasis_notificacion(v_unidad.chasis) IS NULL THEN
    RAISE EXCEPTION 'Carga el chasis antes de registrar el arribo';
  END IF;

  UPDATE public.maquinaria_importacion_unidades
  SET ata = p_fecha,
      estado_fuente = 'RECIBIDA',
      detalle_manual = true,
      actualizado_en = now()
  WHERE id = v_unidad.id;

  IF v_unidad.operacion_id IS NOT NULL THEN
    UPDATE public.maquinaria_importaciones_operativas
    SET estado = CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.maquinaria_importacion_unidades pendiente
            WHERE pendiente.operacion_id = v_unidad.operacion_id
              AND pendiente.activa
              AND pendiente.ata IS NULL
          ) THEN 'RECIBIDA'
          ELSE 'EN_TRANSITO'
        END,
        actualizado_en = now()
    WHERE operacion_id = v_unidad.operacion_id;

  END IF;

  SELECT min(s.id::text)::uuid INTO v_stock_id
  FROM public.parque_stock_maquinas s
  WHERE s.unidad_operacion_id = v_unidad.unidad_id
    AND public.normalizar_chasis_notificacion(s.chasis)
      = public.normalizar_chasis_notificacion(v_unidad.chasis);

  RETURN jsonb_build_object(
    'importacion_unidad_id', v_unidad.id,
    'stock_id', v_stock_id,
    'unidad_operacion_id', v_unidad.unidad_id,
    'stock_confirmado', v_stock_id IS NOT NULL,
    'reservada', v_stock_id IS NOT NULL AND v_unidad.unidad_id IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_puede_gestionar_flujo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_actualizar_operacion(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maquinaria_recibir_unidad_importacion(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_puede_gestionar_flujo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_actualizar_operacion(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_recibir_unidad_importacion(uuid, date) TO authenticated;

DROP VIEW IF EXISTS public.maquinaria_importacion_unidades_operativas;
CREATE VIEW public.maquinaria_importacion_unidades_operativas
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
  u.factura_proveedor_fecha, u.factura_proveedor_moneda,
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
  coalesce(l.marca, i.marca_importacion)::text AS marca,
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

GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;

NOTIFY pgrst, 'reload schema';
