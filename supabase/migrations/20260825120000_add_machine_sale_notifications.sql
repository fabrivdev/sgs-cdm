-- Notificaciones operativas y alta asistida de maquinas vendidas.
-- La primera regla avisa a administradores cuando una factura del sistema
-- nuevo contiene una maquina CLAAS/HORSCH cuyo chasis no existe en el parque.

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensaje text,
  clave_unica text NOT NULL UNIQUE,
  destinatario_roles public.app_role[] NOT NULL DEFAULT ARRAY['admin'::public.app_role],
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'pendiente',
  visto_por uuid[] NOT NULL DEFAULT '{}'::uuid[],
  accionada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accionada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_estado_check
    CHECK (estado IN ('pendiente', 'confirmada', 'descartada'))
);

CREATE INDEX IF NOT EXISTS notificaciones_estado_tipo_idx
  ON public.notificaciones (estado, tipo, creado_en DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notificaciones visibles por rol" ON public.notificaciones;
CREATE POLICY "Notificaciones visibles por rol"
  ON public.notificaciones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM unnest(destinatario_roles) AS rol
      WHERE public.has_role(auth.uid(), rol)
    )
  );

CREATE OR REPLACE FUNCTION public.normalizar_chasis_notificacion(p_valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(regexp_replace(upper(coalesce(p_valor, '')), '[^A-Z0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.valor_json_insensible(p_datos jsonb, p_claves text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(e.value), '')
  FROM jsonb_each_text(coalesce(p_datos, '{}'::jsonb)) AS e(key, value)
  WHERE upper(regexp_replace(e.key, '[^A-Z0-9]', '', 'g')) = ANY (
    SELECT upper(regexp_replace(clave, '[^A-Z0-9]', '', 'g'))
    FROM unnest(p_claves) AS clave
  )
  ORDER BY array_position(
    ARRAY(
      SELECT upper(regexp_replace(clave, '[^A-Z0-9]', '', 'g'))
      FROM unnest(p_claves) AS clave
    ),
    upper(regexp_replace(e.key, '[^A-Z0-9]', '', 'g'))
  )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.extraer_chasis_venta_maquina(
  p_texto text,
  p_raw_data jsonb,
  p_os_numero text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chasis text;
  v_match text[];
BEGIN
  v_chasis := public.valor_json_insensible(
    p_raw_data,
    ARRAY['CHASIS', 'CASIS', 'SERIE', 'NRO CHASIS', 'NRO SERIE']
  );

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL THEN
    v_match := regexp_match(
      coalesce(p_texto, ''),
      '(?i)(?:CHASIS|CASIS|SERIE)[[:space:]]*:[[:space:]]*([A-Z0-9._/-]+)'
    );
    v_chasis := v_match[1];
  END IF;

  IF public.normalizar_chasis_notificacion(v_chasis) IS NULL AND nullif(btrim(p_os_numero), '') IS NOT NULL THEN
    SELECT osi.nro_chasis
    INTO v_chasis
    FROM public.ordenes_servicio_importadas osi
    WHERE osi.os_numero = p_os_numero
      AND public.normalizar_chasis_notificacion(osi.nro_chasis) IS NOT NULL
    ORDER BY osi.actualizado_en DESC NULLS LAST, osi.importado_en DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN NULLIF(btrim(v_chasis), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.inferir_subgrupo_maquina_notificacion(p_texto text)
RETURNS public.subgrupo_maquina
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_texto text := upper(coalesce(p_texto, ''));
BEGIN
  IF v_texto ~ 'COSECH' THEN RETURN 'COSECHADORAS'::public.subgrupo_maquina; END IF;
  IF v_texto ~ 'SEMBRAD|PLANTAD|PRONTO' THEN RETURN 'SEMBRADORAS'::public.subgrupo_maquina; END IF;
  IF v_texto ~ 'PICADOR|JAGUAR' THEN RETURN 'PICADORAS'::public.subgrupo_maquina; END IF;
  IF v_texto ~ 'PLATAFORM|CABEZAL|CONVIO|ORBIS|MAXFLEX|DIRECT DISC' THEN
    RETURN 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina;
  END IF;
  IF v_texto ~ 'PULVER' THEN RETURN 'PULVERIZADORAS'::public.subgrupo_maquina; END IF;
  IF v_texto ~ 'TRACTOR|AXION|ARION|XERION' THEN RETURN 'TRACTORES'::public.subgrupo_maquina; END IF;
  IF v_texto ~ 'SUELO|JOKER|TIGER|CULTRO|DAKAR' THEN RETURN 'SUELO'::public.subgrupo_maquina; END IF;
  RETURN 'OTRO'::public.subgrupo_maquina;
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_notificacion_venta_maquina(p_linea_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linea public.facturacion_lineas_importadas%ROWTYPE;
  v_texto text;
  v_os_numero text;
  v_chasis text;
  v_chasis_norm text;
  v_marca public.marca;
  v_modelo text;
  v_tipo text;
  v_match text[];
  v_notificacion_id uuid;
  v_clave text;
BEGIN
  SELECT * INTO v_linea
  FROM public.facturacion_lineas_importadas
  WHERE id = p_linea_id;

  IF NOT FOUND OR coalesce(v_linea.cantidad, 0) <= 0 OR coalesce(v_linea.total_venta, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  v_texto := concat_ws(' | ', v_linea.mercaderia, v_linea.observacion, v_linea.subgrupo_original);
  v_os_numero := nullif(v_linea.raw_data ->> 'linked_service_order', '');

  IF NOT (
    upper(coalesce(v_linea.grupo_normalizado, '')) = 'MAQUINARIAS'
    OR upper(coalesce(v_linea.raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
    OR left(upper(coalesce(v_linea.cod_mercaderia, '')), 5) = 'VEIC_'
    OR v_texto ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
  ) THEN
    RETURN NULL;
  END IF;

  v_marca := v_linea.marca_normalizada;
  IF v_marca = 'OTROS'::public.marca THEN
    IF v_texto ~* 'CLAAS' THEN v_marca := 'CLAAS'::public.marca;
    ELSIF v_texto ~* 'HORSCH' THEN v_marca := 'HORSCH'::public.marca;
    END IF;
  END IF;

  IF v_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RETURN NULL;
  END IF;

  v_chasis := public.extraer_chasis_venta_maquina(v_texto, v_linea.raw_data, v_os_numero);
  v_chasis_norm := public.normalizar_chasis_notificacion(v_chasis);
  IF v_chasis_norm IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.parque_maquinas pm
    WHERE public.normalizar_chasis_notificacion(pm.serie) = v_chasis_norm
  ) THEN
    RETURN NULL;
  END IF;

  v_modelo := public.valor_json_insensible(v_linea.raw_data, ARRAY['MODELO', 'MODEL']);
  IF nullif(btrim(v_modelo), '') IS NULL THEN
    v_match := regexp_match(v_texto, '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)');
    v_modelo := regexp_replace(coalesce(v_match[1], ''), '(?i)[[:space:]]+(?:CHASIS|CASIS|SERIE|TIPO)[[:space:]]*:.*$', '');
  END IF;

  v_tipo := public.valor_json_insensible(v_linea.raw_data, ARRAY['TIPO', 'TIPO MAQUINA', 'SUBGRUPO']);
  IF nullif(btrim(v_tipo), '') IS NULL THEN
    v_match := regexp_match(v_texto, '(?i)TIPO[[:space:]]*:[[:space:]]*([^|;]+)');
    v_tipo := regexp_replace(coalesce(v_match[1], ''), '(?i)[[:space:]]+(?:MODELO|CHASIS|CASIS|SERIE)[[:space:]]*:.*$', '');
  END IF;

  v_clave := 'venta_maquina|' || coalesce(v_linea.factura, v_linea.codigo_interno_factura, v_linea.id::text) || '|' || v_chasis_norm;

  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, clave_unica, destinatario_roles, datos
  ) VALUES (
    'venta_maquina_sin_parque',
    'Nueva máquina facturada para revisar',
    concat_ws(' · ', v_marca::text, nullif(btrim(v_modelo), ''), 'Chasis ' || v_chasis),
    v_clave,
    ARRAY['admin'::public.app_role, 'superadmin'::public.app_role],
    jsonb_build_object(
      'facturacion_linea_id', v_linea.id,
      'factura', coalesce(v_linea.factura, v_linea.codigo_interno_factura),
      'fecha_factura', v_linea.fecha_factura,
      'cliente_id', v_linea.cliente_id,
      'cliente_nombre', v_linea.entidad_nombre,
      'marca', v_marca,
      'chasis', v_chasis,
      'modelo_tipo', nullif(btrim(v_modelo), ''),
      'subgrupo', public.inferir_subgrupo_maquina_notificacion(concat_ws(' ', v_tipo, v_modelo, v_texto)),
      'sucursal', v_linea.sucursal,
      'producto_codigo', v_linea.cod_mercaderia,
      'producto', v_linea.mercaderia,
      'origen_sistema', v_linea.origen_sistema
    )
  )
  ON CONFLICT (clave_unica) DO UPDATE
  SET titulo = EXCLUDED.titulo,
      mensaje = EXCLUDED.mensaje,
      datos = EXCLUDED.datos,
      actualizado_en = now()
  RETURNING id INTO v_notificacion_id;

  RETURN v_notificacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detectar_venta_maquina_notificacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.generar_notificacion_venta_maquina(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS detectar_venta_maquina_notificacion_trigger
  ON public.facturacion_lineas_importadas;
CREATE TRIGGER detectar_venta_maquina_notificacion_trigger
AFTER INSERT OR UPDATE OF grupo_normalizado, marca_normalizada, mercaderia,
  observacion, cod_mercaderia, cantidad, total_venta, raw_data, cliente_id,
  factura, codigo_interno_factura, fecha_factura, entidad_nombre, sucursal,
  origen_sistema
ON public.facturacion_lineas_importadas
FOR EACH ROW
EXECUTE FUNCTION public.detectar_venta_maquina_notificacion();

CREATE OR REPLACE FUNCTION public.notificaciones_marcar_vista(p_notificacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesion requerida'; END IF;

  UPDATE public.notificaciones n
  SET visto_por = array_append(n.visto_por, auth.uid()), actualizado_en = now()
  WHERE n.id = p_notificacion_id
    AND NOT (auth.uid() = ANY(n.visto_por))
    AND EXISTS (
      SELECT 1 FROM unnest(n.destinatario_roles) AS rol
      WHERE public.has_role(auth.uid(), rol)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.descartar_notificacion_venta_maquina(p_notificacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  UPDATE public.notificaciones
  SET estado = 'descartada', accionada_por = auth.uid(), accionada_en = now(), actualizado_en = now()
  WHERE id = p_notificacion_id
    AND tipo = 'venta_maquina_sin_parque'
    AND estado = 'pendiente';
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_notificacion_alta_maquina(
  p_notificacion_id uuid,
  p_cliente_id uuid,
  p_marca public.marca,
  p_subgrupo public.subgrupo_maquina,
  p_modelo_tipo text,
  p_serie text,
  p_anio integer DEFAULT NULL,
  p_sucursal public.sucursal DEFAULT NULL,
  p_localidad text DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notificacion public.notificaciones%ROWTYPE;
  v_maquina_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN RAISE EXCEPTION 'Acceso denegado'; END IF;

  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'Selecciona un cliente'; END IF;
  IF public.normalizar_chasis_notificacion(p_serie) IS NULL THEN RAISE EXCEPTION 'El chasis es obligatorio'; END IF;
  IF p_marca NOT IN ('CLAAS'::public.marca, 'HORSCH'::public.marca) THEN
    RAISE EXCEPTION 'La marca debe ser CLAAS o HORSCH';
  END IF;

  SELECT * INTO v_notificacion
  FROM public.notificaciones
  WHERE id = p_notificacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_notificacion.tipo <> 'venta_maquina_sin_parque' THEN
    RAISE EXCEPTION 'Notificacion no encontrada';
  END IF;
  IF v_notificacion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La notificacion ya fue resuelta';
  END IF;

  SELECT pm.id INTO v_maquina_id
  FROM public.parque_maquinas pm
  WHERE public.normalizar_chasis_notificacion(pm.serie) = public.normalizar_chasis_notificacion(p_serie)
  LIMIT 1;

  IF v_maquina_id IS NULL THEN
    INSERT INTO public.parque_maquinas (
      cliente_id, marca, subgrupo, modelo_tipo, serie, anio, sucursal,
      localidad, vendedor, notas, agregado_manualmente, activo
    ) VALUES (
      p_cliente_id, p_marca, p_subgrupo, nullif(btrim(p_modelo_tipo), ''), btrim(p_serie),
      p_anio, p_sucursal, nullif(btrim(p_localidad), ''), nullif(btrim(p_vendedor), ''),
      nullif(btrim(p_notas), ''), false, true
    )
    RETURNING id INTO v_maquina_id;
  END IF;

  UPDATE public.notificaciones
  SET estado = 'confirmada',
      accionada_por = auth.uid(),
      accionada_en = now(),
      actualizado_en = now(),
      datos = datos || jsonb_build_object('maquina_id', v_maquina_id)
  WHERE id = p_notificacion_id;

  RETURN v_maquina_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_notificaciones_maquina_existente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.notificaciones
  SET estado = 'confirmada',
      accionada_en = coalesce(accionada_en, now()),
      actualizado_en = now(),
      datos = datos || jsonb_build_object('maquina_id', NEW.id)
  WHERE tipo = 'venta_maquina_sin_parque'
    AND estado = 'pendiente'
    AND public.normalizar_chasis_notificacion(datos ->> 'chasis') = public.normalizar_chasis_notificacion(NEW.serie);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolver_notificaciones_maquina_existente_trigger ON public.parque_maquinas;
CREATE TRIGGER resolver_notificaciones_maquina_existente_trigger
AFTER INSERT OR UPDATE OF serie ON public.parque_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.resolver_notificaciones_maquina_existente();

REVOKE ALL ON FUNCTION public.generar_notificacion_venta_maquina(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detectar_venta_maquina_notificacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolver_notificaciones_maquina_existente() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notificaciones_marcar_vista(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.descartar_notificacion_venta_maquina(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.notificaciones_marcar_vista(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_notificacion_venta_maquina(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_notificacion_alta_maquina(
  uuid, uuid, public.marca, public.subgrupo_maquina, text, text, integer,
  public.sucursal, text, text, text
) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notificaciones'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END;
$$;

-- Backfill acotado al sistema nuevo. La funcion ignora lineas que no son
-- maquinas representadas, no tienen chasis o ya existen en el parque.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.facturacion_lineas_importadas
    WHERE fecha_factura >= timestamptz '2026-07-01 00:00:00+00'
      AND left(origen_sistema, 4) = 'new_'
      AND coalesce(cantidad, 0) > 0
      AND coalesce(total_venta, 0) > 0
      AND (
        upper(coalesce(grupo_normalizado, '')) = 'MAQUINARIAS'
        OR upper(coalesce(raw_data ->> 'canonical_line_type', '')) = 'MAQUINARIAS'
        OR left(upper(coalesce(cod_mercaderia, '')), 5) = 'VEIC_'
        OR concat_ws(' | ', mercaderia, observacion, subgrupo_original)
          ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:'
      )
  LOOP
    PERFORM public.generar_notificacion_venta_maquina(v_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
