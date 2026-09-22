BEGIN;

-- La importación vinculada es la fuente del chasis. Si el chasis se carga o
-- corrige después de vincularla, la unidad del pedido debe reflejarlo sin una
-- segunda carga manual.
CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_chasis_importacion_vinculada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.unidad_id IS NOT NULL
     AND public.normalizar_chasis_notificacion(NEW.chasis) IS NOT NULL
     AND (
       NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
       OR NEW.chasis IS DISTINCT FROM OLD.chasis
     ) THEN
    UPDATE public.maquinaria_unidades_operacion
    SET chasis = btrim(NEW.chasis),
        actualizado_en = now()
    WHERE id = NEW.unidad_id
      AND chasis IS DISTINCT FROM btrim(NEW.chasis);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_sincronizar_chasis_importacion_vinculada_trigger
  ON public.maquinaria_importacion_unidades;
CREATE TRIGGER maquinaria_sincronizar_chasis_importacion_vinculada_trigger
AFTER UPDATE OF chasis, unidad_id
ON public.maquinaria_importacion_unidades
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_sincronizar_chasis_importacion_vinculada();

-- Repara vínculos ya existentes donde Operaciones quedó sin chasis aunque la
-- unidad importada sí lo tenía.
UPDATE public.maquinaria_unidades_operacion AS unidad
SET chasis = btrim(importacion.chasis),
    actualizado_en = now()
FROM public.maquinaria_importacion_unidades AS importacion
WHERE importacion.activa
  AND importacion.unidad_id = unidad.id
  AND public.normalizar_chasis_notificacion(importacion.chasis) IS NOT NULL
  AND public.normalizar_chasis_notificacion(unidad.chasis) IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
