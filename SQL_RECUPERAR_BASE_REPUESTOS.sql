-- RECUPERACION MANUAL: saturacion causada por procesos largos de repuestos.
-- No elimina facturacion, productos, stock ni historial confirmado.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- 1. Solicitar la cancelacion de RPC activas del motor que llevan mas de 20 s.
SELECT
  pid,
  pg_cancel_backend(pid) AS cancelada,
  now() - query_start AS duracion,
  left(query, 160) AS consulta
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state = 'active'
  AND query_start < now() - interval '20 seconds'
  AND query ~* 'repuestos_(sugerencia_viva|refrescar_historial_unificado|finalizar_maestro_legacy|importar_maestro_legacy)';

-- 2. Cerrar solo sesiones abandonadas del mismo motor que retienen transaccion.
SELECT
  pid,
  pg_terminate_backend(pid) AS terminada,
  now() - xact_start AS duracion_transaccion,
  left(query, 160) AS consulta
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state = 'idle in transaction'
  AND xact_start < now() - interval '20 seconds'
  AND query ~* 'repuestos_(sugerencia_viva|refrescar_historial_unificado|finalizar_maestro_legacy|importar_maestro_legacy)';

-- 3. Liberar intentos funcionales que quedaron abiertos al cortarse la conexion.
UPDATE public.repuestos_maestro_legacy_cargas
SET estado = 'FALLIDO'
WHERE estado = 'PROCESANDO';

UPDATE public.repuestos_historial_actualizaciones
SET
  estado = 'FALLIDA',
  completado_en = now(),
  detalle = coalesce(detalle, '{}'::jsonb)
    || jsonb_build_object('motivo', 'Recuperacion manual por conexion interrumpida')
WHERE estado = 'PROCESANDO';

-- 4. Confirmacion final. Ambos contadores deben quedar en cero.
SELECT
  (SELECT count(*) FROM public.repuestos_maestro_legacy_cargas WHERE estado = 'PROCESANDO') AS cargas_maestro_en_proceso,
  (SELECT count(*) FROM public.repuestos_historial_actualizaciones WHERE estado = 'PROCESANDO') AS historiales_en_proceso;
