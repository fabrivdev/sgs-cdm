# Textos y colores de Panorama — 29/10/2026 (local)

Catálogo de plantillas: las letras representan datos calculados, no cifras runtime fijas.
Antes, los comentarios usaban «etiqueta: valor (período), frente a referencia; diferencia» o solo «etiqueta: valor este mes».

| Tema | Antes | Ahora / significado |
|---|---|---|
| Evolución de ventas | Ventas antes de NC: X (este mes)… | En lo que va de este mes, las ventas antes de notas de crédito suman X, frente a Y en el mismo tramo del año anterior; son D más/menos. |
| Facturación y NC | Facturación neta: X (este mes)… | En lo que va de este mes, la facturación neta después de notas de crédito suma X, frente a Y…; son D más/menos. No equivale a caja ni margen. |
| Pedidos pendientes | Conteo aislado | Se registran N pedidos pendientes. C tienen stock vinculado para todas sus unidades; el vínculo no confirma entrega. |
| Resolución de OS | Mediana: D (el mes pasado)… | Durante el mes pasado, la mediana de resolución de las OS cerradas fue de D días, frente a A en el mes anterior a ese; son Δ días menos/más. |
| OS facturadas | Tasa aislada | El P% de las OS cerradas tiene facturación a clientes. N de D órdenes cerradas tienen facturación a clientes, cuando concilia con la tasa. |
| Stock antiguo | Valor aislado; contexto «Gris + rojo · códigos» | Stock clasificado en gris y rojo: valor y códigos. Contexto aclara valor referencial, no pérdida realizada. |
| Cambios de clasificación | Valor que podría cambiar en 30 días | Podría pasar a gris o rojo en 30 días si no cambian fechas ni criterios; códigos cuando disponibles. |
| Cumplimiento | Porcentaje aislado | Se completó el P% de compromisos evaluables; N de D se completaron, si concilia. |
| Productividad | Tasa aislada | Horas trabajadas representan P% de la capacidad disponible; H trabajadas sobre D disponibles, si concilia. |
| Eficiencia | Tasa aislada | Horas facturadas representan P% de horas trabajadas conciliadas; H facturadas sobre D trabajadas conciliadas. |
| Retención | Tasa aislada | Volvió a comprar P% de clientes de la cohorte base; N de D recompraron, si concilia. |
| Cobertura posventa | Cobertura posventa: P% este mes | La compra de servicios o repuestos alcanzó P% de propietarios elegibles del parque; N de D registran compras, si concilia. |

Períodos en prosa. Día y semana conservan ventanas cerradas exactas; acumulado se llama disponible, sin asumir año completo. La política de elegibilidad no cambia: sin período actual verificable no se genera comentario. En particular, clasificación/lectura de stock no se convierte en corte de inventario ni en dato del mes. Los textos de pedidos/stock también mejoran el contexto de la tarjeta; no se activan rondas ficticias para estas fotos sin ventana elegible. No se agregan causas, metas ni recomendaciones causales.

Colores: la diferencia de ventas brutas/netas es verde si aumenta y roja si disminuye con comparación válida (solo significado de importe). Menor mediana de resolución es verde y mayor roja con contrato de mes cerrado. OS facturadas, productividad, eficiencia, pedidos, stock, clasificación, retención/cobertura y agenda permanecen neutrales si sus fuentes actuales no acreditan una comparación interpretable. NC aislada no prueba pérdida. Flechas/signos y descripción accesible se conservan; no nuevos círculos semáforo. Los fondos por tema no se reinterpretan como evaluación.

Fuentes: factualRounds.ts; approvedCardModel.ts; panoramaTopicContracts.ts; salesStories.ts; managerialStories.ts; partsExposure.ts. Revisión independiente confirmó polaridad inversa de duración y neutralidad de OS parcial frente a mes completo.

Validación: pruebas de rondas, permisos, fechas antiguas, conciliación de poblaciones, tasas en puntos porcentuales, dirección inversa de duración y neutralidad de métricas ambiguas. QA local con sesión Fabrizio: mediana descendente verde, OS facturadas parcial neutral, textos en badge. No publicación ni cambios de consultas/permisos.

Corrección puntual del acumulado: utiliza la plantilla semántica del tema, sin repetir el período desde la etiqueta de origen. Ejemplo de plantilla: «En el acumulado disponible, las ventas antes de notas de crédito suman X, frente a Y en el mismo tramo del año anterior; son D más/menos». La facturación conserva su definición neta. No se alteran ventanas, importes ni elegibilidad.

Resolución OS: reemplazada la restricción a mes cerrado por mes actual hasta hoy y acumulado desde 01/07/2026. Se recalcula la mediana sobre OS individuales paginadas, con identidades únicas y duraciones válidas. No hay delta contra mes completo; el enlace conserva rango por cierre. La fecha usa America/Asuncion y la clave de caché incluye día, usuario, permisos y modo. No se acredita actualización de la fuente por fecha de lectura.


## Catálogo del usuario aplicado el 29/10/2026 (badge)

Las plantillas narrativas anteriores de esta nota quedan como historial: el badge usa ahora `factualCopy.ts`, conectado desde `factualRounds.ts`. Se aplicaron los doce temas y mensajes generales enviados por el usuario. No se reescribieron las cards ni sus métricas.

Precauciones: cobertura dice propietarios del parque, no propietarios activos; clasificación conserva la condición de fechas y criterios sin cambios (no solo nuevas compras); las diferencias de ventas/neto siguen siendo importes absolutos, sin el artículo «un». Los conteos entre paréntesis se mantienen cuando concilian. Totalidad y cero se deciden por numeradores/denominadores exactos, no por porcentaje redondeado. Sin base disponible se omite la parte dependiente; error/carga no significan cero.

Fotografías: pedidos requiere lectura del día y población conciliada; la afirmación de cobertura completa requiere composición completa sin pedidos no clasificables. Stock y cambios de clasificación requieren corte de inventario y clasificación del día para comentar como estado actual. La fuente actual de exposición solo aporta fecha de clasificación: esos comentarios permanecen omitidos hasta acreditar corte de inventario; no se fuerza una ventana mensual. Los estados vacíos se narran solo con base cero certificada por el contrato; eficiencia incompleta no se presenta como ausencia de actividad.

Las rondas, permisos, pausas y animaciones se conservan. Las nuevas variantes se verifican con `factualCopy.test.ts`, `factualRounds.test.ts`, `BusinessCampi.test.tsx` y regresiones de Panorama/Resolución. Sin publicación ni cambios productivos.


### Ajuste local USD y lectura, 29/10/2026
USD se presenta sin decimales en comentarios, tarjetas y gráficos/detalles de Panorama; cálculos conservan precisión. Diferencias monetarias de menos de medio dólar se omiten del comentario comparativo para no anunciar cero más/menos. Lectura: mínimo 10 s y 500 ms por palabra, redondeado al segundo más cercano (antes 8 s y 400 ms). Ciclo y pausas intactos. Sin publicación.


### Puente y alcance de facturación, revisión local 29/10/2026
- `salesStories.ts` entrega `billingComponents` numéricos (gross, credits firmadas, net). `billingComponents.ts` valida finitud, signos y bruto + NC = neto con tolerancia USD 0,02, además de coherencia con el KPI. Card/contexto consumen ese contrato; etiquetas solo como compatibilidad de historias anteriores. Regresión desde salida del cargador en Mes/Acum: `BillingLoaderBridge.test.tsx`.
- Alcance actual del total: Repuestos + Servicios + Máquinas autorizados. NO acredita facturación integral de la empresa. No se incorporaron otras categorías sin conciliarlas.
- Auditoría de código (no montos productivos): `20260916180000_respect_historical_group_fx_and_commercial_others.sql` conserva áreas `otros` y `revision` en la fuente general. `ventas_es_otro_comercial` reconoce envíos, intereses y merchandising; el fallback de concepto Otros también contiene clasificación desconocida, por lo que no equivale a una categoría comercial conocida.
- Servicios ya incluye Servicio, Kilometraje, Repuestos con OS y Terceros dentro de su ámbito; no sumar esos conceptos otra vez. Máquinas históricas usa `ventas_maquinas_historico_lineas` con cargas activas/completadas, mientras el Dashboard general parte de `facturacion`; no reemplazar fuentes históricas por el Dashboard sin conciliación.
- Lectura general existente: `dashboard_facturacion_lote_v1`, permiso `servicios.dashboard`, JSON completo rows/count, consumido por `cargarFacturacionDashboard` en trimestres. No tiene filtro de área; usarlo para añadir Otros implica descargar nuevamente toda la facturación y cruzarla. No se ejecutó una descarga anual adicional en esta revisión.
- Ampliación pendiente: lectura agregada selectiva de las áreas restantes sobre fuentes canónicas, con identificación estable de línea, bruto/NC/neto por período y categoría, Otros reconocido separado de Sin clasificar/Revisión, control de conservación y sin repetir las tres áreas existentes. Requiere validar contrato/permisos antes de instalar una nueva función; no se modificó DB ni importador. No inventar monto cero para lo no consultado.
