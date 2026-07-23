-- Corrige un lote de importacion legacy de facturacion historica (Santa Rita,
-- tipo Servicio, ~nov/2017 a mar/2018) donde total_venta quedo multiplicado
-- por 1.000.000 respecto del monto real. Detectado porque el asistente de
-- datos mostraba "el dia con mayor facturacion" con cifras de miles de
-- millones de USD.
--
-- Alcance: exactamente las filas que (a) son >= 100.000.000 y (b) al dividir
-- por 1.000.000 dan un valor de 2 decimales exacto (consistente con un monto
-- real en USD). Se verifico manualmente que son 70 filas antes de escribir
-- esta migracion; si esa cantidad cambio, la migracion aborta en vez de
-- corregir un conjunto distinto al revisado.
--
-- Las filas que NO encajan con ese factor (12 al momento de este analisis)
-- quedan intactas a proposito: no hay un factor de correccion confiable para
-- ellas y requieren revision manual contra la fuente original.

create table if not exists public.facturacion_correcciones_20260723 as
select *, now() as respaldado_en
from public.facturacion
where total_venta >= 100000000
  and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01
with no data;

-- Tabla de respaldo/auditoria, no expuesta a la app: RLS activo sin policies
-- deja afuera a los roles anon/authenticated; solo la service role o el SQL
-- editor pueden leerla.
alter table public.facturacion_correcciones_20260723 enable row level security;

do $$
declare
  filas_afectadas integer;
  filas_esperadas constant integer := 70;
begin
  select count(*) into filas_afectadas
  from public.facturacion
  where total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  if filas_afectadas <> filas_esperadas then
    raise exception
      'Se esperaban % filas con el error de escala x1.000.000 y se encontraron %. Revisar antes de corregir: los datos cambiaron desde el diagnostico.',
      filas_esperadas, filas_afectadas;
  end if;

  insert into public.facturacion_correcciones_20260723
  select *, now()
  from public.facturacion
  where total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  update public.facturacion
  set total_venta = round(total_venta / 1000000.0, 2)
  where total_venta >= 100000000
    and abs(total_venta - round(total_venta / 1000000.0, 2) * 1000000) < 0.01;

  raise notice 'Corregidas % filas de facturacion (Santa Rita, Servicio, nov/2017-mar/2018). Respaldo en public.facturacion_correcciones_20260723.', filas_afectadas;
end $$;
