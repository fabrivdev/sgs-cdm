-- Restaura numeros de factura de proveedor presentes en el Excel fuente
-- "Planificador de Importaciones - CDM" que quedaron nulos en el snapshot.
-- La planilla no contiene una columna de fecha de factura del proveedor, por
-- lo que esa fecha se conserva sin cambios y nunca se infiere.

WITH fuente(source_row, invoice_supplier) AS (
  VALUES
    (2,  '0041-00003273'::text),
    (3,  '0041-00003274'::text),
    (4,  '0041-00003270'::text),
    (5,  '0041-00003271'::text),
    (6,  '0041-00003272'::text),
    (7,  '0041-00003277'::text),
    (8,  '0041-00003278'::text),
    (9,  '0041-00003287'::text),
    (10, '0041-00003286'::text),
    (11, '0041-00003280'::text),
    (12, '0041-00003282'::text),
    (13, '0041-00003288'::text),
    (14, '0041-00003281'::text),
    (15, '0041-00003289'::text),
    (16, '230389'::text),
    (17, '6112645723'::text),
    (19, '6112645724'::text),
    (24, '0041-00003279'::text),
    (26, '230408'::text),
    (27, '230397'::text),
    (28, '230395'::text),
    (29, '230421'::text),
    (30, '230396'::text),
    (31, '230422'::text),
    (32, '230420'::text),
    (33, '230400'::text),
    (35, '230403'::text),
    (39, '230423'::text),
    (40, '230419'::text),
    (41, '230399'::text),
    (42, '0041-00003296'::text),
    (43, '230398'::text),
    (50, '230388'::text),
    (51, '0041-00003291'::text),
    (52, '0041-00003297'::text),
    (53, '230410'::text)
)
UPDATE public.maquinaria_importacion_lineas i
SET invoice_supplier = f.invoice_supplier,
    datos_fuente = jsonb_set(
      jsonb_set(
        coalesce(i.datos_fuente, '{}'::jsonb),
        '{invoice_supplier}',
        to_jsonb(f.invoice_supplier),
        true
      ),
      '{raw,INVOICE SUPPLIER}',
      to_jsonb(f.invoice_supplier),
      true
    ),
    actualizado_en = now()
FROM fuente f
WHERE i.source_sheet = 'MAESTRO DE IMPORTACIONES'
  AND i.source_row = f.source_row
  AND nullif(btrim(i.invoice_supplier), '') IS NULL;

-- Vincula automaticamente trazabilidad historica solamente cuando existe una
-- unica importacion y una unica unidad vendida con el mismo chasis exacto.
-- No reserva stock ni modifica estados o fechas. Los chasis repetidos,
-- ocupados o asociados a otra operacion siguen requiriendo revision manual.
CREATE OR REPLACE FUNCTION public.maquinaria_intentar_autovinculo_historico(
  p_chasis text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_chasis_normalizado text := public.normalizar_chasis_notificacion(p_chasis);
  v_importacion_id uuid;
  v_importacion_operacion_id uuid;
  v_importacion_unidad_id uuid;
  v_importaciones integer;
  v_unidad_id uuid;
  v_linea_id uuid;
  v_operacion_id uuid;
  v_unidades integer;
BEGIN
  IF v_chasis_normalizado IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    (array_agg(iu.id ORDER BY iu.id))[1],
    count(*)::integer
  INTO v_importacion_id, v_importaciones
  FROM public.maquinaria_importacion_unidades iu
  JOIN public.maquinaria_importacion_lineas i
    ON i.id = iu.importacion_linea_id
  WHERE iu.activa
    AND public.normalizar_chasis_notificacion(
      coalesce(iu.chasis, CASE WHEN iu.numero_unidad = 1 THEN i.chasis END)
    ) = v_chasis_normalizado;

  IF v_importaciones <> 1 THEN
    RETURN false;
  END IF;

  SELECT
    (array_agg(u.id ORDER BY u.id))[1],
    (array_agg(l.id ORDER BY u.id))[1],
    (array_agg(o.id ORDER BY u.id))[1],
    count(*)::integer
  INTO v_unidad_id, v_linea_id, v_operacion_id, v_unidades
  FROM public.maquinaria_unidades_operacion u
  JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
  JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
  WHERE o.estado IN ('FACTURADA', 'CERRADA')
    AND public.normalizar_chasis_notificacion(u.chasis) = v_chasis_normalizado;

  IF v_unidades <> 1 THEN
    RETURN false;
  END IF;

  SELECT iu.operacion_id, iu.unidad_id
  INTO v_importacion_operacion_id, v_importacion_unidad_id
  FROM public.maquinaria_importacion_unidades iu
  WHERE iu.id = v_importacion_id
  FOR UPDATE;

  IF v_importacion_unidad_id = v_unidad_id THEN
    RETURN true;
  END IF;

  IF v_importacion_unidad_id IS NOT NULL
     OR (
       v_importacion_operacion_id IS NOT NULL
       AND v_importacion_operacion_id <> v_operacion_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.maquinaria_importacion_unidades otra
       WHERE otra.unidad_id = v_unidad_id
         AND otra.id <> v_importacion_id
     ) THEN
    RETURN false;
  END IF;

  UPDATE public.maquinaria_importacion_unidades
  SET operacion_id = v_operacion_id,
      linea_id = v_linea_id,
      unidad_id = v_unidad_id,
      situacion_vinculo = 'CHASIS VINCULADO',
      vinculo_manual = false,
      actualizado_en = now()
  WHERE id = v_importacion_id;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_intentar_autovinculo_historico(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_autovincular_por_chasis_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.maquinaria_intentar_autovinculo_historico(NEW.chasis);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_autovincular_pedido_chasis_trigger
  ON public.maquinaria_unidades_operacion;
CREATE TRIGGER maquinaria_autovincular_pedido_chasis_trigger
AFTER INSERT OR UPDATE OF chasis
ON public.maquinaria_unidades_operacion
FOR EACH ROW
WHEN (NEW.chasis IS NOT NULL)
EXECUTE FUNCTION public.maquinaria_autovincular_por_chasis_trigger();

DROP TRIGGER IF EXISTS maquinaria_autovincular_importacion_chasis_trigger
  ON public.maquinaria_importacion_unidades;
CREATE TRIGGER maquinaria_autovincular_importacion_chasis_trigger
AFTER INSERT OR UPDATE OF chasis
ON public.maquinaria_importacion_unidades
FOR EACH ROW
WHEN (NEW.chasis IS NOT NULL)
EXECUTE FUNCTION public.maquinaria_autovincular_por_chasis_trigger();

CREATE OR REPLACE FUNCTION public.maquinaria_autovincular_al_cerrar_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chasis text;
BEGIN
  IF NEW.estado IN ('FACTURADA', 'CERRADA')
     AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    FOR v_chasis IN
      SELECT u.chasis
      FROM public.maquinaria_unidades_operacion u
      JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
      WHERE l.operacion_id = NEW.id
        AND public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
    LOOP
      PERFORM public.maquinaria_intentar_autovinculo_historico(v_chasis);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_autovincular_al_cerrar_trigger
  ON public.maquinaria_operaciones;
CREATE TRIGGER maquinaria_autovincular_al_cerrar_trigger
AFTER UPDATE OF estado
ON public.maquinaria_operaciones
FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_autovincular_al_cerrar_trigger();

-- Aplica la regla a los datos historicos que ya estaban cargados antes de
-- instalar los triggers. Cada chasis se evalua una sola vez.
DO $$
DECLARE
  v_chasis text;
BEGIN
  FOR v_chasis IN
    SELECT min(u.chasis)
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
    WHERE o.estado IN ('FACTURADA', 'CERRADA')
      AND public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL
    GROUP BY public.normalizar_chasis_notificacion(u.chasis)
  LOOP
    PERFORM public.maquinaria_intentar_autovinculo_historico(v_chasis);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
