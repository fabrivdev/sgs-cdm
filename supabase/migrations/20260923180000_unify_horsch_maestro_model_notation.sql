-- Unifica grafias HORSCH MAESTRO ya revisadas. Una notacion de configuracion
-- E45/E50 no representa otro modelo comercial: se conserva como alias y todas
-- las fuentes operativas usan la misma identidad canonica.

BEGIN;

CREATE TEMP TABLE modelos_maestro_unificados (
  alias text NOT NULL,
  canonico text NOT NULL
) ON COMMIT DROP;

INSERT INTO modelos_maestro_unificados (alias, canonico) VALUES
  ('MAESTRO 14 CF E50', 'MAESTRO CF 14.50'),
  ('MAESTRO 16 CF E45', 'MAESTRO CF 16.45'),
  ('MAESTRO 18 CF E45', 'MAESTRO CF 18.45'),
  ('MAESTRO 18 CF E50', 'MAESTRO CF 18.50');

-- Garantiza primero las identidades destino. No se crean equivalencias por
-- semejanza: solo las cuatro relaciones explicitamente revisadas de arriba.
INSERT INTO public.parque_modelos_catalogo (
  marca, marca_nombre, subgrupo, nombre, clave_normalizada, activo, actualizado_en
)
SELECT
  'HORSCH'::public.marca,
  'HORSCH',
  'SEMBRADORAS'::public.subgrupo_maquina,
  equivalencia.canonico,
  public.parque_modelo_clave(equivalencia.canonico),
  true,
  now()
FROM modelos_maestro_unificados equivalencia
ON CONFLICT (marca_nombre, subgrupo, clave_normalizada) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true,
    actualizado_en = now();

INSERT INTO public.parque_modelos_alias (
  marca, subgrupo, alias, clave_alias, modelo_catalogo_id, revisado_manual
)
SELECT
  'HORSCH'::public.marca,
  'SEMBRADORAS'::public.subgrupo_maquina,
  equivalencia.alias,
  public.parque_modelo_clave(equivalencia.alias),
  canonico.id,
  true
FROM modelos_maestro_unificados equivalencia
JOIN public.parque_modelos_catalogo canonico
  ON canonico.marca_nombre = 'HORSCH'
 AND canonico.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
 AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
ON CONFLICT (marca, subgrupo, clave_alias) DO UPDATE
SET alias = EXCLUDED.alias,
    modelo_catalogo_id = EXCLUDED.modelo_catalogo_id,
    revisado_manual = true;

-- Reasigna referencias que todavia apuntan a la opcion duplicada.
WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_maestro_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = 'HORSCH'
   AND anterior.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = 'HORSCH'
   AND canonico.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.maquinaria_operacion_lineas linea
SET modelo_catalogo_id = equivalencias.canonico_id,
    actualizado_en = now()
FROM equivalencias
WHERE linea.modelo_catalogo_id = equivalencias.anterior_id;

WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_maestro_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = 'HORSCH'
   AND anterior.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = 'HORSCH'
   AND canonico.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.maquinaria_importacion_lineas linea
SET modelo_catalogo_id = equivalencias.canonico_id,
    actualizado_en = now()
FROM equivalencias
WHERE linea.modelo_catalogo_id = equivalencias.anterior_id;

WITH equivalencias AS (
  SELECT anterior.id AS anterior_id, canonico.id AS canonico_id
  FROM modelos_maestro_unificados equivalencia
  JOIN public.parque_modelos_catalogo anterior
    ON anterior.marca_nombre = 'HORSCH'
   AND anterior.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  JOIN public.parque_modelos_catalogo canonico
    ON canonico.marca_nombre = 'HORSCH'
   AND canonico.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
   AND canonico.clave_normalizada = public.parque_modelo_clave(equivalencia.canonico)
)
UPDATE public.parque_maquinas maquina
SET modelo_catalogo_id = equivalencias.canonico_id,
    actualizado_en = now()
FROM equivalencias
WHERE maquina.modelo_catalogo_id = equivalencias.anterior_id;

-- Normaliza los textos visibles de las fuentes activas. Los datos_fuente/raw
-- historicos no se reescriben y siguen disponibles para auditoria.
UPDATE public.maquinaria_operacion_lineas linea
SET modelo = equivalencia.canonico,
    subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina,
    actualizado_en = now()
FROM modelos_maestro_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(
    coalesce(linea.marca_nombre, linea.datos_extraidos ->> 'marca_real', linea.marca::text)
  ) = 'HORSCH'
  AND public.parque_modelo_clave(linea.modelo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.maquinaria_importacion_lineas linea
SET modelo = equivalencia.canonico,
    subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina,
    actualizado_en = now()
FROM modelos_maestro_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(
    coalesce(linea.marca_nombre, nullif(linea.proveedor, 'OTROS'), linea.marca_importacion::text)
  ) = 'HORSCH'
  AND public.parque_modelo_clave(linea.modelo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.parque_maquinas maquina
SET modelo_tipo = equivalencia.canonico,
    subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina,
    actualizado_en = now()
FROM modelos_maestro_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(coalesce(maquina.marca_nombre, maquina.marca::text)) = 'HORSCH'
  AND public.parque_modelo_clave(maquina.modelo_tipo) = public.parque_modelo_clave(equivalencia.alias);

UPDATE public.parque_stock_maquinas stock
SET modelo = equivalencia.canonico,
    tipo = 'SEMBRADORAS'
FROM modelos_maestro_unificados equivalencia
WHERE public.maquinaria_normalizar_marca(stock.marca) = 'HORSCH'
  AND public.parque_modelo_clave(stock.modelo) = public.parque_modelo_clave(equivalencia.alias);

-- La grafia anterior permanece como alias, pero deja de ofrecerse como una
-- segunda opcion del selector.
UPDATE public.parque_modelos_catalogo anterior
SET activo = false,
    actualizado_en = now()
FROM modelos_maestro_unificados equivalencia
WHERE anterior.marca_nombre = 'HORSCH'
  AND anterior.subgrupo = 'SEMBRADORAS'::public.subgrupo_maquina
  AND anterior.clave_normalizada = public.parque_modelo_clave(equivalencia.alias)
  AND anterior.clave_normalizada IS DISTINCT FROM public.parque_modelo_clave(equivalencia.canonico);

COMMIT;

NOTIFY pgrst, 'reload schema';
