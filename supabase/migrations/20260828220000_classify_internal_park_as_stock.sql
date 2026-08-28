-- Decisiones operativas finales del flujo:
-- - CAMPOS DEL MANANA representa inventario propio, no parque de clientes.
-- - una reserva no vence por tiempo; solo se libera al desvincular o cancelar.

ALTER TABLE public.parque_stock_maquinas
  ADD COLUMN IF NOT EXISTS parque_origen_id uuid
    REFERENCES public.parque_maquinas(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS parque_stock_maquinas_parque_origen_unique
  ON public.parque_stock_maquinas(parque_origen_id)
  WHERE parque_origen_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.maquinaria_cliente_es_stock_interno(p_nombre text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT translate(upper(coalesce(p_nombre, '')), 'ÑÁÉÍÓÚÜ', 'NAEIOUU')
    LIKE '%CAMPOS DEL MANANA%';
$$;

-- Conserva la maquina como fila auditable de parque, pero la materializa en
-- el inventario comercial y luego la desactiva del parque activo.
INSERT INTO public.parque_stock_maquinas (
  producto_codigo, stock_key, source_row, sucursal, filial_original,
  deposito, tipo, marca, modelo, estado, chasis, saldo_actual, carga_id,
  datos_fuente, unidad_operacion_id, parque_origen_id, importado_en
)
SELECT
  'PARQUE-' || p.id::text,
  CASE
    WHEN public.normalizar_chasis_notificacion(p.serie) IS NOT NULL
      THEN 'CHASIS:' || public.normalizar_chasis_notificacion(p.serie)
    ELSE 'PARQUE:' || p.id::text
  END,
  NULL, p.sucursal, NULL, NULL, p.subgrupo::text, p.marca::text,
  p.modelo_tipo, 'Usado', p.serie, 1, gen_random_uuid(),
  jsonb_build_object(
    'origen', 'RECLASIFICADO_DESDE_PARQUE',
    'parque_maquina_id', p.id,
    'cliente_origen', c.nombre
  ),
  NULL, p.id, now()
FROM public.parque_maquinas p
JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.activo
  AND public.maquinaria_cliente_es_stock_interno(c.nombre)
  AND NOT EXISTS (
    SELECT 1 FROM public.parque_stock_maquinas s
    WHERE s.parque_origen_id = p.id
       OR (
         public.normalizar_chasis_notificacion(p.serie) IS NOT NULL
         AND public.normalizar_chasis_notificacion(s.chasis)
           = public.normalizar_chasis_notificacion(p.serie)
       )
  );

UPDATE public.parque_maquinas p
SET activo = false,
    notas = concat_ws(E'\n', nullif(btrim(p.notas), ''),
      'Reclasificada como stock interno: cliente Campos del Manana.'),
    actualizado_en = now()
FROM public.clientes c
WHERE c.id = p.cliente_id
  AND p.activo
  AND public.maquinaria_cliente_es_stock_interno(c.nombre);

CREATE OR REPLACE FUNCTION public.maquinaria_evitar_stock_interno_en_parque()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_nombre text;
BEGIN
  IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.nombre INTO v_cliente_nombre
  FROM public.clientes c WHERE c.id = NEW.cliente_id;

  IF public.maquinaria_cliente_es_stock_interno(v_cliente_nombre) THEN
    NEW.activo := false;
    NEW.notas := concat_ws(E'\n', nullif(btrim(NEW.notas), ''),
      'No pertenece al parque de clientes: Campos del Manana representa stock interno.');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_evitar_stock_interno_en_parque_trigger
  ON public.parque_maquinas;
CREATE TRIGGER maquinaria_evitar_stock_interno_en_parque_trigger
BEFORE INSERT OR UPDATE OF cliente_id, activo
ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_evitar_stock_interno_en_parque();

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_stock_interno_parque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_nombre text;
BEGIN
  SELECT c.nombre INTO v_cliente_nombre
  FROM public.clientes c WHERE c.id = NEW.cliente_id;
  IF NOT public.maquinaria_cliente_es_stock_interno(v_cliente_nombre) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.parque_stock_maquinas s
    WHERE s.parque_origen_id = NEW.id
       OR (
         public.normalizar_chasis_notificacion(NEW.serie) IS NOT NULL
         AND public.normalizar_chasis_notificacion(s.chasis)
           = public.normalizar_chasis_notificacion(NEW.serie)
       )
  ) THEN
    UPDATE public.parque_stock_maquinas
    SET sucursal = NEW.sucursal,
        tipo = NEW.subgrupo::text,
        marca = NEW.marca::text,
        modelo = NEW.modelo_tipo,
        chasis = NEW.serie,
        saldo_actual = greatest(saldo_actual, 1),
        importado_en = now()
    WHERE parque_origen_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.parque_stock_maquinas (
    producto_codigo, stock_key, sucursal, tipo, marca, modelo, estado,
    chasis, saldo_actual, carga_id, datos_fuente, parque_origen_id, importado_en
  ) VALUES (
    'PARQUE-' || NEW.id::text,
    CASE WHEN public.normalizar_chasis_notificacion(NEW.serie) IS NOT NULL
      THEN 'CHASIS:' || public.normalizar_chasis_notificacion(NEW.serie)
      ELSE 'PARQUE:' || NEW.id::text END,
    NEW.sucursal, NEW.subgrupo::text, NEW.marca::text, NEW.modelo_tipo,
    'Usado', NEW.serie, 1, gen_random_uuid(),
    jsonb_build_object('origen', 'RECLASIFICADO_DESDE_PARQUE', 'parque_maquina_id', NEW.id),
    NEW.id, now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_sincronizar_stock_interno_parque_trigger
  ON public.parque_maquinas;
CREATE TRIGGER maquinaria_sincronizar_stock_interno_parque_trigger
AFTER INSERT OR UPDATE OF cliente_id, activo, serie, sucursal, subgrupo, marca, modelo_tipo
ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_stock_interno_parque();

COMMENT ON COLUMN public.parque_stock_maquinas.unidad_operacion_id IS
  'Reserva persistente sin vencimiento automatico; se libera por desvinculacion, cancelacion o reasignacion explicita.';
COMMENT ON FUNCTION public.maquinaria_cliente_es_stock_interno(text) IS
  'Identifica al cliente interno Campos del Manana, cuyas maquinas deben tratarse como stock y no como parque de clientes.';

GRANT EXECUTE ON FUNCTION public.maquinaria_cliente_es_stock_interno(text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
