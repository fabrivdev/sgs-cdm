Corregir alineación de bordes en la pestaña Facturación y altura de la tabla de semanas.

Cambios:

1. Asegurar que la fila superior (Facturación por semana + Periodo seleccionado) y el bloque inferior (Facturas del periodo) compartan exactamente el mismo ancho y los mismos márgenes laterales:
   - Envolver ambos en el mismo contenedor con el mismo padding/horizontal.
   - Verificar que el `<section>` superior no tenga estilos que reduzcan su ancho respecto al `Card` inferior.
   - Quitar cualquier `overflow-x-auto` o `min-w-*` interno del card izquierdo que pueda inducir un ancho extra y romper la alineación visual del borde derecho.

2. En la tabla de “Facturación por semana/mes”, fijar altura para mostrar 12 filas completas antes de activar scroll vertical interno (aprox. header ~32px + 12 filas ~32px = ~416px). Mantener scroll solo cuando hay más de 12 semanas.

3. No cambiar diseño, estilos, bordes redondeados, paddings ni colores. Solo alineación y altura visible.