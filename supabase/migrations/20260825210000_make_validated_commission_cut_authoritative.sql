-- El corte exportado y aprobado es la fotografia final de sus 80 OS.
-- Los 13 ajustes especificos recuperados por la migracion anterior son
-- anteriores a esta restauracion y no deben desplazar el tipo validado por OS.
--
-- Esta limpieza ocurre una sola vez. Los cambios manuales que se realicen
-- despues desde la app volveran a insertarse en la tabla de ajustes y seguiran
-- teniendo prioridad en futuras reimportaciones.

DELETE FROM public.comisiones_tipo_tiempo_ajustes a
USING public.comisiones_tipo_tiempo_validaciones_os v
WHERE upper(btrim(a.os_numero)) = upper(btrim(v.os_numero));

-- Fuerza la reevaluacion de las jornadas del corte. El trigger persistente
-- aplica ahora la validacion de la OS porque ya no existe un override anterior.
UPDATE public.comisiones_jornadas j
SET tipo_tiempo = j.tipo_tiempo,
    actualizado_en = now()
FROM public.comisiones_tipo_tiempo_validaciones_os v
WHERE upper(btrim(j.os_numero)) = upper(btrim(v.os_numero));

NOTIFY pgrst, 'reload schema';

-- Control esperado:
-- * ajustes_que_aun_compiten_con_el_corte = 0
-- * jornadas_del_corte_con_tipo_distinto = 0
-- * la OS 01-00000097 queda completamente en Garantia
SELECT
  (
    SELECT count(*)
    FROM public.comisiones_tipo_tiempo_ajustes a
    JOIN public.comisiones_tipo_tiempo_validaciones_os v
      ON upper(btrim(a.os_numero)) = upper(btrim(v.os_numero))
  ) AS ajustes_que_aun_compiten_con_el_corte,
  (
    SELECT count(*)
    FROM public.comisiones_jornadas j
    JOIN public.comisiones_tipo_tiempo_validaciones_os v
      ON upper(btrim(j.os_numero)) = upper(btrim(v.os_numero))
    WHERE j.vigente = true
      AND j.tipo_tiempo IS DISTINCT FROM v.tipo_tiempo
  ) AS jornadas_del_corte_con_tipo_distinto,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'tecnico', j.tecnico_nombre,
        'fecha', j.fecha_inicio,
        'tipo', j.tipo_tiempo,
        'horas', j.horas_calculadas
      )
      ORDER BY j.fecha_inicio, j.tecnico_nombre
    )
    FROM public.comisiones_jornadas j
    WHERE j.vigente = true
      AND upper(btrim(j.os_numero)) = '01-00000097'
  ) AS verificacion_os_01_00000097;
