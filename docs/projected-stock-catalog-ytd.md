# Stock proyectado: catálogo y Vendidas YTD

## Comportamiento

Las fuentes de apertura, importaciones, pedidos, ventas/NC y ajustes se resuelven contra catálogo antes de agrupar y aplicar límites de cero. El modelo usa UUID canónico. Las referencias sin correspondencia única conservan nombres y cantidades separados; no hay fusiones por parecido ni cambios de catálogo.

Vendidas YTD usa `ventas_maquinas_dashboard_filtros_v2`, la fuente de Ventas de máquinas: 1 de enero del año seleccionado hasta el corte, unidades netas, excluyendo usadas. La fuente combina histórico hasta junio de 2026 y movimientos desde julio. El frontend usa `netas`, sin inferir unidades de importes. Totales y exportación siguen los filtros. Una venta sin stock crea fila únicamente cuando corresponde a un modelo activo único del catálogo; no incorpora descripciones crudas ni modelos ajenos sin correspondencia. Por ello el universo puede diferir del total de todas las ventas.

Las conciliaciones específicas preservan origen y trazabilidad:

- Evolution 32 de apertura corresponde a MAESTRO EVOLUTION 32. La OC E26100032 ya estaba incluida en apertura: su unidad no vuelve a incrementar compras nuevas; ATA sigue sumando stock y restando OC una vez. No se elimina la compra ni se cambian fechas.
- JOKER 5 RT+, JOKER 6 RT+, KNIFER ROLLER CULTRO 9TC y NB MAICERO 20L X 45CM de apertura se vinculan a sus IDs contrastados con stock/importaciones. No se retira `+` globalmente; JOKER 7 RT y JOKER 7 RT+ son distintos.
- EVOLUTION 24.45 usa el alias existente hacia MAESTRO EVOLUTION 24, confirmado comercialmente. La excepción numérica se limita a ese alias; MAESTRO DUO 24 no se mezcla. YTD reconoce la misma equivalencia sin mutar el catálogo compartido.

Marcas usan `MarcaBadge` existente, con contraste de texto reforzado en esta página. Sin comentarios permanentes bajo filtros.

## Backend y despliegue

Las tres migraciones `20261022180000`, `20261022190000` y `20261022200000` ya fueron aplicadas y comprobadas el 22/10/2026 en el backend autorizado. Se versionan sus archivos exactos para trazabilidad; no deben ejecutarse otra vez en ese backend. La cabecera histórica «Draft replacement, not applied» de la primera refleja el momento de preparación, no su estado actual. Las guardas abortan ante otra definición o fuentes distintas. No se aplica SQL por hacer push. Las migraciones no alteran ACL, RLS, propietario ni datos de origen.

Hashes finales de `pg_get_functiondef`: helper `4671bdac494a9a8609480dff2b675995`; RPC `e9af659ed78e94d9c089b7b50365a83b`. Firma y campos anteriores compatibles. Respaldo exacto y verificaciones productivas se conservan fuera del repositorio; no se publican exports privados.

Límite explícito: el flujo de eliminación de importaciones puede borrar físicamente la última unidad sin conservar una fecha fiable de baja. Si falta o se desactiva la unidad conciliada E26100032, la RPC completa devuelve un error de conciliación; no inventa cancelación ni saldo histórico. La cancelación automática por corte queda pendiente de un evento persistente fechado. Arrocera y carro conservan sus unidades sin inventar destino de catálogo.

## Validación

Lectura real al 22/10/2026: 38 filas; YTD36, stock40, OC19, disponible59, pendientes12, proyectado47. Evolution32: YTD1/stock0/OC1/pendiente0/proyectado1. Evolution24: YTD0/stock1/OC0/pendiente0/proyectado1. EVO7 y ambas DAKAR conservan sus ventas. No se fuerza el total a coincidir con otra vista.

Pruebas: Vitest para página/YTD, aliases, marcas, filtros/exportación, año/corte y NC; PGlite para migraciones, agrupación previa a límites, variantes distintas, cantidades desconocidas, permisos, arribo único y rollback. Comandos:

```sh
npx vitest run src/pages/StockProyectado.test.tsx src/pages/StockProyectadoYtd.test.tsx src/lib/projectedMachineStock.test.ts src/lib/projectedStockYtd.test.ts src/components/StatusBadges.test.tsx
node scripts/test-projected-stock-catalog-ytd.mjs node_modules/@electric-sql/pglite/dist/index.js .
node scripts/test-opening-reconciliation.mjs .
npm run build
```

PGlite es herramienta opcional de validación SQL, no dependencia del frontend. Integración aislada desde main; no incluye Panorama, onboarding ni Cobertura. La publicación de la app sigue siendo manual del usuario. GitHub sincroniza código con Lovable, no publica la versión pública.
