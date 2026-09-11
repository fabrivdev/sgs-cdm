# Ajuste compacto de Ventas de Servicios

## Resultado

Las vistas conservarán las cinco pestañas actuales, pero con tablas más compactas, sin textos explicativos redundantes y con las columnas alineadas al Excel de Postventa.

## Cambios

### Facturación por período
- Quitar la segunda línea de texto debajo de cada período.
- Agregar dos columnas independientes:
  - **Variación LM**: porcentaje contra el período inmediatamente anterior equivalente.
  - **Variación LY**: porcentaje contra el mismo período del año anterior.
- Mostrar `—` cuando la comparación no sea válida o no exista base comparable.
- Mantener cada fila en una sola línea.

### Resumen
- Mantener el cuadro superior de totales.
- Ajustar la tabla por tipo de tiempo a las columnas del Excel: **Tipo de tiempo, MO, Km, Repuestos, Terceros, Neto, OS asociadas, Horas OS, Participación**.
- Mostrar la columna **Horas OS**, cuyo dato ya está disponible pero hoy no se presenta.
- Agregar debajo una segunda tabla por **Marca + Tipo de tiempo** con las columnas del Excel: **Marca, Tipo, MO, Km, Repuestos, Terceros, Neto, Horas OS, Participación**.
- Evitar subtítulos explicativos y encabezados redundantes.

### Técnicos
- Dejar exactamente las nueve columnas del Excel: **Técnico, Horas Cliente, Horas Garantía, Horas Interno, Total horas, MO Cliente asociada, MO Garantía asociada, MO Interno asociada, MO total asociada**.
- Eliminar **Horas sin clasificar**, **MO sin clasificar**, **Participación MO** y el texto descriptivo superior.
- Reducir ancho, altura de filas y espaciado para aprovechar mejor la pantalla, manteniendo nombres y valores en una sola línea.

### Clientes
- Mantener exactamente las columnas del Excel: **Cliente, OS, Facturas, Notas de crédito, MO, Km, Repuestos, Terceros, Neto, Participación**.
- Quitar la columna adicional de comparación anual de esta vista.
- Compactar selector, encabezado y filas, evitando quiebres de texto.

### Orden de datos
- En Resumen, Técnicos, Clientes y Máquinas, enviar siempre al final las filas **Sin identificar**, **Sin informar**, **Sin cliente**, **Sin técnico atribuido** o equivalentes, sin importar su importe u horas.

## Detalles técnicos
- Ampliar la consulta de indicadores para devolver el cruce **marca × tipo de tiempo**, incluyendo importes, horas y participación, sin alterar las reglas actuales de filtros.
- Ampliar la consulta de períodos para calcular LM y LY con rangos equivalentes y respetar los cortes de metodología; no mostrar porcentajes engañosos cuando los períodos no sean comparables.
- Actualizar los tipos locales y las tablas de Resumen, Técnicos, Clientes y Máquinas.
- Añadir pruebas para LM/LY, horas por tipo, cruce marca/tipo y ordenamiento de filas no informadas.
- Verificar visualmente las cinco vistas en escritorio y móvil, además del build y las pruebas afectadas.
