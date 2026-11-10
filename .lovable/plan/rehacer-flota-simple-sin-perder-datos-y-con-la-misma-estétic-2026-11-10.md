# Rehacer Flota: simple, sin perder datos y con la misma estética de la app

## Qué cambia para el usuario

**Menú Flota (igual que hoy):** Vehículos · Combustible · Mantenimiento · Cargar factura (Operativos solo ve esta última).

### 1. Vehículos (lista)
- Barra de filtros estándar de la app en una sola fila: Buscar, Estado, Sucursal, Departamento. El resto va al panel lateral "Más filtros", igual que en Ventas.
- 4 tarjetas arriba: Vehículos activos · Km del período · Gasto combustible · Gasto mantenimiento.
- Tabla de una línea por vehículo: Chapa, Marca/modelo, Responsable, Sucursal, Estado, Última lectura (km), Km del período. Con scroll interno si hay más de 20 filas.

### 2. Ficha del vehículo: una sola página, todo visible
- Encabezado: chapa, marca/modelo, responsable, sucursal, estado y botón "Editar".
- Tarjetas: Km actuales · Km del período · Litros · Gasto combustible · Gasto mantenimiento · Consumo estimado (L/100 km).
- Pestañas alineadas al título: **Combustible · Mantenimiento · Lecturas**.
  - Combustible: una tabla de cargas (fecha, km, litros, importe, moneda). Se quita el selector "Resumen mensual / Cargas".
  - Mantenimiento: una tabla única que une historial y facturas (fecha, tipo, descripción, proveedor, importe, factura). Se quitan las tres vistas separadas.
  - Lecturas: tabla de lecturas de km y cambios de responsable, sin la pantalla vieja embebida.
- Se eliminan: los desplegables con flecha ("Lecturas y responsables", "Cambios del vehículo"), la ventana flotante del consumo y la lista de cambios de auditoría (los datos quedan guardados, no se borran).

### 3. Combustible y Mantenimiento (generales)
- Mismo patrón: filtros en una fila, tarjetas arriba, una tabla principal. Sin selectores de vista ni textos explicativos.

### 4. Datos que hoy se pierden (se corrigen)
- La moneda de las cargas de combustible se lee del Excel o se elige al importar; nunca "Sin moneda".
- Reintentar una factura guarda realmente los datos editados.
- Editar un importe no pisa el cambio de otro gerente y queda registrado el valor anterior.
- Botón "Descartar intento" cuando una carga queda trabada.
- No se aceptan importes negativos.
- El consumo se calcula con todas las cargas del vehículo, no solo las visibles por la búsqueda.
- La ficha ya no pierde el vehículo al abrirse.
- Fechas inválidas muestran aviso en vez de lista vacía.

## Detalles técnicos
- Usar `FiltersBar`, `SummaryCard`, `TableScroll`/`RowCount`/`scrollHead`, `Tabs` y `ResponsiveDrawer` existentes; etiquetas 11px, capitalización de oración, `—` sin dato, colores del tema.
- `FleetWorkspace.tsx` se divide en `VehiclesList`, `VehicleDetail`, `FuelView`, `MaintenanceView` dentro de `src/features/fleet/`; se deja de renderizar `Flota.tsx` en producción (queda solo para la vista de demostración, con clave de caché propia).
- `ManagementTable`: quitar `expanded` y el diálogo de columnas; filas memoizadas para no volver a página 1.
- Migración: `fleet_set_invoice_amount(p_id, p_amount, p_currency, p_version, p_reason)` con control de versión y auditoría; `CHECK (amount >= 0)`; RPC para actualizar o descartar factura reservada. Sin borrar datos.
- `workbookImports.mjs`: leer moneda o recibirla como parámetro de importación.
- Pruebas: ficha con caché vacía, reintento con datos editados, conflicto de versión, consumo independiente de la búsqueda, importe negativo, moneda importada.
- Actualizar `docs/knowledge/34-Flota.md`; commit y push a `origin/main` al terminar.
