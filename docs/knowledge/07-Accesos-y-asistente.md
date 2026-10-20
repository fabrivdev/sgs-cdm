# Accesos y asistente

## Autorización

Administración del 18/09: Equipo y Accesos tienen encabezados ordenables y exportación filtrada/ordenada con `datos:exportar`; perfiles/roles/accesos se cargan por páginas estables. Bloquear descarga durante carga/fallo. No cambia creación de operativos, roles, cuentas ni concesión de permisos. Fuente: `src/pages/Admin.tsx`, `docs/tablas-orden-exportacion.md`; pruebas simuladas, no altas productivas.

Autenticación, rol, módulo y sección son controles distintos. `ProtectedRoute` consulta sesión, roles y permisos; las acciones del servidor deben volver a validar autorización. Ocultar un menú no reemplaza RLS o validación de una RPC.

Fuentes: `src/components/ProtectedRoute.tsx`, `src/lib/permissions.ts`, `src/hooks/useAuth.tsx`, funciones de administración y políticas SQL. Revisar la existencia real de funciones y permisos de Ventas en la base ante un usuario sin acceso.

`Stock proyectado` es una sección propia de Parque con permiso `parque.stock_proyectado`; no debe depender permanentemente de `parque.stock`. Al introducirla se copian una sola vez los accesos existentes de Stock, y luego Administración puede conceder o revocar ambas opciones de forma independiente. Menú y ruta deben usar esa misma clave; la función SQL vuelve a comprobarla en servidor. Esto está comprobado en código y pruebas de `origin/main` hasta `ad24b03`, no en producción ni en el checkout divergido usado para generar este inventario.

## Operativos de Servicios sin credenciales

Administración permite registrar un operativo con nombre y sucursal y Acceso al sistema apagado. Se crea un perfil activo con identidad propia y `auth_user_id = null`, sin cuenta Auth, roles de autenticación ni permisos. La nómina de Servicios ya incluye estos perfiles sin acceso; no inventar correo o contraseña para agregarlos. Si se solicita inicio de sesión, el formulario exige credenciales y conserva la función administrativa protegida. La asociación posterior debe reutilizar el perfil, no duplicar al integrante. Cuenta creada no implica módulos/secciones concedidos.

Fuentes: `src/pages/Admin.tsx`, `src/lib/admin-create-person.ts`, `docs/alta-operativos-servicios.md`, `servicios_listar_tecnicos_activos`. Pruebas con respuestas simuladas; no validación ni altas de usuarios en producción. Sin nuevas migraciones para este cambio.

## Excepción a revisar al agregar acceso a un operativo

La vinculación posterior conserva `profile_id`, pero el camino `linkedProfile` de `admin-create-user` no inserta un rol. `guardarCred` en Administración tampoco envía nivel para esa asociación. El trigger `handle_new_user` enlaza `auth_user_id`, sin crear roles. En cambio, `servicios_es_tecnico_activo` exige rol Operativo y acceso al módulo Servicios cuando el perfil pasa a tener cuenta. Por lo tanto, un perfil nuevo creado sin roles puede dejar de ser seleccionable si se le asocia acceso sin completar su rol y permisos. Es una incompatibilidad deducida de código/SQL local, no un caso reproducido en producción ni un fallo del alta sin cuenta. Revisar la transición y la nómina antes/después sin duplicar la persona. Esta revisión solo la documenta; no modifica código ni cuentas.

Fuentes: `src/pages/Admin.tsx` (`guardarCred`), `supabase/functions/admin-create-user/index.ts`, `20260522110000_link_profiles_to_auth_users.sql`, `20260821150000_consolidate_active_commission_technicians.sql`.

## Policies RLS sin acceso incondicional

Una policy `TO authenticated` con `USING (true)` o `WITH CHECK (true)` habilita a cualquier cuenta autenticada, aunque el menú o la ruta estén ocultos. La corrección versionada el 24/09 reemplaza esas condiciones por permisos de módulo/sección en configuración, secciones, días no laborales, catálogos de máquinas, módulos, OS importadas e historial. `profiles` exige una identidad activa y acceso efectivo; la tabla técnica factura–cliente conserva el alcance de Parque sin depender del predicado redundante `auth.uid() IS NOT NULL`.

La migración también elimina aliases incondicionales creados desde consola únicamente en las tablas auditadas, para que una policy antigua no se combine de forma permisiva con la nueva. El resultado exportado de `pg_policies` después de la primera ejecución identificó los dos hallazgos restantes: `clientes_read_authenticated` en `clientes` y cuatro aliases `trabajos_*_authenticated` en `trabajos`, todos con `true`. El primer SQL correctivo se detuvo de forma atómica porque producción no conservaba una policy `INSERT` restringida para `trabajos`; el error confirma que no modificó ninguna policy. La migración posterior `20260924143000_restore_scoped_trabajos_rls.sql` crea primero SELECT/INSERT/UPDATE/DELETE de Trabajos acotadas a módulo Servicios y rol, sucursal o asignación, comprueba que Clientes conserve una lectura restringida y recién después quita los aliases abiertos. No elimina RLS ni concede acceso anónimo.

Catálogos de máquinas quedan en Parque; OS en Servicios o Importación de datos; parámetros en Dashboard/Parámetros; calendario en su sección; inserción directa de historial requiere ver el trabajo o importar datos. Los triggers de auditoría `SECURITY DEFINER` conservan su funcionamiento. Cada bloque comprueba `to_regclass` antes de operar: una tabla opcional ausente, como `app_configuracion` en una instalación parcial, se omite sin revertir las correcciones aplicables a las demás. `profiles` también contempla el esquema anterior sin `auth_user_id`.

Implementación local: `supabase/migrations/20260924130000_harden_remaining_authenticated_rls.sql` y seguimiento `supabase/migrations/20260924143000_restore_scoped_trabajos_rls.sql`; prueba estática: `src/test/securityRlsHardening.test.ts`. La prueba específica pasa. La compilación pasó para la versión anterior del mismo endurecimiento; la suite completa conserva fallos previos ajenos de textos/mocks y timeouts. Evidencia productiva limitada: el escáner de Lovable bajó de 11 a 2 tablas después del SQL manual, el CSV confirmó cuáles eran y el intento siguiente confirmó la ausencia del `INSERT` restringido sin aplicar cambios. La migración de seguimiento aún requiere ejecución manual y un nuevo escaneo, por lo que no se afirma cierre productivo.

## Asistente de la app

El asistente analítico es independiente de esta bóveda de Obsidian. Su arquitectura documentada usa una Edge Function, catálogo semántico y planes estructurados validados. No ejecutar SQL arbitrario generado por un modelo ni exponer claves del servidor en el cliente.

Fuente: `docs/AI_ASSISTANT_ANALYTICS.md`, `docs/AI_ASSISTANT_SETUP.md`, `supabase/functions/ai-data-assistant`, `supabase/functions/_shared/assistant-semantic.ts`.

Esta configuración NO conecta las notas a ese asistente ni instala un plugin de IA en Obsidian. Es memoria documental consultable por personas y agentes de desarrollo. Una integración de búsqueda/chat requeriría elegir proveedor, alcance y privacidad aparte.

## Privacidad de la bóveda

Se generan reglas, referencias e inventarios técnicos. No copiar `.env`, tokens, claves, certificados, datos de clientes, archivos comerciales originales, logs ni conversaciones. No asumir que Obsidian Sync/Publish esté configurado o que la bóveda tenga cifrado por esta integración.

## Ajuste local móvil del 07/10/2026

Las altas de operativos/usuarios y la edición de credenciales usan `ResponsiveDrawer`, con encabezado fijo, cuerpo desplazable y acciones accesibles. Se preservan borradores, bloqueo durante guardado, validaciones, payloads, permisos y la distinción entre operativo sin cuenta y usuario con acceso. Las confirmaciones destructivas siguen como `AlertDialog`. Pruebas locales correctas; revisión visual real pendiente y sin altas productivas.


## Permiso independiente de Análisis — 15/10/2026

Análisis usa `repuestos.analisis` en registro de rutas, menú y ruta protegida. La migración `20261015150000_parts_analysis_section_access.sql` registra la sección activa en `app_secciones` para la asignación existente de Administración y exige módulo Repuestos más la sección en ambos RPC del semáforo. No copia permisos de Stock ni asigna usuarios automáticamente; superadmin conserva su acceso global. Repetir el SQL no restaura permisos revocados. Las pruebas SQL verifican denegación sin sección, acceso concedido y revocación; no se alteran cálculos ni diseño.

Migración ejecutada en Lovable Cloud el 15/10: consulta final exitosa. Pruebas locales: 19 correctas y build completo. La publicación pública del frontend continúa a cargo del usuario.

## Campi: bienvenida local

Ver [[36-Campi-bienvenida]]. La bienvenida de Campi se retiró de `main` el 20/10/2026: `AppLayout` ya no la monta ni ofrece «Conocer a Campi». El prototipo y sus recursos permanecen para el desarrollo de Panorama en la rama alternativa; esta nota no acredita su publicación en Lovable.

