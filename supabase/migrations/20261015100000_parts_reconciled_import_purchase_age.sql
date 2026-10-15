-- No source rows are inserted or updated. Apply after 20261015090000.
BEGIN;
CREATE OR REPLACE VIEW public.v_repuestos_compras_importadas_conciliacion
WITH (security_invoker=true) AS
WITH k AS (
 SELECT split_part(btrim(filial),' ',1) sucursal,btrim(producto_codigo) producto_codigo,
  btrim(documento) documento,upper(btrim(serie)) serie,btrim(contraparte_codigo) proveedor,
  count(*) filas_kardex,sum(cantidad) cantidad_kardex,
  min(fecha_movimiento) fecha_kardex,
  count(DISTINCT fecha_movimiento)=1 AND bool_and(fecha_movimiento<=current_date)
   AND count(DISTINCT nullif(btrim(contraparte_tienda),''))=1
   AND bool_and(nullif(btrim(contraparte_tienda),'') IS NOT NULL) valido_kardex,
  jsonb_agg(jsonb_build_object('archivo',archivo_origen,'fila',fila_origen,'tabla',tabla_origen,'recno',recno_origen)
    ORDER BY recno_origen) referencias_kardex
 FROM public.totvs_kardex_movimientos
 WHERE upper(btrim(tabla_origen))='SD1' AND upper(btrim(especie_documento))='NF'
  AND upper(btrim(serie))='IMP' AND direccion='E' AND cantidad>0 AND producto_codigo LIKE 'REP%'
 GROUP BY 1,2,3,4,5
), d AS (
 SELECT split_part(btrim(sucursal),' ',1) sucursal,btrim(producto_codigo) producto_codigo,
  btrim(numero_documento) documento,upper(btrim(serie)) serie,btrim(proveedor_codigo) proveedor,
  count(*) filas_despacho,sum(cantidad) cantidad_despacho,min(fecha_documento) fecha_documento,
  count(DISTINCT fecha_documento)=1
   AND bool_and(fecha_documento IS NOT NULL AND fecha_documento<=current_date
    AND cantidad>0 AND coalesce(upper(btrim(generada))='SI',false)) valido_despacho,
  jsonb_agg(jsonb_build_object('archivo',archivo_origen,'fila',fila_origen,'proceso',proceso,'item',item_documento)
    ORDER BY proceso,item_documento) referencias_despacho
 FROM public.totvs_importaciones_despacho
 WHERE upper(btrim(serie))='IMP' AND producto_codigo LIKE 'REP%'
 GROUP BY 1,2,3,4,5
)
SELECT sucursal,producto_codigo,documento,serie,proveedor,
 k.filas_kardex,d.filas_despacho,k.cantidad_kardex,d.cantidad_despacho,
 k.fecha_kardex,d.fecha_documento,k.referencias_kardex,d.referencias_despacho,
 CASE WHEN k.filas_kardex IS NULL THEN 'SIN_KARDEX'
  WHEN d.filas_despacho IS NULL THEN 'SIN_DESPACHO'
  WHEN nullif(sucursal,'') IS NULL OR nullif(proveedor,'') IS NULL OR nullif(documento,'') IS NULL
    OR NOT k.valido_kardex OR NOT d.valido_despacho THEN 'DATOS_INVALIDOS'
  WHEN abs(k.cantidad_kardex-d.cantidad_despacho)>0.000001 THEN 'DIFERENCIA_CANTIDAD'
  WHEN k.fecha_kardex<>d.fecha_documento THEN 'DIFERENCIA_FECHA'
  ELSE 'CONCILIADA' END estado
FROM k FULL JOIN d USING (sucursal,producto_codigo,documento,serie,proveedor);
REVOKE ALL ON public.v_repuestos_compras_importadas_conciliacion FROM PUBLIC,anon;
GRANT SELECT ON public.v_repuestos_compras_importadas_conciliacion TO authenticated;
COMMENT ON VIEW public.v_repuestos_compras_importadas_conciliacion IS
 'Conciliación por sucursal/proveedor/serie/documento/producto, agregada antes de unir; fechas y cantidades deben coincidir. Sin despacho permanece pendiente; no se infiere fecha desde SB9 ni desde finalización.';

CREATE OR REPLACE VIEW public.v_repuestos_ultima_compra WITH (security_invoker=true) AS
WITH candidatos AS (
 SELECT m.producto_codigo,h.ultima_compra,'Histórico GRID'::text fuente_compra
 FROM public.repuestos_compras_historicas h
 JOIN public.repuestos_maestro_legacy m USING (codigo_legacy_norm)
 JOIN public.repuestos_maestro_legacy_cargas c ON c.id=m.carga_id
 WHERE c.activo AND c.estado='COMPLETADO'
  AND m.estado_vinculo IN ('CONFIRMADA','CONFIRMADA_CANONICA')
  AND m.producto_codigo IS NOT NULL AND h.ultima_compra<=current_date
 UNION ALL
 SELECT producto_codigo,fecha_emision,'Factura de compra TOTVS'
 FROM public.totvs_facturas_compra_lineas
 WHERE upper(btrim(especie))='NF' AND cantidad>0 AND total_usd>0
  AND regexp_replace(upper(coalesce(tipo_entrada,'')), '[[:space:]]', '', 'g') LIKE '%C/STOCK%'
  AND fecha_emision<=current_date AND producto_codigo LIKE 'REP%'
 UNION ALL
 SELECT producto_codigo,fecha_documento,'Importación TOTVS conciliada'
 FROM public.v_repuestos_compras_importadas_conciliacion WHERE estado='CONCILIADA'
), elegida AS (
 SELECT *,row_number() OVER (PARTITION BY producto_codigo ORDER BY ultima_compra DESC,fuente_compra) orden
 FROM candidatos
)
SELECT producto_codigo,ultima_compra,fuente_compra FROM elegida WHERE orden=1;
GRANT SELECT ON public.v_repuestos_ultima_compra TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
