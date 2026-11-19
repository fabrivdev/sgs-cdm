# Mercado de tractores

La sección `mercado.tractores` abre el tablero y sus vistas de marcas, modelos, potencia, precios, importadores, historia y movimientos. Los enlaces conservan el período, el estado y los filtros elegidos. Una fila de precios abre sus marcas y permite seguir hasta los movimientos.

El corte inicial es el último mes con movimientos. Las comparaciones usan los mismos meses del año anterior y los mismos filtros. La cuota usa el total del conjunto filtrado. El precio FOB se calcula como valor dividido por unidades. El gráfico de marcas incluye CLAAS como categoría si tiene movimientos en los períodos comparados.

La administración puede cargar el informe completo con la hoja Base analítica y confirmar su reemplazo. La lectura requiere acceso a Mercado y a Tractores, con la excepción habitual de superadministración. La política de la tabla impone los permisos en el servidor. El repositorio contiene la implementación y la migración, sin datos de los importadores.

Fuentes del flujo: `src/features/mercado`, `src/lib/permissions.ts`, `src/App.tsx`, `supabase/migrations/20261119170000_mercado_tractores.sql`. Aplicar la migración, conceder los accesos y cargar el informe son pasos del entorno de despliegue.
