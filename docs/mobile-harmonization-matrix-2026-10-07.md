# Matriz de armonización móvil — 07/10/2026

## Ajuste puntual posterior: barra de Productividad

| Ruta / sección | Cambio bajo 640 px | Conservado | Evidencia requerida |
| --- | --- | --- | --- |
| `/servicios/ordenes` - Productividad | Nombre y porcentaje en la primera línea; riel `bg-muted` de ancho completo debajo y relleno `bg-primary` según el porcentaje real | Meta ausente sin barra/0%, detalle del técnico, accesibilidad, orden, Excel y escritorio/tablet | Prueba DOM del ancho, porcentaje menor a 100%, meta ausente y callback; verificación visual de overflow sigue pendiente |

La tonalidad gris general proviene de los tokens vigentes `background` y `muted`, no de un estado de datos. Este ajuste no cambia colores semánticos, consultas, cálculos, permisos, SQL, panel gerencial ni otras vistas.

Estado: inventario transversal de código y pruebas locales. No es una aprobación visual ni certifica producción.

## Alcance y método

Se contrastaron las rutas activas de `src/App.tsx`, la navegación de `src/components/AppLayout.tsx`, los componentes compartidos y las excepciones documentadas en la memoria del proyecto. Esta revisión no abrió la aplicación ni un navegador. Por eso, “sin desvío accionable” significa que la inspección estática y las pruebas existentes no justificaron un cambio; no significa que la vista haya sido aprobada visualmente.

La regla de corte es teléfono por debajo de 640 px. La verificación visual posterior debe cubrir 320, 390, 639, 640, 768 y 1280 px, además de texto largo, filtro activo, carga, vacío, error, permisos restringidos y drawer abierto cuando corresponda.

## Implementación de jerarquía de filas - 07/10/2026

Esta tabla prevalece sobre las filas anteriores del inventario para los cinco destinos evaluados.

| Ruta / sección | Resultado bajo 640 px | Conservado fuera de la fila | Estado |
| --- | --- | --- | --- |
| `/servicios/ordenes` · Órdenes | OS + cliente; horas; estado | Marca/modelo, técnicos y km en drawer; orden y exportación completos | Implementado y cubierto por componente |
| `/servicios/ordenes` · Cumplimiento | Técnico; porcentaje/`-` y barra; una excepción prioritaria | `x de y`, horas, programados, refs y motivos en drawer; no convierte ND en 0 | Implementado y cubierto por componente |
| `/` · Planificador | Fecha, cliente, tarea de una línea, TR, estado y continuidad sólo si `m > 1` | OS, horas y demás evidencia en detalle/búsqueda/exportación | Implementado y cubierto por componente |
| `/servicios/flota` · lista | Marca/modelo + chapa + responsable en líneas separadas; km del período; estado | Última fecha en detalle; responsable se conserva hasta validar uso diario | Implementado y cubierto por componente |
| `/parque-operaciones` | Modelo, NP, cliente y un badge con eje: bloqueo de entrega o, sin bloqueo, facturación | Segundo eje y trazabilidad en drawer; no se fusionan estados | Implementado y cubierto por componente |
| `/parque-importaciones` | Sin cambio | Requiere evidencia visual con datos antes de reducir | Pendiente visual |
| `/parque-maquinas` | Sin cambio | Requiere evidencia visual con datos antes de reducir | Pendiente visual |

Sin cambio deliberado: Productividad, Trabajos, Equipo/Administración y detalle de Flota. No se modificaron cabeceras, filtros, pestañas, cards, sidebar, escritorio, fórmulas, consultas, permisos, exportaciones ni SQL. La validación fue local y secuencial; no se abrió navegador ni la aplicación y la QA visual permanece pendiente.

## Actualización posterior: servicios, filtros y Flota

Esta sección prevalece sobre las filas anteriores que describían semana o estados fuera de Filtros y sobre la fila de Órdenes que agrupaba actividad como una tercera línea de identidad.

| Ruta / sección | Causa confirmada | Resultado local | Prueba | QA visual |
| --- | --- | --- | --- | --- |
| `/servicios/ordenes` · Órdenes | Cinco KPI no respetaban tres columnas; actividad apilada en identidad | KPI 3 + 2 en tres columnas uniformes; fila con Identidad/Actividad/Estado | `OrdenesServicio.test.tsx` | Pendiente 320/390/639 y frontera 640 |
| `/servicios/ordenes` · Productividad | `min-width: 440px`, cinco microcolumnas y estado/incidencia exteriores | Técnico/Productividad sin scroll forzado; estado e incidencias dentro de Filtros; drawer conserva jornadas | `OrdenesServicio.test.tsx` | Pendiente, incluido overflow real |
| `/servicios/ordenes` · Cumplimiento | Período y Trabajos/Horas duplicados sobre la matriz; abreviaturas crípticas | Selectores dentro de Filtros; copia explícita y un período visible | `OrdenesServicio.test.tsx` | Pendiente con filtros y detalle abiertos |
| `/` Planificador | Semana y flechas repetidas sobre la agenda | Selector y navegación semanal sólo dentro de Filtros bajo 640 px | `ServiceLists.test.tsx` | Pendiente |
| `/trabajos` | Seis estados ocupaban dos filas como navegación aparente | Lista desplegable de estado dentro de Filtros bajo 640 px | `ServiceLists.test.tsx` | Pendiente |
| `/servicios/flota` · detalle | `Registrar lectura` era la rama del encabezado que no consumía la regla compartida | Objetivo 44 × 44, icono móvil, nombre accesible y texto desde 640 px | `fleetCreateButton.test.ts`, `FlotaDrawers.test.tsx` | Captura localizada por OCR; píxeles y recaptura pendientes |

La regla de este ajuste no modifica el panel gerencial: conserva cuatro indicadores visibles por sección; no se fuerza desde aquí una grilla móvil. Tampoco modifica SQL, consultas, fórmulas, permisos, exportaciones ni callbacks.

Validación automatizada local: 105 pruebas focalizadas correctas (94 de Órdenes/Listas y 11 de Flota). No se abrió la aplicación ni navegador. Las referencias de Library sólo permitieron OCR/caption, no inspección de píxeles; siguen pendientes medición de `scrollWidth/clientWidth`, capturas en 320/390/639/640/768/1280, carga/vacío/error/permisos y drawers abiertos. No hubo commit, push ni publicación.

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
| Menú de sección movido entre cabecera y filtros según ancho | Ventas y Órdenes de servicio | Un solo montaje mediante `FiltersBar.secondaryActions` en todos los anchos | La coincidencia visual exacta con la referencia sigue pendiente de acceso a píxeles |
| Resumen de período aplicado bajo el título | Ventas y Productividad de Órdenes | Se retira la repetición; fechas, consultas, corte histórico y selección de períodos permanecen funcionales | Mes de Calendario y corte de Stock proyectado se conservan como contexto operativo |
| Altas con color móvil desigual | Planificador y demás altas de cabecera | `mobileHeaderCreateButton` conserva el icono primario de Planificador para todas, solo bajo 640 px | No altera estilo de escritorio, permiso, callback ni formulario |

## Inventario de rutas y secciones

| Ruta / sección | Patrón y excepción funcional | Resultado de código | Evidencia automatizada local | Evidencia visual |
| --- | --- | --- | --- | --- |
| `/servicios/ventas` | Workspace móvil propio de Ventas | Sin rango repetido bajo título; menú de sección junto a filtros; fechas, períodos y exportación preservados | `VentasAsync.test.tsx` y `VentasMobile.test.tsx` | Pendiente |
| `/parque-ventas` | Mismo workspace de Ventas | Sin rango repetido bajo título; menú de sección junto a filtros | Mismas pruebas de Ventas | Pendiente |
| `/repuestos/ventas` | Mismo workspace de Ventas | Sin rango repetido bajo título; menú de sección junto a filtros | Mismas pruebas de Ventas | Pendiente |
| `/` Planificador | Agenda móvil propia, sin horas en la fila; tabla desde 640 px | Alta con estilo compartido; menú ya estaba junto a filtros | `ServiceLists.test.tsx` y contrato de altas | Pendiente |
| `/trabajos` | Lista plana móvil; tablero en tablet/escritorio | Separadores y densidad ya corregidos en `9702832` | `ServiceLists.test.tsx` | Pendiente |
| `/calendario` | Mes conserva cuadrícula; Semana/Técnicos usan agenda móvil; consultar no reprograma | Gutter común aplicado sin tocar vistas, arrastre ni callbacks | Contrato de código del lote 4; pruebas previas de agenda compartida | Pendiente |
| `/servicios/ordenes` - Órdenes | Lista compacta y drawer de detalle | Menú junto a filtros; fila conserva OS, equipo, técnicos, horas y km | `OrdenesServicio.test.tsx` | Pendiente |
| `/servicios/ordenes` - Productividad | Matriz móvil propia y drawer de técnico | Sin rango decorativo en el título; fechas y corte histórico intactos | `OrdenesServicio.test.tsx` | Pendiente |
| `/servicios/ordenes` - Cumplimiento | Matriz, no lista genérica | Menú junto a filtros; objetivos, filtros y datos intactos | `OrdenesServicio.test.tsx` | Pendiente |
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

## Validación local del ajuste de jerarquía

- 105 pruebas focalizadas correctas en `VentasAsync.test.tsx`, `VentasMobile.test.tsx`, `OrdenesServicio.test.tsx` y `fleetCreateButton.test.ts`.
- Typecheck y compilación de producción correctos.
- ESLint correcto en Ventas, Órdenes y sus pruebas. `Planificador.tsx` conserva cuatro `any` y una advertencia de dependencia de hook que ya existían fuera de las líneas modificadas; no se amplió el alcance para corregirlos.
- No se abrió la aplicación ni un navegador. La referencia nueva de Library solo estuvo disponible como OCR/caption, no como píxeles; por eso la validación visual y la coincidencia fina de alineación permanecen pendientes.
- No hubo SQL, consulta a producción ni publicación en Lovable; la publicación Git de este lote se verifica por separado al cierre.

## Límites

- No se abrió navegador ni se tomaron capturas en esta revisión; toda evidencia visual sigue pendiente.
- No se consultó producción ni se ejecutó SQL. No se cambiaron cálculos, fórmulas, consultas, permisos ni exportadores.
- `docs/knowledge/mapa-negocio.json` no está disponible en este clon ni en la ubicación original consultada. El inventario se contrastó con rutas, permisos y componentes vigentes, sin inventar el contenido ausente.
- `obsidian-sync.local` no está disponible; las notas originales se actualizaron de forma manual y no se acredita sincronización automática.
