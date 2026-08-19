-- Fusion GENERICA de clientes duplicados detectados por NOMBRE
-- normalizado, no por RUC (el barrido por RUC de 20260818150000 solo
-- agarro 9 casos porque el resto tiene el RUC vacio o con formato
-- distinto en el registro del 6-agosto -- ver diagnostico aparte).
--
-- A diferencia de 20260818150000/160000 (lista chica, verificada a mano,
-- una por una), esta migracion DESCUBRE los grupos dinamicamente con una
-- consulta, no con un array hardcodeado -- son ~108 casos.
--
-- CRITERIO (identico en espiritu a las migraciones anteriores):
--   Un grupo (mismo nombre normalizado) entra en alcance si tiene AL
--   MENOS un registro NO creado el 2026-08-06 con historial
--   (facturacion vieja > 0 O maquinas > 0), Y AL MENOS un registro SI
--   creado el 2026-08-06 con facturas nuevas (facturacion_lineas_
--   importadas > 0).
--   DESTINO = entre los NO creados el 6-agosto, el de mayor historial
--   (facturacion_vieja + maquinas).
--   ORIGEN = todos los demas registros del grupo (los del 6-agosto y
--   cualquier otro viejo con menos historial).
--
-- DIFERENCIA DE COMPORTAMIENTO respecto a las migraciones anteriores:
-- si el historial esta EMPATADO entre dos o mas candidatos no-agosto (no
-- hay un unico maximo), el grupo se marca AMBIGUO y se SALTEA sin
-- tocarlo -- no aborta toda la migracion, solo ese grupo puntual. Motivo:
-- con ~108 grupos detectados automaticamente es normal que aparezca
-- algun caso limite; se prefiere procesar los claros y dejar los dudosos
-- listados para revision manual, en vez de bloquear todo por uno solo.
--
-- Reasigna facturacion, facturacion_lineas_importadas, parque_maquinas,
-- contactos_cliente, servicios, seguimiento_comercial y trabajos del
-- origen al destino. Desactiva cada origen (activo = false). No borra
-- nada.
--
-- parque_ultima_actividad NO se reasigna a mano -- se reconstruye entera
-- con refrescar_parque_ultima_actividad() despues, mismo motivo que las
-- migraciones anteriores (evitar violar su PK cliente_id+marca).
--
-- PASO MANUAL DESPUES DE APLICAR: refrescar_parque_ultima_actividad()
-- exige admin autenticado, no se puede llamar desde el SQL Editor.
--
-- ANTES DE APLICAR: correr la consulta de preview (documentada aparte,
-- no incluida en este archivo) para ver la lista completa de grupos,
-- destino/origen elegidos, y los marcados AMBIGUO -- esta migracion NO
-- imprime esa lista antes de actuar, hace preview + accion en un solo
-- paso por grupo via RAISE NOTICE.

DO $$
DECLARE
  v_grupo RECORD;
  v_origen RECORD;
  v_n_facturacion integer;
  v_n_facturacion_lineas integer;
  v_n_maquinas integer;
  v_n_contactos integer;
  v_n_servicios integer;
  v_n_seguimiento integer;
  v_n_trabajos integer;
  v_total_grupos integer := 0;
  v_total_ambiguos integer := 0;
  v_total_fusiones integer := 0;
BEGIN
  FOR v_grupo IN
    WITH candidatos AS (
      SELECT
        c.id, c.nombre, c.creado_en,
        (c.creado_en::date = date '2026-08-06') AS es_agosto,
        (SELECT count(*) FROM public.facturacion f
          WHERE f.cliente_id = c.id) AS n_fact_vieja,
        (SELECT count(*) FROM public.facturacion_lineas_importadas fl
          WHERE fl.cliente_id = c.id) AS n_fact_nueva,
        (SELECT count(*) FROM public.parque_maquinas m
          WHERE m.cliente_id = c.id) AS n_maquinas,
        lower(trim(c.nombre)) AS clave
      FROM public.clientes c
    ),
    scored AS (
      SELECT *, (n_fact_vieja + n_maquinas) AS historial
      FROM candidatos
    ),
    grupos AS (
      SELECT clave,
        count(*) FILTER (
          WHERE NOT es_agosto AND historial > 0
        ) AS con_historial,
        count(*) FILTER (
          WHERE es_agosto AND n_fact_nueva > 0
        ) AS con_nuevas
      FROM scored
      GROUP BY clave
    ),
    objetivo AS (
      SELECT clave FROM grupos
      WHERE con_historial > 0 AND con_nuevas > 0
    ),
    max_hist AS (
      SELECT clave,
        max(historial) FILTER (WHERE NOT es_agosto) AS top
      FROM scored
      WHERE clave IN (SELECT clave FROM objetivo)
      GROUP BY clave
    ),
    empates AS (
      SELECT s.clave, count(*) AS n_empatados
      FROM scored s
      JOIN max_hist m ON m.clave = s.clave
      WHERE NOT s.es_agosto AND s.historial = m.top
      GROUP BY s.clave
    )
    SELECT
      o.clave AS clave,
      e.n_empatados AS n_empatados,
      (
        SELECT s2.id FROM scored s2
        WHERE s2.clave = o.clave AND NOT s2.es_agosto
          AND s2.historial = m.top
        ORDER BY s2.creado_en ASC, s2.id::text ASC
        LIMIT 1
      ) AS destino_id
    FROM objetivo o
    JOIN max_hist m ON m.clave = o.clave
    JOIN empates e ON e.clave = o.clave
  LOOP
    v_total_grupos := v_total_grupos + 1;

    IF v_grupo.n_empatados > 1 THEN
      v_total_ambiguos := v_total_ambiguos + 1;
      RAISE NOTICE
        'AMBIGUO - no tocado: "%" tiene % candidatos'
        ' empatados en historial. Revisar a mano.',
        v_grupo.clave, v_grupo.n_empatados;
      CONTINUE;
    END IF;

    FOR v_origen IN
      SELECT id, nombre FROM public.clientes
      WHERE lower(trim(nombre)) = v_grupo.clave
        AND id <> v_grupo.destino_id
    LOOP
      v_total_fusiones := v_total_fusiones + 1;

      SELECT count(*) INTO v_n_facturacion
        FROM public.facturacion WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_facturacion_lineas
        FROM public.facturacion_lineas_importadas
        WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_maquinas
        FROM public.parque_maquinas WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_contactos
        FROM public.contactos_cliente WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_servicios
        FROM public.servicios WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_seguimiento
        FROM public.seguimiento_comercial
        WHERE cliente_id = v_origen.id;
      SELECT count(*) INTO v_n_trabajos
        FROM public.trabajos WHERE cliente_id = v_origen.id;

      RAISE NOTICE
        'Fusionando "%" (%) -> destino (%).'
        ' facturacion=% facturacion_lineas=% maquinas=%'
        ' contactos=% servicios=% seguimiento=% trabajos=%',
        v_origen.nombre, v_origen.id, v_grupo.destino_id,
        v_n_facturacion, v_n_facturacion_lineas, v_n_maquinas,
        v_n_contactos, v_n_servicios, v_n_seguimiento,
        v_n_trabajos;

      UPDATE public.facturacion
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.facturacion_lineas_importadas
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.parque_maquinas
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.contactos_cliente
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.servicios
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.seguimiento_comercial
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;
      UPDATE public.trabajos
        SET cliente_id = v_grupo.destino_id
        WHERE cliente_id = v_origen.id;

      UPDATE public.clientes SET activo = false
        WHERE id = v_origen.id;
    END LOOP;
  END LOOP;

  RAISE NOTICE
    '--- Completado. Grupos detectados: %,'
    ' ambiguos (no tocados): %, fusiones aplicadas: %. ---',
    v_total_grupos, v_total_ambiguos, v_total_fusiones;

  RAISE NOTICE
    'Falta el paso manual: refrescar_parque_ultima_actividad()'
    ' desde sesion autenticada como admin.';
END;
$$;
