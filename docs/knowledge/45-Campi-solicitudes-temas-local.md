# Solicitudes de temas desde el badge: conexión preparada, no activada

## Estado real

El formulario ya usa un adaptador Supabase real, no el almacén de demostración. La bandera VITE_CAMPI_TOPIC_REQUESTS_ENABLED debe ser exactamente true para permitir consultas/envíos; actualmente no se habilitó. Con la bandera ausente se bloquea el envío: «El envío de propuestas todavía no está habilitado.» Los registros de demostración existentes no se importan ni se presentan como solicitudes persistidas.

No se instaló la migración remota ni se crearon cuentas, roles, solicitudes o avisos reales. El acceso Proponer un tema sigue limitado a DEV mientras se prueba localmente. No modificar bienvenida, actor, cuatro prioridades, métricas ni comentarios.

## Flujo conectado

- Sesión comprobada antes de consultar o escribir; el propietario se toma de auth.uid() en el servidor, nunca de un parámetro del formulario.
- Lectura paginada de solicitudes: propias para usuario; bandeja global para superadmin, siempre bajo RLS. El solicitante se identifica por su identificador de cuenta; todavía no se consulta nombre de perfil.
- Envío RPC con clave idempotente. Se conserva la clave ante resultado incierto mientras el formulario sigue montado y el texto no cambia. No se reintenta automáticamente. Si se cierra la aplicación tras un resultado incierto, revisar Mis solicitudes antes de reenviar.
- Estados recibida, preparación, disponible o no viable con motivo. Sólo se confirma la actualización después de validar respuesta del servidor. Las notas de gestión son visibles al solicitante y se etiquetan así; no son comentarios privados del superadmin.
- Disponible requiere registro de publicación real y permisos del destinatario comprobados por RPC. La UI ofrece sólo temas publicados presentes en su catálogo; no hay casilla de publicación simulada.
- Aviso privado únicamente con registro de aviso, solicitud disponible, release visible bajo RLS y tema autorizado en el catálogo local. Cambios de foco/visibilidad, apertura y botón Actualizar seguimiento refrescan la bandeja. No hay push, correo ni promesa de aviso inmediato.
- Elegir mis temas abre el selector existente: no sustituye las cuatro prioridades automáticamente.
- Al fallar la consulta no se muestra una bandeja vacía como si estuviera verificada. Se cancelan efectos de respuestas obsoletas al cambiar cuenta o desmontar. Envío/gestión bloquean doble clic.

## Textos principales

- Pregunta: «¿Qué te gustaría poder consultar en tu panorama?»
- Explicación: «Las propuestas se revisan antes de decidir si pueden incorporarse. Este formulario no da una respuesta inmediata.»
- Ayuda: «Entre 15 y 1000 caracteres. Evitá datos personales innecesarios.»
- Confirmación, sólo tras RPC validada: «Solicitud enviada. Podés consultar su estado en Mis solicitudes.»
- Gestión confirmada: «Estado actualizado.»
- Disponibilidad verificada: «El tema solicitado está disponible. Podés elegir si lo agregás a tu Panorama.»
- Envío incierto: «No se pudo confirmar el envío. Reintentá sin cambiar el texto para evitar duplicados.»
- Consulta fallida: «No se pudo actualizar el seguimiento. Intentá nuevamente.»

No hay fecha prometida, garantía de implementación ni éxito de demostración.

## Instalación pendiente y alcance exacto

Archivo supabase/migrations/20261030200000_campi_topic_requests_local.sql, sin modificaciones por esta conexión:
SHA256 E0B04D3504AB08EDFDEF92775F4057883C686C66AA909A92F44F4AF69C05CFBC.

Crear tres tablas nuevas: campi_topic_requests, campi_topic_releases, campi_topic_notices. Crear dos RPC SECURITY DEFINER con search_path fijo: campi_submit_topic_request(uuid,text) y campi_manage_topic_request(uuid,text,text,text). RLS permite solicitudes propias o lectura superadmin; avisos sólo propios y con release autorizado; releases publicados con permisos de módulo/sección existentes. Tablas: SELECT authenticated bajo RLS, sin escritura directa; revocación puntual de privilegios para PUBLIC, anon, authenticated y service_role en esas tablas, seguida del SELECT indicado. RPC: EXECUTE authenticated, sin PUBLIC/anon/service_role. No cambia roles, tablas ajenas ni permisos de negocio existentes.

La migración no crea avisos ni marca temas publicados. Registrar un tema publicado requiere una operación de despliegue aprobada: topic_id/title/sections/require_all/release_ref/published_at deben corresponder a una versión realmente publicada y comprobada. No hay RPC cliente para declarar una publicación. No basta cambiar una casilla o asociar un tema.

## Prueba real pendiente

No se encontró Supabase/PostgreSQL servidor local ni Docker disponible; las configuraciones existentes apuntan al backend compartido. PGlite valida SQL con identidades sintéticas, pero no es un servidor de autenticación de dos usuarios.

Para E2E real: aprobar instalación puntual anterior y registro de UN tema existente efectivamente disponible; designar dos cuentas existentes autorizadas para prueba (solicitante y superadmin), sin crear cuentas ni cambiar roles. Después activar sólo frontend local. Probar envío del solicitante, recepción superadmin, preparación, negativa de disponibilidad sin release/permisos, disponibilidad válida y un único aviso privado; reintentar sin duplicado, acceso cruzado denegado, motivo no viable y elección voluntaria sin alterar automáticamente preferencias. Únicamente esas cuentas pueden recibir avisos de prueba. No seleccionar destinatarios por iniciativa del asistente.

Reversión operativa no destructiva: desactivar bandera local, conservando solicitudes y tablas. No borrar datos ni eliminar objetos como parte automática de rollback.

QA visual sigue sin realizarse por bloqueo de Computer Use; no se reintenta por otra vía. Pruebas UI/adaptador con fixtures y SQL sintético no acreditan recepción real entre cuentas ni instalación productiva. La entrega a main no instala el SQL ni publica Lovable; la conexión permanece apagada hasta verificar la instalación.
