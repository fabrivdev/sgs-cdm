-- Restaura chasis presentes en el Excel fuente "Planificador de Importaciones - CDM"
-- que quedaron nulos en el snapshot inicial. Nunca sobrescribe un chasis ya cargado.

WITH fuente(source_row, chasis) AS (
  VALUES
    (3,  'I6102265'::text),
    (4,  'I8002386'::text),
    (7,  'C8511089'::text),
    (8,  'C8511090'::text),
    (11, 'C8511085'::text),
    (12, 'C8511093'::text),
    (14, 'C8511088'::text),
    (24, 'C8511093'::text),
    (42, 'I6303745'::text),
    (51, 'A6402525'::text),
    (52, 'I6303740'::text)
)
UPDATE public.maquinaria_importacion_lineas i
SET chasis = f.chasis,
    datos_fuente = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(i.datos_fuente, '{}'::jsonb),
          '{chasis}',
          to_jsonb(f.chasis),
          true
        ),
        '{NRO CHASIS}',
        to_jsonb(f.chasis),
        true
      ),
      '{raw,NRO CHASIS}',
      to_jsonb(f.chasis),
      true
    ),
    actualizado_en = now()
FROM fuente f
WHERE i.source_sheet = 'MAESTRO DE IMPORTACIONES'
  AND i.source_row = f.source_row
  AND public.normalizar_chasis_notificacion(i.chasis) IS NULL;

WITH fuente(source_row, chasis) AS (
  VALUES
    (3,  'I6102265'::text),
    (4,  'I8002386'::text),
    (7,  'C8511089'::text),
    (8,  'C8511090'::text),
    (11, 'C8511085'::text),
    (12, 'C8511093'::text),
    (14, 'C8511088'::text),
    (24, 'C8511093'::text),
    (42, 'I6303745'::text),
    (51, 'A6402525'::text),
    (52, 'I6303740'::text)
)
UPDATE public.maquinaria_importacion_unidades u
SET chasis = f.chasis,
    actualizado_en = now()
FROM public.maquinaria_importacion_lineas i
JOIN fuente f ON f.source_row = i.source_row
WHERE u.importacion_linea_id = i.id
  AND u.numero_unidad = 1
  AND u.activa
  AND i.source_sheet = 'MAESTRO DE IMPORTACIONES'
  AND public.normalizar_chasis_notificacion(u.chasis) IS NULL;

-- Propaga el chasis a la unidad del pedido únicamente cuando esa importación
-- ya estaba vinculada, la unidad todavía no tiene identificación y el chasis
-- no aparece repetido en más de una importación vinculada.
WITH candidatos AS (
  SELECT
    iu.unidad_id,
    iu.chasis,
    count(*) OVER (
      PARTITION BY public.normalizar_chasis_notificacion(iu.chasis)
    ) AS coincidencias
  FROM public.maquinaria_importacion_unidades iu
  WHERE iu.unidad_id IS NOT NULL
    AND iu.activa
    AND public.normalizar_chasis_notificacion(iu.chasis) IS NOT NULL
)
UPDATE public.maquinaria_unidades_operacion uo
SET chasis = c.chasis,
    actualizado_en = now()
FROM candidatos c
WHERE c.unidad_id = uo.id
  AND c.coincidencias = 1
  AND public.normalizar_chasis_notificacion(uo.chasis) IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.maquinaria_unidades_operacion otra
    WHERE otra.id <> uo.id
      AND public.normalizar_chasis_notificacion(otra.chasis)
        = public.normalizar_chasis_notificacion(c.chasis)
  );

NOTIFY pgrst, 'reload schema';
