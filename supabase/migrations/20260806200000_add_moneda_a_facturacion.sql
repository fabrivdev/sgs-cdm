-- Persiste la moneda (USD/GS) de cada factura/linea importada. Hasta ahora
-- se perdia: mapFacturaVentasSheet (newSystemXml.ts) ya calculaba bien
-- row.currency (USD si TOTALUSD viene poblado en el XML de TOTVS, si no se
-- resuelve por MONORI/TOTALGS), pero el path de persistencia real
-- (newSystemPersist.ts) reconstruia el insert desde cero sin guardar ese
-- valor -- quedaba 100% de las lineas sin moneda identificable. El codigo
-- que llena esta columna ya se corrigio en newSystemPersist.ts e
-- ImportarTab.tsx.

alter table public.facturacion_lineas_importadas
  add column if not exists moneda text;

alter table public.facturacion_lineas_importadas
  drop constraint if exists facturacion_lineas_moneda_check;
alter table public.facturacion_lineas_importadas
  add constraint facturacion_lineas_moneda_check
  check (moneda is null or moneda in ('USD', 'GS', 'UNKNOWN'));

alter table public.facturacion
  add column if not exists moneda text;

alter table public.facturacion
  drop constraint if exists facturacion_moneda_check;
alter table public.facturacion
  add constraint facturacion_moneda_check
  check (moneda is null or moneda in ('USD', 'GS', 'UNKNOWN'));

-- El upsert de "facturacion" (newSystemPersist.ts e ImportarTab.tsx, el
-- importador viejo de grillas) hace onConflict contra este indice -- se
-- amplia para incluir moneda, si no dos lineas de la misma factura/tipo/
-- fecha/etc en distinta moneda seguirian sumandose en una sola fila de
-- total_venta sin que la columna nueva sirva de nada. El importador viejo
-- (sin dato real de moneda) ahora graba "UNKNOWN" en vez de null para
-- que este indice lo siga tratando como la misma fila en cada reimport
-- (Postgres nunca matchea null contra null en un indice unico).
drop index if exists public.facturacion_unique_import;
create unique index facturacion_unique_import
  on public.facturacion (cod_factura, tipo, fecha, cod_entidad, entidad_nombre, sucursal, grupo, grupo_fx, moneda);
