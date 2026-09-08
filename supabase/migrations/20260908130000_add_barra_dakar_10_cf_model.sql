-- Crea "BARRA DAKAR 10 CF" en el catalogo -- modelo distinto, confirmado que
-- no existe activo ni retirado. Subgrupo SEMBRADORAS, segun el dato real de
-- las lineas que ya usan esta grafia (1 en pedido, 1 en importacion; no
-- SUELO como el resto de la familia DAKAR). Engancha esas dos lineas al
-- nuevo modelo_catalogo_id. parque_maquinas no se toca -- 0 filas con esta
-- grafia, confirmado.

INSERT INTO public.parque_modelos_catalogo (marca, marca_nombre, subgrupo, nombre, clave_normalizada)
VALUES (
  'HORSCH'::public.marca, 'HORSCH', 'SEMBRADORAS'::public.subgrupo_maquina,
  'BARRA DAKAR 10 CF', public.parque_modelo_clave('BARRA DAKAR 10 CF')
);

UPDATE public.maquinaria_operacion_lineas
SET modelo_catalogo_id = (
  SELECT id FROM public.parque_modelos_catalogo
  WHERE marca_nombre = 'HORSCH' AND clave_normalizada = public.parque_modelo_clave('BARRA DAKAR 10 CF')
)
WHERE public.parque_modelo_clave(modelo) = public.parque_modelo_clave('BARRA DAKAR 10 CF');

UPDATE public.maquinaria_importacion_lineas
SET modelo_catalogo_id = (
  SELECT id FROM public.parque_modelos_catalogo
  WHERE marca_nombre = 'HORSCH' AND clave_normalizada = public.parque_modelo_clave('BARRA DAKAR 10 CF')
)
WHERE public.parque_modelo_clave(modelo) = public.parque_modelo_clave('BARRA DAKAR 10 CF');

-- Verificacion: deben aparecer las 2 lineas, ya enganchadas al modelo nuevo
select 'pedido' as origen, l.id, l.modelo, l.subgrupo, c.nombre as modelo_catalogo, c.subgrupo as subgrupo_catalogo
from public.maquinaria_operacion_lineas l
join public.parque_modelos_catalogo c on c.id = l.modelo_catalogo_id
where c.clave_normalizada = public.parque_modelo_clave('BARRA DAKAR 10 CF')
union all
select 'importacion', l.id, l.modelo, l.subgrupo, c.nombre, c.subgrupo
from public.maquinaria_importacion_lineas l
join public.parque_modelos_catalogo c on c.id = l.modelo_catalogo_id
where c.clave_normalizada = public.parque_modelo_clave('BARRA DAKAR 10 CF');
