## Cambios en la pestaña Trabajos del Dashboard

### 1. Reemplazar "Lectura operativa"
Quitar la tarjeta de KPIs textuales y poner en su lugar **"Distribución por marca"**: barras horizontales por marca (CLAAS, HORSCH, OTROS) mostrando trabajos abiertos / pausados / cerrados en el período, con totales y % de participación. Click en una marca filtra la pestaña por esa marca.

### 2. Arreglar filtros que no filtran
Hoy los filtros **Estado** y **Técnico/cuadrilla** de la pestaña Trabajos solo afectan a la tabla "Seguimiento por OS/TR". Los paneles superiores (Estado de trabajos, Carga por sucursal, Productividad técnica) usan `trabajosBase` o las jornadas crudas y no respetan esos filtros, por eso al cambiarlos no pasa "nada visible".

Voy a redefinir los datos derivados para que respeten los filtros activos de la pestaña:
- `flujo` (donut Estado de trabajos): basado en `trabajosResumen` (ya filtrado).
- `cargaSucursal`: filtrar por técnico y marca antes de clasificar.
- `productividadMatriz`: aplicar filtro por técnico (mostrar solo filas seleccionadas) y por marca/estado (filtrar jornadas cuyo trabajo cumpla los filtros).
- `trabajosPausados` y conteos de chips: usar `trabajosResumen`.

### 3. Agregar filtro por Marca
Nuevo `FilterMultiSelect` "Marca" en la pestaña Trabajos con opciones CLAAS / HORSCH / OTROS. Estado `fMarcasTrabajo`.

Para que funcione, en la query de `trabajos` agregar el campo `marca` al select y propagarlo a `trabajosBase.marca` (hoy `tipo` proviene del servicio, lo que no es confiable). Actualizar la interfaz `Trabajo`.

### Fuera de alcance
No se tocan tablas/RLS, ni Planificador, ni el resto de las pestañas.