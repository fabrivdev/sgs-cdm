# Resumen por marca + pestaña Vendedores

## Qué cambia en Ventas del parque

1. **Resumen** pasa a tener dos tablas apiladas con las mismas columnas:
   - **Marca** (CLAAS, HORSCH, Otros): una fila por marca, ordenadas por facturación, con "Otros" agrupando el resto y las sin marca al final.
   - **Condición** (la tabla que ya existe, sin cambios).
2. **Vendedor** sale del Resumen y pasa a ser una pestaña nueva llamada **Vendedores**, quedando cinco pestañas: Resumen, Vendedores, Clientes, Máquinas, Detalle.

Las columnas se mantienen idénticas en las tres tablas: Vendidas, Nota Cr., Netas, Clientes, Facturas, Facturación, Participación. Filas de una sola línea, mismos anchos y alineación que hoy.

## Detalle técnico

- En `src/components/ventas/MaquinasVentas.tsx`:
  - `SummaryView`: agregar `byBrand` agrupando `lines` por marca normalizada (CLAAS / HORSCH / Otros), reutilizando `summarize`, `share` y la misma grilla que `conditionGrid`; renderizar la tabla de marca arriba de la de condición.
  - Extraer la tabla de vendedor a un componente `SellersTable` y quitar `bySeller` de `SummaryView`.
  - `MaquinasExplorer`: añadir `"vendedores"` al tipo `ExplorerView` y al array `tabs`, y enrutarlo a `SellersTable`; la grilla de pestañas pasa de `grid-cols-4` a `grid-cols-5`.
- Sin cambios en consultas, cálculos ni base de datos: sólo agrupación en cliente y presentación.
