-- 1. Control global: siempre devuelve una fila.
SELECT
  count(*) FILTER (WHERE marca='CLAAS') AS unidades_claas,
  count(*) FILTER (WHERE marca='CLAAS' AND llave_interna IS NULL) AS claas_sin_llave,
  count(*) FILTER (WHERE valor_oc_manual) AS valores_oc_individuales,
  count(*) FILTER (WHERE eta_manual) AS embarques_individuales,
  count(*) FILTER (WHERE valor_factura_proveedor IS NOT NULL) AS unidades_con_valor_proveedor
FROM public.maquinaria_importacion_unidades_operativas;

-- 2. Ejemplo del pedido CLAAS. Una fila por unidad.
SELECT oc,numero_unidad,cantidad_lote,llave_interna,chasis,
  eta_general,eta,eta_manual,valor_oc_general,alcance_valor_oc,
  precio_oc AS valor_oc_unidad,moneda_oc,valor_oc_manual,
  invoice_supplier,valor_factura_proveedor,factura_proveedor_moneda,
  CASE WHEN moneda_oc=factura_proveedor_moneda
    THEN valor_factura_proveedor-precio_oc END AS diferencia_proveedor_menos_oc,
  costo_stock_habilitado,costo_final,costo_stock_moneda
FROM public.maquinaria_importacion_unidades_operativas
WHERE oc='18-111'
ORDER BY numero_unidad;

-- 3. Llaves duplicadas CLAAS: debe devolver 0.
SELECT count(*) AS grupos_de_llaves_duplicadas
FROM (
  SELECT lower(btrim(llave_interna))
  FROM public.maquinaria_importacion_unidades_operativas
  WHERE marca='CLAAS' AND llave_interna IS NOT NULL
  GROUP BY lower(btrim(llave_interna)) HAVING count(*)>1
) d;

-- 4. Totales de OC modificados individualmente, sin sumar monedas distintas.
SELECT DISTINCT importacion_linea_id,oc,valor_oc_general,moneda_oc_general,
  valor_oc_asignado_total,oc_monedas_diferentes
FROM public.maquinaria_importacion_unidades_operativas
WHERE alcance_valor_oc='TOTAL'
ORDER BY oc;
