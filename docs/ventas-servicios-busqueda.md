# Búsqueda e identidad en Ventas de Servicios

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
