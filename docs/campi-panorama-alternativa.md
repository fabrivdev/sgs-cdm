# Panorama alternativo: temas con contexto

## Estado del catálogo — 21/10/2026

La rama local `feat/campi-panorama-alternativa` usa como referencia exclusiva las 20 preguntas acordadas en `panoramaCatalogTargets.ts`. El selector ofrece **12 preguntas** con cálculo y lectura existentes; retira las 10 opciones anteriores que no correspondían a esas preguntas. Las prioridades guardadas que todavía coinciden se conservan en su orden y las opciones retiradas se descartan. Se pueden mostrar hasta cuatro a la vez, sin cambiar `main` ni la publicación de Lovable.

Los siete temas conservados son evolución de ventas, neto tras NC, pedidos de máquinas pendientes, resolución de OS cerradas, OS abiertas antiguas, capital de repuestos gris/rojo y próximos cambios de clasificación. Se incorporaron cinco: cumplimiento de agenda, productividad de Servicios, eficiencia de Servicios, retención de clientes y cobertura de posventa. Eficiencia exige simultáneamente `servicios.ordenes` y `servicios.ventas`; los clientes exigen `parque.maquinas` y la RPC de Gerencia/Administración. La consulta autenticada del 21/10 mostró valores para los cinco nuevos temas y el enlace de productividad abrió Órdenes de servicio en la pestaña y período correspondientes. No se comprobó el recorrido con cuentas de acceso limitado porque no hay cuentas de prueba disponibles.

Quedan ocho preguntas sin habilitar: reposición de repuestos, embarques próximos, importaciones demoradas, capital de compras pendiente, concentración de ventas por cliente, evolución del parque instalado, antigüedad del stock de máquinas y stock de máquinas proyectado. Sus condiciones están en `panoramaCatalogTargets.ts`. No se sustituyen por una cifra fácil pero de distinto significado: por ejemplo, `eta` no es fecha de embarque; `importado_en` no es antigüedad física del stock; y una suma sin conciliar compras recibidas puede duplicar el stock. El enlace de los dos nuevos temas de clientes lleva a Clientes del parque, pero esa vista aún no reproduce la cohorte del KPI como filtro; es una limitación funcional pendiente.

Comprobaciones locales de esta iteración: 132 pruebas focalizadas aprobadas, TypeScript de la aplicación aprobado después del ajuste de permisos, lint de los archivos modificados sin errores y build aprobado antes del último ajuste de permisos. El lint global sigue informando problemas anteriores del repositorio. Las cifras de la consulta autenticada son observaciones del corte, no constantes de código. Los apartados históricos de esta nota describen etapas anteriores y no amplían el selector vigente.

## Corrección de utilidad — 20/10/2026 (rama alternativa)

**Alcance actualizado de OS abiertas (aplicado en Lovable Cloud el 20/10):** solo cuentan las identidades vigentes del último XML TOTVS de OS importado por completo. El archivo `ordenes_de_servicio_072008.xml` contiene 320 OS distintas; 1 anulada se excluye, 319 se persistieron y 60 están abiertas. La consulta posterior a la migración confirmó 319 identidades, 0 faltantes y 60 abiertas tanto en la fuente como en el corte guardado. Panorama local autenticado mostró 60 y su detalle concilió 51 HORSCH, 8 CLAAS, 1 otra marca; 5 de 0–7 días, 24 de 8–30 y 31 de 31–90. El enlace individual abrió la OS en origen y, sin búsqueda, esa cohorte mostró 60. Las cifras de 81 y sus desgloses mencionados abajo describen la lectura anterior, que mezclaba 21 abiertas históricas ajenas al último reporte; no son KPI vigentes. La migración `20261020180000_campi_open_os_latest_totvs_snapshot.sql` separa la nueva serie de cortes. La función de lectura acepta también `os_lotes_confirmados` del importador público actual, con controles de completitud y exclusiones, para las próximas cargas mientras el frontend permanece solo en la rama alternativa.

El importador público todavía intenta capturar la curva antes de cerrar su registro de carga; esa captura se omite si falla y no altera el conteo vigente. La rama alternativa mueve la captura al final de la persistencia. Hasta publicarla, los futuros cortes pueden carecer de punto histórico aunque el total abierto del último reporte se calcule correctamente.

El catálogo deja de ofrecer el saldo físico de máquinas como KPI autónomo. «Pedidos pendientes» vuelve a encabezar la lectura: 12 pedidos en el corte real del 20/10, de los cuales 6 (50%) tienen al menos una unidad con stock para facturar. El gráfico conserva las 19 unidades por abastecimiento: 7 con stock, 3 de importación arribada, 1 en tránsito y 8 sin vínculo comprobado. Cada NP con stock abre su operación; tener stock no reemplaza la revisión comercial final. Las RPC `campi_pedidos_abastecimiento_v1` y `campi_pedidos_con_stock_v1` concilian el total y la parte facturable. La segunda quedó aplicada en Lovable Cloud y comprobada en el navegador local.

Facturación mantiene el neto mensual y separa ventas y NC. La cabecera del lateral muestra tres KPI breves: Neto mes, Neto año y NC año. Los dos netos muestran variación y base LY; NC año muestra su proporción de ventas. El gráfico compara mes a mes con el año anterior, y las tablas conservan importes exactos y áreas autorizadas. Cuando no hay comparación válida se omite ese bloque visual. Se quitaron del lateral las explicaciones permanentes de fuente, población y corte sin acreditar; el contrato técnico sigue documentado internamente.

OS abiertas incorpora desgloses por marca y edad. En el corte real se verificaron 81 abiertas: HORSCH 55, CLAAS 20, sin marca 5 y otras 1; por edad, 5 de hasta 7 días, 24 de 8–30, 31 de 31–90 y 21 de más de 90. El XML solo conserva el estado actual y muchos cierres antiguos carecen de fecha, por lo que no permite reconstruir una curva diaria histórica confiable. La migración aplicada registra el primer corte y el importador registrará los siguientes tras cada carga completa; la evolución aparece con dos o más cortes reales, sin inventar historia.

TypeScript, build, ESLint de los archivos de Panorama tocados y 167 pruebas de Campi/importación pasan tras el último ajuste. El lint global conserva infracciones anteriores fuera de esta corrección. No se publicó en `main` ni en Lovable público.

## Seguimiento vigente · Plan definitivo · 20/10/2026

Este seguimiento reemplaza los planes anteriores. Las secciones posteriores son antecedentes, no certificaciones del estado actual. Fuente: plan definitivo entregado por el usuario el 20/10/2026. Base comprobada: `c2dd297`, rama `feat/campi-panorama-alternativa`, árbol limpio antes de esta actualización documental.

### Reglas de ejecución y cierre

- Trabajar exclusivamente en la rama alternativa local; no tocar `main` ni publicar Lovable.
- Preservar cambios posteriores, cuadrícula, paneles laterales, distinción 7/17 y ciclo de comentarios.
- No borrar preferencias, modificar datos de negocio ni alterar permisos reales para probar.
- No integrar una IA nueva ni describir las reglas como inteligencia autónoma.
- Máximo cuatro prioridades seleccionadas; catálogo amplio, sin cuota artificial por sector.
- Cada casilla se marca solo con evidencia del resultado. Código y pruebas automáticas no sustituyen conciliación de origen ni comprobación en pantalla.
- Registrar por tarea: estado, cambio, evidencia, resultado y pendiente concreto. Estados: pendiente, en curso, bloqueada, verificada. Un bloqueo no cierra la tarea.
- Conservar por separado pruebas aprobadas, fallidas, bloqueadas y no realizadas.

**Foco vigente:** cerrar E1.3 (universos de OS/stock, comparación contra origen y cortes) y E2.6 (revisión exhaustiva de detalles). El registro de contratos y la reparación independiente de movimiento avanzan sin habilitar candidatos todavía no conciliados.

**Avance posterior del 20/10:** consulta de solo lectura a `ordenes_servicio_importadas` en Lovable Cloud: 61 «Abierta» + 20 «ABIERTA» = 81 abiertas; no hay otros estados activos en este corte. Las cohortes cerradas recomputadas desde filas dan agosto: 66 cierres, 0 fechas inválidas y mediana 16,5 días; septiembre: 84 cierres, 0 inválidas y mediana 14 días. Las cifras de Panorama coinciden. La diferencia entre la definición amplia de la sección y el RPC no tiene impacto observado en este corte, pero sigue siendo un riesgo si llega un nuevo estado activo; no se ejecutó SQL de cambio. El registro del selector ahora reúne también título visible, pregunta y versión de comparación; los loaders y la referencia entre visitas consumen esos campos. No equivale aún a un registro único para todas las salidas y comentarios.

La consulta de solo lectura a `parque_stock_maquinas` confirmó 36 filas nuevas/saldo 36 y 50 filas usadas/saldo 51: total físico 87, como la tarjeta. La tabla tiene `importado_en` pero no un campo de corte efectivo de inventario entre sus 18 columnas; permanece «Corte por confirmar». No se convirtió la fecha de importación en corte.

Recorrido real adicional de ocho detalles: Facturación, Abastecimiento, Resolución, OS abiertas, Alertas, Concentración, Antigüedad por sucursal y Stock físico abrieron en panel lateral; Escape cerró los seis últimos y devolvió el selector. Se corrigió el encabezado redundante «Corte no informado / Corte por confirmar» en Antigüedad y Stock físico: ahora indica «Clasificación» con fecha y «Foto física», respectivamente, manteniendo aparte el límite de corte no acreditado. No se declara completada E2.6: falta revisar todas las pestañas, enlaces y foco en ambas resoluciones.

Tras recargar el navegador propio, se comprobaron «Foto física · Corte por confirmar» en Stock y «Clasificación 2026-10-20 · Corte por confirmar» en Antigüedad. La primera prueba automatizada del ajuste falló porque el texto se había colocado en el loader de proyección deshabilitado; se corrigió la ubicación, se repitieron las ocho pruebas de operaciones y quedaron aprobadas. Ese fallo no se contó como aprobación inicial.

### Avance adicional del 20/10

- Se separó `.campi-panorama-fit` (escala de encaje) de `.campi-sprite` (gesto). Se retiró la regla de portada que anulaba los pasos e inclinaciones. Pausa de detalle/visibilidad ahora llega al rostro y consume reacciones recibidas mientras está pausado. Pruebas unitarias aprobadas; la observación continua y video siguen pendientes.
- Se separaron hover y foco de teclado de Campi: el foco residual de un clic ya no debe congelar indefinidamente los comentarios. Pendiente prueba específica con teclado y navegador.
- Registro `panoramaTopicContracts.ts`: diez contratos con cálculo, universo, unidad, comparación, presentación, límites, fuentes y pruebas. La agrupación de consultas de portada lo consume; no se declara aún centralización completa de portada/detalle/comentarios.
- Las fotos diarias pueden compararse entre lecturas conservando definición, fuente, alcance y permisos. Meses de ventas y cohortes de cierre siguen requiriendo período compatible. Se versiona la comparación para no reutilizar referencias de significado distinto. El texto reconoce correcciones y paso del tiempo.
- Los enlaces de OS incorporan una cohorte explícita: cierre operativo real y fechas válidas, o estado explícitamente abierto sin límite inferior histórico. La vista habitual conserva su definición; el selector Universo hace visible el criterio y permite volver al habitual. Validación real pendiente.
- Lectura actual en pantalla: abastecimiento 19 unidades, 8 sin vínculo (7 stock, 1 tránsito, 3 arribadas). La observación anterior 7/17 no se usa como constante de prueba productiva.

### Inventario de candidatos E3 — evidencia de código, no certificación productiva

| Candidato | Estado | Condición para integrar |
|---|---|---|
| Productividad técnica | Reutilizable; pendiente conciliación | `workedProductivity`: horas-persona válidas / disponibles. Conservar incidencias, indisponibilidades y técnicos sin actividad; capacidad cero no produce 0% válido. |
| Eficiencia de OS cerradas | Reutilizable; pendiente conciliación | `billing.ts`: facturadas/trabajadas de OS conciliadas. Exige `servicios.ordenes` **y** `servicios.ventas`; no representa todos los técnicos. |
| Rendimiento | Pendiente datos/definición | Necesita facturadas, trabajadas y disponibles del mismo período/personas. No multiplicar eficiencia por productividad actuales. |
| Cumplimiento | Reutilizable; pendiente conciliación | Resultados realizados/(realizados + no realizados); futuro y pausas separados. Validar contra matriz operativa, no usar toda agenda como denominador. |
| Carga futura/capacidad | Pendiente datos/definición | Jornadas programadas no acreditan horas requeridas; meta operativa no acredita presencia real. |
| Cobertura de clientes en Servicios/Repuestos | Pendiente conciliación y permisos | `contacto-utils`/`ParqueTab`: clientes con actividad / clientes filtrados con máquinas. Servicios incluye OS por chasis; no equivale a cobertura por máquina. Revisar grants y autorización legacy de RPC antes de reutilizar. |
| Compradores activos/nuevos/recurrentes | Pendiente definición | Identidad canónica, ventas positivas frente a NC, ventana, historia suficiente; primera observada no equivale a primera real. |
| Retención/reactivación/inactividad | Pendiente evidencia | El tipo generado de RPC no demuestra implementación ni semántica. Faltan cohortes, ventanas e historia acreditada. |
| Composición parque instalado | Reutilizable; pendiente conciliación | `parque_maquinas`, permiso `parque.maquinas`; definir inactivas, plataformas y sin cliente; separado de stock para venta. |
| Evolución parque | Pendiente datos/definición | Historia registra eventos, pero registro no acredita fecha efectiva/completitud. Transferencias/refacturaciones no deben incrementar parque. |
| Compras/proyección | Pendiente conciliación | Stock, recepciones, compras y reservas deben identificarse por unidad; no sumar compras ya ingresadas. |

La conciliación de repuestos filtra ubicaciones con stock positivo **antes** de agrupar y separa USD positivo elegible de Kardex bruto. `usd_min=0` posterior a agrupación no resuelve el problema. Conserva códigos sin valor para cobertura y avisos.

**Migración autorizada y ejecutada el 20/10:** `20261020120000_parts_panorama_valuation_scope.sql`. Antes de ejecutarla se comparó `md5(prosrc)` de la función productiva con la base local: ambos `d0d7b05c3116f4ce16b43ea49b0a71c8`. Lovable devolvió `Query succeeded`. No se modificaron inventario ni facturas. La app autenticada abrió el detalle con Universo «Stock positivo · Panorama» y color «Gris y rojo»: **4.043 códigos y USD 1.128.981,69**. Consulta independiente contra las vistas de origen: **gris 653 códigos / USD 283.057,02; rojo 3.390 / USD 845.924,67**, coincidentes con el detalle. Evidencias: `panorama-migracion-stock-aplicada.png` y `panorama-stock-antiguo-conciliado.png` en la carpeta de visualizaciones de este chat. Falta completar la conciliación de avisos y agrupaciones, sin dar por cerrada toda E1.3.

La comprobación real de OS por la nueva cohorte mostró **84 cerradas en septiembre** y **81 abiertas**. Esto concilia cantidades; todavía no certifica una recomputación independiente de la mediana.

**Avisos conciliados en pantalla:** 24 códigos / USD 6.247,89 próximos a rojo; 11 / USD 4.116,84 próximos a gris. Los enlaces del lateral abrieron exactamente esas cantidades e importes en Análisis, con el universo positivo explícito. Panorama confirmó USD 1.128.981,69 / USD 4.721.360,17 = 23,91% de stock antiguo. El corte físico sigue sin acreditarse.

**Validación adicional:** 242 pruebas aprobadas en 29 archivos; `tsc -p tsconfig.app.json --noEmit` aprobado (el comando raíz sin proyecto no comprueba la aplicación); lint de los archivos de implementación afectados y build aprobados. Dos expectativas de textos/enlaces anteriores fallaron inicialmente y se actualizaron tras comprobar el nuevo contrato; no quedan fallos en ese conjunto. No equivale a ejecutar toda la suite del repositorio.

**Captura real:** 133 segundos observando el navegador sin clics, 565 capturas con marcas de tiempo, codificadas a 10 fps con duración original; hay intervalos breves entre tramos en los que se conserva la última captura, no se sintetiza movimiento. Archivo `campi-real-20261020/campi-observacion-real.mp4`. Se observaron reposo, inclinación, mano levantada, cambio de rostro y ciclo completo de cuatro comentarios con retorno. Portada final verificada a 1366×768 y 1440×900; ancho documental 1440 sin desbordamiento a 1440. Capturas `panorama-final-1366.png` y `panorama-final-1440.png`. Faltan revisión real de movimiento reducido y todos los detalles, por lo que E5/E7 no se cierran íntegramente.

| Etapa | Estado | Condición para cerrar |
| --- | --- | --- |
| 1 · Auditoría y coherencia | En curso: diez contratos y diez temas observados; conciliación de origen parcial | Diez temas examinados; matriz con origen, resultado y diferencias acreditadas |
| 2 · Detalles laterales | En curso: componente compactado; comprobación visual parcial | Detalles compactos comprobados en pantalla con patrón Operaciones |
| 3 · Ampliar catálogo | Pendiente | Candidatos clasificados y temas habilitados solo con respaldo |
| 4 · Registro ampliable | Pendiente | Registro común alimenta selector, portada, detalle y Campi |
| 5 · Movimiento y expresión | Pendiente | Conflicto CSS resuelto y dos minutos reales de variedad sin clics |
| 6 · Comentarios y bienvenida | Pendiente | Ciclo y primer acceso real autorizados comprobados de extremo a extremo |
| 7 · Validación y entrega | Pendiente | Evidencias, permisos, pruebas y pendientes entregados sin sobreafirmaciones |

Orden de trabajo: **1 → 2 → diseño/implementación de 4 → integración de 3 → cierre de 5 y 6 → 7**. La investigación de candidatos de 3 puede realizarse antes de 4; su integración depende del registro común. Las correcciones de Campi pueden avanzar sin bloquear la conciliación.

### Etapa 1 · Auditar los diez temas

- [x] **E1.1** Identificar por tema pregunta, fórmula, unidad, moneda, período, población, exclusiones, fuente, corte y permisos. Contratos revisados en loaders/SQL; limitaciones consignadas abajo.
- [x] **E1.2** Habilitar revisión de todos los temas autorizados sin cambiar prioridades guardadas. Botón local «Revisar temas», recorrido real y prueba de aislamiento de preferencias/última visita.
- [ ] **E1.3** Conciliar cada tema contra su sección de origen con los mismos filtros y corte; guardar diferencias y evidencia.
- [ ] **E1.4** Revisar total, subconjuntos, porcentajes, comparaciones, gráfico, detalle y comentarios como una misma definición.
- [ ] **E1.5** Probar cero, información ausente, error de fuente y comparación no disponible como estados distintos.
- [x] **E1.6** Corregir gráficos que no representen el indicador; detalle de resolución ahora grafica medianas en días, no cantidad de cierres. Verificado con datos reales 16,5 y 14 días; ausencia de cohorte no se dibuja como cero.
- [x] **E1.7** No hay corte efectivo acreditado en la fuente de stock físico; la interfaz mantiene «Corte por confirmar» y distingue fecha de lectura/clasificación/importación. Consulta de columnas de `parque_stock_maquinas` y detalle real comprobados. Reabrir si llega una fuente de corte.
- [ ] **E1.8** Revisar lenguaje: OS antigua no implica atraso; antigüedad de compra no es rotación; falta de vínculo no implica incumplimiento.

Matriz de auditoría obligatoria. Resultados permitidos: **conciliado**, **consistente internamente**, **pendiente de evidencia**, **con error**. El estado inicial no juzga el cálculo: indica que no se hizo todavía la auditoría del plan definitivo.

| Tema | Resultado inicial | Evidencia pendiente |
| --- | --- | --- |
| Facturación neta | Consistente internamente | Mes actual concilia ventas − NC; netos mensuales coinciden a precisión visible con las tres secciones. Faltan comparación histórica completa y corte acreditado. |
| Evolución de ventas | Consistente internamente | Serie y períodos equivalentes revisados; mes actual enlaza a los mismos componentes de facturación. Falta contraste completo de serie interanual. |
| Abastecimiento de pedidos activos | Consistente internamente | Lectura posterior: 19 = 8 sin vínculo + 7 stock + 1 tránsito + 3 arribadas. Falta conciliación unidad por unidad contra Operaciones. |
| Cambios próximos de clasificación | Consistente internamente | Corregida omisión de códigos sin USD positivo; 30 días y umbrales revisados. Falta conciliar cohortes completas contra origen. |
| Tiempo de resolución de Servicios | Conciliado para agosto/septiembre | SQL independiente desde filas: 66/84 cierres, 16,5/14 días de mediana y cero fechas inválidas. Falta corte de actualización acreditado y reaperturas históricas. |
| Órdenes abiertas | Conciliado en el corte observado | 61 «Abierta» + 20 «ABIERTA» = 81; no hay otro estado activo observado. El contrato sigue siendo frágil ante estados nuevos. |
| Stock antiguo de Repuestos | Conciliado en universo positivo; corte pendiente | Detalle y consulta independiente: 4.043 códigos y USD 1.128.981,69; gris 653/USD 283.057,02, rojo 3.390/USD 845.924,67. Sigue faltando corte físico acreditado. |
| Concentración del stock antiguo | Consistente internamente | Subtotales conciliados con universo positivo; enlaces aplican el mismo universo. Falta auditoría completa de familias/sucursales contra origen y corte real. |
| Antigüedad de compra por sucursal | Consistente internamente | Promedio ponderado por USD con compra fechada, no edad física local; 896,23 días observados. Falta contraste completo por sucursal y corte. |
| Stock físico de Máquinas | Conciliado para saldo y condición; corte pendiente | Consulta directa de tabla: nuevas 36 filas/saldo 36, usadas 50 filas/saldo 51; total 87. Falta corte real y política desplegada de sección. |

#### Evidencia de auditoría del 20/10/2026

Los valores siguientes son observaciones de la app local autenticada, no constantes de código ni certificación del corte. Sesión autorizada de Administrador; no se cambiaron datos, permisos ni prioridades.

| Tema / contrato | Origen inspeccionado | Ventana / unidad / alcance |
| --- | --- | --- |
| Facturación neta y ventas | `salesStories.ts`; RPC Repuestos/Máquinas consumidas por sus ventas y `campi_ventas_servicios_componentes_v1`, que reutiliza la fuente Servicios | Mes hasta fecha local Asunción contra mismos días año previo, acumulado equivalente; USD, solo secciones `*.ventas` autorizadas; un fallo requerido invalida el consolidado |
| Abastecimiento | `operationalOutcomes.ts`, `20261019160000_campi_operational_outcomes.sql`, `MaquinariaOperaciones.tsx` | Unidades de operaciones activas; excluye cerradas/facturadas/canceladas. Vínculo individual con prioridad stock para evitar doble conteo; `parque.operaciones` |
| Resolución y abiertas | Mismo SQL, `useOperationsModel.ts:canonicalSituacion` | Mediana cierre−apertura de último mes completo; cola abierta y P90 hasta lectura; días/conteos, `servicios.ordenes`. Histórico sin cierre excluido; no equivale a atraso |
| Stock antiguo, concentración y cambios próximos | `partsExposure.ts`, `20261019150000_campi_parts_exposure.sql`, semáforo origen | REP con stock global positivo, valor USD positivo de ubicaciones con stock; gris+rojo / mismo denominador; top tres familias / valor antiguo; lila336–365 y gris971–1000. `repuestos.analisis` |
| Antigüedad sucursales | `operationsStories.ts:parts`, `repuestos_analisis_valorizado` | Σ días×USD positivo con fecha / ΣUSD con fecha; compra global del código, no compra local. Incluye valor positivo aun si saldo local≤0, a diferencia de exposición |
| Stock físico | `operationsStories.ts:machineStock`, `StockMaquinasTab`, `parque_stock_maquinas` | Σsaldo_actual; nuevas/usadas/otras, conteo físico; `parque.stock` cliente. Paginación completa y count verificados; corte no acreditado |

Observaciones de pantalla:
- Facturación de octubre hasta 20/10: ventas USD 220.494,48 − NC USD 212.403,40 = neto USD 8.091,08. Por área: Repuestos 114.768,32; Servicios 33.323,06; Máquinas −140.000,30.
- Origen Repuestos, rango visible 01–20/10: ventas 187.171, NC −72.403 y neto 114.768 (redondeados por la sección). Servicios y Máquinas, filas de octubre de sus reportes hasta 20/10: netos 33.323 y −140.000. Coincidencia a precisión visible, no conciliación de centavos/histórico completo.
- Stock antiguo observado USD 1.128.981,69 = rojo845.924,67 + gris283.057,02; participación23,91%. Concentración top3: (211.392,94 + 198.605,99 + 107.370,06) / 1.128.981,69 =45,83%.
- Cambios próximos: USD 10.364,73 =6.247,89 rojo +4.116,84 gris. No se certificó cobertura monetaria de todos los códigos.
- Antigüedad ponderada896,23 días; sucursales: Santa Rita1062,42, Misiones752,88, Campo9 693,54, Katuete948,90, Loma Plata769,57, Santa Rosa500,44. Los redondeos de promedios fuente impiden afirmar precisión de días individual.

Correcciones verificadas por pruebas:
- Avisos conservan códigos aun con valor positivo cero y explican la ausencia de valorización positiva.
- «Valor sin fecha de compra» se renombra «Valor en categoría Sin datos»: el SQL usa color SIN_DATOS, que no cubre todos los códigos sin compra fechada.
- Exposición rechaza sumas antiguas de familias/sucursales que no concilian o exceden su total; fecha calendario inválida también se rechaza.
- Errores de fechas en abiertas no inutilizan la mediana válida de cerradas, ni viceversa; la edad auxiliar inválida se muestra ausente.
- Portada de neto muestra ventas y NC como componentes, sin descontar NC dos veces.

Pendientes de evidencia/corrección, no cerrados:
- **E1-P1:** evaluar un contrato de estado abierto que soporte nuevos estados activos. En el corte observado no hay discrepancia; no se modificó SQL desplegado.
- **E1-P2:** universo positivo, gris/rojo y enlaces de exposición ya concilian. Falta auditoría exhaustiva por familia y sucursal y corte físico acreditado.
- **E1-P3:** `visitKey` diario en abastecimiento/abiertas/exposición/alertas/concentración impide comparar días distintos. Definir comparación de lecturas y envejecimiento, conservando controles de alcance.
- **E1-P4:** falta corte de inventario y garantía de completitud histórica trianual. Fecha de lectura/clasificación no lo sustituye.
- **E1-P5:** política local SELECT de stock máquinas encontrada verifica módulo Parque, no sección Stock. Falta contrastar políticas realmente desplegadas con cuenta limitada; no se afirma aislamiento de servidor verificado.
- **E1-P6:** faltan contraste exacto de centavos y períodos anteriores y recomputación de medianas/cohortes desde filas de origen.

### Etapa 2 · Renovar detalles laterales

- [x] **E2.1** Examinar panel nativo de Operaciones y reutilizar componentes, tipografía, espaciados y jerarquía. Referencia `MaquinariaOperaciones.tsx`, ResponsiveDrawer y Tabs existentes.
- [ ] **E2.2** Mostrar encabezado con tema/período/alcance, principal y comparación; secundarios solo si aportan algo distinto.
- [ ] **E2.3** Elegir gráfico/desglose específico y tabla compacta únicamente para identificar casos útiles.
- [x] **E2.4** Retirar de la vista habitual fuentes técnicas, tablas/RPC, metodología, textos genéricos y cifras repetidas. Trazabilidad conservada en objetos de historia; se omitieron conclusiones repetidas y métricas redundantes.
- [ ] **E2.5** Conservar trazabilidad interna y limitaciones materiales breves visibles, como «cálculo parcial» y «corte por confirmar».
- [ ] **E2.6** Verificar todos los detalles en pantalla, teclado, cierre y retorno de foco; entender y explorar sin leer un informe.

### Etapa 3 · Inventariar y ampliar con respaldo

- [x] **E3.1** Inventariar indicadores existentes y clasificar cada candidato: reutilizable, pendiente de conciliación o pendiente de datos/definición. Inventario de código del 20/10 arriba; no equivale a habilitación ni conciliación productiva.
- [ ] **E3.2** Servicios: productividad, eficiencia, rendimiento, cumplimiento, carga/capacidad, resolución y edad de OS.
- [ ] **E3.3** Clientes: cobertura por clientes del parque en Servicios/Repuestos; activos, nuevos, recurrentes, retenidos, reactivados e inactivos.
- [ ] **E3.4** Parque instalado: evolución, altas, bajas, crecimiento neto y composición respaldada; separado del stock para venta.
- [ ] **E3.5** Abastecimiento: compras pendientes, pedidos y proyección por modelo solo con stock/ingresos/compras/reservas conciliados.
- [ ] **E3.6** Validar horas y universos: productividad = trabajadas/disponibles; eficiencia = facturadas/trabajadas; rendimiento = facturadas/disponibles. No multiplicar indicadores actuales con poblaciones incompatibles.
- [ ] **E3.7** Mantener incidencias/exclusiones; distinguir programación futura de incumplimiento y cobertura por cliente de cobertura por máquina.
- [ ] **E3.8** Definir ventanas/cohortes para retención y reactivación; exigir eventos fechados para crecimiento del parque.
- [ ] **E3.9** Evitar doble conteo de compras ingresadas/reservas; documentar exactamente la evidencia faltante por candidato.
- [ ] **E3.10** Integrar solo candidatos validados usando el registro de E4; no llenar una cuota con duplicados u opciones vacías.

### Etapa 4 · Registro común ampliable

- [x] **E4.1** Definir contrato: identificador, módulo, nombre/pregunta, permisos/alcance, cálculo/unidad/período/comparación. Catálogo tipado enlazado a `panoramaTopicContracts.ts`; prueba de cobertura de los diez identificadores.
- [ ] **E4.2** Incluir presentación portada/detalle, estados vacíos/error/limitaciones, comentarios respaldados, pruebas y criterio de habilitación.
- [ ] **E4.3** Centralizar el registro para alimentar selector, portada, detalle y Campi; eliminar listas sectoriales y reglas dispersas.
- [ ] **E4.4** Comprobar incorporación de un tema validado sin rehacer Panorama ni cambiar prioridades persistidas; conservar máximo cuatro.
- [ ] **E4.5** Documentar revisión de aportes a Panorama como parte del desarrollo de nuevos módulos; sin prometer descubrimiento automático.

### Etapa 5 · Movimiento y expresividad

- [x] **E5.1** Reproducir conflicto de transformaciones entre los tres CSS y separar encaje/escala del movimiento; verificar que `scale(1.08)` no anule pasos/inclinaciones. Escala en capa independiente; movimientos observados en captura real.
- [ ] **E5.2** Recuperar desplazamientos y duración propios de cada gesto.
- [ ] **E5.3** Crear secuencias con preparación, movimiento, pausa y regreso; variar apoyo, cabeza, mirada y brazos.
- [ ] **E5.4** Coordinar expresión y gesto con evidencia/comentario/interacción; identificar recursos visuales faltantes.
- [ ] **E5.5** Verificar base estable, pausas naturales, lectura sin distracción, movimiento reducido y pestaña oculta.
- [x] **E5.6** Observar personaje real durante dos minutos a tamaño normal sin clics: posturas distintas, reacciones comprensibles, sin tapar controles. Captura real de 133 segundos a 1366×768.

### Etapa 6 · Comentarios y primera experiencia

- [x] **E6.1** Revalidar ciclo completo con retorno al primero, sin repetición consecutiva ni monopolio de un tema. Cuatro comentarios en captura real y regresión automatizada.
- [ ] **E6.2** Corregir pausas por mouse/foco residual y reanudación al cerrar detalles/volver de pestaña, sin ráfaga de cambios acumulados.
- [ ] **E6.3** Actualizar comentarios ante cambios de datos/período/selección/permisos; mantener texto, gesto y evidencia coherentes.
- [ ] **E6.4** Probar primera experiencia con cuenta nueva autorizada; no borrar preferencias ni inferirla desde cuenta configurada. **Bloqueado:** usuario confirmó el 20/10 que no dispone de cuentas de prueba; no reemplazar esta evidencia con mocks.
- [ ] **E6.5** Verificar presentación breve, selección, orden, reemplazo, abandono, error de guardado y regreso; completar solo tras guardar.
- [ ] **E6.6** Verificar «Ver mi Panorama», continuidad de Campi y edición posterior rápida sin repetir bienvenida.

### Etapa 7 · Validación final y entrega

- [ ] **E7.1** Probar cuentas autorizadas limitadas y de varias áreas; cubrir consultas, comentarios, respuestas, detalles y resultados reutilizados. **Bloqueado en cuentas reales:** no hay cuentas de prueba disponibles, confirmado por usuario; pruebas aisladas siguen separadas.
- [ ] **E7.2** Revalidar 7/17 y envío por botón/Enter sin cerrar conversación.
- [ ] **E7.3** Verificar todos los temas habilitados contra origen y corte en versión final.
- [ ] **E7.4** Añadir pruebas de navegador con personaje real; una simulación del avatar no acredita movimiento.
- [ ] **E7.5** Revisar 1366×768 y 1440×900 al 100%, teclado, foco y movimiento reducido.
- [ ] **E7.6** Ejecutar pruebas técnicas del proyecto sobre versión final y clasificar aprobadas/fallidas/bloqueadas/no realizadas.
- [ ] **E7.7** Entregar matriz, capturas de bienvenida/selector/portada/detalles y video real de movimiento/rotación solicitado por este plan definitivo.
- [ ] **E7.8** Entregar rama, commit, pendientes concretos y paso de publicación a cargo del usuario.

### Registro de ejecución

| Fecha | Tarea | Resultado y evidencia | Pendiente |
| --- | --- | --- | --- |
| 20/10/2026 | Preparación del seguimiento | Plan leído; rama `feat/campi-panorama-alternativa` y base `c2dd297` comprobadas; árbol limpio antes de editar este documento | Iniciar E1; ninguna etapa nueva se declara terminada |
| 20/10/2026 | E1 auditoría | Diez contratos examinados y temas leídos en app; contraste mensual visible de tres áreas. Correcciones y límites consignados arriba | E1-P1 a E1-P6; no marcar etapa conciliada |
| 20/10/2026 | E2 implementación | Encabezado visible, métricas secundarias reducidas, desglose tabulado y grupos en pestañas; facturación con ventas/NC/neto por área; sin metodología técnica en vista habitual | Completar recorrido de los demás detalles en ambas resoluciones |
| 20/10/2026 | E1.3 · OS de origen | Consulta de solo lectura: estados 61+20 abiertas, 66/84 cierres agosto/septiembre, 0 fechas inválidas, medianas 16,5/14. Coincide con Panorama; ningún dato modificado | Corte de actualización, reaperturas y nuevos estados activos siguen sin acreditarse |
| 20/10/2026 | E4 · registro común parcial | Título, pregunta y versión de comparación pasan al catálogo tipado; selector, loaders, fallback de portada y referencia entre visitas lo consumen. 53 pruebas focalizadas, TypeScript, lint afectado y build aprobados | E4.2–E4.5 siguen abiertos: presentación completa, comentarios/detalles y alta de un tema validado |

Validación del avance anterior (`b483ecd`; la actualización posterior consta arriba):
- **Aprobadas:** 152 pruebas Campi/contratos en 20 archivos; TypeScript; lint de implementación modificada; build Vite; `git diff --check`. Advertencias preexistentes de Browserslist y tamaño de chunks, sin fallo de build.
- **Pantalla aprobada dentro de este alcance:** portada con cuatro prioridades a 1366×768 y 1440×900; detalle de facturación a 1366 y de resolución a 1440; cierre devuelve foco. Dimensiones efectivas comprobadas en navegador, sin desbordamiento horizontal de portada (scrollWidth1440 para viewport1440). No se alteraron prioridades guardadas.
- **Fallidas pendientes:** ninguna prueba automatizada ejecutada quedó fallando. Esto no elimina los errores de contrato E1-P1/E1-P2.
- **No realizadas:** conciliación histórica completa; recomputación de OS desde filas; cuentas nuevas/limitadas; políticas desplegadas; todos los detalles en ambas resoluciones; movimiento reducido y recorrido integral del plan; video de etapa final.
- **Sin evidencia disponible en esta revisión:** corte real de inventario y completitud del histórico. No se ejecutaron migraciones ni se modificó la base.
- Capturas finales: `auditoria-panorama-1366.png`, `auditoria-facturacion-desktop-1366.png`, `auditoria-panorama-1440.png`, `auditoria-resolucion-desktop-1440.png`, en la carpeta de visualizaciones de esta conversación. Las capturas previas con sufijo `-1366` sin `desktop` se tomaron en la vista estrecha original y **no** acreditan escritorio.

## Antecedente — estado registrado antes del plan definitivo

Esta sección prevalece sobre las descripciones históricas que siguen. Panorama continúa en `feat/campi-panorama-alternativa`; no se integra a `main` ni se publica en Lovable. La portada conserva cuatro prioridades ordenadas en una grilla 2×2. Muestra título, indicador, comparación cuando existe y gráfico compacto; las conclusiones, el alcance, el corte y el método están en el panel lateral estándar. Las cifras en dólares se presentan con `$`. La referencia de última visita permanece por usuario y navegador y exige la misma definición y alcance.

El catálogo ofrece diez temas habilitados por permisos y datos verificables. Ventas y Facturación neta son transversales; un usuario con solo Servicios y permiso de ventas puede elegir ambos, y con permiso de OS agrega Resolución y OS abiertas. Un usuario con solo Máquinas puede elegir Ventas, Facturación neta, Stock físico y Pedidos activos si posee las tres secciones. Repuestos dispone además de cuatro lecturas de Análisis. No se muestran compras pendientes de Repuestos, capacidad técnica, proyección ni etapas de importación como nuevas opciones: sus cálculos y universos aún necesitan conciliación. El objetivo de unas seis alternativas por cada área sigue **parcial** en Servicios y Máquinas, sin rellenarlo con cifras supuestas.

| Tema | Pregunta y cálculo principal | Fuente y permisos | Comparación y límite |
| --- | --- | --- | --- |
| Evolución de ventas | Ventas positivas antes de NC del mes; acumulado anual y desglose por áreas autorizadas | RPC de ventas de Repuestos, Servicios y Máquinas; `*.ventas` concedidas | Mismo tramo y mismo corte anual del año previo. Si una fuente autorizada falla, falla el consolidado. |
| Facturación neta | Ventas antes de NC menos NC; neto del mes y acumulado | Las mismas tres RPC y permisos | Variación sobre neto; bases cero o negativas no generan porcentaje. Conciliación visible en lateral. |
| Stock antiguo de Repuestos | Valor positivo gris + rojo / valor positivo de ubicaciones con stock | `campi_repuestos_exposicion_v1`; `repuestos.analisis` | Clasificación por compra y ventas históricas; Kardex referencial, sin corte de inventario acreditado. |
| Cambios próximos de clasificación | Valor y códigos a 1–30 días de pasar a gris o rojo | Misma RPC y permiso de Análisis | Condicionado a ausencia de compras y ventas nuevas; no es vencimiento contractual. |
| Concentración del stock antiguo | Valor de las tres mayores familias / valor gris + rojo | Misma RPC y permiso de Análisis | Universo de stock antiguo, no total de inventario; desglose por familia y sucursal. |
| Antigüedad por sucursal | Días desde última compra ponderados por valor positivo con fecha | `repuestos_analisis_valorizado`; `repuestos.analisis` | Sin fecha se excluye e informa cobertura; no se deduce movimiento local. |
| Resolución de OS | Mediana de días apertura→cierre operativo de OS cerradas | `campi_resolucion_os_v1`; `servicios.ordenes` | Dos meses completos; menos días no prueba mejora por sí solo. |
| OS abiertas | Cantidad abierta y percentil 90 de edad desde apertura | Misma RPC y permiso de OS | No se llama atraso sin fecha comprometida; fecha de análisis no acredita cobertura hasta hoy. |
| Stock físico de Máquinas | Saldo físico y composición nueva/usada | `parque_stock_maquinas`; `parque.stock` | Sin corte acreditado ni reservas conciliadas; no equivale a disponibilidad comercial. |
| Pedidos activos de Máquinas | Unidades en operaciones activas y proporción sin vínculo único de abastecimiento | `campi_pedidos_abastecimiento_v1`; `parque.operaciones` | El vínculo es diagnóstico; no equivale a atraso ni entrega pendiente. Sin monto confiable. |

El selector presenta cuatro posiciones, permite búsqueda y filtro por área autorizada, y guarda cambios solo con «Guardar orden». Campi deja de ejecutar un gesto periódico fijo; saluda una vez por usuario en la sesión del navegador y reacciona a selección, orden, guardado, preguntas y clic directo. Las respuestas se limitan a historias seleccionadas y autorizadas; una pregunta reconocida ofrece abrir su respaldo lateral. La base del personaje permanece estable y sin máscara de desvanecimiento inferior.

Pendiente de validación productiva: probar una cuenta limitada a cada área con sus permisos reales, corroborar las cifras de Ventas y OS contra sus fuentes bajo el nuevo catálogo y acreditar los cortes de inventario. Las capturas locales comprueban encaje y comportamiento de frontend, no la integridad de un despliegue público. Los importes mencionados más abajo corresponden a lecturas históricas y nunca deben fijarse como valores actuales.

### Corrección por etapas del 20/10/2026

| Etapa | Estado verificable | Límite |
| --- | --- | --- |
| 0 · Base | Rama alternativa preservada desde `88a497d`; capturas previas de portada, editor y conversación. | Sin cambios en `main` ni Lovable público. |
| 1 · Confianza | Abastecimiento distingue 17 unidades activas, 7 sin vínculo válido y 41,18 %. La interpretación exige que el desglose concilie con el total. Conversación con cabecera y envío separados; respuesta anterior se descarta si cambia la evidencia o el alcance. | El vínculo no prueba atraso de entrega. |
| 2 · Bienvenida | La primera configuración presenta a Campi y termina en «Ver mi Panorama». La edición recurrente no repite la introducción. El guardado se comprueba antes de entrar; selección parcial y permisos revocados se preservan sin completar temas automáticamente. | Las preferencias siguen en el navegador del usuario. |
| 3 · Comentarios | Un comentario por tema con evidencia, período y acceso al detalle; observaciones de última visita solo con alcance comparable. Avance manual y ciclo automático de 25 s mientras la pantalla está visible. Pausa al leer el bloque, abrir detalle o pregunta, seleccionar texto u ocultar la pestaña. | No hay IA nueva ni causas inferidas. |
| 4 · Campi | Posturas de reposo alternadas, gesto contextual al cambiar comentario y transición tras guardar. Sin movimiento periódico llamativo; se detiene durante detalle y pregunta y respeta movimiento reducido. | Planta y maquinaria siguen fuera de alcance. |
| 5 · Datos | La fecha de lectura no se presenta como corte acreditado del stock; la tarjeta física indica «Corte por confirmar». Se mantienen fuera compras pendientes, capacidad y proyección sin conciliación. | Faltan cuentas reales de una sola área y corte de inventario acreditado. Servicios y Máquinas continúan con cuatro opciones cada uno. |

La verificación local cubrió el caso real de abastecimiento en portada y respuesta con Enter, el editor sin alterar las preferencias guardadas y la grilla completa a 1366×768 y 1440×900. Las pruebas automatizadas cubren rotación, pausas, guardado fallido, permisos simulados, falta de datos y el caso 7/17. La publicación y validación con usuarios limitados quedan pendientes.

| Candidato no habilitado | Conciliación requerida antes de ofrecerlo |
| --- | --- |
| Compras pendientes de Repuestos | Pedido, recibido, cancelado y pendiente por la misma unidad y corte; evitar sumar partidas ya recibidas. |
| Agenda y capacidad técnica | Horas disponibles netas de vacaciones, jornadas solapadas y trabajo programado, con identidad de técnico y período. |
| Saldo proyectado de Máquinas | Stock físico, compras, ingresos, reservas y pedidos conciliados por unidad/modelo, sin contar dos veces un arribo. |
| Etapas de importación | Universo limitado a unidades vinculadas a pedidos; no presentarlo como cobertura de todas las importaciones. |

## Registro histórico anterior

## Comparación de versiones

- Base preservada: `feat/campi-panorama`, commit `3337f6db44d1851559e47a8f9cbc54595d0de6de`.
- Alternativa: `feat/campi-panorama-alternativa`. La ruta sigue siendo `/panorama`; se compara cambiando de rama, sin tocar `main`.
- No publicación Lovable ni ejecución de SQL. La publicación pública corresponde al usuario.
- Preferencias y referencia de visita usan claves de navegador independientes de la versión original.

## Experiencia

Los cuatro temas elegidos se presentan juntos en una cuadrícula 2×2 de escritorio. Cada tarjeta muestra título, período, cifra principal, valor anterior y porcentaje cuando existe una comparación verificable, además de un gráfico pequeño. Alcance, método y desglose quedan en el detalle modal. Si se eligen más de cuatro, se conservan todos en orden y se advierte que habrá filas adicionales; no se recorta la selección silenciosamente. Facturación es un consolidado de Repuestos, Servicios y Máquinas según permisos, con desglose dentro del detalle. Campi prioriza hechos acreditados dentro de los temas elegidos.

La bienvenida/editor permite regresar sin guardar. El avatar del panel reserva espacio para cuerpo y sombra. Los gráficos tienen alternativa textual accesible; el detalle usa Dialog compartido y mantiene los accesos específicos al módulo como profundización opcional.

## Contratos implementados

| Tema | Fuente existente | Grano / cálculo | Permiso |
| --- | --- | --- | --- |
| Facturación | `ventas_repuestos_panorama_filtros_v1`, `campi_ventas_servicios_componentes_v1`, `ventas_maquinas_dashboard_filtros_v2` | Ventas positivas antes de NC de áreas autorizadas como cifra principal; NC y neto separados y conciliados; igual tramo LY y acumulado anual bruto | `repuestos.ventas`, `servicios.ventas`, `parque.ventas`, solo las concedidas |
| Ventas de repuestos | Resumen y períodos de RPC Repuestos | Ventas antes de notas de crédito, notas de crédito firmadas y neto conciliado; comparación de ventas con igual tramo del año anterior | `repuestos.ventas` |
| Antigüedad por sucursal | `repuestos_analisis_valorizado`, agregados completos | Días desde última compra ponderados por USD positivo con fecha; cobertura del valor positivo por sucursal y total | `repuestos.analisis` |
| Situación del stock | Mismo agregado valorizado | Colores, códigos y valor; no se infiere rotación ni ausencia de movimiento por falta de vínculo | `repuestos.analisis` |
| Pedidos de máquinas pendientes | `maquinaria_pedidos_lineas_estado_actual`, unidades, `maquinaria_unidades_facturadas_confirmadas` | Unidades sin facturación según contrato Operaciones, excluye canceladas, contempla historia y conciliación por chasis; distinto de entrega pendiente | `parque.operaciones` |
| Stock físico máquinas | `parque_stock_maquinas` | Suma `saldo_actual`, nuevas/usadas/otra condición y sucursales; no equivale a libre disponibilidad comercial | `parque.stock` |
| Proyección máquinas nuevas | `parque_stock_proyectado_v1` | Stock calculado + compras pendientes − ventas pendientes, apertura informada; valida ecuación y fecha del cálculo | `parque.stock_proyectado` |
| OS abiertas | `ordenes_servicio_importadas` | Conteos exactos de estado que contiene Abierta; edad desde apertura. No se deduce estado por factura | `servicios.ordenes` |

## Límites deliberados

- No inventar fecha de actualización. Las fuentes de ventas y fotos no exponen cobertura acreditada: `cutoff=null`; rango solicitado no significa datos completos hasta hoy. Fecha de clasificación del semáforo y fecha de carga del Kardex tampoco prueban corte.
- Moneda de ventas reutiliza el contrato USD de las vistas actuales; no aplica conversión ni verifica individualmente importaciones históricas.
- Facturación consolidada falla completa si falla un área autorizada; nunca presenta un subtotal como total. Clientes funciona independientemente.
- Monto monetario pendiente de máquinas aún NO consolidado: la vista mezcla valor facturado/documental/acordado y fallback de moneda. Se presentan unidades conciliadas. Para monto hacen falta líneas acordadas, cobertura histórica y definición multimoneda explícitas.
- Distribución de repuestos usa el universo del análisis, no un agregado irrestricto de todos los tipos de producto. Exige permiso Análisis aunque el título sea distribución de stock.
- Stock físico pagina todo hasta 5.000 filas; pedidos hasta 2.000 y conciliación en lotes de 200. Si excede, cambia el conteo o falta una página, hay error explícito; nunca suma parcialmente.
- Lecturas de OS son conteos independientes, no snapshot transaccional. No etiqueta pausas como incumplidas ni inventa fechas prometidas.
- Primera versión habilita ocho temas con fuente, en lugar de trece accesos de los cuales diez no tenían síntesis. Agenda/capacidad, importaciones, comisiones y reposición requieren contratos propios antes de agregarse.

## Última visita

Referencia opcional local por usuario y navegador, independiente de la migración de visitas de la otra rama. Compara solo valor/unidad, definición, período y alcance idénticos. Se guarda cuando todos los temas respondieron sin error, incluyendo cero válido. Cambios de permisos, mes o definición no se interpretan como crecimiento. Texto: cambio del total visible; no atribuye facturas nuevas ni causas. No es evidencia contable ni historial central sincronizado.

## Rendimiento y seguridad

Ventas comparte respuesta entre facturación/repuestos y limita a dos llamadas simultáneas. Facturación reutiliza los meses completos de Repuestos y Servicios; solo consulta tramos mensuales adicionales de Máquinas, cuya RPC separa ventas y NC únicamente en su resumen. Repuestos comparte una consulta valorizada entre sus dos temas. Se conservan errores y reintento, nunca dato ausente convertido en cero. Permisos de frontend se comprueban antes de consultar y antes de renderizar; las políticas/RPC del servidor deben validarse en entorno autorizado antes de integración productiva.

## Validación

- 94 pruebas Campi aprobadas en la primera ejecución integrada; verificar registro final al entregar.
- Build Vite correcto.
- Typecheck ES2021 correcto. Typecheck con lib ES2020 del repositorio tiene un fallo preexistente en `src/test/totvsBillingSnapshotVersions.test.ts:96` por `replaceAll`, fuera de este cambio.
- Revisión independiente detectó y se corrigieron permiso del tema sucursales y guardado de referencia con ceros válidos.
- Sin consultas de producción, sin SQL remoto y sin validación de importes actuales.
- Validación visual real pendiente: Chromium no pudo iniciar por restricciones del entorno. No se acredita screenshot ni pruebas físicas de tamaño. La captura sintética intentada no se generó.

## Corrección de densidad — 16/10/2026

Se retira la presentación extensa por tema de la pantalla inicial. El objetivo de diseño es cuatro temas legibles juntos en escritorio 1440×900, con gráfico de 96 px, tarjetas 2×2 y Campi en franja de 72 px. En teléfono se apilan sin perder temas. Barras con más de cuatro categorías muestran cuatro y avisan cuántas quedan en el detalle; el modal conserva todas.

Variación porcentual = (actual − anterior) / anterior × 100 únicamente para comparaciones emparejadas por el loader y base anterior positiva. Base cero, negativa, ausente o no finita no genera porcentaje. OS antiguas/abiertas, nuevas/stock físico y valor rojo/total Kardex se pueden mostrar como composición explícitamente etiquetada, nunca como evolución. Sin base válida se informa la ausencia. No cambian RPC, cálculos fuente ni los permisos del consolidado de las tres áreas.

Pruebas incorporadas: `storySummary.test.ts`, `StoryPanel.test.tsx`, y actualización del contrato visual en `PanoramaDashboard.test.tsx`. Incluyen porcentajes, cero/ausencia, detalle/reapertura, errores/reintento, cuatro y ocho temas, y conservación del alcance autorizado. La validación visual real sigue pendiente por el bloqueo de Chromium del entorno; la estimación de alturas CSS no sustituye una captura o medición de navegador.

## Interpretación determinista y referencia visual

`campiInterpretation.ts` separa relevancia del hecho y orden de prioridades. Selecciona hasta dos hechos basados en comparación válida, antigüedad de OS (>30 días, sin llamarla vencimiento), semáforo rojo acreditado o modelos con saldo proyectado negativo. No se usa `attention` como evidencia por sí sola. Cuando falta contexto, muestra un total neutral. `CampiInterpreter.tsx` ofrece preguntas concretas y respuestas con alcance, período, corte y fuente; texto libre fuera del repertorio recibe un límite explícito. No llama modelos, claves externas ni nuevas consultas. El dashboard entrega únicamente historias seleccionadas y autorizadas, y las respuestas se recalculan desde esas historias.

El hero ahora sigue el boceto: Campi grande a la izquierda, síntesis al centro y preguntas a la derecha; las tarjetas 2×2 son horizontales y mantienen números, colores y gráficos. El detalle continúa en modal. No se agregan otros cambios sin fuente, porcentajes históricos inventados, ni navegación ficticia. Validación visual real pendiente por restricción del navegador del entorno; tests DOM no prueban encaje en 1440×900.

Verificación local de esta revisión: 115 pruebas específicas de Campi y página pasaron, incluido cierre por Escape con restauración de foco, pérdida de permisos y consulta fuera de contexto. Build y lint de archivos modificados pasaron. TypeScript con la configuración existente falla únicamente en `src/test/totvsBillingSnapshotVersions.test.ts:96` por `replaceAll` con lib ES2020; una ejecución diagnóstica con lib ES2021 pasa sin modificar la configuración del proyecto. No se ejecutó la suite global ni QA visual en navegador.

## Primera etapa del encabezado — 19/10/2026

El encabezado prioriza un hallazgo verificable de atención y lo nombra con cantidad, unidad y criterio. Si no hay alerta y existe una referencia comparable de la última visita en ese navegador, presenta el cambio absoluto sin llamarlo mejora. En ambos casos muestra los valores anterior y actual de un tema autorizado cuando coinciden identidad, unidad, fuente, alcance y mes de referencia. Un cambio de permisos, definición o mes no se compara. Con una fuente fallida o sin cifras verificadas, Campi comunica la ausencia y no ofrece preguntas sobre datos inexistentes.

El recuadro usa tonos distintos para atención, cambio observado y ausencia de datos. Campi mantiene la animación de reposo; ante atención usa el gesto de consideración y ante un cambio no calificado usa un paso, sin celebrar un mero aumento. Se revisaron en navegador local los tres estados con datos sintéticos. No se verificaron importes de producción ni la vista dentro de una sesión autenticada. Esta etapa permanece en la rama local `feat/campi-panorama-alternativa`, sin integrar en `main`, sin SQL y sin publicación Lovable.

## Segunda etapa de las tarjetas — 19/10/2026

Las tarjetas de indicadores con comparación válida muestran valor actual, valor del tramo anterior, variación porcentual y dos columnas proporcionadas a esos valores; si el tramo anterior es cero, el cero queda visible sin inventar porcentaje. Las fotos sin comparación temporal muestran solo su indicador y, cuando corresponde, una proporción explícita del mismo corte. Los modelos con saldo negativo se listan con valor firmado en el resumen para evitar barras recortadas. Se retiraron subtítulos bajo los títulos y textos genéricos de «sin base histórica» que confundían a las fotos de stock con series temporales.

El tema por sucursal destaca el valor Kardex de la sucursal principal y conserva el total general solamente en el detalle, para no repetir el mismo KPI de la tarjeta del semáforo. La proyección destaca cuántos modelos tienen saldo negativo; el saldo algebraico total queda en el detalle con su advertencia de que puede compensar faltantes entre modelos. El conteo de `repuestos_clientes` se presenta como identidades en documentos, ya que la RPC incluye notas de crédito e identidad no informada: no se lo llama compradores. No cambian fuentes, filtros, permisos, SQL ni la fórmula de proyección.

## Hallazgos y visita — 19/10/2026

En una sesión autenticada de la rama local se verificaron cuatro temas con respuestas reales: facturación, OS abiertas, semáforo valorizado y proyección de máquinas. El desglose de facturación concilia con el neto mostrado, incluyendo una contribución negativa de Máquinas; no se infiere por ello causa, rentabilidad ni atraso de datos. OS y semáforo presentan razones explícitas, y la proyección sin saldos negativos ahora muestra stock calculado, compras y ventas pendientes, evitando un gráfico de modelos en cero. La captura real permitió corregir un importe Kardex grande que se partía en varias líneas y etiquetas recortadas de mini barras. Las fuentes de OS, stock físico y Kardex sin corte acreditado dicen «Corte no informado», no «Foto vigente». Esta comprobación cubre la app local conectada a fuentes reales con cuatro temas; no acredita el despliegue público ni los otros cuatro temas.

Los hallazgos se ordenan por criterio de atención acreditado, después cambios temporales observados y finalmente cifras neutrales. El orden elegido por el usuario desempata hechos de igual relevancia. Se muestran hasta dos hechos, por lo que dos alertas reales ya no son desplazadas por un aumento de ventas. Una subida o bajada de facturación se denomina cambio observado; la pregunta «¿Qué mejoró?» no afirma una mejora de negocio sin evidencia adicional. La comparación con la última visita exige el mismo tema, alcance, fuente, período y unidad. La referencia anterior se fija durante la sesión del navegador, incluso tras recargar; la siguiente sesión toma como base la última lectura completa guardada. Se versionaron las cifras principales redefinidas de sucursales y proyección, para no compararlas con una referencia guardada bajo el significado anterior. Un primer acceso, un cambio de permisos o una fuente fallida no producen un cambio ficticio.

## Revisión funcional de los ocho temas — 19/10/2026

La revisión autenticada recorrió las ocho tarjetas con datos reales en la rama local. Corrige dos falsos KPI: sucursales ya no destaca la sucursal de mayor valor, sino 894,82 días de antigüedad de última compra ponderados por USD positivo con fecha; la cobertura de ese valor es 98,77 % y cada sucursal conserva su propio promedio. Proyección ya no destaca modelos con saldo negativo: muestra 48 unidades calculadas a partir de 36 de stock desde la apertura + 25 compras pendientes − 13 ventas pendientes. Los componentes permanecen visibles y el detalle conserva la separación por modelo; el total no acredita disponibilidad física ni intercambiabilidad entre modelos. Se versionaron ambos indicadores para no compararlos con visitas guardadas bajo su definición anterior.

El tema de identidades documentales se reemplazó, conservando su clave interna y la preferencia del usuario, por Ventas de repuestos: ventas antes de NC, NC firmadas y neto conciliado. En el corte revisado: USD 182.886,19 − USD 72.403,10 = USD 110.483,09. Su comparación interanual corresponde a ventas antes de NC. La descripción anterior de Facturación como cifra neta fue reemplazada por la decisión posterior de mostrar ventas antes de NC como cifra principal.

Los otros cuatro temas mantienen indicadores verificables: 76 OS abiertas por estado, 15 unidades de pedidos de máquinas sin facturar, 87 de saldo físico de máquinas según su fuente y USD 4.723.942,34 de Kardex referencial de repuestos con distribución por color. Se retiró la alerta automática por OS abiertas hace más de 30 días, saldo negativo de un modelo y mera presencia de valor rojo: sin vencimiento, umbral o contraste válido son contexto del detalle, no incumplimientos. La composición roja y la antigüedad de OS continúan visibles, con sus definiciones. Campi prioriza comparaciones temporales válidas; el orden elegido decide entre hechos de igual rango. Ninguna fuente sin corte acreditado se presenta como foto actual.

La lectura fue funcional y en pantalla local, no prueba publicación en Lovable ni corte productivo completo. Los cuatro temas añadidos para la prueba se quitaron al terminar, restaurando las cuatro prioridades que tenía el usuario. No se ejecutó SQL ni se cambió `main`.

## Facturación antes de NC — 19/10/2026

El neto de octubre observado (USD 2.746,85) conciliaba Repuestos USD 110.483,09 + Servicios USD 32.264,06 − Máquinas USD 140.000,30. La contribución de Máquinas era una sola nota de crédito y ninguna venta positiva. Por decisión del usuario, la cifra principal de Facturación ahora es la suma de ventas positivas antes de NC; NC firmadas y neto quedan separados. La comparación interanual y el acumulado usan el mismo criterio bruto, y el gráfico distribuye ventas brutas por área. Ninguna cifra se muestra si falta un área autorizada o falla la conciliación bruto − NC = neto.

La RPC nueva `campi_ventas_servicios_componentes_v1` toma exactamente los movimientos enriquecidos de Ventas de Servicios, separa importes positivos y negativos, conserva el total, detecta NC con signo positivo y exige `servicios.ventas` en el servidor. La migración `20261019120000_campi_service_billing_components.sql` se ejecutó con autorización en Lovable Cloud; el editor devolvió «Query succeeded». En la rama local autenticada, el detalle mostró USD 215.150,25 antes de NC = Repuestos USD 182.886,19 + Servicios USD 32.264,06 + Máquinas USD 0; NC USD −212.403,40 y neto USD 2.746,85. El período fue 01–19/10/2026. No se cambió `main` ni se publicaron estas modificaciones de frontend.

## Criterios de hallazgos — 19/10/2026

Campi presenta como cambio únicamente una comparación emparejada por la fuente y con base anterior positiva. Facturación y Ventas de repuestos comparan ventas antes de NC; un aumento no se denomina mejora y una caída no se declara incumplimiento. Entre cambios comparables prevalece el orden de temas elegido por el usuario, no el mayor porcentaje. Para Facturación, si las áreas del gráfico concilian con ambos totales, Campi menciona la mayor diferencia aritmética entre áreas; si no concilian, no atribuye el cambio a ninguna. En la lectura real del 01–19/10, el tramo anterior incluye USD 389.500 de Máquinas frente a USD 0 en el actual, un contexto necesario para el −72,9 % consolidado.

Los otros seis temas son fotos, composiciones o proyecciones sin comparación temporal o compromiso verificado; no se presentan como alertas automáticas. Rojo del semáforo, OS con más de 30 días y saldo proyectado negativo permanecen en el detalle sin inferir vencimiento, necesidad de compra o disponibilidad física. «¿Qué merece atención?» explica que estos temas no contienen meta, fecha comprometida ni umbral validado para declarar una alerta. Si hay una referencia comparable desde la última visita, encabezado, alcance y acción se refieren al mismo tema. Estas reglas fueron verificadas en la app local autenticada; los cambios permanecen en la rama alternativa.

En Pedidos de máquinas, `np_fecha` es fecha de registro y `eta` estima el arribo de una importación; la vista operativa no contiene una fecha prometida al cliente. Por ello Campi no debe declarar atrasos de entrega. El desglose ahora agrupa las unidades pendientes por NP y abre cada operación mediante el enlace que ya admite Operaciones. En Servicios, `trabajos.fecha_compromiso` se rellena con la fecha de la última jornada y tampoco acredita un plazo contractual; las OS importadas no exponen una fecha prometida. Se requiere una fuente de compromiso explícito y confiable antes de activar alertas por atraso.

## Propuesta de KPIs para Panorama — 19/10/2026; pendiente de decisión

Esta propuesta define primero la decisión de negocio y el indicador, antes de buscar datos nuevos o alterar tarjetas. Un tema elegido no exige un KPI propio: puede aportar un desglose o una condición de calidad a otro. El orden de temas elegido por el usuario ordena la lectura; Campi destaca hasta tres hechos distintos y autorizados, sin duplicar un consolidado y su componente. Meta, umbral de alerta y juicio de «mejora» quedan pendientes de acuerdo de negocio y línea base; una variación observada no los sustituye.

| Decisión | KPI candidato y fórmula | Diagnóstico y resguardo | Estado |
| --- | --- | --- | --- |
| ¿Cómo evolucionan las ventas? | Ventas positivas antes de NC del mes, USD, frente al mismo tramo del año anterior; vista anual con cortes equivalentes. | NC firmadas y neto por separado; desglose por área autorizada. Si se eligen Facturación y Ventas de repuestos, Repuestos es profundización, no otro hallazgo con la misma contribución. El cociente NC/ventas sirve como resguardo, no como tasa de devoluciones de la misma cohorte. | Definición y cálculo existentes; falta acordar metas. |
| ¿Qué valor de repuestos exige revisión? | Participación del valor positivo de ubicaciones con stock físico positivo en gris + rojo sobre el valor positivo de todas las ubicaciones con stock físico positivo y valorizadas del mismo corte. Gris/rojo = sin ventas en los tres años evaluados y última compra hace más de 365 días. | Mostrar USD del numerador, composición por color, familia y sucursal, y valor sin fecha comprobada por separado. Conservar el color promedio de sucursal como contexto, no como KPI. No calcular el cociente a partir de agregados firmados que compensen posiciones negativas ni posiciones sin stock. | Grano y cobertura verificados en lectura de la base el 19/10/2026; falta lectura agregada protegida e integración. El Kardex es referencial, no valor contable actual. |
| ¿Qué pedidos de máquinas requieren asignar abastecimiento? | Porcentaje y cantidad de unidades de pedidos vigentes aún no entregadas **sin un vínculo único y válido** con una unidad de stock o importación, sobre todas las unidades vigentes aún no entregadas con estado de entrega comprobado. Menor es mejor, sin meta fijada todavía. | Desglosar vínculos a stock físico, importación arribada, importación en tránsito y sin vínculo; ninguno de los dos últimos estados se presenta como disponibilidad inmediata. El saldo proyectado y las existencias son contexto por modelo, no cobertura de una NP. | Contrato por diseñar: «sin facturar» no prueba «sin entregar». Si no se puede acreditar el estado de entrega o la unicidad del vínculo, no publicar un porcentaje parcial. |
| ¿Con qué rapidez se resuelven las OS? | Mediana de días calendario entre apertura y **cierre operativo** de las OS cerradas en el período, comparada con un período completo equivalente. Menor duración no equivale por sí sola a mejor servicio. | Cantidad cerrada, cantidad abierta y percentil 90 de días abiertas al mismo corte; separar tipo de trabajo, fechas faltantes y reaperturas. El extremo abierto impide que cerrar solo casos fáciles mejore artificialmente la lectura. | Definición propuesta; no reutilizar «días de cierre» de Órdenes, que hoy mide apertura→factura. Sin compromiso de entrega no existe KPI «en plazo». |

Reglas comunes: cada KPI lleva universo, unidad, período y fecha de corte acreditada; una fuente incompleta produce estado no verificable y nunca cero. Las comparaciones usan el mismo alcance y definición, y el contraste con la última visita informa un cambio observado, no una mejora. Un hallazgo accionable identifica el segmento y abre el detalle filtrado o el registro; las alertas requieren compromiso o umbral acordado, magnitud y responsable. Las prioridades no amplían permisos y el panel variable puede mostrar diagnósticos de temas seleccionados sin presentarlos como KPI principales.

Secuencia propuesta: acordar estos cuatro resultados y sus exclusiones; luego auditar la capacidad de las fuentes para calcular cada numerador y denominador sin doble conteo; finalmente ajustar tarjetas, preguntas de Campi y enlaces. No se modifica la interfaz ni se consultan fuentes nuevas por esta propuesta.

### Repuestos: exposición y transición de color

Se adopta como criterio propuesto para el KPI el **valor USD positivo de ubicaciones con stock físico positivo** de códigos en gris o rojo, y su participación sobre el valor USD positivo de ubicaciones con stock físico positivo valorizadas del mismo universo y corte. El semáforo histórico decide esos colores con ausencia de ventas en los tres años calendario evaluados y última compra comprobada: gris = 366–1.000 días; rojo = desde 1.001 días. Mostrar importe y porcentaje juntos, más desglose por color, familia y sucursal. Un código presente en varias sucursales cuenta una sola vez como código, aunque sus posiciones USD se suman por ubicación. Ubicaciones sin stock físico, valores faltantes y valores no positivos se informan aparte; nunca se convierten en cero ni se compensan en el cociente. La fecha de clasificación no se presenta como fecha de corte del inventario.

Campi mostrará un aviso preventivo dentro del tema autorizado cuando, **si no hay nuevas ventas ni compras**, un código actualmente lila esté a 1–30 días de pasar a gris o uno actualmente gris esté a 1–30 días de pasar a rojo. Con los límites actuales, son edades de última compra de 336–365 y 971–1.000 días, respectivamente; días restantes = 366 o 1.001 menos la edad. El horizonte inicial recomendado es 30 días, pendiente de ajuste de negocio. El aviso reúne valor USD positivo expuesto y cantidad de códigos distintos para cada transición; prioriza la transición a rojo y no confunde proyección de color con atraso contractual. Códigos sin compra fechada, sin stock positivo o con ventas que los clasifiquen en verde/amarillo/naranja no entran. Una compra o venta nueva, un cambio de cobertura histórica o un cambio de año exige recalcular, no conservar el aviso anterior. No hay notificación externa ni recordatorio repetido: se muestra al abrir Panorama y abre el listado filtrado correspondiente.

El RPC actual entrega la clasificación completa y una página de filas, pero no un agregado único de **valor positivo por color y cercanía al umbral**. Sus importes `por_color` son sumas firmadas y no sirven para el cociente propuesto. Antes de implementarlo, preparar una lectura agregada protegida por `repuestos.analisis`, con numerador, denominador, cobertura, cohortes preventivas y fecha/cobertura de cada fuente; comprobar conciliación y acceso por permiso. El destino de Análisis hoy admite enlace directo solamente al filtro rojo: habrá que incorporar gris y los rangos de días para que el aviso abra exactamente los artículos implicados. Esta definición no implica que el dato esté ya disponible en la interfaz.

Lectura de solo lectura en Lovable Cloud el 19/10/2026: 10.027 códigos y 18.237 ubicaciones con stock positivo. El valor referencial positivo de esas ubicaciones fue USD 4.723.784,23; gris + rojo sumaron USD 1.129.028,87, es decir 23,90 % del valor positivo valorizado. A 1–30 días del gris hubo 11 códigos y USD 4.116,84; a 1–30 días del rojo, 29 códigos y USD 7.154,11. Existía además USD 158,64 positivo del Kardex en posiciones sin stock físico: debe excluirse del KPI. Entre las ubicaciones con stock hubo una sin valor, dos con valor no positivo, una sin saldo Kardex y una con saldo distinto al stock (USD 322,35 de valor positivo); estos controles se exponen como cobertura y conciliación, no se ocultan dentro del porcentaje. Las marcas `kardex_cargado_en` observadas fueron del 01/10 al 19/10/2026: son horas de carga, no una fecha de corte de inventario acreditada. Las cifras son diagnóstico de ese día y no quedan fijadas para el panel. No se importaron archivos ni se modificaron datos.

Implementación local posterior: el usuario descartó el promedio de antigüedad por sucursal como tarjeta y pidió «Stock antiguo» con USD y porcentaje. Se retiran del catálogo «Antigüedad por sucursal» y «Ventas y notas de crédito de repuestos», porque esta última duplica Facturación; las preferencias existentes migran a `repuestos_stock` y `ventas_facturacion` respectivamente. Quedan seis temas seleccionables y el detalle de Facturación conserva el componente Repuestos según permisos. `campi_repuestos_exposicion_v1` agrega valor positivo con controles de cobertura, desglose por color/sucursal/familia y dos cohortes preventivas. El cliente comprueba conciliación antes de mostrar la cifra y abre Análisis en Detalle con filtros exactos para los avisos. La función de lectura se aplicó en Lovable Cloud el 19/10/2026 (`Query succeeded`); no modifica filas comerciales. La app local autenticada mostró USD 1.129.028,87 y 23,9 % sobre USD 4.723.784,23, con avisos de 11 códigos/ USD 4.116,84 próximos a gris y 29 códigos/ USD 7.154,11 próximos a rojo. El enlace a rojo abrió 29 registros con USD 7.154,11. La tarjeta enseña rojo y gris por separado; el desglose completo queda en el detalle. Esta versión continúa fuera de `main` y no acredita la publicación pública de Lovable.

### Máquinas: pedidos sin abastecimiento identificado

La decisión es qué unidades de pedidos de clientes aún pendientes de entrega necesitan una asignación concreta de abastecimiento. El KPI propuesto es `100 × unidades sin vínculo válido / unidades vigentes pendientes de entrega`, acompañado por ambas cantidades. El universo excluye canceladas y entregadas; pedidos con entrega desconocida se informan aparte y bloquean un porcentaje global presentado como completo. El estado de facturación no define la entrega. Un pedido histórico puede estar entregado aunque siga sin factura, de modo que el conteo actual de pendientes de facturar no es el denominador.

Cuenta como vínculo válido una asignación única de la unidad solicitada a una unidad de stock o de importación identificada, vigente y no usada para cubrir otro pedido. Puede existir sin chasis si la identidad operativa de la unidad y la relación con la línea están verificadas; coincidir solo en marca/modelo, sumar saldos entre modelos o tener una ETA no constituye asignación. El desglose distingue stock físicamente asignado, importación con arribo real, importación en tránsito, vínculo inválido/conflictivo y sin vínculo. Un vínculo en tránsito no equivale a disponibilidad inmediata ni a entrega cumplida. Los conflictos y datos faltantes no se cuentan silenciosamente como cobertura.

Campi puede decir «X unidades de pedidos requieren asignación de abastecimiento» y abrir las NP afectadas, siempre con el corte y la cobertura de entrega/vínculos. No debe llamar «atrasadas» a esas unidades: no existe fecha prometida al cliente. No se estima un monto USD a partir del valor de venta de la vista operativa, que mezcla valores de unidad y documento histórico. Una variación entre fotos con entradas/salidas de pedidos no demuestra mejora; para evaluar gestión hará falta seguir una cohorte comparable o acordar una meta. El cálculo debe realizarse del lado servidor, con permiso `parque.operaciones` y comprobación de unicidad, antes de mostrarlo en Panorama. Stock físico y proyección quedan como diagnóstico del mismo tema, evitando tres tarjetas que aparenten tres resultados independientes.

### Servicios: tiempo de resolución de OS

La decisión es si el servicio está resolviendo sus casos con mayor rapidez sin dejar crecer la cola abierta. KPI candidato: mediana de `fecha_cierre_os − fecha_abierta_os` en días calendario para OS con cierre **operativo** dentro del período elegido, estado cerrado y ambas fechas válidas; cierre el mismo día = 0. Una OS se cuenta una vez con su identidad textual completa, conservando prefijo y ceros. No se sustituye `fecha_cierre_os` por fecha de factura, última jornada ni estado de facturación. Las canceladas y las de estado desconocido se informan aparte. Las cerradas sin par de fechas válido no valen cero: se informa cuántas faltan y no se publica la mediana de una muestra parcial como si cubriera todo el período.

Resguardo inseparable: número de OS abiertas al mismo corte y percentil 90 de su edad desde apertura; fechas de apertura ausentes o futuras se informan aparte. El cierre de casos sencillos puede bajar la mediana mientras envejecen los difíciles, por lo que Campi no califica esa caída como mejora sin leer también la cola abierta. Comparar períodos completos de igual duración y alcance; segmentar por tipo de trabajo, sucursal o responsable cuando el volumen permita una lectura útil. Las reaperturas deben definirse como ciclos separados solo si existe historial de cambios; una foto de estado no reconstruye ciclos anteriores.

Un hallazgo explicará la variación de duración junto con el volumen cerrado y la cola abierta, y enlazará las OS que sustentan la lectura. Una OS abierta antigua es un caso para revisar, no un incumplimiento por antigüedad arbitraria. Para una alerta de «fuera de plazo» haría falta una fecha de compromiso contractual real y su semántica; `trabajos.fecha_compromiso` se rellena actualmente con la última jornada y no sirve. Productividad, eficiencia y rendimiento de técnicos mantienen las fórmulas ya acordadas en `docs/knowledge/26-Ordenes-servicio-y-productividad.md` y no se mezclan con días de cierre ni horas de factura para este KPI. Antes de implementarlo se deberá comprobar identidad, estados, fechas, reaperturas, corte de fuente y permiso `servicios.ordenes`; la sección actual usa «días de cierre» apertura→factura y no debe reciclarse para este indicador.

## Estado vigente de los temas operativos — 19/10/2026

La propuesta anterior quedó parcialmente implementada y esta sección prevalece sobre los estados «pendiente» del texto histórico. `campi_pedidos_abastecimiento_v1` y `campi_resolucion_os_v1` son funciones de lectura con permisos de sección, aplicadas en Lovable Cloud y probadas en la rama local autenticada. No cambian pedidos ni OS. Ambas usan la fecha civil de Paraguay; esa fecha de lectura no acredita el corte de las fuentes importadas. El frontend permanece exclusivamente en `feat/campi-panorama-alternativa`.

**Máquinas.** El indicador actual cubre *unidades de operaciones activas* por su estado operativo, no todas las entregas pendientes. Excluye operaciones cerradas, facturadas y canceladas porque aún no existe una fuente única de entrega por unidad para ese universo. Mide la proporción sin vínculo único con stock positivo o importación activa por identidad de unidad, separando sin vínculo, conflicto y sin unidad. La prueba real dio 7 de 17 (41,18 %) sin vínculo; seis con stock identificado, tres con importación arribada y una en tránsito. Abre las NP afectadas. Esta cifra no demuestra incumplimiento ni falta de disponibilidad inmediata, y **no sustituye** el KPI propuesto de pedidos pendientes de entrega hasta acreditar su estado. Stock físico y saldo proyectado siguen como diagnósticos separados, no se suman al indicador de vínculo.

**Servicios.** La mediana usa fechas operativas de apertura y cierre de OS cerradas en el último mes calendario transcurrido. En la lectura real hubo 84 cierres en septiembre de 2026 con mediana 14 días, frente a 66 cierres en agosto con mediana 16,5 días; los enlaces abrieron las 84 OS de septiembre y las 76 abiertas. Hay 1.301 cerradas históricas sin fecha de cierre: quedan fuera de la mediana y se informan aparte. El percentil 90 de edad de las abiertas fue 123 días. No se afirma mejora ni atraso contractual por estos valores. Falta acreditar completitud del corte importado y ciclos de reapertura; el panel declara estos límites.

Los seis temas seleccionables se verificaron en la app local con el perfil administrador: Facturación USD 215.150,25 antes de NC al 19/10; Stock antiguo USD 1.129.028,87 (23,9 %); Stock físico 87 unidades; Proyección 48 unidades calculadas; y los dos resultados anteriores. Facturación es el único consolidado entre áreas y conserva el desglose por permiso. No se publicó en `main` ni en Lovable público. La revisión visual definitiva del diseño de referencia permanece separada de esta comprobación funcional.

**Cierre funcional local.** Se verificó en el navegador que los seis temas pueden seleccionarse juntos y cargan resultados, incluidos el desglose de Facturación, los 7 de 17 pedidos activos sin vínculo único y las 84 OS cerradas en septiembre. Se restablecieron las tres prioridades previas del usuario después de la prueba. Durante la consulta se muestran tarjetas con el nombre de cada tema sin un cero provisional; al terminar, el panel sustituye esas tarjetas por resultados o errores explícitos. La fecha de análisis del cliente usa el día civil de Paraguay. La tarjeta de Servicios enseña 84 cierres y 76 OS abiertas junto a la mediana. Las variaciones porcentuales tienen tono neutral porque subir o bajar no prueba por sí solo una mejora. Si la foto física contiene una sola sucursal, su mini gráfico separa nuevas y usadas; el desglose por sucursal sigue en el detalle. Continúan sin acreditarse un estado único de entrega por unidad, la fecha de corte completa de ciertas fuentes y los ciclos de reapertura de OS. Estos límites no se convierten en KPI ni se presentan como cero.

## Contrato vigente de Panorama en la rama alternativa — 19/10/2026

**Detalle de Pedidos — ajuste local del 20/10.** El panel lateral estándar presenta tres indicadores compactos (pedidos, unidades y pedidos con stock para facturar), barras de abastecimiento y antigüedad de NP, y la tabla de pedidos con cliente y enlace a la operación. La consulta de la vista operativa se hace solo al abrir el detalle y se rechaza si el total de pedidos o unidades no coincide con el resumen de los RPC. No se muestra un supuesto valor pendiente desde `valor_venta` por su mezcla de importes de unidad y documento histórico. La referencia visual adjunta al pedido es una guía de disposición, no fuente de cifras. Verificación visual y funcional realizada en el navegador local autenticado; la rama no pasó a main ni a Lovable público.

Esta sección prevalece sobre las descripciones históricas anteriores de la misma nota. El panel muestra hasta cuatro prioridades autorizadas en una cuadrícula 2×2; cada una conserva su lugar durante carga y error. El selector guarda como máximo cuatro, mantiene el orden por usuario/navegador y permite reemplazar una selección. Los seis temas con fuente implementada son Facturación y NC, abastecimiento vinculado de operaciones activas, resolución de OS, stock antiguo de repuestos, composición del stock físico de máquinas y saldo calculado de máquinas nuevas. No se habilitan temas de clientes, retención, planificación o productividad hasta acreditar su contrato y fuente. Sucursales y familias son desgloses del stock antiguo, no KPI duplicados.

Facturación mensual = ventas positivas antes de NC + NC firmadas. En el tramo 01–19/10/2026 observado, USD 215.150,25 − USD 212.403,40 = USD 2.746,85. El neto es la cifra principal; ventas y NC se ven como componentes. La comparación mensual usa los mismos días del año anterior y el acumulado anual el mismo corte de fechas. El mes anterior completo se rotula como contexto distinto. La suma solo incluye áreas autorizadas y se rechaza si falta una fuente o no concilia. La referencia de última visita cambió de versión para no comparar la antigua cifra bruta con el neto.

Stock antiguo = valor positivo referencial de ubicaciones con stock físico positivo cuyos códigos están en gris o rojo; participación = ese valor / valor positivo valorizado del mismo universo. Gris y rojo dependen de ausencia de ventas trianuales y días desde la última compra comprobada. Los avisos de 1–30 días son condicionales a que no haya nuevos movimientos. La fecha de clasificación no acredita el corte del inventario. La foto de máquinas tampoco guarda un corte de origen verificable: el sistema no debe presentar la fecha de importación como corte real ni declarar disponibilidad comercial con el saldo físico. El saldo proyectado es un balance algebraico por modelo, no inventario disponible.

Campi usa solo historias seleccionadas y autorizadas. Una NC que absorbe al menos la mitad de las ventas conciliadas puede encabezar la atención; los demás cambios siguen el orden elegido. No se infieren causas ni atrasos. Una variación positiva no es automáticamente mejora. Las preguntas reconocidas responden con alcance, período, corte y fuente; las no soportadas declaran el límite. El gesto persistente depende de ánimo sereno, contento, atento, preocupado o pensativo; las acciones frecuentes alternan variantes, se pausan con pestaña oculta y respetan movimiento reducido. Los detalles y preguntas usan el panel lateral estándar. No se publicó en main ni en Lovable público.

**Revisión posterior del contrato.** La proyección de máquinas se retiró del selector: sumar compras pendientes al stock puede volver a contar unidades que ya ingresaron y no prueba disponibilidad. Las preferencias que la incluían se trasladan a la foto física de máquinas. El sexto tema disponible es la antigüedad de compra por sucursal, medida en días ponderados por valor USD con fecha de compra comprobada; responde a una pregunta distinta del importe en gris y rojo. Si el usuario tiene permiso solo para una sección, el catálogo se reduce a las lecturas acreditadas por esa sección. Nunca se agregan opciones vacías para llegar a cuatro.

Cada prioridad consulta su propia fuente y aparece en cuanto termina, conservando su posición mientras otras siguen cargando. En la prueba local autenticada, los temas operativos aparecieron antes de Facturación. La consulta consolidada de Ventas tardó entre 22 y 27 segundos en las dos mediciones del 19/10; **no se alcanzó** el objetivo de cinco segundos para esa tarjeta. Su cifra se muestra solamente cuando terminan y concilian todas las áreas autorizadas. La mejora de latencia requiere optimizar los RPC de Ventas o un agregado servidor protegido por permisos; esta rama no introduce una cifra parcial para disimular la demora. La foto física conserva «Corte no informado» porque no existe un corte de origen acreditado; el usuario debe poder distinguirlo de la fecha de consulta.

**Detalle de OS abiertas, 20/10/2026.** El panel lateral conserva el ancho estándar; muestra tres KPI (OS, clientes identificados, antigüedad media con P90), marca, sucursal, edad y tipo de tiempo real, y pestañas para acceder a las OS y filtrar por grupo. Las horas estimadas y los subestados ilustrativos del boceto no están respaldados por la fuente y no se muestran. La tabla enlaza la cohorte abierta filtrada por número de OS. La lectura autenticada local concilió 81 OS y mostró 10 sin sucursal; no se cambió ningún registro ni se pasó a `main`. Prueba de permisos con una cuenta limitada sigue pendiente por falta de cuenta de prueba disponible.

## Catálogo seleccionable vigente — 20/10/2026

Esta sección reemplaza los listados anteriores de temas seleccionables en esta nota. El editor ofrece cinco preguntas con fuente implementada, sujetas al permiso de la sección de origen, y permite ordenar hasta cuatro: Facturación y NC (neto mensual y comparación con el mismo tramo del año anterior; Ventas autorizadas), Pedidos de máquinas (pedidos pendientes y proporción con stock para facturar; Operaciones), Tiempo de resolución de OS (mediana de cierres frente al mes completo anterior; Órdenes de Servicio), OS abiertas (cola por edad y marca, con evolución solo cuando existen dos cortes comparables; último reporte TOTVS) y Stock antiguo de repuestos (valor USD gris/rojo y proporción del stock valorizado; Análisis de Repuestos). Si una comparación no tiene base, no se inventa una variación.

Evolución de ventas pasa a ser la comparación y el gráfico de Facturación y NC. Próximos cambios de color, familias y sucursales permanecen en el desglose de Stock antiguo, sin ocupar prioridades independientes. Las preferencias guardadas para temas retirados se trasladan al tema respaldado equivalente, conservando el orden y eliminando duplicados; no se asignan temas nuevos automáticamente. Clientes compradores/recurrentes y evolución del parque instalado figuran como candidatos pendientes de identidad, fechas efectivas, historia y permisos suficientes, y no aparecen como opciones vacías. El contrato auditable está en `src/lib/campi/panoramaTopicContracts.ts` y `src/lib/campi/panoramaPreferences.ts`.

El selector se comprobó en la app local autenticada: cinco temas autorizados para el perfil observado, tres preferencias intactas y dos alternativas; agregar una cuarta y volver al Panorama conservó las preferencias previas. No tiene buscador ni filtro por área. Pasaron 34 pruebas del catálogo y recorrido, TypeScript, lint y build antes de esta simplificación; las verificaciones finales se repiten después. No se verificó aún con cuentas de permisos limitados ni se publicó en `main` o Lovable público.

## Corrección vigente del catálogo y navegación — 20/10/2026

Esta decisión del usuario reemplaza la reducción a cinco temas descrita arriba. Se restituyen los nueve temas anteriores, incluida **Evolución de ventas** y las lecturas independientes de cambios de color, familias y sucursales. Se agregan ocho preguntas con respuesta propia en su tarjeta: facturación neta acumulada frente a LY, importe de NC y su peso sobre ventas, ventas antes de NC por cada una de las tres áreas, pedidos pendientes con stock asignado, OS abiertas de más de 90 días y valor del stock rojo. El catálogo suma **17 temas seleccionables** para un usuario con todos los permisos; cada usuario ve solo los autorizados. Permanecen hasta cuatro prioridades visibles y ordenadas. Dos preguntas pueden compartir fuente sin fusionarse: su KPI, comparación y señal visual responden decisiones distintas.

La portada ya no abre el detalle en un panel. Cada acción «Ver detalle» navega a la sección de origen con los filtros que esa sección interpreta. Facturación y las otras lecturas consolidadas de Ventas presentan antes un selector limitado a las áreas autorizadas; la sección elegida recibe el mismo rango mensual o anual de la tarjeta. OS abiertas usa la cohorte del último reporte TOTVS; OS de más de 90 días añade ese umbral. Pedidos con stock filtra en Operaciones por las identidades de los pedidos conciliados. Repuestos abre Análisis con su universo y color. La selección del editor se mantiene por usuario/navegador; el modo local «Revisar temas» no la modifica.

El código y las pruebas de estas definiciones permanecen exclusivamente en `feat/campi-panorama-alternativa`. Se verificó en la app local autenticada el selector de las tres áreas de Facturación, la aplicación del rango anual al entrar en Ventas de Servicios, y las tarjetas reales de OS antiguas, pedidos con stock y stock rojo. Los valores observados son lecturas transitorias, no constantes de implementación. Quedan pendientes una cuenta de prueba con permisos limitados y la publicación pública, que corresponde al usuario.

## Retiro de «Preguntale a Campi» — 20/10/2026

El usuario retiró la consulta rígida por falta de utilidad. Panorama ya no ofrece el botón, campo libre, sugerencias ni panel de respuestas. Campi sigue presentando comentarios basados en los temas autorizados y permite abrir los datos del tema mencionado. El gesto espontáneo al tocar la mascota se conserva. Las referencias anteriores de esta nota a preguntas y respuestas describen versiones históricas y no la rama actual. Sin cambios de SQL, permisos ni publicación.

## Catálogo objetivo de 20 preguntas — 20/10/2026

`src/lib/campi/panoramaCatalogTargets.ts` registra las veinte preguntas, su KPI, fuente, señal que Campi podría aportar y condición pendiente de validación. Es un contrato de desarrollo, no veinte opciones ya operativas. El selector conserva los **17 temas existentes** y sigue ofreciendo únicamente lecturas con tarjeta propia; no se retiraron los enfoques adicionales de ventas, NC, repuestos ni OS por compartir fuente.

Dos preguntas objetivo ya tienen respuesta equivalente: neto después de NC y valor gris/rojo. Cinco tienen respuesta parcial: Evolución de ventas ya muestra la variación porcentual mensual como KPI principal, pero le falta presentar por separado la diferencia absoluta y el total del año anterior completo; Pedidos necesita comprobar los requisitos comerciales para facturar; Resolución de OS muestra P90 de edad de **abiertas**, no P90 de duración de **cerradas**; OS abiertas mayores de 90 días necesita un umbral acordado/configurable antes de convertirse en regla general; y Cambios de clasificación agrupa el valor a 30 días sin primera fecha exacta. Las otras trece permanecen fuera del selector hasta que exista una consulta completa y autorizada con la definición indicada en el catálogo. En particular, no se reactiva la proyección de máquinas sin resolver el doble conteo de compras ya ingresadas; la foto actual del parque tampoco acredita crecimiento histórico.

La etiqueta «Pedidos con stock para facturar» se sustituyó por «Pedidos con stock vinculado», porque el vínculo de stock no acredita por sí solo que se pueda emitir la factura. Esto corrige el alcance del texto sin cambiar pedidos, cálculos, filtros ni permisos. Las preguntas de Servicios, clientes, importaciones, compras y parque se desarrollarán con sus fuentes y comparaciones propias; no se rellenarán con cifras sustitutas de otros módulos. Las pruebas del catálogo impiden reducir los 17 temas vigentes o declarar implementado un objetivo sin historia vinculada.

## Campi 3D V5 en Panorama — 21/10/2026

La rama alternativa integra el modelo articulado y las recetas de animación del paquete `Campi_3D_v5_codigo.zip` en el personaje de Panorama. Conserva la disposición actual de la portada, la reacción al clic, los ánimos vinculados al mensaje, el silencio durante la lectura de detalles y el respeto por movimiento reducido. El modelo y el controlador se cargan al entrar en Panorama, sin consultar servicios externos; la versión previa de poses queda como respaldo si el navegador no puede mostrar WebGL. El controlador V5 registra 113 recetas ejecutables y una bloqueada (`sereno-08`); la integración solicita recetas compatibles con cada ánimo y evita la bloqueada. El saludo con la mano del grupo «personalidad» requiere revisión visual adicional, ya que el paquete no la certifica. El modelo es una reconstrucción articulada del diseño, no la malla original de las poses previas. La bienvenida antigua no forma parte del flujo autenticado de esta rama y no se reactivó.

Se comprobó el lienzo 3D activo en Chrome local autenticado, sin errores de carga de Campi; el gesto al clic requiere una revisión visual más detenida en pantalla por su duración. Pasaron 53 pruebas del controlador del paquete, 40 pruebas de la integración de Panorama, TypeScript, lint de los archivos cambiados y build. Los recursos 3D quedaron incluidos en la salida de producción. No se modificó `main`, no se hizo push ni se publicó Lovable.
