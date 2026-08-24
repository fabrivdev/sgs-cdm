# Tabla de Comisiones: una línea por fila y ancho aprovechado

## Qué pasa hoy

- La tabla tiene `min-w-[1080px]` fijo: a 1152px de pantalla (con el menú) las columnas quedan comprimidas y los encabezados cortos como "Orden" y "Período" se parten en dos líneas, en vez de repartirse el ancho disponible.
- Los anchos están clavados en px (`w-36` Orden, `w-40` Período, `w-28` Tipo/Estado, `w-24` Suc./Pago) y no se adaptan al ancho real; sobra espacio en unas y falta en otras.
- Tres celdas apilan dos líneas: Orden (número + "N jornadas"), Cliente (nombre + chasis) y Equipo técnico (técnico + "Técnico inactivo"). Eso duplica el alto de fila y es lo que da la sensación de "todo en doble fila".
- El texto de la tabla usa el token de 13px, el mismo que las tablas de consulta, cuando esta es una tabla operativa densa de 10 columnas.

## Cambios

1. **Filas de una sola línea**
   - Orden: solo `OS 12345`; el contador de jornadas pasa a columna propia (`Jorn.`, numérica, alineada a la derecha).
   - Cliente / chasis: se queda el nombre del cliente en una línea, truncado con tooltip; el chasis pasa al tooltip y al panel lateral (donde ya está).
   - Equipo técnico: técnico principal `+N` en una línea; "Técnico inactivo" pasa a ser un punto/badge junto al nombre, con tooltip, sin segunda línea.
   - Altura de fila fija, más baja, con celdas sin `wrap`.

2. **Ancho fluido, sin ancho mínimo grande**
   - Se quita el `min-w-[1080px]`; el ancho mínimo baja a lo que realmente necesitan las columnas fijas y las de texto (Cliente, Equipo) se llevan el sobrante con `w-auto` + truncado.
   - Encabezados cortos con `whitespace-nowrap` para que nunca partan en dos líneas.
   - Columnas numéricas y de badge con ancho justo (Horas, Jorn., Estado, Pago, Suc.).

3. **Escala densa para tablas operativas**
   - Nuevo token `tableTextDense` (12px / interlineado 16px) en `src/lib/ui-classes.ts`, para tablas densas de muchas columnas; se aplica a la tabla de OS y al resumen por técnico de Comisiones.
   - Los encabezados siguen con `tableHeadText` (11px), así que la relación título/dato se mantiene.

4. **Período más corto**
   - Fecha en formato `dd/MM/yy`, y cuando el rango es de un solo día se muestra una sola fecha (ya lo hace); en rangos se usa `dd/MM – dd/MM` con el año una sola vez.

## Verificación

- Revisión a 1152px con el menú abierto y a 1440px: sin scroll horizontal, ningún encabezado en dos líneas, todas las filas de un renglón.

## Alcance

Solo presentación de la vista Comisiones más el token nuevo en `ui-classes.ts`; no cambian consultas ni cálculos.
