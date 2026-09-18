# Alta de operativos de Servicios sin cuenta

En Administración → Equipo y accesos → Nuevo usuario, el formulario comienza
como **Nuevo operativo de Servicios**, con **Acceso al sistema** apagado.
Solo requiere nombre y apellido y sucursal. El nivel sin cuenta es Operativo.
Al encender Acceso al sistema aparecen correo, contraseña inicial y selección
del nivel. La contraseña de una cuenta sigue requiriendo al menos seis caracteres.

## Identidad y autorización

- Sin acceso se inserta un `profiles` activo, con UUID propio y `auth_user_id = null`.
  No se crea usuario Auth, contraseña ficticia, rol de autenticación ni permisos.
- La inserción está sujeta a la política RLS `Admins insert profile`; ocultar
  el botón no reemplaza la autorización del servidor. La función `has_role`
  existente incluye superadministradores al validar el nivel admin.
- `servicios_listar_tecnicos_activos` ya incluye los perfiles activos sin cuenta
  en la nómina asignable, respetando sus demás exclusiones. No se alteran horas,
  facturación, reglas de comisiones ni registros históricos.
  Al confirmar el alta se invalida la caché de esa nómina para que el nuevo
  integrante aparezca sin esperar los cinco minutos de vigencia de la consulta.
- Con acceso se conserva `admin-create-user`. Un usuario con cuenta necesita
  sus roles y secciones/módulos habilitados; crear la cuenta no garantiza acceso.
- La asociación posterior de credenciales continúa usando el `profile_id`
  existente: no registrar otra persona para habilitarle inicio de sesión.
  El alta sin cuenta no concede permisos para una futura cuenta.
- Si la base rechaza la inserción, se conserva el formulario y se informa el
  error, sin anunciar éxito ni intentar crear una cuenta alternativa.

## Alcance de validación

Pruebas del formulario real y del servicio de alta con respuestas simuladas:
modo sin credenciales, cuenta con credenciales, nivel fijo sin acceso, fallo
de autorización, protección durante guardado y lectura sin permiso de gestión.
No se crearon usuarios reales ni se consultó la base productiva.

No se añade una migración ni una Edge Function: se usan el esquema y la nómina
ya definidos en las migraciones existentes. Commit/push no verifica que esas
migraciones estén aplicadas en un entorno particular.

Fuentes: `src/pages/Admin.tsx`, `src/lib/admin-create-person.ts`,
`20260420133857_3fab6236-4bb9-425e-b56a-d425768afe6d.sql`,
`20260522110000_link_profiles_to_auth_users.sql`,
`20260814173706_d3cfba14-f794-4cde-bc96-37f5d22a29f1.sql`.
