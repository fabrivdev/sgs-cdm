-- Fusion puntual de clientes duplicados por RUC compartido, encontrados
-- durante el diagnostico del bug de Parque/ultima actividad.
--
-- Version 2 de este archivo: la version anterior elegia destino por el
-- flag `activo`, y aborto correctamente en la Pasada 1 al encontrar el
-- RUC 5185640-9 (Elivelton) con DOS registros activos -- confirmando que
-- `activo` no es un criterio confiable para estos 9 casos.
--
-- CRITERIO NUEVO, verificado contra el estado real de los 9 RUC:
--   DESTINO = entre los registros de ese RUC que NO fueron creados el
--     2026-08-06, el que tenga MAS historial (facturacion vieja +
--     maquinas). Desempate: el mas viejo por creado_en, y como ultimo
--     desempate el id (mismo orden de desempate que uso la fusion de
--     agosto original, 20260806180000).
--   ORIGEN = cualquier otro registro del mismo RUC -- incluye el/los del
--     6-agosto (que traen las facturas nuevas) Y cualquier otro registro
--     viejo "vacio" que haya perdido el desempate de historial (caso
--     Elivelton: "ELIVELTON - GUSTAVO", 22-abril, 0 facturas -- variante
--     mal cargada de la misma persona, confirmada por el usuario).
--
-- Ya NO se usa `activo` para elegir destino/origen -- demostro no ser
-- confiable. El flag se sigue usando solo como efecto (el origen queda
-- desactivado al final), no como criterio de eleccion.
--
-- Alcance: SOLO estos 9 RUC. No toca ningun otro cliente ni reintroduce
-- la logica de "mas vinculos gana" de la fusion de agosto (esa via sola
-- fallo porque las facturas NUEVAS del 6-agosto pesaban mas que el
-- historial viejo en el puntaje).
--
-- Verificacion en dos pasadas, misma proteccion que la version anterior:
-- si CUALQUIER RUC no tiene un destino valido (al menos un registro no
-- creado el 6-agosto) o no tiene nada que fusionar, aborta TODO sin tocar
-- nada -- ni siquiera los RUC que si estaban bien -- porque una excepcion
-- sin capturar dentro del bloque DO revierte toda la transaccion.
--
-- parque_ultima_actividad NO se reasigna a mano: se reconstruye entera
-- con refrescar_parque_ultima_actividad() despues de aplicar esto, ya con
-- el cliente_id corregido en facturacion/facturacion_lineas_importadas.
-- Reasignarla a mano arriesgaria violar su PK (cliente_id, marca) si
-- origen y destino ya tenian fila para la misma marca.
--
-- PASO MANUAL DESPUES DE APLICAR -- IMPORTANTE:
-- refrescar_parque_ultima_actividad() exige un admin autenticado
-- (auth.uid() IS NOT NULL) desde el arreglo de seguridad del 17/08. Esta
-- migracion NO la llama sola (fallaria en el SQL Editor, que no tiene
-- sesion). Despues de aplicar este archivo, refrescar la cache desde una
-- sesion real autenticada como admin.

DO $$
DECLARE
  v_ruc text;
  v_total_en_grupo integer;
  v_candidatos_no_agosto integer;
  v_destino_id uuid;
  v_destino_nombre text;
  v_destino_historial integer;
  v_rucs text[] := ARRAY[
    '1516280-0', '5185640-9', '7022851', '4506573-0', '3184988-1',
    '80087028-0', '4281027-2', '9483963-8', '5580459-4'
  ];
BEGIN
  -- ===================================================================
  -- Pasada 1: verificar y determinar el destino de cada RUC ANTES de
  -- tocar nada. Si alguno no cumple, aborta todo.
  -- ===================================================================
  FOREACH v_ruc IN ARRAY v_rucs LOOP
    SELECT count(*) INTO v_total_en_grupo
    FROM public.clientes
    WHERE nullif(trim(ruc), '') = v_ruc;

    IF v_total_en_grupo < 2 THEN
      RAISE EXCEPTION
        'RUC %: solo tiene % registro(s), nada que fusionar.'
        ' Abortando sin tocar nada -- revisar la lista de RUC.',
        v_ruc, v_total_en_grupo;
    END IF;

    SELECT count(*) INTO v_candidatos_no_agosto
    FROM public.clientes
    WHERE nullif(trim(ruc), '') = v_ruc
      AND creado_en::date <> date '2026-08-06';

    IF v_candidatos_no_agosto = 0 THEN
      RAISE EXCEPTION
        'RUC %: los % registros fueron TODOS creados el 6-agosto,'
        ' no hay destino anterior valido. Abortando -- revisar a mano.',
        v_ruc, v_total_en_grupo;
    END IF;

    SELECT c.id, c.nombre,
      (SELECT count(*) FROM public.facturacion f WHERE f.cliente_id = c.id)
      + (SELECT count(*) FROM public.parque_maquinas m WHERE m.cliente_id = c.id)
      INTO v_destino_id, v_destino_nombre, v_destino_historial
    FROM public.clientes c
    WHERE nullif(trim(c.ruc), '') = v_ruc
      AND c.creado_en::date <> date '2026-08-06'
    ORDER BY
      (
        (SELECT count(*) FROM public.facturacion f WHERE f.cliente_id = c.id)
        + (SELECT count(*) FROM public.parque_maquinas m WHERE m.cliente_id = c.id)
      ) DESC,
      c.creado_en ASC,
      c.id::text ASC
    LIMIT 1;

    RAISE NOTICE
      'RUC %: destino = "%" (%), historial(fact+maq) = %.'
      ' Total grupo: %, origenes a fusionar: %.',
      v_ruc, v_destino_nombre, v_destino_id, v_destino_historial,
      v_total_en_grupo, v_total_en_grupo - 1;
  END LOOP;

  RAISE NOTICE
    '--- Verificacion completa: los 9 RUC tienen destino valido.'
    ' Empezando la fusion real. ---';

  -- ===================================================================
  -- Pasada 2: fusion real. El destino se recalcula con el mismo criterio
  -- (nada cambio entre pasadas, asi que da identico) y todo registro
  -- distinto del destino en ese RUC es origen.
  -- ===================================================================
  DECLARE
    v_origen_id uuid;
    v_origen_nombre text;
    v_n_facturacion integer;
    v_n_facturacion_lineas integer;
    v_n_maquinas integer;
    v_n_contactos integer;
    v_n_servicios integer;
    v_n_seguimiento integer;
    v_n_trabajos integer;
  BEGIN
    FOREACH v_ruc IN ARRAY v_rucs LOOP

      SELECT c.id, c.nombre INTO v_destino_id, v_destino_nombre
      FROM public.clientes c
      WHERE nullif(trim(c.ruc), '') = v_ruc
        AND c.creado_en::date <> date '2026-08-06'
      ORDER BY
        (
          (SELECT count(*) FROM public.facturacion f WHERE f.cliente_id = c.id)
          + (SELECT count(*) FROM public.parque_maquinas m WHERE m.cliente_id = c.id)
        ) DESC,
        c.creado_en ASC,
        c.id::text ASC
      LIMIT 1;

      FOR v_origen_id, v_origen_nombre IN
        SELECT id, nombre FROM public.clientes
        WHERE nullif(trim(ruc), '') = v_ruc AND id <> v_destino_id
      LOOP
        SELECT count(*) INTO v_n_facturacion
          FROM public.facturacion WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_facturacion_lineas
          FROM public.facturacion_lineas_importadas WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_maquinas
          FROM public.parque_maquinas WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_contactos
          FROM public.contactos_cliente WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_servicios
          FROM public.servicios WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_seguimiento
          FROM public.seguimiento_comercial WHERE cliente_id = v_origen_id;
        SELECT count(*) INTO v_n_trabajos
          FROM public.trabajos WHERE cliente_id = v_origen_id;

        RAISE NOTICE
          'RUC %: fusionando "%" (%) -> "%" (%).'
          ' facturacion=% facturacion_lineas=% maquinas=%'
          ' contactos=% servicios=% seguimiento=% trabajos=%',
          v_ruc, v_origen_nombre, v_origen_id, v_destino_nombre, v_destino_id,
          v_n_facturacion, v_n_facturacion_lineas, v_n_maquinas,
          v_n_contactos, v_n_servicios, v_n_seguimiento, v_n_trabajos;

        UPDATE public.facturacion
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.facturacion_lineas_importadas
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.parque_maquinas
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.contactos_cliente
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.servicios
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.seguimiento_comercial
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;
        UPDATE public.trabajos
          SET cliente_id = v_destino_id WHERE cliente_id = v_origen_id;

        UPDATE public.clientes SET activo = false WHERE id = v_origen_id;
      END LOOP;

    END LOOP;
  END;

  RAISE NOTICE
    '--- Fusion de los 9 RUC completada.'
    ' Falta el paso manual: refrescar_parque_ultima_actividad()'
    ' desde una sesion autenticada como admin. ---';
END;
$$;
