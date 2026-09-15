# Orden visual de Ventas de Repuestos

## Objetivo
Alinear Ventas de Repuestos con las vistas actuales de Servicios y Máquinas: una lectura más compacta, cinco vistas consistentes y tablas de una sola línea.

## Cambios visibles
1. Mantener arriba los cuatro indicadores principales y la evolución por período, pero eliminar los textos metodológicos y aclaraciones redundantes. Los avisos que indiquen una carga histórica incompleta seguirán apareciendo porque requieren una acción real.
2. Reordenar el panel inferior en cinco pestañas: **Resumen, Vendedores, Clientes, Repuestos y Detalle**, usando el mismo formato compacto y alineación que las demás secciones de Ventas.
3. Simplificar **Resumen**:
   - quitar las ocho tarjetas internas, porque repiten los indicadores superiores;
   - conservar la tabla por sucursal;
   - reemplazar “Sistema actual / Sistema anterior” por una tabla **Marca**, con CLAAS, HORSCH y Otros, los mismos indicadores financieros y participación;
   - dejar cualquier valor no informado al final.
4. Crear **Vendedores** con una fila por vendedor, ordenada por facturación, y las mismas columnas del resumen. Usar la columna Vendedor tanto del archivo histórico como del sistema actual, normalizando códigos y nombres; “Sin vendedor” queda al final solo cuando la fuente realmente no lo informa.
5. Ajustar **Clientes** al patrón de las demás áreas:
   - eliminar la columna Sucursales;
   - encabezados numéricos alineados a la derecha;
   - una sola línea por cliente, con truncado y detalle al pasar el puntero;
   - reducir anchos y altura de fila sin perder Facturado, Ventas, Nota Cr., promedio, documentos, unidades, comparación, última compra y participación.
6. Compactar **Repuestos** y **Detalle** para evitar descripciones, códigos o facturas en doble fila. Mantener desplazamiento horizontal local cuando el ancho no alcance.
7. Unificar la paginación de Clientes, Vendedores, Repuestos y Detalle: contador total a la izquierda, página y controles compactos a la derecha, en una sola línea y con el mismo tamaño visual de las demás tablas.

## Datos y alcance técnico
- Ampliar las consultas de Ventas de Repuestos para devolver `marca` y `vendedor` sin crear tablas nuevas ni cambiar los cálculos financieros.
- La marca ya está almacenada para las líneas históricas y actuales; se agrupará como CLAAS, HORSCH u Otros.
- El archivo histórico contiene Vendedor, pero el lector actual no lo conserva y las filas históricas ya guardadas no tienen ese valor. Se ajustará el lector y la carga para guardar/enriquecer ese campo de forma idempotente al procesar nuevamente el mismo archivo, sin duplicar ventas.
- Para datos actuales se tomará primero la columna normalizada de vendedor y, cuando corresponda, el valor original conservado en la importación.
- Reiniciar la página al cambiar pestaña o filtros para evitar quedar en una página inexistente.
- Mantener la paginación en el servidor y los totales calculados sobre todo el período, no solo sobre la página visible.

## Verificación
- Actualizar las pruebas de Repuestos para cubrir las cinco pestañas, resumen por marca, vendedores, Clientes sin sucursal, orden de “Sin vendedor” y paginación.
- Comprobar que seleccionar un período siga recortando indicadores y tablas correctamente.
- Revisar visualmente `/repuestos/ventas` en escritorio y móvil: pestañas en una línea desplazable, filas compactas, números alineados y sin crecimiento vertical accidental.
