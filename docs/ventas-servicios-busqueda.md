# Búsqueda e identidad en Ventas de Servicios

## Condiciones visuales

Aplicar `docs/knowledge/24-Condiciones-visuales-ventas.md` antes de cambiar/publicar
la vista: una sola línea por registro, sin datos apilados ni párrafos explicativos,
importe con `$` (no `USD`), cantidades numéricas sin sufijos h/km/unid. y sin total
monetario al pie de Detalle. Conservar conteo de líneas/documentos y el `Total del
período` del resumen por período. Tests de Detalle impiden regresión de estos formatos.
Es un cambio de UI; no requiere SQL adicional al de cantidad operacional.
Validación de esta revisión: 16 pruebas de componentes/filtros, ESLint y compilación
correctos; memoria sincronizada sin conflictos y 14 pruebas del grafo/sincronizador.
No representa validación de producción ni publicación automática.

## Cantidades operacionales en el detalle

Aplicar manualmente `20260917160000_service_invoice_line_operational_quantity.sql`.
La RPC existente agrega `cantidad_os` y `unidad_cantidad`, conservando `cantidad`
original de factura y todos los demás campos financieros. No requiere reimportar.

- Mano de obra: `ordenes_servicio_importadas.servicios_cantidad`, horas-reloj ya
  calculadas por el importador deduplicando bloques de trabajo. No sumar jornadas
  ni horas de todos los técnicos ni deducir horas mediante importe/tarifa.
- Kilometraje: `ordenes_servicio_importadas.km_cantidad`.
- Repuestos y Terceros: cantidad de la línea facturada, sin sustituirla por horas.
- OS no vinculada, inexistente o con varias coincidencias normalizadas: cantidad
  operacional desconocida (`—`), sin inventar horas/km a partir de la unidad de factura.
  Cero explícito sigue siendo cero. Base sin SQL nuevo: `—` y título de SQL pendiente.
- La cantidad operacional es referencia de la OS completa, no cantidad de trabajo
  facturado en esa línea o tipo de tiempo: puede repetirse entre líneas/facturas/NC.
  No sumar estos valores como horas totales ni tratarlos como horas-persona; en OS
  mixtas no se inventa reparto por tipo. La NC conserva su importe y cantidad financiera
  negativos; la referencia de horas OS no se convierte en horas negativas.

No modifica la clasificación corregida de Comisiones, importes, pagos, exclusiones
ni totales de Clientes/Panorama/Resumen. Una sola consulta, sin consultas extra por OS.
Comprobación aislada: `node scripts/verify-service-invoice-quantity-sql.mjs`, comparando
todo el JSON previo con el nuevo (excepto los dos metadatos agregados), repetición de
OS, cantidad 1 de factura frente a 8 h OS, km, repuestos, terceros, NC, histórico,
colisiones, ceros, permisos, filtros e idempotencia. 15 pruebas de UI/filtros correctas.
No prueba que el SQL esté aplicado en producción ni valida una OS real.

## Detalle por línea de factura

El tab Detalle consulta `ventas_servicios_lineas_v2`, como Clientes. Muestra una fila
por línea canónica con factura como referencia principal y OS/chasis como complemento;
no agrupa ni deduplica por factura, OS, descripción o importe. Conserva NC negativas y
líneas históricas sin OS. La suma del detalle filtrado mantiene la población financiera.

Columnas separadas: Fecha, Factura, Sucursal, Cliente facturado, Propietario actual,
OS, Chasis, Tipo de tiempo, Código, Descripción, Cantidad y Facturado. No apilar
datos ni agregar párrafos explicativos. Propietario histórico disponible en el título
de la celda, explícitamente etiquetado sin reemplazar al propietario actual.
Importes individuales con `$` y dos decimales, sin total monetario al pie. Cantidad
ausente se muestra como desconocida, no cero. Chasis conserva acceso al historial,
que se monta solo cuando se solicita, evitando consultar técnicos al abrir Detalle.

Búsqueda normalizada local antes de mostrar líneas, con el mismo helper que Clientes.
Marca, tipo de máquina, sucursal, período y tipo de tiempo se envían a la RPC existente.
El cambio de granularidad no requiere SQL nuevo; la cantidad operacional sí requiere
la migración indicada arriba. No cambia importes, jornadas, comisiones o exclusiones.

Columnas flexibles alineadas con sus títulos, filas compactas de una sola línea y
textos largos truncados con elipsis/valor completo al pasar el cursor, sin ancho
mínimo forzado ni desplazamiento horizontal. No convertir filas en tarjetas con
etiquetas ni usar saltos de línea. Pruebas de componentes usan datos sintéticos;
verificación de producción y publicación se registran separadamente.

Validación local de la versión compacta del 17/09/2026: 14 pruebas de
Detalle/Clientes/búsqueda, ESLint y compilación correctos. Playwright comprobó 25
líneas sintéticas en anchos 1920, 1366, 1024, 768 y 390 px: ninguna celda apilada,
todos los datos sin salto de línea, sin párrafo explicativo ni desbordamiento
horizontal del documento. Textos completos conservados en títulos de celdas;
la estrechez de pantalla implica más elipsis, no una promesa de lectura íntegra
simultánea. No consulta producción.

La población sigue siendo facturación dentro del rango seleccionado; no órdenes
abiertas ni importes operativos. Las líneas, fechas, componentes e importes vienen
de `ventas_area_movimientos_base`, que no se modifica con esta corrección.

Todos los paneles usan `ventas_servicios_movimientos_enriquecidos`. Buscan por OS,
factura, chasis, cliente facturado, propietario actual, nombre del cliente en la OS,
propietario registrado en la OS, tipo de tiempo y descripción. Clientes filtra las
líneas antes de agrupar: cambiar entre propietarios y facturados conserva la misma
población y total. La búsqueda no distingue mayúsculas, acentos ni separadores.

El propietario actual sale únicamente del Parque, con chasis único. El propietario
en la OS sale de `raw_data.Nombre` o del nombre legacy cuando no hay `CLIFAC`;
no se sustituye por el receptor de la factura. Si sólo está disponible el dueño
histórico se muestra con la etiqueta **En la OS**, no como propietario actual.

En legacy se recupera OS únicamente por factura explícita, sucursal documentada
(`canonical_branch` o trabajo vinculado) y año de emisión de la factura. Debe haber
una sola OS candidata. Se separan referencias de factura por `;` y se normalizan
ceros de relleno en los tres segmentos sin concatenarlos. Faltantes y ambigüedades
permanecen sin vínculo; no se infiere por nombre, monto o proximidad de fechas.
Las correcciones de tiempo y el reparto por participación de Comisiones se conservan.

## Despliegue y verificación

Aplicar manualmente `20260915100000_unify_service_sales_identity_and_search.sql`.
El commit/push no aplica SQL. No se requiere reimportar ni se actualizan/borran OS.

Prueba reproducible aislada: `node scripts/verify-service-sales-search-sql.mjs`
(requiere PGlite en `output/sql-check`, como los verificadores SQL existentes).
Fixtures sintéticas: vínculo único, factura repetida entre sucursales/años, OS
ambiguas, fecha de factura faltante, OS abierta sin factura, receptor distinto del
dueño, búsqueda/totales uniformes, autorización e idempotencia. No conecta a producción.

Después de aplicar, verificar Valdecir Mohr en el mismo rango/sucursal/tipo de
tiempo en Panorama, Resumen, Detalle y Clientes (ambas perspectivas): sus totales
deben conciliar. No exigir el mismo número de OS que Servicios operativos, porque
allí se incluyen OS sin factura y se usan fechas operativas. Los vínculos reales
de Valdecir no fueron consultados en producción durante esta implementación.

## Resumen por marca y tipo de tiempo

La migración `20260915110000_restore_service_summary_brand_breakdown.sql` restaura
`por_marca_tipo` en la respuesta de Indicadores. Requiere la migración anterior.
MO, Km, Repuestos, Terceros y Neto concilian con `totales` y `por_tipo`; las horas
se suman una vez por OS/tipo de tiempo, no por factura o línea. No cambia Técnicos.

Las filas históricas sin OS llevan `sin_vinculo_historico=true`, conservan los
importes y tienen `horas=null`. El resumen muestra “Histórico sin OS vinculada” y
“—” en OS/horas, separado del tipo “No informado” del sistema actual. Esta bandera
no asigna un cuarto tipo de tiempo ni recupera vínculos: identifica falta de cobertura.
Las marcas sin identificar siguen desglosadas por tipo, sin fusionar Cliente,
Garantía e Interno. Una respuesta sin `por_marca_tipo` produce un aviso de SQL
pendiente, no una afirmación falsa de que no hay marcas.

Verificación sintética reproducible: `node scripts/verify-service-summary-sql.mjs`.
## Código de producto en Detalle

`20260917170000_service_invoice_line_product_code.sql` agrega `codigo` a
`ventas_servicios_lineas_v2`, sin alterar población, filtros, importes ni cantidades.
La columna visible `Código` reemplaza `Concepto`; el componente sigue en el título
al pasar el cursor y se conserva para calcular cantidad operacional.

Repuestos usa el código de su línea financiera (REP u otro código de origen),
nunca el de otra pieza de la OS. Para MO/Km/Terceros se conserva un código operativo
explícito de factura; si usa otro identificador, se busca el código compatible
MA[número]/KM[número]/SE[número] en CODIGO, PRODUCTO y productos_agregados de
la OS única. Códigos distintos del mismo componente no se resuelven arbitrariamente.
Sin código operativo inequívoco se conserva el código financiero real, si existe;
placeholders sin alfanuméricos quedan desconocidos. No se genera MA01 por importe,
descripción o categoría ni se reimportan/modifican los datos originales.

Aplicación manual por el usuario; la migración incluye los metadatos de cantidad
OS de `20260917160000` para no perderlos y puede aplicarse directamente. Verificación
aislada: `node scripts/verify-service-invoice-quantity-sql.mjs`, con igualdad de
todos los campos anteriores, NC, colisiones, componentes, filtros, autorización
e idempotencia. UI mantiene una sola línea y 12 columnas, sin subtotal monetario.

## Paso 1: orden y exportación de Detalle

El paso 2 extiende estos criterios a todas las tablas de Servicios; ver la sección siguiente al final del documento.

Las 12 columnas de `ServiciosDetalleOS` alternan ascendente/descendente por clic
en su encabezado. Usan `salesTableInteraction` y `SalesTableControls`: fechas,
cantidades e importes originales, textos con orden español natural, empates estables
y desconocidos al final en ambos sentidos. No modifican filtros ni disparan RPC
adicional; la respuesta completa de `ventas_servicios_lineas_v2` se filtra antes
de ordenar. No trasladar este orden local a una respuesta paginada incompleta.

El botón `Exportar` requiere `datos:exportar`, como Parque/Clientes, y se deshabilita
durante carga/error/sin filas. `salesTableExport` se carga al hacer clic y exporta
una instantánea completa de filas filtradas en el orden actual, incluidas las no
visibles en el scroll vertical. Mismas columnas; códigos/facturas como texto con
ceros iniciales, descripción completa, fechas reales, cantidades numéricas e importes
con centavos/NC negativas. No agrega subtotal, deduplica ni interpreta textos como
fórmulas. Los errores permiten reintentar, sin presentar descarga exitosa ficticia.

MO/Km exportan la referencia operacional de la OS, igual que la celda visible;
Repuestos/Terceros conservan cantidad de factura. Ausencias quedan vacías en Excel,
no cero inventado. Las referencias OS repetidas no son horas sumables.

Validación local: 103 pruebas de Ventas (incluido ida/vuelta XLSX), ESLint y
compilación correctos. Playwright usa el componente real con 25 líneas ficticias:
orden numérico en ambos sentidos, búsqueda, descarga con todas las filas y anchos
1920/1366/1024/768/390 px sin desbordamiento horizontal. No consulta producción.
No requiere SQL adicional; las migraciones previas de cantidad/código siguen
siendo necesarias para disponer de esos metadatos. Otros filtros/tablas/módulos
se implementarán en los siguientes pasos, no quedan declarados completos aquí.

# Propietarios de stock y nombre único de Campos

La migración `20260915120000_resolve_service_stock_owners_and_campos_identity.sql`
reemplaza la resolución exclusiva por parque por una identidad común que también
consulta `parque_stock_maquinas`. La usan el enriquecimiento de Ventas y la cabecera
del historial por chasis. Requiere `20260915100000` aplicada previamente.

- El dueño explícito del parque **activo** tiene prioridad; una foto de stock no
  reemplaza a un propietario explícito vigente. Si falta, stock con saldo positivo
  demuestra inventario propio de **CAMPOS DEL MAÑANA S.A.**.
- Parque inactivo, stock con saldo cero/negativo y chasis vacíos no prueban propiedad
  actual. No se reemplaza al dueño por el cliente facturado ni por el dueño histórico
  de la OS; este último sigue disponible como dato separado.
- Varias filas de un chasis con el mismo dueño canónico no generan falsos desconocidos
  ni multiplican líneas de venta. Dueños realmente distintos quedan ambiguos.
- Campos se normaliza antes de agrupar y contar clientes: acentos, mayúsculas,
  puntuación de S.A. y calificadores/sucursales se muestran como un único nombre.
  El mismo normalizador se aplica en selectores/importación de clientes, clientes de
  Servicios y clientes/detalle de Máquinas. No se fusionan IDs ni se reescriben facturas.
- No cambia importes, fechas, horas, correcciones de Comisiones o reparto por técnico.

Pruebas reproducibles sin conexión a producción:
`node scripts/verify-service-owner-stock-sql.mjs` (stock, saldos, prioridad, colisiones,
identidad y conciliación), más tests de `clientIdentity`, clientes e historial.

## Paso 2: filtros compartidos y todas las tablas de Servicios

Períodos, ambos resúmenes, Clientes, Máquinas y Técnicos usan `SalesDataTable`:
orden tipado en ambas direcciones, ausencias al final, empate estable y exportación
completa del resultado filtrado en el orden/columnas actuales. Detalle mantiene sus
12 columnas. No se exporta solo el viewport ni se agrega un total monetario a Detalle.
El total de Períodos queda fijo al final y se exporta allí; conserva los conteos únicos
del rango, no la suma de conteos mensuales. Los encabezados mantienen el eje de los datos.

Filtros generales nuevos: cliente facturado, propietario actual, factura, OS, chasis,
descripción, código, componente, origen histórico/actual, factura/NC y con/sin OS.
Se combinan con AND antes de agregación, junto a fechas, sucursal, marca, tipo de
máquina, tipo de tiempo y búsqueda. Cliente no se sustituye por propietario.
Código sigue la prioridad de Detalle (financiero específico, operativo único por OS
y componente, financiero real como respaldo); ambigüedades no se adivinan.
La resolución operacional solo consulta OS cuando se solicita el filtro Código.
Técnicos tiene búsqueda local: reduce esa tabla/exportación sin reasignar MO.
Horas y MO sin clasificar se muestran separadas, conservando el total y el reparto.
Seleccionar agosto limita las vistas complementarias al 31/08. Limpiar cancela texto
pendiente. Carga/error nunca permite exportar resultados anteriores.

### SQL manual y compatibilidad

Ejecutar completo `supabase/migrations/20260917180000_service_sales_shared_filters.sql`.
Necesita las RPC vigentes con autorización de `servicios.ventas`, el resumen por marca
de `20260915110000_restore_service_summary_brand_breakdown.sql` y el código/cantidad
de `20260917170000_service_invoice_line_product_code.sql`. Si falta un prerequisito o
la estructura de una función difiere, falla explícitamente y la transacción no modifica
reportes parcialmente. No ejecutar SQL remoto automáticamente.

Se crean cuatro variantes `_filtrado` de las funciones instaladas, sin restaurar
versiones viejas de reglas financieras ni modificar las originales. Conservan sus
correcciones de Comisiones, participación, exclusiones, metadatos y configuraciones.
Las funciones originales siguen usándose sin filtros nuevos. Si falta el SQL filtrado,
la app muestra un error, no un resultado general disfrazado de filtrado.
La migración es repetible: si luego se cambia una RPC original, volver a ejecutarla
para actualizar su variante filtrada. No toca importaciones ni datos comerciales.
Commit/push no ejecuta la migración y las pruebas locales no demuestran rendimiento
o conciliación de la base de producción.

Validación local: tests de componentes/integración, ESLint, TypeScript y build;
`scripts/verify-service-sales-filters-sql.mjs` usa PostgreSQL aislado/PGlite, disponible
en el entorno local de pruebas `output/sql-check`, no conectado a producción.
Cubre conciliación entre líneas/Períodos/Resumen, contratos originales, NC, tipos
manuales, participación ponderada, código/ambigüedad, permisos e idempotencia.
Playwright comprobó las vistas reales con datos ficticios en 1920/1366/1024/768/390 px,
sin scroll horizontal y sin registros apilados; limpiar, ordenar y descargar Excel
preserva las 25 líneas, textos completos, ceros iniciales, cantidades OS y centavos.
