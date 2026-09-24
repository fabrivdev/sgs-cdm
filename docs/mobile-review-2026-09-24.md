# Revisión móvil transversal — primera muestra

Estado: muestra aprobada; primera implementación compartida. No modifica SQL, permisos ni reglas de negocio. Base de código: `8341cfde2e6de21d4a184a4a26d4001e0b10b4d4`.

## Primera implementación después de aprobar la muestra

`FiltersBar` aplica el buscador de 36 px, placeholder corto y barra sin tarjeta exterior bajo 640 px a todos sus consumidores. Conserva nombre accesible, agrega la descripción original, mantiene debounce, filtros y menú único. `SectionActionsMenu` conserva 44 px táctiles pero elimina el recuadro en teléfonos. No se reducen los controles dentro de formularios.

`KpiStrip.mobilePrimary` es explícito por pantalla: Ventas muestra facturación/documentos o unidades; Stock muestra saldo/marcas; Parque conserva sus dos primeras métricas; Operaciones pendientes/facturadas; Importaciones total/arribadas sin confirmar; Proyectado stock/proyectado. Los restantes indicadores permanecen en `Más indicadores`. Escritorio y llamadores sin configuración mantienen su presentación anterior. Las alertas externas no se modifican.

Validación: 23 pruebas de componentes, búsqueda, exportación y permisos; TypeScript y compilación. Fixture de componentes reales sin datos comerciales: 320 y 390 px sin desborde del documento; buscador medido en 36 px a 390 px; secundarios accesibles al desplegar. No acredita todas las rutas ni teléfonos físicos. La tabla de Operaciones, períodos plegados por defecto, calendarios, formularios y revisión exhaustiva siguen pendientes: esta primera implementación no se presenta como cierre de la matriz completa.

## Evidencia y límites

Se contrastaron rutas y componentes del código con capturas móviles actuales de Stock de máquinas, Operaciones y Repuestos, además de las capturas proporcionadas de Ventas. La versión abierta en producción todavía mostraba indicadores apilados y columnas diferentes de la versión local: no atribuir toda esa presentación al último código sin verificar despliegue.

En Operaciones la tabla de la versión abierta empezaba aproximadamente a 546 px desde el borde superior a un viewport solicitado de 390 px. La prioridad del rediseño es reducir bloques anteriores al contenido, no reducir indiscriminadamente tipografías ni áreas táctiles.

No se completó todavía la revisión visual de todas las rutas ni de sus formularios. La siguiente matriz es inventario de alcance, no certificado de pruebas.

## Matriz de cobertura y siguiente tratamiento

| Ruta o grupo | Tratamiento previsto | Evidencia actual |
| --- | --- | --- |
| `/parque-ventas`, `/servicios/ventas`, `/repuestos/ventas` | Barra común ligera, dos indicadores prioritarios, secundarios desplegables, períodos plegados, selector de análisis y detalle completo | Código y capturas de usuario; piloto de máquinas |
| `/parque-stock` | Modelo/chasis/saldo; frescura y alertas no se deben ocultar | Captura actual y piloto |
| `/parque-operaciones` | Dar prioridad al estado; facturación y entrega siguen siendo independientes; pedido, cliente y valor accesibles en detalle | Captura actual y piloto |
| `/parque-stock-proyectado` | Modelo/stock/proyectado; corte siempre visible; OC y pendientes accesibles sin alterar cálculo histórico | Inventario de código |
| `/parque-importaciones` | Identidad de unidad y seguimiento; mantener documentos y recepción accesibles | Inventario de código |
| `/parque-clientes` | Identidad y acceso a ficha; revisar pestañas e históricos internos | Inventario de código |
| `/parque-maquinas` | Máquina/chasis y propietario; revisar transferencias y notificaciones | Inventario de código |
| `/repuestos` | Código/descripción/saldo y detalle por sucursal; alertas persistentes | Captura actual e inventario |
| `/repuestos/compras` | Identidad y estado/importe según tarea; detalle completo | Inventario de código |
| `/repuestos/sugerencias` | Priorizar necesidad y acción; conservar advertencias y controles de compra | Inventario de código |
| `/`, `/trabajos` | Planificador y trabajos: prioridad/fecha/estado; acciones autorizadas y detalle | Inventario de código |
| `/calendario` | Revisar agenda por día en móvil; no encoger matriz de 900 px | Inventario de código |
| `/dashboard` | Evaluar diseño móvil propio antes de sustituir componentes; detalle y exportación | Inventario de código |
| `/comisiones` | Conservar selección, edición y cálculos; resumen y detalle móvil | Inventario de código |
| `/admin` | Usuarios, accesos, parámetros y datos; revisar formularios y previsualizaciones de importación por separado | Inventario de código |
| Autenticación, sin acceso y página inexistente | Comprobar teclado, textos y desbordes | Pendiente visual |

`Agenda.tsx` e `Historial.tsx` no se consideran rutas activas por existir como archivos. Revisar sus usos internos antes de ampliar alcance.

## Muestra aislada

Entrada: `mobile-review.local/pilot.html`, componente `pilot.tsx` y estilos `pilot.css` (carpeta local ignorada por Git). Servidor existente: `http://127.0.0.1:5175/mobile-review.local/pilot.html`.

Tres pestañas: Ventas, Stock y Operaciones. Datos ficticios independientes, no representan conciliación entre módulos. Reutiliza `MobileSalesTable`, ordenamiento y diálogos de la aplicación. Búsqueda, filtro de marca, detalles, indicadores desplegables y cambio facturación/entrega son interactivos. Crear pedido y exportar sólo explican su alcance: no son implementación funcional nueva.

- Buscador visual de 36 px, texto de entrada de 16 px; iconos sin recuadro con zona táctil de 44 px.
- Sin tarjeta exterior del buscador ni tarjetas anidadas para períodos.
- Dos indicadores principales; resto accesible mediante despliegue.
- Una fila por registro; datos secundarios en detalle, sin pérdida en la futura exportación.
- Operaciones propone máquina y estado en el listado; NP visible en detalle. Esta priorización necesita aprobación antes de reemplazar la tabla actual.

## Criterios antes de extender a producción

### Tercera etapa: agenda, navegación gerencial y formularios compartidos

- Calendario: bajo 640 px, Semana usa agenda vertical por día; Por técnico usa desplegables por persona con sus jornadas y disponibilidades. El mes conserva su cuadrícula compacta y escritorio conserva la matriz. Pulsar jornada abre el detalle existente; pulsar día abre la agenda completa de ese día con los filtros de página, también desde un desplegable de técnico. No se cambia automáticamente el filtro ni se reprograma al consultar. La matriz y arrastre de escritorio permanecen intactos.
- Se conservan las identidades de jornada, los estados, los días no laborales y cada entrada de disponibilidad; una jornada no se deduplica por compartir OS. Sin actividad se informa ausencia de programación, no disponibilidad laboral garantizada.
- Dashboard: las cuatro pestañas horizontales móviles se sustituyen por un selector que invoca el mismo `goSection`. Escritorio y contenido financiero/operativo no cambian. No se implementa el futuro panel gerencial propuesto en las notas.
- Dialog/Sheet: cierre de 44 × 44 px en teléfonos, icono pequeño, espacio reservado junto al título. DialogFooter mantiene sus acciones con altura táctil mínima en móvil; no se cambian validaciones ni guardado. `ServicioFormDialog` ya utiliza cuerpo desplazable y pie separado mediante ResponsiveDrawer; se conserva.

Validación: 7 pruebas de agenda, diálogo, filtros y orden del Dashboard; tipos y build correctos. Fixture con componentes reales a 320 px, sin desborde, título largo sin superposición y cierre medido en 44 × 44. No se probó teclado virtual de teléfono físico ni todas las variantes de formularios existentes. Sin SQL ni cambios de fuentes/roles. La matriz general conserva pendientes de verificación en historiales interiores, Administración y formularios particulares; no equivale a cobertura exhaustiva de producción.

### Segunda etapa implementada

Operaciones muestra en teléfonos Máquina + Facturación/Entrega + detalle. El selector sólo cambia la columna visible; conserva los cálculos canónicos, la ordenación del origen, todas las columnas de escritorio y el pedido completo al abrir. NP y valor permanecen en detalle y exportación. Verificación con componente real a 320 px: sin desborde, cambio de estado visible y una fila por unidad.

Los períodos de Máquinas, Servicios y Repuestos comienzan plegados bajo 640 px mediante `useMobileDisclosure`. La elección manual persiste al cambiar tamaño; un error fuerza la apertura. Las exportaciones siguen registradas aunque el panel esté plegado: en Servicios la tabla permanece montada dentro de un contenedor oculto; Máquinas/Repuestos conservan su registro de exportación independiente. No cambia el rango seleccionado ni el total del período.

Validación de esta etapa: 35 pruebas pasan en ejecución secuencial; una ejecución concurrente agotó el límite de 5 segundos en una prueba de Repuestos y se repitió sin concurrencia, sin alterar el test ni su timeout. Tipos y build correctos. La revisión de calendarios, Dashboard, formularios y vistas interiores permanece pendiente; no se declara cerrada la auditoría transversal.

1. Aprobar la muestra y la prioridad de campos, no sólo el tamaño del buscador.
2. Implementar variantes explícitas en componentes compartidos; no reglas CSS globales que alteren formularios o desktop.
3. Cubrir cada ruta de la matriz, incluyendo estados vacío/cargando/error, filtros activos, selección, permisos, detalle, formularios y exportaciones.
4. Validar 320, 360, 390, 430, tablet y escritorio; teclado/foco, safe areas, scroll de diálogos y nombres/importes largos.
5. Sin cambios en cálculos, conciliación por chasis, paginación de servidor, autorización ni información exportada.
6. Ejecutar pruebas y build, revisar diferencias y actualizar guía de conocimiento con alcance realmente comprobado antes de publicar.
