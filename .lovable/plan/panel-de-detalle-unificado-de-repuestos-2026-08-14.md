# Panel de detalle unificado de repuestos

Hoy hay dos paneles distintos: el de Catálogo y stock (ancho, con KPIs, pestañas Ventas / Sucursales / Consumo) y el de Sugerencia de compra (angosto, sin datos de consumo, con mucho scroll). La idea es que ambos usen el mismo panel, con la misma presentación, y que cada módulo agregue lo suyo.

## Cómo queda

Un único panel lateral ancho (igual al de Catálogo), con:

**Encabezado**: descripción, códigos (interno / fabricante), familia y marca. A la derecha, una franja de acción con la recomendación de compra: "Sugerido pedir N un." o "Sin necesidad de pedido", más cobertura actual en meses.

**Fila de KPIs compacta** (una sola línea, sin cortar textos):
Stock global · Venta 12m · Demanda mensual · Cobertura · Objetivo · Sugerencia.

**Pestañas** (scroll solo dentro de la pestaña activa):

1. **Ventas** — historial actual del catálogo (facturas / clientes / meses).
2. **Sucursales** — ventas 12M, ventas 24M y disponible por sucursal.
3. **Consumo** — los tres gráficos compactos actuales (por año, por mes, por sucursal).
4. **Planificación** — todo lo del sugeridor: clasificación ABC/FSN/XYZ, segmento, confianza, estado del historial, bloque "Cómo se obtuvo" (demanda, horizonte, stock de seguridad, cobertura aplicada, mínimo estratégico, tránsito, necesidad neta) y el formulario de datos maestros (mínimo estratégico, origen, observaciones) para quien tenga permiso.

## Comportamiento por módulo

- **Sugerencia de compra**: abre el panel en la pestaña Planificación; las pestañas de consumo/ventas cargan el historial del producto igual que en Catálogo.
- **Catálogo y stock**: abre en Ventas; consulta la sugerencia vigente del producto y muestra la franja de recomendación y la pestaña Planificación. Si el producto no está en el alcance del motor, la pestaña indica "Sin cálculo de sugerencia para esta pieza" en vez de números vacíos.

## Detalle técnico

- Nuevo componente compartido `src/components/repuestos/DetalleRepuestoSheet.tsx` que recibe `productoCodigo`, `marca`, datos de stock por sucursal (opcional) y `sugerencia` (opcional), reutilizando `useVentasRepuesto`, `useRepuestoHermanos` y los memos de consumo (`BloqueConsumo`, `topeEscalonado`) movidos desde `Repuestos.tsx`.
- Nuevo hook `useSugerenciaProducto(marca, fechaAnalisis, productoCodigo)` en `src/hooks/useSugerenciasCompra.ts` que llama a `repuestos_sugerencia_viva` con `p_buscar = código`, `p_solo_sugeridos = false`, límite 1, y devuelve la fila o `null`.
- `Repuestos.tsx` y `RepuestosSugerencias.tsx` pasan a renderizar el componente compartido; se elimina `DetalleProductoSheet` y `ResultDetailSheet`.
- Se mantienen los tokens de densidad existentes (`tableHeadText`, `cellText`, `metaText`) y el alto fijo con scroll interno.
- Sin cambios de base de datos.
