BEGIN;
CREATE TABLE IF NOT EXISTS public.ventas_servicios_clasificaciones_confirmadas (
  fecha date NOT NULL,
  factura text NOT NULL,
  sucursal text NOT NULL,
  codigo text NOT NULL,
  marca text NOT NULL,
  tipo_tiempo text NOT NULL CHECK (tipo_tiempo IN ('Cliente','Garantia','Interno','Agrega al costo')),
  motivo text NOT NULL,
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid DEFAULT auth.uid(),
  PRIMARY KEY (fecha,factura,sucursal,codigo)
);
ALTER TABLE public.ventas_servicios_clasificaciones_confirmadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventas_servicios_clasificaciones_confirmadas FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ventas_servicios_clasificacion_confirmada(
  p_fecha date,p_factura text,p_sucursal text,p_codigo text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('marca',marca,'tipo',tipo_tiempo)
 FROM public.ventas_servicios_clasificaciones_confirmadas
 WHERE fecha=p_fecha AND factura=public.ventas_servicios_factura_clave(p_factura)
   AND sucursal=p_sucursal AND codigo=p_codigo;
$$;
REVOKE ALL ON FUNCTION public.ventas_servicios_clasificacion_confirmada(date,text,text,text)
  FROM PUBLIC,anon,authenticated;

DO $patch$
DECLARE
 definition text := pg_get_functiondef('public.ventas_servicios_movimientos_enriquecidos(date,date,text)'::regprocedure);
 marca text := $old$coalesce(nullif(btrim(m.marca_parque),'')$old$;
 tipo text := $old$nullif(fl.tipo_tiempo,'')$old$;
 lookup text := 'public.ventas_servicios_clasificacion_confirmada(b.fecha,b.factura,b.sucursal,b.codigo)';
BEGIN
 IF strpos(definition,lookup)>0 THEN RETURN; END IF;
 IF strpos(definition,marca)=0 OR strpos(definition,tipo)=0 THEN
   RAISE EXCEPTION 'La fuente de Ventas de Servicios requiere revisión antes de agregar clasificaciones confirmadas';
 END IF;
 definition := replace(definition,marca,'coalesce('||lookup||'->>''marca'',nullif(btrim(m.marca_parque),'''')');
 definition := replace(definition,tipo,'coalesce('||lookup||'->>''tipo'',nullif(fl.tipo_tiempo,''''))');
 EXECUTE definition;
END;
$patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
