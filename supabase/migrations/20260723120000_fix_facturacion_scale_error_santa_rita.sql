-- Corrige un lote de importacion legacy de facturacion historica (Santa Rita,
-- tipo Servicio, nov/2017 a mar/2018) donde total_venta quedo multiplicado
-- por 1.000.000 respecto del monto real.
--
-- Alcance: solamente Santa Rita, tipo Servicio, entre noviembre de 2017 y
-- marzo de 2018, y dentro de ese lote las filas que (a) son >= 100.000.000 y
-- (b) al dividir por 1.000.000 dan un valor de 2 decimales exacto
-- (consistente con un monto real en USD). Se verifico manualmente que son 70
-- filas. Una base sin ese historico puede tener 0; cualquier otra cantidad
-- aborta para no corregir un conjunto distinto al revisado.
--
-- Las 12 filas que no encajan con ese factor quedan intactas: no hay un
-- factor de correccion confiable para ellas y requieren revision manual.

create table if not exists public.facturacion_correcciones_20260723 as
select *, now() as respaldado_en
from public.facturacion
where sucursal = 'Santa Rita'::public.sucursal
  and tipo = 'Servicio'::public.tipo_facturacion
  and fecha >= date '2017-11-01'
  and fecha < date '2018-04-01'
  and total_venta >= 100000000
  and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01
with no data;

-- Tabla de respaldo/auditoria, no expuesta a la app: RLS activo sin policies
-- deja afuera a anon/authenticated; solo service_role o SQL editor la leen.
alter table public.facturacion_correcciones_20260723 enable row level security;

do $$
declare
  filas_afectadas integer;
  filas_esperadas constant integer := 70;
begin
  select count(*) into filas_afectadas
  from public.facturacion
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  if filas_afectadas not in (0, filas_esperadas) then
    raise exception
      'Se esperaban 0 o % filas con error de escala dentro de Santa Rita/Servicio/nov-2017 a mar-2018 y se encontraron %.',
      filas_esperadas,
      filas_afectadas;
  end if;

  if filas_afectadas = 0 then
    raise notice 'No hay filas pendientes con error de escala dentro del lote auditado.';
    return;
  end if;

  insert into public.facturacion_correcciones_20260723
  select *, now()
  from public.facturacion
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  update public.facturacion
  set total_venta = round(total_venta / 1000000.0, 2)
  where sucursal = 'Santa Rita'::public.sucursal
    and tipo = 'Servicio'::public.tipo_facturacion
    and fecha >= date '2017-11-01'
    and fecha < date '2018-04-01'
    and total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  raise notice
    'Corregidas % filas de facturacion. Respaldo en public.facturacion_correcciones_20260723.',
    filas_afectadas;
end $$;
