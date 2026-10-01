# Presencia de usuarios

## Alcance

Administracion muestra uso real de la aplicacion para cuentas autenticadas. No se considera un login como actividad. Se persisten unicamente el UUID existente del usuario y tres marcas de tiempo: ultima actividad, ultimo heartbeat y desconexion explicita.

No se capturan teclas, texto, rutas visitadas, IP, geolocalizacion ni contenido de las interacciones.

## Estados y caducidad

- **Activo ahora**: heartbeat de hasta 90 segundos y actividad de hasta 120 segundos.
- **Inactivo**: tuvo actividad/heartbeat en los ultimos 10 minutos, pero ya no cumple la ventana activa.
- **Desconectado**: logout explicito o mas de 10 minutos sin actividad/heartbeat.

El heartbeat se intenta cada 45 segundos solo si la pagina esta visible y hubo interaccion reciente. Un throttle compartido por `localStorage` evita que varias pestanas multipliquen los heartbeats normales; abrir una pestana puede producir un heartbeat inicial adicional.

## Seguridad y degradacion

La tabla tiene RLS forzada y solo admin/superadmin activo puede leerla. Los usuarios no tienen lectura ni escritura directa; las RPC `touch_user_presence` y `disconnect_user_presence` derivan la identidad de `auth.uid()` y no aceptan un usuario objetivo.

La presencia es auxiliar: fallas de red o una migracion aun no aplicada no bloquean autenticacion, navegacion ni logout. La vista admin consulta cada 60 segundos solo mientras esta visible.

## Validacion local

El paquete `docs/sql/user-presence/` contiene preflight, migracion y verificacion separados. `scripts/test-user-presence-fixture.sql` valida en PostgreSQL portable lectura exclusiva admin, rechazo de escritura directa, rechazo de usuario inactivo y desconexion explicita.
