BEGIN;
CREATE OR REPLACE FUNCTION public.ventas_servicios_marca_desde_os(p_marca text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH marca AS (
    SELECT nullif(btrim(regexp_replace(upper(btrim(p_marca)),
      '^[A-Z0-9]{2,4}[[:space:]]*-[[:space:]]*','')), '') AS valor
  )
  SELECT CASE WHEN valor IN ('OTROS','SIN MARCA','SIN IDENTIFICAR','NO INFORMADO','-------') THEN NULL ELSE valor END
  FROM marca;
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_marca_desde_os(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ventas_servicios_marca_desde_os(text) TO authenticated;

DO $patch$
DECLARE
  definition text := pg_get_functiondef('public.ventas_servicios_movimientos_enriquecidos(date,date,text)'::regprocedure);
  old_expression text := 'm.marca_parque,m.tipo_maquina';
  new_expression text := $new$coalesce(nullif(btrim(m.marca_parque),''),
        CASE WHEN m.fuente_propietario IS DISTINCT FROM 'ambiguo'
          THEN public.ventas_servicios_marca_desde_os(os.marca) END),m.tipo_maquina$new$;
BEGIN
  IF strpos(definition,'ventas_servicios_marca_desde_os(os.marca)')>0 THEN RETURN; END IF;
  IF strpos(definition,old_expression)=0 THEN
    RAISE EXCEPTION 'La definición instalada de Ventas de Servicios requiere revisión antes de recuperar marcas';
  END IF;
  EXECUTE replace(definition,old_expression,new_expression);
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
