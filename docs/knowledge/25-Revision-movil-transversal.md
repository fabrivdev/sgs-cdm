# Revisión móvil transversal

Implementación local revisada el 24/09/2026. Complementa [[24-Condiciones-visuales-ventas]]; no certifica producción ni la revisión de cada ruta.

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

## Encabezado móvil compartido

`src/components/AppLayout.tsx` aplica el encabezado a todas las rutas que usan ese layout, no solamente a Ventas. Bajo 768 px agrupa el logo original con «SIG CDM», mantiene menú solo con icono a la izquierda y campana/perfil a la derecha. Altura de 56 px, logo de 28 px y tres áreas táctiles de 44 × 44 px; son medidas explícitas para no reducirlas cuando la raíz tipográfica cambia a 14 px desde 640 px. A partir de 768 px se conservan los tamaños relativos y la información de usuario de escritorio.

El botón de menú tiene nombre accesible, estado expandido y mantiene el drawer con las mismas secciones filtradas por permisos. Elegir una sección conserva navegación y cierre; el menú de cuenta conserva Administración según acceso y Cerrar sesión. No cambia autenticación ni concesiones de acceso. `src/components/NotificationsPanel.tsx` adapta botón/contador y limita el ancho del popover con margen de colisión; consultas, marcado de vistas y diálogos de revisión mantienen sus handlers.

Validación local: 8 pruebas nuevas en `src/components/AppLayout.test.tsx`, más 11 pruebas existentes de Ventas móvil; navegación, restricciones de acceso, teclado de cuenta y panel de avisos. Comprobación del encabezado real con fixtures a 320, 390, 767, 768 y 1280 px; compilación y tipos correctos (con librería ES2021 por limitación previa de `replaceAll`). Evidencia y límites en `design-qa.md`. No requiere SQL ni acredita producción, hardware táctil o sincronización con Obsidian.
