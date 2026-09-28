# Técnicos: horas de OS y facturación

## Alcance de las dos lecturas

Ventas → Indicadores de postventa → Técnicos no mide productividad ni horas facturadas. Usa fecha de factura y filtros financieros para elegir movimientos. La tabla principal muestra las horas computables del técnico en OS/tipos de tiempo que tienen una línea real de Servicio dentro de esa selección. Son horas trabajadas de esas OS, incluso de jornadas anteriores, no importe dividido por tarifa ni horas trabajadas dentro del rango.

Una OS puede facturar MO en una fecha y repuestos, kilometraje o terceros después. La RPC anterior seleccionaba OS por cualquier movimiento, mostraba todas sus horas, pero atribuía solo la MO del rango: producía comparaciones de horas completas contra cero de un período diferente. La corrección no trae importes de fuera del filtro para rellenar el cero.

## Conservación de información

- `ventas_servicios_tecnicos_v2` conserva en `detalle_os` las horas de todos los técnicos y tipos de las OS con movimientos seleccionados, aunque no tengan MO coincidente. `horas_os` conserva ese contexto; `horas_mo` solo se informa cuando existe la línea Servicio del mismo OS/tipo. No desaparecen técnicos por tener únicamente cargos no laborales.
- Al abrir el técnico, el panel identifica OS y tipo y muestra Horas OS / MO en período. Si la selección no contiene MO, el importe queda `—` y se indica `Sin MO en los filtros actuales`. No significa que nunca se haya facturado: no se consultan facturas fuera del rango.
- Las nueve columnas principales y su Excel se conservan. La descarga adicional `Exportar horas y MO por OS`, en el único menú de sección, conserva el desglose completo de todos los técnicos filtrados (no solo el panel abierto), agrupado por técnico y OS/tipo. Conserva ceros iniciales como texto, horas numéricas, centavos, negativos y ausencias. Requiere `datos:exportar`.
- Horas ausentes del grupo con MO se representan con `—`, no con cero inventado. Una línea de MO explícitamente cero o factura compensada por NC sí acredita pertenencia al grupo: decidir por existencia de línea, nunca por suma distinta de cero.
- La MO sigue el reparto proporcional por OS y tipo entre jornadas vigentes, no inválidas y con horas positivas. Tipo manual prevalece sobre importado; horas válidas/calculadas/reportadas conservan la prioridad anterior. MO sin participación atribuible permanece en `Sin técnico atribuido`; no inventar horas ni repartir entre técnicos de otro tipo.
- El filtro local por técnico no recalcula participaciones ni modifica el resto de los indicadores. Cambios de filtros cierran el panel, retiran datos/exportaciones anteriores y cancelan respuestas obsoletas.

## Fuentes y límites

Implementación: `src/components/ventas/ServiciosTecnicos.tsx`, `ServiceTechnicianDetail.tsx`, `serviceTechnicianModel.ts`; opt-in móvil `SalesDataTable.onDetailClick` → `MobileSalesTable.onDetailClick`. Técnicos usa el formato compacto por debajo de 1280 px para no recortar sus nueve encabezados; selector y Excel conservan las columnas. Las demás tablas mantienen su breakpoint e inspección genérica.

SQL manual: `supabase/migrations/20260928150000_align_technician_hours_with_billed_labor.sql`, después de los helpers de filtros `20260917180000_service_sales_shared_filters.sql`. Crea una RPC nueva de consulta con el mismo permiso `servicios.ventas`; no reemplaza las v1 ni modifica tablas, jornadas, ajustes, importes, Comisiones, productividad o eficiencia. Si falta la RPC, la UI pide el SQL concreto, sin volver al cálculo anterior ni mostrar resultados generales como filtrados.

Pruebas: `scripts/verify-service-technician-cohort-sql.mjs` reproduce MO y otros cargos en fechas diferentes con datos ficticios, conciliación monetaria, tipos mixtos, ceros, NC, sin OS, sin horas, filtros, permisos, repetibilidad y fuentes sin cambios. `ServiciosTecnicos.test.tsx` cubre tabla, conservación en panel/móvil/Excel, identidades, errores y cambio de rango. Aplicar [[24-Condiciones-visuales-ventas]] y [[25-Revision-movil-transversal]]. Validación local no acredita aplicación de SQL ni despliegue productivo. Esta copia de trabajo no contiene el atlas JSON ni configuración de sincronización de Obsidian; no se modifica otra copia para simular sincronización.

Comprobación local del 28/09: 140 pruebas de Ventas pasan con un trabajador (`--testTimeout=20000`); dos ejecuciones paralelas previas agotaron los 5 s en una prueba de Repuestos, que pasó aislada y en la ejecución final sin modificar su lógica. PostgreSQL aislado, tipos y compilación correctos. Navegador con componentes reales y datos ficticios a 320/390/1024/1280/1440 px: sin desborde del documento, detalle por nombre/icono, conservación de horas sin MO y encabezados íntegros desde 1280 px. Dos Excel descargados e inspeccionados verifican nueve columnas del resumen, filtro local, desglose de todos los técnicos, OS como texto, horas, ausencias y NC con centavos. No se alteran ni validan cifras productivas con estas fixtures.
