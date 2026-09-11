-- Corrige dos problemas encontrados al investigar por que seis facturas de
-- maquinas no aparecian en Ventas de Maquinas:
--
-- PROBLEMA 1 -- clasificacion: una linea importada ANTES de que existiera la
-- deteccion por codigo/descripcion (commit 0d75607, 29/07/2026) quedo
-- congelada con grupo_normalizado="Otros" para siempre, aunque su codigo
-- (VEIC_...) y su descripcion (Tipo:...Modelo:...Casis/Chasis:...) digan
-- claramente que es una maquina. Se agrega la misma deteccion por codigo/
-- descripcion que ya usamos para Terceros.
--
-- PROBLEMA 2 -- fecha faltante: las mismas 6 facturas (y otras 11 no
-- relacionadas con maquinas) tienen fecha_factura NULL en la base -- vienen
-- del lote de importacion del 29/07/2026 que tenia un bug de parseo de
-- fecha. El filtro de rango de la rama "nuevo" (`fecha_factura between ...`)
-- las excluye SIEMPRE, sin importar la clasificacion -- por eso el arreglo
-- de PROBLEMA 1 solo, sin esto, no las hace aparecer.
--
-- El backfill queda acotado al lote XML importado el 29/07/2026, valida la
-- fecha compacta antes de convertirla y compara una identidad de documento
-- normalizada (factura/codigo interno/DOCUMENTO). Si los 22 renglones y las
-- 17 facturas diagnosticadas ya no coinciden, la migracion aborta sin tocar
-- datos. Cero candidatos es valido para permitir una ejecucion idempotente.
--
-- Ademas se persiste grupo_normalizado/canonical_line_type para las lineas de
-- maquina. No alcanza con clasificarlas solamente dentro del RPC: Dashboard
-- lee facturacion_lineas_importadas directamente y debe ver el mismo rubro.
--
-- Se agrega tambien fecha_factura is not null de forma explicita en el
-- WHERE de la rama "nuevo" (redundante hoy porque un NULL nunca cumple un
-- BETWEEN, pero se deja explicito para no depender de ese detalle si el
-- filtro de fechas cambia mas adelante).
--
-- Solo la rama "nuevo" (facturacion_lineas_importadas) tiene cod_mercaderia/
-- mercaderia/observacion -- la rama legacy (facturacion) sigue igual, sin
-- cambios.

do $migration$
declare
  v_lineas integer;
  v_facturas integer;
  v_invalidas integer;
begin
  with lote as (
    select
      f.id,
      upper(regexp_replace(coalesce(
        nullif(trim(f.factura), ''),
        nullif(trim(f.codigo_interno_factura), ''),
        nullif(trim(f.raw_data ->> 'DOCUMENTO'), ''),
        ''
      ), '[^[:alnum:]]', '', 'g')) as documento_clave,
      nullif(trim(f.raw_data ->> 'EMISION'), '') as emision
    from public.facturacion_lineas_importadas f
    where f.fecha_factura is null
      and f.origen_sistema in ('new_xml_facturacion_os', 'new_xml_facturacion_directa')
      and f.importado_en >= timestamptz '2026-07-29 00:00:00+00'
      and f.importado_en <  timestamptz '2026-07-30 00:00:00+00'
      and nullif(trim(f.raw_data ->> 'EMISION'), '') is not null
  ), huerfanas as (
    select l.*
    from lote l
    where l.documento_clave <> ''
      and not exists (
        select 1
        from public.facturacion_lineas_importadas g
        where g.fecha_factura is not null
          and upper(regexp_replace(coalesce(
            nullif(trim(g.factura), ''),
            nullif(trim(g.codigo_interno_factura), ''),
            nullif(trim(g.raw_data ->> 'DOCUMENTO'), ''),
            ''
          ), '[^[:alnum:]]', '', 'g')) = l.documento_clave
      )
  ), preparadas as (
    select
      h.*,
      case
        when h.emision ~ '^[0-9]{8}$' then
          case
            when substring(h.emision from 5 for 2)::integer between 1 and 12
              and substring(h.emision from 7 for 2)::integer between 1 and 31
            then to_date(h.emision, 'YYYYMMDD')
            else null
          end
        else null
      end as fecha_recuperada
    from huerfanas h
  ), auditadas as (
    select
      p.*,
      p.fecha_recuperada is null
        or to_char(p.fecha_recuperada, 'YYYYMMDD') <> p.emision as fecha_invalida
    from preparadas p
  )
  select
    count(*)::integer,
    count(distinct documento_clave)::integer,
    count(*) filter (where fecha_invalida)::integer
  into v_lineas, v_facturas, v_invalidas
  from auditadas;

  if v_invalidas > 0 then
    raise exception
      'Backfill 29/07 cancelado: % lineas huerfanas tienen EMISION invalida',
      v_invalidas;
  end if;

  if not (
    (v_lineas = 0 and v_facturas = 0)
    or (v_lineas = 22 and v_facturas = 17)
  ) then
    raise exception
      'Backfill 29/07 cancelado: se esperaban 22 lineas/17 facturas (o 0/0 si ya fue aplicado), pero hay %/%',
      v_lineas, v_facturas;
  end if;

  with lote as (
    select
      f.id,
      upper(regexp_replace(coalesce(
        nullif(trim(f.factura), ''),
        nullif(trim(f.codigo_interno_factura), ''),
        nullif(trim(f.raw_data ->> 'DOCUMENTO'), ''),
        ''
      ), '[^[:alnum:]]', '', 'g')) as documento_clave,
      trim(f.raw_data ->> 'EMISION') as emision
    from public.facturacion_lineas_importadas f
    where f.fecha_factura is null
      and f.origen_sistema in ('new_xml_facturacion_os', 'new_xml_facturacion_directa')
      and f.importado_en >= timestamptz '2026-07-29 00:00:00+00'
      and f.importado_en <  timestamptz '2026-07-30 00:00:00+00'
      and nullif(trim(f.raw_data ->> 'EMISION'), '') is not null
  ), huerfanas as (
    select l.*
    from lote l
    where l.documento_clave <> ''
      and not exists (
        select 1
        from public.facturacion_lineas_importadas g
        where g.fecha_factura is not null
          and upper(regexp_replace(coalesce(
            nullif(trim(g.factura), ''),
            nullif(trim(g.codigo_interno_factura), ''),
            nullif(trim(g.raw_data ->> 'DOCUMENTO'), ''),
            ''
          ), '[^[:alnum:]]', '', 'g')) = l.documento_clave
      )
  )
  update public.facturacion_lineas_importadas f
  set fecha_factura = to_date(h.emision, 'YYYYMMDD')
  from huerfanas h
  where f.id = h.id;
end;
$migration$;

-- La regla persistida es la misma que usa el importador. Se excluyen lineas
-- vinculadas a una OS: una coincidencia asi seria una inconsistencia que no
-- debe convertirse silenciosamente en una venta de maquina.
do $migration$
begin
  if exists (
    select 1
    from public.facturacion_lineas_importadas f
    where nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is not null
      and (
        left(upper(trim(coalesce(f.cod_mercaderia, ''))), 5) = 'VEIC_'
        or lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%maquin%'
        or (
          lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%tipo:%'
          and lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%modelo:%'
          and (
            lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%casis:%'
            or lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%chasis:%'
          )
        )
      )
  ) then
    raise exception 'Migracion cancelada: existen lineas con aspecto de maquina vinculadas a una OS; requieren revision manual';
  end if;
end;
$migration$;

update public.facturacion_lineas_importadas f
set
  grupo_normalizado = 'Maquinarias',
  marca_normalizada = case
    when concat_ws(' ', f.marca_normalizada::text, f.raw_data ->> 'MARCA', f.mercaderia, f.observacion) ~* 'CLAAS'
      then 'CLAAS'::public.marca
    when concat_ws(' ', f.marca_normalizada::text, f.raw_data ->> 'MARCA', f.mercaderia, f.observacion) ~* 'HORSCH'
      then 'HORSCH'::public.marca
    else f.marca_normalizada
  end,
  raw_data = jsonb_set(coalesce(f.raw_data, '{}'::jsonb), '{canonical_line_type}', '"Maquinarias"'::jsonb, true)
where f.origen_sistema in ('new_xml_facturacion_os', 'new_xml_facturacion_directa')
  and nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is null
  and (
    left(upper(trim(coalesce(f.cod_mercaderia, ''))), 5) = 'VEIC_'
    or (
      lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%tipo:%'
      and lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%modelo:%'
      and (
        lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%casis:%'
        or lower(concat_ws(' ', f.mercaderia, f.observacion)) like '%chasis:%'
      )
    )
  )
  and (
    coalesce(f.grupo_normalizado, '') <> 'Maquinarias'
    or coalesce(f.raw_data ->> 'canonical_line_type', '') <> 'Maquinarias'
  );

do $migration$
declare
  v_maquinas integer;
begin
  select count(distinct upper(regexp_replace(coalesce(
    nullif(trim(f.factura), ''),
    nullif(trim(f.codigo_interno_factura), ''),
    nullif(trim(f.raw_data ->> 'DOCUMENTO'), ''),
    ''
  ), '[^[:alnum:]]', '', 'g')))::integer
  into v_maquinas
  from public.facturacion_lineas_importadas f
  where upper(regexp_replace(coalesce(
    nullif(trim(f.factura), ''),
    nullif(trim(f.codigo_interno_factura), ''),
    nullif(trim(f.raw_data ->> 'DOCUMENTO'), ''),
    ''
  ), '[^[:alnum:]]', '', 'g')) in (
    '0010010004754', '0010010004784', '0010010004824',
    '0010010004826', '0010010004829', '0010010004837'
  )
    and f.fecha_factura is not null
    and f.grupo_normalizado = 'Maquinarias'
    and coalesce(f.raw_data ->> 'canonical_line_type', '') = 'Maquinarias';

  if v_maquinas <> 6 then
    raise exception
      'Migracion cancelada: solo % de las 6 facturas de maquina quedaron fechadas y clasificadas',
      v_maquinas;
  end if;
end;
$migration$;

create or replace function public.ventas_area_movimientos_base(
  p_desde date,
  p_hasta date,
  p_sucursal text default null,
  p_buscar text default null
)
returns table (
  linea_id text,
  fecha date,
  factura text,
  cliente text,
  sucursal text,
  concepto text,
  total_venta numeric,
  metodologia text,
  vinculada_os boolean,
  es_nota_credito boolean,
  os_numero text,
  codigo text,
  codigo_fabricante text,
  descripcion text,
  cantidad numeric,
  marca text,
  modelo text,
  chasis text,
  area_calculada text
)
language sql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '30s'
as $$
  with movimientos as (
    select
      f.id::text as linea_id,
      f.fecha::date as fecha,
      nullif(trim(f.cod_factura), '') as factura,
      f.entidad_nombre as cliente,
      f.sucursal::text as sucursal,
      case
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%maquin%' then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%repuesto%' then 'Repuestos'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%kilometr%' then 'Kilometraje'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%tercero%' then 'Terceros'
        when lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%servic%'
          or lower(trim(coalesce(f.grupo_fx, f.grupo, ''))) like '%mano de obra%' then 'Servicio'
        else 'Otros'
      end as concepto,
      coalesce(f.total_venta, 0)::numeric as total_venta,
      'historico'::text as metodologia,
      false as vinculada_os,
      false as es_nota_credito,
      null::text as os_numero,
      null::text as codigo,
      null::text as codigo_fabricante,
      nullif(trim(coalesce(f.grupo_fx, f.grupo)), '') as descripcion,
      coalesce(f.cantidad, 0)::numeric as cantidad,
      null::text as marca,
      '{}'::jsonb as raw_data
    from public.facturacion f
    where f.fecha::date between p_desde and least(p_hasta, date '2026-06-30')
      and not coalesce(f.excluido_de_reportes, false)
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'

    union all

    select
      f.id::text,
      f.fecha_factura::date,
      coalesce(nullif(trim(f.factura), ''), nullif(trim(f.codigo_interno_factura), '')),
      f.entidad_nombre,
      f.sucursal::text,
      case
        when left(upper(trim(coalesce(f.cod_mercaderia, ''))), 5) = 'VEIC_'
          or (
            lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%tipo:%'
            and lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%modelo:%'
            and (
              lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%casis:%'
              or lower(coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')) like '%chasis:%'
            )
          )
        then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%maquin%' then 'Maquinarias'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%repuesto%' then 'Repuestos'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%kilometr%' then 'Kilometraje'
        when lower(trim(
          coalesce(f.grupo_normalizado, f.subgrupo_original, '') || ' ' ||
          coalesce(f.mercaderia, '') || ' ' || coalesce(f.observacion, '')
        )) like '%tercero%' then 'Terceros'
        when lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%servic%'
          or lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) like '%mano de obra%' then 'Servicio'
        else 'Otros'
      end,
      coalesce(f.total_venta, 0)::numeric,
      'actual'::text,
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), '') is not null,
      coalesce(f.raw_data ->> 'canonical_document_kind', '') = 'NotaCredito'
        or upper(coalesce(public.valor_json_insensible(f.raw_data, array['ESPECIE']), '')) like '%NCC%'
        or coalesce(f.total_venta, 0) < 0,
      nullif(trim(coalesce(f.raw_data ->> 'linked_service_order', '')), ''),
      nullif(trim(f.cod_mercaderia), ''),
      nullif(trim(f.codigo_fabricante), ''),
      coalesce(nullif(trim(f.mercaderia), ''), nullif(trim(f.observacion), ''), nullif(trim(f.subgrupo_original), '')),
      coalesce(f.cantidad, 0)::numeric,
      f.marca_normalizada::text,
      coalesce(f.raw_data, '{}'::jsonb)
    from public.facturacion_lineas_importadas f
    where f.fecha_factura is not null
      and f.fecha_factura::date between greatest(p_desde, date '2026-07-01') and p_hasta
      and upper(trim(coalesce(f.moneda, 'USD'))) = 'USD'
  ), clasificados as (
    select
      m.*,
      case
        when m.metodologia = 'historico' then case
          when m.concepto = 'Maquinarias' then 'maquinas'
          when m.concepto = 'Repuestos' then 'repuestos'
          when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
          else 'otros'
        end
        when m.concepto = 'Maquinarias' then 'maquinas'
        when m.vinculada_os then 'servicios'
        when m.concepto = 'Repuestos' then 'repuestos'
        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'revision'
        else 'otros'
      end as area_calculada
    from movimientos m
  ), filtrados as (
    select *
    from clasificados c
    where (
        p_sucursal is null or trim(p_sucursal) = '' or upper(trim(p_sucursal)) = 'TODAS'
        or upper(coalesce(c.sucursal, '')) = upper(trim(p_sucursal))
      )
      and (
        p_buscar is null or trim(p_buscar) = ''
        or coalesce(c.factura, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.cliente, '') ilike '%' || trim(p_buscar) || '%'
        or c.concepto ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.os_numero, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.codigo_fabricante, '') ilike '%' || trim(p_buscar) || '%'
        or coalesce(c.descripcion, '') ilike '%' || trim(p_buscar) || '%'
        or c.raw_data::text ilike '%' || trim(p_buscar) || '%'
      )
  )
  select
    f.linea_id, f.fecha, f.factura, f.cliente, f.sucursal, f.concepto,
    f.total_venta, f.metodologia, f.vinculada_os, f.es_nota_credito,
    f.os_numero, f.codigo, f.codigo_fabricante, f.descripcion, f.cantidad, f.marca,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias' then
      regexp_replace(
        coalesce(
          nullif(trim(public.valor_json_insensible(f.raw_data, array['MODELO', 'MODEL'])), ''),
          nullif(trim((regexp_match(coalesce(f.descripcion, ''), '(?i)MODELO[[:space:]]*:[[:space:]]*([^|;]+)'))[1]), ''),
          f.descripcion
        ),
        '[[:space:]]*[-·]?[[:space:]]*(CHASIS|CASIS)[[:space:]]*:.*$', '', 'i'
      )
    else null end as modelo,
    case when f.metodologia = 'actual' and f.concepto = 'Maquinarias'
      then public.extraer_chasis_venta_maquina(f.descripcion, f.raw_data, f.os_numero)
      else null end as chasis,
    f.area_calculada
  from filtrados f;
$$;

revoke all on function public.ventas_area_movimientos_base(date, date, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
