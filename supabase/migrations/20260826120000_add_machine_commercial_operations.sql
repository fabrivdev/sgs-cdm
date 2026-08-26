-- Flujo operativo de maquinaria: NP -> abastecimiento -> importacion/stock -> venta -> parque.
-- Los documentos se conservan como evidencia y su extraccion siempre requiere validacion humana.

CREATE TABLE IF NOT EXISTS public.maquinaria_marcas_admitidas (
  marca public.marca PRIMARY KEY,
  admitida_parque boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  observaciones text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.maquinaria_marcas_admitidas (marca, admitida_parque, observaciones)
VALUES
  ('CLAAS'::public.marca, true, 'Marca representada'),
  ('HORSCH'::public.marca, true, 'Marca representada'),
  ('OTROS'::public.marca, false, 'Seguimiento comercial sin alta automatica al parque')
ON CONFLICT (marca) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.maquinaria_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  np_numero text,
  np_fecha date,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text,
  comercial text,
  estado text NOT NULL DEFAULT 'BORRADOR',
  observaciones text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  validado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maquinaria_operaciones_estado_check CHECK (
    estado IN ('BORRADOR','REVISION_NP','NP_VALIDADA','ABASTECIMIENTO','EN_IMPORTACION','DISPONIBLE','FACTURADA','CERRADA','CANCELADA')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_operaciones_np_unique
  ON public.maquinaria_operaciones (upper(btrim(np_numero)))
  WHERE nullif(btrim(np_numero), '') IS NOT NULL AND estado <> 'CANCELADA';
CREATE INDEX IF NOT EXISTS maquinaria_operaciones_estado_idx
  ON public.maquinaria_operaciones (estado, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS public.maquinaria_operacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id uuid NOT NULL REFERENCES public.maquinaria_operaciones(id) ON DELETE CASCADE,
  linea_numero integer NOT NULL DEFAULT 1,
  marca public.marca NOT NULL DEFAULT 'OTROS',
  producto text,
  modelo text,
  subgrupo public.subgrupo_maquina NOT NULL DEFAULT 'OTRO',
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad > 0 AND cantidad <= 500),
  condicion text NOT NULL DEFAULT 'NUEVA' CHECK (condicion IN ('NUEVA','USADA')),
  abastecimiento text NOT NULL DEFAULT 'DEFINIR' CHECK (abastecimiento IN ('DEFINIR','STOCK','IMPORTAR')),
  elegible_parque boolean NOT NULL DEFAULT false,
  datos_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  confianza_extraccion jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacion_id, linea_numero)
);

CREATE INDEX IF NOT EXISTS maquinaria_operacion_lineas_operacion_idx
  ON public.maquinaria_operacion_lineas (operacion_id, linea_numero);

CREATE TABLE IF NOT EXISTS public.maquinaria_unidades_operacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea_id uuid NOT NULL REFERENCES public.maquinaria_operacion_lineas(id) ON DELETE CASCADE,
  numero_unidad integer NOT NULL DEFAULT 1,
  chasis text,
  valor_facturado numeric(16,2),
  moneda text,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_TRANSITO','DISPONIBLE','FACTURADA','EN_PARQUE','TRANSFERIDA','CANCELADA')),
  parque_maquina_id uuid REFERENCES public.parque_maquinas(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (linea_id, numero_unidad)
);

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_unidades_chasis_unique
  ON public.maquinaria_unidades_operacion (public.normalizar_chasis_notificacion(chasis))
  WHERE public.normalizar_chasis_notificacion(chasis) IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.maquinaria_importaciones_operativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id uuid NOT NULL REFERENCES public.maquinaria_operaciones(id) ON DELETE CASCADE,
  proveedor text,
  factura_numero text,
  factura_fecha date,
  moneda text,
  valor_facturado numeric(16,2),
  estado text NOT NULL DEFAULT 'PENDIENTE_FACTURA' CHECK (estado IN ('PENDIENTE_FACTURA','FACTURA_REVISADA','EN_TRANSITO','RECIBIDA','CANCELADA')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacion_id)
);

CREATE TABLE IF NOT EXISTS public.maquinaria_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id uuid NOT NULL REFERENCES public.maquinaria_operaciones(id) ON DELETE CASCADE,
  importacion_id uuid REFERENCES public.maquinaria_importaciones_operativas(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('NP','FACTURA_IMPORTACION','FACTURA_VENTA','OTRO')),
  archivo_nombre text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  tamano_bytes bigint CHECK (tamano_bytes IS NULL OR tamano_bytes >= 0),
  estado_extraccion text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_extraccion IN ('PENDIENTE','PROCESANDO','EXTRAIDO','REVISADO','ERROR')),
  datos_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  confianza jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_extraccion text,
  subido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maquinaria_documentos_operacion_idx
  ON public.maquinaria_documentos (operacion_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.parque_historial_propiedad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina_id uuid NOT NULL REFERENCES public.parque_maquinas(id) ON DELETE CASCADE,
  cliente_anterior_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nuevo_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  tipo_evento text NOT NULL CHECK (tipo_evento IN ('ALTA','TRANSFERENCIA','BAJA')),
  operacion_id uuid REFERENCES public.maquinaria_operaciones(id) ON DELETE SET NULL,
  observaciones text,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  registrado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parque_historial_propiedad_maquina_idx
  ON public.parque_historial_propiedad (maquina_id, registrado_en DESC);

CREATE OR REPLACE FUNCTION public.maquinaria_marca_admitida(p_marca public.marca)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT m.admitida_parque AND m.activa
    FROM public.maquinaria_marcas_admitidas m
    WHERE m.marca = p_marca
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_preparar_linea()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.elegible_parque := public.maquinaria_marca_admitida(NEW.marca);
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maquinaria_preparar_linea_trigger ON public.maquinaria_operacion_lineas;
CREATE TRIGGER maquinaria_preparar_linea_trigger
BEFORE INSERT OR UPDATE OF marca ON public.maquinaria_operacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_preparar_linea();

CREATE OR REPLACE FUNCTION public.validar_marca_admitida_parque()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.maquinaria_marca_admitida(NEW.marca) THEN
    RAISE EXCEPTION 'La marca % no esta admitida para el parque', NEW.marca
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_marca_admitida_parque_trigger ON public.parque_maquinas;
CREATE TRIGGER validar_marca_admitida_parque_trigger
BEFORE INSERT OR UPDATE OF marca ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.validar_marca_admitida_parque();

CREATE OR REPLACE FUNCTION public.registrar_historial_propiedad_maquina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidad_id uuid;
  v_operacion_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT u.id, l.operacion_id
      INTO v_unidad_id, v_operacion_id
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE public.normalizar_chasis_notificacion(u.chasis)
      = public.normalizar_chasis_notificacion(NEW.serie)
    ORDER BY u.actualizado_en DESC
    LIMIT 1;

    INSERT INTO public.parque_historial_propiedad (
      maquina_id, cliente_nuevo_id, tipo_evento, operacion_id
    ) VALUES (NEW.id, NEW.cliente_id, 'ALTA', v_operacion_id);

    IF v_unidad_id IS NOT NULL THEN
      UPDATE public.maquinaria_unidades_operacion
      SET parque_maquina_id = NEW.id,
          estado = 'EN_PARQUE',
          actualizado_en = now()
      WHERE id = v_unidad_id;

      IF NOT EXISTS (
        SELECT 1
        FROM public.maquinaria_operacion_lineas l
        JOIN public.maquinaria_unidades_operacion u ON u.linea_id = l.id
        WHERE l.operacion_id = v_operacion_id
          AND l.elegible_parque
          AND u.estado NOT IN ('EN_PARQUE', 'TRANSFERIDA', 'CANCELADA')
      ) THEN
        UPDATE public.maquinaria_operaciones
        SET estado = 'CERRADA', actualizado_en = now()
        WHERE id = v_operacion_id;
      ELSE
        UPDATE public.maquinaria_operaciones
        SET estado = 'FACTURADA', actualizado_en = now()
        WHERE id = v_operacion_id
          AND estado NOT IN ('CERRADA', 'CANCELADA');
      END IF;
    END IF;
  ELSIF OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    SELECT l.operacion_id INTO v_operacion_id
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE u.parque_maquina_id = NEW.id
    ORDER BY u.actualizado_en DESC
    LIMIT 1;

    INSERT INTO public.parque_historial_propiedad (
      maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento, operacion_id
    ) VALUES (NEW.id, OLD.cliente_id, NEW.cliente_id, 'TRANSFERENCIA', v_operacion_id);
  ELSIF OLD.activo AND NOT NEW.activo THEN
    SELECT l.operacion_id INTO v_operacion_id
    FROM public.maquinaria_unidades_operacion u
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE u.parque_maquina_id = NEW.id
    ORDER BY u.actualizado_en DESC
    LIMIT 1;

    INSERT INTO public.parque_historial_propiedad (
      maquina_id, cliente_anterior_id, cliente_nuevo_id, tipo_evento, operacion_id
    ) VALUES (NEW.id, OLD.cliente_id, NEW.cliente_id, 'BAJA', v_operacion_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrar_historial_propiedad_maquina_trigger ON public.parque_maquinas;
CREATE TRIGGER registrar_historial_propiedad_maquina_trigger
AFTER INSERT OR UPDATE OF cliente_id, activo ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.registrar_historial_propiedad_maquina();

CREATE OR REPLACE FUNCTION public.maquinaria_registrar_operacion(
  p_operacion jsonb,
  p_lineas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion_id uuid := coalesce(nullif(p_operacion ->> 'id', '')::uuid, gen_random_uuid());
  v_linea jsonb;
  v_linea_id uuid;
  v_cantidad integer;
  v_numero integer;
  v_cliente_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_module_access(auth.uid(), 'parque') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos una maquina';
  END IF;

  v_cliente_id := nullif(p_operacion ->> 'cliente_id', '')::uuid;
  IF v_cliente_id IS NULL AND nullif(btrim(p_operacion ->> 'cliente_nombre'), '') IS NOT NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE upper(btrim(c.nombre)) = upper(btrim(p_operacion ->> 'cliente_nombre'))
    ORDER BY c.activo DESC, c.creado_en
    LIMIT 1;
  END IF;

  INSERT INTO public.maquinaria_operaciones (
    id, np_numero, np_fecha, cliente_id, cliente_nombre, comercial,
    estado, observaciones, creado_por, validado_por, validado_en
  ) VALUES (
    v_operacion_id,
    nullif(btrim(p_operacion ->> 'np_numero'), ''),
    nullif(p_operacion ->> 'np_fecha', '')::date,
    v_cliente_id,
    nullif(btrim(p_operacion ->> 'cliente_nombre'), ''),
    nullif(btrim(p_operacion ->> 'comercial'), ''),
    'NP_VALIDADA',
    nullif(btrim(p_operacion ->> 'observaciones'), ''),
    auth.uid(), auth.uid(), now()
  );

  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_cantidad := greatest(1, least(500, coalesce((v_linea ->> 'cantidad')::integer, 1)));
    INSERT INTO public.maquinaria_operacion_lineas (
      operacion_id, linea_numero, marca, producto, modelo, subgrupo,
      cantidad, condicion, abastecimiento, datos_extraidos, confianza_extraccion
    ) VALUES (
      v_operacion_id,
      coalesce((v_linea ->> 'linea_numero')::integer, 1),
      coalesce(nullif(upper(v_linea ->> 'marca'), '')::public.marca, 'OTROS'::public.marca),
      nullif(btrim(v_linea ->> 'producto'), ''),
      nullif(btrim(v_linea ->> 'modelo'), ''),
      coalesce(nullif(upper(v_linea ->> 'subgrupo'), '')::public.subgrupo_maquina, 'OTRO'::public.subgrupo_maquina),
      v_cantidad,
      CASE WHEN upper(coalesce(v_linea ->> 'condicion', 'NUEVA')) = 'USADA' THEN 'USADA' ELSE 'NUEVA' END,
      CASE WHEN upper(coalesce(v_linea ->> 'abastecimiento', 'DEFINIR')) IN ('STOCK','IMPORTAR')
        THEN upper(v_linea ->> 'abastecimiento') ELSE 'DEFINIR' END,
      coalesce(v_linea -> 'datos_extraidos', '{}'::jsonb),
      coalesce(v_linea -> 'confianza', '{}'::jsonb)
    ) RETURNING id INTO v_linea_id;

    FOR v_numero IN 1..v_cantidad LOOP
      INSERT INTO public.maquinaria_unidades_operacion (linea_id, numero_unidad, chasis)
      VALUES (
        v_linea_id,
        v_numero,
        nullif(btrim(v_linea -> 'chasis' ->> (v_numero - 1)), '')
      );
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.maquinaria_operacion_lineas
    WHERE operacion_id = v_operacion_id AND abastecimiento = 'IMPORTAR'
  ) THEN
    INSERT INTO public.maquinaria_importaciones_operativas (operacion_id)
    VALUES (v_operacion_id)
    ON CONFLICT (operacion_id) DO NOTHING;
    UPDATE public.maquinaria_operaciones SET estado = 'EN_IMPORTACION' WHERE id = v_operacion_id;
  ELSE
    UPDATE public.maquinaria_operaciones SET estado = 'ABASTECIMIENTO' WHERE id = v_operacion_id;
  END IF;

  RETURN v_operacion_id;
END;
$$;

CREATE OR REPLACE VIEW public.maquinaria_operaciones_resumen
WITH (security_invoker = true)
AS
SELECT
  o.id, o.np_numero, o.np_fecha, o.cliente_id,
  coalesce(c.nombre, o.cliente_nombre, 'Cliente por validar') AS cliente_nombre,
  o.comercial, o.estado, o.observaciones, o.creado_en, o.actualizado_en,
  coalesce(l.lineas, 0)::integer AS lineas,
  coalesce(l.unidades, 0)::integer AS unidades,
  coalesce(d.documentos, 0)::integer AS documentos,
  coalesce(l.requiere_importacion, false) AS requiere_importacion,
  coalesce(l.incluye_marca_admitida, false) AS incluye_marca_admitida,
  l.marcas
FROM public.maquinaria_operaciones o
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS lineas,
    coalesce(sum(ml.cantidad), 0)::integer AS unidades,
    bool_or(ml.abastecimiento = 'IMPORTAR') AS requiere_importacion,
    bool_or(ml.elegible_parque) AS incluye_marca_admitida,
    string_agg(DISTINCT ml.marca::text, ', ' ORDER BY ml.marca::text) AS marcas
  FROM public.maquinaria_operacion_lineas ml
  WHERE ml.operacion_id = o.id
) l ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS documentos
  FROM public.maquinaria_documentos md
  WHERE md.operacion_id = o.id
) d ON true;

ALTER TABLE public.maquinaria_marcas_admitidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_operacion_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_unidades_operacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_importaciones_operativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinaria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parque_historial_propiedad ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'maquinaria_marcas_admitidas','maquinaria_operaciones','maquinaria_operacion_lineas',
    'maquinaria_unidades_operacion','maquinaria_importaciones_operativas',
    'maquinaria_documentos','parque_historial_propiedad'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Acceso modulo parque', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_module_access(auth.uid(), %L)) WITH CHECK (public.has_module_access(auth.uid(), %L))',
      'Acceso modulo parque', v_table, 'parque', 'parque'
    );
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maquinaria-documentos', 'maquinaria-documentos', false, 12582912,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Documentos maquinaria visibles" ON storage.objects;
CREATE POLICY "Documentos maquinaria visibles"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'maquinaria-documentos' AND public.has_module_access(auth.uid(), 'parque'));

DROP POLICY IF EXISTS "Documentos maquinaria subibles" ON storage.objects;
CREATE POLICY "Documentos maquinaria subibles"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'maquinaria-documentos'
  AND public.has_module_access(auth.uid(), 'parque')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Documentos maquinaria actualizables" ON storage.objects;
CREATE POLICY "Documentos maquinaria actualizables"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'maquinaria-documentos' AND public.has_module_access(auth.uid(), 'parque'))
WITH CHECK (bucket_id = 'maquinaria-documentos' AND public.has_module_access(auth.uid(), 'parque'));

GRANT SELECT ON public.maquinaria_operaciones_resumen TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_marca_admitida(public.marca) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maquinaria_registrar_operacion(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
