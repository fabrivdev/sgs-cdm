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

## Mejoras locales de recuperación y escritorio — 10/11/2026

Este bloque actualiza el comportamiento local descrito debajo. No hay push, publicación ni SQL remoto.

- Factura de una sola chapa, con RUC del proveedor confirmado por el usuario. Duplicados por RUC y número normalizados; los registros antiguos sin RUC no se completan por inferencia. Antes de aplicar la migración, conciliar posibles duplicados previos que colisionen bajo la nueva normalización; nunca fusionarlos automáticamente.
- Jefatura corrige datos, completa cargas incompletas, sustituye archivos y anula con motivo desde un único menú. Los cambios conservan valores anteriores, autor y fecha; los archivos anteriores permanecen privados. El control de versión rechaza ediciones obsoletas. La anulación no elimina el documento y permite una nueva carga correcta.
- Operativos continúa sin lectura de flota, gastos, auditoría o archivos. Su borrador se conserva por usuario en sessionStorage de la pestaña. Por restricciones del navegador, después de recargar debe seleccionar otra vez el archivo; Jefatura puede completar un intento ajeno con un nuevo archivo. No se guardan archivos binarios ni credenciales en el borrador. Nueva carga no elimina el intento anterior: queda visible para Jefatura.
- Un cambio real de chapa conserva la asociación de gastos y admite la chapa histórica para cargas posteriores. Una corrección de escritura retira el alias incorrecto, preservando gastos ya asociados. Tipo y motivo se piden solo cuando cambia la chapa. No se permite reutilizar silenciosamente una chapa histórica de otra unidad. No se reconstruyen por conjetura vigencias históricas anteriores a esta migración.
- Actividad reúne registros de la planilla inicial y comprobantes completos con origen, fecha de referencia, fecha del trabajo y fecha de factura en columnas separadas. No afirma que dos registros sean intervenciones distintas ni los cuenta como trabajos únicos. Historial conserva el desglose original. Jefatura puede completar fecha efectiva y km del trabajo; Operativos no tiene esos campos. No se inventan fechas ni importes históricos.
- Facturas muestra estado de carga y filtros de incompletas/anuladas/sin importe. El importe documentado excluye incompletas y anuladas y mantiene monedas separadas. Los importes históricos siguen ausentes.
- Desde Vehículos se abre Datos e historial; desde gastos se conserva el contexto. Situación patrimonial tiene su columna. Las tablas ofrecen contador, limpieza de filtros y selección de columnas desde acciones, con 50 filas por página visual y exportación de todas las filas filtradas. Fecha y chapa permanecen disponibles. La consulta se divide por sección, aunque cada sección aún obtiene su conjunto completo en lotes de API; la paginación visual no equivale a paginación de filtros en servidor.
- Mensual usa rango de meses. El consumo permite desplegar cobertura, litros e intervalos utilizados; no representa medición de tanque lleno. La importación recurrente de combustible presenta movimientos, fechas, litros y comprobantes existentes antes de aplicar el archivo. Un conflicto aborta el lote y conserva el error para revisar el origen.
- Las dos importaciones iniciales siguen siendo únicas. La activación futura requiere aplicar primero fleet_operations y luego 20261110150000_fleet_recovery.sql, tras revisar estado real del destino.

Validación de esta entrega: PostgreSQL aislado con migraciones reales, pruebas de componentes, TypeScript/ESLint/build y recorrido local de escritorio con datos DEMO. Ninguna prueba local acredita despliegue ni Storage de producción. Se mantiene pendiente la comprobación con usuarios y documentos reales cuando se autorice la activación.

# Flota: implementación local del 10/11/2026

Estado: código preparado en `main` local. Sin push, publicación, SQL remoto ni importación de datos reales. La revisión visual usa datos DEMO y adaptadores locales sin escrituras. Las notas históricas no acreditan el estado de la base remota.

## Recorridos y permisos

- `/servicios/flota`: Vehículos para Jefatura; formulario de factura para Operativos.
- `/servicios/flota/combustible`: mensual y cargas para Jefatura.
- `/servicios/flota/mantenimientos`: historial y facturas para Jefatura.
- Jefatura necesita rol `jefatura` y acceso a `servicios.flota`. Se conserva administración técnica para `admin`/`superadmin` con acceso. No se otorgan roles ni secciones por esta migración.
- Operativos con acceso solo envía chapa, proveedor, número, fecha, una o varias clasificaciones, descripción y PDF/JPG/PNG hasta 20 MB. No carga importes, consulta listados ni obtiene archivos. Una reserva y finalización reintentables evitan duplicar una carga interrumpida.
- La separación está aplicada también en RLS, RPC y Storage privado. Ocultar botones no es la barrera de seguridad.
- La ficha conserva lecturas fechadas, correcciones y responsables mediante las funciones existentes. Jefatura da de alta vehículos y edita datos, estado operativo y situación patrimonial manualmente. Las modificaciones conservan autor y fecha.

## Importaciones iniciales, una vez por tipo

`fleet_load_initial` cierra de forma transaccional e independiente `vehicles` y `history`. Un intento con el mismo checksum retorna cero; otro archivo después del cierre se rechaza. El bloqueo de transacción evita carreras. No existe botón para repetir estas cargas.

El comando prepara un JSON privado local por defecto, sin red ni escrituras de base:

```powershell
node scripts/fleet-initial-load.mjs vehicles "RUTA_FLOTA.xlsx" "RUTA_PRIVADA_FLOTA.json" "--sheets=Base General"
node scripts/fleet-initial-load.mjs history "RUTA_HISTORIAL.xlsx" "RUTA_PRIVADA_HISTORIAL.json"
```

Las hojas del padrón se eligen explícitamente; varias se separan con `|` dentro del mismo argumento. No incluir automáticamente Seguros, Otros bienes ni Ventas Veh. Resolver el alcance del padrón antes de su única carga. Las filas sin chapa/marca impiden aplicar el padrón y permanecen en el informe de preparación.

Las chapas ya existentes completan solo metadatos ausentes, conservan valores manuales, lecturas y responsables previos. Los kilómetros sin fecha de la planilla se preservan como dato original, no se convierten en lecturas fechadas. Los nombres de responsable sin fecha se conservan como línea de base; no se inventan perfiles de usuario.

En historial se preservan encabezados, marcas X, cantidades, texto, comentarios, coordenadas, formatos y fórmulas. Fecha o chapa desconocidas permanecen vacías. No hay columna de importe histórico. `--accept-source-gaps` permite conservar explícitamente esas ausencias en la carga inicial del historial; no aprueba registros ni asigna vehículos.

Solo una futura ejecución explícita con `--apply` escribe en el destino configurado mediante `FLEET_SUPABASE_URL`, `FLEET_ANON_KEY` y `FLEET_ACCESS_TOKEN` de una sesión autorizada. No se usa service role. No guardar sesiones ni JSON privados en Git.

Revisión de los archivos proporcionados, solo lectura: Base General produce 36 filas sin observaciones; historial produce 679 filas con 35 observaciones de fecha/chapa; combustible produce 1.500 movimientos. Estos conteos no acreditan importación remota. La hoja MITSUBISHI L200 no permite identificar una chapa; se conserva sin vínculo.

## Combustible y mantenimiento

- La carga recurrente de combustible está en el menú de acciones de Gastos de combustible. Valida encabezados, fechas, comprobantes y conciliación con el total cuando existe. Repeticiones idénticas no duplican; diferencias de un comprobante abortan el lote completo.
- Litros cargados positivos, ajustes negativos, litros netos e importe neto se conservan por mes. La moneda no está informada en el reporte proporcionado y no se deduce.
- Consumo estimado: `100 × suma(litros de la carga anterior) / suma(km entre lecturas consecutivas)`, solo para una unidad identificada, intervalos dentro del mismo mes y período, con kilometrajes crecientes, correspondencia con Km Anterior/Cant. Ant. y productos de combustible. Se excluyen duplicaciones de hora, ajustes, discontinuidades y retrocesos. Sin intervalos válidos se muestra ausencia, no cero. Es estimación sobre compras, sin afirmar tanque lleno ni consumo medido.
- Las clasificaciones de factura son Filtros, Aceites y fluidos, Correas, Cubiertas, Batería y Otros trabajos y repuestos. No sustituyen la descripción ni reinterpretan los valores originales del historial.
- Jefatura consulta las facturas y puede registrar importe y moneda explícitos con auditoría. Un importe ausente sigue ausente. Los resúmenes monetarios separan monedas.
- La vinculación de gastos es por chapa normalizada exacta (mayúsculas, sin espacios/guiones), también al crear o corregir una chapa posteriormente. No hay aprobación manual ni coincidencia por nombre/modelo. Los gastos ajenos permanecen en gastos, sin crear vehículos.

## Instalación futura y límites

1. Confirmar el estado real de las migraciones de Flota existentes, en particular `20261006201000_add_fleet_responsibility_history.sql`. No reejecutar seeds históricos como parte de este cambio.
2. Revisar y aplicar explícitamente `20261110120000_fleet_operations.sql` en el destino autorizado. El frontend requiere esa migración; la compilación por sí sola no activa las tablas, RPC ni el bucket.
3. Revisar los informes locales y elegir las hojas del padrón; realizar una carga inicial por tipo. Después, administración manual.
4. Validar con cuentas reales de Jefatura y Operativos: archivo completo, interrupción/reintento, lectura negada al operativo, consulta firmada de archivo por Jefatura y edición de responsables. Esto sigue pendiente porque no se usó producción.
5. Publicar solo cuando el usuario lo indique. El permiso actual excluye push y despliegue.

Pruebas locales: PostgreSQL aislado con las migraciones reales de Flota y esquemas mínimos de auth/storage; modelos, parsers, permisos, navegación, filtros y componentes de lectura/responsables. Revisión de navegador local en 320/390/639/640/768/1280 px. No equivale a verificar hardware real o la infraestructura remota de Storage.

Prioridad final indicada por el usuario: escritorio. Se ajustaron anchos según campo, encabezados legibles de trabajos (con etiquetas originales en el detalle) y fecha/chapa fijas al recorrer horizontalmente el historial. Se revisaron las vistas de escritorio a 1280 y 1440 px; no se siguió ampliando el trabajo móvil después de esa indicación.
