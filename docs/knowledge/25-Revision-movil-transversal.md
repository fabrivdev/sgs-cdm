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
