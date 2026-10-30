# Panorama: filtros por rubro — 29/10/2026

## Implementado localmente

Evolución de ventas y Facturación neta permiten seleccionar varios rubros a la vez. Selección vacía vuelve al total autorizado. Cada tema mantiene su propia selección transitoria por usuario; no se guardan preferencias. Se descartan rubros sin permiso. El cargador entrega componentes numéricos por rubro, mes y acumulado; el derivador suma cada fuente una sola vez y filtra también las comparaciones temporales del badge. El puente sigue exigiendo bruto + NC = neto con valores precisos. No hay consultas adicionales al pulsar los filtros.

Se retiraron «Incluye Repuestos, Servicios, Máquinas y Otros» y el apéndice «Ámbito». Se conserva «Cobertura parcial» si falta una fuente. No cambia la clasificación ni la consulta Otros instalada.

Fuentes: src/lib/campi/salesStories.ts, salesScope.ts, panoramaStoryTypes.ts, factualRounds.ts; src/components/campi/ApprovedPanoramaCard.tsx y PanoramaDashboard.tsx.

## Cobertura de posventa: límite comprobado, sin activación ficticia

Los dos botones están preparados y deshabilitados con explicación accesible. No filtran ni alteran el total. La respuesta actual de campi_clientes_cohortes_v1 versión 2 exige desglose_lineas=null y desglose_estado=pendiente_definicion_no_aditiva. Su función base gerencial_clientes_movimientos_posventa_v1 devuelve contrato, cliente_id, fecha, sucursal y total_venta: no devuelve grupo/rubro. campi_cobertura_parque_actual_serie_v1 sólo devuelve numerador/denominador por ventana, sin rubros ni identidades de compradores.

Definición existente: propietarios distintos del parque vigente, máquinas activo=true o null; compra si SUM(total_venta)>0 por cliente en la ventana conjunta. Incluye las reglas heredadas de moneda y sustitución documental de COBERTURA, distintas de COHORTES; no reemplazarlas silenciosamente por las reglas de ventas USD.

Alternativa inspeccionada: parque_resumen_facturacion_filtros admite p_rubro, pero tiene_srv_rango también se activa por parque_actividad_os_chasis_rango, sin acreditar compra. Sus flags indican existencia de movimientos, no saldo positivo, y su atribución por chasis tampoco es equivalente a la fuente gerencial. No se usó para fabricar cobertura.

## Contrato mínimo para habilitar los controles (NO instalado)

Hace falta una lectura autorizada que conserve el grupo original en la misma extracción COBERTURA y entregue por ventana: corte, población de propietarios única y estable, netos por propietario y rubro (Repuestos; Servicios incluyendo kilometraje) y controles de conservación del total actual. Sin nombres ni contactos. Ventanas de gráfico y principal deben usar el mismo denominador y filtros. Fechas, exclusiones y sustitución documental deben permanecer idénticas a la referencia vigente.

La unión se computa por IDs, nunca sumando porcentajes ni conteos solapados. Antes de activarla hay una diferencia semántica a conciliar: un propietario con +100 en Repuestos y -200 en Servicios cumple saldo positivo de Repuestos, pero no el total conjunto vigente. Debe medirse ese conjunto con la lectura nueva; si existe, no cambiar silenciosamente la población al usar la unión de compradores por rubro. Si no existe, los conjuntos concilian y la unión puede habilitarse sin cambiar resultados.

Se requiere preparar/revisar y autorizar específicamente una ampliación de lectura del contrato de cobertura y su serie, conservando el permiso actual parque.maquinas y sus controles de rol/módulo. La autorización de campi_facturacion_adicional_v1 no cubre esto. No se ejecutó DDL, grants, cambios RLS ni consultas productivas nuevas para esta tarea.

## Verificación

84 pruebas focalizadas pasaron: selección múltiple, quitar último filtro, permisos, neto negativo, duplicados de selección, puente mensual/acumulado, fuente ausente, comentarios y dashboard. Lint de los archivos modificados pasó. Build pasó en 79 s. El tipado global mantiene cuatro diagnósticos fuera de este cambio: ApprovedMonthlyColumns.test.tsx sección clientes.parque, PanoramaStoryCard.tsx findLastIndex y dos propiedades vendidas de projectedStockYtd.test.ts; no se declara limpio.

Chrome real de Fabrizio, 127.0.0.1:5174/panorama: total neto mensual 276.702; Otros 31.398; Otros+Servicios 70.718; desmarcar Servicios vuelve a 31.398. Otros acumulado 651.381 y total acumulado 16.814.193. Puente y badge coherentes en cada selección, sin enumeración accesoria. Las cifras visibles USD se redondean sin alterar precisión interna. Se restauró Mes y selección vacía. No se modificaron los cuatro temas guardados. No se afirma QA de filtros activos de Cobertura: todavía no están habilitados.

Publicación, push y despliegue no realizados. Bienvenida, badge animado, intervalo/loop y datos de negocio sin cambios.
