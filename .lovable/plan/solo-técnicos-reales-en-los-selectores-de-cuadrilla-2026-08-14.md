# Solo técnicos reales en los selectores de cuadrilla

## Qué pasa hoy

La lista de técnicos (planificador, programar intervención, cargar jornada, filtros del dashboard) sale de una función del backend que acepta a cualquier persona activa que **no tenga usuario de acceso vinculado**, sin mirar su rol.

Como los roles de varias personas están asociados al perfil y no al usuario de acceso, hoy entran en la lista perfiles que no son técnicos:

- fabrizio.vega (admin)
- ANGELA KNORST, DIEGO BARREIRO, JULIANA BECK (gerencia)
- RUBEN MONGES (jefatura)

El resto de la lista (Ruben Caceres Lugo, Aguedo Arrua, etc.) sí son operativos sin usuario, y deben seguir apareciendo.

## Regla nueva

Una persona aparece como técnico asignable solo si está activa, su nombre no contiene "pasante", y:

- no tiene ningún rol administrativo asignado (admin, gerencia, jefatura), y
- o bien no tiene usuario de acceso (personal operativo de campo), o bien tiene rol operativo con acceso al módulo Servicios.

Con esto quedan fuera los 5 perfiles listados arriba y no se pierde ningún técnico actual.

## Detalle técnico

Migración que reemplaza `public.servicios_listar_tecnicos_activos()` agregando un filtro `NOT EXISTS` sobre `user_roles` para los roles `admin`, `jefatura` y `gerencia`, buscando por `user_id IN (p.id, p.auth_user_id)` (igual que las condiciones existentes, para cubrir los roles guardados contra el id del perfil). No cambia la firma ni el frontend: todos los selectores consumen el mismo hook `useServicioTecnicos`.

## Nota

Si preferís que Jefatura (Ruben Monges) siga siendo asignable a jornadas, se excluye solo admin y gerencia — avisame y lo ajusto antes de aplicar.
