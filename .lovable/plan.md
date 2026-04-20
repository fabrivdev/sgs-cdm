
# Ajustes al modelo antes de la carga masiva

## Cambios solicitados
1. **Clientes sin sucursal fija**: un cliente puede recibir servicios en cualquier sucursal.
2. **Técnicos pueden trabajar en cualquier sucursal**: la `sucursal` del perfil es sólo su base, no una restricción. Equipo HORSCH Brasil y cualquier técnico puede ser asignado a servicios de otras sucursales.

## Cambios de schema (migración)

### Tabla `clientes`
- `sucursal` pasa de `NOT NULL` a **nullable** (o se elimina). Decisión: la dejo **nullable** para no romper datos existentes y permitir guardar opcionalmente la sucursal "principal" del cliente si se desea, pero ya no se usa para filtrar ni para validar.
- Actualizar las RLS de `clientes`:
  - **SELECT**: cualquier usuario autenticado ve todos los clientes (necesario para que un técnico de Santa Rita pueda asignar un servicio a un cliente "de" Campo 9).
  - **INSERT/UPDATE**: admin y cabecilla (sin filtro de sucursal del cliente).
  - **DELETE**: sólo admin.

### Tabla `profiles`
- No cambia el schema (`sucursal` ya es nullable). La sucursal queda como informativa = "base" del técnico.
- No se aplica ninguna restricción adicional: un técnico puede ser `tecnico_responsable_id` o estar en `auxiliares` de un servicio de cualquier sucursal.

### Tabla `servicios`
- No cambia. La columna `sucursal` del servicio sigue indicando dónde se ejecuta el trabajo, independiente de la base del técnico.
- Las RLS actuales ya permiten que el técnico vea el servicio si es responsable o auxiliar (sin importar la sucursal del servicio vs. su base) ✓.

## Ajustes en el frontend

### `ServicioFormDialog`
- Selector de **cliente**: mostrar todos los clientes (sin filtrar por sucursal del servicio).
- Selector de **técnico responsable** y **auxiliares**: mostrar todos los técnicos activos (sin filtrar por sucursal). Mostrar la sucursal base entre paréntesis para referencia visual: `Juan Pérez (Santa Rita)`.

### `Admin` (gestión de clientes)
- Hacer el campo "sucursal" del cliente **opcional** en el formulario (etiqueta: "Sucursal principal (opcional)").
- En la lista de clientes mostrar "—" cuando no haya sucursal.

### `Historial`
- El buscador de clientes ya no filtra por sucursal del usuario; muestra el listado completo.

## Carga masiva del Excel (después de aplicar lo anterior)

Una sola transacción SQL que hace:

1. **Insert de 27 perfiles** con uuids generados. Cada uno con su sucursal base del Excel (`EQUIPO TÉCNICO HORSCH BRASIL` con sucursal = `Campo 9` como base, pero podrá ser asignado a servicios de cualquier sucursal).
2. **Insert de ~22 clientes** con uuids generados, **sin sucursal** (NULL), `ON CONFLICT (nombre) DO NOTHING` para evitar duplicados.
3. **Insert de 27 servicios** resolviendo `tecnico_responsable_id` y `cliente_id` por nombre vía subqueries. La columna `sucursal` del servicio se toma de la columna "SUCURSAL" del Excel (la sucursal donde se ejecuta el trabajo).

Para que el `ON CONFLICT` funcione en clientes agrego un **índice único en `clientes.nombre`** dentro de la misma migración.

## Resultado esperado
- Vas a poder asignar cualquier técnico a cualquier servicio sin importar su sucursal base.
- El Equipo HORSCH Brasil aparece como técnico disponible en todas las sucursales.
- Los clientes son globales: cualquier sucursal puede crear servicios para cualquier cliente.
- Los 27 servicios del Excel quedan cargados con sus técnicos, auxiliares y clientes correctamente vinculados.
