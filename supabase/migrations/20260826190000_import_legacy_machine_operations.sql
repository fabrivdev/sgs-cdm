-- Carga histórica única de las operaciones de maquinaria del Google Sheet.
-- Origen: Planificador de Importaciones - CDM / pestaña PEDIDOS DE VENTA.
-- La carga es idempotente: puede ejecutarse nuevamente sin duplicar NP, líneas ni unidades.
-- Cada fila física de la planilla se conserva como una línea independiente
-- (por ejemplo: máquina + cabezal/plataforma = dos líneas).

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_operacion_lineas_fuente_fila_unique
  ON public.maquinaria_operacion_lineas ((datos_extraidos->>'fuente_fila_id'))
  WHERE nullif(datos_extraidos->>'fuente_fila_id', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.maquinaria_importar_historico_pedidos(
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_grupo record;
  v_fila jsonb;
  v_primera jsonb;
  v_operacion_id uuid;
  v_linea_id uuid;
  v_unidad_id uuid;
  v_unidad_chasis_id uuid;
  v_linea_chasis_id uuid;
  v_cliente_id uuid;
  v_parque_id uuid;
  v_importacion_id uuid;
  v_marca public.marca;
  v_subgrupo public.subgrupo_maquina;
  v_modelo text;
  v_modelo_catalogo text;
  v_producto text;
  v_chasis text;
  v_chasis_normalizado text;
  v_fuente_id text;
  v_estado_operacion text;
  v_estado_unidad text;
  v_abastecimiento text;
  v_condicion text;
  v_observaciones text;
  v_facturas text;
  v_factura_fecha date;
  v_valor_importacion numeric;
  v_metadata jsonb;
  v_linea_numero integer;
  v_creada boolean;
  v_modelo_validado boolean;
  v_conflicto_chasis boolean;
  v_operaciones_creadas integer := 0;
  v_operaciones_actualizadas integer := 0;
  v_lineas_creadas integer := 0;
  v_lineas_vinculadas integer := 0;
  v_lineas_omitidas integer := 0;
  v_unidades_creadas integer := 0;
  v_modelos_pendientes integer := 0;
  v_conflictos_chasis integer := 0;
BEGIN
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo administradores pueden cargar el histórico de maquinaria'
      USING ERRCODE = '42501';
  END IF;

  FOR v_grupo IN
    SELECT
      upper(btrim(e.value->>'np_numero')) AS np_clave,
      jsonb_agg(e.value ORDER BY (e.value->>'source_row')::integer) AS filas
    FROM jsonb_array_elements(p_filas) AS e(value)
    WHERE nullif(btrim(e.value->>'np_numero'), '') IS NOT NULL
    GROUP BY upper(btrim(e.value->>'np_numero'))
  LOOP
    v_primera := v_grupo.filas->0;
    v_operacion_id := NULL;
    v_cliente_id := NULL;

    SELECT c.id
      INTO v_cliente_id
    FROM public.clientes c
    WHERE regexp_replace(
            translate(upper(coalesce(c.nombre, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
            '[^A-Z0-9]+', '', 'g'
          ) = regexp_replace(
            translate(upper(coalesce(v_primera->>'cliente', '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
            '[^A-Z0-9]+', '', 'g'
          )
    LIMIT 1;

    SELECT string_agg(DISTINCT nullif(btrim(x.value->>'observaciones'), ''), ' | ')
      INTO v_observaciones
    FROM jsonb_array_elements(v_grupo.filas) AS x(value);

    SELECT CASE
             WHEN bool_and(lower(coalesce(x.value->>'estado', '')) = 'completado')
               THEN 'FACTURADA'
             WHEN bool_or(
                    lower(coalesce(x.value->>'estado', '')) = 'pendiente'
                    AND translate(upper(coalesce(x.value->>'abastecimiento', '')), 'Ó', 'O') = 'IMPORTACION'
                  )
               THEN 'EN_IMPORTACION'
             ELSE 'ABASTECIMIENTO'
           END
      INTO v_estado_operacion
    FROM jsonb_array_elements(v_grupo.filas) AS x(value);

    SELECT o.id
      INTO v_operacion_id
    FROM public.maquinaria_operaciones o
    WHERE upper(btrim(o.np_numero)) = v_grupo.np_clave
      AND o.estado <> 'CANCELADA'
    LIMIT 1;

    IF v_operacion_id IS NULL THEN
      INSERT INTO public.maquinaria_operaciones (
        np_numero,
        np_fecha,
        cliente_id,
        cliente_nombre,
        comercial,
        estado,
        observaciones,
        validado_en,
        actualizado_en
      )
      VALUES (
        v_primera->>'np_numero',
        nullif(v_primera->>'np_fecha', '')::date,
        v_cliente_id,
        nullif(v_primera->>'cliente', ''),
        nullif(v_primera->>'comercial', ''),
        v_estado_operacion,
        v_observaciones,
        now(),
        now()
      )
      RETURNING id INTO v_operacion_id;
      v_operaciones_creadas := v_operaciones_creadas + 1;
    ELSE
      UPDATE public.maquinaria_operaciones o
      SET np_fecha = coalesce(o.np_fecha, nullif(v_primera->>'np_fecha', '')::date),
          cliente_id = coalesce(o.cliente_id, v_cliente_id),
          cliente_nombre = coalesce(nullif(btrim(o.cliente_nombre), ''), nullif(v_primera->>'cliente', '')),
          comercial = coalesce(nullif(btrim(o.comercial), ''), nullif(v_primera->>'comercial', '')),
          observaciones = coalesce(nullif(btrim(o.observaciones), ''), v_observaciones),
          estado = CASE
            WHEN o.estado IN ('BORRADOR', 'REVISION_NP', 'NP_VALIDADA', 'ABASTECIMIENTO', 'EN_IMPORTACION')
              THEN v_estado_operacion
            ELSE o.estado
          END,
          actualizado_en = now()
      WHERE o.id = v_operacion_id;
      v_operaciones_actualizadas := v_operaciones_actualizadas + 1;
    END IF;

    FOR v_fila IN
      SELECT x.value
      FROM jsonb_array_elements(v_grupo.filas) AS x(value)
      ORDER BY (x.value->>'source_row')::integer
    LOOP
      v_fuente_id := v_fila->>'source_id';
      v_producto := nullif(btrim(v_fila->>'producto'), '');
      v_modelo := nullif(btrim(v_fila->>'modelo'), '');
      v_chasis := nullif(btrim(v_fila->>'chasis'), '');
      IF upper(coalesce(v_chasis, '')) IN ('0', 'S/CHASIS', 'SIN CHASIS', 'N/A', 'NA', 'O KM', '0 KM') THEN
        v_chasis := NULL;
      END IF;
      v_chasis_normalizado := public.normalizar_chasis_notificacion(v_chasis);

      v_marca := CASE upper(btrim(coalesce(v_fila->>'marca', '')))
        WHEN 'CLAAS' THEN 'CLAAS'::public.marca
        WHEN 'HORSCH' THEN 'HORSCH'::public.marca
        ELSE 'OTROS'::public.marca
      END;

      v_subgrupo := CASE
        WHEN upper(coalesce(v_producto, '')) IN ('PLATAFORMA', 'DIRECT DISC', 'C - PICADORA')
          THEN 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina
        WHEN upper(coalesce(v_producto, '')) = 'M - COSECHADORA'
          THEN 'COSECHADORAS'::public.subgrupo_maquina
        WHEN upper(coalesce(v_producto, '')) = 'M - PICADORA'
          THEN 'PICADORAS'::public.subgrupo_maquina
        WHEN upper(coalesce(v_producto, '')) = 'PLANTADORA / SEMBRADORA'
          THEN 'SEMBRADORAS'::public.subgrupo_maquina
        WHEN upper(coalesce(v_producto, '')) = 'PULVERIZADORA'
          THEN 'PULVERIZADORAS'::public.subgrupo_maquina
        WHEN upper(coalesce(v_producto, '')) = 'SUELO'
          THEN 'SUELO'::public.subgrupo_maquina
        ELSE 'OTRO'::public.subgrupo_maquina
      END;

      v_abastecimiento := CASE
        WHEN translate(upper(coalesce(v_fila->>'abastecimiento', '')), 'Ó', 'O') = 'IMPORTACION'
          THEN 'IMPORTAR'
        WHEN upper(coalesce(v_fila->>'abastecimiento', '')) = 'STOCK'
          THEN 'STOCK'
        ELSE 'DEFINIR'
      END;

      v_condicion := CASE
        WHEN upper(coalesce(v_fila->>'condicion', '')) = 'USADA' THEN 'USADA'
        ELSE 'NUEVA'
      END;

      v_estado_unidad := CASE
        WHEN lower(coalesce(v_fila->>'estado', '')) = 'completado' THEN 'FACTURADA'
        ELSE 'PENDIENTE'
      END;

      v_modelo_catalogo := NULL;
      SELECT m.nombre
        INTO v_modelo_catalogo
      FROM public.parque_modelos_catalogo m
      WHERE m.marca = v_marca
        AND m.subgrupo = v_subgrupo
        AND m.activo
        AND m.clave_normalizada = public.parque_modelo_clave(v_modelo)
      LIMIT 1;

      v_modelo_validado := v_modelo_catalogo IS NOT NULL;
      IF v_modelo_validado THEN
        v_modelo := v_modelo_catalogo;
      ELSE
        v_modelos_pendientes := v_modelos_pendientes + 1;
      END IF;

      v_metadata := jsonb_build_object(
        'fuente', 'GOOGLE_SHEETS_PEDIDOS_DE_VENTA',
        'fuente_fila_id', v_fuente_id,
        'fuente_fila_numero', (v_fila->>'source_row')::integer,
        'modelo_catalogo_validado', v_modelo_validado,
        'modelo_original', v_fila->>'modelo',
        'marca_original', v_fila->>'marca',
        'historico_pedido', v_fila
      );

      v_linea_id := NULL;
      v_unidad_id := NULL;
      v_creada := false;
      v_conflicto_chasis := false;

      SELECT l.id
        INTO v_linea_id
      FROM public.maquinaria_operacion_lineas l
      WHERE l.datos_extraidos->>'fuente_fila_id' = v_fuente_id
      LIMIT 1;

      IF v_linea_id IS NULL AND v_chasis_normalizado IS NOT NULL THEN
        SELECT l.id, u.id
          INTO v_linea_id, v_unidad_id
        FROM public.maquinaria_operacion_lineas l
        JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
        WHERE l.operacion_id = v_operacion_id
          AND public.normalizar_chasis_notificacion(u.chasis) = v_chasis_normalizado
        LIMIT 1;
      END IF;

      IF v_linea_id IS NULL AND v_chasis_normalizado IS NULL THEN
        SELECT l.id
          INTO v_linea_id
        FROM public.maquinaria_operacion_lineas l
        WHERE l.operacion_id = v_operacion_id
          AND nullif(l.datos_extraidos->>'fuente_fila_id', '') IS NULL
          AND public.parque_modelo_clave(l.modelo) = public.parque_modelo_clave(v_modelo)
          AND public.parque_modelo_clave(l.producto) = public.parque_modelo_clave(v_producto)
        ORDER BY l.linea_numero
        LIMIT 1;
      END IF;

      IF v_linea_id IS NULL THEN
        SELECT coalesce(max(l.linea_numero), 0) + 1
          INTO v_linea_numero
        FROM public.maquinaria_operacion_lineas l
        WHERE l.operacion_id = v_operacion_id;

        INSERT INTO public.maquinaria_operacion_lineas (
          operacion_id,
          linea_numero,
          marca,
          producto,
          modelo,
          subgrupo,
          cantidad,
          condicion,
          abastecimiento,
          datos_extraidos,
          confianza_extraccion,
          actualizado_en
        )
        VALUES (
          v_operacion_id,
          v_linea_numero,
          v_marca,
          v_producto,
          v_modelo,
          v_subgrupo,
          1,
          v_condicion,
          v_abastecimiento,
          v_metadata,
          jsonb_build_object(
            'historico', 1,
            'modelo_catalogo', CASE WHEN v_modelo_validado THEN 1 ELSE 0 END
          ),
          now()
        )
        RETURNING id INTO v_linea_id;
        v_lineas_creadas := v_lineas_creadas + 1;
        v_creada := true;
      ELSE
        UPDATE public.maquinaria_operacion_lineas l
        SET marca = CASE WHEN l.marca = 'OTROS'::public.marca THEN v_marca ELSE l.marca END,
            producto = coalesce(nullif(btrim(l.producto), ''), v_producto),
            modelo = coalesce(nullif(btrim(l.modelo), ''), v_modelo),
            subgrupo = CASE WHEN l.subgrupo = 'OTRO'::public.subgrupo_maquina THEN v_subgrupo ELSE l.subgrupo END,
            condicion = coalesce(l.condicion, v_condicion),
            abastecimiento = CASE WHEN l.abastecimiento = 'DEFINIR' THEN v_abastecimiento ELSE l.abastecimiento END,
            datos_extraidos = coalesce(l.datos_extraidos, '{}'::jsonb) || v_metadata,
            confianza_extraccion = coalesce(l.confianza_extraccion, '{}'::jsonb)
              || jsonb_build_object(
                   'historico', 1,
                   'modelo_catalogo', CASE WHEN v_modelo_validado THEN 1 ELSE 0 END
                 ),
            actualizado_en = now()
        WHERE l.id = v_linea_id;
        v_lineas_vinculadas := v_lineas_vinculadas + 1;
      END IF;

      IF v_chasis_normalizado IS NOT NULL THEN
        v_unidad_chasis_id := NULL;
        v_linea_chasis_id := NULL;
        SELECT u.id, u.linea_id
          INTO v_unidad_chasis_id, v_linea_chasis_id
        FROM public.maquinaria_unidades_operacion u
        WHERE public.normalizar_chasis_notificacion(u.chasis) = v_chasis_normalizado
        LIMIT 1;

        IF v_unidad_chasis_id IS NOT NULL AND v_linea_chasis_id <> v_linea_id THEN
          v_conflicto_chasis := true;
          v_conflictos_chasis := v_conflictos_chasis + 1;
          UPDATE public.maquinaria_operacion_lineas
          SET datos_extraidos = datos_extraidos || jsonb_build_object(
                'conflicto_chasis', v_chasis,
                'conflicto_unidad_id', v_unidad_chasis_id
              )
          WHERE id = v_linea_id;
        ELSIF v_unidad_chasis_id IS NOT NULL THEN
          v_unidad_id := v_unidad_chasis_id;
        END IF;
      END IF;

      IF v_unidad_id IS NULL THEN
        SELECT u.id
          INTO v_unidad_id
        FROM public.maquinaria_unidades_operacion u
        WHERE u.linea_id = v_linea_id
        ORDER BY u.numero_unidad
        LIMIT 1;
      END IF;

      v_parque_id := NULL;
      IF v_chasis_normalizado IS NOT NULL AND NOT v_conflicto_chasis THEN
        SELECT p.id
          INTO v_parque_id
        FROM public.parque_maquinas p
        WHERE public.normalizar_chasis_notificacion(p.serie) = v_chasis_normalizado
        LIMIT 1;
      END IF;

      IF v_unidad_id IS NULL THEN
        INSERT INTO public.maquinaria_unidades_operacion (
          linea_id,
          numero_unidad,
          chasis,
          valor_facturado,
          moneda,
          estado,
          parque_maquina_id,
          actualizado_en
        )
        VALUES (
          v_linea_id,
          1,
          CASE WHEN v_conflicto_chasis THEN NULL ELSE v_chasis END,
          nullif(v_fila->>'valor_factura', '')::numeric,
          CASE WHEN nullif(v_fila->>'valor_factura', '') IS NOT NULL THEN 'USD' ELSE NULL END,
          CASE WHEN v_parque_id IS NOT NULL THEN 'EN_PARQUE' ELSE v_estado_unidad END,
          v_parque_id,
          now()
        )
        RETURNING id INTO v_unidad_id;
        v_unidades_creadas := v_unidades_creadas + 1;
      ELSE
        UPDATE public.maquinaria_unidades_operacion u
        SET chasis = coalesce(
              nullif(btrim(u.chasis), ''),
              CASE WHEN v_conflicto_chasis THEN NULL ELSE v_chasis END
            ),
            valor_facturado = coalesce(u.valor_facturado, nullif(v_fila->>'valor_factura', '')::numeric),
            moneda = coalesce(u.moneda, CASE WHEN nullif(v_fila->>'valor_factura', '') IS NOT NULL THEN 'USD' END),
            parque_maquina_id = coalesce(u.parque_maquina_id, v_parque_id),
            estado = CASE
              WHEN coalesce(u.parque_maquina_id, v_parque_id) IS NOT NULL THEN 'EN_PARQUE'
              WHEN u.estado = 'PENDIENTE' THEN v_estado_unidad
              ELSE u.estado
            END,
            actualizado_en = now()
        WHERE u.id = v_unidad_id;
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_grupo.filas) AS x(value)
      WHERE translate(upper(coalesce(x.value->>'abastecimiento', '')), 'Ó', 'O') = 'IMPORTACION'
    ) THEN
      v_facturas := NULL;
      v_factura_fecha := NULL;
      v_valor_importacion := NULL;
      v_importacion_id := NULL;
      SELECT
        string_agg(DISTINCT nullif(btrim(x.value->>'factura_numero'), ''), ', '),
        max(nullif(x.value->>'factura_fecha', '')::date),
        sum(coalesce(nullif(x.value->>'valor_factura', '')::numeric, 0))
        FILTER (WHERE nullif(x.value->>'valor_factura', '') IS NOT NULL)
      INTO v_facturas, v_factura_fecha, v_valor_importacion
      FROM jsonb_array_elements(v_grupo.filas) AS x(value)
      WHERE translate(upper(coalesce(x.value->>'abastecimiento', '')), 'Ó', 'O') = 'IMPORTACION';

      SELECT i.id
        INTO v_importacion_id
      FROM public.maquinaria_importaciones_operativas i
      WHERE i.operacion_id = v_operacion_id
      LIMIT 1;

      IF v_importacion_id IS NULL THEN
        INSERT INTO public.maquinaria_importaciones_operativas (
          operacion_id,
          factura_numero,
          factura_fecha,
          moneda,
          valor_facturado,
          estado,
          actualizado_en
        )
        VALUES (
          v_operacion_id,
          v_facturas,
          v_factura_fecha,
          CASE WHEN v_valor_importacion IS NOT NULL THEN 'USD' ELSE NULL END,
          v_valor_importacion,
          CASE WHEN v_estado_operacion = 'FACTURADA' THEN 'RECIBIDA' ELSE 'PENDIENTE_FACTURA' END,
          now()
        );
      ELSE
        UPDATE public.maquinaria_importaciones_operativas i
        SET factura_numero = coalesce(nullif(btrim(i.factura_numero), ''), v_facturas),
            factura_fecha = coalesce(i.factura_fecha, v_factura_fecha),
            moneda = coalesce(i.moneda, CASE WHEN v_valor_importacion IS NOT NULL THEN 'USD' END),
            valor_facturado = coalesce(i.valor_facturado, v_valor_importacion),
            actualizado_en = now()
        WHERE i.id = v_importacion_id;
      END IF;
    END IF;

    IF v_estado_operacion = 'FACTURADA'
       AND NOT EXISTS (
         SELECT 1
         FROM public.maquinaria_operacion_lineas l
         JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
         WHERE l.operacion_id = v_operacion_id
           AND l.elegible_parque
           AND u.parque_maquina_id IS NULL
       ) THEN
      UPDATE public.maquinaria_operaciones
      SET estado = 'CERRADA',
          actualizado_en = now()
      WHERE id = v_operacion_id
        AND estado NOT IN ('CANCELADA', 'CERRADA');
    END IF;
  END LOOP;

  SELECT count(*)
    INTO v_lineas_omitidas
  FROM jsonb_array_elements(p_filas) AS x(value)
  WHERE nullif(btrim(x.value->>'np_numero'), '') IS NULL;

  RETURN jsonb_build_object(
    'operaciones_creadas', v_operaciones_creadas,
    'operaciones_actualizadas', v_operaciones_actualizadas,
    'lineas_creadas', v_lineas_creadas,
    'lineas_vinculadas', v_lineas_vinculadas,
    'unidades_creadas', v_unidades_creadas,
    'modelos_pendientes_de_validacion', v_modelos_pendientes,
    'conflictos_de_chasis', v_conflictos_chasis,
    'filas_sin_np_omitidas', v_lineas_omitidas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_importar_historico_pedidos(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_importar_historico_pedidos(jsonb) TO authenticated;

-- Ejecuta la carga completa en una sola llamada.
SELECT public.maquinaria_importar_historico_pedidos(
$legacy$
[
  {
    "source_row": 2,
    "source_id": "PEDIDOS_DE_VENTA:2",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 930 RICE 30 PIES",
    "estado": "Completado",
    "factura_numero": "182410",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 91718,
    "valor_factura": 97000,
    "utilidad": 5282,
    "margen_porcentaje": 5,
    "dias_transcurridos": 215,
    "chasis": "59102377",
    "valor_entrega_usado": 315000,
    "valor_total_pedido": 2333780,
    "observaciones": "Se toma como parte de pago 4 cosechadoras usadas con sus plataformas",
    "documentaciones": null
  },
  {
    "source_row": 3,
    "source_id": "PEDIDOS_DE_VENTA:3",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 930 RICE 30 PIES",
    "estado": "Completado",
    "factura_numero": "182410",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 91718,
    "valor_factura": 97000,
    "utilidad": 5282,
    "margen_porcentaje": 5,
    "dias_transcurridos": 215,
    "chasis": "59102451",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 4,
    "source_id": "PEDIDOS_DE_VENTA:4",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 7600 RICE",
    "estado": "Completado",
    "factura_numero": "182410",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 411909,
    "valor_factura": 534945,
    "utilidad": 123036,
    "margen_porcentaje": 23,
    "dias_transcurridos": 215,
    "chasis": "C8511089",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 5,
    "source_id": "PEDIDOS_DE_VENTA:5",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 7600 RICE",
    "estado": "Completado",
    "factura_numero": "182410",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 411909,
    "valor_factura": 534945,
    "utilidad": 123036,
    "margen_porcentaje": 23,
    "dias_transcurridos": 215,
    "chasis": "C8511090",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 6,
    "source_id": "PEDIDOS_DE_VENTA:6",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 7600 RICE",
    "estado": "Completado",
    "factura_numero": "182407",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 411909,
    "valor_factura": 534945,
    "utilidad": 123036,
    "margen_porcentaje": 23,
    "dias_transcurridos": 215,
    "chasis": "C8511085",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 7,
    "source_id": "PEDIDOS_DE_VENTA:7",
    "np_numero": "NP815",
    "np_fecha": "2025-06-27",
    "comercial": "GERENCIA",
    "cliente": "ELADIA SAE",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 7600 RICE",
    "estado": "Completado",
    "factura_numero": "182407",
    "factura_fecha": "2026-01-28",
    "tipo_cambio": null,
    "costo_producto": 410556,
    "valor_factura": 534945,
    "utilidad": 124389,
    "margen_porcentaje": 23,
    "dias_transcurridos": 215,
    "chasis": "C8511093",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 8,
    "source_id": "PEDIDOS_DE_VENTA:8",
    "np_numero": "NP860",
    "np_fecha": "2025-10-02",
    "comercial": "ABEL LOPEZ GONZALEZ",
    "cliente": "GERHARD HARMS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "TRION 710",
    "estado": "Completado",
    "factura_numero": "180934",
    "factura_fecha": "2025-10-14",
    "tipo_cambio": null,
    "costo_producto": 302561,
    "valor_factura": 358500,
    "utilidad": 55939,
    "margen_porcentaje": 16,
    "dias_transcurridos": 12,
    "chasis": "L5500499",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": "Entrega cosechadora MF, Saldo a pagar con fondos propios en guaranies. El negocio incluye una plataforma convio con garantia extendida. 1er servicio incluido, transferencia 50/50.",
    "documentaciones": null
  },
  {
    "source_row": 9,
    "source_id": "PEDIDOS_DE_VENTA:9",
    "np_numero": "NP860",
    "np_fecha": "2025-10-02",
    "comercial": "ABEL LOPEZ GONZALEZ",
    "cliente": "GERHARD HARMS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 1080 35 PIES",
    "estado": "Completado",
    "factura_numero": "183366",
    "factura_fecha": "2026-03-24",
    "tipo_cambio": null,
    "costo_producto": 93762,
    "valor_factura": 130000,
    "utilidad": 36238,
    "margen_porcentaje": 28,
    "dias_transcurridos": 173,
    "chasis": "59101758",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 10,
    "source_id": "PEDIDOS_DE_VENTA:10",
    "np_numero": "NP561",
    "np_fecha": "2025-10-10",
    "comercial": "OSCAR DANIEL BENITEZ MEZA",
    "cliente": "SILO NORTE EAS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Direct Disc",
    "modelo": "DD 600",
    "estado": "Completado",
    "factura_numero": "182150",
    "factura_fecha": "2026-01-19",
    "tipo_cambio": null,
    "costo_producto": 80285,
    "valor_factura": 95000,
    "utilidad": 14715,
    "margen_porcentaje": 15,
    "dias_transcurridos": 101,
    "chasis": "I8002386",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": "5.000 usd anticipo, Restante contado VIA BANCO",
    "documentaciones": null
  },
  {
    "source_row": 11,
    "source_id": "PEDIDOS_DE_VENTA:11",
    "np_numero": "NP561",
    "np_fecha": "2025-10-10",
    "comercial": "OSCAR DANIEL BENITEZ MEZA",
    "cliente": "SILO NORTE EAS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Picadora",
    "modelo": "JAGUAR 940",
    "estado": "Completado",
    "factura_numero": "182150",
    "factura_fecha": "2026-01-19",
    "tipo_cambio": null,
    "costo_producto": 366276,
    "valor_factura": 480000,
    "utilidad": 113724,
    "margen_porcentaje": 24,
    "dias_transcurridos": 101,
    "chasis": "50204895",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 12,
    "source_id": "PEDIDOS_DE_VENTA:12",
    "np_numero": "NP561",
    "np_fecha": "2025-10-10",
    "comercial": "OSCAR DANIEL BENITEZ MEZA",
    "cliente": "SILO NORTE EAS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "C - Picadora",
    "modelo": "ORBIS 600",
    "estado": "Completado",
    "factura_numero": "182150",
    "factura_fecha": "2026-01-19",
    "tipo_cambio": null,
    "costo_producto": 107844,
    "valor_factura": 140000,
    "utilidad": 32156,
    "margen_porcentaje": 23,
    "dias_transcurridos": 101,
    "chasis": "I6102265",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 13,
    "source_id": "PEDIDOS_DE_VENTA:13",
    "np_numero": "NP862",
    "np_fecha": "2025-12-19",
    "comercial": "ABEL LOPEZ GONZALEZ",
    "cliente": "COOPERATIVA CHORTITZER LTDA",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "C - Picadora",
    "modelo": "ORBIS 750",
    "estado": "Completado",
    "factura_numero": "183892",
    "factura_fecha": "2026-04-28",
    "tipo_cambio": null,
    "costo_producto": 125091,
    "valor_factura": 190000,
    "utilidad": 64909,
    "margen_porcentaje": 34,
    "dias_transcurridos": 130,
    "chasis": "I6303745",
    "valor_entrega_usado": 50000,
    "valor_total_pedido": 195700,
    "observaciones": "Entrega Orbis 600",
    "documentaciones": null
  },
  {
    "source_row": 14,
    "source_id": "PEDIDOS_DE_VENTA:14",
    "np_numero": "NP629",
    "np_fecha": "2025-12-23",
    "comercial": "LUIS ANDRES CAÑETE RODRIGUEZ",
    "cliente": "MENFRIE S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 7 CF",
    "estado": "Completado",
    "factura_numero": "182744",
    "factura_fecha": "2026-02-13",
    "tipo_cambio": null,
    "costo_producto": 179676,
    "valor_factura": 250000,
    "utilidad": 70324,
    "margen_porcentaje": 28,
    "dias_transcurridos": 52,
    "chasis": "24491384",
    "valor_entrega_usado": 12000,
    "valor_total_pedido": 252000,
    "observaciones": "Entregan 2 plataformas",
    "documentaciones": null
  },
  {
    "source_row": 15,
    "source_id": "PEDIDOS_DE_VENTA:15",
    "np_numero": "NP630",
    "np_fecha": "2026-03-18",
    "comercial": "LUIS ANDRES CAÑETE RODRIGUEZ",
    "cliente": "HARRY NEUFELD HILDEBRAND",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "14L2",
    "producto": "Plantadora / Sembradora",
    "modelo": "DAKAR 8 CF",
    "estado": "Completado",
    "factura_numero": "183896",
    "factura_fecha": "2026-04-28",
    "tipo_cambio": 5.02,
    "costo_producto": 170614,
    "valor_factura": 203000,
    "utilidad": 32386,
    "margen_porcentaje": 16,
    "dias_transcurridos": 41,
    "chasis": "24491301",
    "valor_entrega_usado": null,
    "valor_total_pedido": 203000,
    "observaciones": "Si vende todo su soja para el 30/04, estará pagando el valor restante, si no pagará el 30/06. Anticipo de 30mil usd",
    "documentaciones": null
  },
  {
    "source_row": 16,
    "source_id": "PEDIDOS_DE_VENTA:16",
    "np_numero": "NP832",
    "np_fecha": "2026-03-19",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "PARAGUAY FARMING S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "BARRA DAKAR 10 CF",
    "estado": "Completado",
    "factura_numero": "183506",
    "factura_fecha": "2026-03-31",
    "tipo_cambio": null,
    "costo_producto": 107997,
    "valor_factura": 139000,
    "utilidad": 31003,
    "margen_porcentaje": 22,
    "dias_transcurridos": 12,
    "chasis": "24121292",
    "valor_entrega_usado": 429000,
    "valor_total_pedido": 1459000,
    "observaciones": "Usados: 2 plantadoras Metasa, 2 plantadoras JD, 1 sembradora JD, 1 Pulverizadora JD. Saldo VIA BANCO",
    "documentaciones": null
  },
  {
    "source_row": 17,
    "source_id": "PEDIDOS_DE_VENTA:17",
    "np_numero": "NP832",
    "np_fecha": "2026-03-19",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "PARAGUAY FARMING S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E50",
    "estado": "Completado",
    "factura_numero": "183506",
    "factura_fecha": "2026-03-31",
    "tipo_cambio": null,
    "costo_producto": 234235,
    "valor_factura": 301000,
    "utilidad": 66765,
    "margen_porcentaje": 22,
    "dias_transcurridos": 12,
    "chasis": "24491402",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 18,
    "source_id": "PEDIDOS_DE_VENTA:18",
    "np_numero": "NP832",
    "np_fecha": "2026-03-19",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "PARAGUAY FARMING S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "27.1L4",
    "producto": "Pulverizadora",
    "modelo": "LEEB 6.280 VL",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": 5.2,
    "costo_producto": 429298,
    "valor_factura": 559000,
    "utilidad": 129702,
    "margen_porcentaje": 23,
    "dias_transcurridos": 160,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 19,
    "source_id": "PEDIDOS_DE_VENTA:19",
    "np_numero": "NP832",
    "np_fecha": "2026-03-19",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "PARAGUAY FARMING S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 32 EVOLUTION",
    "estado": "Completado",
    "factura_numero": "183506",
    "factura_fecha": "2026-03-31",
    "tipo_cambio": null,
    "costo_producto": 363262,
    "valor_factura": 460000,
    "utilidad": 96738,
    "margen_porcentaje": 21,
    "dias_transcurridos": 12,
    "chasis": "22251257",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 20,
    "source_id": "PEDIDOS_DE_VENTA:20",
    "np_numero": "NP830",
    "np_fecha": "2026-03-19",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "HERMANOS FEIX",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "26.31L2",
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E50",
    "estado": "Completado",
    "factura_numero": "184677",
    "factura_fecha": "2026-06-26",
    "tipo_cambio": 5.2,
    "costo_producto": 201628,
    "valor_factura": 255260,
    "utilidad": 53632,
    "margen_porcentaje": 21,
    "dias_transcurridos": 99,
    "chasis": "24491420",
    "valor_entrega_usado": 45810,
    "valor_total_pedido": 255810,
    "observaciones": "Entrega plantadora JD usada, saldo a pagar contra entrega",
    "documentaciones": "Pagado 110.000,00 en fecha 27/03/26 - Saldo 100.000,00$ contra entrega"
  },
  {
    "source_row": 21,
    "source_id": "PEDIDOS_DE_VENTA:21",
    "np_numero": "NP1501",
    "np_fecha": "2026-03-20",
    "comercial": "HELWIN LOPEZ BORGES",
    "cliente": "WELLINGTON ELLY KAEFER",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "26.28L2",
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 14 CF E50",
    "estado": "Completado",
    "factura_numero": "001-001-0004961",
    "factura_fecha": "2026-08-21",
    "tipo_cambio": 5.2,
    "costo_producto": 151374,
    "valor_factura": 190000,
    "utilidad": 38626,
    "margen_porcentaje": 20,
    "dias_transcurridos": 154,
    "chasis": "24491432",
    "valor_entrega_usado": 50000,
    "valor_total_pedido": 195000,
    "observaciones": "En el negocio se toma una plantadora JD. Se anticipa 50.000 usd, y saldo el 30/04/27",
    "documentaciones": "En proceso"
  },
  {
    "source_row": 22,
    "source_id": "PEDIDOS_DE_VENTA:22",
    "np_numero": "NP1401",
    "np_fecha": "2026-03-26",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "ANILTON ROSA DE SOUZA",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 750",
    "estado": "Completado",
    "factura_numero": "183442",
    "factura_fecha": "2026-03-27",
    "tipo_cambio": null,
    "costo_producto": 224592,
    "valor_factura": 206000,
    "utilidad": -18592,
    "margen_porcentaje": -9,
    "dias_transcurridos": 1,
    "chasis": "C6500725",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": "CONTADO",
    "documentaciones": null
  },
  {
    "source_row": 23,
    "source_id": "PEDIDOS_DE_VENTA:23",
    "np_numero": "NP1401",
    "np_fecha": "2026-03-26",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "ANILTON ROSA DE SOUZA",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "MACDOM FD1 35 FT",
    "estado": "Completado",
    "factura_numero": "183442",
    "factura_fecha": "2026-03-27",
    "tipo_cambio": null,
    "costo_producto": 74000,
    "valor_factura": 74000,
    "utilidad": 0,
    "margen_porcentaje": 0,
    "dias_transcurridos": 1,
    "chasis": "258272-14",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 24,
    "source_id": "PEDIDOS_DE_VENTA:24",
    "np_numero": "NP1404",
    "np_fecha": "2026-04-08",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "JAIR ANTONIO BEUREN BAUMBACH",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "TRION 710",
    "estado": "Completado",
    "factura_numero": "183772",
    "factura_fecha": "2026-04-21",
    "tipo_cambio": null,
    "costo_producto": 250647,
    "valor_factura": 327000,
    "utilidad": 76353,
    "margen_porcentaje": 23,
    "dias_transcurridos": 13,
    "chasis": "L5500506",
    "valor_entrega_usado": 192000,
    "valor_total_pedido": 457000,
    "observaciones": "Mantenimiento de 600HS cubre CDM, Garantia extendida por 1 año y medio, No se cobra KM durante la garantía. Entrega LEXION 740 + Plataf. 35 pies",
    "documentaciones": null
  },
  {
    "source_row": 25,
    "source_id": "PEDIDOS_DE_VENTA:25",
    "np_numero": "NP1404",
    "np_fecha": "2026-04-08",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "JAIR ANTONIO BEUREN BAUMBACH",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 1080 35 PIES",
    "estado": "Completado",
    "factura_numero": "183772",
    "factura_fecha": "2026-04-21",
    "tipo_cambio": null,
    "costo_producto": 85238,
    "valor_factura": 130000,
    "utilidad": 44762,
    "margen_porcentaje": 34,
    "dias_transcurridos": 13,
    "chasis": "59103338",
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 26,
    "source_id": "PEDIDOS_DE_VENTA:26",
    "np_numero": "NP0833",
    "np_fecha": "2026-04-13",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "CARLOS POCHIÑEC",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "26.31L1",
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 40 GV F E45",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": 5.2,
    "costo_producto": 485793,
    "valor_factura": 620000,
    "utilidad": 134207,
    "margen_porcentaje": 22,
    "dias_transcurridos": 135,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": 600000,
    "observaciones": "SEÑA 5.000 USD",
    "documentaciones": "Contado contra entrega"
  },
  {
    "source_row": 27,
    "source_id": "PEDIDOS_DE_VENTA:27",
    "np_numero": "NP0631",
    "np_fecha": "2026-04-13",
    "comercial": "LUIS ANDRES CAÑETE RODRIGUEZ",
    "cliente": "NORMAN JAMES SAWATZKY HIEBERT",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO CF 16 (DEMO)",
    "estado": "Completado",
    "factura_numero": "183774",
    "factura_fecha": "2026-04-21",
    "tipo_cambio": null,
    "costo_producto": 153740,
    "valor_factura": 190000,
    "utilidad": 36260,
    "margen_porcentaje": 19,
    "dias_transcurridos": 8,
    "chasis": "24791444",
    "valor_entrega_usado": null,
    "valor_total_pedido": 190000,
    "observaciones": "SEÑA DE 10.000 USD, PARA EL 29/05 180.000 USD.",
    "documentaciones": null
  },
  {
    "source_row": 28,
    "source_id": "PEDIDOS_DE_VENTA:28",
    "np_numero": "NP1503",
    "np_fecha": "2026-04-23",
    "comercial": "HELWIN LOPEZ BORGES",
    "cliente": "MIRIAN ALFONSO DE ALVES",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "26.22L2",
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E50",
    "estado": "Completado",
    "factura_numero": "001-001-0004866",
    "factura_fecha": "2026-07-31",
    "tipo_cambio": 5,
    "costo_producto": 232402,
    "valor_factura": 290101,
    "utilidad": 57698,
    "margen_porcentaje": 20,
    "dias_transcurridos": 99,
    "chasis": "24491414",
    "valor_entrega_usado": 35000,
    "valor_total_pedido": 290000,
    "observaciones": null,
    "documentaciones": "Programado 100k fin de mayo y saldo contra entrega"
  },
  {
    "source_row": 29,
    "source_id": "PEDIDOS_DE_VENTA:29",
    "np_numero": "NP1454",
    "np_fecha": "2026-05-05",
    "comercial": "ARNADLO ALMADA",
    "cliente": "ATAGI EAS",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "JOHN DEERE",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "JD 175 2014",
    "estado": "Completado",
    "factura_numero": "184077",
    "factura_fecha": "2026-05-12",
    "tipo_cambio": null,
    "costo_producto": 30000,
    "valor_factura": 38000,
    "utilidad": 8000,
    "margen_porcentaje": 21,
    "dias_transcurridos": 7,
    "chasis": "1CQ1111ALC0090694",
    "valor_entrega_usado": null,
    "valor_total_pedido": 38000,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 30,
    "source_id": "PEDIDOS_DE_VENTA:30",
    "np_numero": "NP1011",
    "np_fecha": "2026-05-06",
    "comercial": "RUBEN CENTURIÓN",
    "cliente": "ANIBAL SCHNEIDER S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E45",
    "estado": "Completado",
    "factura_numero": "001-001-0004826",
    "factura_fecha": "2026-07-24",
    "tipo_cambio": 5.2,
    "costo_producto": 208632,
    "valor_factura": 245000,
    "utilidad": 36369,
    "margen_porcentaje": 15,
    "dias_transcurridos": 79,
    "chasis": "24491387",
    "valor_entrega_usado": null,
    "valor_total_pedido": 245000,
    "observaciones": null,
    "documentaciones": "Contado contra entrega"
  },
  {
    "source_row": 31,
    "source_id": "PEDIDOS_DE_VENTA:31",
    "np_numero": "NP1012",
    "np_fecha": "2026-05-05",
    "comercial": "RUBEN CENTURIÓN",
    "cliente": "ARNO BUSS",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "HORSCH",
    "llave": "93L2",
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 16 CF E45",
    "estado": "Completado",
    "factura_numero": "001-001-0004867",
    "factura_fecha": "2026-07-31",
    "tipo_cambio": 5.2,
    "costo_producto": 189177,
    "valor_factura": 240000,
    "utilidad": 50823,
    "margen_porcentaje": 21,
    "dias_transcurridos": 87,
    "chasis": "24491383",
    "valor_entrega_usado": null,
    "valor_total_pedido": 240000,
    "observaciones": "CAJA SEMILLA FINA, DISCO INCORPORADOR, GARANTIA 2 AÑOS CDM, KM SE COBRA DESDE BELLA VISTA, KIT PLATO SOJA DOBLE. FORMA DE PAGO: SEÑA 10MIL USD, JULIO 110MIL USD, ABRIL 2027 120MIL USD",
    "documentaciones": "En Proceso"
  },
  {
    "source_row": 32,
    "source_id": "PEDIDOS_DE_VENTA:32",
    "np_numero": "NP1409",
    "np_fecha": "2026-05-12",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "DOUGLAS GIESE",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "TRION 720",
    "estado": "Completado",
    "factura_numero": "184228",
    "factura_fecha": "2026-05-25",
    "tipo_cambio": null,
    "costo_producto": 272423,
    "valor_factura": 380000,
    "utilidad": 107577,
    "margen_porcentaje": 28,
    "dias_transcurridos": 13,
    "chasis": "L5500511",
    "valor_entrega_usado": 180000,
    "valor_total_pedido": 380000,
    "observaciones": "INCLUIDO PRIMER MANTENIMIENTO 100HS CON CAJA DE HERRAMIENTA DE FABRICA, ENTREGA LEXION 760 TT 2014",
    "documentaciones": "Via Banco"
  },
  {
    "source_row": 33,
    "source_id": "PEDIDOS_DE_VENTA:33",
    "np_numero": "NP1408",
    "np_fecha": "2026-05-21",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "LEODEGAR SEGOVIA OLIVEIRA",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 760 TT",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": 180000,
    "valor_factura": 200000,
    "utilidad": 20000,
    "margen_porcentaje": 10,
    "dias_transcurridos": 97,
    "chasis": null,
    "valor_entrega_usado": 100000,
    "valor_total_pedido": 235000,
    "observaciones": "CLIENTE VA A ENTREGAR NH 5090, MAS 35MIL USD, SALDO FINANCIADO POR CDM 100MIL USD",
    "documentaciones": null
  },
  {
    "source_row": 34,
    "source_id": "PEDIDOS_DE_VENTA:34",
    "np_numero": "NP1408",
    "np_fecha": "2026-05-21",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "LEODEGAR SEGOVIA OLIVEIRA",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "ALLOCHIS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "Maxflex 35 pies caracol",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 35000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 97,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 35,
    "source_id": "PEDIDOS_DE_VENTA:35",
    "np_numero": "NP1354",
    "np_fecha": "2026-06-01",
    "comercial": "OSCAR DANIEL BENITEZ MEZA",
    "cliente": "ORLANDO REMPEL",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "Maestro DUO 24 lineas",
    "estado": "Completado",
    "factura_numero": "001-001-0004784",
    "factura_fecha": "2026-07-13",
    "tipo_cambio": null,
    "costo_producto": 315000,
    "valor_factura": 360000,
    "utilidad": 45000,
    "margen_porcentaje": 12,
    "dias_transcurridos": 42,
    "chasis": "24811352",
    "valor_entrega_usado": null,
    "valor_total_pedido": 330000,
    "observaciones": "Sembradora usada 24 lineas, se reserva la maquina durante proceso de aprobación banco Sudameris, se emite carta oferta, incluye kit de discos de semilla para girasol. Incluye kit de semilla fina a solicitar a fabrica una vez aprobado el credito",
    "documentaciones": null
  },
  {
    "source_row": 36,
    "source_id": "PEDIDOS_DE_VENTA:36",
    "np_numero": "NP1504",
    "np_fecha": "2026-06-02",
    "comercial": "HELWIN LOPEZ BORGES",
    "cliente": "SANDRO STIPP LUJAN",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "STARA",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "Princesa Top 2016",
    "estado": "Completado",
    "factura_numero": "184396",
    "factura_fecha": "2026-06-04",
    "tipo_cambio": null,
    "costo_producto": 60000,
    "valor_factura": 65000,
    "utilidad": 5000,
    "margen_porcentaje": 8,
    "dias_transcurridos": 2,
    "chasis": null,
    "valor_entrega_usado": 37500,
    "valor_total_pedido": 65000,
    "observaciones": "En el negocio se toma una plantadora tatu PST Trio 2013 15x45 con titanium, monitor y caja de semilla final, caja aerea",
    "documentaciones": null
  },
  {
    "source_row": 37,
    "source_id": "PEDIDOS_DE_VENTA:37",
    "np_numero": "NP0632",
    "np_fecha": "2026-05-28",
    "comercial": "LUIS ANDRES CAÑETE RODRIGUEZ",
    "cliente": "CULTIVOS VERDE S.A.",
    "condicion": "USADA",
    "abastecimiento": "STOCK",
    "marca": "BALDAN",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "SP TOPOGRAFIC 5500 SB",
    "estado": "Completado",
    "factura_numero": "184281",
    "factura_fecha": "2026-05-28",
    "tipo_cambio": null,
    "costo_producto": 30000,
    "valor_factura": 27500,
    "utilidad": -2500,
    "margen_porcentaje": -9,
    "dias_transcurridos": 0,
    "chasis": "617578001001",
    "valor_entrega_usado": null,
    "valor_total_pedido": 27500,
    "observaciones": "NO INCLUYE EL INOCULANTE LIQUIDO, CONTADO",
    "documentaciones": null
  },
  {
    "source_row": 38,
    "source_id": "PEDIDOS_DE_VENTA:38",
    "np_numero": "NP1455",
    "np_fecha": "2026-06-15",
    "comercial": "ARNALDO ALMADA",
    "cliente": "AGROGANADERA HEBRON S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Suelo",
    "modelo": "EVO 7 TL R",
    "estado": "Completado",
    "factura_numero": "184747",
    "factura_fecha": "2026-06-30",
    "tipo_cambio": null,
    "costo_producto": 64311,
    "valor_factura": 85000,
    "utilidad": 20689,
    "margen_porcentaje": 24,
    "dias_transcurridos": 15,
    "chasis": "24171304",
    "valor_entrega_usado": null,
    "valor_total_pedido": 85000,
    "observaciones": "CONTADO FECHA DE PAGO 20/07/26",
    "documentaciones": null
  },
  {
    "source_row": 39,
    "source_id": "PEDIDOS_DE_VENTA:39",
    "np_numero": "NP0835",
    "np_fecha": "2026-06-24",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "FABIO STRIEDER",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Picadora",
    "modelo": "JAGUAR 950",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": 437840,
    "valor_factura": 666500,
    "utilidad": 228660,
    "margen_porcentaje": 34,
    "dias_transcurridos": 63,
    "chasis": null,
    "valor_entrega_usado": 236500,
    "valor_total_pedido": 666500,
    "observaciones": "PAGO INICIAL $10.000, UNA VEZ APROBACIÓN DE CRÉDITO BANCARIO $40.000. FINANCIACIÓN VB $380.000",
    "documentaciones": null
  },
  {
    "source_row": 40,
    "source_id": "PEDIDOS_DE_VENTA:40",
    "np_numero": "NP1413",
    "np_fecha": "2026-07-10",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "VALDINEI GARCIA",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E50",
    "estado": "Completado",
    "factura_numero": "001-001-0004829",
    "factura_fecha": "2026-07-27",
    "tipo_cambio": null,
    "costo_producto": 205868,
    "valor_factura": 250000,
    "utilidad": 44132,
    "margen_porcentaje": 18,
    "dias_transcurridos": 17,
    "chasis": "24491391",
    "valor_entrega_usado": null,
    "valor_total_pedido": 250000,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 41,
    "source_id": "PEDIDOS_DE_VENTA:41",
    "np_numero": "NP0838",
    "np_fecha": "2026-07-14",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "ESTABLECIMIENTO ROSARITO SRL",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E45",
    "estado": "Completado",
    "factura_numero": "001-001-0004837",
    "factura_fecha": "2026-07-27",
    "tipo_cambio": null,
    "costo_producto": 206506,
    "valor_factura": 251937,
    "utilidad": 45431,
    "margen_porcentaje": 18,
    "dias_transcurridos": 13,
    "chasis": "24491386",
    "valor_entrega_usado": 50000,
    "valor_total_pedido": 250000,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 42,
    "source_id": "PEDIDOS_DE_VENTA:42",
    "np_numero": "NP0633",
    "np_fecha": "2026-07-06",
    "comercial": "LUIS ANDRES CAÑETE RODRIGUEZ",
    "cliente": "GRASINUT S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Picadora",
    "modelo": "JAGUAR 950",
    "estado": "Completado",
    "factura_numero": "001-001-0004754",
    "factura_fecha": "2026-07-08",
    "tipo_cambio": null,
    "costo_producto": 437840,
    "valor_factura": 600000,
    "utilidad": 162160,
    "margen_porcentaje": 27,
    "dias_transcurridos": 2,
    "chasis": "50204941",
    "valor_entrega_usado": null,
    "valor_total_pedido": 600000,
    "observaciones": "CONTADO",
    "documentaciones": null
  },
  {
    "source_row": 43,
    "source_id": "PEDIDOS_DE_VENTA:43",
    "np_numero": "NP1414",
    "np_fecha": "2026-08-04",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "IZRAEL WENZEL",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "TRION 740",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 445000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 22,
    "chasis": null,
    "valor_entrega_usado": 275000,
    "valor_total_pedido": 575000,
    "observaciones": "ENTREGA LEXION 750 CON PLATAFORMA MACDOM, CONTADO 300MIL USD",
    "documentaciones": null
  },
  {
    "source_row": 44,
    "source_id": "PEDIDOS_DE_VENTA:44",
    "np_numero": "NP1414",
    "np_fecha": "2026-08-04",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "IZRAEL WENZEL",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 1080 35 PIES",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 130000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 22,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 45,
    "source_id": "PEDIDOS_DE_VENTA:45",
    "np_numero": "NP0839",
    "np_fecha": "2026-07-16",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "VANDERLEI SCHORR",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "LEXION 7600",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": 411909,
    "valor_factura": 500000,
    "utilidad": 88091,
    "margen_porcentaje": 18,
    "dias_transcurridos": 41,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": 626000,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 46,
    "source_id": "PEDIDOS_DE_VENTA:46",
    "np_numero": "NP0839",
    "np_fecha": "2026-07-16",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "VANDERLEI SCHORR",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO 1230",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": 109571,
    "valor_factura": 126000,
    "utilidad": 16429,
    "margen_porcentaje": 13,
    "dias_transcurridos": 41,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 47,
    "source_id": "PEDIDOS_DE_VENTA:47",
    "np_numero": "NP0840",
    "np_fecha": "2026-07-16",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "VANDERLEI SCHORR",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "NB",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CABEZAL MAICERO 20L X 45CM",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": 51392,
    "valor_factura": 59000,
    "utilidad": 7608,
    "margen_porcentaje": 13,
    "dias_transcurridos": 41,
    "chasis": "AFCG-009694",
    "valor_entrega_usado": null,
    "valor_total_pedido": 59000,
    "observaciones": null,
    "documentaciones": null
  },
  {
    "source_row": 48,
    "source_id": "PEDIDOS_DE_VENTA:48",
    "np_numero": "NP0842",
    "np_fecha": "2026-08-07",
    "comercial": "CARLOS JAVIER BENITEZ ZARZA",
    "cliente": "RANDECKER WEGST HEINRICH",
    "condicion": "NUEVA",
    "abastecimiento": "STOCK",
    "marca": "HORSCH",
    "llave": null,
    "producto": "Plantadora / Sembradora",
    "modelo": "MAESTRO 18 CF E50",
    "estado": "Completado",
    "factura_numero": "001-001-0004957",
    "factura_fecha": "2026-08-20",
    "tipo_cambio": null,
    "costo_producto": 235000,
    "valor_factura": 300000,
    "utilidad": 65000,
    "margen_porcentaje": 22,
    "dias_transcurridos": 13,
    "chasis": "24491421",
    "valor_entrega_usado": 20000,
    "valor_total_pedido": 300000,
    "observaciones": "SE TOMA USADO JUMIL 13 LINEAS. OBS: ESTIRA CON TRACTOR JD 200, 2 AÑOS DE GARANTIA, ACTIVACIÓN PRO - SIN COSTO, FULL EQUIPO (MINIFLOW Y KSM). ENTREGA INICIAL 80MIL USD, 100MIL USD 30/03/27, 100MIL USD 30/08/27",
    "documentaciones": null
  },
  {
    "source_row": 49,
    "source_id": "PEDIDOS_DE_VENTA:49",
    "np_numero": "NP0865",
    "np_fecha": "2026-08-22",
    "comercial": "ABEL LOPEZ GONZALEZ",
    "cliente": "MAQSUR S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "DIRECT DISC 600",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 100000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 4,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": 100000,
    "observaciones": "SEÑA DE TRATO - TRANSF BANCO / CONTRA ENTREGA DE PLATAFORMA",
    "documentaciones": null
  },
  {
    "source_row": 50,
    "source_id": "PEDIDOS_DE_VENTA:50",
    "np_numero": "NP1418",
    "np_fecha": "2026-08-21",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "CAMPOS DEL LAGO S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "M - Cosechadora",
    "modelo": "TRION 710",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 420000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 5,
    "chasis": null,
    "valor_entrega_usado": 220000,
    "valor_total_pedido": 550000,
    "observaciones": "SE AGARRA COSECHADORA JD 5670 CON PLAT/35 FT // CDM AL CLIENTE - MANTENIMIENTO 100HS, INSUMOS, KM, MO. MANTENIMIENTO 600HS, INSUMOS, KM, MO. ACOPLE MULTIPLE PARA PLATAFORMA CON MO",
    "documentaciones": null
  },
  {
    "source_row": 51,
    "source_id": "PEDIDOS_DE_VENTA:51",
    "np_numero": "NP1418",
    "np_fecha": "2026-08-21",
    "comercial": "JUAN DANIEL APODACA FERREIRA",
    "cliente": "CAMPOS DEL LAGO S.A.",
    "condicion": "NUEVA",
    "abastecimiento": "IMPORTACIÓN",
    "marca": "CLAAS",
    "llave": null,
    "producto": "Plataforma",
    "modelo": "CONVIO FLEX 1080 35 PIES",
    "estado": "Pendiente",
    "factura_numero": null,
    "factura_fecha": null,
    "tipo_cambio": null,
    "costo_producto": null,
    "valor_factura": 130000,
    "utilidad": null,
    "margen_porcentaje": 0,
    "dias_transcurridos": 5,
    "chasis": null,
    "valor_entrega_usado": null,
    "valor_total_pedido": null,
    "observaciones": null,
    "documentaciones": null
  }
]
$legacy$::jsonb
);

NOTIFY pgrst, 'reload schema';
