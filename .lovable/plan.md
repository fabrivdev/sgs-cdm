# Orden visual de Ventas del parque

## Objetivo
Ordenar **Ventas de Máquinas** con el mismo patrón visual compacto del resto de la app: una sola línea por fila, jerarquía clara y sin indicadores o desgloses repetidos.

## Estructura propuesta

1. **Encabezado y filtros**
   - Mantener el título y la barra de filtros actuales.
   - Conservar todos los controles en una sola línea cuando haya espacio; los filtros secundarios seguirán dentro del panel lateral de filtros.

2. **Resumen principal único**
   - Mantener una sola tira superior con: **Facturado, Unidades netas, Clientes facturados y Promedio por unidad neta**.
   - Eliminar las ocho mini-cards repetidas dentro de la pestaña **Resumen**.
   - Mostrar la comparación con el período anterior de forma compacta, sin frases largas ni una segunda línea.

3. **Facturación por período**
   - Mantenerla antes de las vistas, porque funciona como selector temporal para todo el detalle inferior.
   - Redistribuir sus columnas para ocupar el ancho disponible y conservar encabezados y valores en una sola línea.
   - Mantener el plegado y la selección de período existentes.

4. **Vistas comerciales**
   - Mantener las cuatro pestañas: **Resumen, Clientes, Máquinas y Detalle**, alineadas a la derecha del encabezado del bloque.
   - **Resumen:** dejar únicamente los desgloses por **Condición** y **Vendedor**. Quitar el desglose Marca × Tipo × Condición porque repite la vista **Máquinas**.
   - **Clientes:** compactar columnas y filas, priorizando Cliente, Unidades netas, Facturación, Promedio, Facturas, Última venta y Participación.
   - **Máquinas:** conservar la apertura por modelo, pero alinear correctamente cada valor con su encabezado y mantener tanto la fila principal como el detalle en una sola línea.
   - **Detalle:** separar **Marca**, **Tipo** y **Origen** en columnas propias; eliminar los textos secundarios debajo de Factura y Marca para que cada registro ocupe una sola línea.

5. **Consistencia visual**
   - Aplicar las mismas medidas de títulos, encabezados, filas, controles y números tabulares usadas en Ventas de Servicios.
   - Usar nombres completos cuando corresponda y alinear todas las columnas numéricas a la derecha.
   - Mantener truncado con información completa al pasar el puntero para Cliente, Modelo, Chasis y Vendedor.
   - Enviar siempre “Sin vendedor”, “Sin identificar” y equivalentes al final.

## Alcance técnico
- Cambios de presentación y composición en `src/components/ventas/MaquinasVentas.tsx` y ajustes mínimos de integración en `src/pages/Ventas.tsx` si fueran necesarios.
- Sin cambios en cálculos, filtros, consultas ni base de datos.
- Actualizar las pruebas de Ventas de Máquinas para cubrir la ausencia de indicadores duplicados, el orden de vistas y las filas de una sola línea.
- Verificar la pantalla completa en el ancho actual y en escritorio amplio, además de comprobar pruebas y compilación.
