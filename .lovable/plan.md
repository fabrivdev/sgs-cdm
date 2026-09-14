# Limpieza de chasis en Ventas del parque

## Problema confirmado
- En la base hay 3 chasis históricos guardados con el sufijo "-MOTOR": `C8511085-MOTOR`, `C8511090-MOTOR`, `C8511093-MOTOR`. Esas mismas máquinas existen en el parque como `C8511085`, `C8511090` y `C8511093` (cosechadoras CLAAS), o sea el sufijo es un residuo del dato viejo, no parte del chasis real.
- En el Detalle de Ventas del parque, el chasis es un enlace que abre el historial de servicios de la máquina. Ese historial ya vive en Servicios; acá no aporta.

## Cambios

1. **Corregir el dato en la base**
   - Migración que actualiza `ventas_maquinas_historico_lineas` quitando el sufijo `-MOTOR` de los 3 chasis afectados, dejándolos iguales a la serie real del parque.
   - Beneficio extra: el chasis corregido vuelve a coincidir con el parque, así que cruces futuros (actividad, historial) funcionan bien para esas máquinas.

2. **Detalle sin historial de servicios**
   - En la tabla Detalle de Ventas del parque, el chasis pasa a ser texto plano (sin enlace).
   - Se quita la apertura del panel de historial de servicios desde esa tabla.

## Detalle técnico
- Nueva migración SQL: `update public.ventas_maquinas_historico_lineas set chasis = replace(chasis, '-MOTOR', '') where chasis ilike '%-MOTOR'`.
- `src/components/ventas/MaquinasVentas.tsx` (DetailTable): reemplazar el botón de chasis por texto y eliminar el estado `history` y el uso de `MachineHistorySheet` en esa tabla.
- Sin cambios en cálculos, filtros ni otras vistas. El historial de la máquina sigue disponible desde Servicios.
