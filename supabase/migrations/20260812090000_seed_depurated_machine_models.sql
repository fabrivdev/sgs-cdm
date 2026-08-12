-- Catálogo depurado entregado en modelos_maquinaria_depurados.xlsx.
-- Los modelos listados son sugerencias canónicas, no una lista cerrada:
-- el trigger continúa creando modelos nuevos cuando se guarda uno desconocido.

CREATE TABLE IF NOT EXISTS public.parque_modelos_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca public.marca NOT NULL,
  subgrupo public.subgrupo_maquina NOT NULL,
  alias text NOT NULL,
  clave_alias text NOT NULL,
  modelo_catalogo_id uuid NOT NULL
    REFERENCES public.parque_modelos_catalogo(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parque_modelos_alias_alias_no_vacio CHECK (btrim(alias) <> ''),
  CONSTRAINT parque_modelos_alias_clave_no_vacia CHECK (btrim(clave_alias) <> ''),
  CONSTRAINT parque_modelos_alias_unique UNIQUE (marca, subgrupo, clave_alias)
);

CREATE INDEX IF NOT EXISTS idx_parque_modelos_alias_catalogo
  ON public.parque_modelos_alias (modelo_catalogo_id);

CREATE TEMP TABLE modelos_depurados_import (
  original text NOT NULL,
  canonico text NOT NULL,
  marca public.marca NOT NULL,
  subgrupo public.subgrupo_maquina NOT NULL
) ON COMMIT DROP;

INSERT INTO modelos_depurados_import (original, canonico, marca, subgrupo)
VALUES
('ALLOCHIS 6 00', 'ALLOCHIS 6.00', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('AVATAR 6 16', 'AVATAR 6.16', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('AVERO 240', 'AVERO 240', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('AXION 930', 'AXION 930', 'CLAAS'::public.marca, 'TRACTORES'::public.subgrupo_maquina),
  ('BARRA DAKAR BARRA 10', 'BARRA DAKAR 10', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('CONVIO 1080', 'CONVIO FLEX 1080', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('CONVIO 1230', 'CONVIO FLEX 1230', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('CONVIO 1380', 'CONVIO FLEX 1380', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('CONVIO 930', 'CONVIO FLEX 930', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('CULTRO 9 TC', 'CULTRO 9 TC', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('DAKAR 10 CF', 'DAKAR 10 CF', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('DAKAR 10 VF 60 17', 'DAKAR 10 CF', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('DAKAR 8 CF', 'DAKAR 8 CF', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('DIREC DISC', 'DIRECT DISC', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('DOMINATOR 370', 'DOMINATOR 370', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('DUO 24 45', 'DUO 24.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('DUO 30 45', 'DUO 30.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('DUO 36 45', 'DUO 36.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('EVOLUTION 24 45', 'MAESTRO EVOLUTION 24', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('HERA 32', 'HERA 980', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('HERA 32 PIES', 'HERA 980', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('HERA 37', 'HERA 1130', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('HERA 42', 'HERA 1280', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('HERA 42 PIES', 'HERA 1280', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('HERA 47', 'HERA 1430', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('JAGUAR 850', 'JAGUAR 850', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JAGUAR 870', 'JAGUAR 870', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JAGUAR 930', 'JAGUAR 930', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JAGUAR 940', 'JAGUAR 940', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JAGUAR 950', 'JAGUAR 950', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JAGUAR 960', 'JAGUAR 960', 'CLAAS'::public.marca, 'PICADORAS'::public.subgrupo_maquina),
  ('JOCKER JOCKER 7 RT', 'JOKER 7 RT', 'HORSCH'::public.marca, 'SUELO'::public.subgrupo_maquina),
  ('LEEB', 'LEEB 5280 VL', 'HORSCH'::public.marca, 'PULVERIZADORAS'::public.subgrupo_maquina),
  ('LEEB 5250', 'LEEB 5280 VL', 'HORSCH'::public.marca, 'PULVERIZADORAS'::public.subgrupo_maquina),
  ('LEEB 5280', 'LEEB 5280 VL', 'HORSCH'::public.marca, 'PULVERIZADORAS'::public.subgrupo_maquina),
  ('LEXION 570 C', 'LEXION 570', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 740', 'LEXION 740', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 750', 'LEXION 750', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 750 MTS', 'LEXION 750', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 760 DUAL', 'LEXION 760', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 760 MTS', 'LEXION 760', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 760 R DUAL', 'LEXION 760', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 7600', 'LEXION 7600', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 7600 DUAL', 'LEXION 7600', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 7600 MTS', 'LEXION 7600', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION 7600 RICE', 'LEXION 7600', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION RICE 570 RICE', 'LEXION 570', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION RICE 750 RICE', 'LEXION 750', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION RICE 760 R DUAL', 'LEXION 760', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('LEXION RICE 760 R MTS', 'LEXION 760', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('MAC FLEC 35 PIES', 'MAXFLEX 1050', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('MAESTRO 14 45', 'MAESTRO CF 14.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 14 45 50', 'MAESTRO CF 14.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 16 45', 'MAESTRO CF 16.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 16 50', 'MAESTRO CF 16.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 16 CF', 'MAESTRO CF 16.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 16 CF E45', 'MAESTRO CF 16.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 45', 'MAESTRO CF 18.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 45 16', 'MAESTRO CF 18.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 50', 'MAESTRO CF 18.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 50 16', 'MAESTRO CF 18.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 50 45', 'MAESTRO CF 18.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 CF', 'MAESTRO CF 18.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 CF E45', 'MAESTRO CF 18.45', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 18 CF E50', 'MAESTRO CF 18.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO 32 EV', 'MAESTRO EVOLUTION 32', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAESTRO CF 18 50', 'MAESTRO CF 18.50', 'HORSCH'::public.marca, 'SEMBRADORAS'::public.subgrupo_maquina),
  ('MAX FLEC 35 PIES', 'MAXFLEX 1050', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('MAX FLEC 40 PIES', 'MAXFLEX 1200', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('MAX FLEX 35 PIES', 'MAXFLEX 1050', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('MAX FLEX 40 PIES', 'MAXFLEX 1200', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 450', 'ORBIS 450', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 600', 'ORBIS 600', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 600 SD', 'ORBIS 600', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 750', 'ORBIS 750', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 750 US UY', 'ORBIS 750', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS 900', 'ORBIS 900', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('ORBIS RU450', 'ORBIS 450', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('PU 300', 'PICK UP 300', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('RU 450', 'RU 450', 'CLAAS'::public.marca, 'PLATAFORMAS/CABEZALES'::public.subgrupo_maquina),
  ('TRION 710', 'TRION 710', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TRION 720', 'TRION 720', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TRION 740', 'TRION 740', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TRION 750', 'TRION 750', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 320', 'TUCANO 320', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 460', 'TUCANO 460', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 460 RICE', 'TUCANO 460', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 470', 'TUCANO 470', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 560 DUAL', 'TUCANO 560', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina),
  ('TUCANO 570 DUAL', 'TUCANO 570', 'CLAAS'::public.marca, 'COSECHADORAS'::public.subgrupo_maquina);

INSERT INTO public.parque_modelos_catalogo (
  marca, subgrupo, nombre, clave_normalizada, activo, actualizado_en
)
SELECT DISTINCT
  d.marca,
  d.subgrupo,
  d.canonico,
  public.parque_modelo_clave(d.canonico),
  true,
  now()
FROM modelos_depurados_import d
ON CONFLICT (marca, subgrupo, clave_normalizada) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true,
    actualizado_en = now();

INSERT INTO public.parque_modelos_alias (
  marca, subgrupo, alias, clave_alias, modelo_catalogo_id
)
SELECT DISTINCT ON (d.marca, d.subgrupo, public.parque_modelo_clave(d.original))
  d.marca,
  d.subgrupo,
  d.original,
  public.parque_modelo_clave(d.original),
  c.id
FROM modelos_depurados_import d
JOIN public.parque_modelos_catalogo c
  ON c.marca = d.marca
 AND c.subgrupo = d.subgrupo
 AND c.clave_normalizada = public.parque_modelo_clave(d.canonico)
WHERE public.parque_modelo_clave(d.original) <> ''
ORDER BY d.marca, d.subgrupo, public.parque_modelo_clave(d.original), d.original
ON CONFLICT (marca, subgrupo, clave_alias) DO UPDATE
SET alias = EXCLUDED.alias,
    modelo_catalogo_id = EXCLUDED.modelo_catalogo_id;

-- Oculta del selector las variantes antiguas que ahora apuntan a otro nombre
-- canónico o fueron reclasificadas a otro tipo de maquinaria.
UPDATE public.parque_modelos_catalogo c
SET activo = false,
    actualizado_en = now()
WHERE EXISTS (
  SELECT 1
  FROM modelos_depurados_import d
  WHERE d.marca = c.marca
    AND public.parque_modelo_clave(d.original) = c.clave_normalizada
    AND (
      d.subgrupo IS DISTINCT FROM c.subgrupo
      OR public.parque_modelo_clave(d.canonico) IS DISTINCT FROM c.clave_normalizada
    )
)
AND NOT EXISTS (
  SELECT 1
  FROM modelos_depurados_import d
  WHERE d.marca = c.marca
    AND d.subgrupo = c.subgrupo
    AND public.parque_modelo_clave(d.canonico) = c.clave_normalizada
);

-- Normaliza las máquinas existentes según los alias del archivo.
UPDATE public.parque_maquinas pm
SET modelo_tipo = d.canonico,
    subgrupo = d.subgrupo,
    actualizado_en = now()
FROM modelos_depurados_import d
WHERE pm.marca = d.marca
  AND public.parque_modelo_clave(pm.modelo_tipo) = public.parque_modelo_clave(d.original)
  AND (
    pm.modelo_tipo IS DISTINCT FROM d.canonico
    OR pm.subgrupo IS DISTINCT FROM d.subgrupo
  );

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
  v_subgrupo public.subgrupo_maquina;
BEGIN
  v_clave := public.parque_modelo_clave(NEW.modelo_tipo);
  IF v_clave = '' THEN
    NEW.modelo_tipo := NULL;
    RETURN NEW;
  END IF;

  SELECT c.nombre, c.subgrupo
  INTO v_canonico, v_subgrupo
  FROM public.parque_modelos_alias a
  JOIN public.parque_modelos_catalogo c ON c.id = a.modelo_catalogo_id
  WHERE a.marca = NEW.marca
    AND a.subgrupo = NEW.subgrupo
    AND a.clave_alias = v_clave
    AND c.activo = true
  LIMIT 1;

  IF v_canonico IS NOT NULL THEN
    NEW.modelo_tipo := v_canonico;
    NEW.subgrupo := v_subgrupo;
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

ALTER TABLE public.parque_modelos_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalogo alias select authenticated" ON public.parque_modelos_alias;
CREATE POLICY "Catalogo alias select authenticated"
ON public.parque_modelos_alias
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Catalogo alias admin write" ON public.parque_modelos_alias;
CREATE POLICY "Catalogo alias admin write"
ON public.parque_modelos_alias
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.parque_modelos_alias TO authenticated;
