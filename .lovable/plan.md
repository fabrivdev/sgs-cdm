# Por qué no coinciden los números de Ventas de Servicios

Revisé los datos reales de agosto. Los dos problemas tienen causas distintas y ninguna es un error de suma.

## 1. Los 65.215 vs 67.155: son períodos distintos, no cálculos distintos

- La tabla de arriba (Evolución) muestra **el mes de agosto**: 65.215,08.
- El bloque Resumen muestra **todo el rango de fechas elegido**, que en ese momento llegaba hasta el 1 de septiembre. La facturación del 1 de septiembre fue de 1.939,79, y 65.215,08 + 1.939,79 = 67.154,87, exactamente el 67.155 que se ve.

Verifiqué además que Resumen, Clientes, Máquinas y Detalle dan todos 65.215,08 para agosto calendario, igual que el Excel. No hay filas duplicadas ni cifras infladas.

**Qué hacer**
- Agregar en Evolución una fila final "Total del período" con el total del rango completo, para que el número de arriba y el de abajo se puedan conciliar a simple vista.
- Mostrar en el Resumen el rango exacto que está sumando (por ejemplo "01/08 al 01/09"), en vez de dejarlo implícito.

## 2. Las horas y la MO por técnico no coinciden con el Excel: son reglas distintas

Comparé fila por fila el Excel de agosto contra la app:

- **MO por técnico.** El Excel le asigna a cada técnico la MO **completa** de cada OS en la que participó (por eso su total de MO es 52.615, casi el doble de la MO real de agosto, 29.769). La app la reparte en partes iguales entre los participantes, así que la suma cierra con la facturación. La app es la correcta; el Excel duplica.
- **Terceros.** El Excel suma Terceros dentro de MO (por eso su columna Terceros da 0 y su MO da 29.768,65 contra 26.193,62 de la app). La diferencia es exactamente el monto de Terceros. La app los separa, que es lo pedido en las columnas nuevas.
- **Técnicos que ya no están.** El Excel tiene una nota que dice que se eliminaron técnicos que ya no forman parte; por eso lista 17 y la app 22. Los que faltan en el Excel (Evaristo Daniel Molinas, Denis Benítez, Alfredo Acevedo, Alcides Valdez, Ricardo Villar) sí tienen jornadas cargadas en agosto.
- **Horas.** El Excel totaliza 581,75 horas; la app 897 horas-persona; las horas de las OS son 438,5. Son tres medidas distintas: horas de la OS, horas-persona de todos los que participaron, y el recorte del Excel.

**Qué hacer**
- Mantener el reparto de MO en partes iguales (cierra con la facturación) y dejar la aclaración en el encabezado, como ya está.
- Titular la columna de horas como **Horas-persona** y agregar arriba de la tabla una línea corta con el contraste: horas de las OS del período vs horas-persona cargadas.
- Agregar un interruptor "Solo técnicos activos" (por defecto apagado) para poder reproducir el recorte del Excel sin ocultar datos reales.
- Documentar en `docs/pendientes-postventa.md` que el Excel incluye Terceros dentro de MO y no reparte la MO entre participantes, para que no se lo tome como referencia exacta.

## Detalles técnicos

- Cambios de UI únicamente en `ServiciosPanorama.tsx` (fila de total del período), `ServiciosResumen.tsx` (rango visible) y `ServiciosTecnicos.tsx` (rótulo de horas, línea de contraste, filtro de activos, cruzando con `servicios_listar_tecnicos_activos` que ya se consulta ahí).
- No hacen falta migraciones: `ventas_servicios_indicadores_v1`, `ventas_servicios_panorama_v2`, `ventas_servicios_lineas_v2` y `ventas_servicios_detalle_os_v2` devuelven los mismos 65.215,08 para agosto.
