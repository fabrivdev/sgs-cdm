-- Excluye de reportes (dashboard, KPIs y asistente) las filas de facturacion
-- historica con montos implausibles, sin corregirlas ni borrarlas.
--
-- La migracion anterior corrigio 70 filas con factor exacto x1.000.000.
-- Despues de esa correccion quedan 12 filas sin un factor reconstruible:
-- Santa Rita, Servicio, nov/2017 a mar/2018. Una base sin ese historico puede
-- tener 0. Cualquier otro total aborta para no marcar datos por heuristica.
--
-- public.facturacion_lineas_importadas (sistema nuevo) no se toca.

alter table public.facturacion
  add column if not exists excluido_de_reportes boolean not null default false;

do $$
declare
  filas_pendientes integer;
  filas_lote integer;
  filas_esperadas constant integer := 12;
begin
  select
    count(*),
    count(*) filter (where excluido_de_reportes = false)
  into filas_lote, filas_pendientes
  from public.facturacion
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta > 50000000;

  if filas_lote not in (0, filas_esperadas) then
    raise exception
      'Se esperaban 0 o % filas remanentes implausibles dentro de Santa Rita/Servicio/nov-2017 a mar-2018 y se encontraron %.',
      filas_esperadas,
      filas_lote;
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
    'Marcadas % filas pendientes como excluido_de_reportes dentro del lote auditado.',
    filas_pendientes;
end $$;
