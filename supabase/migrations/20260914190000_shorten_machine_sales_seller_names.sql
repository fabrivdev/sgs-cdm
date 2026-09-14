-- Presenta los vendedores de Ventas de Maquinas como nombre + primer apellido.
-- Mantiene los alias entre historico y sistema actual definidos en la migracion anterior.

create or replace function public.ventas_normalizar_vendedor_maquinas(p_vendedor text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with limpio as (
    select
      upper(btrim(coalesce(p_vendedor, ''))) as original,
      upper(regexp_replace(
        regexp_replace(btrim(coalesce(p_vendedor, '')), '^[0-9]+[[:space:]]*-[[:space:]]*', ''),
        '[[:space:]]+', ' ', 'g'
      )) as nombre
  ), clave as (
    select original, nombre,
      translate(nombre, 'ÁÉÍÓÚÜÑ', 'AEIOUUN') as valor,
      regexp_split_to_array(nombre, '[[:space:]]+') as palabras
    from limpio
  )
  select case
    when nombre = '' then null
    when original like '000007%' or (valor like '%CARLOS%' and valor like '%BENITEZ%')
      then 'CARLOS BENITEZ'
    when original like '000003%' or (valor like '%ANDRES%' and valor like '%CANETE%')
      then 'LUIS CAÑETE'
    when original like '000011%' or (valor like '%RUBEN%' and valor like '%CENTURION%')
      then 'RUBEN CENTURION'
    when original like '000005%' or (valor like '%HELWIN%' and valor like '%LOPEZ%')
      then 'HELWIN LOPEZ'
    when original like '000006%' or (valor like '%OSCAR%' and valor like '%BENITEZ%')
      then 'OSCAR BENITEZ'
    when original like '000004%' or (valor like '%JUAN%' and valor like '%APODACA%')
      then 'JUAN APODACA'
    when cardinality(palabras) <= 2 then nombre
    when cardinality(palabras) = 3 then palabras[1] || ' ' || palabras[2]
    else palabras[1] || ' ' || palabras[cardinality(palabras) - 1]
  end
  from clave;
$$;

revoke all on function public.ventas_normalizar_vendedor_maquinas(text) from public, anon;
grant execute on function public.ventas_normalizar_vendedor_maquinas(text) to authenticated;

notify pgrst, 'reload schema';
