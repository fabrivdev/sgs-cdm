# Mercado · Market Share

Ruta `/mercado/market-share`. Analiza ventas de mercado en unidades desde el informe de ventas de maquinaria de Paraguay. Incluye equipo, año, corte acumulado, participación por marca y distribuidor, ventas mensuales e historia a igual corte. Los módulos de cada máquina conservan sus mediciones a partir de importaciones.

El archivo `Ventas Maquinarias Py-2026.xlsx` tiene hojas anuales principales 2025 y 2026. Se usan los bloques de tractores, cosechadoras y pulverizadores. Las vistas superpuestas 2026 (2), Tractores Tradicionales y 3ra Seman quedan fuera del cálculo. Los totales de fila mensual se cotejan con la fila Total. Las cuotas del tablero se calculan con las unidades mensuales sobre el total de la categoría. El Excel tiene celdas de cuota en cero con unidades positivas y subtotales de marcas que no reconcilian; se conservan las cantidades.

En 2026 las marcas están dibujadas sobre las filas. El importador lee marcas textuales o imágenes identificadas del archivo, usando sus relaciones y celdas combinadas. Un logo nuevo con ventas necesita la marca escrita en su celda. Los distribuidores se normalizan mediante alias y las filas históricas con solo marca conservan distribuidor vacío. El historial 2024 y 2023 disponible se incorpora a nivel agregado. Sin desglose comparable, se omite la comparación de cuota. Se conserva la etiqueta CLAAS que la hoja muestra junto al registro de Campos del Mañana en pulverizadores.

- Enero a octubre de 2026 contra enero a octubre de 2025. Tractores 1.516 vs. 1.255, cosechadoras 120 vs. 99, pulverizadores 65 vs. 81.
- Carga en Administración → Datos → Mercado · Market Share. Se sube el Excel original, con las hojas anuales disponibles. Cada carga actualiza equipos y meses presentes y conserva los demás. Un histórico agregado no puede sobrescribir un mes ya desglosado.
- El permiso `mercado.market_share` regula el acceso. La migración `20261120160000_mercado_market_share.sql` crea la tabla y la función de carga con los permisos de Administración → Datos.
