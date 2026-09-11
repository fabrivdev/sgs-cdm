# Ventas de Servicios: cinco vistas alineadas al Excel de Postventa

Se elimina la pestaña "Análisis" y en su lugar la sección tendrá cinco vistas: **Resumen, Técnicos, Clientes, Máquinas, Detalle**, con las mismas columnas del archivo Indicadores_Postventa.

La tabla "Evolución de la facturación" sigue arriba, siempre visible, como está hoy.

## Vistas y columnas

**Resumen**
- Fila de totales del período: Neto, MO, Km, Repuestos, Terceros, OS facturadas, Documentos, Horas OS.
- Tabla por tipo de tiempo (Cliente, Garantía, Interno): MO, Km, Repuestos, Terceros, Neto, OS asociadas, Horas OS, Participación %.

**Técnicos**
- Técnico, Horas Cliente, Horas Garantía, Horas Interno, Total horas, MO Cliente asociada, MO Garantía asociada, MO Interno asociada, MO total asociada.
- Las horas salen de las jornadas cargadas (comisiones), por técnico y tipo de tiempo.
- La MO de cada OS se reparte en partes iguales entre los técnicos que participaron (2 técnicos en una OS de 10.000 → 5.000 cada uno) y se imputa al tipo de tiempo de cada jornada.
- Aclaración visible: la MO por técnico es una atribución, no facturación propia.

**Clientes**
- Cliente, OS, Facturas, Notas de crédito, MO, Km, Repuestos, Terceros, Neto, Participación %.
- Se mantiene el selector actual entre "Propietario actual" y "Cliente facturado".

**Máquinas**
- Marca, Tipo de máquina, Máquinas facturadas, OS facturadas, Horas OS, MO, Km, Repuestos, Terceros, Neto.
- Incluye la fila de lo no vinculado a una máquina, como en el Excel.

**Detalle**
- Se mantiene la tabla actual de OS facturadas (fecha, OS, chasis, propietario, sucursal, tipos facturados, facturas, MO, Km, Repuestos, Terceros, total), con el panel lateral de historial de máquina.

Todas las vistas respetan los filtros actuales de la barra superior: período, sucursal, tipo de tiempo, marca, tipo de máquina y búsqueda.

## Detalles técnicos

- Quitar `ServiciosAnalisis` de `src/pages/Ventas.tsx` y borrar `src/components/ventas/ServiciosAnalisis.tsx`.
- Cambiar el conmutador de vistas de `SalesExplorer` para el área servicios a cinco opciones; las áreas repuestos y máquinas conservan su comportamiento actual.
- Nueva migración con dos funciones (SECURITY DEFINER, misma verificación `has_section_access('servicios.ventas')` y mismos parámetros de filtro que `ventas_servicios_lineas_v2`):
  - `ventas_servicios_resumen_indicadores`: totales, apertura por tipo de tiempo y agregado por marca/tipo de máquina (Resumen y Máquinas).
  - `ventas_servicios_tecnicos`: horas y MO atribuida por técnico y tipo de tiempo, cruzando `comisiones_jornadas` (vigentes) con la MO de `ordenes_servicio_importadas` por `os_numero`, con reparto en partes iguales entre participantes de la OS. Nombres unificados con el mismo criterio de `matchTechnicianProfile` usado en el historial de máquina.
- Componentes nuevos: `ServiciosResumen.tsx`, `ServiciosTecnicos.tsx`, `ServiciosMaquinas.tsx`; `ServiciosClientes.tsx` suma las columnas Notas de crédito y Participación.
- Regenerar tipos de Supabase y añadir tests de los cálculos de reparto de MO.
