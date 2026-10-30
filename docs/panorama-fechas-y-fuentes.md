# Panorama: fechas y preparación de datos

Partida: 0ee8a3cf4f39ff5d2aa97c2b125ebb2e5fd81f03, feat/campi-panorama-alternativa. Trabajo local del 21/10/2026. No publicado, sin migraciones remotas, sin cambios de registros ni RLS.

## Convención

Fechas DD/MM/AAAA; rangos DD/MM/AAAA–DD/MM/AAAA; etiquetas internas mensuales ene AAAA, feb AAAA, etc.; ticks de las cards Ene, Feb, etc., sin año repetido. Rangos ocultos en cards y conservados en detalle y accesibilidad. Mes cerrado de Resolución conserva principio/fin reales. Retención mantiene dos ventanas equivalentes, rotuladas Base y Recompra. Clasificación y Lectura son fechas observadas, no acreditan inventario ni importación. StoryTime separa window/comparison/classificationDate/observedAt/inventoryCutoff/importedAt: los campos desconocidos no se completan con la fecha actual.

## Contrato común

SeriesPoint contiene from/to, valor nullable, numerador, denominador, IDs de cohorte, corte documental y completitud de los datos usados. complete no certifica permisos, completitud histórica del importador ni estabilidad transaccional entre páginas. Mediana no tiene numerador aditivo. Mes sin población o inválido permanece null, con hueco en el gráfico; no cero ni interpolación.

## Fuente → preparación por los doce temas

| Tema | Fuente real / consumidor nativo | Preparación y clasificación |
|---|---|---|
| Evolución de ventas | salesStories; ventas_repuestos_panorama_filtros_v1 → ventas_repuestos_movimientos_filtrados_v1; campi_ventas_servicios_componentes_v1 → ventas_servicios_movimientos_enriquecidos; ventas_maquinas_dashboard_filtros_v2 → ventas_maquinas_fuente_v2 | A: ya hay series mensuales y conciliación de componentes; meses uniformados. B: primera fecha de movimiento no acredita inicio de cobertura completa. No se amplió arbitrariamente el histórico anual ni se marcó enero como acreditado. Revisar cargas activas COMPLETADO de ventas_maquinas_historico_cargas y alcance importado de las otras áreas. |
| Facturación y NC | Mismas tres fuentes y Ventas nativas | A: componentes y meses ya existentes; se conserva cascada Ventas + NC = neto, signo normalizado una sola vez. B: cobertura histórica por área sigue sin certificación. |
| Pedidos pendientes | maquinaria_pedidos_lineas_estado_actual; maquinaria_unidades_operacion; maquinaria_importacion_unidades; parque_stock_maquinas; maquinaria_unidades_facturadas_confirmadas, vía campi_pedidos_con_stock_v1 | A: SQL preparado extiende campi_pedidos_abastecimiento_v1 con TODAS las operaciones y sus IDs; completa/parcial/sin cobertura/no clasificables. Adaptador preparado verifica cantidad, identidades, unidades, clasificabilidad y categorías; integración de composición desactivada. No representa pedidos individuales en gráfico. Cantidades inválidas o universo incoherente siguen bloqueando el agregado. |
| Resolución OS | ordenes_servicio_importadas y cohorte nativa panoramaCohort; resumen campi_resolucion_os_v1 | A: nueva consulta de seis meses cerrados, estrecha, ordenada, paginada y con conteo exacto. Medianas por cierre; últimos dos meses deben coincidir con resumen. B: fechas ausentes/reaperturas y completitud del importador. C: no se reconstruyen ciclos de reapertura. |
| OS facturadas | ordenes_servicio_importadas + loadOrderBilling/service_orders_billing_v2 | A: nueva serie por mes de cierre, mes actual parcial y corte documental común asOf; mismos documentos positivos y tipo Cliente. No existe categoría Cliente sin factura. B: conciliación y permisos reales pendientes. |
| Stock antiguo | v_repuestos_semaforo_historico + v_repuestos_ultima_compra + v_repuestos_analisis_ubicaciones | A: SQL preparado suma valor elegible por 366–1000 y >1000 días, mantiene categoría desconocida si hay inconsistencia. No inventa nuevos tramos ni mezcla compras recientes con stock antiguo. B: corte de inventario no acreditado. C: estas vistas de estado actual no dan snapshots históricos. |
| Cambios próximos | Mismas vistas, umbrales 366/1001 | A: SQL preparado devuelve código, destino, días_hasta y valor por código, deduplicando ubicaciones; frontend agrega 30 días y concilia con KPI. Condicional a no cambiar compras/ventas/criterios. |
| Agenda | servicio_jornadas, Planificador | A: ya agregada por semanas/meses, canceladas incluidas; etiquetas mensuales uniformadas. C: no reconstruye historial de reprogramaciones. |
| Productividad | service_orders_work_log_v1/comisiones_jornadas + loadOperationsData + workedProductivity + tecnico_disponibilidad + profiles + app_configuracion | A: horas y ausencias existen. B: app_configuracion entrega meta actual; profiles entrega estado actual/desactivado, no historial completo de altas/regímenes/metas. No se fabricó comparación de capacidad con plantilla actual. Falta acreditar vigencias para calcular porcentaje anterior con misma población, régimen y tramo equivalente. |
| Eficiencia | ordenes_servicio_importadas + service_orders_billing_v2 + billingEfficiency | A: seis cohortes por cierre con corte documental común y carga financiera en lotes existente. KPI conserva mes actual. B: tarifas, ambigüedad y significado de servicios_cantidad; meses incompletos null. No confundir horas OS con horas-persona. |
| Retención | gerencial_clientes_resumen_v1; ParqueTab usa parque_facturacion_atribuida_rango + parque_facturacion_legacy_fallback_rango | A/B: SQL candidato con IDs de compradores de ambas ventanas; candidato explícitamente desactivado; conciliar cuatro totales no acredita su semántica. Definición del resumen no localizada en migraciones/scripts/src; no declarar equivalente sin consulta autorizada de su definición. Ventanas conservadas. |
| Cobertura | parque_maquinas activo y movimientos atribuidos/fallback; misma base que candidato Clientes | A/B: SQL candidato con IDs de propietarios, Servicios y Repuestos y unión deduplicada, sin sucursal; denominador común. La función nativa de resumen de Parque mezcla actividad OS sin factura en tiene_srv_rango; NO se reutiliza como compra. Se exige conciliación con propietarios_elegibles y propietarios_con_compra_actual. |

A = dato disponible que requiere agregación; B = dato disponible o candidato que requiere acreditar equivalencia/cobertura; C = historia no representada en las fuentes de estado revisadas (no prueba inexistencia en todo el backend).

## Entregables y activación

- Código local: panoramaDates, seriesData, sourceExpansion, cargadores y card. Las series de OS pueden consultar fuentes existentes sin migración.
- SQL preparado: supabase/review/panorama-source-expansion.sql. Extiende dos RPC conservando campos existentes y crea el candidato de Clientes. NO está en migrations; NO se aplicó. Revisión y autorización específicas antes de ejecutarlo.
- Validación aislada: scripts/verify-panorama-expansion.mjs, PostgreSQL en memoria con fixtures, sin red ni datos reales. Conserva controles de módulo/sección. No certifica cuentas restringidas.
- Clientes es candidato: aun con SQL aplicado, no se llama al candidato ni se activan gráfico/IDs. Requiere validar semántica y autorizar su integración.
- La extracción usa conteos/paginación, pero páginas separadas no son un snapshot transaccional; cambios concurrentes con igual cardinalidad requieren revisar antes de certificar conciliación.

## Pendientes reales

No se resolvió la cobertura histórica anual por área de Ventas, ni la capacidad histórica de Productividad. No equivalen a ausencia de ventas/jornadas. Necesitan definición de cobertura de importación y vigencias de capacidad respectivamente. Consultas de descubrimiento en supabase/review/panorama-source-discovery.sql, solo preparadas.
Validación visual final pendiente: la captura pasiva de las 16:35 mostró Excel al frente; no se forzó foco de Chrome. No se reutilizan capturas de 70b6a31 como prueba de esta versión.

## Verificación local ejecutada
201 pruebas en 33 archivos de Panorama aprobadas; TypeScript sin errores; ESLint de archivos de implementación afectados aprobado; build Vite aprobado. scripts/verify-panorama-expansion.mjs aprobado en PGlite en memoria. Advertencias del build: Browserslist desactualizado y chunks grandes; no se actualizaron dependencias. No hay consulta productiva ni captura de la app actual que acredite conciliación real.


## Corrección local posterior a revisión
Clientes: candidato SQL desactivado; ni cuatro totales coincidentes acreditan población, fechas, compras o permisos. Pedidos: composición también desactivada; contrato preparado exige clasificable explícito y mantiene No clasificables separado de Sin cobertura. El parser vigente sigue rechazando estados ambiguos. SQL sólo preparado, nunca aplicado.
KPI actual e histórico se consultan separadamente; un fallo histórico conserva el KPI y deja la serie no disponible. Agenda conserva todos los períodos en un contenedor desplazable.
Por instrucción posterior, las cards no muestran rangos (quedan en ayuda accesible y detalle); las líneas usan Ene…Dic, sin eje Y visible, preservando escala, tooltip y leyenda. Fechas completas compartidas en detalle y semanas. El gráfico de líneas ocupa las filas 2–3 sólo en su columna derecha, dejando CTA en columna izquierda y sin cambiar las filas de la card. Verificación visual posterior pendiente; tests no acreditan estética ni permisos reales.


## Revisión con definiciones reales
El archivo panorama-source-expansion.sql quedó obsoleto. Paquete independiente en supabase/review/panorama-v2/README.md, con firmas, permisos, validación y reversión. Clientes se rehízo con los contratos reales y la misma autorización; no hay activación frontend ni desglose por línea. SQL sólo preparado. La existencia de cargas históricas no certifica cada período anual; 818 filas sin fecha se mantienen como incidencia.
