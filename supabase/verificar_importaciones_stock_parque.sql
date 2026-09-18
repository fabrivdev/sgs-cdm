-- Solo lectura. Ejecutar después de 20260918170000.
-- Consulta 1: distribución recalculada, incluidas fechas históricas faltantes.
WITH estados AS (
  SELECT *, CASE
    WHEN upper(coalesce(estado_fuente,'')) LIKE '%CANCEL%' THEN 'Cancelado'
    WHEN NOT chasis_ambiguo AND (stock_fisico_confirmado OR parque_confirmado) THEN 'Completado'
    WHEN ata IS NOT NULL THEN 'Arribado'
    WHEN upper(coalesce(estado_fuente,'')) ~ '(TRANSIT|EMBARC)' THEN 'En tránsito'
    ELSE 'Planificado' END AS llegada
  FROM public.maquinaria_importacion_unidades_operativas
)
SELECT llegada,count(*) AS unidades,
  count(*) FILTER (WHERE stock_fisico_confirmado) AS en_stock,
  count(*) FILTER (WHERE parque_confirmado) AS en_parque,
  count(*) FILTER (WHERE ata IS NULL) AS sin_fecha_historica,
  count(*) FILTER (WHERE chasis_ambiguo) AS chasis_duplicados
FROM estados GROUP BY llegada ORDER BY llegada;

-- Consulta 2: pendientes reales y etiquetas comerciales sin prueba por chasis.
SELECT llave_interna,oc,modelo,chasis,ata,estado_fuente,estado_disponibilidad,
  stock_fisico_confirmado,parque_confirmado,chasis_ambiguo,
  CASE WHEN chasis_ambiguo THEN 'Chasis duplicado: revisar'
    WHEN public.normalizar_chasis_notificacion(chasis) IS NULL THEN 'Sin chasis'
    WHEN ata IS NOT NULL THEN 'Arribo registrado: sin coincidencia vigente'
    ELSE 'Sin fecha de arribo ni coincidencia vigente' END AS motivo
FROM public.maquinaria_importacion_unidades_operativas
WHERE upper(coalesce(estado_fuente,'')) NOT LIKE '%CANCEL%'
  AND (chasis_ambiguo OR NOT (stock_fisico_confirmado OR parque_confirmado))
  AND (ata IS NOT NULL OR estado_disponibilidad IN ('EN_PARQUE','DISPONIBLE','RESERVADO')
    OR chasis_ambiguo OR upper(coalesce(estado_fuente,'')) ~ '(ARRIB|RECIB|COMPLET)')
ORDER BY llave_interna,id;
