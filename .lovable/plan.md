## Problema

Al intentar cambiar el email/contraseña de un técnico desde `/admin`, aparece el toast genérico **"Edge Function returned a non-2xx status code"** y no se ve el motivo real. En los logs de auth se ve un `422` desde el endpoint `admin/users/...` (lo devuelve Supabase Auth, no nuestro código). Las causas típicas de un 422 son: email ya usado por otra cuenta, formato inválido, o política de contraseña no cumplida.

El motivo real **sí lo devuelve** la edge function `admin-update-user` en el body (`{ error: "..." }`), pero como la respuesta usa `status: 400`, el SDK de Supabase lo trata como error genérico y descarta el body. Por eso el usuario nunca ve la razón.

## Solución

Pequeño cambio en las edge functions de administración para que los errores controlados se devuelvan con `status: 200` y `{ error: "..." }`. Así el cliente puede leer `data.error` y mostrarlo en el toast (el código del front ya hace `toast.error(error?.message || data?.error)`).

### Archivos a tocar

1. **`supabase/functions/admin-update-user/index.ts`** — cambiar los `status: 400/401/403/404` (errores de validación o de Supabase Auth) por `status: 200` manteniendo el body `{ error }`. Dejar `500` solo para excepciones inesperadas.
2. **`supabase/functions/admin-create-user/index.ts`** — mismo ajuste, por consistencia (mismo síntoma posible al crear).
3. **`supabase/functions/admin-delete-user/index.ts`** — mismo ajuste.

No cambia ninguna lógica de negocio ni el front; solo se desbloquea ver el mensaje real (por ejemplo *"A user with this email address has already been registered"*), para que sepas si el email ya está en uso por otra cuenta o si la contraseña no cumple la política.

## Siguiente paso

Tras aplicar esto y reintentar, el toast mostrará el motivo exacto del 422 y podremos resolverlo (lo más probable: ese email ya pertenece a otro usuario auth, o la contraseña es muy corta para la política del proyecto).