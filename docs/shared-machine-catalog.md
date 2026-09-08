# Catálogo compartido de máquinas

## Alcance

- Parque, Pedidos e Importaciones consultan `parque_modelos_catalogo`.
- CLAAS y HORSCH se reconcilian con los modelos ya registrados en `parque_maquinas`.
- Pedidos conserva las demás marcas y permite agregar nuevas marcas/modelos al catálogo común. Registrar una opción del catálogo no crea una máquina física en Parque.
- Con tipo OTRO (sin clasificación definida), elegir una marca muestra todos sus modelos activos. Al elegir un tipo concreto, el listado se filtra por marca y tipo. Modelo muestra solamente el nombre, sin repetir el tipo. Elegir modelo completa el tipo en la misma actualización.
- La lectura de NP usa ese catálogo y sus equivalencias. Una similitud aproximada solo es una sugerencia: no se sustituye una variante numérica sin confirmación.
- Las equivalencias históricas se aceptan automáticamente únicamente si preservan la numeración y no son ambiguas. Por ejemplo, `LEEB 5250` no se convierte en `LEEB 5280 VL`.

## Despliegue

Aplicar `supabase/migrations/20260908120000_shared_machine_model_identity.sql` después de las migraciones anteriores del repositorio y desplegar el frontend.

La migración agrega `modelo_catalogo_id` a Parque, líneas de pedidos y líneas de importación. Vincula los históricos que se pueden resolver inequívocamente sin cambiar su texto. Las nuevas cargas resuelven nombre y tipo en la base de datos, incluso si se escriben por otro cliente.

No elimina pedidos, máquinas, facturas ni modelos. Retira del listado únicamente duplicados con equivalencias seguras ya registradas; las filas originales permanecen recuperables. No reactiva opciones retiradas previamente. El enlace de las máquinas a modelos retirados se conserva al editar otros datos.

La aplicación del SQL a producción requiere acceso de administración a ese proyecto de Supabase; el push del código por sí solo no confirma que se haya aplicado.

## Comprobación posterior (solo lectura)

```sql
SELECT marca_nombre, subgrupo, nombre, activo
FROM public.parque_modelos_catalogo
WHERE marca_nombre = 'HORSCH' AND nombre ILIKE '%LEEB%'
ORDER BY activo DESC, nombre;

SELECT coalesce(marca_nombre, marca::text) AS marca,
       count(*) AS maquinas,
       count(modelo_catalogo_id) AS con_modelo_vinculado
FROM public.parque_maquinas
GROUP BY 1 ORDER BY 1;

SELECT p.serie, p.modelo_tipo, p.subgrupo
FROM public.parque_maquinas p
WHERE coalesce(p.marca_nombre,p.marca::text) IN ('CLAAS','HORSCH')
  AND nullif(btrim(p.modelo_tipo),'') IS NOT NULL
  AND p.modelo_catalogo_id IS NULL
ORDER BY p.modelo_tipo;
```

Los pendientes pueden ser modelos retirados o identidades ambiguas: revisarlos sin unir variantes por aproximación.

Prueba manual: nuevo pedido → HORSCH → dejar tipo OTRO → elegir una LEEB disponible → verificar PULVERIZADORAS. Repetir con otra marca de Pedidos. Subir una NP con alias conocido y verificar la coincidencia; con números diferentes debe pedir revisión. Comprobar que editar datos de un pedido histórico no reactiva su modelo retirado.

## Pruebas locales

`npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`.

Pruebas SQL aisladas (no acceden a producción):

`node scripts/test-machine-catalog.mjs <ruta-a-@electric-sql/pglite/dist/index.js>`
