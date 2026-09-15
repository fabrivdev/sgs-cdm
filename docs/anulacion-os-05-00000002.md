# Anulación confirmada de OS 05-00000002

El usuario confirmó que la OS y la factura 0050010001425 fueron anuladas y ya
no están ni en el archivo vigente de OS ni en el de ventas. El resultado de su
consulta identificó BUEN FUTURO S.A., chasis 000085, sin trabajo ni liquidación.
La protección de reconciliación sólo encontró un número viejo guardado en la OS.

## Corrección puntual

Ejecutar manualmente
`supabase/migrations/20260915130000_archive_confirmed_cancelled_service_order.sql`.
Requiere el archivo de auditoría de `20260911190000`. El commit/push no aplica SQL.

1. Verifica OS, cliente, chasis completo con ceros, factura y origen nuevo. Rechaza
   una clave duplicada, un trabajo nuevo o una comisión liquidada. Bloquea escritura
   concurrente mientras se verifica y archiva; cualquier error revierte la transacción.
2. Copia la OS completa al archivo existente, incluyendo las jornadas originales y
   cualquier fila residual de factura encontrada. La nota registra la confirmación
   manual; no pretende haber consultado en vivo TOTVS o los archivos.
3. Desactiva/invalida jornadas pendientes sin borrarlas ni cambiar horas/pagos;
   marca `facturacion.excluido_de_reportes=true`. Si quedan líneas importadas de
   esa factura, las retira de la tabla operativa después de copiarlas. Los historiales
   derivados con FK/cascada se retiran junto con esas líneas.
4. Retira únicamente esta OS de la tabla operativa: ya no aparece en detalle,
   historial de máquina ni como OS vigente en dashboard. Si no había filas de venta,
   no cambia el total monetario: elimina la OS obsoleta y su participación pendiente.

La verificación final devuelve `os_operativas=0`, `jornadas_vigentes=0`,
`lineas_factura_operativas=0`, `copias_archivadas>=1`. Repetir el SQL no duplica
la copia. No se fusionan clientes, no se cambian reglas de horas, no se corrigen
otras OS y no se convierte cualquier ausencia en anulación automática.

La recuperación requiere revisión manual: el archivo conserva el registro y las
filas originales bajo `registro.anulacion_confirmada`; no borrarlas del archivo.
Una futura reimportación de un archivo viejo podría reintroducir datos: esta
corrección puntual no instala un bloqueo general de imports ni declara otras
ausencias como anuladas.

Prueba reproducible sin producción: `node scripts/verify-cancelled-os-sql.mjs`.
