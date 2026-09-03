-- En el maestro historico, la columna llamada PO contenia en realidad la
-- fecha de pedido. Al formalizar fecha_pedido no se migraron esos valores,
-- por eso la nueva tabla mostraba guiones aunque la fecha siguiera guardada.

CREATE OR REPLACE FUNCTION public.maquinaria_parsear_fecha_pedido_legacy(
  p_valor text
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_valor text := nullif(btrim(p_valor), '');
  v_partes text[];
BEGIN
  IF v_valor IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_valor ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN v_valor::date;
  END IF;

  v_partes := regexp_match(v_valor, '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  IF v_partes IS NOT NULL THEN
    RETURN make_date(
      v_partes[3]::integer,
      v_partes[2]::integer,
      v_partes[1]::integer
    );
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

UPDATE public.maquinaria_importacion_lineas i
SET fecha_pedido = public.maquinaria_parsear_fecha_pedido_legacy(
      coalesce(
        nullif(btrim(i.po), ''),
        nullif(btrim(i.datos_fuente ->> 'PO'), ''),
        nullif(btrim(i.datos_fuente ->> 'po'), '')
      )
    ),
    actualizado_en = now()
WHERE i.fecha_pedido IS NULL
  AND public.maquinaria_parsear_fecha_pedido_legacy(
        coalesce(
          nullif(btrim(i.po), ''),
          nullif(btrim(i.datos_fuente ->> 'PO'), ''),
          nullif(btrim(i.datos_fuente ->> 'po'), '')
        )
      ) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.maquinaria_completar_fecha_pedido_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recuperar boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_recuperar := NEW.fecha_pedido IS NULL;
  ELSE
    -- Si el usuario borra expresamente una fecha ya cargada, se respeta.
    -- Solo se completa cuando la fecha seguia vacia antes de esta escritura.
    v_recuperar := NEW.fecha_pedido IS NULL
      AND NEW.fecha_pedido IS NOT DISTINCT FROM OLD.fecha_pedido;
  END IF;

  IF v_recuperar THEN
    NEW.fecha_pedido := public.maquinaria_parsear_fecha_pedido_legacy(
      coalesce(
        nullif(btrim(NEW.po), ''),
        nullif(btrim(NEW.datos_fuente ->> 'PO'), ''),
        nullif(btrim(NEW.datos_fuente ->> 'po'), '')
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maquinaria_importacion_fecha_pedido_legacy
  ON public.maquinaria_importacion_lineas;

CREATE TRIGGER maquinaria_importacion_fecha_pedido_legacy
BEFORE INSERT OR UPDATE OF po, datos_fuente, fecha_pedido
ON public.maquinaria_importacion_lineas
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_completar_fecha_pedido_importacion();

COMMENT ON COLUMN public.maquinaria_importacion_lineas.fecha_pedido IS
  'Fecha real del pedido. Para cargas historicas se recupera del antiguo campo PO.';

NOTIFY pgrst, 'reload schema';
