# Historial de la máquina: técnicos unificados, columnas separadas y resumen más claro

Tres ajustes visuales en el panel lateral "Historial de la máquina" (el que se abre desde una OS o desde el chasis en Ventas de servicios).

## 1. Técnicos unificados

Hoy la columna "Técnicos" muestra el texto crudo del responsable de la OS vieja (con códigos delante, acentos y variantes del mismo nombre).

Pasará a mostrarse igual que en Dashboard / Servicios (Carga por responsable):
- se listan todos los participantes de la OS (responsable + mecánicos auxiliares), no solo uno;
- cada nombre se normaliza y, cuando coincide con un técnico registrado, se muestra el nombre oficial de esa persona;
- si no hay coincidencia, se muestra el nombre limpio de la OS; si no hay nadie, "Sin técnico asignado";
- nombres repetidos por variantes de escritura se muestran una sola vez.

La búsqueda del panel también encontrará la OS por el nombre unificado.

## 2. Tipo de tiempo y Horas OS en columnas separadas

La columna actual "Tipo de tiempo · horas OS" se divide en dos:
- **Tipo de tiempo**: Cliente / Garantía / Interno (una línea por tipo cuando hay varios).
- **Horas OS**: las horas de cada tipo, alineadas a la derecha en la misma línea que su tipo.

Se mantiene el desglose por tipo tal como está calculado hoy; no cambia ningún número.

## 3. Resumen del encabezado

La franja de resumen (cantidad de OS, horas y participación por tipo) pasa de ser una línea de texto corrida a un bloque de tarjetas compactas:
- una tarjeta principal con OS y horas totales del filtro aplicado;
- una tarjeta chica por tipo de tiempo, con horas y porcentaje, usando los colores ya definidos para Cliente, Garantía e Interno;
- tipos sin horas en el período se muestran en 0, no se ocultan.

## Detalles técnicos

- Archivo: `src/components/ventas/MachineHistorySheet.tsx`.
- Técnicos: usar `importedServiceOrderParticipants` + `matchTechnicianProfile` / `displayImportedTechnicianName` de `src/lib/technicianMatching.ts`, con la lista de técnicos de `useServicioTecnicos()` (`src/hooks/useServicioTecnicos.ts`). Si esa lista falla o aún carga, se cae al nombre normalizado sin bloquear la tabla.
- Tabla de OS: encabezados pasan a `["Apertura","OS","Estado","Técnicos","Tipo de tiempo","Horas OS","Km OS","Factura registrada"]`; `hoursByType` se sigue usando tal cual, renderizando tipo y horas en celdas distintas alineadas por fila.
- Resumen: reemplazar la franja `flex flex-wrap` por una grilla de tarjetas con las clases de densidad ya usadas en el proyecto (bordes `rounded-md border`, texto 10–13px).
- Actualizar `src/components/ventas/MachineHistorySheet.test.tsx`: hoy espera el texto combinado `"Cliente · 5 h"`, que deja de existir al separar columnas.
