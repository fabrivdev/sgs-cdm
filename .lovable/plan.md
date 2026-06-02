## Alcance

Solo cambios a `src/pages/Dashboard.tsx`. Se mantiene layout, cards blancas, color oliva, navegación, pestañas (Vista general / Facturación / Trabajos), filtros y KPIs. Sin rediseño visual.

## 1. Limpieza de textos

- Quitar el `<p>` "Desempeño comercial y operativo…" del header (líneas 616-618).
- Quitar el `<Badge>` "Facturación desde importación general, no desde OS" (líneas 620-622).
- Quitar subtítulos redundantes en `PanelTitle`/headers:
  - "Entradas rápidas al detalle" (Drill).
  - "Solo activos, sin pasantes" (KPI técnicos).
  - "Fechas usadas por la operación" (Lectura semanal/operativa).
  - "Mix sobre rubros principales" (KPI Servicios/Repuestos).
  - "Distinto en la semana seleccionada" → "Distintos en el periodo".

## 2. Lenguaje genérico de periodo

Helper local `periodoTextos(periodMode)` que devuelve `{ seleccionado, facturacion, carga, lectura, plan }`:
- `semana`: "semana seleccionada", "facturación de la semana", "carga semanal", "lectura semanal", "plan semana".
- `mes`/`anio`: "periodo seleccionado", "facturación del periodo", "carga técnica", "lectura operativa", "próximo periodo".

Reemplazos:
- SummaryCard "Facturación del periodo" (ya correcto), detalle clientes usa `seleccionado`.
- Card "Semana seleccionada" → título dinámico ("Semana seleccionada" / "Periodo seleccionado").
- Panel "Facturas de la semana" → "Facturas del periodo" cuando no es semana.
- "Carga semanal por técnico" → label dinámico (`carga`).
- "Lectura semanal" → label dinámico (`lectura`).
- "Plan semana" KPI → label dinámico (`plan`).

## 3. Bloque "Flujo operativo de trabajos"

Reemplaza el Card "Trabajos operativos" (líneas 756-772). Layout en una grilla compacta de 6 métricas pequeñas + línea secundaria:

```text
Gestionados  Culminados  Abiertos
   95           76          17
Pausados   Próximo periodo  Técnicos activos
   2            0 plan.        16
```
Línea secundaria pequeña: `Cierre anterior: {jornadasRealizadasPrev.length} jornadas · {horasPrev.toFixed(1)} hs`.

Mapeo:
- Gestionados = `trabajosResumen.length`
- Culminados = `trabajosConCierre`
- Abiertos = `trabajosActivos.length - trabajosPausados.length`
- Pausados = `trabajosPausados.length`
- Próximo periodo = `jornadasProgramadas.length` (label dinámico)
- Técnicos activos = `tecnicosConActividad.size`

Mantiene el botón "Ver detalle" hacia la pestaña Trabajos (sin texto "Ver OS/TR, cierre, horas y técnicos" → "Ver detalle de trabajos").

## 4. Estado de trabajos compacto

Reemplaza `EstadoBars` por bloque de dos niveles en `<Card>`:

Nivel 1 (resaltado): Total gestionados / Culminados / Abiertos / Pausados con conteo y %.
Nivel 2 (texto pequeño, una línea): `Pendiente N · Programado N · Iniciado N`.

Mismos clicks: setFEstadoTrabajo al estado correspondiente. Sin barras largas.

## 5. Carga por sucursal → tabla compacta

Reemplaza `TrabajoSucursalBars` (panel "Carga por sucursal" en pestaña Trabajos) y panel equivalente. Tabla:

```text
Sucursal | Cerrados | Abiertos | Pausados | Total | %
```

Calculado desde `trabajosResumen` por sucursal. `%` = total sucursal / total general. Filas clickeables → `setFSucursal`. Filas con total 0 se ocultan.

## 6. Carga técnica → tabla compacta

Reemplaza la lista de `cargaTecnicos` en pestaña Vista general y `TecnicoProductividad` en pestaña Trabajos por tabla:

```text
Técnico | Jornadas | Trabajos | Horas
```

Usa `productividadTecnica` (ya tiene jornadas, trabajos, horas). Si está vacío:
"Sin datos para los filtros seleccionados."

Título: "Carga técnica" (semana) / "Carga técnica del periodo" según `periodMode`.

## 7. Clientes atendidos → ranking compacto

Cambia el Card "Clientes atendidos" (pestaña Vista general, líneas 751-754) a layout compacto:

- Cabecera pequeña: `{clientesUnicos} clientes · {facturasTotales} facturas · Top 5 concentra {pctTop5}%`.
- Tabla densa: `Cliente | Facturas | Facturación | %`.

`pctTop5` = suma top 5 / total general. Click en fila → `setQ(nombre) + setSection("facturacion")`. Máx 8 filas, scroll interno si más.

## 8. Mix del negocio con % visibles

Modifica `ConceptLine` (o uso local) para mostrar siempre: `Rubro | USD valor | %` en una sola línea alineada.

Caso filtro de rubro único: si `fRubro !== "all"`, en lugar de mostrar 100% y otros 0%, mostrar bloque alternativo:
```
Rubro seleccionado: {fRubro}
USD {total}
```

Validación: el % usado coincide con `pctServicio / pctRepuesto` del KPI superior (mismo denominador = `total general del periodo`).

## 9. Drill de análisis simplificado

Reemplazar los 4 `DrillButton` por listas específicas según `section`:

- Vista general: Ver facturación · Ver clientes · Ver trabajos · Ver técnicos.
- Facturación: Ver facturación por periodo · Ver clientes · Ver sucursales · Ver facturas.
- Trabajos: Ver trabajos abiertos · Ver trabajos pausados · Ver planificación · Ver productividad técnica · Ver detalle OS/TR.

Acciones: cambios de `section` + `setFEstadoTrabajo`/`navigate("/planificador")` según corresponda. "Ver detalle OS/TR" hace scroll a la tabla de seguimiento (id ancla en la `<Card>`).

## 10. Compactación de espacios

- Cards con poco contenido pasan a `p-2.5` y `space-y-2`.
- Tabla de seguimiento OS/TR: agregar `max-h-[420px] overflow-y-auto` al contenedor interno.
- Top clientes y técnicos: `max-h-[260px] overflow-y-auto` cuando excedan filas.
- Quitar separadores duplicados entre KPIs.
- No mover las tablas largas por encima de los KPIs.

## Notas técnicas

- Todos los textos dinámicos se centralizan en el helper `periodoTextos`.
- No se introducen nuevas dependencias.
- No se cambian queries, RLS ni lógica de datos. Reaprovecho los memos existentes (`trabajosResumen`, `productividadTecnica`, `factBySucursal`, `topClientes`).
- Helpers `EstadoBars`, `TrabajoSucursalBars`, `DrillButton`, `Kpi`, `ConceptLine` se mantienen o se reemplazan por equivalentes inline más compactos sin cambiar tokens de color (uso de `text-muted-foreground`, `border`, `bg-accent`).
