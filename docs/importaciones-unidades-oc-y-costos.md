# Importaciones: pedido y unidad física

## Reglas

- CLAAS identifica cada unidad con CLA + número final de OC + sufijo. Una cabecera de 4 unidades genera CLA111-1 a CLA111-4. Las fechas de embarque no cambian las llaves.
- El maestro antiguo puede dividir una misma OC en varias cabeceras. Se conservan primero las llaves válidas de cabeceras individuales y se evita generar duplicados en las restantes.
- Las referencias antiguas sin número de OC utilizable (por ejemplo VER) no permiten inventar una llave CLAAS: se conservan y quedan identificadas en la consulta de control para completar su dato real.
- OC y fecha de embarque se cargan generalmente. La pantalla diferencia valor por unidad y total de las unidades de esta cabecera (no el total de otras líneas de la OC).
- Un total se distribuye explícitamente en partes iguales; la última unidad absorbe los centavos. No es un reparto implícito sin aviso.
- Fecha y valor OC tienen indicadores de ajuste separados. Editar el chasis o la factura no congela esos campos. Cambiar la previsión general no pisa ajustes individuales, ni siquiera una fecha borrada intencionalmente.
- Se puede volver expresamente al embarque o valor OC general desde la unidad. El importe actualmente asignado se muestra por separado, porque puede diferir tras ajustes.
- La distinción general/individual y los botones de volver al valor o embarque general solo se muestran cuando la cabecera tiene varias unidades. En pedidos 1/1 quedan fecha e importe editables sin esos rótulos; no se borran indicadores ni datos históricos.
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
Completado se calcula al consultar: coincidencia única del mismo chasis normalizado en stock con saldo positivo **o en Parque activo**. No exige ATA histórica ni que la importación esté vinculada a la NP que reserva esa máquina. Parque acredita que ya ingresó y fue incorporada al parque del cliente, aunque no exista stock vigente.
Si Stock o Parque se carga después, la siguiente actualización de la vista confirma la unidad sin otra edición manual. Lista, filtros, indicadores, exportación y detalle comparten `importArrivalState`.
La situación comercial (stock, reservado, vendido o en parque) es independiente de estas etapas.
Arribado corresponde exclusivamente a ATA registrada sin coincidencia vigente confirmada. Una etiqueta antigua de recepción, ETA, factura o estado comercial de una NP no prueba llegada. Sin ATA ni evidencia se conserva tránsito explícito o Planificado, con aviso de fecha faltante para la etiqueta antigua; nunca se inventan fechas históricas.
Las cancelaciones existentes se conservan como filtro, sin permitir que una cancelada se reciba.

Corrección adicional: aplicar `20260917140000_confirm_import_arrival_by_physical_chassis.sql`.
La señal `stock_fisico_confirmado` separa la llegada de la disponibilidad comercial. Reservado y Completado pueden coexistir.
Los conflictos comerciales de NP no ocultan la llegada física; se mantienen visibles en Situación. Un chasis duplicado en stock sí impide confirmar.
No se modifican vínculos de NP, reservas, importes, chasis o fechas. Los arribos ya registrados se recalculan al consultar, sin volver a recibirlos.

Corrección Stock/Parque (18/09): aplicar `20260918170000_complete_imports_by_stock_or_park_chassis.sql` después de la anterior. `stock_fisico_confirmado` ya no exige ATA; `parque_confirmado` exige chasis exacto y único en Parque activo. `chasis_ambiguo` impide completar con duplicados normalizados. Un conflicto comercial de NP no equivale a un duplicado físico. La evidencia no habilita costos por estar en Parque: `costo_stock_habilitado` mantiene su requisito separado de ATA y stock único con saldo positivo. La recepción informa Stock o Parque; no permite volver a tránsito una unidad confirmada ni anular la recepción de un chasis existente en Parque. Mantiene permisos, importes y vínculos actuales.

Control de solo lectura: `supabase/verificar_importaciones_stock_parque.sql`, consultas separadas de distribución y pendientes reales. El código anterior limitaba completar a ATA + Stock y por eso podía mostrar Arribado junto a En parque; esta migración recalcula, no reescribe registros históricos.

Aplicar supabase/migrations/20260917120000_fix_import_unit_keys_and_purchase_values.sql antes de usar los nuevos editores. El frontend bloquea la carga general si no verifica la estructura nueva.

El precio OC anterior se conserva como referencia por unidad, que era la forma en que la vista anterior lo mostraba. Las fechas previamente marcadas manuales se preservan conservadoramente. La factura de proveedor se recupera únicamente de vínculos de factura identificados; no se infiere desde un costo histórico.

No se modifican las NP, sus modelos, los chasis, las fechas de recepción ni los importes de venta existentes. La corrección de la RPC de proveedor evita contaminar esos importes en futuras cargas; no reescribe valores pasados sin evidencia.

## Verificación local

### Situación simplificada (18/09/2026)

En Importaciones, Situación usa exclusivamente Stock, Reservado, En parque, Sin chasis y Sin conciliar, además de Todas para quitar el filtro. `IMPORT_SITUATION_LABELS`, `importSituationState` e `importSituationLabel` comparten criterio en filtro, tabla, tarjetas, detalle, orden y exportación. Vendido pendiente de entrega se presenta como Reservado: sigue asignado al cliente, no disponible para otra venta. Conflicto/duplicado se presenta como Sin conciliar; se conserva la incidencia en el detalle. Chasis vacío o sin caracteres identificadores se presenta como Sin chasis; un estado desconocido con chasis queda Sin conciliar.

Es una proyección de presentación: no reescribe la disponibilidad original, no cambia Llegada/Completado, facturación, costos, NP ni datos de Stock. Los estados comerciales completos del selector de Stock de Operaciones se conservan; la reducción pertenece solo a Importaciones. No requiere SQL adicional. Pruebas locales: 50 casos de situación/llegada, filtros de operaciones, importes, tabla y detalle; no acredita producción.

### Presentación compacta (18/09/2026)

Resumen conserva tarjetas con títulos cortos: Seguimiento, Unidad, Pedido y embarque, OC vs factura y Costo de stock. Campos y botones usan nombres breves, también al editar. El estado aparece una vez en la cabecera; no mostrar Seguimiento vacío cuando no hay acciones ni avisos. Las explicaciones generales se consultan mediante ⓘ (clic/teclado/móvil), no como párrafos permanentes. Mantener avisos de fecha faltante, monedas incompatibles y stock pendiente; el costo antiguo sigue visible como Referencia histórica, sin tratarlo como costo de stock. Documentos/Recepción conservan datos, permisos y acciones. No modifica RPC, cálculos, importes ni reglas de llegada y no requiere SQL adicional.

Pruebas de regresión: `src/pages/ImportDetailDrawer.test.tsx` y tests de `machineImportValues`/`machineImportStatus`: 23 pruebas correctas, tipos, ESLint y compilación. Playwright comprobó el componente real con datos ficticios a 1366/768/390 px: ayuda bajo demanda, Enter/Escape, restauración de foco y ausencia de desbordamiento horizontal. Las 14 pruebas de conocimiento confirmaron conectividad y protección de notas personales. Verificación local, no producción.

- scripts/test-import-unit-purchase-values.mjs: ejecuta la migración real en PostgreSQL aislado; verifica llaves, OC en varias cabeceras, ajustes, redondeo, permisos, stock, reaplicación y RPC de proveedor.
- src/lib/machineImportValues.test.ts: comprueba importes, diferencias y aislamiento de guardados por sección.
- La base productiva debe ser actualizada por el usuario. Los tests locales no prueban que la migración esté aplicada allí.

Regresión Stock/Parque del 18/09: 29 pruebas de frontend correctas. PostgreSQL aislado ejecuta el SQL real y verifica normalización, stock positivo sin ATA, Parque vendido sin stock, saldo cero, Parque inactivo, duplicados, NP con otro chasis, recepción, protección de anulación, permisos y reaplicación sin cambios en datos de unidades. Verificación local, no producción.
