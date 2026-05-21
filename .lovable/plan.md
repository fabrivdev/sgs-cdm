## Corregir lógica de estado de trabajos y cards Kanban

### Nueva regla en `recalcular_estado_trabajo`

Variables ya disponibles en la función:
- `v_realizadas` = jornadas con estado `Completado`
- `v_agenda_futura` = agendas `Pendiente` con fecha >= hoy
- `v_agenda_vencida` = agendas `Pendiente` con fecha < hoy

Lógica corregida:

```text
si v_realizadas = 0:
    si v_agenda_futura > 0       → 'programado'
    sino                          → 'pendiente'   (incluye solo vencidas o sin agenda)

si v_realizadas > 0:
    si v_agenda_futura + v_agenda_vencida > 0  → 'iniciado'
    sino                                        → 'completado'
```

Diferencia clave vs. versión anterior: cuando hay al menos una jornada realizada, las agendas vencidas sin cargar también cuentan como "pendiente de cierre" y mantienen el trabajo en `iniciado` (no lo pasan a `completado`).

### Migración

1. `CREATE OR REPLACE FUNCTION public.recalcular_estado_trabajo` con la nueva lógica.
2. Recalcular todos los trabajos existentes:
   ```sql
   DO $$ DECLARE r record; BEGIN
     FOR r IN SELECT id FROM public.trabajos LOOP
       PERFORM public.recalcular_estado_trabajo(r.id);
     END LOOP;
   END $$;
   ```

### Cards del Kanban (`src/pages/Trabajos.tsx`)

Cálculo actual ya tiene `agendasFuturas` y `agendasVencidas`. Cambiar la línea de meta de la card:

- Si hay `proxima` (agenda futura): mostrar fecha próxima + `· N pend.` si hay más de una futura. Sin cambios.
- Si NO hay agenda futura pero SÍ vencidas:
  - Columna `pendiente` (sin jornadas realizadas, lo determina el estado del trabajo): mostrar en ámbar `"Sin agenda vigente · X fecha(s) vencida(s)"` (como ahora).
  - Columna `iniciado`: mostrar en ámbar `"X fecha(s) pendiente(s) de cierre"`.
  - En otras columnas (`completado`): no mostrar nada (no debería ocurrir con la nueva regla).

Usar `col.key` para decidir el copy. No requiere fetch extra de `jornadas` porque el estado del trabajo ya distingue ambos casos: si está en `iniciado` con vencidas, son "pendientes de cierre"; si está en `pendiente` con vencidas, son "vencidas sin avance".

### Archivos afectados

- Nueva migración SQL (función + recálculo masivo).
- `src/pages/Trabajos.tsx` — ajustar el texto de la card según `col.key`.

Sin cambios en el resto de componentes ni en el schema.
