# Panorama alternativo: temas con contexto

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
| ¿Qué valor de repuestos exige revisión? | Participación del valor positivo de stock en gris + rojo sobre todo el valor positivo valorizado del mismo corte. Gris/rojo = sin ventas en los tres años evaluados y última compra hace más de 365 días. | Mostrar USD del numerador, composición por color, familia y sucursal, y valor sin fecha comprobada por separado. Conservar el color promedio de sucursal como contexto, no como KPI. No calcular el cociente a partir de agregados firmados que compensen posiciones negativas. | Definición propuesta; verificar grano de valorización y cobertura antes de implementarla. El Kardex es referencial, no valor contable actual. |
| ¿Cuánto pedido de máquinas tiene abastecimiento comprobado? | Unidades de pedidos vigentes aún no entregadas con una unidad física asignable o arribo real conciliado, dividido por todas las unidades de pedidos vigentes aún no entregadas. Cada unidad de cobertura se asigna una sola vez. | Pedidos sin cobertura por NP/modelo, estado de reserva y conflictos. Antigüedad desde NP solo orienta revisión; no equivale a demora contractual. Stock físico y saldo proyectado son insumos del diagnóstico, no KPI autónomos ni se compensan entre modelos. | Contrato por diseñar y validar: el conteo actual de unidades sin facturar puede incluir entregadas y no sirve como denominador de entrega pendiente. |
| ¿Con qué rapidez se resuelven las OS? | Mediana de días calendario entre apertura y cierre de OS cerradas en un período definido, comparada con el período equivalente anterior. | Cantidad de OS cerradas, abiertas al cierre y distribución de antigüedad de las que siguen abiertas. Separar reaperturas, fechas faltantes y tipos de trabajo; una mediana menor no basta si crece el atraso del remanente. | Definición propuesta; verificar identidad, cierres y cobertura temporal antes de calcular. No usar la fecha de la última jornada como plazo prometido. |

Reglas comunes: cada KPI lleva universo, unidad, período y fecha de corte acreditada; una fuente incompleta produce estado no verificable y nunca cero. Las comparaciones usan el mismo alcance y definición, y el contraste con la última visita informa un cambio observado, no una mejora. Un hallazgo accionable identifica el segmento y abre el detalle filtrado o el registro; las alertas requieren compromiso o umbral acordado, magnitud y responsable. Las prioridades no amplían permisos y el panel variable puede mostrar diagnósticos de temas seleccionados sin presentarlos como KPI principales.

Secuencia propuesta: acordar estos cuatro resultados y sus exclusiones; luego auditar la capacidad de las fuentes para calcular cada numerador y denominador sin doble conteo; finalmente ajustar tarjetas, preguntas de Campi y enlaces. No se modifica la interfaz ni se consultan fuentes nuevas por esta propuesta.

### Repuestos: exposición y transición de color

Se adopta como criterio propuesto para el KPI el **valor USD positivo** de posiciones de stock de códigos en gris o rojo, y su participación sobre el valor USD positivo de todas las posiciones valorizadas del mismo universo y corte. El semáforo histórico decide esos colores con ausencia de ventas en los tres años calendario evaluados y última compra comprobada: gris = 366–1.000 días; rojo = desde 1.001 días. Mostrar importe y porcentaje juntos, más desglose por color, familia y sucursal. Un código presente en varias sucursales cuenta una sola vez como código, aunque sus posiciones USD se suman por ubicación. Valores faltantes y posiciones negativas se informan aparte; nunca se convierten en cero ni se compensan en el cociente. La fecha de clasificación no se presenta como fecha de corte del inventario.

Campi mostrará un aviso preventivo dentro del tema autorizado cuando, **si no hay nuevas ventas ni compras**, un código actualmente lila esté a 1–30 días de pasar a gris o uno actualmente gris esté a 1–30 días de pasar a rojo. Con los límites actuales, son edades de última compra de 336–365 y 971–1.000 días, respectivamente; días restantes = 366 o 1.001 menos la edad. El horizonte inicial recomendado es 30 días, pendiente de ajuste de negocio. El aviso reúne valor USD positivo expuesto y cantidad de códigos distintos para cada transición; prioriza la transición a rojo y no confunde proyección de color con atraso contractual. Códigos sin compra fechada, sin stock positivo o con ventas que los clasifiquen en verde/amarillo/naranja no entran. Una compra o venta nueva, un cambio de cobertura histórica o un cambio de año exige recalcular, no conservar el aviso anterior. No hay notificación externa ni recordatorio repetido: se muestra al abrir Panorama y abre el listado filtrado correspondiente.

El RPC actual entrega la clasificación completa y una página de filas, pero no un agregado único de **valor positivo por color y cercanía al umbral**. Sus importes `por_color` son sumas firmadas y no sirven para el cociente propuesto. Antes de implementarlo, preparar una lectura agregada protegida por `repuestos.analisis`, con numerador, denominador, cobertura, cohortes preventivas y fecha/cobertura de cada fuente; comprobar conciliación y acceso por permiso. El destino de Análisis hoy admite enlace directo solamente al filtro rojo: habrá que incorporar gris y los rangos de días para que el aviso abra exactamente los artículos implicados. Esta definición no implica que el dato esté ya disponible en la interfaz.
