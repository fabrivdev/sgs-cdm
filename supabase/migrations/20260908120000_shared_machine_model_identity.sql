-- One model identity for Parque, Pedidos (including other brands) and Importaciones.
-- Historical text is retained during backfill. No machine, order or invoice is deleted.

-- Excepcion explicita y auditable al guardrail de digitos de mas abajo: estos
-- 3 alias ya estaban cargados en parque_modelos_alias y ya fueron verificados
-- a mano por el usuario -- son el mismo modelo fisico, solo que con una
-- grafia distinta en digitos (LEEB / LEEB 5250 -> LEEB 5280 VL; DAKAR 10 VF
-- 60 17 -> DAKAR 10 CF). El guardrail sigue estricto para cualquier otro
-- alias, presente o futuro (revisado_manual default false). No hace falta
-- tocar el paso de retiro de duplicados mas abajo: estas 3 grafias ya estan
-- activo=false en el catalogo.
ALTER TABLE public.parque_modelos_alias
  ADD COLUMN IF NOT EXISTS revisado_manual boolean NOT NULL DEFAULT false;

UPDATE public.parque_modelos_alias
SET revisado_manual = true
WHERE (marca = 'HORSCH' AND clave_alias = public.parque_modelo_clave('LEEB'))
   OR (marca = 'HORSCH' AND clave_alias = public.parque_modelo_clave('LEEB 5250'))
   OR (marca = 'HORSCH' AND clave_alias = public.parque_modelo_clave('DAKAR 10 VF 60 17'));

CREATE OR REPLACE FUNCTION public.maquinaria_resolver_modelo_catalogo(
  p_marca text, p_subgrupo public.subgrupo_maquina, p_nombre text
) RETURNS uuid LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH exactos AS (
    SELECT c.id, c.subgrupo FROM public.parque_modelos_catalogo c
    WHERE c.marca_nombre = public.maquinaria_normalizar_marca(p_marca) AND c.activo
      AND c.clave_normalizada = public.parque_modelo_clave(p_nombre)
      AND public.parque_modelo_clave(p_nombre) <> ''
  ), candidatos AS (
    SELECT * FROM exactos
    UNION
    SELECT c.id, c.subgrupo
    FROM public.parque_modelos_alias a
    JOIN public.parque_modelos_catalogo c ON c.id = a.modelo_catalogo_id
    WHERE NOT EXISTS (SELECT 1 FROM exactos)
      AND a.marca::text = public.maquinaria_normalizar_marca(p_marca)
      AND c.marca_nombre = public.maquinaria_normalizar_marca(p_marca) AND c.activo
      AND a.clave_alias = public.parque_modelo_clave(p_nombre)
      AND public.parque_modelo_clave(p_nombre) <> ''
      -- Do not convert LEEB, LEEB 5250 or LEEB 6.280 into a 5280 --
      -- salvo alias revisados a mano explicitamente (revisado_manual).
      AND (
        regexp_replace(public.parque_modelo_clave(a.alias), '[^0-9]', '', 'g')
          = regexp_replace(c.clave_normalizada, '[^0-9]', '', 'g')
        OR a.revisado_manual
      )
  ), preferidos AS (
    SELECT * FROM candidatos WHERE subgrupo = p_subgrupo
  )
  SELECT CASE WHEN (SELECT count(*) FROM preferidos) = 1 THEN (SELECT id FROM preferidos LIMIT 1)
    WHEN (SELECT count(*) FROM candidatos) = 1 THEN (SELECT id FROM candidatos LIMIT 1)
    ELSE NULL END;
$$;

-- Retire only duplicate spellings with an existing, safe, reviewed alias.
-- Both the old catalog row and historical documents remain recoverable.
UPDATE public.parque_modelos_catalogo old_model SET activo = false, actualizado_en = now()
WHERE old_model.activo AND EXISTS (
  SELECT 1 FROM public.parque_modelos_alias a
  JOIN public.parque_modelos_catalogo target ON target.id = a.modelo_catalogo_id
  WHERE old_model.marca_nombre IN ('CLAAS','HORSCH')
    AND a.marca::text = old_model.marca_nombre AND target.marca_nombre = old_model.marca_nombre
    AND a.clave_alias = old_model.clave_normalizada AND target.activo
    AND target.clave_normalizada <> old_model.clave_normalizada
    AND regexp_replace(a.clave_alias,'[^0-9]','','g') = regexp_replace(target.clave_normalizada,'[^0-9]','','g')
    AND NOT EXISTS (SELECT 1 FROM public.parque_modelos_alias other_alias
      WHERE other_alias.marca = a.marca AND other_alias.clave_alias = a.clave_alias
        AND other_alias.modelo_catalogo_id <> a.modelo_catalogo_id)
);

-- Fill missing catalog entries from the actual CLAAS/HORSCH Parque.
-- An explicitly retired model is NOT restored by this reconciliation.
INSERT INTO public.parque_modelos_catalogo(marca,marca_nombre,subgrupo,nombre,clave_normalizada)
SELECT p.brand::public.marca, p.brand, p.subgrupo, min(upper(btrim(p.modelo_tipo))), public.parque_modelo_clave(p.modelo_tipo)
FROM (SELECT *, coalesce(marca_nombre,marca::text) AS brand FROM public.parque_maquinas) p
WHERE p.brand IN ('CLAAS','HORSCH') AND p.subgrupo IS NOT NULL
  AND public.parque_modelo_clave(p.modelo_tipo) <> ''
  AND public.maquinaria_resolver_modelo_catalogo(p.brand,p.subgrupo,p.modelo_tipo) IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.parque_modelos_catalogo retired
    WHERE retired.marca_nombre = p.brand AND retired.clave_normalizada = public.parque_modelo_clave(p.modelo_tipo) AND NOT retired.activo)
GROUP BY p.brand,p.subgrupo,public.parque_modelo_clave(p.modelo_tipo)
ON CONFLICT(marca_nombre,subgrupo,clave_normalizada) DO NOTHING;

CREATE OR REPLACE FUNCTION public.maquinaria_registrar_modelo_catalogo(p_marca text, p_subgrupo public.subgrupo_maquina, p_nombre text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_nombre text; v_marca text := public.maquinaria_normalizar_marca(p_marca);
  v_clave text := public.parque_modelo_clave(p_nombre);
BEGIN
  IF v_clave = '' OR v_marca IS NULL OR v_marca = 'OTROS' THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_marca || ':' || v_clave, 708));
  v_id := public.maquinaria_resolver_modelo_catalogo(v_marca,p_subgrupo,p_nombre);
  IF v_id IS NOT NULL THEN SELECT nombre INTO v_nombre FROM public.parque_modelos_catalogo WHERE id=v_id; RETURN v_nombre; END IF;
  IF EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE marca_nombre=v_marca AND clave_normalizada=v_clave AND activo) THEN
    RAISE EXCEPTION 'El modelo figura en varios tipos. Seleccioná el tipo correcto del catálogo';
  END IF;
  INSERT INTO public.parque_modelos_catalogo(marca,marca_nombre,subgrupo,nombre,clave_normalizada)
  VALUES(CASE v_marca WHEN 'CLAAS' THEN 'CLAAS'::public.marca WHEN 'HORSCH' THEN 'HORSCH'::public.marca ELSE 'OTROS'::public.marca END,
    v_marca,p_subgrupo,upper(btrim(p_nombre)),v_clave)
  ON CONFLICT(marca_nombre,subgrupo,clave_normalizada) DO NOTHING;
  SELECT nombre INTO v_nombre FROM public.parque_modelos_catalogo
  WHERE marca_nombre=v_marca AND subgrupo=p_subgrupo AND clave_normalizada=v_clave;
  RETURN v_nombre;
END; $$;

ALTER TABLE public.parque_maquinas ADD COLUMN IF NOT EXISTS modelo_catalogo_id uuid REFERENCES public.parque_modelos_catalogo(id);
ALTER TABLE public.maquinaria_operacion_lineas ADD COLUMN IF NOT EXISTS modelo_catalogo_id uuid REFERENCES public.parque_modelos_catalogo(id);
ALTER TABLE public.maquinaria_importacion_lineas ADD COLUMN IF NOT EXISTS modelo_catalogo_id uuid REFERENCES public.parque_modelos_catalogo(id);
CREATE INDEX IF NOT EXISTS parque_maquinas_modelo_catalogo_idx ON public.parque_maquinas(modelo_catalogo_id);
CREATE INDEX IF NOT EXISTS maquinaria_operacion_modelo_catalogo_idx ON public.maquinaria_operacion_lineas(modelo_catalogo_id);
CREATE INDEX IF NOT EXISTS maquinaria_importacion_modelo_catalogo_idx ON public.maquinaria_importacion_lineas(modelo_catalogo_id);

-- Link only unambiguous identities; don't alter the original historical spelling or type.
UPDATE public.parque_maquinas SET modelo_catalogo_id=public.maquinaria_resolver_modelo_catalogo(coalesce(marca_nombre,marca::text),subgrupo,modelo_tipo);
UPDATE public.maquinaria_operacion_lineas SET modelo_catalogo_id=public.maquinaria_resolver_modelo_catalogo(coalesce(marca_nombre,marca::text),subgrupo,modelo);
UPDATE public.maquinaria_importacion_lineas SET modelo_catalogo_id=public.maquinaria_resolver_modelo_catalogo(coalesce(marca_nombre,proveedor,marca_importacion::text),subgrupo,modelo);

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_identidad_modelo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_brand text; v_name text; v_old_brand text; v_old_name text; v_id uuid;
  v_model public.parque_modelos_catalogo%ROWTYPE; v_preserved boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'parque_maquinas' THEN
    v_brand := coalesce(NEW.marca_nombre,nullif(NEW.marca::text,'OTROS')); v_name := NEW.modelo_tipo;
    IF TG_OP='UPDATE' THEN v_old_brand:=coalesce(OLD.marca_nombre,nullif(OLD.marca::text,'OTROS')); v_old_name:=OLD.modelo_tipo; END IF;
  ELSIF TG_TABLE_NAME = 'maquinaria_operacion_lineas' THEN
    v_brand := coalesce(NEW.marca_nombre,NEW.datos_extraidos->>'marca_real',nullif(NEW.marca::text,'OTROS')); v_name:=NEW.modelo;
    IF TG_OP='INSERT' THEN v_brand:=coalesce(NEW.datos_extraidos->>'marca_real',v_brand);
    ELSIF NEW.datos_extraidos->>'marca_real' IS DISTINCT FROM OLD.datos_extraidos->>'marca_real' THEN v_brand:=NEW.datos_extraidos->>'marca_real'; END IF;
    IF TG_OP='UPDATE' THEN v_old_brand:=coalesce(OLD.marca_nombre,nullif(OLD.marca::text,'OTROS')); v_old_name:=OLD.modelo; END IF;
  ELSE
    v_brand:=coalesce(NEW.marca_nombre,nullif(NEW.proveedor,'OTROS'),nullif(NEW.marca_importacion::text,'OTROS')); v_name:=NEW.modelo;
    IF TG_OP='UPDATE' THEN v_old_brand:=coalesce(OLD.marca_nombre,nullif(OLD.proveedor,'OTROS'),nullif(OLD.marca_importacion::text,'OTROS')); v_old_name:=OLD.modelo; END IF;
  END IF;
  v_brand:=public.maquinaria_normalizar_marca(v_brand);
  IF TG_OP='UPDATE' THEN
    v_preserved:=v_brand IS NOT DISTINCT FROM public.maquinaria_normalizar_marca(v_old_brand)
      AND public.parque_modelo_clave(v_name)=public.parque_modelo_clave(v_old_name) AND NEW.subgrupo IS NOT DISTINCT FROM OLD.subgrupo;
  END IF;
  v_id:=public.maquinaria_resolver_modelo_catalogo(v_brand,NEW.subgrupo,v_name);
  IF v_id IS NULL AND v_preserved AND TG_OP='UPDATE' THEN
    -- A soft-retired identity is still the identity of the historical machine.
    SELECT id INTO v_id FROM public.parque_modelos_catalogo
    WHERE id=OLD.modelo_catalogo_id AND marca_nombre=v_brand;
  END IF;
  IF TG_ARGV[0]='register' AND v_id IS NULL AND public.parque_modelo_clave(v_name)<>'' THEN
    IF NOT v_preserved AND EXISTS(SELECT 1 FROM public.parque_modelos_catalogo WHERE marca_nombre=v_brand
      AND clave_normalizada=public.parque_modelo_clave(v_name) AND NOT activo) THEN
      RAISE EXCEPTION 'El modelo fue eliminado del listado. Restauralo o seleccioná otro';
    END IF;
    NEW.subgrupo:=coalesce(NEW.subgrupo,'OTRO'::public.subgrupo_maquina);
    PERFORM public.maquinaria_registrar_modelo_catalogo(v_brand,NEW.subgrupo,v_name);
    v_id:=public.maquinaria_resolver_modelo_catalogo(v_brand,NEW.subgrupo,v_name);
  END IF;
  NEW.modelo_catalogo_id:=v_id;
  IF v_id IS NOT NULL THEN
    IF NOT v_preserved AND EXISTS(SELECT 1 FROM public.maquinaria_marcas_catalogo WHERE nombre=v_brand AND NOT activa) THEN
      RAISE EXCEPTION 'La marca fue eliminada del listado. Restaurala o seleccioná otra';
    END IF;
    SELECT * INTO v_model FROM public.parque_modelos_catalogo WHERE id=v_id;
    NEW.subgrupo:=v_model.subgrupo;
    IF TG_TABLE_NAME='parque_maquinas' THEN NEW.modelo_tipo:=v_model.nombre;
    ELSE NEW.modelo:=v_model.nombre; END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Resolve BEFORE legacy validation/registration, then link AFTER legacy brand preparation.
CREATE TRIGGER a0_resolver_modelo_catalogo BEFORE INSERT OR UPDATE OF marca,marca_nombre,subgrupo,modelo_tipo,modelo_catalogo_id ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('resolve');
CREATE TRIGGER zz_vincular_modelo_catalogo BEFORE INSERT OR UPDATE OF marca,marca_nombre,subgrupo,modelo_tipo,modelo_catalogo_id ON public.parque_maquinas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('register');
CREATE TRIGGER a0_resolver_modelo_catalogo BEFORE INSERT OR UPDATE OF marca,marca_nombre,datos_extraidos,producto,subgrupo,modelo,modelo_catalogo_id ON public.maquinaria_operacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('resolve');
CREATE TRIGGER zz_vincular_modelo_catalogo BEFORE INSERT OR UPDATE OF marca,marca_nombre,datos_extraidos,producto,subgrupo,modelo,modelo_catalogo_id ON public.maquinaria_operacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('register');
CREATE TRIGGER a0_resolver_modelo_catalogo BEFORE INSERT OR UPDATE OF marca_importacion,marca_nombre,proveedor,linea_id,producto,subgrupo,modelo,modelo_catalogo_id ON public.maquinaria_importacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('resolve');
CREATE TRIGGER zz_vincular_modelo_catalogo BEFORE INSERT OR UPDATE OF marca_importacion,marca_nombre,proveedor,linea_id,producto,subgrupo,modelo,modelo_catalogo_id ON public.maquinaria_importacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_sincronizar_identidad_modelo('register');

REVOKE ALL ON FUNCTION public.maquinaria_sincronizar_identidad_modelo() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.maquinaria_resolver_modelo_catalogo(text,public.subgrupo_maquina,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_resolver_modelo_catalogo(text,public.subgrupo_maquina,text) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Verificacion: debe dar 3 (LEEB, LEEB 5250, DAKAR 10 VF 60 17)
select count(*) as alias_revisados_manualmente from public.parque_modelos_alias where revisado_manual;
