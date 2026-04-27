## Problema

En la pestaña **Parque de máquinas**, la fila de filtros (Sucursal, Marca, Subgrupo, Seguimiento, Rango de fechas, Exportar) se muestra siempre en una grilla horizontal con `flex-wrap`. En vista móvil esto ocupa varias filas y se siente colapsado/desordenado, mientras que el buscador queda perdido entre los selects.

## Solución

Replicar el patrón usado en otras pestañas: en móvil dejar visible solo el **buscador de cliente**, y mover el resto de filtros a un panel lateral (`Sheet`) que se abre con un botón "Filtros". En desktop (≥ `md`) mantener la barra horizontal actual sin cambios.

### Comportamiento

- **Móvil (< md)**:
  - Fila visible: `[ Buscador (flex-1) ] [ Botón Filtros ] [ Botón Exportar (icono) ]`
  - El botón "Filtros" muestra un badge con la cantidad de filtros activos (≠ "all" o rango ≠ default).
  - Al tocar "Filtros" se abre un `Sheet` desde la derecha con: Sucursal, Marca, Subgrupo, Seguimiento, Rango (+ pickers personalizados si aplica), y un botón "Limpiar filtros".
  - Cada select dentro del `Sheet` ocupa el ancho completo (`w-full`) en lugar de los anchos fijos actuales (`w-[140px]`, etc.).
- **Desktop (≥ md)**: la barra horizontal queda igual a como está hoy (sin botón Filtros, todos los selects inline).

### Archivos a modificar

- `src/components/parque/ParqueTab.tsx` — reorganizar el bloque de filtros (líneas ~522–646) en dos vistas (móvil/desktop) usando clases responsive de Tailwind (`md:hidden` / `hidden md:flex`) y un `Sheet` (`@/components/ui/sheet`) para el panel móvil.

### Detalles técnicos

- Estado de apertura del Sheet: `const [filtrosOpen, setFiltrosOpen] = useState(false)`.
- Contador de filtros activos: derivar de `fSucursal/fMarca/fSubgrupo/fSeguimiento !== "all"` + `rango !== "365d"` y mostrar como `Badge` sobre el botón "Filtros".
- Extraer el contenido de los selects en una variable `filtrosContent` (JSX) para reutilizar en desktop (inline) y móvil (dentro del Sheet), evitando duplicación. En el Sheet, envolver con clases que fuercen `w-full` en los `SelectTrigger`.
- El botón **Exportar Excel** en móvil se reduce a icono (`<Download />`) sin texto; en desktop mantiene texto + icono.
- El banner de advertencia de servicios y el contador de resultados (líneas 648–660) no cambian.
- La tabla principal sigue con `overflow-x-auto` igual que ahora.

### Resultado visual esperado

```text
Móvil:
┌──────────────────────────────────────────┐
│ 🔍 Buscar cliente...   [Filtros·3] [⬇]  │
└──────────────────────────────────────────┘
   12 clientes · Período: ...

Desktop (sin cambios):
[🔍 Buscar] [Sucursal] [Marca] [Subgrupo] [Seguim.] [Rango] ... [⬇ Exportar Excel]
```
