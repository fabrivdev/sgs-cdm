## Problema

En el Dashboard, la facturación, las horas de servicio y los km facturados aparecen todos en `$ 0` / vacíos. La consola muestra repetidamente:

```
TypeError: ye.from(...).gte is not a function
```

Esto se origina en `src/pages/Dashboard.tsx` (líneas 417-437), donde se arma la consulta a la tabla `facturacion` así:

```ts
const base = () =>
  supabase
    .from("facturacion")
    .gte("fecha", dateKey(queryStart))   // ❌ .gte no existe aquí
    .lte("fecha", dateKey(queryEnd))
    .order("fecha", { ascending: false });

return await cargarTodo<Facturacion>(
  base().select("fecha, sucursal, tipo, ..."),
);
```

En supabase-js v2 los filtros (`.gte`, `.lte`, `.eq`, `.order`, etc.) sólo están disponibles después de llamar a `.select(...)`. Como `base()` los aplica antes, la llamada lanza una excepción que el `try/catch` traga, y la facturación histórica nunca se carga.

Resultado: sólo se intenta cargar `facturacion_lineas_importadas` (grid_campos), y el array de `facturacion` termina mayormente vacío → todos los KPIs derivados (total, horas servicio basadas en `cantidad`, km facturados basados en `cantidad`, evolución, top clientes, etc.) muestran 0.

## Cambio

En `src/pages/Dashboard.tsx`, dentro del `useEffect` de carga de facturación, reescribir `cargarFacturacionHistorica` para que los filtros se apliquen **después** de `.select(...)`:

```ts
const cargarFacturacionHistorica = async () => {
  const build = (cols: string) =>
    supabase
      .from("facturacion")
      .select(cols)
      .gte("fecha", dateKey(queryStart))
      .lte("fecha", dateKey(queryEnd))
      .order("fecha", { ascending: false });

  try {
    return await cargarTodo<Facturacion>(
      build("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, cantidad, grupo, grupo_fx, cod_factura"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("cantidad")) throw error;
    const rows = await cargarTodo<Omit<Facturacion, "cantidad">>(
      build("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, grupo, grupo_fx, cod_factura"),
    );
    return rows.map((row) => ({ ...row, cantidad: 0 }));
  }
};
```

Sin otros cambios: la consulta a `facturacion_lineas_importadas`, el armado de `legacyRowsNormalizados`/`gridRows` y toda la lógica de cálculo (concept, horas por `cantidad`, km por `cantidad`) ya están correctas y vuelven a funcionar en cuanto los datos legacy se carguen.

## Verificación

- Recargar `/dashboard`: el error `gte is not a function` debe desaparecer de la consola.
- El total de facturación, "Horas servicio" y "Km fact." vuelven a mostrar valores reales.

Fuera de alcance: cualquier otro ajuste visual del dashboard.
