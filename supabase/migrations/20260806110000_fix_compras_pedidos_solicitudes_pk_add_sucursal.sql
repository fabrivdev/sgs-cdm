-- Correccion de clave: (nro_pedido, item) / (nro_solicitud, item) no
-- alcanzan como identidad del documento -- en TOTVS esos numeros se
-- numeran POR SUCURSAL (cada sucursal reinicia su propia secuencia), asi
-- que dos documentos de distinta sucursal pueden compartir el mismo
-- numero+item legitimamente sin ser el mismo documento. Verificado contra
-- datos reales: sin sucursal en la clave, solicitudes_de_compra tenia 73
-- colisiones (170 filas); con sucursal en la clave, cero colisiones sobre
-- 1.476 filas.
--
-- Tablas confirmadas vacias (el primer intento de import fallo antes de
-- escribir nada), por eso se hace drop+add de la constraint directo, sin
-- necesidad de migrar datos existentes.

alter table public.compras_pedidos drop constraint if exists compras_pedidos_pkey;
alter table public.compras_pedidos add primary key (sucursal, nro_pedido, item);

alter table public.compras_solicitudes drop constraint if exists compras_solicitudes_pkey;
alter table public.compras_solicitudes add primary key (sucursal, nro_solicitud, item);
