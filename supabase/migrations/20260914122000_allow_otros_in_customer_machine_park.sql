BEGIN;

-- OTROS es un valor histórico válido de public.marca. Las marcas personalizadas
-- continúan registrándose en el catálogo; OTROS se conserva sin crear un registro
-- administrable con ese nombre reservado.
CREATE OR REPLACE FUNCTION public.validar_marca_admitida_parque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_solicitada text := public.maquinaria_normalizar_marca(
    coalesce(NEW.marca_nombre, NEW.marca::text)
  );
BEGIN
  IF v_solicitada = 'OTROS' THEN
    NEW.marca_nombre := 'OTROS';
    NEW.marca := 'OTROS'::public.marca;
    RETURN NEW;
  END IF;

  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(v_solicitada);
  IF NEW.marca_nombre IS NULL THEN
    RAISE EXCEPTION 'Selecciona o escribe la marca correcta' USING ERRCODE = '23514';
  END IF;

  NEW.marca := CASE NEW.marca_nombre
    WHEN 'CLAAS' THEN 'CLAAS'::public.marca
    WHEN 'HORSCH' THEN 'HORSCH'::public.marca
    ELSE 'OTROS'::public.marca
  END;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
