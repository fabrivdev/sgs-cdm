-- Catálogo dependiente Marca -> Tipo de maquinaria -> Modelo.
-- La clave normalizada unifica variantes obvias de mayúsculas, acentos,
-- espacios y separadores sin intentar fusionar modelos numéricamente distintos.

CREATE OR REPLACE FUNCTION public.parque_modelo_clave(p_modelo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(
    translate(upper(trim(coalesce(p_modelo, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
    '[^A-Z0-9]+',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.parque_modelo_nombre(p_modelo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(
      translate(upper(trim(coalesce(p_modelo, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+',
      ' ',
      'g'
    ),
    ''
  );
$$;

CREATE TABLE IF NOT EXISTS public.parque_modelos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca public.marca NOT NULL,
  subgrupo public.subgrupo_maquina NOT NULL,
  nombre text NOT NULL,
  clave_normalizada text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parque_modelos_catalogo_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT parque_modelos_catalogo_clave_no_vacia CHECK (btrim(clave_normalizada) <> ''),
  CONSTRAINT parque_modelos_catalogo_unique UNIQUE (marca, subgrupo, clave_normalizada)
);

CREATE INDEX IF NOT EXISTS idx_parque_modelos_catalogo_filtros
  ON public.parque_modelos_catalogo (marca, subgrupo, activo, nombre);

WITH variantes AS (
  SELECT
    pm.marca,
    pm.subgrupo,
    public.parque_modelo_clave(pm.modelo_tipo) AS clave,
    public.parque_modelo_nombre(pm.modelo_tipo) AS nombre,
    count(*) AS cantidad
  FROM public.parque_maquinas pm
  WHERE public.parque_modelo_clave(pm.modelo_tipo) <> ''
  GROUP BY pm.marca, pm.subgrupo, clave, nombre
), canonicos AS (
  SELECT DISTINCT ON (marca, subgrupo, clave)
    marca,
    subgrupo,
    clave,
    nombre
  FROM variantes
  ORDER BY marca, subgrupo, clave, cantidad DESC, length(nombre), nombre
)
INSERT INTO public.parque_modelos_catalogo (marca, subgrupo, nombre, clave_normalizada)
SELECT marca, subgrupo, nombre, clave
FROM canonicos
ON CONFLICT (marca, subgrupo, clave_normalizada) DO UPDATE
SET activo = true,
    actualizado_en = now();

UPDATE public.parque_maquinas pm
SET modelo_tipo = catalogo.nombre,
    actualizado_en = now()
FROM public.parque_modelos_catalogo catalogo
WHERE catalogo.marca = pm.marca
  AND catalogo.subgrupo = pm.subgrupo
  AND catalogo.clave_normalizada = public.parque_modelo_clave(pm.modelo_tipo)
  AND pm.modelo_tipo IS DISTINCT FROM catalogo.nombre;

CREATE OR REPLACE FUNCTION public.sincronizar_modelo_maquina_catalogo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clave text;
  v_nombre text;
  v_canonico text;
BEGIN
  v_clave := public.parque_modelo_clave(NEW.modelo_tipo);
  IF v_clave = '' THEN
    NEW.modelo_tipo := NULL;
    RETURN NEW;
  END IF;

  v_nombre := public.parque_modelo_nombre(NEW.modelo_tipo);

  INSERT INTO public.parque_modelos_catalogo (
    marca, subgrupo, nombre, clave_normalizada, activo, actualizado_en
  ) VALUES (
    NEW.marca, NEW.subgrupo, v_nombre, v_clave, true, now()
  )
  ON CONFLICT (marca, subgrupo, clave_normalizada) DO UPDATE
  SET activo = true,
      actualizado_en = now()
  RETURNING parque_modelos_catalogo.nombre INTO v_canonico;

  NEW.modelo_tipo := v_canonico;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_modelo_maquina_catalogo ON public.parque_maquinas;
CREATE TRIGGER trg_sincronizar_modelo_maquina_catalogo
BEFORE INSERT OR UPDATE OF marca, subgrupo, modelo_tipo
ON public.parque_maquinas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_modelo_maquina_catalogo();

ALTER TABLE public.parque_modelos_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalogo modelos select authenticated" ON public.parque_modelos_catalogo;
CREATE POLICY "Catalogo modelos select authenticated"
ON public.parque_modelos_catalogo
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Catalogo modelos admin write" ON public.parque_modelos_catalogo;
CREATE POLICY "Catalogo modelos admin write"
ON public.parque_modelos_catalogo
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.parque_modelos_catalogo TO authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_modelo_maquina_catalogo() FROM PUBLIC;
