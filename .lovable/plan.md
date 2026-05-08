## Cambios solicitados

Tres mejoras en **Parque & Clientes**:

### 1. Etiquetas en los filtros del Parque
Hoy los selects (Sucursal, Marca, Subgrupo, Seguimiento, Rango de fechas, Switch de plataformas) aparecen sin título y solo se distinguen por su placeholder, lo cual no se entiende a simple vista.

- En **desktop**: agregar una etiqueta pequeña (`text-[10px] uppercase text-muted-foreground`) encima de cada control. Para que entre todo bien en una sola fila, agruparemos cada filtro en una columna `flex flex-col` con su label arriba y el control abajo. Si no entra, hace `flex-wrap` natural.
- En **mobile (Sheet de filtros)**: cada control ya está apilado, simplemente se le agrega su `<Label>` arriba.
- Etiquetas: "Sucursal", "Marca", "Subgrupo", "Seguimiento", "Período", "Plataformas/cabezales".
- El buscador y los botones (Nueva máquina, Exportar) quedan igual; pueden separarse a una segunda fila para que los filtros respiren mejor.

Archivo: `src/components/parque/ParqueTab.tsx`.

### 2. Vista "Mensajes enviados" en Agenda comercial
En `AgendaTab.tsx` añadir un sub-tab interno (o toggle) con dos vistas:

- **Pendientes** (la actual): clientes ordenados por días sin contacto.
- **Historial de seguimientos**: lista cronológica (más reciente primero) de todos los registros de `seguimiento_comercial`, mostrando fecha, cliente (clickable para abrir el panel), resultado (badge de color) y observaciones. Permite ver "a quiénes se les escribió/llamó" y qué se les dijo. Filtros simples: por resultado y por rango de fecha (últimos 7d / 30d / 90d / todo).

Archivo: `src/components/parque/AgendaTab.tsx`.

### 3. Nueva vista "Máquinas" (listado plano de todas las máquinas)
Hoy `ParqueTab` agrupa por cliente. Se necesita ver **todas las máquinas vendidas** sin agrupar.

Opción elegida: agregar un **cuarto tab** en `ParqueClientes.tsx` llamado **"Máquinas"** (entre "Parque" e "Importar") con un nuevo componente `MaquinasTab.tsx`.

La tabla mostrará una fila por máquina con:
- Cliente (clickable → abre `ClientePanel`)
- Sucursal, Localidad
- Marca, Subgrupo, Modelo/tipo
- Año, Antigüedad
- Serie
- Vendedor
- Activa/Inactiva

Filtros: buscador (por cliente, serie o modelo), sucursal, marca, subgrupo, año desde/hasta, estado (activa/inactiva). Ordenamiento por columnas. Exportación a Excel.

Archivos nuevos / editados:
- `src/components/parque/MaquinasTab.tsx` (nuevo)
- `src/pages/ParqueClientes.tsx` (agregar tab)

### Detalles técnicos

- No se requieren cambios de DB ni RPC nuevas; se reutilizan `parque_maquinas` + `clientes`.
- Se respeta el sistema de diseño (tokens semánticos, sin colores hardcoded fuera de los badges ya existentes).
- Las métricas KPI superiores siguen alimentándose desde `ParqueTab`; en los nuevos tabs (Máquinas / Agenda historial) se mantienen los KPIs globales (`parque_kpis`).
