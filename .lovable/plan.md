# Fix: panel "Carga técnica" se queda sin datos

## Diagnóstico

La tabla "Carga técnica" del Dashboard a veces aparece vacía aunque sí hay jornadas. Encontré dos bugs en `src/pages/Dashboard.tsx` que lo explican y se disparan según la combinación de período + fecha base seleccionada (por eso parece aleatorio):

1. **`productividadTecnica` usa un rango fijo de ~2 semanas** (`previousWeekStart..weekEnd`), aunque el panel se titula "Carga técnica del período" y el resto del dashboard usa `periodStart..periodEnd` (semana, mes o año). Al cambiar a Mes o Año, la tabla sigue mirando sólo la quincena alrededor de la semana base → si no hubo jornadas en esos 14 días, queda vacía.

2. **El fetch de `servicio_jornadas` no cubre todo el período**: en el `useEffect` sólo se traen jornadas entre `subWeeks(previousWeekStart, 8)` y `weekEnd` (~10 semanas alrededor de la semana base). Si el usuario navega a un mes/año cuya ventana queda fuera de esos 10 días previos, las jornadas ni siquiera se descargan, así que cualquier cálculo posterior queda vacío.

Como `periodMode` y `periodStart`/`periodEnd` tampoco están en las dependencias del `useEffect`, cambiar de Semana → Mes → Año no re-dispara la carga.

## Cambios

**`src/pages/Dashboard.tsx`**

1. En el `useMemo` de `productividadTecnica` (≈ línea 628):
   - Reemplazar `inRange(jornada.fecha, previousWeekStart, weekEnd)` por `inRange(jornada.fecha, periodStart, periodEnd)`.
   - Actualizar las dependencias: quitar `previousWeekStart, weekEnd`, agregar `periodStart, periodEnd`.

2. En el `useEffect` de carga inicial (≈ línea 231-288):
   - Ampliar el rango del query de `servicio_jornadas` para que cubra todo el período visible además del histórico necesario para comparativos:
     - `from = min(subWeeks(previousWeekStart, 8), periodStart)`
     - `to   = max(weekEnd, periodEnd)`
   - Agregar `periodStart`, `periodEnd` (y `periodMode` si hace falta) al array de dependencias del `useEffect`, así cambiar de Semana/Mes/Año re-dispara la carga con el rango correcto.

3. Verificar que `cargaTecnicos` y demás métricas que dependen de `jornadasProgramadas` / `jornadasRealizadasPrev` sigan correctas (ya usan `periodStart/periodEnd`, sólo necesitaban que el fetch trajera los datos del período).

No se tocan tablas, RLS ni lógica de negocio: sólo se corrige el rango temporal del panel y del fetch.

## Validación

- Cambiar el período a Mes y mover la fecha base a meses anteriores → la tabla debe mostrar técnicos con jornadas del mes elegido.
- Cambiar a Año → debe mostrar la actividad acumulada del año.
- Volver a Semana → comportamiento equivalente al actual (la semana seleccionada queda incluida).
