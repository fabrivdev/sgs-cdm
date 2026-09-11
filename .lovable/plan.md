# Diagnóstico de Ventas de Servicios y detalle de OS

No se propone modificar nada todavía. Este mapa refleja el código y los datos actuales verificados.

## 1. Cliente facturado vs dueño de la máquina

### Qué ocurre hoy

La columna **Cliente** de “Órdenes de servicio facturadas” no sale de la OS ni del parque de máquinas. Sale de `entidad_nombre` de las líneas de facturación, mediante `ventas_area_movimientos_base`, y la RPC `ventas_servicios_detalle_os` lo agrupa como `cliente`.

En la OS importada sí existen ambos conceptos:

- **Dueño/propietario**: `cliente_nombre` y `raw_data.Nombre` contienen el nombre; `raw_data.Propietario` contiene su código.
- **Cliente facturado**: `raw_data.NOMCLI` contiene el nombre; `raw_data.CLIFAC` contiene su código.

El nombre `NOMCLI` es engañoso: en estos archivos representa al receptor de la factura, no al propietario.

### Ejemplo real

**OS 02-00000035 · chasis C6501781**

| Concepto | Código | Nombre |
|---|---:|---|
| Propietario real | 3631552-4 | IZRAEL WENZEL DE SOUZA |
| Cliente facturado | 80001785-4 | ALIANZA GARANTIA SEGUROS Y REASEGUROS SA |

La línea facturada también trae `entidad_nombre = ALIANZA GARANTIA SEGUROS Y REASEGUROS SA`, por eso ese es el nombre que hoy aparece en la lista.

Otro ejemplo: **OS 01-00000136**, dueño **WELLINGTON ELY KAEFER**, facturada a **CAMPOS DEL MAÑANA S.A. - SANTA RITA**.

### Qué dato está disponible

El dueño está disponible para las OS del nuevo formato y ya está consolidado en `ordenes_servicio_importadas.cliente_nombre`. Además, el drawer del chasis prioriza actualmente el cliente del parque de máquinas y usa `cliente_nombre` de la OS como respaldo.

### Qué implicaría el cambio

- La lista por OS debe tomar el propietario desde la OS vinculada, no desde la factura.
- Conviene conservar internamente ambos campos y nombrarlos de forma explícita: **Propietario** y **Facturado a**.
- Hay que definir un fallback para movimientos históricos sin OS confiablemente vinculada: no inventar dueño; mostrar “Sin propietario identificado”.
- Búsqueda, análisis por cliente y comparaciones también deben decidir explícitamente si “Cliente” significa propietario o facturado. Cambiar solo la columna produciría cifras y filtros semánticamente inconsistentes.

## 2. OS con varios tipos de tiempo

### Qué ocurre hoy

El nuevo importador ya conserva el detalle múltiple dentro de `raw_data`:

- `tipos_tiempo`: lista de tipos presentes.
- `totales_por_tipo`: horas, kilómetros y valores separados por tipo.
- `facturas_por_tipo`: facturas asociadas a cada tipo.

Pero la columna estructurada `ordenes_servicio_importadas.tipo_tiempo` queda como **Mixto**. La RPC de la lista pasa ese texto por `ventas_tipo_tiempo_normalizado`; como “Mixto” no coincide con Garantía, Interno ni Cliente, termina como **No informado**. Después agrupa con `max(tipo_tiempo)`. No toma el primero ni suma correctamente por tipo: oculta el desglose ya disponible.

El drawer tampoco lee `tipos_tiempo` ni `totales_por_tipo`; muestra simplemente el badge crudo **Mixto**. Su filtro ofrece Cliente/Garantía/Interno, por lo que una OS “Mixto” no entra en ninguno de esos filtros.

### Ejemplo real

**OS 01-00000136 · WELLINGTON ELY KAEFER**

- Columna actual de la OS: `tipo_tiempo = Mixto`.
- Dato detallado: `tipos_tiempo = [Garantia, Interno]`.
- Garantía: 2,5 h, 202 km, USD 121,20 de kilometraje y USD 120,83 de servicio.
- Interno: USD 20,23 de repuestos.
- Facturas por tipo: Garantía `0010000000074`; Interno `0010010005006`.
- La lista principal lo normaliza y muestra **No informado**; el drawer muestra **Mixto**.

También existe **OS 01-00000183** con `[Cliente, Garantia]`, dividido en repuestos por USD 149,70 y USD 579,55 respectivamente.

### Qué implicaría el cambio

- Tratar el tipo de tiempo como una colección, no como una sola etiqueta.
- Mostrar varios badges en una OS y permitir que el filtro encuentre la OS si contiene cualquiera de los tipos elegidos.
- Para importes y análisis, usar el tipo de cada línea facturada o `totales_por_tipo`; no duplicar el total completo en cada categoría.
- Mantener “No informado” solo cuando realmente no existe clasificación, no como traducción accidental de “Mixto”.

## 3. Detalle de OS vs historial del chasis y repuestos

### Qué muestra hoy cada uno

No son dos vistas independientes: ambos usan el mismo `MachineHistorySheet`.

- Click en una **fila de OS**: consulta únicamente ese `os_numero`, abre en “Servicios” y expande esa OS.
- Click en el **chasis**: consulta todas las OS con ese `nro_chasis`, abre en “Resumen” y ofrece Resumen, Servicios y Repuestos.

El título cambia, pero la estructura, cálculos y tarjetas son los mismos. Por eso se sienten solapados.

### Repuestos hoy

Hay dos presentaciones distintas:

- En la fila principal y en la pestaña Servicios se muestra un **total agregado** de repuestos por OS.
- En la pestaña Repuestos del drawer sí se muestra **una línea por repuesto**, con código interno, código de fabricante, descripción, cantidad, precio unitario y total.
- Si una OS histórica solo conserva `repuesto_valor`, muestra el total y avisa que no existen códigos de línea.

El dato detallado existe en `facturacion_lineas_importadas` para las líneas actuales vinculadas mediante `raw_data.linked_service_order`. Por ejemplo, la OS `01-00000052` tiene 16 líneas de repuesto identificadas con sus códigos.

### Solapamientos y diferencias riesgosas

- La lista principal suma facturación del período; el drawer puede usar valores crudos de la OS como fallback aunque no exista factura vinculada.
- La lista normaliza el vínculo de OS; el drawer compara `linked_service_order` de forma exacta.
- El drawer por chasis no hereda el rango ni la sucursal elegidos en Ventas.
- “Facturación vinculada” del resumen del chasis puede incluir valores declarados en OS sin factura, porque usa el fallback; esa etiqueta no es literalmente segura hoy.

### Qué implicaría el cambio

- **Detalle de OS**: una ficha puntual y compacta de esa OS, con propietario, facturado a, tipos múltiples, facturas, trabajo y todos los repuestos uno por línea.
- **Historial del chasis**: una línea temporal de múltiples OS, priorizando fechas, trabajo, estado y existencia o ausencia de facturación; abrir una OS lleva a su detalle puntual.
- Unificar la regla de vínculo y separar claramente “importe facturado” de “importe registrado en la OS”.

## 4. Historial de OS viejas sin facturación

### Qué hay disponible

La tabla contiene **1.567 OS distintas** entre el 03/01/2025 y el 09/09/2026.

- 1.365 OS son anteriores al corte del 01/07/2026.
- 776 OS legacy no tienen factura informada.
- 1.198 filas legacy tienen chasis.
- 623 OS legacy sin factura tienen un chasis que coincide con una máquina del parque actual.

La referencia a “las 1.345 sin sucursal” parece corresponder a las **1.345 filas del formato legacy** identificadas por `raw_data['Tipo de Tiempo']`, no a filas realmente sin sucursal: esas 1.345 conservan `raw_data.Sucursal`. La tabla no tiene una columna estructurada `sucursal` para OS.

### Qué hace hoy el drawer

El drawer por chasis consulta directamente `ordenes_servicio_importadas` y **no exige factura**, fecha ni sucursal. Por tanto, ya puede traer OS viejas sin facturación cuando el chasis coincide exactamente.

Las muestra como:

- “Sin factura” si no hay líneas vinculadas y `situacion_facturacion` también está vacía.
- Con importes de la propia OS como fallback, aunque esos importes no prueben que se facturó.
- Con aviso de falta de códigos cuando solo existe el total histórico de repuestos.

La limitación práctica es el acceso: el historial solo se abre desde la lista de OS facturadas. Una máquina que solo tenga OS antiguas sin factura no tiene una entrada directa desde esta pantalla. Además, el match de chasis del drawer es directo y no usa la normalización robusta disponible en otras funciones.

### Qué implicaría el cambio

- Hacer accesible el historial desde la máquina/chasis, no depender de que exista primero una OS facturada en Ventas.
- Incluir todas las OS vinculables por chasis normalizado, incluso sin factura.
- Distinguir tres estados: **facturación vinculada**, **sin dato de facturación** y **dato histórico no verificable**.
- No sumar importes crudos de una OS bajo el rótulo “Facturación vinculada” cuando no hay documento o línea de factura.
- Mantener vacío el detalle por código cuando el legacy solo conserva un total; no reconstruir ni inferir repuestos inexistentes.

## Mapa técnico del cambio eventual

1. Ajustar las consultas de Ventas para devolver por separado propietario y receptor de factura.
2. Exponer los tipos múltiples y sus importes por tipo sin duplicar montos.
3. Separar la experiencia de detalle puntual de OS del historial completo del chasis.
4. Centralizar el vínculo normalizado OS–facturas–chasis y el estado de evidencia de facturación.
5. Validar con casos reales: `02-00000035` para propietario distinto, `01-00000136` para tipos mixtos y una OS legacy sin factura con chasis coincidente.
6. Recién después, actualizar búsqueda, filtros, análisis y pruebas para que “Cliente”, “Tipo” y “Facturado” mantengan el mismo significado en toda Ventas.
