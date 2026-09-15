# Ventas de Repuestos

## Vendedores del histórico ya cargado

Aplicar `20260915180000_recover_and_unify_parts_sales_sellers.sql` después de los reportes v2 de `0005_parts_sales_brand_sellers.sql`. Luego, en Sugerencias → Historial → Completar vendedores históricos, seleccionar el mismo Excel original.

El complemento valida carga, clave de línea, cantidad e importe y actualiza únicamente vendedor/raw_data. Incluye ventas S y NC E existentes: no inserta movimientos, no cambia hash, importes, cantidades, stock ni demanda y puede reintentarse. Las filas sin vendedor permanecen sin informar. No se atribuye el vendedor de otra factura por coincidencia de cliente.

El servidor unifica alias conocidos y quita los prefijos antes de agrupar y paginar. Así Carlos Benítez del sistema nuevo y Carlos Javier Benítez Zarza del histórico forman una sola fila con ventas y NC neteadas. Las identidades desconocidas mantienen el nombre completo sin código; no se adivina el primer apellido.

Las futuras NC del complemento conservan además el vendedor en raw_data. No es necesario reconstruir demanda cuando solo se completan vendedores.

## Alcance y fuentes

Hasta el 30/06/2026 se utiliza `v_ventas_repuestos_historico_completo`, sobre
`facturacion_lineas_importadas`, origen `legacy_historico_detallado`: las líneas
que ya usa el historial de Sugerencias. No se suma además el histórico agrupado
de `facturacion`, ni las copias de otros orígenes anteriores al corte.

La vista financiera conserva también las líneas sin vínculo confirmado o
ambiguas. Sugerencias publica demanda solo para piezas confirmadas: ese filtro
no debe eliminar importes del reporte financiero. El código interno/fabricante
del catálogo se incorpora únicamente con un vínculo CONFIRMADA; en caso contrario
se conserva el código y la descripción del origen, sin adivinar equivalencias.
Los productos confirmados se agrupan entre sistemas, sin separar por metodología.

Desde el 01/07/2026 se mantiene `ventas_area_movimientos_base`, únicamente
`area_calculada = 'repuestos'`. Las piezas vinculadas a OS siguen en Servicios.
El histórico no permite separar ese canal: los cruces del corte tienen distinta
cobertura. Ambas fuentes utilizan USD; no se convierte moneda implícitamente.
Servicios y Máquinas, sus importadores y el stock físico quedan intactos.

`cliente_nombre_canonico` unifica CAMPOS DEL MAÑANA S.A. antes de agrupar/contar.
Las sucursales del archivo se normalizan al catálogo de la app, incluyendo
CENTRAL → Santa Rita y SANTA ROSA DEL AGUARAY → Santa Rosa.

## Métricas

- Facturado: suma firmada del importe del período.
- Ventas: importe de líneas no identificadas como nota de crédito.
- Notas de crédito: importe firmado de movimientos E o importes negativos del
  histórico; en el actual se respeta también la clasificación documental.
  Ventas + NC = facturado. Cantidades y valores no se convierten a positivos.
- Documentos: origen, fecha, sucursal, número y clase documental. Varias líneas
  de una factura cuentan una sola vez. Sin número se diferencia cada línea.
- Unidades: cantidades por artículo, tanto históricas como actuales. Se respetan
  las conversiones históricas existentes por código, fecha y precio unitario.
  Se separan vendidas/devueltas/netas. El agregado general combina artículos,
  no representa precio ni equivalencia entre piezas.
- Participación: facturado del grupo / facturado de toda la selección.
- Promedio por documento: facturado / documentos; no es precio por artículo.

## Fechas, vistas y presentación

Las vistas son Resumen, Vendedores, Clientes, Repuestos y Detalle. Todas usan
el mismo helper financiero. Detalle es plano:
una fila por repuesto, factura repetida cuando corresponda, código de repuesto,
código de fabricante, descripción completa, cantidad firmada e importe.

Panorama usa el rango superior. Seleccionar un período intersecta sus límites
con ese rango y recorta KPI y las cinco vistas: agosto finaliza el 31/08.
La fila Total del período mantiene el total superior. LM compara el período
anterior; LY el año anterior, con meses completos y bisiestos correctamente.
Si las NC históricas aún no fueron verificadas se avisa, también cuando solo
afectan comparaciones LY. No se presenta un cero de NC como conciliación completa.

Resumen presenta sucursales y marcas. Vendedores usa el nombre conservado en
cada línea. Clientes muestra compradores sin repetir sucursales, con promedio
documental y comparación LY. Importes usan `$`, encabezados numéricos alineados
a la derecha y tablas densas con scroll horizontal
local. Los totales se calculan antes de paginar, sin limitar el universo a 500
líneas. React Query comparte Panorama/Resumen y no reintenta informes fallidos.

## Aplicación manual y recuperación de NC

1. Ejecutar completo `20260915160000_use_complete_parts_history_and_credit_notes.sql`.
   Incluye los contratos de la migración 15:00: no hace falta aplicar ambas.
   Requiere las funciones/tablas históricas existentes y la identidad de Campos.
2. En Repuestos → Sugerencias → Historial, elegir **Completar notas de crédito**.
3. Seleccionar el mismo `FACTURACIÓN HISTORICA.xlsx` originalmente cargado.
   Se procesa exclusivamente la hoja Fact. Repuestos, nunca Fact. Servicios.
4. Esperar la carga por lotes y la actualización del historial de demanda.
   Si una publicación falla, usar Actualizar historial; si falla un lote,
   volver a seleccionar el mismo Excel. No se borran ni sobrescriben ventas.

El complemento admite únicamente E anteriores al corte, exige administración,
contrasta hasta 50 líneas S existentes como referencias del mismo archivo y
rechaza líneas existentes con valores diferentes. Conserva las claves originales
por fila; insertar de nuevo no duplica. Solo marca verificación después de
comprobar que todas las claves E del archivo están en la base.
Una carga futura inicial también admite S/E y conserva esas mismas claves.

La auditoría de solo lectura del archivo aportado encontró 194.976 líneas:
185.535 S y 9.441 E, sin signos incompatibles de cantidad/importe. Son **líneas
de NC**, no 9.441 documentos distintos. El SQL no introduce esos datos por sí
solo: deben completarse desde el archivo mediante la opción anterior.

Agregar E cambia tanto el neto financiero histórico como la demanda/devoluciones
de Sugerencias para las piezas confirmadas. La publicación se hace con sus
lotes mensuales existentes; no modifica existencias físicas ni reglas del modelo.
Hasta que termine se invalida el estado de historial publicado, para no mostrar
sugerencias calculadas con una base parcialmente actualizada.

## Verificación

### Identidad de vendedores

Después de recuperar los metadatos, aplicar
`20260915190000_unify_parts_seller_identities.sql`. No requiere reimportar el Excel.
La comparación se hizo con `query-results-export-2026-09-15_17-14-50.csv`:
se quitan prefijos numéricos y AR/AS/ZZ, y se relacionan exactamente las nueve
identidades de Repuestos presentes en ambos sistemas. Por ejemplo,
FERNANDO PETTER ANTES / AR0001 - FERNANDO PETTER y
FRANCISCO JAVIER NALERIO LAURENT / AR0003 - JAVIER NALERIO.
Este último se presenta como FRANCISCO NALERIO (primer nombre y primer apellido).
Se conservan las equivalencias comerciales anteriores, incluido OSCAR BENITEZ.
ANGELA KNORST y PABLO JAUREGUI no tienen equivalente histórico en el export;
se mantienen separados, sin sus códigos. VENDEDOR CDM sigue siendo un vendedor
genérico, no una persona inventada. Vacíos, guiones y códigos sin nombre se
muestran como Sin vendedor. Las identidades desconocidas conservan su nombre
completo: no se adivinan apellidos ni se fusionan personas por palabras comunes.

La normalización ocurre en SQL antes de agrupar/paginar; el helper específico de
Repuestos utiliza las mismas identidades para la presentación. No modifica
el helper compartido de Máquinas, metadatos originales, importes, cantidades,
notas de crédito, stock ni Sugerencias. Las ventas y devoluciones de una misma
identidad se concilian en una sola fila del reporte.

- `node scripts/verify-complete-parts-history-sql.mjs`: PostgreSQL aislado,
  migración repetible, cargador inicial real, S/E, complemento idempotente,
  códigos/vínculos opcionales, cantidades normalizadas, permisos y conciliación
  de las cuatro vistas sin sumar el histórico agrupado ni otras copias.
- `legacyPartsBillingImport.test.ts`: carga inicial S/E, recuperación E únicamente,
  clave de fila original y errores que no marcan verificación.
- `RepuestosVentas.test.tsx`, `partsSalesFormat.test.ts` y `legacyPartsBilling.test.ts`:
  detalle plano, nombres, fechas, signos, paginación, avisos y eliminación de Análisis.

Tiempos y conciliación en producción se verifican después de aplicar el SQL y
completar el archivo. Commit/push no ejecutan migraciones ni cargan notas de crédito.
