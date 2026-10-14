# Importaciones

## Facturas por unidad: estado al 14/10/2026

Main cac486c todavía consulta/cachea FACTURA_IMPORTACION por importacion_linea_id: una factura puede mostrarse en todas las unidades del lote. La corrección local en importaciones-facturas-patch usa importacion_unidad_id; mantiene OC compartida e históricos sin reasignar. Existen frontend, pruebas, ZIP y 20261013120000_scope_import_invoices_to_units.sql. Falta integrar contra main, comprobar SQL aplicado y verificar reemplazo/borrado independiente. No copiar types.ts completo ni considerar el ZIP como cambio aplicado. Ver [[12-Estado-local]].

La corrección de doble descuento OC 9f00139 ya es antecesora de main; su disponibilidad pública no se comprobó. No reabrirla como código pendiente por la nota histórica de duplicados.

## Unidad y llave

Cuarto paso visual del 18/09: lista única de ancho fijo en escritorio/teléfonos con `CompactListTable`, sin tarjetas de datos apilados ni scroll horizontal. Llave/Modelo/Llegada/Ver en teléfonos; secundarios en el detalle y Excel completo. Encabezados breves, Unidad centrada (`1/3`) y texto completo en título. Orden/exportación usa los valores y filtros originales; no altera llegada, cinco situaciones, stock/parque, costos, vínculos, edición ni llaves. Pruebas locales en `ParqueListTables.test.tsx` y regresiones de ImportDetailDrawer/estado/valores/filtros. No requiere SQL ni acredita producción; Dashboard excluido.

Detalle compacto del 18/09: títulos y campos cortos, estado único en cabecera y ayuda ⓘ bajo demanda, accesible por teclado y móvil. No esconder avisos de fecha/moneda/stock ni la referencia histórica de costo. Editar conserva payloads por sección; tránsito/arribo, permisos y cálculos no cambian. Fuentes: `docs/importaciones-unidades-oc-y-costos.md`, `ImportDetailDrawer.test.tsx`, `MachineDetailPrimitives.tsx`. Pruebas locales con datos ficticios; no requiere nuevo SQL ni acredita producción.

Lista del 18/09: ordenar/exportar columnas de Importaciones mediante `useSectionTable` y menú único; posición de unidad se conserva como texto `1/3`, OC/llave/chasis como texto y fechas reales. Cambia solo interacción, no sincronización con stock, llegada, costos ni generación de llaves. `docs/tablas-orden-exportacion.md` distingue listas de matrices y límites de validación.

La llave es POR UNIDAD, no compartida por lote. Ejemplo de OC CLAAS terminada en 111 con cuatro unidades: CLA111-1, CLA111-2, CLA111-3 y CLA111-4; posición 1/4, 2/4, 3/4, 4/4. Preservar llaves válidas y evitar duplicados. No inventar una OC faltante.

## General e individual

ETA y valor OC tienen herencia general y ajustes individuales independientes. Comprar diez unidades para diciembre no impide cambiar tres a octubre. Modificar chasis o documentos no debe congelar accidentalmente la ETA o el valor OC.

En una unidad 1/1 no mostrar “usar embarque general” o controles de lote que no aportan; preservar los datos existentes.

## Valores separados

- Valor OC: compromiso de compra, con alcance unitario o total explícito.
- Valor factura proveedor: importe para comparar con OC.
- Costo definitivo de máquina: habilitado con confirmación física en stock; no sustituirlo por la OC.

Comparar factura proveedor menos OC únicamente en moneda y base compatibles. No inventar tipo de cambio. Al distribuir un total, ajustar el último centavo para conservarlo exactamente.

## Ciclo de llegada

Situación del 18/09 se reduce a Stock, Reservado, En parque, Sin chasis y Sin conciliar (Todas quita el filtro). Vendido pendiente de entrega se agrupa en Reservado; Conflicto/duplicados en Sin conciliar, manteniendo referencias y avisos del detalle. Filtro, tabla/tarjetas, orden y exportación usan la misma proyección `importSituationState`/`importSituationLabel`, sin reescribir estados originales ni afectar Llegada, facturación, costos o NP. No extender este vocabulario reducido al selector comercial de Stock de Operaciones. 50 pruebas locales correctas; no requiere SQL adicional. Fuentes: `machineImportStatus.ts`, `MaquinariaOperaciones.tsx`, `ImportDetailDrawer.test.tsx` y documentación detallada.

Planificado al crear → En tránsito al confirmar → Arribado al registrar fecha real y chasis sin coincidencia vigente → Completado al confirmar el mismo chasis normalizado y único en Stock con saldo positivo o Parque activo. Stock/Parque confirman incluso sin ATA histórica: no inventar fechas. ETA, factura proveedor ni estado comercial de NP prueban llegada. Una máquina reservada puede completar aunque la NP siga pendiente de facturación; una vendida en Parque también completa sin stock vigente.

Chasis ambiguo bloquea confirmación; ATA sin Stock/Parque deja Arribado. Sin ATA ni coincidencia no rotular Arribado por etiquetas antiguas; mostrar aviso de fecha faltante. El arribo manual requiere fecha válida no futura. Cancelaciones y cambios deben conservar trazabilidad. Completar en Parque no habilita costo de stock: su guard exige ATA y stock físico positivo y único.

Corrección del 18/09: `20260918170000_complete_imports_by_stock_or_park_chassis.sql`, después de 17140000. Nuevas señales `parque_confirmado`/`chasis_ambiguo`, señal física independiente de ATA. Lista/filtros/KPI/export/detalle usan `machineImportStatus.ts`. Recepción no vuelve a tránsito una confirmada ni anula un chasis existente en Parque. No cambia fechas, NP, reservas ni importes. Pruebas locales: 29 frontend y SQL real en PostgreSQL aislado; control `supabase/verificar_importaciones_stock_parque.sql`. Requiere aplicación manual; no acredita producción.

Fuente detallada: `docs/importaciones-unidades-oc-y-costos.md`. Pruebas locales: `scripts/test-import-unit-purchase-values.mjs`, `scripts/verify-import-np-model-sql.mjs`. La base requiere sus migraciones aplicadas por el usuario.

Documentos del proveedor del 22/09: al adjuntar una factura, el lector asistido propone número, fecha, moneda e importe y el usuario confirma antes de guardar. Reemplazar el archivo vuelve a extraer; no sobrescribir silenciosamente datos revisados ni tomar la OC como importe de factura. Registrar arribo actualiza inmediatamente el detalle y oculta la acción ya cumplida, sin esperar una reapertura manual. Fuentes: `src/lib/machineSupplierInvoice.ts`, `src/pages/MaquinariaOperaciones.tsx`, `ImportDetailDrawer.test.tsx` y `machine-document-extractor`; pruebas locales con fixtures, no lectura productiva confirmada.
