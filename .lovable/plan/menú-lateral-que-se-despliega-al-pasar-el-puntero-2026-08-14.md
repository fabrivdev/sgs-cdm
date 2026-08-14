# Menú lateral que se despliega al pasar el puntero

El sidebar de escritorio queda siempre como franja de iconos y se expande solo al acercar el puntero, retrayéndose al salir. Se elimina la flechita de colapsar.

## Comportamiento

- Estado por defecto: franja de iconos (rail), igual al colapsado actual.
- Al entrar el puntero en la franja: se expande tras ~90 ms (evita aperturas accidentales al pasar de largo).
- Al salir el puntero: se retrae tras ~250 ms (permite volver sin que se cierre de golpe).
- La expansión se superpone al contenido con sombra suave; el contenido principal no se mueve, así no hay "salto" de layout.
- Los grupos de módulos siguen funcionando como acordeón; al expandirse por hover se muestra abierto el grupo de la ruta activa.
- Móvil: sin cambios (sigue el menú en Sheet).
- Accesibilidad: el foco por teclado dentro del sidebar también lo expande, y se retrae al salir el foco.

## Animación (estilo iOS)

- Ancho y contenido con transición de ~280 ms y curva tipo spring suave (`cubic-bezier(0.32, 0.72, 0, 1)`).
- Las etiquetas de texto entran con fade + leve desplazamiento en X, escalonado respecto del ancho.
- Sombra que aparece progresivamente solo cuando está expandido por hover.
- Respeta `prefers-reduced-motion`: sin animación, cambio directo.

## Detalles técnicos

- `src/components/AppLayout.tsx`:
  - `SidebarProvider` pasa a modo controlado (`open` / `onOpenChange`) con estado local `hoverOpen`, `defaultOpen={false}`.
  - Handlers `onMouseEnter` / `onMouseLeave` / `onFocusCapture` / `onBlurCapture` en el `<Sidebar>` con timers de apertura y cierre (limpiados al desmontar).
  - Se elimina el `SidebarTrigger` con `ChevronLeft` del `SidebarHeader` y su import.
  - En `ModuloNavGroup` se quita el `onClick` que hacía `toggleSidebar()` en modo rail (ya no hace falta).
  - Se marca el wrapper con `data-hover-sidebar` para el overlay.
- `src/index.css`: regla para que, mientras el sidebar está expandido por hover, el elemento de "gap" del sidebar mantenga el ancho de rail (el panel fijo se superpone) y para las transiciones/sombras de estilo iOS.
- No se toca lógica de permisos, rutas ni datos.
