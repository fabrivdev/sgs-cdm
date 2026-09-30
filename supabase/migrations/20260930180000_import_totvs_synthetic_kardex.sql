-- Kardex sint\u00e9tico TOTVS: foto valorizada sin fecha de corte ni moneda declarada.
-- No deriva VALOR = SALDO * PPP porque la muestra contiene valores residuales con saldo cero.

BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_kardex_sintetico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal text NOT NULL,
  producto_codigo text NOT NULL,
  producto_descripcion text,
  deposito text NOT NULL,
  chasis text,
  chasis_clave text GENERATED ALWAYS AS (coalesce(nullif(btrim(chasis),''),'__SIN_CHASIS__')) STORED,
  saldo numeric NOT NULL,
  ppp_1 numeric NOT NULL,
  valor_1 numeric NOT NULL,
  ppp_2 numeric NOT NULL,
  valor_2 numeric NOT NULL,
  ppp_3 numeric NOT NULL,
  valor_3 numeric NOT NULL,
  archivo_origen text NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen >= 2),
  huella_origen text NOT NULL,
  datos_fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  carga_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sucursal, producto_codigo, deposito, chasis_clave)
);

CREATE INDEX IF NOT EXISTS totvs_kardex_sintetico_producto_idx
  ON public.totvs_kardex_sintetico(producto_codigo);
CREATE INDEX IF NOT EXISTS totvs_kardex_sintetico_chasis_idx
  ON public.totvs_kardex_sintetico(chasis) WHERE chasis IS NOT NULL;

ALTER TABLE public.totvs_kardex_sintetico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS totvs_kardex_sintetico_select ON public.totvs_kardex_sintetico;
CREATE POLICY totvs_kardex_sintetico_select ON public.totvs_kardex_sintetico
FOR SELECT TO authenticated
USING (
  public.has_section_access(auth.uid(), 'admin.importaciones')
  OR public.has_module_access(auth.uid(), 'repuestos')
  OR public.has_module_access(auth.uid(), 'parque')
);
REVOKE ALL ON TABLE public.totvs_kardex_sintetico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.totvs_kardex_sintetico TO authenticated;

CREATE OR REPLACE FUNCTION public.totvs_importar_kardex_sintetico_lote_v1(p_carga_id uuid, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total integer;
  v_unicas integer;
  v_insertadas integer;
  v_actualizadas integer;
  v_sin_cambios integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_section_access(auth.uid(), 'admin.importaciones') THEN
    RAISE EXCEPTION 'Sin permiso para importar datos de TOTVS' USING ERRCODE='42501';
  END IF;
  IF p_carga_id IS NULL OR p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Carga o filas de Kardex sint\u00e9tico inv\u00e1lidas' USING ERRCODE='22023';
  END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Cada lote de Kardex sint\u00e9tico debe contener entre 1 y 500 filas' USING ERRCODE='22023';
  END IF;

  CREATE TEMP TABLE kardex_sintetico_lote ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_filas) AS x(
    sucursal text, producto_codigo text, producto_descripcion text, deposito text, chasis text,
    saldo numeric, ppp_1 numeric, valor_1 numeric, ppp_2 numeric, valor_2 numeric,
    ppp_3 numeric, valor_3 numeric, archivo_origen text, fila_origen integer,
    huella_origen text, datos_fuente jsonb
  );

  SELECT count(DISTINCT (btrim(sucursal),btrim(producto_codigo),btrim(deposito),coalesce(nullif(btrim(chasis),''),'__SIN_CHASIS__')))
  INTO v_unicas FROM kardex_sintetico_lote;
  IF v_unicas <> v_total THEN
    RAISE EXCEPTION 'El lote de Kardex sint\u00e9tico contiene claves repetidas' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM kardex_sintetico_lote WHERE nullif(btrim(sucursal),'') IS NULL
      OR nullif(btrim(producto_codigo),'') IS NULL OR nullif(btrim(deposito),'') IS NULL
      OR saldo IS NULL OR ppp_1 IS NULL OR valor_1 IS NULL OR ppp_2 IS NULL OR valor_2 IS NULL
      OR ppp_3 IS NULL OR valor_3 IS NULL OR nullif(btrim(archivo_origen),'') IS NULL
      OR fila_origen < 2 OR nullif(btrim(huella_origen),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'El lote de Kardex sint\u00e9tico contiene campos obligatorios inv\u00e1lidos' USING ERRCODE='22023';
  END IF;

  SELECT count(*) FILTER (WHERE actual.id IS NULL),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen IS DISTINCT FROM lote.huella_origen),
         count(*) FILTER (WHERE actual.id IS NOT NULL AND actual.huella_origen = lote.huella_origen)
  INTO v_insertadas,v_actualizadas,v_sin_cambios
  FROM kardex_sintetico_lote lote
  LEFT JOIN public.totvs_kardex_sintetico actual
    ON actual.sucursal=btrim(lote.sucursal) AND actual.producto_codigo=btrim(lote.producto_codigo)
   AND actual.deposito=btrim(lote.deposito)
   AND actual.chasis_clave=coalesce(nullif(btrim(lote.chasis),''),'__SIN_CHASIS__');

  INSERT INTO public.totvs_kardex_sintetico (
    sucursal,producto_codigo,producto_descripcion,deposito,chasis,saldo,
    ppp_1,valor_1,ppp_2,valor_2,ppp_3,valor_3,
    archivo_origen,fila_origen,huella_origen,datos_fuente,carga_id
  )
  SELECT btrim(sucursal),btrim(producto_codigo),nullif(btrim(producto_descripcion),''),btrim(deposito),
    nullif(btrim(chasis),''),saldo,ppp_1,valor_1,ppp_2,valor_2,ppp_3,valor_3,
    archivo_origen,fila_origen,huella_origen,coalesce(datos_fuente,'{}'::jsonb),p_carga_id
  FROM kardex_sintetico_lote
  ON CONFLICT (sucursal,producto_codigo,deposito,chasis_clave) DO UPDATE SET
    producto_descripcion=EXCLUDED.producto_descripcion,chasis=EXCLUDED.chasis,
    saldo=EXCLUDED.saldo,ppp_1=EXCLUDED.ppp_1,valor_1=EXCLUDED.valor_1,
    ppp_2=EXCLUDED.ppp_2,valor_2=EXCLUDED.valor_2,ppp_3=EXCLUDED.ppp_3,valor_3=EXCLUDED.valor_3,
    archivo_origen=EXCLUDED.archivo_origen,fila_origen=EXCLUDED.fila_origen,
    huella_origen=EXCLUDED.huella_origen,datos_fuente=EXCLUDED.datos_fuente,
    carga_id=EXCLUDED.carga_id,actualizado_en=now()
  WHERE public.totvs_kardex_sintetico.huella_origen IS DISTINCT FROM EXCLUDED.huella_origen;

  RETURN jsonb_build_object('total',v_total,'insertadas',v_insertadas,'actualizadas',v_actualizadas,'sin_cambios',v_sin_cambios);
END;
$$;

REVOKE ALL ON FUNCTION public.totvs_importar_kardex_sintetico_lote_v1(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totvs_importar_kardex_sintetico_lote_v1(uuid,jsonb) TO authenticated;

COMMENT ON TABLE public.totvs_kardex_sintetico IS
  'Foto valorizada TOTVS sin fecha de corte declarada; PPP/VALOR 1,2,3 se preservan sin asignar moneda.';

NOTIFY pgrst, 'reload schema';

COMMIT;
