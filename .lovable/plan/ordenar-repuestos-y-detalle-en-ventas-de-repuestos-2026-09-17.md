# Ordenar Repuestos y Detalle en Ventas de Repuestos

## Objetivo
Dejar ambas vistas compactas, legibles y con el mismo orden visual que el resto de Ventas, evitando columnas redundantes y reduciendo el desplazamiento horizontal.

## Cambios visibles
1. Simplificar la vista **Repuestos** a estas columnas, en este orden:
   - Código
   - Descripción
   - Marca
   - Facturación neta
   - Unidades
   - Clientes
   - Documentos
   - Participación
   - ABC
2. Eliminar de esa vista Código fabricante, Ventas, Nota Cr., Unidades vendidas y Unidades devueltas. La descripción aprovechará el espacio liberado y cada repuesto permanecerá en una sola línea.
3. Mostrar la marca normalizada como **CLAAS, HORSCH u Otros**.
4. Calcular **ABC sobre el período y los filtros visibles**, ordenando los repuestos por facturación neta de mayor a menor:
   - A: hasta el 80% acumulado de la facturación neta positiva;
   - B: desde allí hasta el 95% acumulado;
   - C: el resto;
   - sin clasificación cuando no exista una base positiva válida.
5. Reordenar **Detalle** con una secuencia más natural para lectura comercial y del artículo:
   - Fecha
   - Factura
   - Sucursal
   - Cliente
   - Marca
   - Código
   - Código fabricante
   - Descripción
   - Cantidad
   - Facturación neta
6. Ajustar anchos y alineaciones: texto a la izquierda, valores numéricos a la derecha, fechas y códigos sin doble línea, descripción truncada con el contenido completo al pasar el puntero.
7. Mantener el scroll interno y la carga progresiva ya unificados; el desplazamiento horizontal quedará solo como respaldo en pantallas estrechas.

## Datos y alcance técnico
- Actualizar el informe `ventas_repuestos_listado_v2` para que la agrupación de Repuestos devuelva marca y clasificación ABC del conjunto filtrado completo, antes de paginar.
- Cuando un mismo código tenga movimientos con más de una marca, normalizar de manera determinista y no duplicar el repuesto.
- No cambiar importes, filtros, totales, fuente histórica, notas de crédito ni las demás vistas de Ventas.

## Verificación
- Actualizar las pruebas para comprobar el nuevo orden y la ausencia de las columnas eliminadas.
- Cubrir marca normalizada y límites ABC, incluyendo facturación nula o no positiva.
- Confirmar que ABC y participación se calculan sobre todo el período filtrado, no solo sobre las filas cargadas.
- Revisar Repuestos y Detalle en escritorio y móvil: filas de una línea, encabezados alineados y sin scroll horizontal innecesario en escritorio.
