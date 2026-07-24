-- Excluye de reportes (dashboard, KPIs, asistente) las filas de facturacion
-- historica con montos implausibles, sin corregirlas ni borrarlas. No hay un
-- factor de escala unico reconstruible para todo el lote (ver el fix previo
-- de Santa Rita, que corrigio 70 filas con un factor exacto x1.000.000 y dejo
-- 12 sin tocar a proposito): mas seguro marcarlas y conservarlas intactas
-- para auditoria que adivinar un factor de correccion.
--
-- Alcance verificado: 82 filas con total_venta > 50.000.000 en public.facturacion,
-- todas dentro de 2017-11 a 2018-03, todas sucursal Santa Rita. Ningun otro
-- año ni sucursal tiene filas por encima del umbral (confirmado por analisis
-- previo). public.facturacion_lineas_importadas (import del sistema nuevo) no
-- tiene ninguna fila por encima del umbral, no se toca.
--
-- Si la cantidad de filas afectadas cambio desde el diagnostico, esta
-- migracion aborta en vez de marcar un conjunto distinto al revisado.

alter table public.facturacion
  add column if not exists excluido_de_reportes boolean not null default false;

do $$
declare
  filas_afectadas integer;
  filas_esperadas constant integer := 82;
begin
  select count(*) into filas_afectadas
  from public.facturacion
  where total_venta > 50000000
    and excluido_de_reportes = false;

  if filas_afectadas <> filas_esperadas then
    raise exception
      'Se esperaban % filas con total_venta > 50.000.000 sin marcar y se encontraron %. Revisar antes de marcar: los datos cambiaron desde el diagnostico.',
      filas_esperadas, filas_afectadas;
  end if;

  update public.facturacion
  set excluido_de_reportes = true
  where total_venta > 50000000
    and excluido_de_reportes = false;

  raise notice 'Marcadas % filas de facturacion con excluido_de_reportes = true (montos implausibles, Santa Rita 2017-2018).', filas_afectadas;
end $$;
