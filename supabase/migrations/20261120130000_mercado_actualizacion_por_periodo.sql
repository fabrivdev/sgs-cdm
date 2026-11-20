begin;

create function public.actualizar_mercado_por_periodo(
  p_familia text,
  p_desde integer,
  p_hasta integer,
  p_datos jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tabla text;
  claves jsonb;
  escritas integer;
begin
  if not coalesce(
    public.has_role(auth.uid(), 'superadmin')
    or (public.has_role(auth.uid(), 'admin') and public.has_section_access(auth.uid(), 'admin.importaciones')),
    false
  ) then
    raise exception 'Se requiere acceso a Administración → Datos.' using errcode = '42501';
  end if;

  tabla := case p_familia
    when 'tractores' then 'mercado_tractores'
    when 'cosechadoras' then 'mercado_cosechadoras'
  end;
  if tabla is null or p_desde is null or p_hasta is null
    or p_desde < 2000 * 12 or p_hasta > 2100 * 12 + 11 or p_desde > p_hasta then
    raise exception 'Familia o período inválido.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_datos) is distinct from 'array' then
    raise exception 'La carga debe contener movimientos.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_datos) = 0 or exists (
    select 1 from jsonb_array_elements(p_datos) as elemento(fila)
    where case when jsonb_typeof(fila) = 'array' then
      jsonb_array_length(fila) <> 11
      or jsonb_typeof(fila->0) is distinct from 'string'
      or nullif(btrim(fila->>0), '') is null
      or exists (
        select 1 from generate_series(3, 8) as campo(indice)
        where jsonb_typeof(fila->indice) is distinct from 'string'
      )
      or case when jsonb_typeof(fila->9) = 'number' and jsonb_typeof(fila->10) = 'number' then
        (fila->>9)::numeric <= 0 or mod((fila->>9)::numeric, 1) <> 0 or (fila->>10)::numeric < 0
      else true end
      or case when (fila->>1) ~ '^[0-9]{4}$' and (fila->>2) ~ '^([1-9]|1[0-2])$' then
        ((fila->>1)::integer * 12 + (fila->>2)::integer - 1) not between p_desde and p_hasta
      else true end
    else true end
  ) then
    raise exception 'La carga está vacía o contiene movimientos inválidos o fuera del período indicado.' using errcode = '22023';
  end if;

  select jsonb_object_agg(fila->>0, true) into claves
  from jsonb_array_elements(p_datos) as elemento(fila);
  if (select count(*) from jsonb_object_keys(claves)) <> jsonb_array_length(p_datos) then
    raise exception 'La carga contiene movimientos repetidos.' using errcode = '22023';
  end if;

  execute format($sql$
    insert into public.%I as base (id, datos) values (1, $3)
    on conflict (id) do update set datos = (
      select coalesce(jsonb_agg(fila order by posicion), '[]'::jsonb)
      from jsonb_array_elements(base.datos) with ordinality as anterior(fila, posicion)
      where ((fila->>1)::integer * 12 + (fila->>2)::integer - 1) not between $1 and $2
    ) || excluded.datos
    where not exists (
      select 1 from jsonb_array_elements(base.datos) as anterior(fila)
      where ((fila->>1)::integer * 12 + (fila->>2)::integer - 1) not between $1 and $2
        and $4 ? (fila->>0)
    )
  $sql$, tabla) using p_desde, p_hasta, p_datos, claves;
  get diagnostics escritas = row_count;
  if escritas = 0 then
    raise exception 'Un movimiento ya figura en otro mes. Cargá un extracto que cubra ambos períodos.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.actualizar_mercado_por_periodo(text, integer, integer, jsonb) from public, anon;
grant execute on function public.actualizar_mercado_por_periodo(text, integer, integer, jsonb) to authenticated;

commit;
