## Problemas

1. **Carga por sucursal** muestra trabajos como "cerrados" usando el estado global del trabajo. Un trabajo que se cerró en mayo pero tuvo cualquier `actualizado_en`/jornada en junio aparece como "cerrado en junio". El usuario quiere contar solo los que efectivamente cerraron dentro del período.

2. **Matriz Técnico×Semana** solo cuenta jornadas con `estado === "Completado"`. Por eso técnicos con muchas jornadas asignadas pero aún Pendientes (caso Ruben Cáceres en sem. 22) aparecen casi vacíos. El usuario quiere ver la carga asignada.

## Cambios en `src/pages/Dashboard.tsx`

### 1. `cargaSucursal` (≈ línea 619)

Redefinir las columnas para que reflejen lo que pasó **dentro** de `[periodStart, periodEnd]`:

- **cerrados** = trabajos cuya **fecha de cierre** cae en el período. Cierre = `max(fecha de jornadas Completado del trabajo)` y el trabajo está hoy en `estado === "completado"`. Si esa fecha cae en `[periodStart, periodEnd]` → cuenta.
- **pausados** = trabajos hoy en `estado === "pausado"` con al menos una jornada en el período (o `actualizado_en` en el período).
- **abiertos** = trabajos con actividad en el período (jornada o `creado_en` en el período) que no son ni "cerrados-en-período" ni "pausados". Incluye pendiente / programado / iniciado.
- **total** = cerrados + pausados + abiertos (sin doble conteo).
- **pct** sobre el total de todas las sucursales del período.

Para esto, en `trabajosBase` (línea 547) agregar `fechaCierre` = máxima `fecha` de jornadas con `estado === "Completado"` (ya disponible vía `realizadas`). Reutilizar para el cálculo.

### 2. `productividadMatriz` (≈ línea 643)

- Cambiar la fuente: iterar **todas las jornadas** (no solo las de `trabajosResumen`, que está afectada por filtros de la pestaña Trabajos). Recorrer `jornadas` directamente, mapeando a `trabajo` via `jornadasByTrabajo` para asegurar que el trabajo esté en scope (sucursal/búsqueda).
- Cambiar el filtro: contar **toda jornada cuya `fecha` cae en el período** y `estado !== "Cancelada"` (es decir Pendiente + Completado). Esto representa "jornadas asignadas al técnico en el período".
- Para la métrica **horas**: solo sumar `horas_trabajadas` de jornadas Completado (las Pendientes no tienen horas reales). Las celdas en modo "servicios" cuentan asignadas; en modo "horas" cuentan horas reales cerradas. Ajustar el header del toggle para dejar claro: "Servicios asignados" / "Horas trabajadas".

### 3. Etiquetas UI

- En la tabla Carga por sucursal: tooltip o subtítulo "Cerrados / pausados / abiertos dentro del período seleccionado".
- En la matriz: renombrar el toggle a `Servicios asignados | Horas trabajadas` para evitar confusión.

## Fuera de alcance

- Filtros superiores, modo de período, facturación por sucursal y resto del Dashboard quedan igual.
- No se tocan migraciones ni queries Supabase (los datos necesarios ya están cargados).
