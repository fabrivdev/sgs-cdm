Reducir el ancho del card derecho “Periodo seleccionado” y ajustar la tabla izquierda para que entren todas las columnas y filas sin scroll.

Cambios:

1. Cambiar el grid superior a columnas con ancho fijo a la derecha: `lg:grid-cols-[minmax(0,1fr)_300px]` (izquierda flexible toma todo el espacio restante, derecha fija ~300px).

2. En la tabla de “Facturación por semana”:
   - Quitar `min-w-[860px]` y `overflow-x-auto` del wrapper para que no fuerce scroll horizontal.
   - Compactar las definiciones de columnas usando `minmax` y unidades menores: aprox. `grid-cols-[96px_repeat(5,minmax(0,1fr))_56px_64px_64px]` o similar, manteniendo alineación a la derecha en numéricos.
   - Quitar el `max-h` para que se muestren las 12 filas sin scroll vertical (típicamente hay ~12 semanas en el periodo).

3. En el card derecho “Periodo seleccionado”:
   - Mantener el grid de 2x2 KPIs y las ConceptLines.
   - Reducir tamaño de tipografía solo si fuera necesario para caber en 300px sin desbordes; preferir mantener estilos actuales.

4. Verificar que la suma `left + gap-3 + right (300px)` ocupe el mismo ancho que el card inferior “Facturas del periodo”, ya que ambos son hijos directos del mismo `TabsContent`. Asegurar `min-w-0` en cards para que la grilla respete las proporciones.

No tocar colores, bordes, paddings ni el resto del diseño.