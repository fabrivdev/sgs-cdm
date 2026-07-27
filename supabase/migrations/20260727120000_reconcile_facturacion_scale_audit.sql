-- Reconciliacion forward-only para instalaciones donde alguna version
-- anterior de las migraciones 20260723/20260724 ya fue aplicada manualmente
-- o quedo registrada antes de que se corrigiera su secuencia.
--
-- Solo opera sobre el lote auditado:
--   Santa Rita + Servicio + 2017-11-01..2018-03-31.
-- Estados aceptados:
--   * 0 o 70 filas aun escaladas x1.000.000.
--   * 0 o 12 filas remanentes con monto implausible > 50.000.000.
-- Cualquier otro conteo aborta para impedir una correccion heuristica.

alter table public.facturacion
  add column if not exists excluido_de_reportes boolean not null default false;

create table if not exists public.facturacion_correcciones_20260727 (
  facturacion_id uuid primary key,
  total_venta_anterior numeric not null,
  motivo text not null,
  respaldado_en timestamptz not null default now()
);

alter table public.facturacion_correcciones_20260727 enable row level security;

do $$
declare
  filas_escaladas integer;
  filas_remanentes integer;
  filas_esperadas_escala constant integer := 70;
  filas_esperadas_remanentes constant integer := 12;
begin
  select count(*) into filas_escaladas
  from public.facturacion
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  if filas_escaladas not in (0, filas_esperadas_escala) then
    raise exception
      'Reconciliacion detenida: se esperaban 0 o % filas escaladas dentro del lote auditado y se encontraron %.',
      filas_esperadas_escala,
      filas_escaladas;
  end if;

  if filas_escaladas = filas_esperadas_escala then
    insert into public.facturacion_correcciones_20260727 (
      facturacion_id,
      total_venta_anterior,
      motivo
    )
    select
      id,
      total_venta,
      'Correccion de escala x1.000.000; Santa Rita/Servicio/nov-2017 a mar-2018'
    from public.facturacion
    where sucursal = 'Santa Rita'::public.sucursal
      and tipo = 'Servicio'::public.tipo_facturacion
      and fecha >= date '2017-11-01'
      and fecha < date '2018-04-01'
      and total_venta >= 100000000
      and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01
    on conflict (facturacion_id) do nothing;

    update public.facturacion
    set
      total_venta = round(total_venta / 1000000.0, 2),
      excluido_de_reportes = false
    where sucursal = 'Santa Rita'::public.sucursal
      and tipo = 'Servicio'::public.tipo_facturacion
      and fecha >= date '2017-11-01'
      and fecha < date '2018-04-01'
      and total_venta >= 100000000
      and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;
  end if;

  -- Si una version anterior marco tambien las 70 filas luego corregidas,
  -- restaurarlas mediante el respaldo original o el de esta reconciliacion.
  update public.facturacion f
  set excluido_de_reportes = false
  where f.excluido_de_reportes = true
    and f.total_venta <= 50000000
    and (
      exists (
        select 1
        from public.facturacion_correcciones_20260723 b
        where b.id = f.id
      )
      or exists (
        select 1
        from public.facturacion_correcciones_20260727 b
        where b.facturacion_id = f.id
      )
    );

  select count(*) into filas_remanentes
  from public.facturacion
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta > 50000000;

  if filas_remanentes not in (0, filas_esperadas_remanentes) then
    raise exception
      'Reconciliacion detenida: se esperaban 0 o % filas remanentes implausibles dentro del lote auditado y se encontraron %.',
      filas_esperadas_remanentes,
      filas_remanentes;
  end if;

  update public.facturacion
  set excluido_de_reportes = true
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta > 50000000
    and excluido_de_reportes = false;

  raise notice
    'Reconciliacion finalizada: % filas de escala detectadas; % filas remanentes excluidas.',
    filas_escaladas,
    filas_remanentes;
end $$;
