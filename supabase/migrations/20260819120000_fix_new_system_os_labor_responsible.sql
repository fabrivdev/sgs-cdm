-- Corrige responsable/tecnicos_participantes de las OS del sistema nuevo
-- (import TOTVS, os_numero con prefijo de sucursal "##-numero") para que
-- salgan solo de tecnicos con horas de mano de obra reales (lineas MA01),
-- nunca de lineas de piezas.
--
-- Bug original: aggregateNewSystemServiceOrders (persist.ts) promovia a
-- "responsable" y a "tecnicos_participantes" a CUALQUIERA que apareciera
-- como TECNICO en cualquier linea de la OS, piezas incluidas -- si la
-- linea de piezas aparecia antes que la de mano de obra en el XML, el
-- pedidor de repuestos (0 horas) quedaba como responsable en vez del
-- tecnico real (ej. OS 01-00000060: quedo "JUAN PATINO" en vez de
-- "JONATHAN GARCETE", que tenia 7 horas reales de MA01).
--
-- Por que se puede corregir sin reimportar el XML: el bug nunca estuvo en
-- el calculo de horas -- raw_data.totales_por_tecnico ya tenia (desde que
-- se importo) las horas de cada persona correctamente filtradas por tipo
-- de linea, porque servicios_cantidad es 0 para lineas que no son
-- "Servicio" desde el parseo original. Esta migracion solo relee ese dato
-- ya guardado y recalcula responsable/participantes con la misma regla
-- que el fix de codigo en aggregateNewSystemServiceOrders: tecnico
-- responsable/participante = cualquiera en totales_por_tecnico con
-- horas > 0; responsable plano = el de mas horas (empate: alfabetico).
--
-- Alcance a proposito: SOLO OS con os_numero "##-numero" (sistema nuevo,
-- importador TOTVS). Las ~1345 OS viejas sin prefijo de sucursal vienen
-- de un importador Excel completamente distinto (ImportarTab.tsx) con su
-- propia logica de agregacion -- quedan afuera, es deuda de baja
-- prioridad segun decision del usuario, no del alcance de este fix.
--
-- No cambia tecnicos_auxiliares ni totales_por_tecnico -- ya estaban
-- bien, y tecnicos_auxiliares ni siquiera lo lee el ranking de
-- productividad del asistente de datos (solo lee responsable y
-- tecnicos_participantes).

DO $$
DECLARE
  v_row RECORD;
  v_responsable text;
  v_labor_technicians jsonb;
  v_total_os integer := 0;
  v_total_cambiadas integer := 0;
BEGIN
  FOR v_row IN
    SELECT os_numero, responsable, raw_data
    FROM public.ordenes_servicio_importadas
    WHERE os_numero ~ '^[0-9]{2}-'
      AND raw_data ? 'totales_por_tecnico'
      AND jsonb_typeof(raw_data -> 'totales_por_tecnico') = 'object'
  LOOP
    v_total_os := v_total_os + 1;

    SELECT jsonb_agg(t.tecnico ORDER BY (t.totales ->> 'horas')::numeric DESC, t.tecnico ASC)
    INTO v_labor_technicians
    FROM jsonb_each(v_row.raw_data -> 'totales_por_tecnico') AS t(tecnico, totales)
    WHERE coalesce((t.totales ->> 'horas')::numeric, 0) > 0;

    v_labor_technicians := coalesce(v_labor_technicians, '[]'::jsonb);
    v_responsable := v_labor_technicians ->> 0;

    IF v_row.responsable IS DISTINCT FROM v_responsable
      OR (v_row.raw_data -> 'tecnicos_responsables') IS DISTINCT FROM v_labor_technicians
    THEN
      v_total_cambiadas := v_total_cambiadas + 1;
    END IF;

    UPDATE public.ordenes_servicio_importadas
    SET
      responsable = v_responsable,
      raw_data = raw_data || jsonb_build_object(
        'tecnicos_responsables', v_labor_technicians,
        'tecnicos_participantes', v_labor_technicians,
        'requiere_asignacion_tecnico', (jsonb_array_length(v_labor_technicians) = 0)
      )
    WHERE os_numero = v_row.os_numero;
  END LOOP;

  RAISE NOTICE
    '--- Backfill completado. OS del sistema nuevo revisadas: %,'
    ' con responsable/participantes corregidos: %. ---',
    v_total_os, v_total_cambiadas;
END;
$$;
