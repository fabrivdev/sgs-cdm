# Consumo dividido en tres gráficos simultáneos

El gráfico de consumo del panel de repuestos ocupa todo el alto de la pestaña con una sola lectura (unidades por mes). Se reemplaza por tres gráficos compactos visibles al mismo tiempo, sin selector.

## Qué cambia

En la pestaña **Consumo** del panel lateral de un repuesto se muestran, uno debajo del otro (y en dos columnas cuando el ancho lo permite):

1. **Por año** — unidades vendidas por año, con todo el historial disponible del producto.
2. **Por mes** — unidades por mes de los últimos 12 meses (lectura actual, pero compacta).
3. **Por sucursal** — unidades por sucursal en los últimos 12 meses, ordenadas de mayor a menor.

Cada bloque tiene su propio título corto y su total del período. Los tres usan el mismo estilo de barras actual, con alto acotado (~140 px cada uno) en vez de estirarse a toda la altura. El scroll queda dentro del contenedor de la pestaña.

La etiqueta del encabezado deja de decir solo "Últimos 12 meses" y aclara el alcance de cada bloque en su propio subtítulo.

## Reglas de datos

- Se mantiene la fuente actual (líneas de venta ya cargadas para el producto), sin nuevas consultas.
- Año y mes muestran todos los buckets del rango aunque estén en 0 (un período sin consumo es información).
- Sucursal usa la misma normalización que la pestaña Sucursales, para que los números coincidan.
- Cada gráfico escala con tope redondeado escalonado, no ajustado exacto al máximo.
- Estados de carga, error y "sin consumo" se resuelven una sola vez para toda la pestaña.

## Detalle técnico

- Archivo: `src/pages/Repuestos.tsx`, componente `DetalleProductoSheet`.
- Se extrae un render de barras genérico sobre una serie `{ clave, etiqueta, valor }`, con alto fijo, reutilizado por los tres bloques.
- Series: `evolucionMensual` (existente), `vendidoPorSucursal` (existente, ordenado desc) y una nueva agregación anual con `useMemo` sobre `ventas`.
- El contenedor de la pestaña pasa de `flex h-full items-end` a un layout con scroll vertical y grilla responsiva.
