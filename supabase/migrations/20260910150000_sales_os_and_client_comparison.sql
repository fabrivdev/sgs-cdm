-- Servicios: una fila por OS, agrupada antes de paginar.
-- Documentos sin OS (historico/NC) conservan su identidad individual.
create or replace function public.ventas_servicios_os(
 p_area text, p_desde date, p_hasta date, p_sucursal text default null,
 p_buscar text default null, p_pagina integer default 1, p_por_pagina integer default 50
) returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp set statement_timeout = '30s' as $$
declare
 v_resultado jsonb;
 v_pagina integer := greatest(coalesce(p_pagina,1),1);
 v_limite integer := least(greatest(coalesce(p_por_pagina,50),10),100);
begin
 if auth.uid() is null or not public.has_section_access(auth.uid(),'servicios.ventas') then
  raise exception 'Sin acceso a Ventas de Servicios' using errcode='42501';
 end if;
 if p_area <> 'servicios' or p_desde is null or p_hasta is null or p_desde > p_hasta then
  raise exception 'Parametros invalidos' using errcode='22023';
 end if;
 with base as materialized (
  select b.*, case when os_numero is not null then 'OS:' || os_numero
   else jsonb_build_array(metodologia, factura, cliente, sucursal, fecha,
    case when factura is null then linea_id end)::text end as clave
  from public.ventas_area_movimientos_base(p_desde,p_hasta,p_sucursal,null) b
  where area_calculada='servicios'
 ), coincidencias as (
  select distinct clave from base
  where nullif(trim(p_buscar),'') is null
   or concat_ws(' ',os_numero,factura,cliente,descripcion,codigo,codigo_fabricante,concepto) ilike '%' || trim(p_buscar) || '%'
 ), agrupadas as (
  select b.clave as id, max(fecha) as fecha, max(os_numero) as os_numero,
   string_agg(distinct coalesce(cliente,'Sin cliente'), ' / ') as cliente,
   string_agg(distinct sucursal, ' / ') as sucursal,
   case when max(os_numero) is not null then 'OS'
    when bool_and(es_nota_credito) then 'Nota de crédito'
    else 'Histórico sin OS' end as tipo,
   min(factura) as factura,
   count(distinct jsonb_build_array(factura,fecha,cliente,sucursal,
    case when factura is null then linea_id end)) as facturas,
   sum(total_venta) as total_venta, count(*) as cantidad_lineas,
   sum(total_venta) filter(where concepto='Servicio') as mano_obra,
   sum(total_venta) filter(where concepto='Kilometraje') as kilometraje,
   sum(total_venta) filter(where concepto='Repuestos') as repuestos,
   sum(total_venta) filter(where concepto not in ('Servicio','Kilometraje','Repuestos')) as otros,
   jsonb_agg((to_jsonb(b)-'clave') || jsonb_build_object('id',linea_id)
    order by fecha desc,factura,concepto,linea_id) as lineas
  from base b join coincidencias using(clave) group by b.clave
 ), pagina as (
  select * from agrupadas order by fecha desc,id limit v_limite offset (v_pagina-1)*v_limite
 )
 select jsonb_build_object('total',(select count(*) from agrupadas),
  'pagina',v_pagina,'por_pagina',v_limite,
  'paginas',greatest(1,ceil((select count(*) from agrupadas)::numeric/v_limite)),
  'documentos',coalesce((select jsonb_agg(to_jsonb(p) order by fecha desc,id) from pagina p),'[]'::jsonb))
 into v_resultado;
 return v_resultado;
end; $$;

-- Comparacion contra los mismos meses del año anterior; misma fuente y filtros.
create or replace function public.ventas_clientes_comparacion(
 p_area text,p_desde date,p_hasta date,p_sucursal text default null,p_buscar text default null
) returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp set statement_timeout='30s' as $$
declare v_seccion text; v_resultado jsonb;
begin
 if p_area not in ('servicios','maquinas','repuestos') or p_desde is null or p_hasta is null or p_desde>p_hasta then
  raise exception 'Parametros invalidos' using errcode='22023';
 end if;
 v_seccion := case p_area when 'servicios' then 'servicios.ventas' when 'maquinas' then 'parque.ventas' else 'repuestos.ventas' end;
 if auth.uid() is null or not public.has_section_access(auth.uid(),v_seccion) then
  raise exception 'Sin acceso a Ventas' using errcode='42501';
 end if;
 with actual as (
  select coalesce(cliente,'Sin cliente') as nombre, sum(total_venta) as importe,
   count(distinct jsonb_build_array(factura,fecha,sucursal,case when factura is null then linea_id end)) as facturas,
   count(distinct os_numero) as ordenes, max(fecha) as ultima,
   string_agg(distinct sucursal,' / ') as sucursales
  from public.ventas_area_movimientos_base(p_desde,p_hasta,p_sucursal,p_buscar)
  where area_calculada=p_area group by coalesce(cliente,'Sin cliente')
 ), anterior as (
  select coalesce(cliente,'Sin cliente') as nombre,sum(total_venta) as importe_anterior
  from public.ventas_area_movimientos_base((p_desde-interval '1 year')::date,(p_hasta-interval '1 year')::date,p_sucursal,p_buscar)
  where area_calculada=p_area group by coalesce(cliente,'Sin cliente')
 ), filas as (
  select coalesce(a.nombre,b.nombre) as nombre,coalesce(a.importe,0) as importe,
   b.importe_anterior,coalesce(a.facturas,0) as facturas,coalesce(a.ordenes,0) as ordenes,
   a.ultima,a.sucursales
  from actual a full join anterior b using(nombre)
 )
 select jsonb_build_object('clientes',coalesce(jsonb_agg(to_jsonb(f) order by importe desc,nombre),'[]'::jsonb),
  'desde_anterior',(p_desde-interval '1 year')::date,'hasta_anterior',(p_hasta-interval '1 year')::date,
  'comparable',p_area='maquinas' or p_hasta<date '2026-07-01' or (p_desde-interval '1 year')::date>=date '2026-07-01')
 into v_resultado from filas f;
 return v_resultado;
end; $$;
revoke all on function public.ventas_servicios_os(text,date,date,text,text,integer,integer) from public,anon;
grant execute on function public.ventas_servicios_os(text,date,date,text,text,integer,integer) to authenticated;
revoke all on function public.ventas_clientes_comparacion(text,date,date,text,text) from public,anon;
grant execute on function public.ventas_clientes_comparacion(text,date,date,text,text) to authenticated;
notify pgrst,'reload schema';

