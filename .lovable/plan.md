## Ajustes al Dashboard ejecutivo (`src/pages/Dashboard.tsx`)

Cambios visuales y de layout únicamente, sin tocar lógica de datos.

### 1. Pestaña Trabajos — quitar segunda fila de KPIs
La pestaña Trabajos repite arriba 5 `SummaryCard` (líneas 1012-1018: Trabajos activos, Cerrados, Pausados, Jornadas realizadas, Técnicos con actividad) que ya están en la fila superior global de Vista general.

- Eliminar por completo esa `<section>` de 5 SummaryCards.
- Reubicar la información clave (Activos / Cerrados / Pausados / Jornadas / Técnicos) como **chips compactos** en la zona `meta` del `FiltersBar` de Trabajos (líneas 977-1010), junto a "X trabajos según filtros operativos". Cada chip clickeable aplica el filtro de estado correspondiente. Esto mantiene el contexto cerca de los filtros sin una banda extra de cards.

### 2. Unificar "Flujo operativo" y "Estado de trabajos"
Son casi lo mismo. Se deja únicamente **Estado de trabajos** (que ya muestra total + barra apilada + pipeline).

- En Vista general, quitar la `<section>` de líneas 778-805 (la card "Flujo operativo de trabajos" con `FlujoOperativo` + botón "Ver detalle de trabajos").
- Mover la card "Estado de trabajos" (líneas 808-812) a ese hueco, y reusar el grid de 2 columnas con "Carga técnica" al lado (lo que antes era 808-817 colapsa en una sola `<section>` de 2 columnas: Estado | Carga técnica).
- Añadir, debajo del bloque de leyenda dentro de `EstadoCompacto`, una línea compacta con los datos útiles que aportaba `FlujoOperativo` y no estaban en Estado: `Planificados {n} · Técnicos activos {n} · Cierre anterior {jornadas} jornadas / {horas} hs`. Se pasa esa info como props opcionales a `EstadoCompacto` (no se rompe el call-site de la pestaña Trabajos: allí esas props quedan undefined y la línea no se renderiza).
- Eliminar la función `FlujoOperativo` (líneas 1477-1510) por quedar sin uso.

### 3. Clientes atendidos y Carga técnica — permitir ampliar
Ahora `ClientesCompacto` muestra solo top 8 (`rows.slice(0, 8)`) y `CargaTecnicaTabla` no tiene límite explícito pero ambos quedan limitados visualmente.

- `ClientesCompacto`: agregar estado local `expanded`. Mostrar top 5 por defecto; botón al pie "Ver todos ({rows.length})" / "Ver menos" que cambia el slice a `rows.length`. Mantener `max-h-[260px] overflow-y-auto` cuando está colapsado; al expandir subir a `max-h-[440px]`.
- Pre-requisito de datos: en `topClientes` (línea 415) cambiar `.slice(0, 6)` a `.slice(0, 30)` para que haya algo que ampliar. (Ajuste mínimo de cantidad, no de lógica.)
- `CargaTecnicaTabla`: mismo patrón. Default top 6 con `max-h-[260px]`, botón "Ver todos ({rows.length})" que expande a `max-h-[440px]` mostrando todos.

### 4. Facturación por sucursal — mostrar sucursales en 0
- En `SucursalBars` (líneas 1241-1276) quitar el filtro `rows.filter((row) => row.total > 0)`. Renderizar todas las sucursales aunque tengan 0; las que tengan 0 muestran barra vacía y `$0 - 0%` en gris suave (`text-muted-foreground/70`). Esto mantiene altura constante de la card.

### 5. Espacio vacío bajo "Evolución de facturación"
La `<section>` de líneas 759-776 usa grid `xl:grid-cols-[1.45fr_0.95fr]`: izquierda Evolución de facturación (alta), derecha dos cards apiladas (Sucursal + Mix). Cuando "Mix" es corto queda hueco bajo Evolución.

- Rebalancear: pasar el grid a `xl:grid-cols-[1.2fr_1fr]` para que Evolución sea más angosta y se acerque en altura a la columna derecha.
- Añadir bajo `WeeklyBars` en la card "Evolución de facturación" una mini fila de KPIs (3 columnas, `text-xs`): Total del periodo, Promedio por semana, Variación vs periodo previo. Se calculan con los datos ya disponibles en `weeklyRows`/`currentWeekRow` (sin nuevos memos).

### Sin cambios
- Identidad visual (oliva, cards blancas, tokens existentes).
- Filtros, memos, lógica de datos.
- Pestaña Facturación.
