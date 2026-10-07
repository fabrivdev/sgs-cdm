# Matriz de armonización móvil — 07/10/2026

Estado: inventario transversal de código y pruebas locales. No es una aprobación visual ni certifica producción.

## Alcance y método

Se contrastaron las rutas activas de `src/App.tsx`, la navegación de `src/components/AppLayout.tsx`, los componentes compartidos y las excepciones documentadas en la memoria del proyecto. Esta revisión no abrió la aplicación ni un navegador. Por eso, “sin desvío accionable” significa que la inspección estática y las pruebas existentes no justificaron un cambio; no significa que la vista haya sido aprobada visualmente.

La regla de corte es teléfono por debajo de 640 px. La verificación visual posterior debe cubrir 320, 390, 639, 640, 768 y 1280 px, además de texto largo, filtro activo, carga, vacío, error, permisos restringidos y drawer abierto cuando corresponda.

## Causas encontradas y tratamiento

| Causa | Consumidores alcanzados | Tratamiento local | Límite |
| --- | --- | --- | --- |
| Objetivos secundarios menores a 44 px en teléfono | `FiltersBar`, Ventas, Cumplimiento y permisos de Admin | Mínimo táctil móvil y estado accesible conservando callbacks | No reduce ni agranda controles internos de formularios de escritorio |
| Altas o seguimiento en modal genérico | Parque/Máquinas, Admin y Compras/Pedidos | Acción principal en `PageHeader` y formularios en `ResponsiveDrawer` | Solicitudes conserva su diálogo breve; payloads y validación no cambian |
| Cinco KPI en grilla 2+2+1 desequilibrada | Consumidores de `KpiStrip` con exactamente cinco elementos | Distribución móvil 3+2, sin ocultar indicadores | Otros conteos conservan su distribución |
| Filas con contexto repetido o cuatro niveles | Flota y Órdenes de servicio | Identidad y contexto agrupados en dos/tres líneas | No se quitan campos, métricas, selección ni detalle |
| Breakpoint móvil extendido hasta 767 px | Equipo y accesos de Admin | Tabla desde 640 px; fila compacta sólo bajo 640 px | Permisos y orden siguen siendo los mismos |
| Gutter propio más estrecho | Calendario | `pageShellWide` compartido | La cuadrícula mensual y `md:py-2` siguen siendo excepciones funcionales |
| Acciones de 32 px con texto completo | Sugerencia de compra | Icono con nombre accesible y ancho táctil de 44 px bajo 640 | Texto y 32 px visuales se conservan desde 640 px |
| Divisor/estado ambiguo en filas | Trabajos | Separador neutral y padding de la tabla nativa | Cambio ya existente en el commit local `9702832`; no altera estados |

## Inventario de rutas y secciones

| Ruta / sección | Patrón y excepción funcional | Resultado de código | Evidencia automatizada local | Evidencia visual |
| --- | --- | --- | --- | --- |
| `/servicios/ventas` | Workspace móvil propio de Ventas; rango bajo título oculto sólo aquí | Objetivos secundarios armonizados; filtros, períodos y exportación preservados | Pruebas de Ventas y contrato CSS del lote 1 | Pendiente |
| `/parque-ventas` | Mismo workspace, con rango móvil visible | Sin desvío accionable adicional | Pruebas existentes de Ventas + contrato CSS | Pendiente |
| `/repuestos/ventas` | Mismo workspace, con rango móvil visible | Sin desvío accionable adicional | Pruebas existentes de Ventas + contrato CSS | Pendiente |
| `/` Planificador | Agenda móvil propia, sin horas en la fila; tabla desde 640 px | Sin cambio: la excepción documentada ya está implementada | `ServiceLists.test.tsx` y pruebas existentes | Pendiente |
| `/trabajos` | Lista plana móvil; tablero en tablet/escritorio | Separadores y densidad ya corregidos en `9702832` | `ServiceLists.test.tsx` | Pendiente |
| `/calendario` | Mes conserva cuadrícula; Semana/Técnicos usan agenda móvil; consultar no reprograma | Gutter común aplicado sin tocar vistas, arrastre ni callbacks | Contrato de código del lote 4; pruebas previas de agenda compartida | Pendiente |
| `/servicios/ordenes` — Órdenes | Lista compacta y drawer de detalle | Fila reducida a tres niveles conservando OS, equipo, técnicos, horas y km | 74/74 en `OrdenesServicio.test.tsx` | Pendiente |
| `/servicios/ordenes` — Productividad | Matriz móvil propia y drawer de técnico | Objetivos de 44 px; sin cambio de cálculo | Incluida en 74/74 de Órdenes | Pendiente |
| `/servicios/ordenes` — Cumplimiento | Matriz, no lista genérica | Objetivos de 44 px; filtros y datos intactos | Incluida en 74/74 de Órdenes | Pendiente |
| `/servicios/flota` | Lista solamente; no agregar gráficos | Fila en dos niveles, “Sin lectura” no se duplica; drawers nativos conservados | 8/8 en `FlotaDrawers.test.tsx` | Pendiente |
| `/comisiones` | OS/cliente/pago/validación agrupados; edición/cálculo conservados | Sin desvío accionable adicional | Pruebas móviles existentes de Comisiones | Pendiente |
| `/parque-clientes` | Fila compacta y ficha existente | Alta de máquina trasladada al encabezado, sin cambiar destino | 2/2 en `ParqueClientes.test.tsx` y pruebas previas de listas | Pendiente |
| `/parque-maquinas` | Máquina/chasis/propietario; alertas de duplicado permanecen | Misma alta nativa del encabezado; resto sin desvío accionable | Mismas pruebas de Parque | Pendiente |
| `/parque-stock` | Modelo/chasis/saldo; frescura y alertas persistentes | Sin desvío accionable adicional | Pruebas existentes de listas de Parque | Pendiente |
| `/parque-stock-proyectado` | Corte visible; stock/proyectado; fórmula completa en detalle/exportación | Sin desvío accionable adicional | Pruebas existentes de Stock proyectado | Pendiente |
| `/parque-operaciones` | Facturación y entrega independientes; detalle en drawer | Sin desvío accionable adicional | Pruebas existentes del módulo | Pendiente |
| `/parque-importaciones` | Unidad/llegada/situación; documentos y recepción en drawer | Sin desvío accionable adicional | Pruebas existentes del módulo | Pendiente |
| `/repuestos` | Código/descripción/stock; detalle por sucursal | Sin desvío accionable adicional | Pruebas existentes de Repuestos | Pendiente |
| `/repuestos/compras` — Pedidos | Documento/sucursal/estado e ítems compactos | Seguimiento convertido a drawer responsivo | 10/10 en `ComprasTables.test.tsx` | Pendiente |
| `/repuestos/compras` — Solicitudes | Flujo breve de selección | Sin cambio: conserva el diálogo breve documentado | Incluida en pruebas de Compras | Pendiente |
| `/repuestos/sugerencias` | Necesidad/stock/sugerencia; avisos de calidad persistentes | Acciones del encabezado accesibles y táctiles en teléfono | Contrato de código del lote 4 | Pendiente |
| `/admin` — Equipo y accesos | Filas bajo 640; tabla desde 640; ficha y permisos sin cambio | Breakpoint corregido, permisos táctiles y altas/credenciales en drawers | 13/13 en `Admin.test.tsx` + contrato del lote 4 | Pendiente |
| `/admin` — Datos | Importaciones y previsualizaciones conservan su estructura | Sin desvío accionable adicional; requiere revisión visual específica | Pruebas existentes de importación, no una captura | Pendiente |
| `/admin` — Configuración | Se muestra sólo con permiso | Sin desvío accionable adicional | Incluida en 13/13 de Admin | Pendiente |

`/dashboard` redirige a `/servicios/ordenes`; `Dashboard.tsx` no se trató como ruta activa ni se tocó el futuro panel gerencial. `/auth`, `/sin-acceso` y la ruta inexistente son estados de sistema: quedan en la verificación visual, pero fuera de los cambios funcionales de estos lotes. `/preview/flota` existe sólo en desarrollo y sirve como fixture, no como sección productiva. `Agenda.tsx` e `Historial.tsx` no tienen ruta activa y no autorizan ampliar el alcance.

## Matriz de captura pendiente

| Estado | 320 / 390 / 639 | 640 / 768 | 1280 | Comprobación requerida |
| --- | --- | --- | --- | --- |
| Encabezado, pestañas y acciones | Sí | Sí | Sí | Sin recorte, orden correcto, 44 px táctiles bajo 640 |
| Filtros cerrados/abiertos, activos y limpiar | Sí | Frontera 640 | Sí | Sin panel vacío; `aria-expanded`, debounce, fechas y sucursal intactos |
| Listas y matrices | Datos largos y múltiples filas | Cambio exacto de presentación | Columnas completas | Sin desborde de documento ni pérdida de identidad/campos |
| Carga, vacío y error | Sí | 768 representativo | 1280 representativo | Mensajes útiles, sin saltos o contenedores vacíos |
| Permisos restringidos | Sí | 640 representativo | Sí | Acciones ausentes/deshabilitadas sin espacios muertos |
| Drawers/formularios | Teclado y scroll pendientes | 768 representativo | Sí | Título, cuerpo, pie, foco, cierre y validación accesibles |
| Calendario/Planificador | Mes, Semana, Técnicos y agenda | Matriz desde 640 | Matriz completa | Mantener excepciones, identidad de jornadas y ausencia de horas en agenda móvil |

## Límites

- No se abrió navegador ni se tomaron capturas en esta revisión; toda evidencia visual sigue pendiente.
- No se consultó producción ni se ejecutó SQL. No se cambiaron cálculos, fórmulas, consultas, permisos ni exportadores.
- `docs/knowledge/mapa-negocio.json` no está disponible en este clon ni en la ubicación original consultada. El inventario se contrastó con rutas, permisos y componentes vigentes, sin inventar el contenido ausente.
- `obsidian-sync.local` no está disponible; las notas originales se actualizaron de forma manual y no se acredita sincronización automática.
