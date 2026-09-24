# Revisión móvil transversal

Implementación local revisada el 24/09/2026. Complementa [[24-Condiciones-visuales-ventas]]; no certifica producción ni la revisión de cada ruta.

## Calendario

`Calendario.tsx` consume `MobileAgenda` en Semana y Por técnico bajo 640 px. Mantiene los filtros y callbacks existentes, identifica jornadas por su identidad propia cuando está disponible y conserva indisponibilidades/días no laborales. Abrir un día muestra su detalle completo conforme a los filtros de página; abrir una jornada consulta ese servicio. No cambia fechas al consultar ni deduplica jornadas por OS. El mes y la matriz de escritorio se conservan. No interpretar `Sin actividades programadas` como prueba de disponibilidad de un técnico.

## Dashboard y formularios

El selector móvil del Dashboard usa las mismas cuatro secciones y `goSection`; no cambia cálculos, fechas, permisos, indicadores ni implementa la propuesta del panel gerencial futuro. Dialog y Sheet aumentan únicamente el área táctil de cierre y reservan espacio para el título en teléfonos; DialogFooter mantiene acciones accesibles. Formularios particulares conservan sus validaciones y escrituras.

## Evidencia y límites

Pruebas unitarias de presentación/callbacks, tipos y compilación; fixture de componentes reales con datos ficticios a 320 px. No se verificó teclado virtual ni cada variante de formulario. La cobertura y pendientes están en `docs/mobile-review-2026-09-24.md`. No requiere SQL. Este worktree no tiene `obsidian-sync.local`; crear esta nota no acredita sincronización con la bóveda.
