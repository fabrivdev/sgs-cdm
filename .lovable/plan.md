# Alinear Comisiones y Agenda al patrón visual de la app

Las dos vistas nuevas (`/comisiones` y `/agenda`) se construyeron con estilos propios en vez de las primitivas y tokens que ya usa el resto de la app. Abajo está el diagnóstico concreto y la corrección.

## Qué está mal hoy

**Comisiones**
1. **Filtros a mano**: los dos campos de fecha son `<label>` + `Input` sueltos dentro de un `Panel`, no `FiltersBar` + `FilterDate`. Rompe alturas, encabezados y el botón "Filtros" que tiene todo el resto.
2. **Texto descriptivo de más**: bajada del título ("Control de horas, validación y liquidación…"), leyenda suelta "Cerradas por fecha de cierre · abiertas al corte.", `meta` en cada `SectionHeader` ("Seleccioná un técnico para ver…", "Cada jornada puede pertenecer a una sola liquidación."), banner completo en la pestaña Revisar, párrafo explicativo en el panel lateral, detalle de KPI en prosa ("Validadas y todavía no liquidadas").
3. **Tipografía fuera de escala**: tablas en `text-[11px]` (la app usa `tableText`/`tableHeadText`), badges en `text-[9px]`, valores en `text-lg`, y etiquetas con `uppercase tracking-wide` — las mayúsculas sostenidas se eliminaron en toda la app.
4. **Iconos sueltos** (`h-4 w-4`, `h-5 w-5`) en vez de `iconSm` / `iconMd` / `iconLg`.
5. **Tabs mal ubicadas**: van en su propia fila; el patrón acordado es tabs en la línea del título, alineadas a la derecha.
6. **Estructura confusa**: la pestaña "Revisar" solo contiene un cartel de texto, y la tabla de OS —que es el contenido real de cada pestaña— vive fuera del `Tabs`.
7. **Panel lateral ad-hoc**: mini-cards propias con uppercase y `text-lg`, en vez del patrón de `DetalleRepuestoSheet` (tira de KPIs + secciones).
8. **Vacíos y carga ad-hoc**: "No hay órdenes para mostrar" y un spinner suelto, en vez de `EmptyState` y los skeletons compartidos.

**Agenda**
9. No usa `PageShell` / `PageHeader`: arma un `div` con `pageShell` y un `h1` con `mb-4`, así que el espaciado del encabezado no coincide con ninguna otra página.

## Qué se va a hacer

1. **Encabezado**: `PageHeader` sin `meta`, con las tabs (Cerradas / Abiertas / Revisar / Pagos) a la derecha del título y los botones de acción con iconos de la escala común y etiquetas cortas ("Importar XML", "Actualizar").
2. **Filtros**: reemplazar el `Panel` manual por `FiltersBar` con dos `FilterDate` ("Desde", "Hasta") y el chip de técnico como `FilterCustom`; se elimina la leyenda suelta.
3. **KPIs**: `KpiItem` con `detail` en formato de dato corto (`12 OS · 34 jornadas`), sin frases explicativas.
4. **Contenido por pestaña**: cada `TabsContent` contiene lo suyo — resumen por técnico + tabla de OS en Cerradas / Abiertas / Revisar, y la tabla de liquidaciones en Pagos. Se quita el bloque de tabla duplicado que hoy queda fuera de las tabs y el banner de Revisar (la condición ya se ve en la columna Estado).
5. **Tipografía y badges**: tablas con `tableText` / `tableHeadText`, badges sin tamaños custom, sin `uppercase`, valores destacados con `kpiValue`.
6. **Panel lateral de OS**: cabecera compacta (OS + cliente + sucursal), tira de KPIs con las primitivas (`KpiStrip` / `KpiItem`) y el desglose por día sin párrafos explicativos.
7. **Estados**: `EmptyState` para tablas vacías y los skeletons compartidos para la carga.
8. **Agenda**: envolver en `PageShell` + `PageHeader title="Agenda comercial"`.

## Alcance

Solo capa visual y de estructura de UI: no cambian consultas, cálculos de horas, validación ni liquidación.
