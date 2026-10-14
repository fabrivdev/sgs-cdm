# Servicios y comisiones

La semántica de servicios_cantidad para eficiencia sigue pendiente de verificar. Consultar [[26-Ordenes-servicio-y-productividad]] antes de llamarlo horas trabajadas acreditadas; horas OS, horas-persona y horas cobradas no se intercambian.

La sección activa de Órdenes de servicio reúne Órdenes, Productividad y Cumplimiento; ver [[26-Ordenes-servicio-y-productividad]] para sus fuentes, cálculos, incidencias y límites. Esta vista operativa no reemplaza la población financiera de Ventas ni los estados de validación/liquidación de Comisiones.

Para revisar con TI las anomalías de extracción del sistema nuevo, reparaciones puntuales y ajustes que deben sobrevivir a reimportaciones, ver [[31-Calidad-XML-sistema-nuevo-reunion-TI]].

## Conceptos que no deben confundirse

Una OS identifica una orden; un trabajo puede agrupar actividad; una jornada registra participación operativa de un técnico. Horas OS y horas-persona no son intercambiables. La fecha de apertura, la fecha del trabajo y la fecha de factura responden preguntas distintas.

Cantidad de MO en el detalle de Ventas: usar el campo operativo `ordenes_servicio_importadas.servicios_cantidad` (bloques de trabajo deduplicados), no el 1 de la línea de factura ni sumar participantes. Cantidad de Km: `km_cantidad`. Son referencias de la OS completa que pueden repetirse por línea; no reemplazan horas-persona, reparto técnico ni desglose por tiempo. Fuente: `docs/ventas-servicios-busqueda.md` y migración `20260917160000_service_invoice_line_operational_quantity.sql`, de aplicación manual.

Ventas de Servicios representa facturación emitida en el período, aunque el trabajo sea de un mes anterior. Medir lo efectivamente trabajado en el mes es otra perspectiva, no un cambio de fecha silencioso en Ventas.

## Tipos de tiempo

Cliente, Garantía e Interno pueden coexistir en una OS. No reducir una OS mixta al primer tipo encontrado. `No informado` representa falta de evidencia, no un nuevo tipo de tiempo comercial.

Las correcciones manuales de Comisiones deben conservarse por identidad estable y participar en las fuentes de Ventas que las utilizan; no depender únicamente del ID de una fila reimportada.

Fuente: migración `20260825190000_persist_commission_time_type_overrides_by_identity.sql`, `docs/ventas-servicios-busqueda.md`, `src/components/ventas/ServiciosTecnicos.tsx`.

## Participación y pago

Interacción del 18/09: Comisiones permite ordenar Resumen, OS y Liquidaciones, conservando población y selecciones liquidables. En el panel de una OS, Fecha ordena grupos de días y los otros encabezados ordenan jornadas dentro de cada día; Excel sigue ese orden, sin deduplicar jornadas ni convertir horas-persona en horas-reloj. Buscar/filtrar en ese panel solo afecta tabla y descarga; no altera las filas de pago, correcciones manuales ni KPIs de la OS. Mantener subtotales operativos deduplicados por bloque mediante helpers originales. Fuente: `src/pages/Comisiones.tsx`, `docs/tablas-orden-exportacion.md`; validación local, no liquidaciones reales.

La atribución de MO no debe duplicar la MO completa por cada participante. En la última definición localizada de `ventas_servicios_tecnicos_v1`, el reparto es por OS y tipo de tiempo:

`MO técnico = MO facturada de esa OS/tipo × horas computables del técnico / horas computables de todos los participantes de esa OS/tipo`.

Horas computables: priorizar `horas_validas`, luego `horas_calculadas`, luego `horas_reportadas`; mínimo cero. Incluir jornadas vigentes, no INVALIDA, con nombre de técnico; atribuir únicamente participación positiva. Priorizar `tipo_tiempo` corregido sobre `tipo_tiempo_importado`. Si no hay participación compatible, conservar MO como `Sin técnico atribuido`, no repartirla arbitrariamente.

La selección empieza por las OS facturadas en el período. Las jornadas asociadas NO se recortan por fecha de trabajo en esa RPC: pueden ser de julio si la OS se facturó en agosto. Esto explica por qué esas horas no equivalen a “trabajado en agosto”. La suma atribuida más el importe sin atribuir debe conciliar con la MO facturada seleccionada.

Fuente SQL comprobada localmente: `supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql`, función `ventas_servicios_tecnicos_v1`. Confirmar definición aplicada para afirmar lo mismo de producción.

Las jornadas vigentes, la validación y las liquidaciones son estados separados. Una OS reemplazada/anulada requiere exclusión persistente y trazabilidad para no reaparecer al importar ni producir doble pago. Conservar auditoría y no borrar una liquidación pagada sin un proceso autorizado.

## Nómina, acceso y presentación de técnicos

Registrar un operativo sin correo/contraseña crea un perfil activo sin cuenta; no genera roles ni permisos. La definición consolidada `servicios_es_tecnico_activo` acepta perfiles sin cuenta, pero exige Operativo y módulo Servicios cuando tienen cuenta, además de excluir inactivos, pasantes y niveles administrativos. `servicios_listar_tecnicos_activos` usa esa condición y valida acceso de quien consulta. El alta administrativa invalida la caché `servicios/tecnicos-activos`, cuya vigencia es de cinco minutos. Fuentes: `src/lib/admin-create-person.ts`, `src/pages/Admin.tsx`, `src/hooks/useServicioTecnicos.ts`, `20260821150000_consolidate_active_commission_technicians.sql`. Riesgo al asociar acceso posteriormente: ver [[07-Accesos-y-asistente]].

Ventas de Técnicos muestra nueve columnas y exporta las mismas: Técnico; Horas Cliente/Garantía/Interno; Total horas; MO Cliente/Garantía/Interno; MO total. No usar “asociada” ni columnas “sin clasificar”. `horas_otros`/`mo_otros` siguen en la respuesta y en sus totales originales: retirarlas visualmente no valida ni borra esos datos. Si hay valores pendientes de clasificación en filas filtradas, se muestra alerta. El filtro por nombre solo recorta presentación/exportación; no redistribuye MO ni recorta jornadas por mes trabajado. Fuente: `src/components/ventas/ServiciosTecnicos.tsx` y sus pruebas; implementación local, no validación productiva.

## Historial de máquina

Historial completo por chasis en una sola lista, sin pestañas: cada tipo de tiempo con evidencia en `totales_por_tipo` ocupa una fila de Servicio y cada repuesto facturado conserva su propia fila e ID financiero. Kilometraje y Terceros aparecen como ítems independientes solo cuando la fuente trae cantidad o importe real. Órdenes antiguas sin factura vinculada siguen visibles; la ausencia de vínculo no prueba que nunca se facturó. No inventar asociaciones por coincidencia de importe, cliente o fechas próximas. En el tramo legado, una OS sin tipo cuyo cliente informado sea externo se clasifica como `Cliente`; CAMPOS DEL MAÑANA, nombres ausentes y valores explícitos no reconocidos quedan `Por confirmar`. Es una clasificación de reporte y no modifica OS ni jornadas.

Fuente: `MachineHistorySheet.tsx`, RPC `ventas_servicios_historial`, `docs/pendientes-postventa.md`.

En el historial de máquina, las líneas cuyo importe conocido es cero se omiten. Si el importe es desconocido, se conserva la actividad solo cuando tiene cantidad real. Kilometraje usa el tipo de tiempo de la OS o su desglose, no “Kilometraje” como tipo; la descripción ya identifica el ítem.

## Listas compactas y alcance de exportación

Paso visual del 18/09: Planificador, OS vinculadas de Trabajos y los dos historiales de máquina comparten una tabla adaptable, una línea y ejes de texto/cantidad/importe. Secundarios en ficha por clic/teclado; acciones únicas `Más filtros → ⋮`. Planificador mantiene ID por jornada, aun el mismo servicio/día, cuadrilla propia y continuidad; exportador especializado de 28 campos y matriz semanal sin cambios de fórmulas. Fecha conserva texto ISO y consultas existentes: no afirmar que exporta más datos que los recibidos ni que elimina límites del servidor. Lecturas requeridas fallidas muestran error/reintento y bloquean exportación. OS vinculadas agrega factura, chasis y responsable al Excel; sus indicadores monetarios originales permanecen al retirar el subtotal duplicado de tabla.

Historial muestra horas-reloj, Km y cantidades numéricas. Una OS Cliente/Garantía/Interno se expande en filas por tipo únicamente desde el desglose real; cuando `totales_por_tipo` trae `valor_servicio`, se muestra el importe exacto de esa fila. Kilometraje hereda ese tipo de tiempo y se desglosa por tipo cuando la fuente lo permite; no usar “Kilometraje” como sustituto de Cliente/Garantía/Interno. Para una OS de un solo tipo puede usarse el total de MO de la OS; un total legado mixto queda `Sin desglose`, sin duplicarlo ni repartirlo. Si el importe de un movimiento es conocido y vale cero, no mostrar la línea aunque tenga cantidad; si el importe falta, conservarla únicamente con cantidad real. Facturas se presentan sin guiones ni espacios, conservando ceros iniciales y repeticiones en pantalla/Excel. Cada repuesto no excluido mantiene factura, códigos, cantidad, NC y centavos aunque se repitan factura u OS. Filtros del historial: movimiento, tipo de tiempo, estado, presencia de factura, fechas y búsqueda; no cambian la fuente. La carga requiere OS y repuestos: un fallo bloquea la lista y el Excel para no presentar un historial parcial. Encabezados breves, importe con `$` y dos decimales y archivo `.xlsx` único; otros formatos/monedas de la app no se convierten. No cambia exclusiones, validación, liquidaciones ni permisos. La RPC debe devolver los cuatro importes y completar como Cliente el legado con evidencia de facturación, salvo CAMPOS DEL MAÑANA; requiere `20260921130000_complete_machine_history_ledger.sql` y `20260921150000_refine_machine_history_time_type.sql`. La validación local no prueba producción. Fuentes: `src/components/lists/ServiceLists.test.tsx`, `MachineHistorySheet.test.tsx`, [[24-Condiciones-visuales-ventas]].
