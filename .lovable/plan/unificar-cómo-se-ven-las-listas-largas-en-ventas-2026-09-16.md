# Unificar cómo se ven las listas largas en Ventas

Hoy cada sección de ventas se comporta distinto:

- **Ventas de repuestos**: paginación (50 registros por página, con flechas).
- **Ventas de servicios**: caja con scroll propio de alto fijo (Clientes y Detalle), pero Técnicos y Máquinas se estiran sin límite.
- **Ventas del parque (máquinas)**: todas las filas seguidas, la página crece sin límite.

Criterio acordado: **scroll interno en todas**, aplicado a cualquier tabla que pueda superar las 20 filas.

## Qué se va a ver

- Toda tabla larga queda dentro de una caja de alto fijo con su propio scroll, con el encabezado siempre visible al desplazar.
- Debajo de cada tabla, una línea discreta con el total: "1.240 registros".
- Las tablas de resumen corto (por marca, condición, período) quedan como están si no pasan de 20 filas; si las pasan, entran al mismo formato.
- En repuestos desaparecen las flechas de página: se desplaza dentro de la caja y, al llegar al final, se cargan automáticamente los siguientes registros hasta completar el período.
- En móvil la caja se adapta al alto de pantalla para no dejar dos scrolls compitiendo.

## Detalles técnicos

1. **Contenedor común**: agregar a `src/components/ventas/` (o `AppPrimitives`) un `TableScroll` con `max-h-[480px] overflow-y-auto [scrollbar-gutter:stable]`, encabezado `sticky top-0 z-10 bg-muted/60`, y un pie opcional con el conteo. Alto reducido en pantallas chicas vía clases responsive.
2. **Servicios**: reemplazar los `max-h-[480px] overflow-y-auto` sueltos de `ServiciosClientes.tsx` y `ServiciosDetalleOS.tsx` por el contenedor común; envolver también las tablas de `ServiciosTecnicos.tsx` y `ServiciosMaquinas.tsx`, que hoy no tienen tope.
3. **Máquinas (parque)**: envolver `ClientsTable`, `MachinesTable`, `DetailTable`, `SellersTable` y `MaquinasPanorama` en `MaquinasVentas.tsx` con el mismo contenedor, conservando el scroll horizontal actual.
4. **Repuestos**: en `RepuestosVentas.tsx` quitar el componente `Pager` y el estado `page`; pasar `useQuery` a `useInfiniteQuery` sobre `ventas_repuestos_listado_v2` (mismo `p_por_pagina: 50`), acumulando páginas y disparando `fetchNextPage` con un centinela `IntersectionObserver` al final de la caja. El pie muestra "cargadas X de Y".
5. **Tests**: actualizar `RepuestosVentas.test.tsx` (el caso de paginación pasa a verificar la carga incremental al llegar al final) y agregar una verificación de que las tablas largas quedan dentro del contenedor con scroll.

Sin cambios en base de datos ni en las RPC existentes.
