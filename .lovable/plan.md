# Listado de OS ancladas a trabajos

Agregar un toggle/pestaña en la página **Trabajos** para alternar entre la vista actual (kanban) y una nueva vista de tabla con todas las **OS** que están vinculadas a un trabajo (`ordenes_servicio_importadas` con `trabajo_id IS NOT NULL`).

## Cambios en `src/pages/Trabajos.tsx`

1. **Estado de vista**: agregar `const [vista, setVista] = useState<"kanban" | "os">("kanban")`.
2. **Toggle** al lado del título (Tabs o botones): "Kanban" / "Órdenes de servicio".
3. Cuando `vista === "os"` se oculta el kanban y se renderiza el nuevo componente `<TrabajosOSTab />`.

## Nuevo componente `src/components/trabajos/TrabajosOSTab.tsx`

Carga en paralelo:
- `ordenes_servicio_importadas` donde `trabajo_id is not null` (todas, paginado 1000).
- `trabajos` (id, codigo, os_numero, sucursal, cliente_id, descripcion_problema) para enriquecer.
- `clientes` (id, nombre) para mostrar nombre.

Calcula por fila:
- **Total facturado** = `servicios_valor + repuesto_valor + kilometro_valor + terceros_valor` (sumando solo no nulos).
- **Horas** = `servicios_cantidad`.
- **Ref. trabajo** = `trabajoReferencia(trabajo)` (OS-#### o TR-######).

### Filtros (reutilizando `FiltersBar`)
- Búsqueda libre: nro OS, factura, cliente, TR/OS-ref, problema, chasis, mecánico.
- Select sucursal (del trabajo).
- Select situación OS (`situacion_os` distinct).
- Select situación facturación (`situacion_facturacion` distinct).
- Rango de fecha (por `fecha_abierta_os`).

### Tabla (scroll horizontal en mobile)
Columnas:

```text
OS  |  TR/OS-ref  |  Cliente  |  Fecha OS  |  Factura  |  Fecha fact.
Marca | Chasis | Mecánico/Responsable | Problema | Tipo tiempo
Horas (serv. cant.) | Serv. unit. | Servicios $ | Repuestos $
Km cant. | Km unit. | Km $ | Terceros $ | TOTAL $
Situación OS | Situación facturación
```

- Totales al pie: suma de horas, servicios, repuestos, km, terceros, total.
- Click en la fila abre `TrabajoDetalleDrawer` con el `trabajo_id` correspondiente (mismo drawer que ya usa Trabajos).
- Ordenamiento por header (al menos por fecha OS, total, horas).
- Formateo: moneda con `Intl.NumberFormat('es-PY')` sin decimales; fechas `dd/MM/yyyy`.

## Notas técnicas
- Tabla puede crecer (hoy 19 vinculadas, pero el universo es 416 y subirá); se usa el mismo helper `cargarTodo` con paginación de 1000.
- Sin cambios de schema ni RLS (la tabla ya tiene policy de SELECT para authenticated).
- Reutilizar tokens del design system; no introducir colores nuevos.

## Fuera de alcance
- No se modifica el kanban actual.
- No se agrega edición de OS desde esta vista (solo lectura + abrir detalle del trabajo).
