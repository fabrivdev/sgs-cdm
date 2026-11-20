# Mercado de tractores

Tractores usa el encabezado y el contenedor compartidos de SIG CDM. Las pestañas están a la derecha del título cuando hay espacio y se desplazan horizontalmente debajo del título en móvil.

En el tablero, el filtro Marca cambia el ranking a modelos. La tabla se desplaza con el encabezado fijo y hasta 20 filas visibles. Los importes con $ conservan la moneda de origen del FOB (dólares estadounidenses).

El gráfico y el detalle por precio muestran unidades con FOB positivo. Los movimientos sin FOB positivo siguen en la base y en el total de unidades del mercado.

En las tarjetas del tablero, la variación interanual positiva se muestra en verde y la negativa en rojo. El cero y la ausencia de comparación se muestran en color neutro.

Las tarjetas de gráficos usan títulos breves, sin subtítulos. Todas las familias de Mercado reutilizan los nombres de `marketChartTitles` en `src/features/mercado/model.ts` para las mismas métricas. Unidades por segmento, Indicadores por segmento y FOB por segmento muestran bandas de potencia para tractores y clases para cosechadoras. Las pestañas concentran la navegación del tablero. Las barras de importadores comparten origen cero y escala. La comparación por HP usa un eje monetario común con cinco marcas en escritorio y tres en pantallas angostas. Los puntos CLAAS muestran el FOB sin el detalle del modelo. Las cuotas y contribuciones se recalculan con los filtros.

El tablero agrega oportunidades por banda HP, posicionamiento CLAAS por banda y estado, ritmo acumulado de unidades, concentración por importador y estacionalidad. Los análisis respetan los filtros activos. La cuota CLAAS usa el total filtrado de la banda y el FOB de los nuevos análisis utiliza unidades con FOB positivo.

La comparación CLAAS muestra por banda el rango y la mediana de los FOB medios de modelos de otras marcas y marca con puntos los modelos CLAAS. El gráfico acumula unidades desde enero hasta el corte seleccionado; compara el año activo y el anterior con la mediana y el intervalo P25–P75 de años anteriores con cobertura desde enero hasta cada mes. La banda requiere al menos dos años históricos. El ranking de importadores muestra nombres, unidades, cuota y concentración de los principales importadores sobre las unidades identificadas. El mapa de calor estima el intervalo cubierto a partir del primer y último mes de cada año presentes en la base e informa la mediana de años anteriores por mes. Escala los volúmenes sobre el máximo visible: verde para el tercio inferior, amarillo para el intermedio y rojo para el superior. Los meses fuera de cobertura quedan sin color.

El catálogo técnico de potencia en src/features/mercado/power.ts enlaza fichas de fabricante y completa las bandas faltantes al consultar la base. En ausencia de ficha, reutiliza una banda observada si es única para la misma marca y modelo. La potencia informada prevalece y los casos ambiguos quedan pendientes.

La sección `mercado.tractores` abre el tablero y sus vistas de marcas, modelos, potencia, precios, importadores, e historia. Los enlaces conservan el período, el estado y los filtros elegidos. Una fila de precios abre sus marcas y permite desglosar por modelo e importador.

El corte inicial es el último mes con movimientos. Las comparaciones usan los mismos meses del año anterior y los mismos filtros. La cuota usa el total del conjunto filtrado. El precio FOB se calcula como valor dividido por unidades. El gráfico de marcas incluye CLAAS como categoría si tiene movimientos en los períodos comparados.

Desde Administración → Datos → Mercado · Tractores, los administradores pueden cargar directamente el archivo original de Penta/PYimport con SubItems y Parámetros. El período declarado define los meses a actualizar. La acción actualiza ese bloque en una única operación y conserva el resto de la base. Las recargas del mismo período no acumulan filas. Se mantienen los filtros de tractores agrícolas de ruedas a consumo y las equivalencias observadas de marca, modelo, potencia e importador. La carga completa mediante Base analítica sigue disponible para reconstruir la base. La lectura requiere acceso a Mercado y a Tractores, con la excepción habitual de superadministración. La migración `20261120130000_mercado_actualizacion_por_periodo.sql` habilita el guardado mensual en el servidor.

Fuentes del flujo: `src/features/mercado`, `src/lib/permissions.ts`, `src/App.tsx`, `supabase/migrations/20261119170000_mercado_tractores.sql`. Aplicar la migración, aplicar también la migración 20261119190000 para separar la carga de la consulta, conceder los accesos y cargar el informe son pasos del entorno de despliegue.
