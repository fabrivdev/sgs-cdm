# Revisión móvil transversal

Implementación local revisada el 24/09/2026. Complementa [[24-Condiciones-visuales-ventas]]; no certifica producción ni la revisión de cada ruta.

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
