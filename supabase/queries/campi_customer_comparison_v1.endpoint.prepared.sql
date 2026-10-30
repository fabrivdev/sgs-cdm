-- PREPARADO LOCALMENTE. NO APLICAR SIN AUTORIZACION DE DESPLIEGUE.
-- SECURITY INVOKER: conserva RLS y permisos de tablas; no concede acceso.
CREATE OR REPLACE FUNCTION public.campi_customer_comparison_v1(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $body$
DECLARE payload jsonb;
BEGIN
 IF auth.uid() IS NULL
 OR public.has_module_access(auth.uid(),'parque') IS NOT TRUE
 OR public.has_module_access(auth.uid(),'repuestos') IS NOT TRUE
 OR public.has_module_access(auth.uid(),'servicios') IS NOT TRUE
 OR public.has_section_access(auth.uid(),'parque.clientes') IS NOT TRUE
 OR public.has_section_access(auth.uid(),'repuestos.ventas') IS NOT TRUE
 OR public.has_section_access(auth.uid(),'servicios.ordenes') IS NOT TRUE
 OR public.has_section_access(auth.uid(),'servicios.ventas') IS NOT TRUE
 THEN RAISE EXCEPTION 'Sin acceso al cruce de clientes' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>p_to OR extract(year FROM p_from)<>extract(year FROM p_to)
 THEN RAISE EXCEPTION 'Ventana invalida' USING ERRCODE='22023'; END IF;
WITH
periodos(anio,desde,hasta) AS (VALUES
 (extract(year FROM ($1::date-interval '1 year'))::integer, (($1::date-interval '1 year')::date::text||' 00:00+00')::timestamptz, ((($2::date-interval '1 year')::date+1)::text||' 00:00+00')::timestamptz),
 (extract(year FROM $1::date)::integer, ($1::date::text||' 00:00+00')::timestamptz, (($2::date+1)::text||' 00:00+00')::timestamptz)),
parque AS MATERIALIZED (
 SELECT cliente_id,count(*) AS maquinas FROM public.parque_maquinas
 WHERE activo AND cliente_id IS NOT NULL GROUP BY cliente_id
),
claves AS MATERIALIZED (
 SELECT id,'COD'::text AS tipo,nullif(btrim(cod_entidad),'') AS clave FROM public.clientes
 UNION ALL SELECT id,'RUC',nullif(btrim(ruc),'') FROM public.clientes
),
-- Alias son posibilidades, NO fusiones de UUID. La coincidencia exacta nunca
-- se usa para escoger un registro entre varios que comparten RUC/codigo.
alias_parque AS MATERIALIZED (
 SELECT p.cliente_id AS objetivo,p.cliente_id AS candidato FROM parque p
 UNION SELECT p.cliente_id,c.id FROM parque p JOIN claves k ON k.id=p.cliente_id
 JOIN claves c ON c.tipo=k.tipo AND c.clave=k.clave WHERE k.clave IS NOT NULL
),
os_base AS MATERIALIZED (
 SELECT o.os_numero,o.factura,o.fecha_emision_factura,
 nullif(btrim(o.raw_data->>'Cod. Entidad'),'') AS cod,
 nullif(btrim(o.raw_data->>'Propietario'),'') AS ruc,
 t.cliente_id AS cliente_trabajo
 FROM public.ordenes_servicio_importadas o
 LEFT JOIN public.trabajos t ON t.id=o.trabajo_id
),
claves_presentes AS MATERIALIZED (
 SELECT DISTINCT tipo,clave FROM claves WHERE clave IS NOT NULL
),
claves_cualquiera AS MATERIALIZED (
 SELECT DISTINCT clave FROM claves_presentes
),
os_ids AS MATERIALIZED (
 SELECT o.os_numero,k.id FROM os_base o JOIN claves k ON k.tipo='COD' AND k.clave=o.cod
 UNION SELECT o.os_numero,k.id FROM os_base o JOIN claves k ON k.tipo='RUC' AND k.clave=o.ruc
 UNION SELECT os_numero,cliente_trabajo FROM os_base WHERE cliente_trabajo IS NOT NULL
),
os_identidades AS MATERIALIZED (
 SELECT os_numero,array_agg(id ORDER BY id) AS ids FROM os_ids GROUP BY os_numero
),
os_info AS MATERIALIZED (
 SELECT o.os_numero,coalesce(i.ids,ARRAY[]::uuid[]) AS ids,
 ((o.cod IS NOT NULL AND c.clave IS NULL) OR (o.ruc IS NOT NULL AND r.clave IS NULL)
 OR i.os_numero IS NULL) AS incompleta
 FROM os_base o LEFT JOIN os_identidades i USING(os_numero)
 LEFT JOIN claves_presentes c ON c.tipo='COD' AND c.clave=o.cod
 LEFT JOIN claves_presentes r ON r.tipo='RUC' AND r.clave=o.ruc
),
os_documentos AS MATERIALIZED (
 SELECT DISTINCT o.os_numero,extract(year FROM o.fecha_emision_factura AT TIME ZONE 'UTC')::integer AS anio,
 upper(regexp_replace(btrim(d.doc),'[^[:alnum:]]','','g')) AS doc
 FROM os_base o CROSS JOIN LATERAL regexp_split_to_table(coalesce(o.factura,''),';') d(doc)
 WHERE nullif(btrim(d.doc),'') IS NOT NULL
),
resumen AS MATERIALIZED (
 SELECT f.id,f.fecha,f.sucursal::text AS sucursal,f.cliente_id,
 nullif(btrim(f.cod_entidad),'') AS cod,
 upper(regexp_replace(coalesce(f.cod_factura,''),'[^[:alnum:]]','','g')) AS doc
 FROM public.facturacion f
 WHERE EXISTS(SELECT 1 FROM periodos p WHERE f.fecha>=(p.desde AT TIME ZONE 'UTC')::date
 AND f.fecha<(p.hasta AT TIME ZONE 'UTC')::date)
 -- Tambien conservar registros excluidos como evidencia de identidad posible.
),
resumen_ids AS MATERIALIZED (
 SELECT r.id,r.cliente_id AS cliente FROM resumen r WHERE r.cliente_id IS NOT NULL
 UNION SELECT r.id,k.id FROM resumen r JOIN claves k ON k.tipo='COD' AND k.clave=r.cod
),
seleccion AS MATERIALIZED (
 SELECT p.anio,f.id,f.cliente_id,f.fecha_factura,f.sucursal::text AS sucursal,
 f.factura,f.codigo_interno_factura,f.origen_sistema,f.raw_data,
 f.cod_mercaderia,f.grupo_normalizado,f.subgrupo_original,f.moneda,f.cantidad,f.total_venta,
 f.importacion_id,
 upper(regexp_replace(coalesce(f.factura,''),'[^[:alnum:]]','','g')) AS doc,
 upper(regexp_replace(coalesce(f.codigo_interno_factura,''),'[^[:alnum:]]','','g')) AS doc_interno,
 CASE WHEN upper(btrim(coalesce(f.sucursal::text,''))) IN
 ('04','04 - SAN JUAN BAUTISTA','SAN JUAN BAUTISTA','MISIONES') THEN 'MISIONES'
 ELSE upper(btrim(f.sucursal::text)) END AS sucursal_canonica
 FROM public.facturacion_lineas_importadas f JOIN periodos p
 ON f.fecha_factura>=p.desde AND f.fecha_factura<p.hasta
 WHERE ((f.origen_sistema='legacy_historico_detallado' AND f.fecha_factura<timestamptz '2026-07-01 00:00+00')
 OR (f.origen_sistema IN('new_xml_facturacion_directa','new_xml_facturacion_os')
 AND f.fecha_factura>=timestamptz '2026-07-01 00:00+00'))
 AND (upper(coalesce(f.grupo_normalizado,'')) LIKE '%REPUEST%'
 OR upper(coalesce(f.subgrupo_original,'')) LIKE '%REPUEST%'
 OR nullif(btrim(f.grupo_normalizado),'') IS NULL)
),
-- Solo se excluye un UUID auditado si su contraparte existe. Nunca se deduplica
-- por producto/importe. Una contraparte ausente se conserva como riesgo.
pares_info AS MATERIALIZED (
 SELECT r.linea_descartada_id,
 bool_or(c.id IS NOT NULL AND r.linea_canonica_id<>r.linea_descartada_id) AS resuelto
 FROM public.facturacion_dedupe_repair_pairs r
 LEFT JOIN public.facturacion_lineas_importadas c ON c.id=r.linea_canonica_id
 GROUP BY r.linea_descartada_id
),
lineas AS MATERIALIZED (
 SELECT s.*,r.linea_descartada_id IS NOT NULL AS par_no_resuelto
 FROM seleccion s LEFT JOIN pares_info r ON r.linea_descartada_id=s.id
 WHERE NOT coalesce(r.resuelto,false)
),
linea_documentos AS MATERIALIZED (
 SELECT id,anio,(fecha_factura AT TIME ZONE 'UTC')::date AS fecha,sucursal,doc
 FROM lineas WHERE doc<>''
 UNION SELECT id,anio,(fecha_factura AT TIME ZONE 'UTC')::date,sucursal,doc_interno
 FROM lineas WHERE doc_interno<>''
),
directos AS MATERIALIZED (
 SELECT l.id,l.cliente_id AS cliente FROM lineas l WHERE l.cliente_id IS NOT NULL
 UNION SELECT l.id,k.id FROM lineas l JOIN claves k
 ON k.clave=nullif(btrim(l.raw_data->>'CLIENTE'),'') AND k.tipo IN('COD','RUC')
 UNION SELECT l.id,i.cliente FROM linea_documentos l JOIN resumen r
 ON r.fecha=l.fecha AND r.doc=l.doc
 AND (r.sucursal=l.sucursal OR r.sucursal IS NULL OR l.sucursal IS NULL)
 JOIN resumen_ids i ON i.id=r.id
),
-- Preserva la semantica JSONB ?: strings de arrays, claves de objetos y
-- string escalar. El control de valores desconocidos conserva tambien null/numeros
-- de arrays, tal como V1, sin cruzar cada linea con todas las OS.
os_array_valores AS MATERIALIZED (
 SELECT l.id,v.n FROM lineas l CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(l.raw_data->'linked_service_order_known_values')='array'
 THEN l.raw_data->'linked_service_order_known_values' ELSE '[]'::jsonb END) v(n)
),
os_valores_existencia AS MATERIALIZED (
 SELECT id,n #>> '{}' AS os_numero FROM os_array_valores WHERE jsonb_typeof(n)='string'
 UNION SELECT l.id,k.n FROM lineas l CROSS JOIN LATERAL jsonb_object_keys(
 CASE WHEN jsonb_typeof(l.raw_data->'linked_service_order_known_values')='object'
 THEN l.raw_data->'linked_service_order_known_values' ELSE '{}'::jsonb END) k(n)
 UNION SELECT l.id,(l.raw_data->'linked_service_order_known_values') #>> '{}'
 FROM lineas l WHERE jsonb_typeof(l.raw_data->'linked_service_order_known_values')='string'
),
vinculos_os AS MATERIALIZED (
 SELECT l.id,o.os_numero,true AS explicito FROM lineas l JOIN os_info o
 ON o.os_numero=nullif(btrim(l.raw_data->>'linked_service_order'),'')
 UNION SELECT v.id,o.os_numero,true FROM os_valores_existencia v JOIN os_info o USING(os_numero)
 UNION SELECT l.id,o.os_numero,false FROM linea_documentos l JOIN os_documentos o
 ON o.doc=l.doc AND (o.anio=l.anio OR o.anio IS NULL)
),
vinculos_info AS MATERIALIZED (
 SELECT v.id,count(DISTINCT v.os_numero) FILTER(WHERE v.explicito) AS explicitos,
 bool_or(o.incompleta) AS incompleta
 FROM vinculos_os v JOIN os_info o USING(os_numero) GROUP BY v.id
),
os_array_faltantes AS MATERIALIZED (
 SELECT v.id,bool_or(o.os_numero IS NULL) AS falta
 FROM os_array_valores v LEFT JOIN os_info o ON o.os_numero=(v.n #>> '{}') GROUP BY v.id
),
enlaces AS MATERIALIZED (
 SELECT l.id,
 (l.raw_data->>'linked_service_order_evidence'='complete'
 AND nullif(btrim(l.raw_data->>'linked_service_order'),'') IS NOT NULL
 AND coalesce(v.explicitos,0)=1 AND o.os_numero IS NOT NULL AND NOT o.incompleta) IS TRUE AS os_acreditada,
 (coalesce(v.incompleta,false)
 OR (nullif(btrim(l.raw_data->>'linked_service_order'),'') IS NOT NULL AND o.os_numero IS NULL)
 OR coalesce(f.falta,false)) AS os_sin_resolver
 FROM lineas l LEFT JOIN vinculos_info v USING(id)
 LEFT JOIN os_info o ON o.os_numero=l.raw_data->>'linked_service_order'
 LEFT JOIN os_array_faltantes f ON f.id=l.id
),
candidatos AS MATERIALIZED (
 SELECT d.id,d.cliente FROM directos d JOIN enlaces e USING(id) WHERE NOT e.os_acreditada
 UNION SELECT v.id,i.id FROM vinculos_os v JOIN enlaces e ON e.id=v.id
 JOIN os_ids i ON i.os_numero=v.os_numero
 WHERE NOT e.os_acreditada OR v.explicito
),
candidatos_info AS MATERIALIZED (
 SELECT id,array_agg(cliente ORDER BY cliente) AS ids FROM candidatos GROUP BY id
),
evaluadas AS MATERIALIZED (
 SELECT l.*,e.os_acreditada,
 array_remove(ARRAY[
 CASE WHEN e.os_sin_resolver THEN 'VINCULO_OS_SIN_RESOLVER' END,
 CASE WHEN ci.ids IS NULL THEN 'SIN_CANDIDATOS' END,
 CASE WHEN NOT e.os_acreditada AND nullif(btrim(l.raw_data->>'CLIENTE'),'') IS NOT NULL
 AND cc.clave IS NULL THEN 'CLAVE_CLIENTE_SIN_CORRESPONDENCIA' END
 ],NULL) AS motivos_no_acotada,
 coalesce(ci.ids,ARRAY[]::uuid[]) AS ids,
 (e.os_sin_resolver OR ci.ids IS NULL
 OR (NOT e.os_acreditada AND nullif(btrim(l.raw_data->>'CLIENTE'),'') IS NOT NULL
 AND cc.clave IS NULL)) AS identidad_no_acotada,
 CASE WHEN l.origen_sistema='legacy_historico_detallado'
 THEN CASE WHEN upper(coalesce(l.raw_data->>'movimiento','S'))='E' AND l.total_venta<0 THEN 'NC'
 WHEN upper(coalesce(l.raw_data->>'movimiento','S'))='S' AND l.total_venta>=0 THEN 'VENTA' ELSE 'INDETERMINADO' END
 ELSE CASE WHEN l.raw_data->>'canonical_document_kind'='NotaCredito' AND l.total_venta<=0 THEN 'NC'
 WHEN l.raw_data->>'canonical_document_kind'='Factura' AND l.total_venta>=0 THEN 'VENTA' ELSE 'INDETERMINADO' END END AS movimiento,
 CASE WHEN l.origen_sistema='legacy_historico_detallado'
 THEN 'LEGACY|'||nullif(btrim(l.raw_data->>'linea_clave'),'')
 ELSE 'TOTVS|'||nullif(l.sucursal_canonica,'')||'|'||upper(nullif(btrim(l.raw_data->>'canonical_document_kind'),''))
 ||'|'||upper(nullif(btrim(coalesce(l.codigo_interno_factura,l.factura)),''))
 ||'|'||upper(nullif(btrim(l.raw_data->>'ITEM'),'')) END AS identidad_linea
 FROM lineas l JOIN enlaces e USING(id) LEFT JOIN candidatos_info ci USING(id)
 LEFT JOIN claves_cualquiera cc ON cc.clave=btrim(l.raw_data->>'CLIENTE')
),
firmas AS MATERIALIZED (
 SELECT e.*,coalesce(e.identidad_linea,'SIN_IDENTIDAD|'||e.id::text) AS clave,
 jsonb_build_object('fecha',fecha_factura,'moneda',moneda,'cantidad',cantidad,'total',total_venta,
 'factura',factura,'interno',codigo_interno_factura,'sucursal',sucursal_canonica,
 'producto',cod_mercaderia,'grupo',grupo_normalizado,'subgrupo',subgrupo_original,
 'candidatos',ids,'no_acotada',identidad_no_acotada,'movimiento',movimiento,
 'os_acreditada',os_acreditada,'os',raw_data->'linked_service_order',
 'par_no_resuelto',par_no_resuelto) AS firma
 FROM evaluadas e
),
grupos AS MATERIALIZED (
 SELECT clave,count(*) AS copias,count(DISTINCT firma) AS firmas,
 array_agg(DISTINCT anio) AS anios,
 bool_or(identidad_no_acotada) AS no_acotada,
 bool_or(movimiento IS DISTINCT FROM 'NC') AS puede_ser_venta,
 bool_or(identidad_linea IS NULL OR par_no_resuelto
 OR NOT (lower(btrim(coalesce(grupo_normalizado,''))) IN('repuestos','repuesto')
 OR upper(coalesce(subgrupo_original,'')) LIKE '%REPUEST%')
 OR upper(coalesce(subgrupo_original,'')) LIKE '%MERCHANDISE%') AS invalida,
 -- Este acceso no elige una asignacion: se usa SOLO cuando todas las firmas
 -- son identicas. Las firmas conflictivas nunca aportan importes confirmados.
 (array_agg(firma))[1] AS firma FROM firmas GROUP BY clave
),
grupo_candidatos AS MATERIALIZED (
 SELECT DISTINCT f.clave,c.id FROM firmas f CROSS JOIN LATERAL unnest(f.ids) c(id)
),
grupo_identidad AS MATERIALIZED (
 SELECT clave,array_agg(id ORDER BY id) AS ids FROM grupo_candidatos GROUP BY clave
),
impactos AS MATERIALIZED (
 SELECT DISTINCT g.clave,p.objetivo FROM grupo_candidatos g
 JOIN alias_parque p ON p.candidato=g.id
),
medidas AS MATERIALIZED (
 SELECT p.cliente_id,y.anio,
 count(*) FILTER(WHERE g.firmas=1 AND NOT g.no_acotada AND NOT g.invalida
 AND cardinality(gi.ids)=1 AND gi.ids[1]=p.cliente_id
 AND g.firma->>'movimiento'='VENTA') AS ventas_confirmadas,
 coalesce(sum((g.firma->>'total')::numeric) FILTER(WHERE g.firmas=1 AND NOT g.no_acotada AND NOT g.invalida
 AND cardinality(gi.ids)=1 AND gi.ids[1]=p.cliente_id
 AND g.firma->>'movimiento'='VENTA' AND g.firma->>'moneda'='USD'),0) AS ventas_usd_confirmadas,
 coalesce(sum(-(g.firma->>'total')::numeric) FILTER(WHERE g.firmas=1 AND NOT g.no_acotada AND NOT g.invalida
 AND cardinality(gi.ids)=1 AND gi.ids[1]=p.cliente_id
 AND g.firma->>'movimiento'='NC' AND g.firma->>'moneda'='USD'),0) AS nc_usd_confirmadas,
 count(*) FILTER(WHERE g.firmas<>1 OR g.no_acotada OR g.invalida
 OR cardinality(gi.ids)<>1 OR gi.ids[1]<>p.cliente_id
 OR g.firma->>'movimiento'='INDETERMINADO') AS grupos_ambiguos,
 count(*) FILTER(WHERE g.firmas<>1 OR g.no_acotada OR g.invalida
 OR g.firma->>'movimiento'<>'NC') AS ventas_posibles_incluye_confirmadas,
 count(*) FILTER(WHERE g.firma->>'moneda' IS DISTINCT FROM 'USD') AS grupos_no_usd
 FROM parque p CROSS JOIN periodos y
 LEFT JOIN impactos i ON i.objetivo=p.cliente_id
 LEFT JOIN grupos g ON g.clave=i.clave AND y.anio=ANY(g.anios)
 LEFT JOIN grupo_identidad gi ON gi.clave=g.clave
 WHERE g.clave IS NOT NULL
 GROUP BY p.cliente_id,y.anio
),
no_acotados AS (
 SELECT p.anio,count(*) FILTER(WHERE g.no_acotada OR g.firmas>1) AS grupos,
 count(*) FILTER(WHERE g.no_acotada) AS identidad_no_acotada,
 count(*) FILTER(WHERE g.no_acotada AND g.puede_ser_venta) AS identidad_no_acotada_posible_venta,
 count(*) FILTER(WHERE g.no_acotada AND NOT g.puede_ser_venta) AS identidad_no_acotada_solo_nc
 FROM periodos p LEFT JOIN grupos g ON p.anio=ANY(g.anios) GROUP BY p.anio
),
detalle AS MATERIALIZED (
 SELECT p.cliente_id,p.maquinas,
 coalesce(a.ventas_confirmadas,0) AS ventas_previous,
 coalesce(b.ventas_confirmadas,0) AS ventas_current,
 coalesce(a.ventas_usd_confirmadas,0) AS usd_ventas_previous,
 coalesce(a.nc_usd_confirmadas,0) AS usd_nc_previous,
 coalesce(b.ventas_usd_confirmadas,0) AS usd_ventas_current,
 coalesce(b.nc_usd_confirmadas,0) AS usd_nc_current,
 coalesce(a.grupos_ambiguos,0) AS ambiguos_previous,
 coalesce(b.grupos_ambiguos,0) AS ambiguos_current,
 coalesce(b.ventas_posibles_incluye_confirmadas,0) AS posibles_ventas_current,
 coalesce(a.grupos_no_usd,0)+coalesce(b.grupos_no_usd,0) AS grupos_no_usd,
 CASE WHEN coalesce(b.ventas_confirmadas,0)>0 THEN 'CON_VENTA_ACTUAL_CONFIRMADA'
 WHEN coalesce(b.ventas_posibles_incluye_confirmadas,0)>0 THEN 'CON_VENTA_ACTUAL_POSIBLE'
 WHEN (SELECT identidad_no_acotada_posible_venta FROM no_acotados WHERE anio=extract(year FROM $1::date)::integer)>0 THEN 'NO_DETERMINADO_POR_IDENTIDAD_NO_ACOTADA'
 WHEN coalesce(a.ventas_confirmadas,0)>0 THEN 'SIN_VENTA_RESUELTA_EN_DATOS_CARGADOS'
 ELSE 'SIN_ANTECEDENTE_CONFIRMADO' END AS estado
 FROM parque p LEFT JOIN medidas a ON a.cliente_id=p.cliente_id AND a.anio=extract(year FROM ($1::date-interval '1 year'))::integer
 LEFT JOIN medidas b ON b.cliente_id=p.cliente_id AND b.anio=extract(year FROM $1::date)::integer
),
cohorte_observada AS (
 SELECT * FROM detalle WHERE estado='SIN_VENTA_RESUELTA_EN_DATOS_CARGADOS'
)
SELECT jsonb_build_object(
 'contract_version',1,
 'attribution_rule','OS_CUSTOMER_V3',
 'deduplication_rule','DOCUMENT_LINE_V3',
 'alcance','DATOS_CARGADOS_NO_CERTIFICA_AUSENCIA_EN_ORIGEN',
 'ventanas',(SELECT jsonb_agg(to_jsonb(p)) FROM periodos p),
 'clientes_parque',(SELECT count(*) FROM parque),
 'estados',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT estado,count(*) AS clientes FROM detalle GROUP BY estado) s),'[]'::jsonb),
 'cohorte_observada',jsonb_build_object('clientes',(SELECT count(*) FROM cohorte_observada),
 'ventas_anteriores_usd_confirmadas',(SELECT coalesce(sum(usd_ventas_previous),0) FROM cohorte_observada),
 'nc_anteriores_usd_confirmadas',(SELECT coalesce(sum(usd_nc_previous),0) FROM cohorte_observada),
 'neto_anterior_usd_confirmado',(SELECT coalesce(sum(usd_ventas_previous-usd_nc_previous),0) FROM cohorte_observada),
 'clientes_con_importe_anterior_incompleto',(SELECT count(*) FROM cohorte_observada WHERE ambiguos_previous>0 OR grupos_no_usd>0),
 'importe_anterior_exacto_en_datos_cargados',
 NOT EXISTS(SELECT 1 FROM cohorte_observada WHERE ambiguos_previous>0 OR grupos_no_usd>0)
 AND (SELECT identidad_no_acotada=0 FROM no_acotados WHERE anio=extract(year FROM ($1::date-interval '1 year'))::integer),
 'advertencia','Importes confirmados de este mismo grupo; no son Y exacto si existen ambiguedades previas, moneda distinta o identidad no acotada'),
 'no_determinados',(SELECT jsonb_agg(to_jsonb(n)) FROM no_acotados n),
 'detalle_no_acotados',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'clave_grupo',f.clave,'id_linea',f.id,'anio',f.anio,'fecha',f.fecha_factura,
 'documento',f.factura,'documento_interno',f.codigo_interno_factura,
 'origen',f.origen_sistema,'sucursal',f.sucursal_canonica,
 'movimiento',f.movimiento,'importe',f.total_venta,'moneda',f.moneda,
 'cliente_id_linea',f.cliente_id,'clave_cliente',f.raw_data->'CLIENTE',
 'os_principal',f.raw_data->'linked_service_order',
 'os_valores_declarados',f.raw_data->'linked_service_order_known_values',
 'os_evidencia',f.raw_data->'linked_service_order_evidence',
 'os_acreditada',f.os_acreditada,'candidatos',f.ids,
 'motivos',f.motivos_no_acotada,'linea_no_acotada',f.identidad_no_acotada,
 'grupo_puede_ser_venta',g.puede_ser_venta,'firmas_grupo',g.firmas
 ) ORDER BY f.anio,f.clave,f.id) FROM firmas f JOIN grupos g USING(clave)
 WHERE g.no_acotada),'[]'::jsonb),
 'conservacion',jsonb_build_object('filas_seleccionadas',(SELECT count(*) FROM seleccion),
 'descartes_auditados_con_contraparte',(SELECT count(*) FROM seleccion)-(SELECT count(*) FROM lineas),
 'filas_restantes',(SELECT count(*) FROM lineas),'grupos_documentales',(SELECT count(*) FROM grupos),
 'copias_reconciliadas',(SELECT coalesce(sum(copias),0) FROM grupos),
 'grupos_con_firmas_conflictivas',(SELECT count(*) FROM grupos WHERE firmas>1),
 'grupos_no_acotados_sin_impacto_parque',(SELECT count(*) FROM grupos g WHERE g.no_acotada AND NOT EXISTS(SELECT 1 FROM impactos i WHERE i.clave=g.clave)),
 'filas_detalle_no_acotados',(SELECT count(*) FROM firmas f JOIN grupos g USING(clave) WHERE g.no_acotada),
 'grupos_con_impacto_parque',(SELECT count(DISTINCT clave) FROM impactos),
 'grupos_fuera_parque_con_identidad_acotada',(SELECT count(*) FROM grupos g WHERE NOT g.no_acotada AND NOT EXISTS(SELECT 1 FROM impactos i WHERE i.clave=g.clave))),
 'cobertura_historica',jsonb_build_object('estado','NO_ACREDITADA',
 'motivo','No se dispone de evidencia verificada de cobertura temporal historica; no se consultan tablas adicionales'),
 'cobertura_totvs_declarada',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'snapshot_scope',i.metadata->'snapshot_scope',
 'declaracion',i.metadata->'billingDeclaredCoverageV1')) FROM public.importaciones i
 WHERE i.metadata ? 'snapshot_scope' OR i.metadata ? 'billingDeclaredCoverageV1'),
 'detalle_clientes',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY cliente_id) FROM detalle d),'[]'::jsonb),
 'controles_pendientes',jsonb_build_array(
 'Acreditar cobertura temporal historica y visibilidad de la sesion; COMPLETADO no demuestra por si solo el tramo solicitado',
 'No usar cohorte_observada como aviso real sin cobertura completa de ambas ventanas',
 'Las coincidencias de factura con OS sin enlace de linea son posibilidades, no una asignacion',
 'Una identidad no acotada con posible venta impide certificar ausencia; NC solas no activan el bloqueo global. NC no atribuidas mantienen incertidumbre del neto',
 'El detalle conserva UUID distintos aunque compartan RUC; no define una fusion de entidades',
 'No se suman importes de facturacion resumen ni valores agregados de OS a las lineas',
 'Moneda USD se suma separadamente; ninguna compra en otra moneda se ignora para decidir actividad'
 )) INTO payload;

 RETURN payload;
END;
$body$;
REVOKE ALL ON FUNCTION public.campi_customer_comparison_v1(date,date) FROM PUBLIC;
-- Sin GRANT ni activacion del cliente. Despliegue y acceso requieren aprobacion aparte.
