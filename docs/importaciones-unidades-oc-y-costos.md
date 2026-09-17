# Importaciones: pedido y unidad física

## Reglas

- CLAAS identifica cada unidad con CLA + número final de OC + sufijo. Una cabecera de 4 unidades genera CLA111-1 a CLA111-4. Las fechas de embarque no cambian las llaves.
- El maestro antiguo puede dividir una misma OC en varias cabeceras. Se conservan primero las llaves válidas de cabeceras individuales y se evita generar duplicados en las restantes.
- Las referencias antiguas sin número de OC utilizable (por ejemplo VER) no permiten inventar una llave CLAAS: se conservan y quedan identificadas en la consulta de control para completar su dato real.
- OC y fecha de embarque se cargan generalmente. La pantalla diferencia valor por unidad y total de las unidades de esta cabecera (no el total de otras líneas de la OC).
- Un total se distribuye explícitamente en partes iguales; la última unidad absorbe los centavos. No es un reparto implícito sin aviso.
- Fecha y valor OC tienen indicadores de ajuste separados. Editar el chasis o la factura no congela esos campos. Cambiar la previsión general no pisa ajustes individuales, ni siquiera una fecha borrada intencionalmente.
- Se puede volver expresamente al embarque o valor OC general desde la unidad. El importe actualmente asignado se muestra por separado, porque puede diferir tras ajustes.
- La factura del proveedor usa valor_factura_proveedor. No se guarda en costo_final ni en el valor de venta de la NP.
- Diferencia = valor de factura del proveedor menos valor OC de la unidad. Solo se calcula si están ambos importes y las monedas son iguales; el usuario debe ingresar ambos en la misma base impositiva. No hay conversión automática.
- El costo definitivo con IVA solo se edita tras identificar inequívocamente la máquina en stock. Esta pantalla lo registra: el stock actual no tiene una columna de costo desde la cual leerlo automáticamente.
- Los costos antiguos se conservan. No se convierten automáticamente en importes de factura del proveedor ni se borran por no tener stock vigente; se muestran como referencia histórica fuera de stock.
- Los documentos pertenecen a la cabecera y se rotulan como compartidos. Los datos de factura y los importes editados pertenecen a la unidad.
- Cuando hay una NP, la edición individual mantiene el detalle estructurado de facturas del proveedor. No permite dar distinta moneda o fecha a otra unidad de la misma factura compartida; una factura distinta se registra con otro número.
- Guardar una sección envía solo sus campos modificados. El servidor limita los campos admitidos y exige los permisos actuales de gestión.

## Aplicación

### Seguimiento de llegada

Aplicar además `20260917130000_import_arrival_lifecycle.sql` después de la migración inicial.
La carga manual siempre empieza Planificado. Una ETA no prueba embarque y una factura del proveedor tampoco.
Desde cada unidad se registra En tránsito y luego Arribado con fecha real no futura y chasis.
Completado se calcula al consultar: exige fecha de arribo y coincidencia física única del mismo chasis en stock. No exige que la importación esté vinculada a la NP que reserva esa máquina.
Si el stock llega después del registro de arribo, la siguiente actualización de la vista confirma la unidad sin otra edición manual.
La situación comercial (stock, reservado, vendido o en parque) es independiente de estas etapas.
Los estados antiguos de recepción sin fecha quedan Arribado, requieren completar la fecha y no se inventan fechas históricas.
Las cancelaciones existentes se conservan como filtro, sin permitir que una cancelada se reciba.

Corrección adicional: aplicar `20260917140000_confirm_import_arrival_by_physical_chassis.sql`.
La señal `stock_fisico_confirmado` separa la llegada de la disponibilidad comercial. Reservado y Completado pueden coexistir.
Los conflictos comerciales de NP no ocultan la llegada física; se mantienen visibles en Situación. Un chasis duplicado en stock sí impide confirmar.
No se modifican vínculos de NP, reservas, importes, chasis o fechas. Los arribos ya registrados se recalculan al consultar, sin volver a recibirlos.

Aplicar supabase/migrations/20260917120000_fix_import_unit_keys_and_purchase_values.sql antes de usar los nuevos editores. El frontend bloquea la carga general si no verifica la estructura nueva.

El precio OC anterior se conserva como referencia por unidad, que era la forma en que la vista anterior lo mostraba. Las fechas previamente marcadas manuales se preservan conservadoramente. La factura de proveedor se recupera únicamente de vínculos de factura identificados; no se infiere desde un costo histórico.

No se modifican las NP, sus modelos, los chasis, las fechas de recepción ni los importes de venta existentes. La corrección de la RPC de proveedor evita contaminar esos importes en futuras cargas; no reescribe valores pasados sin evidencia.

## Verificación local

- scripts/test-import-unit-purchase-values.mjs: ejecuta la migración real en PostgreSQL aislado; verifica llaves, OC en varias cabeceras, ajustes, redondeo, permisos, stock, reaplicación y RPC de proveedor.
- src/lib/machineImportValues.test.ts: comprueba importes, diferencias y aislamiento de guardados por sección.
- La base productiva debe ser actualizada por el usuario. Los tests locales no prueban que la migración esté aplicada allí.
