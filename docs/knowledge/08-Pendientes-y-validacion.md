# Pendientes y validación

Estado revisado el 14/10/2026 contra main cac486c, las cinco copias locales y el contexto confirmado por Fabrizio. Esta es la lista de continuidad de la app; las notas de cada tema guardan sus detalles.

| Tema | Estado | Qué falta para cerrar |
| --- | --- | --- |
| Importación TOTVS | Correcciones 109e5f7 y 1f3e6ee integradas. El resultado comunicado de 4.117 activas y 2 exclusiones fue con rollback. | Comprobar carga persistida y reimportación sin duplicados, conservando exclusiones; validar que pueda importarse sin Mayor. |
| Libro Mayor | Conflicto de identidad con otra huella sin resolución acreditada. | Identificar movimiento y diferencia real; separar enriquecimiento de cambio contable antes de proponer reparación. |
| Servicios sin OS | SQL 20261013201000 y prueba locales, fuera de main. Aplicación desconocida. | Comprobar función efectiva y población: evidencia previa comunicada de 739 líneas con OS, 13 operativas sin OS y cinco genéricas excluidas. No son conteos productivos revalidados hoy. |
| Facturas por máquina | Frontend, SQL y pruebas locales. Main conserva vínculo por lote. | Integrar selectivamente, coordinar SQL, probar dos unidades y reemplazo/borrado independiente; históricos sin reasignación automática. |
| Panel gerencial | Local; no integrar a main ni publicar todavía. | Validar fórmulas y fuentes, meses cerrados automáticos, actualización estable, carga total ≤5 s y aceptación visual. |
| Semáforo de stock | Local. V3 aplicada según contexto del usuario; distribución no validada. V4 preparada según ese contexto. | Revisar maestro de junio, últimas ventas/compras, todo el histórico y equivalencias acreditadas. No incluir Compras sin prueba de ingreso. |
| Eficiencia de OS | Denominador servicios_cantidad; significado real pendiente. | Contrastar campo, XML y jornadas. El 23 deducido de 16/23 no fue consultado en base. |

## Ya integrado: no volver a desarrollar

- 8295892: Agustín Martínez y Agustín Martínez Fernández unificados; filtro local y aviso rojo retirados.
- cac486c: “Facturación por período” uniforme; Servicios sin desplegable ni título duplicado.
- 9f00139: corrección de doble descuento de OC, confirmada como antecesora de main. Falta distinguir disponibilidad pública de integración de código.

## Verificaciones históricas, sin cierre nuevo

La QA de factura 4812, conflictos de duplicados/NC, fechas nulas, contradicciones del Kardex, adjuntos HORSCH y auditoría de comisiones permanecen en [[SIG CDM/Personal/Objetivos/00-Objetivos|Objetivos]]. No declararlos resueltos ni incidentes actuales sin una nueva comprobación. Tampoco dar por activas hoy las recurrencias registradas el 01/10.

## Criterios de validación

Conciliar filtros, signos y fuentes; preservar desconocidos, exclusiones y trazabilidad. No inferir anulación de OS por ausencia en otro archivo. Una prueba local, un push o una validación con rollback no acreditan datos persistidos ni despliegue. Fabrizio realiza la publicación pública. No ejecutar SQL hasta identificar qué está aplicado.
