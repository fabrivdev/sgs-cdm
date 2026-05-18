# Filtro "Vista por día" / "Vista por semana" en el Planificador

## Contexto

Hoy el Planificador **expande** cada servicio en una fila por cada jornada (`servicio_jornadas`). Si un servicio dura 3 días, aparece 3 veces en la semana.

## Cambio propuesto

Agregar un toggle al lado del botón "Filtros" con dos opciones:

- **Por día** (actual, default) — una fila por jornada.
- **Por semana** — una sola fila por servicio dentro de la semana filtrada, aunque tenga varias jornadas.

## Detalles técnicos

1. Nuevo estado `vista: "dia" | "semana"` (default `"dia"`).
2. Toggle compacto (`ToggleGroup` o dos botones) en la barra de acciones junto a "Filtros".
3. En el `useMemo` `filtered`, si `vista === "semana"`:
   - Agrupar el resultado por `s.id`.
   - Quedarse con **una** fila por servicio: la de fecha más temprana dentro del rango filtrado.
   - Mostrar en la columna Fecha algo como `dd/MM – dd/MM` cuando el servicio tiene >1 jornada en la semana (o un badge "Nx" indicando cantidad de días), para que se vea que es un servicio multi-día.
4. El export a Excel respeta la vista activa (si es "por semana", exporta deduplicado).
5. El cambio de estado en línea sigue funcionando: en vista semana actúa sobre la jornada del primer día visible (igual que hoy con una fila por jornada).

## Archivos a tocar

- `src/pages/Planificador.tsx` — único archivo afectado.

¿Te parece bien que el default siga siendo "Por día"? ¿Y querés que en vista semana se muestre el rango de fechas (ej. `15/05 – 17/05`) o sólo la primera fecha con un contador?
