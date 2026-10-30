-- SOLO LECTURA. Ejecutar en el proyecto acreditado y al mismo corte que Cobertura.
-- No modifica el KPI. Reporta categorías agregadas; no expone IDs de clientes.
WITH maquinas_por_propietario AS (
  SELECT pm.cliente_id,
    count(*) FILTER (WHERE pm.activo IS TRUE)::integer AS maquinas_true,
    count(*) FILTER (WHERE pm.activo IS NULL)::integer AS maquinas_null
  FROM public.parque_maquinas pm
  WHERE pm.cliente_id IS NOT NULL AND (pm.activo IS TRUE OR pm.activo IS NULL)
  GROUP BY pm.cliente_id
), universo AS (
  SELECT p.cliente_id, p.maquinas_true, p.maquinas_null,
    c.id IS NOT NULL AS cliente_encontrado, c.activo AS cliente_activo
  FROM maquinas_por_propietario p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
)
SELECT count(*) AS propietarios_regla_vigente,
  count(*) FILTER (WHERE cliente_activo IS FALSE) AS clientes_inactivos,
  count(*) FILTER (WHERE cliente_activo IS TRUE) AS clientes_activos,
  count(*) FILTER (WHERE cliente_activo IS NULL AND cliente_encontrado) AS clientes_activo_null,
  count(*) FILTER (WHERE NOT cliente_encontrado) AS clientes_sin_fila,
  count(*) FILTER (WHERE maquinas_true = 0 AND maquinas_null > 0) AS solo_maquinas_activo_null,
  count(*) FILTER (WHERE maquinas_true > 0) AS con_maquina_activo_true
FROM universo;

-- Si clientes_inactivos > 0, revisar esos casos y la definición de elegibilidad
-- antes de tocar gerencial_clientes_resumen_v1 o la serie. ParqueTab no filtra
-- clientes.activo, y MaquinasTab trata maquina.activo NULL como activa.
