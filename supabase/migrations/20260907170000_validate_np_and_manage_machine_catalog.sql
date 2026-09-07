-- Normalización de cargas y mantenimiento recuperable del catálogo.
CREATE OR REPLACE FUNCTION public.maquinaria_np_canonica(p_numero text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text := upper(btrim(coalesce(p_numero, '')));
BEGIN
  IF v !~ '^(NP[[:space:]]*[- ]?[[:space:]]*)?[0-9]+$' THEN RETURN NULL; END IF;
  v := regexp_replace(v, '^NP[[:space:]]*[- ]?[[:space:]]*', '');
  v := coalesce(nullif(ltrim(v, '0'), ''), '0');
  IF length(v) > 4 THEN RETURN NULL; END IF;
  RETURN 'NP' || lpad(v, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.maquinaria_normalizar_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_np text;
BEGIN
  v_np := public.maquinaria_np_canonica(NEW.np_numero);
  IF v_np IS NULL THEN RAISE EXCEPTION 'La NP debe tener el formato NP0000, con cuatro números'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_np, 701));
  IF EXISTS (SELECT 1 FROM public.maquinaria_operaciones o
    WHERE o.id <> NEW.id AND public.maquinaria_np_canonica(o.np_numero) = v_np) THEN
    RAISE EXCEPTION 'Ya existe el pedido %. Revisá el número antes de guardar', v_np;
  END IF;
  NEW.np_numero := v_np;
  NEW.cliente_nombre := upper(btrim(NEW.cliente_nombre));
  NEW.comercial := upper(btrim(NEW.comercial));
  NEW.observaciones := upper(btrim(NEW.observaciones));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS maquinaria_normalizar_pedido_trigger ON public.maquinaria_operaciones;
CREATE TRIGGER maquinaria_normalizar_pedido_trigger
BEFORE INSERT OR UPDATE OF np_numero, cliente_nombre, comercial, observaciones ON public.maquinaria_operaciones
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_normalizar_pedido();

-- No reactivar elementos retirados al editar una máquina histórica.
CREATE OR REPLACE FUNCTION public.maquinaria_registrar_marca_catalogo(p_marca text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text := public.maquinaria_normalizar_marca(p_marca);
BEGIN
  IF v_nombre IS NULL OR v_nombre = 'OTROS' THEN RETURN NULL; END IF;
  INSERT INTO public.maquinaria_marcas_catalogo(nombre, creado_por)
  VALUES(v_nombre, auth.uid()) ON CONFLICT(nombre) DO NOTHING;
  RETURN v_nombre;
END; $$;

CREATE OR REPLACE FUNCTION public.maquinaria_registrar_modelo_catalogo(p_marca text, p_subgrupo public.subgrupo_maquina, p_nombre text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_clave text := public.parque_modelo_clave(p_nombre); v_nombre text;
BEGIN
  IF v_clave = '' OR p_marca IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.parque_modelos_catalogo(marca,marca_nombre,subgrupo,nombre,clave_normalizada)
  VALUES(CASE p_marca WHEN 'CLAAS' THEN 'CLAAS'::public.marca WHEN 'HORSCH' THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END,
    p_marca,p_subgrupo,upper(btrim(p_nombre)),v_clave)
  ON CONFLICT(marca_nombre,subgrupo,clave_normalizada) DO NOTHING;
  SELECT nombre INTO v_nombre FROM public.parque_modelos_catalogo
  WHERE marca_nombre = p_marca AND subgrupo = p_subgrupo AND clave_normalizada = v_clave;
  RETURN v_nombre;
END; $$;

CREATE OR REPLACE FUNCTION public.maquinaria_normalizar_linea_catalogo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_identidad_anterior boolean := false;
BEGIN
  -- Los RPC anteriores envían la marca extensible en datos_extraidos.
  IF TG_OP = 'INSERT' THEN
    NEW.marca_nombre := coalesce(NEW.datos_extraidos->>'marca_real', NEW.marca_nombre, nullif(NEW.marca::text,'OTROS'));
  ELSIF (NEW.datos_extraidos->>'marca_real') IS DISTINCT FROM (OLD.datos_extraidos->>'marca_real') THEN
    NEW.marca_nombre := NEW.datos_extraidos->>'marca_real';
  END IF;
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(NEW.marca_nombre);
  NEW.producto := upper(btrim(NEW.producto));
  NEW.modelo := upper(btrim(NEW.modelo));
  IF TG_OP = 'UPDATE' THEN
    v_identidad_anterior := NEW.marca_nombre IS NOT DISTINCT FROM OLD.marca_nombre
      AND NEW.subgrupo IS NOT DISTINCT FROM OLD.subgrupo
      AND public.parque_modelo_clave(NEW.modelo) = public.parque_modelo_clave(OLD.modelo);
  END IF;
  IF NOT v_identidad_anterior AND (
    EXISTS(SELECT 1 FROM public.maquinaria_marcas_catalogo WHERE nombre=NEW.marca_nombre AND NOT activa)
    OR EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE marca_nombre=NEW.marca_nombre
      AND subgrupo=NEW.subgrupo AND clave_normalizada=public.parque_modelo_clave(NEW.modelo) AND NOT activo)
  ) THEN RAISE EXCEPTION 'La marca o el modelo fue eliminado del listado. Seleccioná otro o restauralo en el catálogo'; END IF;
  IF nullif(btrim(NEW.modelo),'') IS NOT NULL THEN
    NEW.modelo := coalesce(public.maquinaria_registrar_modelo_catalogo(NEW.marca_nombre,NEW.subgrupo,NEW.modelo), NEW.modelo);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS aa_maquinaria_normalizar_linea_catalogo ON public.maquinaria_operacion_lineas;
CREATE TRIGGER aa_maquinaria_normalizar_linea_catalogo
BEFORE INSERT OR UPDATE OF marca,marca_nombre,datos_extraidos,modelo,producto,subgrupo ON public.maquinaria_operacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_normalizar_linea_catalogo();

CREATE OR REPLACE FUNCTION public.sincronizar_modelo_maquina_catalogo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.marca_nombre := public.maquinaria_registrar_marca_catalogo(coalesce(NEW.marca_nombre,nullif(NEW.marca::text,'OTROS')));
  NEW.modelo_tipo := public.maquinaria_registrar_modelo_catalogo(NEW.marca_nombre,NEW.subgrupo,NEW.modelo_tipo);
  RETURN NEW;
END; $$;

-- Una edición de identidad crea la nueva opción y conserva la anterior
-- inactiva para que los documentos históricos no cambien ni la recreen.
CREATE OR REPLACE FUNCTION public.maquinaria_gestionar_catalogo(
  p_tipo text, p_id text, p_accion text, p_nombre text DEFAULT NULL, p_subgrupo text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nombre text := public.maquinaria_normalizar_marca(p_nombre);
  v_modelo public.parque_modelos_catalogo%ROWTYPE;
  v_subgrupo public.subgrupo_maquina;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'superadmin'::public.app_role)) THEN
    RAISE EXCEPTION 'Solo administración puede editar el catálogo' USING ERRCODE='42501';
  END IF;
  IF p_tipo NOT IN ('marca','modelo') OR p_accion NOT IN ('editar','eliminar','restaurar') THEN RAISE EXCEPTION 'Acción no válida'; END IF;
  IF p_accion='editar' AND (v_nombre IS NULL OR v_nombre IN ('OTROS','SIN MARCA') OR length(v_nombre)>120) THEN RAISE EXCEPTION 'Escribí un nombre válido de hasta 120 caracteres'; END IF;
  IF p_tipo='marca' THEN
    PERFORM 1 FROM public.maquinaria_marcas_catalogo WHERE nombre=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La marca no existe'; END IF;
    IF p_accion='editar' AND v_nombre<>p_id THEN
      IF EXISTS(SELECT 1 FROM public.maquinaria_marcas_catalogo WHERE nombre=v_nombre) THEN RAISE EXCEPTION 'Ese nombre ya existe en el catálogo, incluso entre los eliminados'; END IF;
      INSERT INTO public.maquinaria_marcas_catalogo(nombre,creado_por) VALUES(v_nombre,auth.uid());
      INSERT INTO public.parque_modelos_catalogo(marca,marca_nombre,subgrupo,nombre,clave_normalizada,activo)
      SELECT CASE v_nombre WHEN 'CLAAS' THEN 'CLAAS'::public.marca WHEN 'HORSCH' THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END,
        v_nombre,subgrupo,nombre,clave_normalizada,activo FROM public.parque_modelos_catalogo WHERE marca_nombre=p_id;
      UPDATE public.maquinaria_marcas_catalogo SET activa=false,actualizado_en=now() WHERE nombre=p_id;
    ELSIF p_accion IN ('eliminar','restaurar') THEN
      UPDATE public.maquinaria_marcas_catalogo SET activa=(p_accion='restaurar'),actualizado_en=now() WHERE nombre=p_id;
    END IF;
  ELSE
    SELECT * INTO v_modelo FROM public.parque_modelos_catalogo WHERE id=p_id::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El modelo no existe'; END IF;
    IF p_accion='editar' THEN
      v_subgrupo := coalesce(p_subgrupo::public.subgrupo_maquina,v_modelo.subgrupo);
      IF v_modelo.clave_normalizada=public.parque_modelo_clave(v_nombre) AND v_subgrupo=v_modelo.subgrupo THEN
        UPDATE public.parque_modelos_catalogo SET nombre=v_nombre,actualizado_en=now() WHERE id=v_modelo.id;
      ELSE
        IF EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE marca_nombre=v_modelo.marca_nombre
          AND subgrupo=v_subgrupo AND clave_normalizada=public.parque_modelo_clave(v_nombre)) THEN RAISE EXCEPTION 'Ese modelo ya existe en el catálogo, incluso entre los eliminados'; END IF;
        INSERT INTO public.parque_modelos_catalogo(marca,marca_nombre,subgrupo,nombre,clave_normalizada)
        VALUES(v_modelo.marca,v_modelo.marca_nombre,v_subgrupo,v_nombre,public.parque_modelo_clave(v_nombre));
        UPDATE public.parque_modelos_catalogo SET activo=false,actualizado_en=now() WHERE id=v_modelo.id;
      END IF;
    ELSE
      UPDATE public.parque_modelos_catalogo SET activo=(p_accion='restaurar'),actualizado_en=now() WHERE id=v_modelo.id;
    END IF;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.maquinaria_gestionar_catalogo(text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_gestionar_catalogo(text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_registrar_modelo_catalogo(text,public.subgrupo_maquina,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_normalizar_linea_catalogo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_normalizar_pedido() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
