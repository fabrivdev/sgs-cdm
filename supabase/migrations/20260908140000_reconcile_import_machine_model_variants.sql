-- Reconcile real model variants that exist in Importaciones but were omitted
-- by the original shared-catalog backfill (which only sourced Parque).
--
-- This migration deliberately uses exact normalized names only. It does not
-- create fuzzy aliases, merge different digit sequences, reactivate retired
-- entries, or rewrite the historical model text stored in source rows.

-- NB MAQUINAS is a historical spelling of the active NB brand. Keep supplier
-- and extracted source text intact, but use NB as the shared catalog identity.
INSERT INTO public.maquinaria_marcas_catalogo (nombre, activa)
VALUES ('NB', true)
ON CONFLICT (nombre) DO UPDATE
SET activa = true, actualizado_en = now();

UPDATE public.maquinaria_importacion_lineas
SET marca_nombre = 'NB'
WHERE public.maquinaria_normalizar_marca(
  coalesce(marca_nombre, nullif(proveedor, 'OTROS'), nullif(marca_importacion::text, 'OTROS'))
) = 'NB MAQUINAS';

UPDATE public.maquinaria_operacion_lineas
SET marca_nombre = 'NB'
WHERE public.maquinaria_normalizar_marca(
  coalesce(marca_nombre, datos_extraidos ->> 'marca_real', nullif(marca::text, 'OTROS'))
) = 'NB MAQUINAS';

UPDATE public.parque_maquinas
SET marca_nombre = 'NB'
WHERE public.maquinaria_normalizar_marca(coalesce(marca_nombre, marca::text)) = 'NB MAQUINAS';

UPDATE public.parque_modelos_catalogo old_brand
SET marca_nombre = 'NB', marca = 'OTROS'::public.marca, actualizado_en = now()
WHERE old_brand.marca_nombre = 'NB MAQUINAS'
  AND NOT EXISTS (
    SELECT 1
    FROM public.parque_modelos_catalogo canonical_brand
    WHERE canonical_brand.marca_nombre = 'NB'
      AND canonical_brand.subgrupo = old_brand.subgrupo
      AND canonical_brand.clave_normalizada = old_brand.clave_normalizada
  );

DELETE FROM public.maquinaria_marcas_catalogo
WHERE nombre = 'NB MAQUINAS';

CREATE OR REPLACE FUNCTION public.maquinaria_normalizar_marca(p_marca text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE normalized
    WHEN 'NB MAQUINAS' THEN 'NB'
    ELSE normalized
  END
  FROM (
    SELECT nullif(regexp_replace(upper(btrim(coalesce(p_marca, ''))), '\s+', ' ', 'g'), '') AS normalized
  ) value;
$$;

-- A trailing + is part of the confirmed JOKER model name. Preserve it as
-- PLUS in the comparison key so it cannot collapse into JOKER 7 RT.
CREATE OR REPLACE FUNCTION public.parque_modelo_clave(p_modelo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(
    replace(upper(coalesce(p_modelo, '')), '+', ' PLUS '),
    '[^A-Z0-9]+',
    '',
    'g'
  );
$$;

UPDATE public.parque_modelos_catalogo
SET clave_normalizada = public.parque_modelo_clave(nombre), actualizado_en = now()
WHERE nombre LIKE '%+%'
  AND clave_normalizada IS DISTINCT FROM public.parque_modelo_clave(nombre);

UPDATE public.parque_modelos_alias
SET clave_alias = public.parque_modelo_clave(alias)
WHERE alias LIKE '%+%'
  AND clave_alias IS DISTINCT FROM public.parque_modelo_clave(alias);

-- DAKAR 8 CF is confirmed as a planter. Make SEMBRADORAS authoritative and
-- retire the conflicting SUELO catalog classification without deleting it.
INSERT INTO public.parque_modelos_catalogo (
  marca, marca_nombre, subgrupo, nombre, clave_normalizada, activo
)
VALUES (
  'HORSCH'::public.marca,
  'HORSCH',
  'SEMBRADORAS'::public.subgrupo_maquina,
  'DAKAR 8 CF',
  public.parque_modelo_clave('DAKAR 8 CF'),
  true
)
ON CONFLICT (marca_nombre, subgrupo, clave_normalizada) DO UPDATE
SET nombre = EXCLUDED.nombre, activo = true, actualizado_en = now();

UPDATE public.parque_modelos_catalogo
SET activo = (subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina),
    actualizado_en = now()
WHERE marca_nombre = 'HORSCH'
  AND clave_normalizada = public.parque_modelo_clave('DAKAR 8 CF')
  AND subgrupo IN (
    'SEMBRADORAS'::public.subgrupo_maquina,
    'SUELO'::public.subgrupo_maquina
  );

UPDATE public.maquinaria_importacion_lineas
SET subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
WHERE public.maquinaria_normalizar_marca(
    coalesce(marca_nombre, nullif(proveedor, 'OTROS'), nullif(marca_importacion::text, 'OTROS'))
  ) = 'HORSCH'
  AND public.parque_modelo_clave(modelo) = public.parque_modelo_clave('DAKAR 8 CF')
  AND subgrupo IS DISTINCT FROM 'SEMBRADORAS'::public.subgrupo_maquina;

UPDATE public.maquinaria_operacion_lineas
SET subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
WHERE public.maquinaria_normalizar_marca(
    coalesce(marca_nombre, datos_extraidos ->> 'marca_real', nullif(marca::text, 'OTROS'))
  ) = 'HORSCH'
  AND public.parque_modelo_clave(modelo) = public.parque_modelo_clave('DAKAR 8 CF')
  AND subgrupo IS DISTINCT FROM 'SEMBRADORAS'::public.subgrupo_maquina;

UPDATE public.parque_maquinas
SET subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
WHERE public.maquinaria_normalizar_marca(coalesce(marca_nombre, marca::text)) = 'HORSCH'
  AND public.parque_modelo_clave(modelo_tipo) = public.parque_modelo_clave('DAKAR 8 CF')
  AND subgrupo IS DISTINCT FROM 'SEMBRADORAS'::public.subgrupo_maquina;

-- Keep the established 5.280 identity, but display the commercial formatting
-- used by the source documents. The normalized key and catalog id stay stable.
UPDATE public.parque_modelos_catalogo
SET nombre = 'LEEB 5.280 VL', actualizado_en = now()
WHERE marca_nombre = 'HORSCH'
  AND subgrupo = 'PULVERIZADORAS'::public.subgrupo_maquina
  AND clave_normalizada = public.parque_modelo_clave('LEEB 5280 VL')
  AND activo
  AND nombre = 'LEEB 5280 VL';

-- The 36 m wording describes the imported configuration of the same 5.280 VL,
-- as confirmed by the user. Keep that wording in history and link by a reviewed
-- alias even though the extra width digits differ from the canonical key.
INSERT INTO public.parque_modelos_alias (
  marca, subgrupo, alias, clave_alias, modelo_catalogo_id, revisado_manual
)
SELECT
  'HORSCH'::public.marca,
  'PULVERIZADORAS'::public.subgrupo_maquina,
  'LEEB 5.280 - 36 M',
  public.parque_modelo_clave('LEEB 5.280 - 36 M'),
  c.id,
  true
FROM public.parque_modelos_catalogo c
WHERE c.marca_nombre = 'HORSCH'
  AND c.subgrupo = 'PULVERIZADORAS'::public.subgrupo_maquina
  AND c.clave_normalizada = public.parque_modelo_clave('LEEB 5.280 VL')
  AND c.activo
ON CONFLICT (marca, subgrupo, clave_alias) DO UPDATE
SET alias = EXCLUDED.alias,
    modelo_catalogo_id = EXCLUDED.modelo_catalogo_id,
    revisado_manual = true;

-- RICE is a material machine variant, not a harmless spelling difference.
-- It already has its own historical catalog row, so restore only this reviewed
-- exact identity when the same variant is present in Importaciones.
UPDATE public.parque_modelos_catalogo c
SET activo = true, actualizado_en = now()
WHERE c.marca_nombre = 'CLAAS'
  AND c.subgrupo = 'COSECHADORAS'::public.subgrupo_maquina
  AND c.clave_normalizada = public.parque_modelo_clave('LEXION 7600 RICE')
  AND NOT c.activo
  AND EXISTS (
    SELECT 1
    FROM public.maquinaria_importacion_lineas l
    WHERE coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS')) = 'CLAAS'
      AND l.subgrupo = 'COSECHADORAS'::public.subgrupo_maquina
      AND public.parque_modelo_clave(l.modelo) = public.parque_modelo_clave('LEXION 7600 RICE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.parque_modelos_catalogo active_variant
    WHERE active_variant.marca_nombre = c.marca_nombre
      AND active_variant.subgrupo = c.subgrupo
      AND active_variant.clave_normalizada = c.clave_normalizada
      AND active_variant.activo
  );

-- Add every exact model identity found only in Importaciones, provided its
-- brand is active. Existing active or retired identities are left untouched;
-- ambiguous cases therefore remain available for explicit human review.
WITH import_models AS (
  SELECT
    public.maquinaria_normalizar_marca(
      coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS'))
    ) AS marca_nombre,
    l.subgrupo,
    min(upper(btrim(l.modelo))) AS nombre,
    public.parque_modelo_clave(l.modelo) AS clave_normalizada
  FROM public.maquinaria_importacion_lineas l
  WHERE l.subgrupo IS NOT NULL
    AND public.parque_modelo_clave(l.modelo) <> ''
  GROUP BY 1, l.subgrupo, public.parque_modelo_clave(l.modelo)
), candidates AS (
  SELECT i.*
  FROM import_models i
  JOIN public.maquinaria_marcas_catalogo brand
    ON brand.nombre = i.marca_nombre AND brand.activa
  WHERE i.marca_nombre IS NOT NULL
    AND i.marca_nombre <> 'OTROS'
    AND public.maquinaria_resolver_modelo_catalogo(i.marca_nombre, i.subgrupo, i.nombre) IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.parque_modelos_catalogo existing
      WHERE existing.marca_nombre = i.marca_nombre
        AND existing.clave_normalizada = i.clave_normalizada
    )
)
INSERT INTO public.parque_modelos_catalogo (
  marca, marca_nombre, subgrupo, nombre, clave_normalizada
)
SELECT
  CASE c.marca_nombre
    WHEN 'CLAAS' THEN 'CLAAS'::public.marca
    WHEN 'HORSCH' THEN 'HORSCH'::public.marca
    ELSE 'OTROS'::public.marca
  END,
  c.marca_nombre,
  c.subgrupo,
  c.nombre,
  c.clave_normalizada
FROM candidates c
ON CONFLICT (marca_nombre, subgrupo, clave_normalizada) DO NOTHING;

-- Link exact identities and reviewed aliases in all three sources. Disable
-- only the two identity triggers during this backfill so historical spelling
-- such as "LEEB 5.280 - 36 M" is retained in its source row.
ALTER TABLE public.maquinaria_importacion_lineas DISABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.maquinaria_importacion_lineas DISABLE TRIGGER zz_vincular_modelo_catalogo;
ALTER TABLE public.maquinaria_operacion_lineas DISABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.maquinaria_operacion_lineas DISABLE TRIGGER zz_vincular_modelo_catalogo;
ALTER TABLE public.parque_maquinas DISABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.parque_maquinas DISABLE TRIGGER zz_vincular_modelo_catalogo;

UPDATE public.maquinaria_importacion_lineas l
SET modelo_catalogo_id = public.maquinaria_resolver_modelo_catalogo(
  coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS')),
  l.subgrupo,
  l.modelo
)
WHERE public.maquinaria_resolver_modelo_catalogo(
    coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS')),
    l.subgrupo,
    l.modelo
  ) IS NOT NULL
  AND l.modelo_catalogo_id IS DISTINCT FROM public.maquinaria_resolver_modelo_catalogo(
    coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS')),
    l.subgrupo,
    l.modelo
  );

UPDATE public.maquinaria_operacion_lineas l
SET modelo_catalogo_id = public.maquinaria_resolver_modelo_catalogo(
  coalesce(l.marca_nombre, l.datos_extraidos ->> 'marca_real', nullif(l.marca::text, 'OTROS')),
  l.subgrupo,
  l.modelo
)
WHERE public.maquinaria_resolver_modelo_catalogo(
    coalesce(l.marca_nombre, l.datos_extraidos ->> 'marca_real', nullif(l.marca::text, 'OTROS')),
    l.subgrupo,
    l.modelo
  ) IS NOT NULL
  AND l.modelo_catalogo_id IS DISTINCT FROM public.maquinaria_resolver_modelo_catalogo(
    coalesce(l.marca_nombre, l.datos_extraidos ->> 'marca_real', nullif(l.marca::text, 'OTROS')),
    l.subgrupo,
    l.modelo
  );

UPDATE public.parque_maquinas p
SET modelo_catalogo_id = public.maquinaria_resolver_modelo_catalogo(
  coalesce(p.marca_nombre, p.marca::text),
  p.subgrupo,
  p.modelo_tipo
)
WHERE public.maquinaria_resolver_modelo_catalogo(
    coalesce(p.marca_nombre, p.marca::text),
    p.subgrupo,
    p.modelo_tipo
  ) IS NOT NULL
  AND p.modelo_catalogo_id IS DISTINCT FROM public.maquinaria_resolver_modelo_catalogo(
    coalesce(p.marca_nombre, p.marca::text),
    p.subgrupo,
    p.modelo_tipo
  );

ALTER TABLE public.maquinaria_importacion_lineas ENABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.maquinaria_importacion_lineas ENABLE TRIGGER zz_vincular_modelo_catalogo;
ALTER TABLE public.maquinaria_operacion_lineas ENABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.maquinaria_operacion_lineas ENABLE TRIGGER zz_vincular_modelo_catalogo;
ALTER TABLE public.parque_maquinas ENABLE TRIGGER a0_resolver_modelo_catalogo;
ALTER TABLE public.parque_maquinas ENABLE TRIGGER zz_vincular_modelo_catalogo;

-- Read-only deployment checks returned by the migration runner.
SELECT c.marca_nombre, c.subgrupo, c.nombre
FROM public.parque_modelos_catalogo c
WHERE c.activo
  AND (
    (c.marca_nombre = 'HORSCH' AND c.nombre ILIKE 'LEEB%')
    OR EXISTS (
      SELECT 1
      FROM public.maquinaria_importacion_lineas l
      WHERE c.marca_nombre = public.maquinaria_normalizar_marca(
        coalesce(l.marca_nombre, nullif(l.proveedor, 'OTROS'), nullif(l.marca_importacion::text, 'OTROS'))
      )
        AND c.subgrupo = l.subgrupo
        AND c.clave_normalizada = public.parque_modelo_clave(l.modelo)
    )
  )
ORDER BY c.marca_nombre, c.subgrupo, c.nombre;
