# Historial de maquina: procedencia del tipo de tiempo

El historial abierto desde el chasis conserva el tipo de tiempo informado por
la OS. Una factura o un importe de mano de obra no demuestran por si solos que
el tipo sea Cliente. Si la fuente no informa tipo de tiempo, la celda y el campo
de detalle quedan vacios: no se muestra texto de relleno, categoria ni guion.
`Por confirmar` solo se conserva cuando es un valor explicito de la fuente. No
se reescriben OS, jornadas, comisiones, categorias ni pagos.

Los repuestos se publican en el historial de un chasis solo cuando
`linked_service_order` resuelve una unica OS. Si el numero tiene mas de una
candidata, factura y OS deben tener sucursal informada y coincidente. El vinculo
unico debe pertenecer ademas al chasis solicitado. Un cruce ambiguo se omite; no
se elige por nombre de cliente porque propietario y facturado pueden diferir.

La migracion manual es
`20261001160000_preserve_machine_history_time_source.sql`. No modifica filas:
reemplaza una RPC de lectura. Las verificaciones `20261001160100` y
`20261001160200` deben devolver respectivamente `true` en
`preserves_source_time` y `unique_part_identity_guard` despues de aplicarla.
Publicar el frontend no aplica ese SQL ni acredita datos productivos.
