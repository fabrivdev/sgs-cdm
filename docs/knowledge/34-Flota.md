# Flota

## Densidad de la lista móvil - 07/10/2026

Bajo 640 px, cada vehículo ocupa una fila continua de al menos 56 px y dos niveles: marca/modelo; chapa/responsable/fecha de última lectura cuando existe. Kilómetros del período y estado permanecen a la derecha. `Sin lectura` aparece una sola vez como estado, sin repetir una tercera línea. Abrir la fila conserva el mismo detalle; no se agregan gráficos, cards, consultas ni cálculos. Ocho pruebas focalizadas de Flota pasan, incluida esta estructura y el callback. La revisión visual en los anchos de la matriz transversal sigue pendiente.

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
