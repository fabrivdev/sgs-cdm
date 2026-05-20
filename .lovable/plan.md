
## Objetivo

Eliminar el popover viejo "Continuar en otra fecha" del `ServicioDetalleDialog` y reusar **exactamente** el mismo panel lateral moderno (`ProgramarIntervencionDialog`) que ya utiliza "Programar nueva fecha". Además, arreglar el `TecnicosPicker` para que no rompa en anchos chicos y mostrar al principal con más claridad.

---

## 1. Reusar `ProgramarIntervencionDialog` desde el detalle de servicio

**Archivo:** `src/components/ServicioDetalleDialog.tsx`

- Quitar el `Popover` interno (líneas ~498–540) que renderiza inputs `fecha` + `TecnicosPicker` + botón "Agregar".
- Quitar el state `addOpen`, `nuevaJornada` y la función local `addJornada` que insertaba en `servicio_jornadas`.
- Quitar imports ya no usados: `Popover/PopoverTrigger/PopoverContent`, `Input` (si no se usa en otro lado del archivo), `TecnicosPicker`.
- Reemplazar el botón por uno que abra `ProgramarIntervencionDialog` con `trabajoId` precargado:
  - Al abrir el detalle de un servicio legacy, resolver el `trabajo_id` consultando `trabajos` por `legacy_servicio_id` (ya se hace para `trabajoCodigo`; ampliar el select a `id, codigo`).
  - Si existe trabajo madre: el botón "Continuar en otra fecha" llama a `<ProgramarIntervencionDialog open trabajoId={trabajoMadreId} tecnicos={...} fechaInicial={hoy} onSaved={...}/>`. Cargar `trabajos`, `clientes` y `profiles` necesarios (los `profiles` ya están como prop; los `trabajos` y `clientes` se obtienen en el mismo efecto que ya consulta clientes — bastará con un single fetch del trabajo madre).
  - Tras `onSaved`, recargar jornadas (`loadJornadas`) y avisar al padre (`onChanged()`).
- Texto del botón: mantener "Continuar en otra fecha" (mismo wording, pero abre el panel moderno).
- Si el servicio legacy aún no tiene trabajo madre vinculado, ocultar el botón y mostrar un `EmptyState` mínimo ("Este servicio aún no está vinculado a un trabajo del nuevo sistema"). Esto cubre datos heredados sin reintroducir el formulario viejo.

**Resultado:** una sola UI (drawer lateral) para crear programaciones en todo el sistema. No hay popover flotante encima de Jornadas.

---

## 2. Sugerir última cuadrilla utilizada

**Archivo:** `src/components/trabajos/ProgramarIntervencionDialog.tsx`

- Cuando se abre con `trabajoId` (modo "continuar"), al montar consultar la última `programacion` o `servicio_jornada` del trabajo para precargar `tecnico_principal_id` y `auxiliares` en `form`.
  - Estrategia: `supabase.from('programaciones').select('tecnico_principal_id, auxiliares').eq('trabajo_id', trabajoId).order('fecha_programada', { ascending: false }).limit(1)`.
  - Si no hay programación previa pero existe `legacy_servicio_id`, fallback a `servicio_jornadas` por `servicio_id` ordenado desc.
- El usuario puede cambiarlos libremente; es solo un default.
- Sin `trabajoId` (modo "programar nuevo desde 0") el form sigue vacío como hoy.

---

## 3. Rediseñar `TecnicosPicker` (usado en todos lados)

**Archivo:** `src/components/trabajos/TecnicosPicker.tsx`

Cambios visuales/UX (la API pública — props — se mantiene exactamente igual para no tocar consumidores):

- Contenedor con altura fija (`max-h-56`) y **solo** `overflow-y-auto`; agregar `overflow-x-hidden` para eliminar el scroll horizontal que aparece en drawers angostos.
- Cada fila: `flex min-w-0` con `truncate` real en el nombre y badges/estrella en columnas `shrink-0`. El nombre nunca empuja el layout.
- Técnico principal visualmente más claro:
  - Fila destacada con `bg-primary/5` + `border-l-2 border-primary`.
  - Badge "Principal" más fuerte (texto bold, fondo `bg-primary text-primary-foreground`).
  - Estrella rellena en color primary cuando está activo.
- Reemplazar el `<input type="checkbox">` nativo por el componente `Checkbox` de shadcn para coherencia visual.
- Spacing más generoso (`py-2 px-3`, `divide-y divide-border`), redondeado consistente con el resto de los drawers.
- Helper text en `text-[11px]` con `text-muted-foreground`.

Como la API queda igual, **automáticamente** ProgramarIntervencionDialog, CargarJornadaDialog y cualquier otro consumidor heredan el fix — quedando "el mismo componente de cuadrilla en TODOS los lugares del sistema".

---

## 4. Verificación final

- Buscar y eliminar cualquier referencia residual a un formulario local de jornadas en `ServicioDetalleDialog` (state, handlers, imports).
- Confirmar que `CargarJornadaDialog`, `NuevoTrabajoDialog`, `ProgramarIntervencionDialog` y `NuevaMaquinaDialog` siguen usando `ResponsiveDrawer`.
- Probar responsive (móvil y desktop) que el drawer no se monta encima de otro y no aparece scroll horizontal.

---

## Archivos a modificar

- `src/components/ServicioDetalleDialog.tsx` — quitar popover viejo, integrar `ProgramarIntervencionDialog`.
- `src/components/trabajos/ProgramarIntervencionDialog.tsx` — precargar última cuadrilla cuando viene `trabajoId`.
- `src/components/trabajos/TecnicosPicker.tsx` — rediseño visual + fix overflow + checkbox shadcn.

Sin cambios de backend ni de esquema. La inserción sigue pasando por `programaciones` + `syncLegacyPlanificador` existentes, por lo que el resultado en `servicio_jornadas` y en el trabajo madre es el mismo que el flujo actual de "Programar nueva fecha".
