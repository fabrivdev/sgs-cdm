# Revisión móvil transversal

Implementación local revisada el 24/09/2026. Complementa [[24-Condiciones-visuales-ventas]]; no certifica producción ni la revisión de cada ruta.

## Jerarquía final de filas telefónicas - 07/10/2026

Esta regla posterior prevalece sobre las descripciones anteriores de filas bajo 640 px. Cada fila conserva identidad, una comparación principal y un estado accionable; los datos retirados siguen en el detalle, orden, búsqueda y exportación existentes. Desde 640 px se mantienen las tablas y columnas previas.

- Órdenes muestra OS + cliente, horas y estado. Marca, modelo, técnicos y km permanecen en el drawer.
- Cumplimiento muestra técnico, porcentaje o `-`, barra cuando existe denominador y una sola excepción: primero `No disponible`, en su ausencia `N programados`. El drawer conserva `x de y`, horas, referencias, trabajos y motivos. La falta de resultados decididos nunca se presenta como `0%`.
- Planificador conserva el código TR visible y en el nombre accesible; la tarea se limita a una línea y `Jornada n/m` aparece sólo si hay continuidad real. La OS, horas y demás campos siguen en detalle/búsqueda/exportación.
- Flota muestra marca/modelo, chapa, responsable, km del período y estado de lectura. El responsable se conserva en línea propia hasta validar si es contexto diario de despacho; sólo la fecha de última lectura pasa al detalle existente.
- Operaciones de máquinas muestra modelo, NP, cliente y un solo badge con eje accesible. `Entrega: No disponible/Cancelada` prevalece como bloqueo; sin bloqueo se muestra `Facturación`. Los dos ejes siguen separados y visibles en el drawer.

Importaciones y Máquinas del parque no se modifican: faltan capturas asentadas con filas reales para autorizar una reducción. Productividad, Trabajos, Equipo/Administración y detalle de Flota tampoco cambian en este lote. No se tocaron filtros, cabeceras, pestañas, cards, sidebar, escritorio, fórmulas, consultas, permisos, exportadores ni SQL.

Evidencia local: pruebas de componentes en `OrdenesServicio.test.tsx`, `ServiceLists.test.tsx`, `FlotaDrawers.test.tsx` y `ParqueListTables.test.tsx`. No se abrió navegador ni aplicación y la QA visual sigue pendiente en 320/390/639/640/768/1280 px. El clon no contiene `00-Inicio.md`, `mapa-negocio.json` ni `obsidian-sync.local`; se contrastaron las normas originales de Obsidian y el código vigente, sin inventar los archivos ausentes ni acreditar sincronización.

## Límites de filas en Trabajos — 06/10/2026

Bajo 640 px, las filas planas de `src/pages/Trabajos.tsx` usan separadores neutrales de 1 px a todo el ancho y el mismo padding vertical `py-2` de la tabla nativa. El color del estado no tiñe el fondo ni el divisor móvil; permanece en la prioridad y en el tablero de tablet/escritorio. Hover, foco visible y presión ofrecen un fondo neutral perceptible sin convertir las filas en cards.

Se conservan la agrupación TR/prioridad, cliente y descripción de hasta dos líneas, incluida la altura variable cuando el texto envuelve. No cambian estados, filtros, cálculos, orden, callbacks, permisos ni detalle. La comprobación es de componente/código con datos sintéticos en 320/390/639 px y referencia de captura a 571 px; no acredita navegador, dispositivo físico o producción.

## Apertura directa de detalles en Parque y Planificador - 01/10/2026

En `src/components/parque/ParqueTab.tsx`, el nombre del cliente abre directamente el `ClientePanel` existente; en `src/pages/Planificador.tsx`, la descripción de la jornada abre directamente `ServicioDetalleDialog`. Se retiró únicamente el popover informativo intermedio y sus botones “Ver cliente”/“Ver jornada”. El clic de la fila conserva el mismo destino, los objetivos principales siguen siendo botones nativos accesibles por teclado y detienen la propagación para evitar una doble apertura. El enlace telefónico, orden, filtros, selección, exportación, identidad de cliente/jornada, permisos y agenda móvil no cambian. Estos listados no implementan arrastre, por lo que no se agregó un gesto alternativo ni lógica de drag/drop.

Validación local: 32 pruebas focalizadas de Parque y listas de Servicios en 320/390/639/640/768/1280 px, incluidas apertura directa, cierre y reapertura, acciones secundarias, filtros y exportaciones; build de producción correcto. El typecheck requiere conservar el override ES2021 ya documentado por el uso previo de `String.replaceAll` en `src/lib/localizedAmount.ts`. No se consultaron datos productivos, no se modificaron consultas ni se agregó SQL. El clon no contiene `00-Inicio.md`, `mapa-negocio.json` ni `obsidian-sync.local`, por lo que esta nota no acredita sincronización con Obsidian.

## Scroll de tablas largas en móvil - 01/10/2026

`src/components/ventas/TableScroll.tsx` conserva el umbral de 20 filas y la altura máxima de 480 px desde `md` (768 px), pero elimina la limitación vertical interna bajo ese ancho. En teléfonos las tablas largas crecen con el contenido y el usuario desplaza la página; se conserva `overflow-x-auto` para cualquier ancho horizontal necesario. La regla alcanza `CompactListTable`, tablas de Ventas, Stock, Sugerencias, Compras y otros consumidores compartidos sin cambiar sus filas.

No se modifica paginación de servidor o local, carga incremental, filtros, selección, orden, acciones, detalles, exportaciones, permisos ni consultas. Tampoco se agrega virtualización: el código ya renderizaba todas las filas recibidas, por lo que este ajuste cambia el contenedor, no la cantidad de nodos. Cuarenta y nueve pruebas focalizadas cubren 20/21 filas y consumidores compartidos. Navegador local con 50 filas ficticias comprueba scroll de página en 320/390/430 px, overflow horizontal contenido y límite interno de 480 px conservado en 768/1024/1366 px. Esta implementación es local y no acredita commit remoto, despliegue ni producción autenticada.

## Ubicación y desbordamiento de pestañas — 29/09/2026

`src/components/ui/tabs.tsx` oculta el desbordamiento nativo de la lista: el scroll automático producía flechas verticales junto a pestañas que ya cabían, como en Comisiones. El disparador de escritorio mide 32 px dentro de una lista de 36 px para dejar sitio al subrayado; en teléfono conserva un mínimo táctil de 44 px. Las secciones principales Órdenes (`src/pages/OrdenesServicio.tsx`), Administración (`src/pages/Admin.tsx`) y Compras (`src/pages/RepuestosCompras.tsx`) pasan sus pestañas a `PageHeader`, como ya hacen Comisiones y Dashboard. Desde 640 px se ubican a la derecha del título cuando caben; el encabezado puede envolverlas en anchos intermedios sin recortar el título. Bajo 640 px siguen visibles debajo del título, con acciones principales en la primera fila. No mover las pestañas internas de fichas o paneles al encabezado de página. Se conservan selección, permisos y contenido; sólo cambia la presentación. Pruebas locales de estructura y navegación, no comprobación del despliegue ni de todos los navegadores.

## Indicadores sin comentarios redundantes — 29/09/2026

`Comisiones.tsx` deja en sus cuatro indicadores sólo nombre y valor; se retiran las frases sobre multiplicación de técnicos, liquidación y los conteos de OS al pie, no los totales ni la tabla. `AgendaTab.tsx` retira las glosas bajo sus cinco indicadores porque sus títulos ya delimitan la población. `EstadoCompacto` del Dashboard deja de repetir un conteo de técnicos bajo «Cierre anterior»; su cifra principal de jornadas/horas y el detalle operativo permanecen. `KpiItem` no reserva una tercera línea vacía cuando no hay dato secundario. No cambian los cálculos de los valores principales, filtros ni exportaciones.

Inventario contrastado: Dashboard financiero/operativo y `ServiciosDashboard` conservan comparaciones, porcentajes y denominadores numéricos; Maquinaria Operaciones conserva el importe pendiente, Repuestos conserva el total de catálogo, Sugerencias conserva desgloses numéricos y Órdenes conserva el estado de cálculo de Eficiencia. Estos no son glosas redundantes: retirarlos de una card sin otro lugar de lectura ocultaría datos o calidad de cálculo. La regla de Ventas de evitar párrafos didácticos sigue vigente. Validación local no acredita el despliegue ni sincronización de Obsidian; este clon carece de atlas y configuración de sincronización.

## Ajuste posterior del Planificador — 25/09/2026

Sólo en teléfono (menos de 640 px), Planificador usa `PlannerMobileAgenda.tsx`: lista continua con día/fecha a la izquierda, cliente prioritario, tarea de hasta dos líneas y referencia/estado/continuidad. No muestra horas por jornada ni total de horas al pie, aunque existan datos. Las horas se conservan en el detalle, exportación y tabla de tablet/escritorio; no se borra ni recalcula nada. Semana, navegación y orden quedan en una sola franja, sin encabezados de tabla móvil ni columna vacía. La acción de programar es visualmente discreta y conserva su área táctil y permisos.

Se mantienen el orden filtrado recibido, identidad por jornada (también para un servicio con varias jornadas el mismo día), cuadrilla, continuidad, resaltado de pendientes/no vistos, exportador completo y callback original de detalle. No agrupar ni deduplicar por cliente o fecha. El menú de orden conserva los campos originales desplazados al detalle. No se modifican otras secciones ni componentes visuales compartidos.

Fuentes: `src/pages/Planificador.tsx`, `src/components/calendar/PlannerMobileAgenda.tsx` y `src/components/lists/ServiceLists.test.tsx`. Validación local: 26 pruebas de listas, filtros y agenda; tipos y compilación; navegador con datos ficticios a 320/390 px y comprobación de tabla a 768 px. Límites/evidencia en `design-qa.md`; no certifica producción ni sincronización de Obsidian. Esta sección prevalece sobre la descripción anterior de «jornada frente a horas» para el Planificador móvil.

## Regla más reciente: teléfono distinto de escritorio/tablet

Esta sección reemplaza las indicaciones históricas de selectores para pocas pestañas, indicadores plegados y una sola línea rígida en celular. Bajo 640 px se usan filas continuas con identidad agrupada, tipografía proporcionada y navegación visible. Desde 640 px se conservan columnas y comportamiento previo. No convertir todas las pantallas a tarjetas ni reducir indiscriminadamente los controles de formularios.

Implementación local:

- `AppPrimitives.tsx`: encabezado móvil de 18 px; indicadores visibles en grilla plana, sin «Más indicadores». Las alertas externas no se ocultan.
- `FiltersBar.tsx`: búsqueda visual de 36 px, contexto móvil explícito y navegación principal opcional. Corte de Proyectado, frescura de Stock y semana de Planificador no dependen de abrir filtros.
- `ui/tabs.tsx`, `dialog.tsx`, `responsive-drawer.tsx`: pestañas compactas con objetivos táctiles, títulos envolventes y acciones de pie en fila cuando caben. Los formularios conservan payloads y validación.
- `CompactListTable.tsx` / `MobileRecord.tsx`: columnas móviles explícitas, sin mezclar entidades; campos desplazados al detalle siguen disponibles para ordenar mediante el menú y permanecen en el exportador original.
- `MaquinasTab.tsx`, `StockMaquinasTab.tsx`: modelo, chasis y propietario/contexto legibles; se conserva la alerta de chasis repetido, cantidad fraccionaria y revisión de transferencias.
- `MaquinariaOperaciones.tsx`: pedidos muestran NP/cliente y facturación/entrega independientes. Importaciones muestran llave/chasis y llegada/situación. Abrir sigue identificando la unidad original; no crea movimientos ni factura por adjuntos.
- `StockProyectado.tsx`: corte visible y columnas modelo/stock/proyectado; los otros términos de la fórmula siguen en detalle y Excel. No se recalculan ni se ocultan negativos.
- `PartsStockTable.tsx`, `PurchaseSuggestionTable.tsx`: descripción/código/marca agrupados; total o stock/sugerencia aparte. Permanecen avisos de calidad, paginación y orden del servidor.
- Compras y Solicitudes: documento/sucursal/estado o solicitante agrupados; sus ítems agrupan descripción/código con cantidades e importes separados. Contexto, edición/vinculación autorizada, órdenes ocultos y exportación completa permanecen disponibles.
- `Planificador.tsx`: semana visible y filas jornada/cliente/fecha/referencia/estado frente a horas; mantiene continuidad e identidad de jornadas. `Trabajos.tsx`: navegación por estado con conteos y filas planas en teléfono; no cinco paneles altos ni botón «Ver más» por cada estado. Escritorio conserva su tablero.
- `Calendario.tsx`: Mes/Semana/Técnicos visibles en móvil; conserva agenda, disponibilidades y callbacks. No se reprograma al consultar.
- `Admin.tsx`, `Dashboard.tsx`: pestañas visibles con los mismos permisos y handlers. Dashboard muestra el rango consultado, no sólo su agrupación temporal.
- `Comisiones.tsx`: teléfono agrupa OS/cliente/pago/validación, separa horas y conserva selección. Abrir o seleccionar no ejecuta liquidaciones. Las columnas de tablet/escritorio siguen separadas; el estado vacío utiliza el número de columnas visibles.

Validación: pruebas de presentación, permisos, selección, orden y exportación; navegador local con componentes reales y datos sintéticos. Capturas/mediciones representativas a 320/390 px y comprobaciones a 768/1280 px; pruebas de frontera 639/640 px. No hay SQL nuevo, cambios de datos comerciales, consultas productivas ni certificación de todos los formularios en hardware táctil. `design-qa.md` registra resultados y limitaciones. Este worktree carece de `obsidian-sync.local`, del índice y del mapa de conocimiento: se consultaron sus equivalentes del repositorio principal como contexto, sin copiar ni adelantar el checkpoint del atlas y sin acreditar sincronización de la bóveda.

## Armonización local del 07/10/2026: lotes 2 a 4

Las altas de Máquinas y Administración usan la acción principal del encabezado y conservan sus formularios existentes; las altas/credenciales de Administración y el seguimiento de Pedidos usan `ResponsiveDrawer`. Solicitudes mantiene su diálogo breve. No cambian payloads, permisos, validaciones ni callbacks.

`KpiStrip` distribuye exactamente cinco indicadores en dos filas equilibradas 3 + 2 sin ocultarlos. Flota conserva su pantalla exclusivamente como lista y agrupa cada vehículo en dos niveles; la ausencia de lectura aparece una vez. Órdenes agrupa OS/cliente, equipo y técnicos/horas/km en tres niveles sin perder datos ni selección. Administración cambia de fila móvil a tabla exactamente en 640 px. Calendario adopta el gutter compartido, pero conserva la excepción de la cuadrícula mensual y sus agendas. Sugerencias de Repuestos muestra sus dos acciones del encabezado como objetivos táctiles con nombre accesible bajo 640 px.

La matriz completa de rutas, cambios, excepciones y estados pendientes está en `docs/mobile-harmonization-matrix-2026-10-07.md`. La comprobación disponible es de código y pruebas locales; no hubo navegador, capturas, dispositivo físico ni producción autenticada. Por ello todas las filas continúan pendientes de aprobación visual en 320/390/639/640/768/1280 px, incluidos carga, vacío, error, permisos y drawers. No se agregó SQL ni se modificaron consultas, cálculos o exportadores.

Corrección posterior de QA: las acciones de alta ubicadas en `PageHeader` mantienen un objetivo táctil de 44 × 44 px bajo 640 px, con superficie transparente e icono primario como en Planificador. Hover y foco aplican un tinte/anillo primario y el estado deshabilitado conserva la semántica base. Desde 640 px mantienen texto, relleno y jerarquía de acción principal. La regla compartida alcanza Nuevo trabajo, Nuevo vehículo, Nuevo usuario, Nueva máquina, Nuevo pedido, Nueva importación y Programar jornada; no modifica acciones textuales de detalle ni pies de drawer.

En Equipo y accesos de Administración, la fila de teléfono reserva el ancho principal al nombre y lo limita a dos líneas, con el valor completo en `title`. La presencia conserva el punto visible, el estado completo accesible y su `title`, pero no compite con la identidad como texto lateral; la ficha mantiene su botón de 44 × 44 px y el mismo callback. Desde 640 px continúa la tabla sin cambios.

## Jerarquía móvil de servicios y selectores rápidos - 07/10/2026

Esta regla posterior reemplaza, bajo 640 px, las menciones anteriores que dejaban la semana de Planificador o el estado de Trabajos visibles fuera de `Más filtros`. Los selectores rápidos que modifican el conjunto mostrado pertenecen al panel móvil: semana de Planificador, estado de Trabajos, estado de técnicos de Productividad y período/medida de Cumplimiento. En tablet/escritorio se conservan los controles existentes. Las pestañas Órdenes/Productividad/Cumplimiento son navegación real y permanecen visibles; no deben tratarse como filtros.

Órdenes usa exactamente tres columnas de indicadores en teléfono. Sus cinco indicadores quedan en dos filas 3 + 2, con el mismo ancho de columna y sin ocultar valores. Esta excepción no cambia la distribución compartida de otros `KpiStrip`. El panel gerencial continúa mostrando cuatro indicadores por sección; esa regla define cuántos son visibles y no impone una grilla móvil desde este cambio.

La lista móvil de Órdenes separa identidad, actividad y estado en tres columnas. Productividad elimina el ancho mínimo de 440 px y muestra Técnico/Productividad; horas y meta siguen en el texto accesible del medidor, y la fila abre el registro completo del técnico. No se repiten OS/Horas/Meta como microcolumnas ni la alerta de incidencias fuera de Filtros. Cumplimiento mantiene un período por vez y expresa resultados como `n de total cumplidos`, `programado(s)` y `No disponible`; período y Trabajos/Horas están en Filtros y no se duplican sobre la matriz.

La acción de detalle `Registrar lectura` de Flota usa el mismo tratamiento móvil que las altas del encabezado: objetivo de 44 × 44 px, icono visible, nombre accesible y texto sólo desde 640 px. La causa era una rama condicional del `PageHeader` que no consumía la clase compartida aunque `Nuevo vehículo` sí lo hacía.

Validación automatizada local: 94 pruebas de Órdenes, Productividad, Cumplimiento, Planificador y Trabajos, más 11 de la acción compartida y drawers de Flota. No se abrió navegador; la comprobación real de overflow y composición sigue pendiente en 320/390/639/640/768/1280 px con filtros y drawers abiertos. No hubo SQL, cambios de consultas, datos productivos, commit ni publicación.

## Historial de etapas anteriores

## Calendario

`Calendario.tsx` consume `MobileAgenda` en Semana y Por técnico bajo 640 px. Mantiene los filtros y callbacks existentes, identifica jornadas por su identidad propia cuando está disponible y conserva indisponibilidades/días no laborales. Abrir un día muestra su detalle completo conforme a los filtros de página; abrir una jornada consulta ese servicio. No cambia fechas al consultar ni deduplica jornadas por OS. El mes y la matriz de escritorio se conservan. No interpretar `Sin actividades programadas` como prueba de disponibilidad de un técnico.

## Dashboard y formularios

El selector móvil del Dashboard usa las mismas cuatro secciones y `goSection`; no cambia cálculos, fechas, permisos, indicadores ni implementa la propuesta del panel gerencial futuro. Dialog y Sheet aumentan únicamente el área táctil de cierre y reservan espacio para el título en teléfonos; DialogFooter mantiene acciones accesibles. Formularios particulares conservan sus validaciones y escrituras.

## Evidencia y límites

Pruebas unitarias de presentación/callbacks, tipos y compilación; fixture de componentes reales con datos ficticios a 320 px. No se verificó teclado virtual ni cada variante de formulario. La cobertura y pendientes están en `docs/mobile-review-2026-09-24.md`. No requiere SQL. Este worktree no tiene `obsidian-sync.local`; crear esta nota no acredita sincronización con la bóveda.

## Cuarta etapa: Administración

`src/pages/Admin.tsx` muestra el equipo móvil en filas de nombre/estado/ficha, conservando la ficha con correo, sucursal, nivel y secciones. La tabla de escritorio y el origen de orden/búsqueda/exportación no cambian. Bajo 640 px, un selector reemplaza las pestañas y ofrece solamente las mismas secciones autorizadas; seleccionar conserva el cambio de sección y limpia la búsqueda como antes. No concede permisos ni crea cuentas al navegar.

El alta limita su altura a 90dvh y desplaza el cuerpo, manteniendo acciones fuera del desplazamiento. El diálogo de credenciales permite desplazamiento completo. No se cambian payloads, validaciones ni reglas de acceso. Diez pruebas locales, tipos y compilación correctos; no equivalen a pruebas visuales, de teclado virtual o de producción. Historiales interiores y previsualizaciones de importación siguen pendientes.

## Dirección posterior: opción 2 en Ventas

El usuario eligió una composición continua y armónica, con menos contenedores y sin navegación plegable. Primer alcance implementado: Ventas de Máquinas, Servicios y Repuestos bajo 640 px. Tres indicadores visibles, buscador discreto, Períodos/Resumen/Detalle y tabla plana con cantidades e importes. Promedios y análisis secundarios permanecen en Resumen. La regla detallada vigente está en [[24-Condiciones-visuales-ventas]] y prevalece sobre las etapas anteriores para esas tres vistas.

`SalesMobileProvider` contiene solamente estado de presentación. Los panoramas mantienen su registro de exportación aunque otra vista esté visible; el explorador se monta al entrar a Resumen/Detalle, sin consultar análisis ocultos. Rangos, fuentes financieras, permisos y exportadores no cambian. La nueva navegación no acredita que las demás secciones ya adopten esta composición. No hay SQL nuevo, datos de producción consultados ni sincronización de Obsidian en este worktree sin configuración local. Revisión visual local con fixtures y limitaciones registradas en `design-qa.md`.

Decisión transversal del 07/10/2026: Ventas de Servicios, Máquinas y Repuestos eliminan la fila de rango situada bajo el título; las fechas continúan en los filtros y no cambian datos, métricas, navegación ni escritorio. Órdenes tampoco repite junto al título el rango efectivo de Productividad: conserva fechas, corte histórico y acceso a Histórico en Órdenes. El mes navegable de Calendario y el corte de Stock proyectado permanecen porque son contexto funcional, no un resumen decorativo de filtros. El único menú de sección se monta en `FiltersBar` en todos los anchos. La validación visual de la ubicación exacta sigue pendiente.

## Encabezado móvil compartido

`src/components/AppLayout.tsx` aplica el encabezado a todas las rutas que usan ese layout, no solamente a Ventas. Bajo 768 px agrupa el logo original con «SIG CDM», mantiene menú solo con icono a la izquierda y campana/perfil a la derecha. Altura de 56 px, logo de 28 px y tres áreas táctiles de 44 × 44 px; son medidas explícitas para no reducirlas cuando la raíz tipográfica cambia a 14 px desde 640 px. A partir de 768 px se conservan los tamaños relativos y la información de usuario de escritorio.

El botón de menú tiene nombre accesible, estado expandido y mantiene el drawer con las mismas secciones filtradas por permisos. Elegir una sección conserva navegación y cierre; el menú de cuenta conserva Administración según acceso y Cerrar sesión. No cambia autenticación ni concesiones de acceso. `src/components/NotificationsPanel.tsx` adapta botón/contador y limita el ancho del popover con margen de colisión; consultas, marcado de vistas y diálogos de revisión mantienen sus handlers.

Validación local: 8 pruebas nuevas en `src/components/AppLayout.test.tsx`, más 11 pruebas existentes de Ventas móvil; navegación, restricciones de acceso, teclado de cuenta y panel de avisos. Comprobación del encabezado real con fixtures a 320, 390, 767, 768 y 1280 px; compilación y tipos correctos (con librería ES2021 por limitación previa de `replaceAll`). Evidencia y límites en `design-qa.md`. No requiere SQL ni acredita producción, hardware táctil o sincronización con Obsidian.

## Armonización local del 07/10/2026: lote 1

La implementación autorizada comenzó por los objetivos táctiles compartidos, sin cambiar consultas, cálculos, permisos ni presentación de escritorio. Bajo 640 px, el pie de `FiltersBar`, los subcontroles de Ventas y los permisos de Administración alcanzan 44 px; la matriz móvil de Cumplimiento usa el mismo mínimo. Los permisos exponen además su estado con `aria-pressed`. Se mantienen la detección de paneles de filtros vacíos, `aria-expanded`, limpiar, aplicar y los callbacks existentes.

Pruebas focalizadas: 100 casos en cuatro archivos, incluidos controles condicionales de filtros, Ventas, Administración y Órdenes/Cumplimiento. Typecheck, lint de los archivos afectados y compilación de producción correctos. La comprobación de Ventas valida los tokens CSS; no sustituye una medición del render.

No hubo herramienta de navegador disponible para reutilizar una pestaña existente, por lo que las capturas y la revisión visual independiente en 320/390/639/640/768/1280 px quedan pendientes. Este lote no se publica, no ejecuta SQL y no autoriza avanzar a acciones/formularios hasta cerrar esa puerta visual o registrar expresamente su excepción.
