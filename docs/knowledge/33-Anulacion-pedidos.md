# Anular pedido conservando historial

Parque → Operaciones → ficha → menú → Anular pedido abre una confirmación con el número y consecuencias. Volver no escribe. La acción llama `maquinaria_anular_pedido(uuid)`; nunca sustituye un error por eliminación.

Exige administración/jefatura con acceso a Parque y a `parque.operaciones`, validado también en backend. Conserva ficha, líneas, unidades, documentos y archivos; registra actor, fecha, estado y vínculos anteriores en `maquinaria_operaciones.anulacion`. Libera solo referencias propias en stock/importaciones; no cambia existencias físicas, ventas ni facturas. Evidencia de factura/entrega o referencias contradictorias bloquea la operación completa.

El estado interno es CANCELADA. El pedido permanece accesible con el filtro Canceladas y queda fuera de pendientes y valor pendiente. No permite nuevas reservas, cambios de evidencia, reactivación ni reimportación silenciosa de la misma NP. Una reimportación incompatible falla expresamente. El chasis histórico permanece, pero deja de reservar su unicidad como unidad vigente.

## Backend y límites

`20261027140000_cancel_machine_orders_preserving_history.sql` fue instalada el 27/10/2026 en SIG CDM con aprobación específica. No reaplicarla automáticamente al publicar frontend. SHA256 del archivo autorizado: `695eb7b2e18231f420b841532f62303d0aa8b48f05890cb80d549b2e4883d24e`.

Verificación posterior: JSONB nullable sin default, índice válido, tres funciones SECURITY DEFINER propiedad de postgres con search_path public, pg_temp, ocho triggers activos. RPC ejecutable por authenticated con controles internos; PUBLIC, anon y service_role sin EXECUTE efectivo. Guards sin ejecución directa para esos roles ni authenticated. Sin cambios RLS o permisos globales. No se anuló ningún pedido al instalar.

Uso secuencial: EXCLUSIVE NOWAIT rechaza contención al adquirir bloqueos de diez tablas, incluidas escrituras ajenas. Lecturas simples continúan; nuevos escritores pueden esperar hasta terminar la transacción. Errores de contención/deadlock revierten todo y piden revisar estado antes de reintentar. No hay reintento automático ni garantía de éxito concurrente. No se probaron dos sesiones reales.

## Validación

- `scripts/verify-machine-order-cancellation.mjs`: 14 escenarios PGlite; esquema mínimo, helpers controlados, errores de contención inyectados. Conservación, permisos, factura/entrega, terceros, idempotencia, reimportación y rollback.
- `CancelMachineOrderDialog.test.tsx`: apertura sin escritura, doble clic, error y función ausente.
- `scripts/verify-machine-order-concurrency.mjs`: preparado para base local vacía desechable; no ejecutado, no apunta a producción.
- Confirmación observada en escritorio y móvil antes de integrar, sin aplicarla. No sustituye prueba de anulación real.

Fuentes: `src/pages/MaquinariaOperaciones.tsx`, `src/components/parque/CancelMachineOrderDialog.tsx`, migración y pruebas citadas. La publicación pública sigue a cargo del usuario.
