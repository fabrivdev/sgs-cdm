# Estandarización tipográfica y compactación visual

Aplicar una escala tipográfica más compacta y consistente en toda la app, reduciendo tamaños de títulos, filtros, KPIs y cards para mostrar más contenido sin perder jerarquía.

## Alcance
Toda la app (Dashboard, Trabajos, Planificador, Calendario, Parque, Repuestos, Admin, etc.).

## Objetivos
1. Títulos de sección más pequeños y uniformes.
2. Labels de filtros más compactos y con márgenes definidos.
3. KPIs de cards reducidos para evitar que el texto se choque.
4. Títulos de gráficos alineados a una sola escala.
5. Densidad general más alta sin sacrificar legibilidad.

## Cambios técnicos

### 1. Tokens de UI compartidos (`src/lib/ui-classes.ts`)
- Reducir `pageTitle` de `text-[24px]` a `text-[18px]` (con `leading-tight`).
- Reducir `sectionTitle` de `text-[15px]` a `text-[13px]`.
- Reducir `cardLabel` de `text-[11px]` a `text-[10px]` y ajustar `leading`/`tracking` para mayor compactación.
- Mantener `metaText` en `text-[10px]`.
- Ajustar `tableText` a `text-[12px]` si aplica.

### 2. Primitivas de layout (`src/components/layout/AppPrimitives.tsx`)
- `PageHeader`: reducir padding/gap, aplicar el nuevo `pageTitle`.
- `KpiStrip` / `KpiItem`: reducir valor principal (`text-[24px]` → `text-[18px]`), labels (`text-[11px]` → `text-[10px]`), y padding interno (`px-3 py-2` → `px-2.5 py-1.5`).
- `Panel` / `SectionHeader`: reducir padding y título (`text-[15px]` → `text-[13px]`).

### 3. Barra de filtros (`src/components/filters/FiltersBar.tsx`)
- Reducir altura de controles (`h-9` → `h-8` en selectores/inputs).
- Reducir gap entre fields (`gap-1` → `gap-1` o `gap-0.5`).
- Ajustar labels con el nuevo `cardLabel`.
- Reducir padding del card contenedor (`px-2 py-1` → `px-2 py-1.5` o similar, manteniendo inline).

### 4. Dashboard (`src/pages/Dashboard.tsx`)
- Reemplazar títulos sueltos (`text-base`, `text-sm`) por `SectionHeader` o `PanelTitle` con `sectionTitle`.
- Reducir mini-cards internas (Carga del equipo, facturación por sucursal) a valores `text-[16px]` y labels `text-[9px]`.
- Alinear títulos de gráficos: `Evolución de facturación`, `Estado de trabajos`, `Carga por sucursal`, `Matriz técnicos / periodo`, `Distribución por marca`, etc.
- Reducir espaciado entre secciones (`space-y-2.5` → `space-y-2`).

### 5. Otras páginas principales
- `Trabajos.tsx`, `Planificador.tsx`, `Calendario.tsx`, `ParqueClientes.tsx`, `Repuestos.tsx`, `Admin.tsx`: revisar que usen `PageHeader`, `SectionHeader`, `PanelTitle` y ajustar títulos sueltos.
- Revisar tablas para evitar doble padding grande en celdas.

### 6. Verificación
- Ejecutar `npm run build` para detectar errores de tipos.
- Revisar visualmente Dashboard y Trabajos en preview para confirmar que no haya textos cortados ni choques.
- Ajustar casos puntuales de overflow si aparecen.

## Notas
- Se respeta el color de marca verde olivo existente y el sistema de tokens de Tailwind.
- No se modifica lógica de negocio, solo presentación.
- No se agregan nuevas dependencias.
