
# Gestión de credenciales en Admin + UX móvil + filtros y selectores

## 1. Admin: editar email y contraseña de usuarios

### Backend — nuevo edge function `admin-update-user`
Recibe `{ user_id, email?, password? }`, valida que el caller sea admin (mismo patrón que `admin-create-user`) y llama a `admin.auth.admin.updateUserById(user_id, { email, password })`. Devuelve `{ ok: true }` o error.

### Frontend — fila de usuario expandible
En `Admin.tsx`, agrego un botón de acción "Credenciales" por fila (ícono llave) que abre un pequeño popover/dialog con:
- Input **Email** (precargado, opcional cambiarlo)
- Input **Nueva contraseña** (vacío, opcional)
- Botón **Guardar** (sólo manda los campos que cambiaron)

Para mostrar el email actual en la tabla agrego una columna nueva "Email", que viene del edge function `admin-list-users` (ver más abajo) — los emails viven en `auth.users` y no son accesibles vía RLS desde el cliente.

### Backend — nuevo edge function `admin-list-users`
Devuelve `[{ user_id, email }]` para que la tabla de Admin muestre los emails. Sólo accesible para admin. Se llama una vez al cargar la página y se mergea con `profiles`.

## 2. Optimización vista móvil (Planificador y Admin)

### Planificador móvil
- El `container` global queda en `px-3` en mobile (hoy `px-4` por default → muy ajustado). Ajusto a `container max-w-[1600px] py-3 px-3 sm:py-4 space-y-3`.
- Tarjeta resumen más compacta:
  - Línea 1: `dd/MM` · día abreviado · ícono tipo · Estado (a la derecha como ahora).
  - Línea 2: **Cliente** en negrita, una sola línea con `truncate`.
  - Línea 3: **Trabajo** truncado a 2 líneas con `line-clamp-2`.
  - Línea 4 (meta): técnico responsable + sucursal abreviada — tamaño `text-[10px]`.
  - Quito el badge de marca redundante en mobile (la marca queda visible al abrir el detalle).
- Padding interior baja a `p-2.5` para que respiren los bordes.

### Admin móvil
La tabla actual de usuarios desborda en mobile. Agrego una vista de **tarjetas** debajo de `md`:
- Card por usuario con: nombre, email (texto pequeño), badges de rol y sucursal, switch de activo, y los dos botones (Credenciales / Cambiar rol-sucursal).
- La tabla original queda visible sólo en `md:`.

## 3. Filtros del Planificador en botón colapsable

- Reemplazo la `Card` de filtros visible por un botón **"Filtros"** con `Sheet` (drawer) que abre desde la derecha.
- Junto al botón muestro chips compactos con los filtros activos (ej: `Semana 17 ✕`, `Sucursal: Campo 9 ✕`) para que el usuario sepa qué está filtrado sin abrir el drawer.
- **Defaults al cargar**:
  - `fSemana` = semana ISO actual (calculada con `date-fns/getISOWeek(new Date())`).
  - `fSucursal` = `profile.sucursal` si existe; si el usuario es admin sin sucursal asignada → `"all"`.
  - Resto = `"all"`.
- Botón **"Limpiar filtros"** dentro del drawer para volver a `"all"` en todo.

## 4. Formulario de servicio: auxiliares como dropdown multi-select

- **Técnico responsable**: ya es dropdown `<Select>` simple, lo dejo igual.
- **Auxiliares**: reemplazo los chips por un componente desplegable estilo combobox multi-select:
  - Trigger: botón con texto "Seleccionar auxiliares" o "3 seleccionados", igual aspecto que un `SelectTrigger`.
  - Contenido: `Popover` con `Command` (cmdk) que lista todos los técnicos con un `Checkbox` + nombre + sucursal entre paréntesis. Click toggle. Búsqueda incluida en el header del popover.
  - Debajo del trigger, fila de chips pequeños removibles con los seleccionados (✕ para sacar uno rápido).
- Esto reduce drásticamente el alto del formulario cuando hay muchos técnicos.

## 5. Detalles técnicos

**Archivos a crear:**
- `supabase/functions/admin-list-users/index.ts` (lista emails de auth.users, sólo admin).
- `supabase/functions/admin-update-user/index.ts` (actualiza email/password de un user, sólo admin).

**Archivos a modificar:**
- `src/pages/Admin.tsx` — columna Email, botón Credenciales con dialog, vista mobile en cards.
- `src/pages/Planificador.tsx` — drawer de filtros, defaults a semana actual + sucursal del user, chips de filtros activos, padding mobile, tarjetas más compactas.
- `src/components/ServicioFormDialog.tsx` — multi-select de auxiliares con `Popover + Command + Checkbox`.

**Sin cambios de schema.** Las funciones admin ya tienen el patrón de validación existente.

**Componentes shadcn ya disponibles:** `Sheet`, `Popover`, `Command`, `Checkbox`, `Dialog` — todos están en el proyecto.
