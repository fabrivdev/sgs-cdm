# Habilitar presencia de usuarios

Ejecutar, en orden, un archivo por paso en el SQL Editor de Supabase:

1. `00_preflight.sql` — debe devolver `PRECHECK_OK`. Si falla, no continuar.
2. `01_migration.sql` — crea la tabla, la politica RLS y las dos RPC.
3. `02_verification.sql` — debe devolver `VERIFY_OK`.

La aplicacion funciona aunque este paquete no se aplique: el panel muestra que la presencia esta pendiente y los heartbeats fallidos no interrumpen el uso. El cambio no se aplica automaticamente a la base remota mediante commit o deploy.

Datos guardados: UUID del usuario, ultima actividad, ultimo heartbeat y desconexion explicita. No se guardan teclas, texto, ruta, IP, geolocalizacion ni contenido de la interaccion.
