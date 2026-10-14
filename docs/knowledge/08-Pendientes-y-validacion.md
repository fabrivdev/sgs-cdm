# Pendientes y validación

Estado revisado el 14/10/2026 contra main cac486c, las cinco copias locales y el contexto confirmado por Fabrizio. Esta es la lista de continuidad de la app; las notas de cada tema guardan sus detalles.

| Tema | Estado | Qué falta para cerrar |
| --- | --- | --- |
| Importación TOTVS | La última carga consultada tiene 4.117 líneas fechadas acreditadas y dos exclusiones, pero también figuran 775 vínculos históricos sin fecha en su procedencia. Hay SQL puntual con controles y auditoría, probado localmente; aplicación pendiente. | Ejecutar el SQL manual solo si los controles de carga/hash y 4.892=4.117+775 siguen vigentes; verificar 4.117 vínculos finales sin borrar facturas. Validar reimportación sin Mayor. |
| Libro Mayor | El XML actualizado tiene 32.461 movimientos; 3.421 claves nuevas y 1.041 claves con huella distinta respecto de la carga completa previa. Nueve cambian clasificación contable y ningún importe. Migración versionada, confirmación de cambios y pruebas locales preparadas. | Aplicar SQL manual, publicar código por Fabrizio e importar el XML con su usuario autorizado. Comprobar control final, foto activa única e historia previa auditable. |
| Servicios sin OS | SQL 20261013201000 y prueba locales, fuera de main. Aplicación desconocida. | Comprobar función efectiva y población: evidencia previa comunicada de 739 líneas con OS, 13 operativas sin OS y cinco genéricas excluidas. No son conteos productivos revalidados hoy. |
| Facturas del proveedor por lote | SQL aplicado el 14/10. Tras nuevas cargas se observaron 37 documentos, 37 vínculos y ninguno sin asignar. Un lote revisado conserva dos unidades con datos de factura, pero sin archivo vinculado. La corrección de vista está publicada en GitHub; Lovable marca los commits nuevos como `Build unsuccessful` / `Preview is out of date` y muestra `You're out of credits`. | Resolver el build/publicación en Lovable y comprobar que cada unidad muestre solo su archivo; revisar los archivos faltantes y probar varias facturas en un lote y borrado independiente. |
| Panel gerencial | Local; no integrar a main ni publicar todavía. | Validar fórmulas y fuentes, meses cerrados automáticos, actualización estable, carga total ≤5 s y aceptación visual. |
| Semáforo de stock | Migración 20261014220000 y carga GRID aplicadas con autorización; 7.167 fechas persistidas. Dashboard verificado en vista previa con fabrizio.vega: 10.044 códigos, 6.854 con última compra y USD 4.773.445,70 conciliados. | Publicación pública a cargo del usuario. Incorporar facturas de compra TOTVS (fuente vacía); no pedidos. Rotación continúa pausada. Ver [[06-Repuestos]]. |
| Eficiencia de OS | Denominador servicios_cantidad; significado real pendiente. | Contrastar campo, XML y jornadas. El 23 deducido de 16/23 no fue consultado en base. |

## Ya integrado: no volver a desarrollar

- 8295892: Agustín Martínez y Agustín Martínez Fernández unificados; filtro local y aviso rojo retirados.
- cac486c: “Facturación por período” uniforme; Servicios sin desplegable ni título duplicado.
- 9f00139: corrección de doble descuento de OC, confirmada como antecesora de main. Falta distinguir disponibilidad pública de integración de código.

## Verificaciones históricas, sin cierre nuevo

La QA de factura 4812, conflictos de duplicados/NC, fechas nulas, contradicciones del Kardex, adjuntos HORSCH y auditoría de comisiones permanecen en [[SIG CDM/Personal/Objetivos/00-Objetivos|Objetivos]]. No declararlos resueltos ni incidentes actuales sin una nueva comprobación. Tampoco dar por activas hoy las recurrencias registradas el 01/10.

## Criterios de validación

Conciliar filtros, signos y fuentes; preservar desconocidos, exclusiones y trazabilidad. No inferir anulación de OS por ausencia en otro archivo. Una prueba local, un push o una validación con rollback no acreditan datos persistidos ni despliegue. Fabrizio realiza la publicación pública. No ejecutar SQL hasta identificar qué está aplicado.
