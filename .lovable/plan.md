
# App de Planificación de Servicios Técnicos — CLAAS / HORSCH

## Stack y backend
- **Lovable Cloud** (Supabase) para auth, base de datos y RLS.
- Login con **email + contraseña** (sólo el Admin crea usuarios desde un panel interno).
- Mobile-first con Tailwind + shadcn/ui.

## Modelo de datos

**profiles** (perfil del usuario, vinculado a `auth.users`)
- `id` (uuid, FK auth.users), `nombre`, `sucursal`, `activo`, `creado_en`

**user_roles** (separada para evitar escalada de privilegios)
- `id`, `user_id`, `role` (enum: `admin`, `cabecilla`, `tecnico`)

**sucursales** (catálogo fijo): Santa Rita, Santa Rosa, Campo 9, Misiones, Loma Plata, Katuete

**clientes**: `id`, `nombre`, `sucursal`, `creado_en`

**servicios**:
- `id`, `fecha_programada`, `dia_semana`, `semana`
- `tecnico_responsable_id` (FK profiles), `auxiliares` (uuid[])
- `sucursal`, `cliente_id`, `marca` (CLAAS/HORSCH)
- `trabajo_descripcion`, `estado` (Pendiente/Iniciado/Completado)
- `observaciones`, `horas_trabajadas`
- `creado_por`, `creado_en`, `actualizado_en`
- `visto_por` (uuid[]) — para el badge de notificaciones in-app

**RLS por rol** (con función `has_role` security definer):
- Admin: todo.
- Cabecilla: ve/edita servicios de su sucursal.
- Técnico: ve sólo donde es responsable o auxiliar; puede actualizar `estado`, `horas_trabajadas`, `observaciones`.

## Vistas principales

### 1. Planificador (estilo Excel)
- Tabla densa con columnas: Fecha · Día · Semana · Técnico · Auxiliares · Sucursal · Cliente · Marca · Trabajo · Estado · Observaciones · Horas.
- **Color de fila por estado**: amarillo (Pendiente), azul (Iniciado), verde (Completado).
- **Etiqueta de marca**: chip verde CLAAS / chip rojo-naranja HORSCH.
- Filtros superiores: semana, sucursal, técnico, marca, estado.
- Edición inline para campos permitidos según rol.
- Botón **"Nuevo servicio"** (Admin y Cabecilla) con formulario modal validado con zod.
- Botón **"Exportar Excel"** que descarga la vista filtrada como `.xlsx` (xlsx/SheetJS).

### 2. Calendario visual
- Vistas mensual y semanal (react-day-picker + grilla custom).
- Eventos coloreados por estado, etiqueta = "Técnico · Cliente".
- Filtro por técnico para agenda individual.
- Click en evento → modal con detalle completo y acciones según rol.

### 3. Dashboard
- Tarjetas resumen: total semana, % completados, pendientes, horas totales.
- Gráficos (recharts):
  - Barras: servicios por sucursal y por técnico.
  - Torta: distribución por marca y por estado.
  - Barras horizontales: horas trabajadas por técnico.
- Filtro de rango de fechas.

### 4. Historial por cliente
- Buscador con autocomplete de clientes.
- Lista cronológica de servicios del cliente con marca, técnico, estado y horas.
- Acceso al detalle de cada servicio.

## Funciones clave
- **Notificaciones in-app**: badge en el header con cantidad de servicios asignados no vistos. Al abrir el servicio se marca como visto. Toast al entrar si hay nuevos.
- **Cambio de estado rápido**: en móvil, swipe en cada tarjeta de la lista (Pendiente → Iniciado → Completado). En desktop, dropdown en la celda Estado.
- **Carga de horas**: campo numérico que se habilita al pasar a "Completado"; obligatorio para cerrar.
- **Auto-cálculo** de `dia_semana` y `semana` a partir de `fecha_programada`.
- **Exportar a Excel** la vista actual del planificador con todos los filtros aplicados.

## Roles visuales y navegación
- Sidebar (desktop) / bottom-nav (móvil) con: Planificador, Calendario, Dashboard, Historial, Admin (sólo admin).
- **Panel Admin**: gestión de usuarios (crear técnicos/cabecillas con email+password, asignar rol y sucursal), gestión de clientes y técnicos.
- Header con: sucursal activa (admin puede cambiar), badge de notificaciones, menú de usuario.

## Diseño
- Mobile-first, denso y funcional tipo planilla operativa.
- Paleta de estado consistente: amarillo `#F59E0B`, azul `#3B82F6`, verde `#10B981`.
- Marcas: CLAAS verde `#0E8B3A`, HORSCH naranja `#E85D1A`.
- Tipografía Inter, tablas compactas con filas zebra, hover claro.
- En móvil, el Planificador colapsa a tarjetas-lista compactas con swipe.

## Entregable inicial (primera implementación)
1. Schema + RLS + enum de roles + función `has_role`.
2. Auth (login email/password) + ruta protegida + ProtectedRoute por rol.
3. Layout principal con navegación responsive y badge de notificaciones.
4. Planificador con filtros, colores por estado, edición inline, alta de servicios, export a Excel.
5. Calendario mensual/semanal con filtro por técnico.
6. Dashboard con KPIs y gráficos básicos.
7. Historial por cliente.
8. Panel Admin de usuarios/técnicos/clientes.
9. Seed inicial de sucursales y un usuario admin.
