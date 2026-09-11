# Historial de máquina: filas compactas, estado unificado, facturas y total OS

Cambios en la pestaña "Historial de OS" del panel de máquina (`src/components/ventas/MachineHistorySheet.tsx`) más una migración para exponer los importes.

## 1. Filas compactas
- Hoy técnicos, tipos y horas se renderizan con un `<div>` por ítem, lo que estira la fila cuando hay varios técnicos o tipos mixtos.
- Pasar a texto en una sola línea con `, ` como separador y `truncate` + `title` (tooltip con la lista completa) para técnicos; tipo de tiempo y horas también en una línea (`Garantía: 2 h · Cliente: 6 h` para horas). `whitespace-nowrap` donde aplique y alto de fila uniforme.

## 2. Estado unificado
- Normalizar `situacion_os` con capitalización tipo oración: `CERRADA` → `Cerrada`, `ABIERTA` → `Abierta`. Fallback `—` en vez de "No informado" para mantener la celda corta.

## 3. Facturas
- `row.factura` puede traer varias separadas por `;`. Mostrar la primera + badge `+N` cuando hay más, con `title` mostrando todas. Ejemplo: `0010001005021 +1`.
- Cuando no hay factura: mostrar `—` (en muted) en lugar de "Sin dato de facturación".

## 4. Total $ de la OS
- Migración: en la RPC `ventas_servicios_historial` (vista `os`) agregar al SELECT las columnas `servicios_valor`, `repuesto_valor`, `kilometro_valor`, `terceros_valor` de `ordenes_servicio_importadas` (misma fórmula de total que usa TrabajosOSTab: suma de los cuatro).
- En el frontend: nueva columna "Total OS" al final, alineada a la derecha, formato `money()`. Si los cuatro valores son null → `—`.
- Actualizar el tipo `Row` del componente.

## 5. Test
- Actualizar `src/components/ventas/MachineHistorySheet.test.tsx`: filas con factura múltiple, estado en mayúsculas y valores para verificar total, `+N` y `—`.

## Verificación
- `npx tsc --noEmit` limpio y tests del componente en verde.
