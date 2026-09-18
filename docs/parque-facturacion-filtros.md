# Facturación filtrada de Clientes del parque

## Problema y alcance

Al filtrar por Rubro o Marca, `ParqueTab` utiliza `parque_resumen_facturacion_filtros`. La atribución de las líneas nuevas recorría de manera correlacionada el conjunto materializado de propietarios por factura para cada línea. Además, un error PostgreSQL `57014` provocaba una repetición automática de la misma consulta y las coberturas podían conservar valores de la respuesta anterior.

La corrección del 18/09/2026 no toca Dashboard ni cambia importes, clasificación, exclusiones, permisos o estados de negocio.

## Corrección SQL

Ejecutar manualmente en Supabase el archivo completo `supabase/migrations/20260918220000_optimize_filtered_park_billing.sql`. Commit/push no ejecuta SQL. Requiere las funciones y fuentes de las migraciones anteriores del proyecto.

- Dos joins por clave reemplazan el barrido correlacionado de propietarios. Conservar prioridad: propietario inequívoco por factura, después código interno, cliente de factura compatible y finalmente nombre exacto.
- Materializar la resolución por nombre exacto, conservando el cliente de creación más antigua. No unir nombres por similitud.
- La marca corresponde al propietario elegido; no tomar la marca de otro candidato cuando el propietario prioritario tiene marca nula.
- Mantener corte histórico/sistema actual, ambigüedades, negativos/NC, exclusiones y fallback legado sin duplicar facturas nuevas.
- Los indicadores de cobertura conservan su base de actividad independiente del rubro monetario elegido. Filtrar importe por Repuestos no redefine la cobertura de Servicios.
- Conservar autorización y firmas. `force_custom_plan` permite planificar según filtros; no se aumenta el timeout para esconder el problema. Los índices declarados son idempotentes y ya están previstos por migraciones anteriores.

## Corrección de carga

No repetir automáticamente un `57014`. Mantener el reintento manual y el reintento existente para otros errores. Cancelar solicitudes anteriores al cambiar filtros/desmontar, sin mostrar esa cancelación deliberada como un fallo nuevo.

Vaciar agregados anteriores al iniciar la carga. Coberturas: `…` durante carga y `—` ante error; no fabricar 0% ni mostrar el porcentaje anterior como actual. Los conteos de clientes/máquinas siguen disponibles. Exportación deshabilitada si la respuesta está cargando o incompleta/con error.

## Validación local

`scripts/test-filtered-park-billing.mjs` compara la definición anterior y la nueva en PostgreSQL aislado (PGlite), sin conexión a producción. Cubre 40 combinaciones marca/rubro, identidad y prioridad, NC, exclusiones, fallback, cobertura, autorización e idempotencia. Acepta como argumento la ubicación del módulo PGlite instalado; no requiere guardar credenciales ni agregarlo al runtime de la app.

Ejemplo con el runtime local de pruebas:

```powershell
node scripts/test-filtered-park-billing.mjs ../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js
npx vitest run src/components/parque/ParqueListTables.test.tsx src/components/ventas/salesTableInteraction.test.ts
```

En la muestra sintética de 808 líneas, la atribución pasó de aproximadamente 3,85 segundos a 70 ms. No acredita rendimiento ni montos de producción.

19 pruebas de componentes/comparadores, tipos y compilación correctos; sin diagnósticos de lint nuevos. Playwright comprobó la página real con fuentes ficticias: filtro Repuestos, un solo intento ante timeout, coberturas no disponibles, reintento manual, recuperación y descarga Excel completa con sucursales, centavos y negativo. Anchos 1366 y 390 px sin desbordamiento horizontal del documento. Los archivos de QA quedan privados en `output/playwright/park-filter`.

Pendiente: aplicar el SQL y comprobar el mismo rango/filtros en la base real. No se ejecutó SQL ni se consultó producción en esta revisión.
