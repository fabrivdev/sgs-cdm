# Órdenes de servicio y futura analítica transversal

## Plan actualizado — 25/09/2026

Una sola sección de Servicios con Órdenes, Productividad y Cumplimiento. Ventas no se amplía ni cambia su población financiera. Planificador conserva la agenda móvil sin horas. Comisiones sigue siendo el único espacio de validación/liquidación; consultar indicadores no autoriza pagos o cambios de estado.

Retirar el acceso al Dashboard anterior sólo después de comprobar cobertura operativa, permisos, filtros, exportaciones y diseño móvil. Su consolidado financiero no se traslada a Ventas en esta etapa. Preservar gráficos y utilidades compartidos para un futuro espacio transversal de analítica, fuera de Servicios: esa futura ubicación no se crea ni recibe permisos por este cambio.

## Etapas y límites

1. Extraer las consultas operativas y sus selectores del Dashboard, sin consultar el libro de facturas. Conservar cálculos mediante regresiones.
2. Órdenes: listado completo, estados, filtros, ficha por identidad y Excel. Productividad: horas-persona, meta/capacidad y desglose por técnico. Cumplimiento: jornadas, incluidos trabajos sin OS importada, matriz y seguimiento.
3. Acceso propio `servicios.ordenes`, heredando únicamente accesos efectivos al Dashboard; conservar roles administrativos/gerenciales y permisos de exportación. Preparar SQL idempotente de aplicación manual y lectura de meta. No ejecutar SQL remoto.
4. Probar fuentes completas, errores/reintento, fechas, identidades de OS y jornadas, inactivos y varios participantes. No confundir apertura/cierre de OS con horas trabajadas en el mes; cumplimiento usa fecha de jornada.
5. Retirar menú/ruta anterior con redirección protegida, conservando gráficos presentacionales y utilidades consumidas por Ventas. Mantener navegación desde indicadores al trabajo original y no crear escrituras implícitas.
6. Validar teléfono 320/390/639 y tablet/escritorio 640/768/1280 según [[25-Revision-movil-transversal]]. Actualizar evidencia al finalizar; no presentar compilación ni fixtures como producción verificada.

La capacidad heredada es una meta mensual prorrateada por días calendario, ausencias y baja del técnico; no se renombra como eficiencia real. Cuando la configuración no está disponible se muestra aviso y porcentaje desconocido, no una meta silenciosa inventada.

## Presentación: sin explicaciones permanentes

Aplicar [[24-Condiciones-visuales-ventas]] también en esta nueva sección: no añadir párrafos explicativos, subtítulos didácticos ni leyendas redundantes. Las reglas de cálculo se conservan en esta documentación; la vista muestra datos, etiquetas y estados necesarios de carga, error o ausencia de información. No reemplazar estos párrafos por más desplegables. `src/pages/OrdenesServicio.test.tsx` comprueba que no reaparezcan en las tres vistas ni en la ficha de OS.

Precisiones documentales que no deben convertirse en texto permanente de la interfaz: los valores del detalle son de OS, no prueban deuda ni equivalen al libro financiero; una OS mixta puede pertenecer a varios tipos; la actividad por técnico desglosa una jornada por cada integrante y no debe sumarse como jornadas únicas; la matriz distingue pendientes vencidas de canceladas. Las jornadas históricas de técnicos inactivos permanecen consultables al filtrarlos.

Fuentes: `src/features/service-orders/useOperationsModel.ts`, `data.ts`, `useServiceOrders.ts`; `src/components/analytics/OperationalCharts.ts`; `src/pages/OrdenesServicio.tsx`. Los gráficos reciben datos y callbacks: no heredan por sí solos permisos globales ni fusionan poblaciones de distintos módulos.

## Implementación y comprobaciones locales

Implementado el 25/09/2026: `/servicios/ordenes` reemplaza el acceso del menú; `/dashboard` redirige con los mismos controles de rol/módulo y la nueva sección. La página histórica permanece en el repositorio, sin montarse, y `src/components/analytics/OperationalCharts.ts` conserva un punto de reutilización de gráficos. No se creó todavía el destino transversal.

`data.ts` pagina todas las fuentes operativas requeridas y propaga errores, sin consultar el libro financiero. Un fallo o recarga bloquea cifras y exportaciones anteriores; hay reintento explícito. Las dos consultas temporales de OS se ordenan y unen por la clave primaria real `os_numero`, conservando el texto completo, prefijo de sucursal y ceros iniciales. Esa misma clave identifica la ficha y la fila exportada. Las fichas conservan cero, negativos y campos completos. Los enlaces a Trabajos sólo abren IDs devueltos por la consulta existente del usuario. La consulta de jornadas conserva la ventana heredada: un año anterior al inicio y 90 días posteriores al fin; no equivale a cargar todo el historial sin límite.

Validación: 93 pruebas en 11 archivos, incluidos permisos, fuentes paginadas, filtros, exportación, baja de técnicos, Ventas móvil y Planificador; tipos con `--lib es2021,dom,dom.iterable`, lint de archivos nuevos y compilación correctos. La configuración ES2020 previa conserva su limitación con `String.replaceAll`; la compilación informa los avisos existentes de tamaño de chunks. No se afirma que toda la suite del repositorio haya sido ejecutada.

Corrección posterior de carga (25/09/2026): la primera consulta pedía y ordenaba por `id`, columna inexistente en `ordenes_servicio_importadas`. El error de esa fuente impedía publicar la carga completa. El esquema real define `os_numero text PRIMARY KEY` (`supabase/migrations/20260528120000_add_os_reference_to_trabajos.sql`, corroborado por `src/integrations/supabase/types.ts`); no confundirlo con el ID de la tabla de archivo. Las pruebas anteriores inventaban ese `id` y por eso no detectaban el fallo. Se corrigieron consulta, modelo y fixtures; la selección ahora valida sus columnas contra los tipos de Supabase y el doble de consulta rechaza columnas ajenas a las migraciones. La regresión reprodujo el error antes de corregirlo. La pasada posterior tiene 60 pruebas correctas en ocho archivos, incluidos más de 1.000 OS por consulta, solapamiento de apertura/cierre, OS de sucursales distintas, ficha, exportación y propagación de errores. No modifica esquema, permisos ni datos; no requiere otro SQL. Son comprobaciones locales, no confirmación de carga productiva.

Fixture local de componentes reales revisada en navegador: Órdenes/Productividad a 390 px, Cumplimiento a 320 px y Órdenes a 1280 px. Mediciones puntuales de ancho sin desbordamiento horizontal también a 639/640/768 px. Las pruebas verifican columnas e identidad en los seis cortes, pero esto no certifica cada gráfico ni dispositivo físico. La eliminación final de textos de Cumplimiento se verificó en DOM y pruebas; la captura posterior tuvo un fallo del navegador. Límites completos en `design-qa.md`.

## Coherencia visual de la sección — 25/09/2026

La nueva sección debe parecer parte de SIG CDM, no un Dashboard pegado a una tabla. Usar `OperationsPanel`, `CompactListTable`, `KpiStrip`, `FiltersBar` y las mismas primitivas de ficha de Importaciones (`MachineDetailPrimitives`). No extender este ajuste a las vistas ya aprobadas. El CSS de densidad está limitado a `.service-orders-workspace`.

- Navegación de tres vistas visible, sin flechas de desbordamiento vertical. Un solo conjunto de indicadores, seguido por filtros y contenido; acciones de exportación en el encabezado móvil y junto a filtros en escritorio.
- Escritorio/tablet: tablas contenidas, encabezado tenue, filas de 44 px, texto neutral y estados discretos. No usar botones de 44 px dentro de cada celda de escritorio, porque se suman al padding y agrandan la fila. Cantidades/horas centradas; porcentajes e importes a la derecha. En tablet, chasis y técnicos de OS permanecen en ficha/exportación cuando no se muestran como columnas.
- Celular: identidad y contexto en varias líneas sólo cuando aportan lectura; estado/valor como segunda columna. No scroll horizontal de listas, cards individuales por registro ni nuevos desplegables para acceder a los indicadores. Abreviar etiquetas, no datos: `Abiertas` y `Horas` evitan encabezados innecesariamente largos; el modelo/exportación mantiene sus definiciones originales.
- Ficha OS: tres grupos visibles — Orden de servicio, Trabajo y técnicos, Facturación e importes. Fechas `dd/MM/yyyy`, dinero con `$` y dos decimales; preservar cero, negativos, números completos de OS/factura y ceros iniciales. No convertir estos importes en ventas o deuda.
- Productividad: si ninguna fila tiene meta disponible, no repetir columnas vacías de meta/% en la tabla. El aviso corto y los indicadores desconocidos permanecen; Excel conserva todos los campos. No inventar configuración ni porcentajes.
- Cumplimiento: resumen tabular compacto por período en lugar del gráfico grande de barras, con los mismos conteos e indicadores del modelo. Se agrega su Excel completo. El gráfico original se conserva para reutilización futura; no se elimina el resto de la información operativa.
- Actividad separa jornadas de indisponibilidades: estas últimas se muestran en Disponibilidad de técnicos con motivo y período, no con cliente/TR vacíos. Es separación visual, no exclusión del dataset: `actividad-tecnicos.xlsx` sigue incluyendo ambas clases y conserva las jornadas distintas del mismo día.

Fuentes: `OrdersTable.tsx`, `ProductivityTable.tsx`, `ActivityTable.tsx`, `ComplianceOverview.tsx`, `OperationalSummary.tsx`, `OperationsPresentation.tsx`, `format.ts` y `service-orders.css` en `src/features/service-orders`; composición en `src/pages/OrdenesServicio.tsx`. La matriz compartida permite suprimir su frase explicativa sólo aquí mediante `concise`; no cambió su comportamiento por defecto en otros consumidores.

Comprobación local: 77 pruebas en 11 archivos; formatos y regresiones de identidad, exportación, permisos, cálculos, actividad y Ventas móvil. Revisión en navegador con componentes reales y datos sintéticos a 320/390/639/640/768/1280 px, incluida ficha y productividad sin meta. No equivale a verificar los registros de las capturas ni el despliegue en Lovable. Detalles y límites en `design-qa.md`. No requiere SQL ni cambia fuentes, reglas de cálculo o permisos.

## Aplicación del SQL y despliegue

El archivo `supabase/migrations/20260925150000_service_orders_section.sql` se entrega completo para copiar/pegar en Lovable Cloud → SQL editor. Crea la sección y copia una sola vez las asignaciones del Dashboard (sin conceder nuevos roles); desactiva la sección anterior y adapta la lectura restringida de la meta. Repetirlo no repone permisos revocados. Su ejecución correcta fue informada por el usuario el 25/09/2026, no comprobada mediante una consulta remota del agente. No modifica órdenes ni facturas y no ha sido ejecutado por el agente: un push no aplica SQL ni valida producción. La corrección de la consulta requiere incorporar el frontend actualizado, no repetir la migración.

Este clon no incluye `obsidian-sync.local`, scripts de sincronización ni mapa/índice del atlas. Se consultaron las notas del repositorio principal como contexto, sin sobrescribir sus cambios ni adelantar el checkpoint. Esta nota versionada no acredita sincronización de la bóveda; requiere integrar y sincronizar desde el repositorio configurado, conservando las notas manuales.
