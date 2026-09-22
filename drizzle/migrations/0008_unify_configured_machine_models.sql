-- Unifica configuraciones/ancho con el modelo comercial base ya existente.
-- No se hace ninguna similitud difusa: esta lista representa equivalencias
-- revisadas y conserva la grafía anterior como alias auditable.

CREATE TEMP TABLE modelos_configuracion_unificados (
  marca text NOT NULL,
  subgrupo text NOT NULL,
  alias text NOT NULL,
  canonico text NOT NULL
) ON COMMIT DROP;

INSERT INTO modelos_configuracion_unificados (marca, subgrupo, alias, canonico) VALUES
  ('CLAAS', 'PLATAFORMAS/CABEZALES', 'CONVIO FLEX 930 RICE 30 PIES', 'CONVIO FLEX 930'),
  ('CLAAS', 'PLATAFORMAS/CABEZALES', 'CONVIO FLEX 1080 35 PIES', 'CONVIO FLEX 1080'),
  ('CLAAS', 'PLATAFORMAS/CABEZALES', 'CONVIO FLEX 1230 40 PIES', 'CONVIO FLEX 1230'),
  ('CLAAS', 'PLATAFORMAS/CABEZALES', 'CONVIO FLEX 1380 45 PIES', 'CONVIO FLEX 1380');

INSERT INTO public.parque_modelos_alias (
  marca, subgrupo, alias, clave_alias, modelo_catalogo_id, revisado_manual
)
SELECT
  equivalencia.marca::public.marca,
  equivalencia.subgrupo::public.subgrupo_maquina,
  equivalencia.alias,
  public.parque_modelo_clave(equivalencia.alias),
  canonico.id,
  true
FROM modelos_configuracion_unificados equivalencia
JOIN public.parque_modelos_catalogo canonico
  ON canonico.marca_nombre = equivalencia.marca
 AND canonico.subgrupo::text = equivalencia.subgrupo
 AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
ON CONFLICT (marca, subgrupo, clave_alias) DO UPDATE
SET modelo_catalogo_id = EXCLUDED.modelo_catalogo_id,
    alias = EXCLUDED.alias,
    revisado_manual = true;

WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_configuracion_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = equivalencia.marca
   AND anterior.subgrupo::text = equivalencia.subgrupo
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = equivalencia.marca
   AND canonico.subgrupo::text = equivalencia.subgrupo
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.maquinaria_operacion_lineas linea
SET modelo_catalogo_id = equivalencias.canonico_id,
    actualizado_en = now()
FROM equivalencias
WHERE linea.modelo_catalogo_id = equivalencias.anterior_id;

WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_configuracion_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = equivalencia.marca
   AND anterior.subgrupo::text = equivalencia.subgrupo
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = equivalencia.marca
   AND canonico.subgrupo::text = equivalencia.subgrupo
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.maquinaria_importacion_lineas linea
SET modelo_catalogo_id = equivalencias.canonico_id,
    actualizado_en = now()
FROM equivalencias
WHERE linea.modelo_catalogo_id = equivalencias.anterior_id;

WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_configuracion_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = equivalencia.marca
   AND anterior.subgrupo::text = equivalencia.subgrupo
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = equivalencia.marca
   AND canonico.subgrupo::text = equivalencia.subgrupo
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.parque_maquinas maquina
SET modelo_catalogo_id = equivalencias.canonico_id
FROM equivalencias
WHERE maquina.modelo_catalogo_id = equivalencias.anterior_id;

UPDATE public.maquinaria_operacion_lineas linea
SET modelo = equivalencia.canonico,
    actualizado_en = now()
FROM modelos_configuracion_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(coalesce(linea.marca_nombre, linea.marca::text)) = equivalencia.marca
  AND public.parque_modelo_clave(linea.modelo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.maquinaria_importacion_lineas linea
SET modelo = equivalencia.canonico,
    actualizado_en = now()
FROM modelos_configuracion_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(coalesce(linea.marca_nombre, linea.proveedor, linea.marca_importacion::text)) = equivalencia.marca
  AND public.parque_modelo_clave(linea.modelo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.parque_maquinas maquina
SET modelo_tipo = equivalencia.canonico
FROM modelos_configuracion_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(coalesce(maquina.marca_nombre, maquina.marca::text)) = equivalencia.marca
  AND public.parque_modelo_clave(maquina.modelo_tipo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.parque_modelos_catalogo modelo
SET activo = false,
    actualizado_en = now()
FROM modelos_configuracion_unificados equivalencia
WHERE modelo.marca_nombre = equivalencia.marca
  AND modelo.subgrupo::text = equivalencia.subgrupo
  AND modelo.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  AND EXISTS (
    SELECT 1
    FROM public.parque_modelos_catalogo canonico
    WHERE canonico.marca_nombre = equivalencia.marca
      AND canonico.subgrupo::text = equivalencia.subgrupo
      AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
      AND canonico.activo
  );

NOTIFY pgrst, 'reload schema';