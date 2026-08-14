# Sistema visual unificado: aire, consistencia y adaptabilidad

El problema no son ajustes sueltos por página: hoy conviven dos escalas tipográficas incompatibles (unas medidas en px fijos, otras relativas al tamaño base de 13px), lo que hace que los filtros se vean más grandes que el propio menú lateral. A eso se suman filtros en una fila rígida que no se acomoda y un contenedor principal que no se encoge cuando se abre el menú, provocando scroll horizontal.

La propuesta es fijar un sistema visual único y aplicarlo de forma transversal.

## 1. Una sola escala tipográfica

Se define una escala fija en px (no dependiente del tamaño base) y se usa en toda la app:

- Título de página: 20px
- Título de sección / gráfico: 14px
- Valor KPI: 22px
- Texto de tabla y controles: 13px
- Etiquetas y metadatos: 11px

Se elimina el uso mezclado de `text-sm` / `text-xs` / `text-base` en páginas y tablas, reemplazándolos por los tokens de la escala. Con esto Catálogo y Sugerencia de compra pasan a verse con exactamente el mismo peso de texto, igual que el resto de las tablas.

## 2. Menú lateral alineado con el contenido

El menú se ajusta a la misma escala (ítems a 13px, títulos de módulo a 11px en mayúsculas) para que nunca quede visualmente más chico que los filtros de la página.

## 3. Filtros con aire

- La barra de filtros deja de ser una fila rígida: pasa a acomodarse en varias líneas cuando no entra, en vez de comprimir los campos.
- Más respiración: altura de control 34px, separación entre campos y entre etiqueta y campo, y padding interno mayor en la tarjeta contenedora.
- Etiquetas a 11px, consistentes en todas las páginas.

## 4. KPIs más pulcros

- Las tarjetas KPI pasan a tener padding real (12px vertical / 14px horizontal) y altura mínima uniforme.
- Un titular grande (22px) + una sola línea de apoyo a 11px, sin amontonar datos ni chocar textos.
- Mismo tratamiento en Dashboard, Repuestos, Sugerencia de compra y Catálogo, para que las tiras de KPI se lean iguales en toda la app.

## 5. Dashboard: gráficos proporcionados

- Se reduce la altura de los gráficos grandes a un rango uniforme (aprox. 220–260px) para que entren sin dominar la pantalla.
- Espaciado consistente entre bloques y títulos de gráfico todos a 14px.

## 6. Sin scroll horizontal al abrir el menú

Se corrige el contenedor principal para que pueda encogerse (ancho mínimo cero y desbordamiento horizontal contenido), y las tablas anchas pasan a tener su propio scroll interno en lugar de empujar toda la página.

## Detalles técnicos

- `src/lib/ui-classes.ts`: nueva escala completa como fuente única de verdad (título, sección, KPI, tabla, etiqueta, meta) + tokens de densidad de control.
- `src/index.css`: revisar el `font-size: 13px` de raíz para que la escala en px y las utilidades relativas dejen de divergir; ajustar `--control-height`.
- `src/components/layout/AppPrimitives.tsx`: `PageHeader`, `KpiStrip`, `KpiItem`, `Panel`, `SectionHeader` con nuevos tamaños y padding.
- `src/components/filters/FiltersBar.tsx`: cambiar `sm:flex-nowrap` por wrap con `gap-x-3 gap-y-2`, campos a `h-[34px]`, labels con token de 11px.
- `src/components/AppLayout.tsx`: `SidebarInset` con `min-w-0 overflow-x-hidden`; ítems de nav a la escala común.
- `src/pages/Repuestos.tsx`, `src/pages/RepuestosSugerencias.tsx`, `src/pages/RepuestosCompras.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Trabajos.tsx`, `src/pages/Planificador.tsx`, `src/pages/Historial.tsx`, `src/pages/Admin.tsx`, `src/pages/ParqueClientes.tsx`: sustituir clases de texto sueltas por tokens.
- `src/components/dashboard/DashboardCharts.tsx` y `DashboardPanels.tsx`: alturas de gráfico unificadas y títulos a 14px.
- Verificación con Playwright a 1152px y 1440px, con menú abierto y colapsado, comprobando que no aparece scroll horizontal y comparando Catálogo vs Sugerencia.

Sin cambios de lógica de negocio, consultas ni datos: solo capa visual.
