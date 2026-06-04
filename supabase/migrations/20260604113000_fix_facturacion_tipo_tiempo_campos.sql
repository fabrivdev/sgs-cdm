CREATE OR REPLACE FUNCTION public.facturacion_tipo_tiempo_campos(
  p_entidad text,
  p_observacion text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_entidad, '')) NOT LIKE '%CAMPOS DEL MA%ANA%' THEN 'Cliente'
    WHEN coalesce(p_observacion, '') ~* '(^|[^0-9])[0-9]{6,}([^0-9]|$)'
     AND coalesce(p_observacion, '') ~* '[[:alpha:]]{3,}[[:space:]-]+[[:alpha:]]{3,}' THEN 'Garantia'
    ELSE 'Interno'
  END;
$$;
