Causa raíz: la tabla `profiles` actual no tiene columna `auth_user_id`. La UI lo detecta y envía `{ user_id }` al edge function `admin-delete-user`, pero esa función solo acepta `{ profile_id }` y por eso responde "Falta profile_id".

En este esquema el `profiles.id` es igual al `auth.users.id` (lo crea el trigger `handle_new_user`), por lo tanto se puede borrar el usuario de auth usando directamente ese id.

Cambios:

1. Actualizar `supabase/functions/admin-delete-user/index.ts`:
   - Aceptar tanto `profile_id` como `user_id` en el body (uno u otro).
   - Si `profile_id` viene presente, mantener el flujo actual (esquema con `auth_user_id`).
   - Si solo viene `user_id`, tratar ese id como el id de `auth.users` y como el id del profile (esquema actual):
     - Validar que no sea el mismo usuario autenticado.
     - Eliminar el usuario con `admin.auth.admin.deleteUser(user_id)`.
     - Eliminar la fila en `profiles` con `eq("id", user_id)` por si no hay cascade.
     - Eliminar roles en `user_roles` con `eq("user_id", user_id)`.
   - Mantener mensajes de error claros y CORS.

2. No tocar la UI ni la base de datos. El cliente ya envía el payload correcto para cada esquema.