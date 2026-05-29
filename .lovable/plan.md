# Mostrar OS en el Planificador

## Problema
En la página **Trabajos** la referencia del trabajo se muestra como `OS-####` cuando el trabajo tiene `os_numero` cargado (usa `trabajoReferencia()`), y como `TR-####` cuando no. En el **Planificador** sólo se muestra `t.codigo` (siempre `TR-####`), por lo que la OS no aparece nunca.

## Cambios en `src/pages/Planificador.tsx`

1. **Cargar `os_numero`** en el `select` de `trabajos` (línea 156): añadir `os_numero, proxima_accion` al listado de columnas de `trabajosLite`.

2. **Reemplazar `codigoByServicio: Map<string,string>` por `refByServicio: Map<string,string>`** (líneas 242-248):
   - Para cada trabajo con `legacy_servicio_id`, calcular la referencia usando `trabajoReferencia(t)` de `@/lib/trabajos` (devuelve `OS-####` si hay `os_numero`, si no `TR-####`).
   - Importar `trabajoReferencia` y `trabajoOsNumero` desde `@/lib/trabajos`.

3. **Usar `refByServicio`** en lugar de `codigoByServicio` en:
   - Filtro de búsqueda (línea 273-274) — además de buscar por nombre y código, también por número de OS.
   - Renders de chips/badges en las líneas 515-517 y 627-630 (las dos vistas del planificador).

4. **Placeholder de búsqueda** (línea 420): actualizar a `"Buscar OS, TR-000123 o cliente…"` para reflejar que ahora se puede buscar por OS.

## Resultado
En el Planificador, las tarjetas/filas de servicios mostrarán `OS-1234` cuando el trabajo asociado tenga número de OS cargado, y seguirán mostrando `TR-000123` cuando no. La búsqueda también encontrará trabajos por número de OS.
