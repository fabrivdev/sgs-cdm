# Pendientes técnicos

## Facturación canónica y control transversal de duplicados

**Estado:** pendiente para una etapa posterior  
**Prioridad:** alta antes de considerar definitivos los indicadores de facturación

### Problema

La aplicación conserva distintas representaciones de una misma operación en
`facturacion`, `facturacion_lineas_importadas`, `repuestos_ventas_vinculacion`
y `repuestos_demanda_mensual`. La deduplicación implementada protege el
historial consolidado de repuestos, pero Dashboard, Parque, la ficha del
cliente y el asistente de datos todavía pueden consultar o combinar fuentes
con reglas diferentes.

### Riesgo

- Una operación importada desde GRID y desde el histórico detallado puede
  contabilizarse dos veces en consumidores que lean las líneas originales.
- Dos pantallas pueden mostrar totales distintos para el mismo período.
- Los duplicados dentro de una misma fuente solo se auditan; no se excluyen
  automáticamente porque podrían ser renglones comerciales legítimos.
- Los agregados de sugerencias pueden quedar desalineados si no se reconstruyen
  después de modificar las vinculaciones.

### Solución prevista

1. Definir el grano canónico de una línea comercial y su clave de identidad.
2. Crear una única capa canónica que preserve procedencia, línea elegida y
   motivo de exclusión, sin borrar las fuentes originales.
3. Migrar Dashboard, Parque, clientes, repuestos y asistente IA para que todos
   consuman esa capa.
4. Incorporar controles automáticos de unicidad, integridad y paridad de
   totales entre la fuente canónica, los agregados y cada consumidor.
5. Revisar por separado los posibles duplicados dentro de una misma fuente.

### Evidencia actual

- La depuración de repuestos llegó a excluir 2.809 vinculaciones solapadas
  entre fuentes; las líneas crudas permanecen disponibles para auditoría.
- No existen todavía pruebas automáticas que garanticen la paridad de totales
  entre todas las pantallas.

## Diferencia entre exportaciones de clientes del parque

**Estado:** pendiente para una etapa posterior

Comparar las exportaciones `parque-clientes-2026-08-19.xlsx` y
`parque-clientes-2026-08-20.xlsx`, identificar el cambio de población o de
métricas y comprobar que filtros, período y fuentes sean equivalentes antes de
modificar el cálculo.
