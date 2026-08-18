# Compactar pantalla de inicio de sesión

## Objetivo
Reducir el tamaño visual de la pantalla de inicio de sesión para que no se vea desproporcionada en la vista actual. Ajustar logo, tipografía, campos, botón y espaciado manteniendo centrado, accesibilidad y el fondo con oleadas de gradiente.

## Cambios propuestos

### `src/pages/Auth.tsx`
- **Card**: reducir ancho máximo de `max-w-[532px]` a `max-w-[420px]` y padding de `px-5 py-7 sm:px-8 sm:py-9` a `px-5 py-6 sm:px-7 sm:py-7`.
- **Logo**: reducir de `h-16 w-16 sm:h-20 sm:w-20` a `h-12 w-12 sm:h-14 sm:w-14`.
- **Título**: bajar de `text-3xl sm:text-4xl` a `text-2xl sm:text-[28px]` y mantener peso semibold/bold.
- **Subtítulo**: bajar de `text-[13px] sm:text-[14px]` a `text-[12px] sm:text-[13px]`.
- **Labels**: pasar a `text-[12px]` y quitar el salto a `sm:text-[14px]`.
- **Inputs**: reducir altura de `h-14 sm:h-[58px]` a `h-11 sm:h-12`, padding izquierdo de `pl-12` a `pl-10`, iconos de `h-5 w-5` a `h-4 w-4`, texto de `text-[14px]` a `text-[13px]`, radio de `rounded-xl` a `rounded-lg`.
- **Botón de mostrar/ocultar contraseña**: reducir `h-9 w-9` a `h-7 w-7` y icono a `h-4 w-4`.
- **Botón de envío**: reducir altura de `h-14 sm:h-[60px]` a `h-11 sm:h-12`, texto a `text-[13px]`, icono a `h-4 w-4`.
- **Espaciado del formulario**: de `mt-7 space-y-5 sm:mt-9 sm:space-y-6` a `mt-6 space-y-4 sm:mt-7 sm:space-y-5`.
- **Mensaje de seguridad**: reducir a `text-[11px] sm:text-[12px]` e icono a `h-3.5 w-3.5`.
- **Footer**: mantener posición centrada, ajustar a `text-[11px] sm:text-[12px]` si queda desbalanceado.

### Verificación
- Revisar en viewport desktop (~1152px) y mobile que el formulario no se vea gigante.
- Confirmar que los inputs sigan siendo legibles y táctiles (altura mínima 44px equivalente en mobile).
- Asegurar que no queden textos truncados ni fuera de la card.
