# Unificar el sistema de iconos de la app

Hoy conviven varios estilos: iconos sueltos en 6 tamaños distintos (h-3, h-3.5, h-4, h-5, h-6, h-8), algunos con "tile" de fondo (`bg-primary/10`) en cuadrado, otros en círculo, con tamaños 7/8/9/10/11 y colores mezclados (primary, destructive, muted, ámbar). En el Dashboard eso se nota más porque conviven cards con tile y cards sin nada.

## Regla única propuesta

1. **Tamaños** (solo tres):
   - `iconXs` = 12px → dentro de badges, pills y texto meta.
   - `iconSm` = 14px → el default de la app: botones, filtros, celdas de tabla, encabezados de KPI.
   - `iconMd` = 16px → títulos de sección, acciones principales, ítems del menú lateral.
   - 20px queda reservado solo para estados vacíos / error (bloques grandes).
2. **Fondo (tile)**: los iconos **no llevan fondo** dentro de KPIs, tablas, filtros y listas. El tile solo se usa en tres lugares: menú lateral, encabezado de panel/drawer y estados vacíos/error.
3. **Forma del tile**: siempre `rounded-lg` de 32px (`h-8 w-8`) con `bg-primary/10 text-primary`; los redondos y los 7/9/10/11 px se normalizan. Excepción: avatares/iniciales de persona siguen redondos.
4. **Color**: `text-muted-foreground` por defecto; `text-primary` solo cuando el icono es acción o marca; colores semánticos (destructive/ámbar/verde) solo para estado real, nunca decorativo.
5. **Grosor**: `strokeWidth` 2 por defecto en todos (hoy hay algunos heredando distinto por tamaño).

## Alcance del cambio

- Agregar tokens `iconXs / iconSm / iconMd / iconTile` en `src/lib/ui-classes.ts`.
- Aplicar en Dashboard primero (`src/pages/Dashboard.tsx`, `src/components/dashboard/*`): sacar los cuatro tiles cuadrados de las cards del dashboard y dejar el icono suelto de 14px alineado con la etiqueta del KPI, igual que el resto de las cards.
- Luego pasar por el resto de páginas y componentes de feature (planificador, trabajos, parque, repuestos, calendario, historial, admin, auth, layout) igualando tamaños al token correspondiente.
- No se tocan los primitivos de `src/components/ui/` (shadcn) salvo que un tamaño quede fuera de la escala.

## Detalles técnicos

- Los tokens se exportan como strings de clases Tailwind y se aplican vía `className` en cada icono de `lucide-react`; donde el icono se pasa como prop (`KpiItem`, `SummaryCard`) el tamaño ya se fuerza desde el contenedor con `[&_svg]:h-3.5`, así que ahí basta con unificar el selector al token.
- Reemplazos mecánicos: `h-3 w-3` → `iconXs`, `h-3.5 w-3.5` → `iconSm`, `h-4 w-4` → `iconSm` en contexto de texto / `iconMd` en encabezados y botones, `h-5/6 w-5/6` → `iconMd` salvo estados vacíos.
- Los `h-8 w-8` / `h-2 w-2` que son barras, puntos de leyenda o avatares no son iconos y quedan como están.
- Verificación: build + revisión visual con Playwright de Dashboard, Planificador y Repuestos antes de cerrar.
