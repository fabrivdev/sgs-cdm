# Flota: reconstrucción de escritorio — 10/11/2026

Este bloque reemplaza las decisiones visuales anteriores. Vehículos, Combustible, Mantenimiento y Cargar factura son el menú de Jefatura; Operativos solo carga. Filtros nativos en una fila y Más filtros lateral. Tarjetas con componentes base del tema (no existía SummaryCard). TableScroll/RowCount/scrollHead, filas memoizadas, sin paginación que reinicie al renderizar. No hay selector de vistas, diálogo de columnas, auditoría de vehículo visible ni Flota.tsx embebido.

Vehículos, Combustible, Mantenimiento y Lecturas no muestran contador de registros ni barra vacía sobre la tabla. Un solo menú de tres puntos se ubica en FiltersBar.secondaryActions, inmediatamente después de Más filtros cuando ese disparador existe, conforme a docs/acciones-de-seccion.md. Conserva exportación, importación y acciones existentes, permisos y filas filtradas/ordenadas. No va en PageHeader ni dentro de la tabla. Nuevo vehículo y Editar conservan su ubicación principal.

FleetWorkspace es solo control de acceso/ruta. ManagementWorkspace usa una consulta completa y estable por usuario; VehicleDetail no depende de una caché previa. VehiclesList, VehicleDetail, FuelView, MaintenanceView y ReadingsView viven en src/features/fleet. La demostración tiene caché fleet-preview-snapshot. Se conservan edición, correcciones de lecturas, responsables, archivo e importaciones; las acciones secundarias quedan en el menú de tabla. Los detalles conservan trabajos, marcas, cantidades, comentarios y campos originales. No se infieren importes del historial.

Consumo: se calcula por vehículo con las cargas del período, antes de aplicar búsqueda; suma ponderada de intervalos válidos para el total de flota. KM del período conserva la regla de intervalos fechados, sin convertir el km importado sin fecha en recorrido. Las fechas inválidas generan aviso y no una tabla vacía silenciosa.

Migración 20261110200000_fleet_invoice_integrity.sql: importe con versión/motivo, bloqueo de fila y auditoría completa anterior/nueva; CHECK no negativo para facturas. Reintento actualiza la reserva propia y preserva duplicados/RUC; una modificación de Jefatura impide sobrescribirla. Descartar anula la reserva propia pendiente y conserva datos/archivo/auditoría. Nueva importación de combustible exige moneda: del Excel o selección explícita; conserva ajustes negativos originales.

El usuario confirmó PYG para el histórico de combustible. Su SQL privado de corrección está en la entrega, fuera del repositorio, limitado a las claves y valores del archivo. El usuario declaró haber aplicado los dos SQL entregados. La aplicación publicada consultada no expuso la ruta de Flota (404); no se verificó la base productiva desde esa sesión. Commit/push no acredita publicación en Lovable.

Validación: pruebas aisladas de PostgreSQL, parser, permisos, caché vacía, recuperación editada, conflicto de versión, negativos y consumo independiente de búsqueda. Revisión visual de escritorio 1280 px con copia local de las planillas; no acredita sesión productiva ni escrituras reales.

---

## Odómetros inconsistentes — decisión confirmada el 10/11/2026

El usuario indicó conservar los valores originales y excluir inconsistencias, sin reemplazar kilometrajes. fuelOdometerIssues diagnostica por vehículo: retrocesos aislados que recuperan la secuencia y tramos altos que luego retroceden. Una lectura baja aislada no invalida las anteriores correctas. Se excluyen intervalos con un extremo observado inconsistente, sin unir artificialmente los extremos a través de la carga descartada. Litros, importes, registros y exportaciones originales permanecen intactos.

El diagnóstico usa la serie completa incluso cuando se filtra un período. Después selecciona los intervalos comprendidos en las fechas solicitadas. Búsqueda no modifica el diagnóstico ni el consumo. No requiere SQL ni modifica la base real. No interpreta un reinicio/cambio de odómetro como un recorrido confirmado ni adivina valores correctos. Las detecciones son exclusiones preventivas, no certificación de que las restantes lecturas sean correctas.

Validación: pruebas de retroceso aislado, salto sostenido, recuperación del tramo posterior, filtro que oculta el retroceso, permisos y navegación. Diagnóstico privado sobre copia de las planillas; no equivale a consulta de la base actual. Sin publicación en Lovable.

## Importes y recorrido — revisión posterior del 10/11/2026

Importes en tablas, tarjetas y detalle usan Gs junto al número para PYG. La moneda queda almacenada y exportable, pero sin columna visible independiente. Otras monedas conservan su código y nunca se suman entre sí.

Km del período prioriza intervalos manuales fechados. Cuando no hay un intervalo manual calculable, usa intervalos continuos de las cargas del vehículo, incluidos cruces de mes, con ambos extremos dentro del período. No suma fuentes superpuestas ni usa el kilometraje inicial sin fecha. Ausencia de intervalos queda en —. La validación descarta saltos de odómetro que retroceden posteriormente, aunque permanezcan altos durante varias cargas; conserva los registros originales. Consumo conserva su regla mensual y también excluye esos saltos.

Validación: pruebas aisladas de reintento editado, importe con versión/auditoría, descarte conservando fila, parser de moneda, permisos y cálculos. Revisión visual con copia local de planillas. No se crearon ni editaron facturas reales, ni se publicó en Lovable. Estas correcciones de presentación y cálculo no requieren otro SQL de migración.

## Proveedor fuera del maestro — 10/11/2026

Corrección autorizada: si una consulta exacta confirma que el RUC no está en totvs_proveedores, se habilita el campo Proveedor para escribir el nombre y cargar la factura normalmente. No se crea proveedor, no se agrega aprobación ni botones. Si existe, conserva selección y razón social del maestro. La consulta exacta es independiente del límite de 15 sugerencias por prefijo; salir del campo RUC no cancela la verificación. Cambiar RUC limpia el nombre y vuelve a verificar. Un error de consulta no se interpreta como ausencia.

La migración incremental 20261110190000_fleet_manual_supplier.sql habilita esa identidad manual en el trigger de facturas y agrega fleet_supplier_identity, con los mismos permisos limitados de carga. Conserva el índice y la reserva que controlan duplicados por RUC y número normalizados, aun con nombres distintos. No modifica registros previos ni el maestro. Requiere aplicar antes fleet_supplier_lookup; ambas permanecen pendientes.

Validación local: 13 pruebas de componentes, recorridos y PostgreSQL aislado, incluyendo carga finalizada por Operativos, maestro sin nuevas filas, rechazo de identidad inventada para RUC existente y rechazo del duplicado manual. TypeScript/ESLint y build se informan en la entrega. Sin SQL remoto ni publicación. Este bloque reemplaza la restricción de proveedor obligatorio del maestro de la sección anterior.

## Proveedores desde el maestro y fechas — 10/11/2026

El RUC sugiere coincidencias del maestro TOTVS (totvs_proveedores) desde tres dígitos, con búsqueda por prefijo normalizado, espera de 250 ms y máximo de 15 opciones. Seleccionar completa la razón social en un campo separado de solo lectura; cambiar RUC limpia el nombre. No se crean proveedores desde Flota. Sin coincidencia o error, no se inventa identidad ni se permite una carga nueva sin proveedor seleccionado. Se conservan los valores de facturas históricas; el trigger valida nuevas identidades y cambios de proveedor, sin reescribir registros anteriores ni exigir maestro para recuperar solamente archivos.

La RPC fleet_search_suppliers permite a quienes pueden cargar facturas consultar solo RUC y razón social. No habilita lectura del maestro completo ni de facturas a Operativos. La migración 20261110180000_fleet_supplier_lookup.sql valida la identidad al guardar y depende del maestro TOTVS y las migraciones anteriores de Flota; pendiente de aplicación. Los estados del maestro se conservan sin interpretar códigos no documentados.

Las fechas estaban estilizadas como vínculos para abrir el detalle; ahora se muestran como texto normal y mantienen la apertura desde la fila y teclado. Sin acciones nuevas. Fuentes: SupplierFields.tsx, InvoiceUpload.tsx, InvoiceActions.tsx y ManagementTable.tsx. Validación: 11 pruebas focalizadas incluyendo SQL aislado, TypeScript, ESLint, build y render propio a 1280×800 con proveedores DEMO. No se consultó el maestro productivo ni se publicó; revisión visual independiente pendiente.

## Corrección del patrón de paneles — 10/11/2026

Contrastada directamente la regla de la bóveda `C:/Users/Usuario/CDMSIG/SIG CDM/Generado/Reglas/visual-movil-transversal.md`: los formularios de varios campos usan ResponsiveDrawer lateral en escritorio, con cabecera, cuerpo desplazable y pie accesible. La entrega anterior introdujo Dialog centrales sin una excepción documentada; se corrigen en facturas (carga de Jefatura, corrección, archivo, anulación, auditoría e importe), detalles de gastos y revisión de combustible. Registrar importe cierra el detalle para evitar paneles superpuestos. No se agregan acciones ni se cambian permisos/RPC. Operativos conserva su formulario de página.

Fuentes: InvoiceActions.tsx, InvoiceUpload.tsx y FleetWorkspace.tsx. Se consultaron también la guía 25 de la bóveda, 00-Inicio, 34-Flota, mapa-negocio y el componente ResponsiveDrawer vigente. La bóveda consultada no contiene una nota 34-Flota; se usó la nota versionada del repositorio para ese módulo. Este checkout no tiene obsidian-sync.local: no se acredita sincronización ni se modifica la bóveda desde otra copia.

Validación local: siete pruebas de recorridos/recuperación, TypeScript y ESLint; revisión propia del render de escritorio con datos DEMO. La revisión visual independiente y producción permanecen pendientes. Sin push, publicación ni SQL remoto.

# Flota

## Mejoras de recuperación y escritorio — 10/11/2026

Implementadas localmente corrección/anulación de facturas con motivo y versiones, recuperación por Jefatura de cargas incompletas y conservación de vínculos al cambiar la chapa. Un cambio real conserva alias; una corrección de escritura retira el alias incorrecto sin perder gastos ya asociados. Operativos mantiene solo carga, con borrador de sesión por usuario.

Confirmado por el usuario: una chapa por factura e identidad del proveedor por RUC. No inferir RUC anteriores. Actividad reúne registros de ambas fuentes sin deducir intervenciones únicas ni fechas de trabajo. Las fechas efectivas y km se completan opcionalmente por Jefatura.

La interfaz prioriza escritorio, concentra acciones en menús, permite elegir columnas/limpiar filtros y distingue facturas incompletas, anuladas y sin importe. Consulta por sección y paginación visual de 50 filas, manteniendo exportación completa. No confundir con paginación de filtros en servidor. Combustible permite consultar cobertura del cálculo e inspeccionar el archivo antes de importar.

Fuentes: src/features/fleet/InvoiceActions.tsx, InvoiceUpload.tsx, ManagementTable.tsx, managementApi.ts, src/pages/FleetWorkspace.tsx y supabase/migrations/20261110150000_fleet_recovery.sql. Instalación y límites en docs/fleet-operations-local.md. Sin push, publicación ni SQL remoto.

## Implementación local vigente — 10/11/2026

La nueva implementación de `main` local está descrita en `docs/fleet-operations-local.md`. No está publicada ni se aplicó SQL remoto. Esta sección reemplaza el alcance y los permisos anteriores como especificación del código local; los apartados fechados siguientes son antecedentes.

El menú Flota contiene Vehículos, Gastos de combustible y Gastos de mantenimiento para Jefatura. Operativos solo ve Cargar factura, con chapa, proveedor, fecha/número, clasificación, descripción y archivo. Las tablas, RPC y Storage restringen también el acceso del servidor. No se copian permisos ni se crea una aprobación manual.

Flota e historial se importan una sola vez por tipo mediante una carga inicial transaccional sin botón permanente. Después Jefatura administra manualmente vehículos, estado y responsables, conservando lecturas y auditoría. Los gastos se vinculan automáticamente por chapa exacta normalizada; las chapas ajenas no crean vehículos. El historial mantiene trabajos desglosados y datos originales, sin importes inferidos. Combustible conserva ajustes y permite consultar litros, gasto mensual y L/100 km estimado cuando hay intervalos válidos.

Fuentes: `src/pages/FleetWorkspace.tsx`, `src/features/fleet/managementModel.ts`, `src/features/fleet/workbookImports.mjs`, `scripts/fleet-initial-load.mjs` y `supabase/migrations/20261110120000_fleet_operations.sql`. La ficha reutiliza `Flota.tsx` para lecturas, correcciones e historial de responsables.

Validación: pruebas locales con PostgreSQL aislado, parsers, cálculos, permisos y navegación, compilación y revisión visual DEMO. Pendiente: aplicar SQL autorizado, confirmar hojas del padrón y probar cuentas/archivos reales en el destino antes de publicar. Ver el documento de instalación para datos ausentes, fórmula y límites.

## Densidad de la lista móvil - 07/10/2026

Bajo 640 px, cada vehículo ocupa una fila continua. La identidad conserva marca/modelo, chapa única y responsable en líneas separadas; kilómetros del período y estado permanecen a la derecha. El responsable se mantiene por criterio conservador hasta validar si es contexto diario de despacho. Sólo la fecha de última lectura se retira de la fila y continúa en el detalle, junto con historial y lecturas. `Sin lectura` aparece una sola vez como estado. Abrir la fila conserva el mismo callback y nombre accesible con modelo/chapa; no se agregan gráficos, cards, consultas ni cálculos.

Diez pruebas focalizadas de Flota cubren la estructura, el callback y la presencia de responsable/fecha en el detalle. La revisión visual en 320/390/639/640/768/1280 px sigue pendiente; las pruebas DOM no acreditan truncamiento real, hardware ni producción.

Corrección posterior de QA: en el detalle a 320 px, `Cambiar responsable` usa sólo el icono bajo 640 px, conserva `aria-label` y ocupa 44 × 44 px; desde 640 px mantiene texto y altura compacta. No cambia el diálogo ni su guardado. `Volver a la flota` y los lápices de corrección conservan también objetivos móviles de 44 px. La regresión cubre clases, nombres accesibles y los tres callbacks; la recaptura visual queda a cargo del revisor que mantiene la sesión autenticada.

## Acción de lectura en el encabezado móvil - 07/10/2026

En el detalle del vehículo, `Registrar lectura` es la acción condicional del `PageHeader`. Debe usar el mismo contrato visual de `Nuevo vehículo`: bajo 640 px conserva un objetivo de 44 × 44 px, muestra sólo el icono y mantiene `aria-label="Registrar lectura"`; desde 640 px conserva texto, relleno y tamaño de escritorio. El flujo, drawer, validaciones, permisos y guardado no cambian.

La excepción se originaba porque `Nuevo vehículo` consumía `mobileHeaderCreateButton` y la rama de detalle construía un botón independiente sin esa clase ni texto responsivo. La regresión de código cubre ambas ramas y las pruebas de drawers conservan los callbacks. La captura de Library sólo permitió identificar Flota/detalle mediante OCR y metadatos; sus píxeles no se pudieron materializar, por lo que la corrección requiere recaptura visual real.

## Seed opcional de responsables

La asignación inicial de Hugo Rodas y Ruben Monges nunca debe bloquear la instalación. Solo se agrega una línea de base con fecha `NULL` si cuenta autora, chapa y perfil activo resuelven de forma única. Con cero o varios perfiles coincidentes, perfil inactivo o cualquier fuente ambigua, el vehículo queda sin responsable para selección manual. El script incremental es idempotente, no crea identidades y puede reejecutarse sin duplicar baselines.

## Alcance local

Flota es una sección de Servicios para registrar vehículos por marca y chapa. La chapa se normaliza para impedir duplicados aunque cambien espacios o guiones. La lectura inicial fechada se agrega si está disponible; también puede quedar pendiente, sin inventar fecha ni `0 km`. Las lecturas posteriores conservan fecha, odómetro y autor.

Los kilómetros recorridos son la diferencia entre dos lecturas vigentes consecutivas del mismo vehículo. Si falta una semana, el intervalo se muestra como tal y no se crea una lectura, semana ni distancia interpolada. Una lectura no puede duplicar la fecha ni quedar fuera de la secuencia de odómetro.

Las correcciones no sobrescriben el registro original: lo dejan anulado con autor, fecha y motivo, y crean una lectura reemplazante. La pantalla muestra el historial de correcciones.

El responsable vigente se resuelve desde eventos anexables por vehículo. Cada cambio guarda perfil, nombre conservado, fecha efectiva, autor y momento de registro; asignar o dejar sin responsable agrega un evento y no sobrescribe la historia. Los candidatos son técnicos activos y usuarios existentes deduplicados por `profiles.id`; el flujo no crea identidades. Hugo Rodas y Ruben Monges son las únicas referencias de responsable confirmadas en las fichas iniciales, pero sin fecha de inicio, por lo que la migración incremental las conserva como línea de base con fecha no informada. Los otros trece vehículos quedan sin responsable.

Fuente local: `src/pages/Flota.tsx`, `src/features/fleet/model.ts`, `supabase/migrations/20261006132000_add_fleet_management.sql` y `supabase/migrations/20261006133000_seed_confirmed_fleet_vehicles.sql`.

## Acceso y estado de base

La sección usa `servicios.flota`. Las tablas permiten lectura a sesiones autenticadas; altas y correcciones pasan por RPC que exige `auth.uid()` y acceso a la sección. La migración no copia permisos existentes ni crea vehículos.

El 06/10/2026 el usuario informó que ejecutó las migraciones `20261006132000_add_fleet_management.sql` y `20261006133000_seed_confirmed_fleet_vehicles.sql`. No deben reejecutarse desde este worktree. Esa declaración no sustituye una verificación autenticada de las 15 altas. `20261006201000_add_fleet_responsibility_history.sql` es incremental y permanece sin aplicar. El seed resuelve exclusivamente la cuenta `fabrizio.vega@cdm.com.py`, rechaza chapas existentes creadas por otra cuenta y no crea lecturas ni permisos.

## Límite de facturación

No se implementa una carga manual vehículo-OS o vehículo-salida porque duplicaría trabajo operativo. Tampoco se atribuye facturación por vehículo, técnico, chasis de la máquina atendida ni proximidad de fechas. El importe `billing.travel` no representa distancia y no se divide por una tarifa para inventar kilómetros.

La decisión y su límite están documentados en `docs/flota-asignacion-os-borrador.md`.

## Simulación y altas declaradas

La preview local usa vehículos y lecturas inequívocamente DEMO. Sus cambios viven solo en memoria y se pueden restablecer. Un intervalo que cruza el inicio del período se muestra como parcial y no se suma.

El archivo `docs/flota-altas-reales-pendientes.json` conserva las 15 altas confirmadas desde las fotos, todas sin lectura inicial. Se resolvieron los dos conflictos de chapa usando el identificador, por indicación expresa del usuario. El usuario declaró ejecutado el seed; la comprobación de las 15 filas sigue pendiente de una sesión autenticada de solo lectura.

La UI incorpora cinco assets generados locales para las 15 unidades confirmadas, con coincidencias estrictas por marca, modelo, año conocido y carrocería. Todas las camionetas son blancas y de configuración básica; ISUZU D-Max distingue la cabina simple de AAON-294 y las dobles cabinas 2023 y 2025/2026. No se muestran referencias ni créditos y nunca se presentan como fotos de los vehículos reales. Un modelo o año fuera del catálogo queda sin imagen. Los campos de imagen de base permanecen nulos. Fuente local: `src/features/fleet/vehicleImages.ts` y `public/fleet/`.

## Presentación vigente

En teléfono, el alta de vehículo reutiliza el patrón nativo de creación de Trabajos y Administración: botón `sm`, ancho táctil compacto de 44 px, icono `Plus` visible y texto oculto. No se fuerza altura adicional ni se muestra un botón ancho con `+ Nuevo`.

`Nuevo vehículo` y `Registrar lectura` reutilizan `ResponsiveDrawer`: panel lateral derecho de ancho nativo en escritorio y bottom sheet de 92 dVh en teléfono, con encabezado y pie fijos y cuerpo desplazable. Cerrar con la X o Escape conserva el borrador para reabrirlo; `Cancelar` lo descarta, un error de guardado lo conserva y un guardado exitoso lo limpia. Mientras se guarda se bloquean edición, doble envío y cierre. El clic en una fila mantiene el detalle como página normal; este patrón no se extiende a responsable ni corrección.

La pantalla principal queda limitada a una lista de ancho completo y filtros. No muestra indicadores, paneles laterales, pestañas, gráficos ni comparaciones de facturación. Cada fila de escritorio/tablet ocupa una sola línea y separa Marca, Modelo, Chapa, Responsable, Último kilometraje, Fecha última lectura, Km del período y Estado; hacer clic en la fila abre el detalle sin una acción redundante. `Más filtros` contiene únicamente Marca, Modelo dependiente de la marca y Lecturas en el período (Todas/Con/Sin), además de los filtros primarios existentes.

El detalle es compacto y contiene únicamente identidad, imagen cuando existe, responsable editable, último kilometraje, fecha de última lectura, kilómetros del período, cobertura, lecturas, correcciones e historial de responsables. Los contadores de Vehículos, Lecturas, Correcciones y Responsables comparten la fila del encabezado; no se presentan como subtítulo. Distinguir siempre el odómetro acumulado del recorrido del período. Una ausencia se muestra como `-` o `Sin intervalo`; no se convierte en cero. En teléfono se permite la agrupación compacta prevista por la regla transversal, sin convertir cada registro en una tarjeta grande.

Esta presentación reemplaza la comparación visual global y los gráficos documentados anteriormente. No cambia fórmulas, fuentes ni permisos. La aplicación de las migraciones fue declarada por el usuario y su verificación autenticada sigue pendiente.


## Simplificación de escritorio y KM importados — 10/11/2026

El listado toma la última lectura registrada; si no existe, muestra el Kilometraje numérico de source_data.raw_data de la importación inicial. Origen y fecha van en columnas separadas; la planilla sin fecha no se convierte en lectura ni se usa para inventar recorridos. Se preserva cero válido y ausencias. No requiere SQL ni reimportación.

La ficha usa una única fila Datos / Combustible / Mantenimiento. Resumen mensual y cargas, o mantenimiento integrado/desglose/facturas, se eligen en Ver dentro de los filtros. El mantenimiento integrado resume los trabajos originales y conserva su desglose al abrir la fila. Se retiran la chapa repetida de la ficha y las fechas duplicadas del listado; la exportación conserva chapa. Cargas incluye kilometraje original. Lecturas, responsables y auditoría se despliegan a demanda. Ancho máximo de 1440 px y sin filtros de fecha en el padrón.

Verificación: revisión local de escritorio a 1280 px con copia de las planillas, sin escrituras; pruebas de permisos, navegación y prioridad de fuentes de KM. No equivale a validar despliegue ni transacciones autenticadas de producción. Referencias: src/pages/FleetWorkspace.tsx, src/features/fleet/ManagementTable.tsx y src/features/fleet/managementModel.ts.

Compatibilidad con main remoto ea10124c: conserva los seis commits concurrentes. La migración nueva reemplaza también fleet_update_pending_invoice, fleet_discard_pending_invoice y fleet_set_invoice_amount_v2 de Drizzle 0011 por delegaciones a las RPC auditadas. Su descarte anterior borraba la reserva; el nuevo la anula. Probada con y sin 0011 previamente aplicado. Aplicar la entrega nueva después de 0011 si esa migración se usa; no ejecutar 0011 posteriormente para sobrescribir estas correcciones. No se infiere que el SQL remoto haya sido aplicado.
