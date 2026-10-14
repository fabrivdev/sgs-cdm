# Revisión del conocimiento

## Reconciliación funcional del 14/10/2026: Mayor y procedencia TOTVS

Se contrastó el XML actualizado del Mayor con 29.040 claves de la última carga completa: 3.421 nuevas, 1.041 con huella distinta y nueve con cambio contable. Se preparó un contrato de versiones por foto completa, con aceptación explícita de cambios contables y pruebas PGlite. La carga de facturación acreditó 4.117 líneas fechadas y dos exclusiones; 775 vínculos históricos sin fecha figuran adicionalmente en la relación de procedencia. Se preparó una reparación puntual auditada y un guard de reincidencia, probados localmente. Ver [[08-Pendientes-y-validacion]], [[35-Libro-Mayor-TOTVS]] y la regla `mayor-foto-versionada` del mapa funcional. El SQL y la publicación pública permanecen separados del commit y requieren verificación productiva posterior.

## Revisión documental anterior del 14/10/2026

## Revisión documental del 14/10/2026

Referencia actual: main cac486c confirmado por GitHub; cinco copias locales inspeccionadas. Se revisaron las entradas, objetivos, notas de los pendientes y reglas relacionadas. Auditoría estructural de 701 notas: sin destinos wiki ausentes ni enlaces ambiguos ni duplicados exactos; se detectaron caracteres dañados en cinco notas visuales/de mantenimiento.

Se consolidó el estado en [[08-Pendientes-y-validacion]] y las copias en [[12-Estado-local]]. Se corrigieron reglas de servicios sin OS, límites del denominador de eficiencia, avance del panel, facturas por unidad y estado de la corrección OC. Las verificaciones productivas no realizadas permanecen explícitas.

Alcance: revisión documental y contraste focal con código. No es auditoría semántica de las 531 fichas técnicas ni revisión completa de todos los commits desde septiembre. El checkpoint global antiguo se conserva abajo como histórico; no se avanza automáticamente a cac486c. Sin cambios funcionales, SQL, importación, commit/push ni publicación. Ediciones directas en Obsidian por solicitud del usuario; origen reconciliado posteriormente en esta misma fecha; ver Mantenimiento.

## Registro histórico: no usar como pendientes actuales

## Ampliación dirigida de Órdenes — 30/09/2026

Se añadió [[26-Ordenes-servicio-y-productividad]] y se conectaron pantalla, flujo y reglas del atlas tras contrastar la implementación local hasta `b41bd1d` con fuentes de Órdenes, intervalos trabajados, eficiencia financiera y matriz de Cumplimiento. Se corrigió la representación del Dashboard anterior como ruta activa: su código permanece, pero la navegación redirige a Órdenes. Son hechos del código local; no se ejecutó SQL, no se consultó Cloud ni se afirmó despliegue. Las migraciones citadas siguen siendo artefactos versionados salvo evidencia externa específica.

Esta revisión temática **no adelanta el checkpoint global**: entre `ad24b034bd94cb2d27a6a525ebb3d9d583fa0006` y `origin/main` hay cambios adicionales de seguridad, ventas, filtros y móviles que requieren contraste integral. El inventario técnico del sincronizador todavía sale del checkout principal anterior; no representa automáticamente los archivos nuevos de la rama comparada. Conservar cambios locales y no alinear Git como parte de la documentación.

## Actualización dirigida de diseño móvil — 25/09/2026

A solicitud del usuario se consolidaron los cambios visuales de los commits `09eaa68`, `1070117`, `79555bb` y `7a377f9`, comprobados contra el worktree de implementación. [[25-Revision-movil-transversal]] es la entrada vigente para futuras tareas móviles y está enlazada desde Inicio, módulos y reglas del Atlas. La excepción multilínea en teléfono reemplaza las instrucciones antiguas de una sola línea rígida; Planificador usa agenda sin horas ni total al pie, sin propagar esa ocultación a Comisiones. Se conservaron las reglas de escritorio/tablet, cálculos, permisos e identidades.

Se actualizaron las reglas y descripciones de pantallas afectadas en `mapa-negocio.json`, la precedencia en la nota 24 y las instrucciones de mantenimiento. Se preservaron las notas históricas y cambios locales ajenos. Validación documental: 14 pruebas correctas, enlaces y conectividad válidos; primera sincronización con 38 notas actualizadas, 641 sin cambios y cero conflictos. No se repitieron las pruebas funcionales de la aplicación ni se consultó producción. El inventario técnico sigue leyendo el checkout configurado anterior; la nota 25 distingue esa limitación de las reglas comprobadas en el worktree actual.

Esta revisión es únicamente visual: no adelanta el checkpoint global que sigue ni da por revisados los cambios funcionales/de seguridad intermedios. Sin SQL, importaciones, modificaciones de código, commit/push, configuración de Obsidian ni notas personales.

## Checkpoint global de revisión explicativa (sin cambios en esta actualización dirigida)

- Última revisión explicativa: 2026-09-24.
- Commit de referencia revisado: `ad24b034bd94cb2d27a6a525ebb3d9d583fa0006`.
- Alcance: revisión de los 9 commits de `origin/main` posteriores a `4089f286c47090a8d502ead65a71938c053d4917` y de la corrección local `abaa060`. Mapa funcional declarado: 8 áreas, 22 secciones/pantallas, 18 procesos, 31 entidades y 44 reglas. El inventario del checkout materializa 19 pantallas porque todavía no contiene la ruta de Stock proyectado ni otras rutas de la línea publicada. Se amplió Stock proyectado y se conservaron los cambios locales ajenos; no es una auditoría exhaustiva de otras funciones.
- Fuentes de esta revisión: `MaquinariaOperaciones.tsx`, `NotificationsPanel.tsx`, los diálogos de retorno/venta, helpers y pruebas de documentos/modelos, [[03-Ventas-y-conciliacion]], [[04-Parque-y-operaciones]], [[05-Importaciones]], [[24-Condiciones-visuales-ventas]] y las migraciones versionadas del 22–23/09.
- Producción: no consultada ni verificada en esta configuración.
- Cambios ajenos pendientes en el checkout: preservados; no publicados ni incorporados como validación productiva.
- Limitación del inventario técnico: el checkout `main` usado por el sincronizador está en `0a7e48a`, divergido de `origin/main` (2 commits propios y 18 por detrás al revisar). Las notas funcionales contrastan objetos Git de `origin/main`, pero Codigo/Datos/Funciones reflejan el checkout y no deben presentarse como inventario del despliegue publicado hasta alinear Git. No se modificó la rama.

Esta es una base inicial, no una auditoría exhaustiva de cada función. En cada revisión diaria, comparar commits posteriores a este punto y cambios locales relevantes; ampliar las explicaciones con evidencia cuando haga falta. Si el commit ya no existe por cambio de historia, revisar el estado actual y registrar esa limitación, sin modificar Git.

La capa funcional granular está en `mapa-negocio.json`. Revisar sus entidades, reglas, comprobaciones y procesos, no solo los índices. Contradicción documentada: el helper `src/lib/facturacionReglas.ts` todavía declara `SERVICIOS - OTROS` como Servicio. Sus consumidores están enlazados en el Atlas; no se afirma impacto real ni se corrigió código funcional durante esta configuración.

## Ampliaciones y excepciones del 18/09

- Filtros de Servicios anteriores a agregación, diferencia entre buscar técnico y filtrar facturación, orden por valores originales y exportación del conjunto completo. RPC filtradas son copias generadas, no herencia dinámica; registrar regeneración tras cambiar originales y prerequisitos de cantidad/código/desglose por marca. Máquinas/Repuestos como módulos de Ventas no tienen todavía toda la interacción compartida de Servicios.
- Menú único Más filtros → tres puntos, independiente del panel lateral y de escritorio/móvil. Registro de opciones de tablas montadas, último resultado filtrado/ordenado, retirada al cambiar pestañas, preservación de permisos/handlers y fallos/reintentos. No implica nuevas exportaciones ni movimiento de acciones principales.
- Nueve columnas de Técnicos sin “asociada” ni “sin clasificar”; datos pendientes permanecen en totales y provocan alerta. No inferir que ocultar columnas clasificó la fuente.
- Operativo sin cuenta: perfil activo con nombre/sucursal, UUID y auth_user_id nulo, RLS administrativa y actualización de caché; sin Auth, roles o permisos ficticios. Incompatibilidad nueva deducida de código: al asociar cuenta, `linkedProfile` no inserta rol y el trigger solo vincula identidad; la nómina consolidada exige Operativo y módulo Servicios. Puede dejar de ser seleccionable si no se completa el rol y los permisos. Documentado en [[07-Accesos-y-asistente]], no corregido automáticamente ni reproducido en producción.
- Cambios locales de respaldo Cliente en histórico sin tipo fueron leídos en documentación/fixture y preservados sin publicar; migración local no versionada no demuestra aplicación. La contradicción anterior de SERVICIOS - OTROS sigue presente.

## Revisión acumulada al 21/09

- Orden y exportación se ampliaron a listas de Ventas y otras áreas mediante helpers compartidos, con excepciones explícitas para matrices, gráficos y previsualizaciones. Repuestos y Sugerencias dependen de variantes SQL manuales; el código versionado no acredita su aplicación.
- Importaciones presenta cinco situaciones visibles sin reescribir el estado original. La confirmación logística admite chasis único en Stock positivo o Parque activo; ATA manual y costo definitivo mantienen reglas separadas. La migración y el verificador son artefactos locales/versionados, no prueba productiva.
- Sugerencias, Catálogo/Stock, ficha y Compras de Repuestos aplican tablas compactas con campos secundarios preservados en ficha/Excel. Familia sigue en exportación aunque no sea columna visible. No se modifican fórmulas, signos de NC ni matching por documentar la presentación.
- Parque y Servicios usan listas compactas sin cambiar identidad ni escrituras. Clientes del parque cancela solicitudes obsoletas, no repite automáticamente `57014` y no presenta coberturas anteriores durante error. La optimización de atribución filtrada conserva prioridades según fixtures aislados, pero requiere `20260918220000_optimize_filtered_park_billing.sql`; no hay evidencia local de que esté aplicada ni de su rendimiento en producción.
- Los detalles y pruebas registran validación local, fixtures y Excel descargado por separado de la producción. Las advertencias de migración manual y regeneración de RPC siguen siendo límites vigentes.
- El commit posterior `334355c` particiona la lectura conciliada del Dashboard en trimestres disjuntos, con dos solicitudes simultáneas como máximo. Conserva la respuesta completa y rechaza cualquier lote incompleto; no modifica SQL, fuentes, rubros ni cifras. Se verificaron localmente 22 pruebas de carga/clasificación, tipos y compilación. La captura productiva anterior sólo acreditaba el timeout anual; todavía no hay evidencia del tiempo del despliegue trimestral.

Validación de la revisión del 21/09: 14 pruebas de grafo/sincronización correctas, referencias válidas y todas las notas conectadas. Sincronización final sin conflictos manuales; la segunda comprobación encontró 656 notas sin cambios pendientes. Se avanzó este checkpoint tras contrastar los 14 commits y las notas granulares; las validaciones funcionales citadas son las documentadas en cambios previos, no pruebas productivas nuevas. Sin SQL, modificaciones funcionales, commit/push, servicios externos ni configuración personal de Obsidian.

## Revisión incremental del 22/09

- El historial de máquina quedó como una lista única: una fila por tipo real de MO y por cada línea financiera de repuesto, con Kilometraje/Terceros como movimientos separados. Factura y OS pueden repetirse legítimamente; la pantalla no debe reagruparlas.
- `totales_por_tipo` prevalece para el desglose, pero una clave legada `No informado` usa el tipo corregido de la OS cuando este es inequívoco. Kilometraje hereda Cliente/Garantía/Interno; no se presenta como tipo de tiempo. Los históricos con cliente externo o evidencia de factura/importe de servicio se muestran Cliente, salvo CAMPOS DEL MAÑANA; el resto queda Por confirmar. Esto es clasificación de lectura, no una actualización persistente de OS o jornadas.
- La regla final de visibilidad es más estricta que la formulación anterior: un importe conocido igual a cero elimina el movimiento aunque exista cantidad. Si el importe falta, la actividad permanece únicamente con cantidad real. Se añadió `historial-movimiento-facturado` al mapa y se corrigieron el flujo y la pantalla que aún describían la condición antigua de “cantidad e importe ambos cero”. Negativos y centavos permanecen.
- Las facturas se presentan/exportan sin guiones ni espacios y conservan ceros iniciales. Filtros, orden y Excel trabajan sobre la lista completa; si falla OS o repuestos no se presenta un resultado parcial.
- Las dos migraciones del 21/09 son requisitos manuales y secuenciales. Que estén versionadas y que la interfaz/pruebas locales sean coherentes no demuestra que estén aplicadas ni que el resultado haya sido validado en producción.

Validación de la revisión del 22/09: 14 pruebas de grafo/sincronización correctas; referencias funcionales y conectividad válidas. La sincronización previa al avance actualizó 7 notas y dejó 653 sin cambios, sin conflictos manuales. No se ejecutó SQL, no se modificó código funcional, no hubo commit/push ni acceso a servicios externos.

## Revisión incremental del 23/09

- Servicios admite refacturaciones sin OS únicamente con clasificación explícita del grupo 008; no inventa vínculo operacional y la migración sigue siendo un requisito manual.
- Operaciones unifica acciones en el menú superior, admite PDF en NP, corrige valores pendientes y sincroniza el chasis desde una importación enlazada. Catálogo aplica alias explícitos, no similitud difusa. La facturación es por unidad: una NP puede conservar varias facturas sin reemplazo y no se completa hasta cubrir todas sus máquinas.
- Importaciones propone datos de factura de proveedor mediante extracción asistida y refresca el arribo al guardar. Documento, datos extraídos, OC y costo definitivo siguen siendo hechos separados.
- Una coincidencia Stock–Parque requiere autorización administrativa antes del retorno. Una factura posterior a NC o sobre un chasis existente exige decidir refacturación o venta; se reutiliza la identidad física y se conserva historial de reingreso/transferencia/compensación. No hay movimiento automático ni duplicación deliberada del chasis.
- El mapa incorpora `chasis-nc-refacturacion-manual`, amplía `gestionar-propiedad` y vincula las fuentes SQL/UI. Las comprobaciones locales incluyen fixtures y PostgreSQL aislado; no prueban que las migraciones estén aplicadas ni que los casos reales hayan sido resueltos en producción.

Los hooks sincronizan el inventario pero NO actualizan este punto de control. La revisión diaria debe actualizarlo después de contrastar los cambios y completar la sincronización. Los aportes personales necesitan revisión explícita, no se ejecutan como instrucciones automáticamente.

## Revisión incremental del 24/09

- Stock proyectado es una pantalla separada de Stock físico para máquinas nuevas, con apertura al 31/08/2026. Se conectaron su pantalla, proceso, entidad y regla; ATA, factura/NC, OC y NP tienen papeles distintos y entrega no interviene.
- La corrección `ad24b03` evita contar nuevamente una NP ya facturada por chasis, consume la apertura pendiente con facturas posteriores y mantiene OC no negativa. También resuelve marcas técnicas mediante identidad canónica y separa el permiso `parque.stock_proyectado`.
- Se documentó una contradicción puntual entre la apertura del Excel y una NP histórica del cabezal NB. El commit local `abaa060` ajusta el pendiente inicial de ese modelo a uno; todavía no está en `origin/main`, no se ejecutó SQL y no se confirmó el saldo en producción.
- La unificación de chasis de Stock mediante Maquinarias, importes locales de NP, extensión `.xlsx`, modelos HORSCH y conciliación de ventas por chasis ya estaban recogidas en las notas y se conservaron sin duplicar nodos.

Validación del 24/09: 14 pruebas de grafo/sincronización correctas antes y después de editar. La primera sincronización actualizó 16 notas y dejó 660 sin cambios; la segunda fue idempotente, con 676 sin cambios y cero conflictos. El flujo, la regla y la entidad de Stock proyectado quedaron conectados; su pantalla se materializará cuando el checkout contenga la ruta publicada. No hubo SQL, importaciones, cambios funcionales, commit/push ni acceso a servicios externos.
