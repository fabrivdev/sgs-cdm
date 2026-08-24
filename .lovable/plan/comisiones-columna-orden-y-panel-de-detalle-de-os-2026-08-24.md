# Comisiones: columna Orden y panel de detalle de OS

## Problema 1 — el número de OS se monta sobre el cliente

La tabla usa `table-fixed` y la columna Orden está fijada en 92 px, pero la celda no recorta su contenido: cuando el número de OS es largo, el botón "OS 123456" se desborda y pisa la columna Cliente.

Cambios (solo presentación, en `src/pages/Comisiones.tsx`):
- Ampliar la columna Orden a 104 px y hacer que la celda recorte: contenedor con `min-w-0 overflow-hidden`, botón con `block w-full truncate text-left`.
- Quitar el prefijo "OS " del texto de la celda (ya está en el encabezado) para ganar ancho; mantenerlo en el tooltip.

## Problema 2 — el detalle de la OS se ve robusto y confuso

Hoy el panel lateral repite datos, usa tarjetas grandes por jornada y bloques anidados con mucho aire.

Rediseño compacto del `Sheet`:
- Encabezado en una línea: `OS <número>` como título y una segunda línea meta con cliente · sucursal · estado · chasis (sin duplicar el cliente en el título).
- KPIs: mantener los cuatro, pero en versión compacta y en una sola fila.
- Desglose por día: reemplazar las tarjetas por una tabla densa (12 px, `tableTextDense`) con columnas Fecha, Técnico, Horario, Tipo, Estado, Pago y Horas. La fecha se muestra solo en la primera fila de cada día, con un subtotal por día a la derecha en una fila separadora sutil.
- Motivos de validación pasan a un indicador (punto ámbar + tooltip) en lugar de una línea de texto extra.
- Estado y pago como badges pequeños en una sola línea, sin envolver.

Resultado: el panel pasa de tarjetas apiladas con scroll largo a una lista tabular de una línea por jornada, coherente con el resto de la app.

## Alcance
Solo `src/pages/Comisiones.tsx`. Sin cambios de datos, consultas ni lógica de cálculo.
