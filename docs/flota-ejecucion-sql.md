# Ejecución de Flota declarada por el usuario

El 06/10/2026 el usuario respondió `listo` después de recibir las dos migraciones y declaró su ejecución. No se ejecutó SQL remoto desde este worktree y no corresponde volver a ejecutar el seed.

## Migraciones informadas como aplicadas

- `supabase/migrations/20261006132000_add_fleet_management.sql`
- `supabase/migrations/20261006133000_seed_confirmed_fleet_vehicles.sql`

## Corrección del seed de responsables

La primera entrega de `20261006201000_add_fleet_responsibility_history.sql` podía abortar si Hugo Rodas o Ruben Monges no resolvían a un único perfil activo. El archivo corregido trata esas asignaciones como un seed opcional: solo crea la línea de base con fecha `NULL` cuando cuenta autora, chapa y perfil activo son únicos. Con cero o varios candidatos, perfil inactivo o fuente ambigua, omite la asignación y el usuario puede elegir el responsable en la app. No crea ni modifica identidades.

No se presupone que el intento fallido haya revertido todo. El archivo completo es idempotente para una instalación ausente, parcial o ya ejecutada: conserva `BEGIN`/`COMMIT`, usa DDL repetible y evita duplicar la línea de base con `ON CONFLICT DO NOTHING`.

La declaración del usuario no equivale a una verificación autenticada de producción. La migración de esquema no copia ni concede accesos. Las escrituras normales permanecen detrás de RPC con `auth.uid()` y `has_section_access`. El seed administrativo busca exactamente `fabrizio.vega@cdm.com.py` y no registra lecturas iniciales.

Todo cambio posterior de esquema o datos debe usar una migración incremental nueva; no editar ni reejecutar estas migraciones históricas.

## Responsables pendiente de aplicación

La implementación local agrega `supabase/migrations/20261006201000_add_fleet_responsibility_history.sql`. Esta migración incremental todavía no fue aplicada desde este worktree. Crea un historial anexable de cambios con responsable, fecha efectiva, autor y momento de registro; las escrituras pasan por RPC con `auth.uid()` y acceso a `servicios.flota`.

Los candidatos reúnen perfiles técnicos activos y perfiles vinculados a usuarios existentes, deduplicados por `profiles.id`. No crea cuentas ni perfiles. Las fichas identificaban a Hugo Rodas y Ruben Monges sin fecha de inicio: se conservan como línea de base con fecha no informada, únicamente si chapa, cuenta autora y perfil activo resuelven de forma única. Los otros trece vehículos permanecen sin responsable.

## Verificación de solo lectura pendiente

```sql
select
  fv.id,
  fv.brand,
  fv.model,
  fv.model_year,
  fv.plate,
  fv.plate_normalized,
  fv.created_by,
  fv.created_by_name
from public.fleet_vehicles fv
where fv.plate_normalized = any (array[
  'AANS673', 'AANS680', 'AAXR323', 'AAMY981', 'AAXR306',
  'AASJ681', 'AAXR327', 'AAXR308', 'AAXR333', 'AAON294',
  'AAMY984', 'AAXR325', 'AAXR330', 'AAXR334', 'AAXR336'
])
order by fv.plate_normalized;
```

La consulta siguiente requiere una sesión autorizada y no modifica datos:

```sql
select
  count(*) as vehiculos_confirmados,
  count(distinct fv.plate_normalized) as chapas_unicas,
  count(*) filter (where fv.created_by = u.id) as atribuidos_a_fabrizio,
  count(r.id) as lecturas_creadas
from public.fleet_vehicles fv
join auth.users u
  on lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py'
left join public.fleet_odometer_readings r
  on r.vehicle_id = fv.id
where fv.plate_normalized = any (array[
  'AANS673', 'AANS680', 'AAXR323', 'AAMY981', 'AAXR306',
  'AASJ681', 'AAXR327', 'AAXR308', 'AAXR333', 'AAON294',
  'AAMY984', 'AAXR325', 'AAXR330', 'AAXR334', 'AAXR336'
]);
```

Resultado esperado según el seed: `15` vehículos, `15` chapas únicas, `15` atribuidos a Fabrizio y `0` lecturas creadas. Todavía no fue comprobado desde este worktree por falta de una sesión autenticada de solo lectura.

## Imágenes

El seed dejó `image_url`, `image_source_url` e `image_license` nulos. La UI usa cinco assets generados locales, sin referencias ni créditos visibles: camionetas blancas, configuración básica y carrocería simple o doble según el catálogo confirmado. Cubren las 15 unidades por familia y año conocido sin afirmar que sean fotos de los vehículos reales. Este catálogo no requiere reejecutar ni modificar el seed.
