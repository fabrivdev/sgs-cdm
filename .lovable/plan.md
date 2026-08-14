# Detalle lateral de repuesto: sin scroll general

Hoy el panel apila cuatro bloques altos (KPIs, tabla de sucursales, gráfico, historial), cada uno con su propio alto fijo, así que el panel entero scrollea además de las tablas internas. Doble scroll y todo lejos.

## Cambios

**1. El panel deja de scrollear como un todo**

El contenido pasa a ocupar exactamente el alto de la pantalla: encabezado arriba, resumen fijo, y una sola zona con scroll interno abajo. Nunca hay dos barras de scroll compitiendo.

**2. Resumen más compacto arriba**

- Los 4 KPIs (Stock total, Unidades 12m, Facturación 12m, Promedio/mes) pasan a una fila única de altura reducida, sin card por dato: valor grande + etiqueta chica, separados por divisores.
- El aviso de "mismo código de fabricante" y el error de historial quedan como una línea compacta (una sola línea con detalle al pasar el mouse), no como bloques de 3 líneas.

**3. Todo el detalle en pestañas, no apilado**

Debajo del resumen, una sola barra de pestañas:

- **Ventas** (por defecto): historial de facturas, con el conmutador Facturas / Por cliente / Por mes ya existente y el rango de cobertura a la derecha.
- **Sucursales**: la tabla de disponibilidad y ventas 12M/24M por sucursal.
- **Consumo**: el gráfico de evolución de 12 meses, que ahora puede usar todo el ancho del panel.

Así el usuario ve un bloque a la vez, a pantalla completa, y el scroll queda solo dentro de la tabla activa.

**4. Densidad**

- Filas de tabla y encabezados un poco más bajos para que entren más registros sin scrollear.
- El gráfico de consumo aprovecha todo el alto disponible de su pestaña en vez de quedar clavado en 256px.

## Detalles técnicos

Todo dentro de `DetalleProductoSheet` en `src/pages/Repuestos.tsx`:

- `SheetContent` con `h-full` y `flex-col`; contenedor de pestañas con `flex-1 min-h-0`, y cada `TabsContent` con `flex-1 min-h-0 overflow-hidden`; el scroll vive en el wrapper de la tabla (`h-full overflow-auto`).
- Se elimina el `overflow-y-auto` del contenedor general (línea 584) y los altos fijos `h-64` / `max-h-[360px]`.
- Se usa `Tabs` de `@/components/ui/tabs` (ya en el proyecto) con estado local; se conserva `vistaHistorial` tal cual dentro de la pestaña Ventas.
- Los `KpiCard` del panel se reemplazan por una fila propia compacta; el `KpiCard` que usa la página principal no se toca.

Sin cambios de datos, consultas ni lógica de negocio.
