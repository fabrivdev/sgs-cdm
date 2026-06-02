## Optimización pestaña Facturación

Tres ajustes puntuales en `src/pages/Dashboard.tsx` (sección `TabsContent value="facturacion"`, líneas 818–975). No tocar queries, filtros ni identidad visual.

### 1. "Clientes y sucursales" — eliminar el aspecto vertical/extenso

Hoy la card derecha apila Top clientes y Por sucursal en una columna (`xl:grid-cols-1`), generando una lista muy larga junto a la tabla de facturas.

Cambios:
- Sacar "Clientes y sucursales" de la fila inferior. Convertirlo en **dos cards independientes lado a lado** en una nueva fila de ancho completo arriba/abajo de la tabla de facturas:
  - `grid xl:grid-cols-2 gap-3`: "Top clientes" | "Facturación por sucursal".
- Cada card:
  - Lista compacta (alto máximo `max-h-[260px]` con `overflow-auto`) en lugar de crecer indefinidamente.
  - Top clientes en 2 columnas internas en pantallas grandes (`md:grid-cols-2`) para repartir 6–8 nombres en horizontal.
  - Por sucursal: pasar a **mini-barras horizontales** (nombre + barra de % + monto) en una sola línea por sucursal. Más visual, menos vertical.

### 2. "Facturas del periodo" — sin scroll horizontal

Hoy la grilla usa `min-w-[860px]` con 6 columnas fijas en px, lo que obliga al scroll horizontal en la columna izquierda de la fila (`xl:grid-cols-[1.2fr_0.8fr]`).

Cambios:
- Promover la card de facturas a **ancho completo** (sacarla del grid 2-columnas; pasar a una fila propia con `w-full`).
- Reemplazar las columnas en px por una grilla **fluida**:
  - `grid-cols-[80px_110px_minmax(0,1fr)_110px_120px_110px]` y quitar `min-w-[860px]`.
- Truncar texto en Cliente/Concepto/Sucursal con `truncate` + `title` para tooltip nativo.
- En viewport < `md`: colapsar columnas secundarias (Sucursal, Concepto) ocultas con `hidden md:block`, manteniendo Fecha/Factura/Cliente/Importe visibles. Así no hay scroll horizontal en ningún breakpoint.
- Mantener `max-h-[420px] overflow-auto` (solo vertical).

### 3. Layout final de la pestaña

```text
[ Facturación por semana (1.5fr) ] [ Periodo seleccionado (0.9fr) ]
[ Facturas del periodo — ancho completo, sin scroll horizontal     ]
[ Top clientes (1fr)              ] [ Facturación por sucursal (1fr) ]
```

Mantener `space-y-3` entre secciones.

### Fuera de alcance

- Queries Supabase, filtros, KPIs superiores, otras pestañas.
- Cambios de tokens/colores.

### Archivos modificados

- `src/pages/Dashboard.tsx`
