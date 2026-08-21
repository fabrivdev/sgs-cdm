-- Datos descriptivos de la OS para el detalle de Comisiones. La carga futura
-- los conserva en el ledger y este backfill completa las jornadas existentes
-- desde la OS consolidada, sin volver a importar archivos.

ALTER TABLE public.comisiones_jornadas
  ADD COLUMN IF NOT EXISTS cliente_nombre text,
  ADD COLUMN IF NOT EXISTS nro_chasis text;

WITH os AS (
  SELECT DISTINCT ON (os_numero)
    os_numero,
    NULLIF(BTRIM(cliente_nombre), '') AS cliente_nombre,
    NULLIF(BTRIM(nro_chasis), '') AS nro_chasis
  FROM public.ordenes_servicio_importadas
  WHERE NULLIF(BTRIM(os_numero), '') IS NOT NULL
  ORDER BY os_numero, actualizado_en DESC NULLS LAST, importado_en DESC NULLS LAST
)
UPDATE public.comisiones_jornadas AS jornada
SET
  cliente_nombre = COALESCE(NULLIF(BTRIM(jornada.cliente_nombre), ''), os.cliente_nombre),
  nro_chasis = COALESCE(NULLIF(BTRIM(jornada.nro_chasis), ''), os.nro_chasis),
  actualizado_en = now()
FROM os
WHERE os.os_numero = jornada.os_numero
  AND (
    NULLIF(BTRIM(jornada.cliente_nombre), '') IS NULL
    OR NULLIF(BTRIM(jornada.nro_chasis), '') IS NULL
  );

COMMENT ON COLUMN public.comisiones_jornadas.cliente_nombre IS
  'Cliente o propietario de la OS mostrado en el detalle de Comisiones.';
COMMENT ON COLUMN public.comisiones_jornadas.nro_chasis IS
  'Chasis de la máquina asociado a la OS.';

NOTIFY pgrst, 'reload schema';
