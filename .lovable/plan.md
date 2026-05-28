## Problema

Al programar una jornada sobre TR-000022 (y otros trabajos con `legacy_servicio_id` antiguo), aparece:

> new row violates row-level security policy for table "servicio_jornadas"

Causa raíz: el `servicio` legacy vinculado tiene `sucursal = NULL`. La política RLS de `servicio_jornadas` (insert/update) exige que `servicios.sucursal = get_user_sucursal(auth.uid())` para el rol `cabecilla`. Con NULL nunca matchea. Además, el `UPDATE` que hace `ProgramarIntervencionDialog` sobre `servicios` también está bloqueado por la política de `servicios` (que usa la sucursal **actual**, NULL), así que el intento de "rellenar" la sucursal nunca llega a aplicarse.

## Plan

1. **Migración de datos**: rellenar `servicios.sucursal` desde `trabajos.sucursal` para todas las filas donde `servicios.sucursal IS NULL` y exista un trabajo vinculado por `legacy_servicio_id`. Esto desbloquea los trabajos existentes.

2. **Backend defensivo (RPC con SECURITY DEFINER)**: crear una función `public.programar_jornada(p_trabajo_id, p_fecha, p_tecnico_id, p_auxiliares, p_observacion)` que:
   - Verifique permisos (admin o cabecilla de la sucursal del trabajo) con `has_role` / `get_user_sucursal`.
   - Cree el `servicio` si no existe o actualice el existente forzando `sucursal = trabajo.sucursal`.
   - Inserte/actualice la `servicio_jornada` correspondiente.
   - Llame a `recalcular_estado_trabajo`.
   
   Esto evita los problemas de RLS encadenados (servicio NULL → no actualizable → jornada no insertable) y centraliza la lógica.

3. **Frontend**: en `src/components/trabajos/ProgramarIntervencionDialog.tsx`, reemplazar el bloque de inserts/updates manuales por una sola llamada `supabase.rpc('programar_jornada', {...})`. Mantener manejo de errores y `toast`.

4. **Verificación**: reintentar programar jornada en TR-000022 como cabecilla y como admin.

## Detalles técnicos

- La política de `servicios.UPDATE` para cabecilla usa `sucursal = get_user_sucursal(...)` en `USING`, por eso un NULL bloquea cualquier update desde el cliente — la RPC `SECURITY DEFINER` lo resuelve.
- No se modifica ninguna política RLS existente (siguen siendo correctas en su intención).
- `CargarJornadaDialog.tsx` no necesita cambios porque opera sobre jornadas ya creadas con servicio ya saneado por la migración del paso 1.
