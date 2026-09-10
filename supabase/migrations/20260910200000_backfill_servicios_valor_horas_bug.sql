-- Backfill de ordenes_servicio_importadas.servicios_valor para las OS donde
-- el TOTAL de la linea de mano de obra se interpreto como formato de hora
-- (H:MM) en vez de dinero -- bug de parseFlexibleNumber, ya corregido en el
-- parser (fiscal.ts). Este backfill NO usa el decimal corrupto como base de
-- ningun calculo: recupera el valor real desde lo efectivamente facturado
-- (facturacion_lineas_importadas, concepto Servicio, vinculado por
-- linked_service_order).
--
-- Alcance: 12 OS confirmadas de forma inequivoca (el decimal guardado
-- reconstruye un H:MM y/o el monto facturado real coincide, con kilometraje u
-- otras lineas de la misma factura cuadrando exacto contra lo cargado en la
-- OS -- confirma que el cruce factura<->OS esta bien hecho y el problema es
-- puntual en la columna de mano de obra).
--
-- 01-00000071 quedo afuera a proposito: se reviso a mano y NO tiene el bug
-- -- servicios_valor=60 ya coincide exacto con la mano de obra real
-- facturada ($60). La sospecha inicial fue un falso positivo del script de
-- analisis (clasifico una linea "SERVICIO DE TERCEROS" como mano de obra por
-- mirar solo el grupo contable, no el nombre del producto).

with os_afectadas as (
  select unnest(array[
    '01-00000146', '01-00000147', '01-00000148', '01-00000149',
    '01-00000150', '01-00000151', '01-00000152',
    '01-00000011', '01-00000013', '01-00000014', '01-00000015',
    '02-00000025'
  ]) as os_numero
), facturado_real as (
  select
    f.raw_data ->> 'linked_service_order' as os_numero,
    sum(f.total_venta)::numeric as mo_facturada
  from public.facturacion_lineas_importadas f
  where f.raw_data ->> 'linked_service_order' in (select os_numero from os_afectadas)
    and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'
    and (
      lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%servic%'
      or lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%mano de obra%'
    )
  group by f.raw_data ->> 'linked_service_order'
)
update public.ordenes_servicio_importadas os
set
  servicios_valor = fr.mo_facturada,
  actualizado_en = now()
from facturado_real fr
where os.os_numero = fr.os_numero;

-- Verificacion (correr despues del update, debe mostrar
-- 42/42/42/42/42/42/42/30/30/30/30/56):
-- select os_numero, servicios_cantidad, servicios_valor
-- from public.ordenes_servicio_importadas
-- where os_numero in (
--   '01-00000146','01-00000147','01-00000148','01-00000149','01-00000150',
--   '01-00000151','01-00000152','01-00000011','01-00000013','01-00000014',
--   '01-00000015','02-00000025'
-- )
-- order by os_numero;

-- 01-00000071, revisada aparte -- NO tocada por este update, ya esta bien:
-- select os_numero, servicios_cantidad, servicios_valor
-- from public.ordenes_servicio_importadas
-- where os_numero = '01-00000071';
