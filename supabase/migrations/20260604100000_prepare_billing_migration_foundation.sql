-- Base estable para anexar facturacion de sistemas nuevos sin romper el historico.
-- Este bloque no cambia pantallas ni lecturas actuales; solo agrega reglas y staging.

ALTER TABLE public.importaciones
  ADD COLUMN IF NOT EXISTS origen_sistema text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS origen_sistema text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS grupo_normalizado text,
  ADD COLUMN IF NOT EXISTS marca_normalizada public.marca,
  ADD COLUMN IF NOT EXISTS tipo_tiempo text,
  ADD COLUMN IF NOT EXISTS codigo_interno_factura text,
  ADD COLUMN IF NOT EXISTS cod_mercaderia text,
  ADD COLUMN IF NOT EXISTS observacion text,
  ADD COLUMN IF NOT EXISTS importacion_id uuid REFERENCES public.importaciones(id) ON DELETE SET NULL;

ALTER TABLE public.facturacion
  DROP CONSTRAINT IF EXISTS facturacion_tipo_tiempo_check;

ALTER TABLE public.facturacion
  ADD CONSTRAINT facturacion_tipo_tiempo_check
  CHECK (tipo_tiempo IS NULL OR tipo_tiempo IN ('Cliente', 'Garantia', 'Interno'));

CREATE INDEX IF NOT EXISTS facturacion_origen_sistema_idx
  ON public.facturacion(origen_sistema);

CREATE INDEX IF NOT EXISTS facturacion_tipo_tiempo_idx
  ON public.facturacion(tipo_tiempo)
  WHERE tipo_tiempo IS NOT NULL;

CREATE INDEX IF NOT EXISTS facturacion_codigo_interno_cod_mercaderia_idx
  ON public.facturacion(codigo_interno_factura, cod_mercaderia)
  WHERE codigo_interno_factura IS NOT NULL OR cod_mercaderia IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.facturacion_grupo_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_original text NOT NULL,
  grupo_normalizado text NOT NULL,
  marca public.marca NOT NULL DEFAULT 'OTROS',
  tipo public.tipo_facturacion,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_original)
);

ALTER TABLE public.facturacion_grupo_reglas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Facturacion grupo reglas select" ON public.facturacion_grupo_reglas;
CREATE POLICY "Facturacion grupo reglas select"
  ON public.facturacion_grupo_reglas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'cabecilla'::public.app_role));

DROP POLICY IF EXISTS "Facturacion grupo reglas manage" ON public.facturacion_grupo_reglas;
CREATE POLICY "Facturacion grupo reglas manage"
  ON public.facturacion_grupo_reglas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.facturacion_grupo_reglas (grupo_original, grupo_normalizado, marca, tipo, notas)
VALUES
  ('SERVICE - CLAAS', 'Servicio', 'CLAAS', 'Servicio', 'Regla legacy definida con CDM'),
  ('REPUESTOS - CLAAS', 'Repuestos', 'CLAAS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS CLAAS - PROMOCION', 'Repuestos', 'CLAAS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS - CABEZALES/PLATAFOR', 'Repuestos', 'CLAAS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS TRACTOR', 'Repuestos', 'CLAAS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS DIVERSOS --', 'Repuestos', 'CLAAS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('SERVICE - HORSCH', 'Servicio', 'HORSCH', 'Servicio', 'Regla legacy definida con CDM'),
  ('REPUESTOS PLANTADORA', 'Repuestos', 'HORSCH', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS PULVERIZADORAS', 'Repuestos', 'HORSCH', 'Repuesto', 'Regla legacy definida con CDM'),
  ('SERVICIOS - OTROS', 'Servicio', 'OTROS', 'Servicio', 'Regla legacy definida con CDM'),
  ('REPUESTOS - RIEGO', 'Repuestos', 'OTROS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('OTROS PRODUCTOS', 'Otros', 'OTROS', NULL, 'Regla legacy definida con CDM'),
  ('REPUESTOS USADO', 'Repuestos', 'OTROS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('ACCESORIOS DIVERSOS', 'Otros', 'OTROS', NULL, 'Regla legacy definida con CDM'),
  ('REPUESTOS - ENROLLADORES', 'Repuestos', 'OTROS', 'Repuesto', 'Regla legacy definida con CDM'),
  ('REPUESTOS - CESTARI', 'Repuestos', 'OTROS', 'Repuesto', 'Regla legacy definida con CDM')
ON CONFLICT (grupo_original) DO UPDATE
SET grupo_normalizado = EXCLUDED.grupo_normalizado,
    marca = EXCLUDED.marca,
    tipo = EXCLUDED.tipo,
    activo = true,
    notas = EXCLUDED.notas,
    actualizado_en = now();

CREATE OR REPLACE FUNCTION public.facturacion_marca_por_grupo(p_grupo text)
RETURNS public.marca
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT r.marca
      FROM public.facturacion_grupo_reglas r
      WHERE r.activo
        AND upper(trim(r.grupo_original)) = upper(trim(coalesce(p_grupo, '')))
      LIMIT 1
    ),
    'OTROS'::public.marca
  );
$$;

CREATE OR REPLACE FUNCTION public.facturacion_tipo_tiempo_campos(
  p_entidad text,
  p_observacion text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_entidad, '')) NOT LIKE '%CAMPOS DEL MAÑANA%' THEN 'Cliente'
    WHEN coalesce(p_observacion, '') ~* '(^|[^0-9])[0-9]{6,}([^0-9]|$)'
     AND coalesce(p_observacion, '') ~* '[[:alpha:]]{3,}[[:space:]-]+[[:alpha:]]{3,}' THEN 'Garantia'
    ELSE 'Interno'
  END;
$$;

CREATE TABLE IF NOT EXISTS public.facturacion_lineas_importadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id uuid REFERENCES public.importaciones(id) ON DELETE SET NULL,
  origen_sistema text NOT NULL DEFAULT 'legacy',
  codigo_interno_factura text,
  factura text,
  entidad_nombre text NOT NULL,
  fecha_factura timestamptz,
  sucursal public.sucursal,
  subgrupo_original text,
  grupo_normalizado text,
  marca_normalizada public.marca NOT NULL DEFAULT 'OTROS',
  tipo_facturacion public.tipo_facturacion,
  tipo_tiempo text NOT NULL DEFAULT 'Cliente',
  observacion text,
  cod_mercaderia text,
  codigo_fabricante text,
  mercaderia text,
  cantidad numeric,
  valor_unitario numeric,
  total_venta numeric NOT NULL DEFAULT 0,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  importado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  linea_hash text NOT NULL DEFAULT '',
  CONSTRAINT facturacion_lineas_tipo_tiempo_check
    CHECK (tipo_tiempo IN ('Cliente', 'Garantia', 'Interno'))
);

CREATE OR REPLACE FUNCTION public.set_facturacion_linea_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.linea_hash := md5(
    coalesce(NEW.origen_sistema, '') || '|' ||
    coalesce(NEW.codigo_interno_factura, '') || '|' ||
    coalesce(NEW.factura, '') || '|' ||
    coalesce(NEW.cod_mercaderia, '') || '|' ||
    coalesce(NEW.codigo_fabricante, '') || '|' ||
    coalesce(NEW.observacion, '') || '|' ||
    coalesce(NEW.total_venta::text, '')
  );
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_facturacion_linea_hash_trigger ON public.facturacion_lineas_importadas;
CREATE TRIGGER set_facturacion_linea_hash_trigger
BEFORE INSERT OR UPDATE ON public.facturacion_lineas_importadas
FOR EACH ROW
EXECUTE FUNCTION public.set_facturacion_linea_hash();

CREATE UNIQUE INDEX IF NOT EXISTS facturacion_lineas_origen_hash_unique
  ON public.facturacion_lineas_importadas(origen_sistema, linea_hash);

CREATE INDEX IF NOT EXISTS facturacion_lineas_factura_item_idx
  ON public.facturacion_lineas_importadas(codigo_interno_factura, cod_mercaderia);

CREATE INDEX IF NOT EXISTS facturacion_lineas_factura_idx
  ON public.facturacion_lineas_importadas(factura);

CREATE INDEX IF NOT EXISTS facturacion_lineas_tipo_tiempo_idx
  ON public.facturacion_lineas_importadas(tipo_tiempo);

CREATE INDEX IF NOT EXISTS facturacion_lineas_fecha_idx
  ON public.facturacion_lineas_importadas(fecha_factura);

ALTER TABLE public.facturacion_lineas_importadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Facturacion lineas select" ON public.facturacion_lineas_importadas;
CREATE POLICY "Facturacion lineas select"
  ON public.facturacion_lineas_importadas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role)
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

DROP POLICY IF EXISTS "Facturacion lineas manage" ON public.facturacion_lineas_importadas;
CREATE POLICY "Facturacion lineas manage"
  ON public.facturacion_lineas_importadas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'cabecilla'::public.app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'cabecilla'::public.app_role)
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );
