# Pulir la superposición en el detalle de la OS

En la tabla "Desglose por día" la columna Fecha está fijada en 64 px, pero "07/08/2026" necesita más ancho y, al no recortarse, se monta sobre el nombre del técnico.

Cambios en el `Sheet` de `src/pages/Comisiones.tsx` (solo presentación):
- Ampliar la columna Fecha a 88 px y añadir un poco de aire a la derecha.
- La celda de fecha pasa a `overflow-hidden` con contenido `truncate`, para que nunca invada la columna vecina.
- Mostrar la fecha en formato corto `dd/MM/yy` dentro de la tabla (la fecha completa queda en el tooltip y en la fila de subtotal).
- Reducir levemente el ancho de Tipo/Estado para compensar y que el nombre del técnico gane espacio.

Sin cambios de datos ni de lógica.
