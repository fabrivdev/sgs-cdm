# Mercado de tractores

En el tablero, el filtro Marca cambia el ranking a modelos. La tabla se desplaza con el encabezado fijo y hasta 20 filas visibles. Los importes con $ conservan la moneda de origen del FOB (dólares estadounidenses).

El gráfico y el detalle por precio muestran unidades con FOB positivo. Los movimientos sin FOB positivo siguen en la base y en el total de unidades del mercado.

En las tarjetas del tablero, la variación interanual positiva se muestra en verde y la negativa en rojo. El cero y la ausencia de comparación se muestran en color neutro.

El catálogo técnico de potencia en src/features/mercado/power.ts enlaza fichas de fabricante y completa las bandas faltantes al consultar la base. En ausencia de ficha, reutiliza una banda observada si es única para la misma marca y modelo. La potencia informada prevalece y los casos ambiguos quedan pendientes.

La sección `mercado.tractores` abre el tablero y sus vistas de marcas, modelos, potencia, precios, importadores, e historia. Los enlaces conservan el período, el estado y los filtros elegidos. Una fila de precios abre sus marcas y permite desglosar por modelo e importador.

El corte inicial es el último mes con movimientos. Las comparaciones usan los mismos meses del año anterior y los mismos filtros. La cuota usa el total del conjunto filtrado. El precio FOB se calcula como valor dividido por unidades. El gráfico de marcas incluye CLAAS como categoría si tiene movimientos en los períodos comparados.

Desde Administración → Datos, los administradores con acceso a Datos pueden cargar el informe completo con la hoja Base analítica y confirmar su reemplazo. La lectura requiere acceso a Mercado y a Tractores, con la excepción habitual de superadministración. La política de la tabla impone los permisos en el servidor. El repositorio contiene la implementación y la migración, sin datos de los importadores.

Fuentes del flujo: `src/features/mercado`, `src/lib/permissions.ts`, `src/App.tsx`, `supabase/migrations/20261119170000_mercado_tractores.sql`. Aplicar la migración, aplicar también la migración 20261119190000 para separar la carga de la consulta, conceder los accesos y cargar el informe son pasos del entorno de despliegue.
