
# Optimización UX: tabla, calendario, formulario y campos de servicio

## 1. Nuevo campo: tipo de trabajo (Visita / Taller)

**Schema (migración):**
- Agregar enum `tipo_trabajo` con valores: `'Visita de campo'`, `'Máquina en taller'`.
- Agregar columna `tipo_trabajo` a `servicios` (NOT NULL, default `'Visita de campo'`).

Se mostrará como badge junto al estado en la tabla y como ícono (📍 visita / 🔧 taller) en el calendario.

## 2. Cliente como texto libre + auto-creación

En vez de un `<Select>` con lookup, usamos un `Input` con autocompletado simple (datalist) que muestra los clientes existentes. Al guardar:
- Si el texto coincide con un cliente existente (case-insensitive) → uso ese `cliente_id`.
- Si es un nombre nuevo → lo creo automáticamente en `clientes` y uso el id resultante.

Elimina el doble campo "cliente existente / nuevo cliente" actual y simplifica todo en un solo input.

## 3. Formulario de servicio simplificado

Reorganizo `ServicioFormDialog` para reducir fricción visual:

```text
┌─────────────────────────────────────────┐
│ Fecha          │ Tipo (Visita/Taller)   │
├─────────────────────────────────────────┤
│ Cliente (input con autocomplete)        │
├─────────────────────────────────────────┤
│ Trabajo o problema a resolver           │
│ [textarea grande, prominente]           │
├─────────────────────────────────────────┤
│ Sucursal       │ Marca                  │
├─────────────────────────────────────────┤
│ Responsable    │ Auxiliares (chips)     │
├─────────────────────────────────────────┤
│ ▸ Observaciones (colapsable, opcional)  │
└─────────────────────────────────────────┘
```

Cambios concretos:
- Renombro la etiqueta "Descripción del trabajo" → **"Trabajo o problema a resolver"**.
- Auxiliares pasa de lista de checkboxes a **chips clickeables** compactos (técnico activo = chip relleno).
- "Observaciones" queda en un `Collapsible` cerrado por defecto.
- Quito el campo "Cliente existente" + "Nuevo cliente"; queda un solo input con `<datalist>`.

## 4. Tabla del Planificador más compacta

Problema actual: 12 columnas para 1071px de viewport → todo muy apretado y mal alineado.

Reduzco a **8 columnas** densas:

| Fecha | Cliente | Trabajo | Marca/Tipo | Responsable | Suc. | Estado | Hs |

- Fusiono `Día` + `Sem` dentro de `Fecha` (segunda línea pequeña: "Lun · S16").
- Fusiono `Marca` + `Tipo` en una sola celda con dos badges chicos.
- Muevo `Auxiliares` y `Observaciones` al diálogo de detalle (no se ven en tabla).
- Bajo padding global de la tabla a `py-2 px-3` (override) en vez del `p-4` por defecto.
- Reduzco tamaño de fuente a `text-[13px]` y uso `text-xs` para metadatos.
- `Trabajo` toma el ancho restante con `truncate` + tooltip.
- Estado: badge clickeable que abre un popover con las 3 opciones (en vez del Select grande actual).

Resultado: la tabla cabe sin scroll horizontal en pantallas medianas.

## 5. Calendario con vista de día expandible

Cuando el usuario hace click en un día del calendario:
- Se abre un **Sheet lateral** (drawer derecho) con el listado completo de servicios de ese día.
- Cada item del sheet muestra: hora/tipo, cliente, técnico, marca y estado clickeable.
- Click en un item → abre el `ServicioDetalleDialog` existente.
- Botón "+ Nuevo servicio" en el header del sheet (preselecciona la fecha) si el usuario puede crear.

Cambio adicional en la grilla del calendario:
- Cada celda muestra hasta 3 servicios (en vez de 4) para que se vean mejor.
- El "+N más" se reemplaza por el click al día completo (toda la celda es clickeable).
- Click en un evento individual sigue abriendo el detalle directo (con `stopPropagation`).

## 6. Detalles técnicos

**Migración SQL:**
```sql
CREATE TYPE public.tipo_trabajo AS ENUM ('Visita de campo','Máquina en taller');
ALTER TABLE public.servicios
  ADD COLUMN tipo_trabajo public.tipo_trabajo NOT NULL DEFAULT 'Visita de campo';
```

**Archivos a modificar:**
- `supabase/migrations/...` — nuevo enum y columna.
- `src/lib/constants.ts` — exportar `TIPOS_TRABAJO` y tipo `TipoTrabajo`.
- `src/components/ServicioFormDialog.tsx` — rediseño completo (cliente input, layout, observaciones colapsable, campo tipo).
- `src/components/ServicioDetalleDialog.tsx` — mostrar tipo y auxiliares.
- `src/pages/Planificador.tsx` — tabla compacta de 8 columnas, popover de estado, exportar incluye `Tipo`.
- `src/pages/Calendario.tsx` — Sheet lateral al click en día, ícono de tipo en eventos.
- `src/pages/Historial.tsx` — agregar columna Tipo.

**Sin cambios destructivos:** los servicios existentes reciben `Visita de campo` por default; podés cambiarlos manualmente luego desde el detalle.

**Elementos nuevos shadcn ya disponibles:** `Sheet`, `Popover`, `Collapsible` — todos ya están en el proyecto.
