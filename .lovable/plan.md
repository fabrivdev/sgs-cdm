## Cambio

En `src/pages/Dashboard.tsx`, dentro del Card "Facturación por sucursal", cambiar la grilla de las dos mini-cards de abajo de `grid-cols-2` a una sola columna para que el texto no se corte.

- Reemplazar `grid grid-cols-2 gap-2` por `flex flex-col gap-2` (o `grid grid-cols-1 gap-2`).
- Las mini-cards ("Sucursales con movimiento" y "Top 2 concentran X%") quedan apiladas una encima de la otra, ocupando todo el ancho del card, mostrando el texto completo sin truncado.
- Sin cambios en lógica, datos ni estilos de las cards individuales.

Fuera de alcance: el resto del dashboard.
