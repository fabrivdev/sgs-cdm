# Flota

## Alcance local

Flota es una sección de Servicios para registrar vehículos por marca y chapa. La chapa se normaliza para impedir duplicados aunque cambien espacios o guiones. La lectura inicial fechada se agrega si está disponible; también puede quedar pendiente, sin inventar fecha ni `0 km`. Las lecturas posteriores conservan fecha, odómetro y autor.

Los kilómetros recorridos son la diferencia entre dos lecturas vigentes consecutivas del mismo vehículo. Si falta una semana, el intervalo se muestra como tal y no se crea una lectura, semana ni distancia interpolada. Una lectura no puede duplicar la fecha ni quedar fuera de la secuencia de odómetro.

Las correcciones no sobrescriben el registro original: lo dejan anulado con autor, fecha y motivo, y crean una lectura reemplazante. La pantalla muestra el historial de correcciones.

Fuente local: `src/pages/Flota.tsx`, `src/features/fleet/model.ts`, `supabase/migrations/20261006132000_add_fleet_management.sql` y `supabase/migrations/20261006133000_seed_confirmed_fleet_vehicles.sql`.

## Acceso y estado de base

La sección usa `servicios.flota`. Las tablas permiten lectura a sesiones autenticadas; altas y correcciones pasan por RPC que exige `auth.uid()` y acceso a la sección. La migración no copia permisos existentes ni crea vehículos.

El 06/10/2026 el usuario informó que ejecutó las migraciones `20261006132000_add_fleet_management.sql` y `20261006133000_seed_confirmed_fleet_vehicles.sql`. No deben reejecutarse desde este worktree. Esa declaración no sustituye una verificación autenticada de las 15 altas; cualquier ajuste posterior de esquema o datos debe ser incremental. El seed resuelve exclusivamente la cuenta `fabrizio.vega@cdm.com.py`, rechaza chapas existentes creadas por otra cuenta y no crea lecturas ni permisos.

## Límite de facturación

No se implementa una carga manual vehículo-OS o vehículo-salida porque duplicaría trabajo operativo. Tampoco se atribuye facturación por vehículo, técnico, chasis de la máquina atendida ni proximidad de fechas. El importe `billing.travel` no representa distancia y no se divide por una tarifa para inventar kilómetros.

La decisión y su límite están documentados en `docs/flota-asignacion-os-borrador.md`.

## Simulación y altas declaradas

La preview local usa vehículos y lecturas inequívocamente DEMO. Sus cambios viven solo en memoria y se pueden restablecer. Un intervalo que cruza el inicio del período se muestra como parcial y no se suma.

El archivo `docs/flota-altas-reales-pendientes.json` conserva las 15 altas confirmadas desde las fotos, todas sin lectura inicial. Se resolvieron los dos conflictos de chapa usando el identificador, por indicación expresa del usuario. El usuario declaró ejecutado el seed; la comprobación de las 15 filas sigue pendiente de una sesión autenticada de solo lectura.

La UI incorpora referencias verificadas para las 15 unidades confirmadas, con coincidencias estrictas por marca, modelo, año conocido y carrocería. MAXUS T60 y Mitsubishi L200 usan referencias de doble cabina con licencia CC BY-SA 2.0. ISUZU D-Max distingue la cabina simple de AAON-294 y la doble cabina; las unidades 2025 y 2026 comparten una referencia de familia de tercera generación sin afirmar año ni acabado exactos. Todas se muestran como imágenes referenciales, nunca como foto del vehículo real, con autor, fuente y licencia visibles junto a la imagen. Un modelo o año fuera del catálogo queda sin imagen en vez de recibir una aproximación. Los campos de imagen de base permanecen nulos. Fuente local: `src/features/fleet/vehicleImages.ts`.

## Presentación vigente

La pantalla principal queda limitada a una lista de ancho completo y filtros. No muestra indicadores, paneles laterales, pestañas, gráficos ni comparaciones de facturación. Cada fila de escritorio/tablet ocupa una sola línea y separa Marca, Modelo, Chapa, Último kilometraje, Fecha última lectura, Km del período y Estado; hacer clic en la fila abre el detalle sin una acción redundante. `Más filtros` contiene únicamente Marca, Modelo dependiente de la marca y Lecturas en el período (Todas/Con/Sin), además de los filtros primarios existentes.

El detalle es compacto y contiene únicamente identidad, imagen referencial cuando existe, último kilometraje, fecha de última lectura, kilómetros del período, cobertura, lecturas y correcciones auditadas. Los contadores de Vehículos, Lecturas y Correcciones comparten la fila del encabezado; no se presentan como subtítulo. Distinguir siempre el odómetro acumulado del recorrido del período. Una ausencia se muestra como `-` o `Sin intervalo`; no se convierte en cero. En teléfono se permite la agrupación compacta prevista por la regla transversal, sin convertir cada registro en una tarjeta grande.

Esta presentación reemplaza la comparación visual global y los gráficos documentados anteriormente. No cambia fórmulas, fuentes ni permisos. La aplicación de las migraciones fue declarada por el usuario y su verificación autenticada sigue pendiente.
