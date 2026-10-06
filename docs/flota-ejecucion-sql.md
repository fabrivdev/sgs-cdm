# Ejecución de Flota declarada por el usuario

El 06/10/2026 el usuario respondió `listo` después de recibir las dos migraciones y declaró su ejecución. No se ejecutó SQL remoto desde este worktree y no corresponde volver a ejecutar el seed.

## Migraciones informadas como aplicadas

- `supabase/migrations/20261006132000_add_fleet_management.sql`
- `supabase/migrations/20261006133000_seed_confirmed_fleet_vehicles.sql`

La declaración del usuario no equivale a una verificación autenticada de producción. La migración de esquema no copia ni concede accesos. Las escrituras normales permanecen detrás de RPC con `auth.uid()` y `has_section_access`. El seed administrativo busca exactamente `fabrizio.vega@cdm.com.py` y no registra lecturas iniciales.

Todo cambio posterior de esquema o datos debe usar una migración incremental nueva; no editar ni reejecutar estas migraciones históricas.

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

El seed dejó `image_url`, `image_source_url` e `image_license` nulos. La UI usa un catálogo local de referencias verificadas que cubre las 15 unidades confirmadas por familia y carrocería: MAXUS T60 doble cabina, Mitsubishi L200 doble cabina e Isuzu D-Max en cabina simple o doble. Son imágenes referenciales, no fotos del vehículo real ni afirmaciones de versión exacta; cada una muestra autor, fuente y licencia junto a la imagen. La referencia D-Max de tercera generación sirve para las unidades 2025 y 2026 sin afirmar el año o acabado de la unidad. Este catálogo no requiere reejecutar ni modificar el seed. Persistir referencias en base, si se decide después, requiere una migración incremental y revisión previa.
