## Diagnóstico

Revisé la base de datos y encontré la causa real:

| Tipo | Cantidad | Min fecha | Max fecha |
|------|----------|-----------|-----------|
| Repuesto | 53.029 | 2010-02-10 | **2026-03-31** |
| Servicio | 4.471 | 2010-03-11 | **2025-01-25** |

Los datos **sí están cargados** (4.471 facturas de Servicio, todas con `grupo_fx = MANO DE OBRA`), pero la última factura de Servicio en la base es de **enero 2025**. Como el filtro por defecto del Parque es "últimos 365 días" (desde abril 2025), **0 clientes** tienen servicio en ese rango → la columna Servicio aparece toda en ✗ y los días desde último servicio salen >365.

Hay dos problemas reales:

1. **El Excel `FACTURACIÓN_HISTORICA.xlsx` que importaste no contiene las facturas de Servicio recientes (2025-2026)**. Los repuestos llegan a marzo 2026 pero los servicios se cortan en enero 2025.
2. **El importador filtra Servicios sólo por `grupo_fx` con "MANO DE OBRA" o "KILOMETRAJE"** (líneas 438-441 de `ImportarTab.tsx`). Si las facturas de servicio del Excel tienen otros valores en GRUPO FX, se descartan silenciosamente sin avisar.

## Plan

### 1. Agregar diagnóstico al importador de Facturación
En `ImportarTab.tsx` (función `procesarFact`), separar contadores por hoja y mostrar resumen previo:
- Filas leídas por hoja (Repuestos / Servicios)
- Filas descartadas por filtro `Tp. Movimento ≠ S`
- Filas de Servicio descartadas por `grupo_fx` no reconocido (con lista de los grupos descartados y conteo)
- Filas sin fecha o sin entidad

Mostrar este resumen como toast + sección colapsable arriba del preview.

### 2. Relajar el filtro de Servicios en la importación
Actualmente sólo se acepta Servicio si `grupo_fx` contiene "mano de obra" o "kilometraje". Cambios:
- **Importar TODAS las filas de la hoja Servicios** que pasen el filtro `Tp. Movimento = S` (no filtrar por grupo_fx).
- Mantener `grupo_fx` y `grupo` en la base (ya existen las columnas).
- El filtro "sólo mano de obra/kilometraje" sigue rigiendo en `ParqueTab` (`esServicioValido`) para "días desde último servicio" y la columna Servicio.

Así no se pierden datos en la importación; el filtrado comercial se hace al visualizar.

### 3. Agregar contador de tipos en la previsualización del importador
En la tabla preview de Facturación, mostrar arriba:
- `X facturas Repuesto (Y nuevas)`
- `Z facturas Servicio (W nuevas)`

Para ver de un vistazo si el archivo trae servicios antes de confirmar.

### 4. Mejorar mensaje cuando 0 servicios en rango
En `ParqueTab`, si el rango activo no contiene ninguna factura de Servicio, mostrar un aviso arriba: *"No hay servicios facturados en el período seleccionado. Última factura de servicio en la base: DD/MM/YYYY"*. Eso explica por qué la columna sale toda en ✗.

## Detalles técnicos

- Archivos a modificar:
  - `src/components/parque/ImportarTab.tsx`: quitar filtro por `grupo_fx` (líneas 438-441), agregar contadores diagnósticos por hoja, exponer resumen.
  - `src/components/parque/ParqueTab.tsx`: agregar aviso cuando no hay servicios en rango.
- No se modifica la base de datos ni los esquemas.
- Después del fix vas a tener que volver a subir `FACTURACIÓN_HISTORICA.xlsx` para recuperar los servicios que estaban siendo descartados (si el archivo los trae).

## Acción recomendada después del fix

1. Confirmar el plan.
2. Subir nuevamente `FACTURACIÓN_HISTORICA.xlsx` con el importador corregido.
3. Revisar el resumen diagnóstico: ahí veremos si el Excel realmente trae servicios 2025-2026 o si el corte está en el archivo fuente.