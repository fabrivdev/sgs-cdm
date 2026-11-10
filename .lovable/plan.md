# Corregir los problemas del módulo Flota

Auditoría completa del módulo (pantallas, cálculos, permisos y pruebas). No se encontró nada crítico ni datos de demostración visibles en producción. Estos son los problemas, por prioridad, y lo que haré con cada uno.

## Alta prioridad

1. **Se pierde el vehículo al abrir "Lecturas y responsables".** Si los datos todavía están cargando, la pantalla descarta el vehículo elegido y muestra la lista general. Esperar a que carguen los datos antes de validar la selección.
2. **Reintentar una factura puede ignorar los cambios.** Si se edita la factura después del primer intento, el sistema guarda los datos viejos pero muestra "guardado" con los nuevos. Bloquear los campos una vez reservada, o actualizarlos de verdad en el servidor.
3. **Editar el monto de una factura puede pisar el trabajo de otro gerente.** No verifica si otro la cambió antes, ni pide motivo. Exigir versión y motivo, y registrar el valor anterior y el nuevo.
4. **Sin salida cuando una factura queda anulada.** El sistema dice "iniciá una nueva carga", pero el formulario siempre recupera el mismo intento. Agregar botón "Descartar intento / Nueva carga".

## Prioridad media

5. **El consumo cambia según lo que se busque.** Al buscar texto, el consumo (km/l) se calcula solo con las cargas visibles. Calcularlo con todas las cargas del vehículo y después filtrar.
6. **El consumo mensual mezcla monedas.** Cada fila es mes + moneda, pero el consumo usa todo el mes. Mostrarlo por mes, separado de la moneda.
7. **"Consumo" es una estimación.** Se basa en litros comprados, no en tanque lleno. Rotularlo "Consumo estimado" y documentar el criterio.
8. **La importación de combustible pierde la moneda.** Todo queda como "Sin moneda". Leer la moneda del Excel o pedirla al importar (nunca asumir guaraníes).
9. **Se aceptan montos negativos en facturas.** Rechazarlos en pantalla y en la base.
10. **Fechas "desde" mayor que "hasta" muestran lista vacía sin aviso.** Mostrar mensaje de período inválido.
11. **Período personalizado acepta fechas mal formadas.** Validar fechas reales.
12. **Un vehículo inexistente en el enlace muestra otra vista.** Mostrar "Vehículo no encontrado" con botón para volver.
13. **La tabla vuelve a la página 1 sola.** Mantener la página salvo que cambien los filtros u orden.
14. **Cada vista descarga todos los datos de la flota.** Cargar solo lo que necesita cada pestaña.
15. **Un usuario de gerencia con solo Flota puede ser enviado ahí y rechazado.** Unificar quién puede entrar en menú, pantalla de inicio y base.
16. **Faltan tipos de datos de Flota.** Regenerar tipos y usar funciones tipadas.

## Baja prioridad (visual y mantenimiento)

17. Etiquetas de filtros y encabezados a 11px como el resto de la app.
18. Filas que se parten en dos líneas en celular: una sola línea con recorte.
19. Colores fijos en la pantalla antigua: pasar a colores del tema.
20. "-" para sin dato: cambiar a "—".
21. Separar la lógica de demostración de la pantalla real.
22. La demostración comparte caché con datos reales: separarla.
23. "Hoy" no se actualiza pasada la medianoche si la pantalla queda abierta.
24. Una prueba de base de datos falla por tiempo cuando corren todas juntas: ampliar su límite.

## Detalles técnicos

- Archivos: `src/pages/Flota.tsx`, `src/pages/FleetWorkspace.tsx`, `src/features/fleet/{InvoiceUpload,ManagementTable,managementModel,managementApi,api,period,useFleet,workbookImports}`, `src/lib/permissions.ts`, `src/components/lists/CompactListTable.tsx` (modo una línea opcional).
- Nueva migración: `fleet_set_invoice_amount` con `p_version` y `p_reason`, incremento de versión y auditoría antes/después; `CHECK (amount >= 0)`; RPC para descartar/actualizar factura reservada.
- Pruebas nuevas: selección inicial con caché vacía, reintento con metadatos editados, conflicto de versión en monto, consumo independiente de búsqueda, rango inválido, monto negativo.
- Actualizar `docs/knowledge/34-Flota.md` y hacer commit/push a `origin/main` al terminar; informar la migración aplicada.
- Se hará por tandas: primero alta, luego media, luego baja.
