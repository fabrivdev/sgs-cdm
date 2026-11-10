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
