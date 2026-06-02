## Ajustes Dashboard — vista general

Cuatro cambios puntuales sobre `src/pages/Dashboard.tsx`. Sin tocar identidad visual ni queries Supabase.

### 1. Espacio vacío bajo "Evolución de facturación / Mix"

Causa: la fila `xl:grid-cols-[1.2fr_1fr]` mide su alto por la columna más alta. La izquierda (Evolución + EvolucionKpis) suele ser más alta que el stack de la derecha (Sucursal + Mix), y debajo del chart de evolución queda margen libre. A su vez, las dos cards de la derecha empujan poco contenido y dejan blanco abajo del Mix.

Plan:
- Cambiar la sección a `xl:grid-cols-3` con: Evolución (col-span-2) + columna derecha apilada (Sucursal arriba, Mix abajo). Mantener `auto-rows-fr` para que las alturas se igualen.
- Quitar la `Card` "Mix del negocio" como bloque separado y mover el mix dentro de la card de Evolución como **footer compacto** (barra apilada horizontal de 100% con leyenda en una línea). Esto:
  - elimina el hueco vertical bajo Mix,
  - balancea altura entre la columna izquierda (Evolución + mini-mix + EvolucionKpis) y derecha (Sucursal a altura completa).
- La columna derecha entonces queda sólo con "Facturación por sucursal" estirada a `h-full`, ocupando todo el alto disponible junto a Evolución. Sin huecos.

### 2. "Mix del negocio" — rediseño

Convertir `MixRubros` en una **stacked progress bar** horizontal de 100% (segmentos: Repuestos / Servicios / Kilometraje / Otros) con leyenda de chips abajo que muestren `label · monto · %`. Cada segmento clickable para filtrar por rubro (`setFRubros([label])`). Colores: primary, sky-500, amber-500, slate-400 (semantic via tokens existentes).

Caso `rubroFiltro !== "all"` se mantiene como bloque destacado actual.

Componente vive embebido al pie de la card de Evolución (ver punto 1), max-h ~56px para no romper alturas.

### 3. "Estado de trabajos" → donut

Reemplazar la barra horizontal de `EstadoCompacto` por un **donut** (recharts `PieChart` + `Pie` con `innerRadius`) que muestra Culminados / Abiertos / Pausados con el total al centro (`flujo.total` + label "gestionados"). Mantener:
- segmentos clickeables (`onClick` por celda → `onSelect(estado.key)`),
- leyenda a la derecha del donut con `dot · label · valor · %` (manteniendo los mismos chips clicables actuales),
- pipeline (Pendiente / Programado / Iniciado) y footer (Planificados / Técnicos activos / Cierre anterior) intactos debajo.

Layout interno: `flex gap-3` con donut (~140px) a la izquierda y leyenda + pipeline + footer apilados a la derecha.

### 4. "Planificadas" siempre 0

Causa raíz: `jornadasProgramadas` (línea 439) filtra por `inRange(jornada.fecha, weekStart, weekEnd)`. Cuando `periodMode` es `mes` o `anio`, ese rango es solo la semana base, así que rara vez hay jornadas pendientes ahí.

Plan:
- Introducir `periodStart` / `periodEnd` derivados del `periodMode`:
  - `semana`: `weekStart` / `weekEnd`
  - `mes`: `monthStart` / `monthEnd`
  - `anio`: `startOfYear(weekStart)` / `endOfYear(weekStart)`
- Reemplazar el rango usado en `jornadasProgramadas` por `periodStart`/`periodEnd`.
- Aplicar el mismo cambio a `jornadasRealizadasPrev` para que use el periodo anterior equivalente (semana/mes/año previo) en vez de siempre la semana previa. Esto alinea los KPIs "jornadas cerradas · planificadas" del `SummaryCard` y del footer de `EstadoCompacto` con el periodo activo.
- `cargaTecnicos` y `tecnicosConActividad` ya consumen estas listas → quedan corregidos por arrastre.

### Fuera de alcance

- Queries Supabase, filtros, identidad visual.
- Pestañas Facturación y Trabajos (salvo donde reusan `jornadasProgramadas`/`jornadasRealizadasPrev`, que se benefician sin cambios extra).

### Archivos modificados

- `src/pages/Dashboard.tsx` (puntos 1–4).
