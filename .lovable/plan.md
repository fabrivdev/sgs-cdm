# Consumo compacto con desglose Año / Mes / Sucursal

El gráfico de consumo del panel de repuestos ocupa todo el alto disponible de la pestaña y solo muestra una lectura (unidades por mes, últimos 12 meses). Se reemplaza por un bloque compacto con selector de vista.

## Qué cambia

En la pestaña **Consumo** del panel lateral de un repuesto:

1. Selector de vista (mismo estilo del selector de "Ventas": Facturas / Clientes / Meses), con tres opciones:
   - **Año**: unidades vendidas por año, con todo el historial disponible del producto.
   - **Mes**: unidades por mes de los últimos 12 meses (comportamiento actual).
   - **Sucursal**: unidades por sucursal (12 meses), barras ordenadas de mayor a menor.
2. El gráfico deja de estirarse a toda la altura: alto fijo y acotado (~180 px), alineado abajo, sin espacio muerto.
3. Debajo del gráfico, una línea de resumen del período mostrado (total de unidades y cantidad de buckets con movimiento).
4. La etiqueta "Últimos 12 meses" del encabezado pasa a reflejar la vista activa (por ejemplo "Historial completo" en la vista por año).

## Reglas de datos

- Se mantiene la fuente actual (líneas de venta ya cargadas para el producto), sin nuevas consultas.
- Vista Año y Mes muestran todos los buckets del rango aunque estén en 0 (un mes/año sin consumo es información).
- Vista Sucursal usa la misma normalización de sucursal que la pestaña Sucursales, para que los números coincidan.
- Eje con tope redondeado escalonado en lugar de ajuste exacto al máximo, para que las barras no salten entre vistas.

## Detalle técnico

- Archivo: `src/pages/Repuestos.tsx`, componente `DetalleProductoSheet`.
- Nuevo estado `vistaConsumo: "anio" | "mes" | "sucursal"` y un `useMemo` que devuelve la serie de barras `{ clave, etiqueta, valor }` según la vista, reutilizando `evolucionMensual`, `vendidoPorSucursal` y una nueva agregación anual sobre `ventas`.
- El bloque de barras actual se extrae a un pequeño render genérico sobre esa serie, con contenedor de alto fijo (`h-[180px]`) en lugar de `h-full`.
