-- Motor v1 de sugerencias de compra de repuestos.
-- Alcance confirmado: compra global por empresa, CLAAS/HORSCH, stock actual,
-- transito cero, ABC por total vendido, criticidad manual, origen Alemania
-- editable, cantidades enteras y sin flujo de aprobacion.

CREATE TABLE IF NOT EXISTS public.repuestos_modelo_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca public.marca NOT NULL,
  version integer NOT NULL,
  nombre text NOT NULL,
  activa boolean NOT NULL DEFAULT false,
  peso_reciente numeric NOT NULL DEFAULT 0.60 CHECK (peso_reciente BETWEEN 0 AND 1),
  peso_anterior numeric NOT NULL DEFAULT 0.40 CHECK (peso_anterior BETWEEN 0 AND 1),
  lead_time_meses integer NOT NULL CHECK (lead_time_meses >= 0),
  ciclo_planificacion_meses integer NOT NULL DEFAULT 1 CHECK (ciclo_planificacion_meses >= 0),
  origen_predeterminado text NOT NULL DEFAULT 'ALEMANIA',
  abc_limite_a numeric NOT NULL DEFAULT 0.80 CHECK (abc_limite_a BETWEEN 0 AND 1),
  abc_limite_b numeric NOT NULL DEFAULT 0.95 CHECK (abc_limite_b BETWEEN 0 AND 1),
  fsn_pedidos_f integer NOT NULL DEFAULT 6 CHECK (fsn_pedidos_f >= 1),
  fsn_dias_f integer NOT NULL DEFAULT 90 CHECK (fsn_dias_f >= 0),
  fsn_dias_n integer NOT NULL DEFAULT 365 CHECK (fsn_dias_n >= 1),
  xyz_cv_x numeric NOT NULL DEFAULT 0.50 CHECK (xyz_cv_x >= 0),
  xyz_cv_y numeric NOT NULL DEFAULT 1.00 CHECK (xyz_cv_y >= 0),
  xyz_meses_x integer NOT NULL DEFAULT 9 CHECK (xyz_meses_x BETWEEN 1 AND 12),
  xyz_meses_y_min integer NOT NULL DEFAULT 4 CHECK (xyz_meses_y_min BETWEEN 1 AND 12),
  xyz_meses_y_max integer NOT NULL DEFAULT 8 CHECK (xyz_meses_y_max BETWEEN 1 AND 12),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca, version),
  CHECK (marca IN ('CLAAS'::public.marca, 'HORSCH'::public.marca)),
  CHECK (peso_reciente + peso_anterior > 0),
  CHECK (abc_limite_a <= abc_limite_b),
  CHECK (xyz_cv_x <= xyz_cv_y),
  CHECK (xyz_meses_y_min <= xyz_meses_y_max)
);

CREATE UNIQUE INDEX IF NOT EXISTS repuestos_modelo_una_activa_por_marca_idx
  ON public.repuestos_modelo_versiones (marca)
  WHERE activa;

CREATE TABLE IF NOT EXISTS public.repuestos_modelo_segmentos (
  modelo_version_id uuid NOT NULL REFERENCES public.repuestos_modelo_versiones(id) ON DELETE CASCADE,
  segmento text NOT NULL,
  nivel_servicio numeric,
  revision_meses integer NOT NULL CHECK (revision_meses >= 0),
  valor_z numeric NOT NULL CHECK (valor_z >= 0),
  descripcion text,
  PRIMARY KEY (modelo_version_id, segmento)
);

CREATE TABLE IF NOT EXISTS public.repuestos_modelo_reglas_mix (
  modelo_version_id uuid NOT NULL REFERENCES public.repuestos_modelo_versiones(id) ON DELETE CASCADE,
  codigo_mix text NOT NULL,
  segmento text NOT NULL,
  PRIMARY KEY (modelo_version_id, codigo_mix)
);

CREATE TABLE IF NOT EXISTS public.repuestos_articulo_planificacion (
  producto_codigo text PRIMARY KEY REFERENCES public.productos(codigo_interno) ON DELETE CASCADE,
  criticidad text CHECK (criticidad IS NULL OR criticidad IN ('V', 'E', 'D')),
  origen text NOT NULL DEFAULT 'ALEMANIA',
  observaciones text,
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS repuestos_articulo_planificacion_actualizado_trigger
  ON public.repuestos_articulo_planificacion;
CREATE TRIGGER repuestos_articulo_planificacion_actualizado_trigger
BEFORE UPDATE ON public.repuestos_articulo_planificacion
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.repuestos_corridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca public.marca NOT NULL,
  modelo_version_id uuid NOT NULL REFERENCES public.repuestos_modelo_versiones(id),
  nombre text NOT NULL,
  fecha_analisis date NOT NULL,
  alcance text NOT NULL DEFAULT 'EMPRESA' CHECK (alcance = 'EMPRESA'),
  estado text NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'completada', 'fallida')),
  parametros_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  fuentes_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_piezas integer NOT NULL DEFAULT 0,
  piezas_sugeridas integer NOT NULL DEFAULT 0,
  unidades_sugeridas numeric NOT NULL DEFAULT 0,
  pendientes_criticidad integer NOT NULL DEFAULT 0,
  piezas_sin_ventas integer NOT NULL DEFAULT 0,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz
);

CREATE INDEX IF NOT EXISTS repuestos_corridas_marca_fecha_idx
  ON public.repuestos_corridas (marca, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.repuestos_corrida_resultados (
  corrida_id uuid NOT NULL REFERENCES public.repuestos_corridas(id) ON DELETE CASCADE,
  producto_codigo text NOT NULL REFERENCES public.productos(codigo_interno) ON DELETE RESTRICT,
  codigo_fabricante text,
  descripcion text NOT NULL,
  familia text,
  marca public.marca NOT NULL,
  criticidad text,
  origen text NOT NULL,
  estado_datos text NOT NULL,
  stock_global numeric NOT NULL DEFAULT 0,
  unidades_12m numeric NOT NULL DEFAULT 0,
  unidades_24m numeric NOT NULL DEFAULT 0,
  total_vendido_12m numeric NOT NULL DEFAULT 0,
  total_vendido_24m numeric NOT NULL DEFAULT 0,
  pedidos_12m integer NOT NULL DEFAULT 0,
  pedidos_24m integer NOT NULL DEFAULT 0,
  meses_venta_12m integer NOT NULL DEFAULT 0,
  media_mensual_12m numeric NOT NULL DEFAULT 0,
  desviacion_mensual_12m numeric NOT NULL DEFAULT 0,
  coeficiente_variacion numeric NOT NULL DEFAULT 0,
  ultima_venta date,
  dias_ultima_venta integer,
  abc text NOT NULL,
  fsn text NOT NULL,
  xyz text NOT NULL,
  ved text,
  codigo_mix text,
  segmento text NOT NULL,
  horizonte_meses integer NOT NULL DEFAULT 0,
  demanda_ponderada_mensual numeric NOT NULL DEFAULT 0,
  demanda_horizonte numeric NOT NULL DEFAULT 0,
  stock_seguridad numeric NOT NULL DEFAULT 0,
  stock_objetivo numeric NOT NULL DEFAULT 0,
  necesidad_neta numeric NOT NULL DEFAULT 0,
  sugerencia_unidades integer NOT NULL DEFAULT 0,
  explicacion jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (corrida_id, producto_codigo)
);

CREATE INDEX IF NOT EXISTS repuestos_resultados_corrida_sugerencia_idx
  ON public.repuestos_corrida_resultados (corrida_id, sugerencia_unidades DESC);
CREATE INDEX IF NOT EXISTS repuestos_resultados_corrida_segmento_idx
  ON public.repuestos_corrida_resultados (corrida_id, segmento);
CREATE INDEX IF NOT EXISTS repuestos_resultados_corrida_estado_idx
  ON public.repuestos_corrida_resultados (corrida_id, estado_datos);

-- RLS: todos los usuarios del modulo consultan; Admin/Jefatura configuran
-- y ejecutan. Las funciones SECURITY DEFINER repiten estas validaciones.
ALTER TABLE public.repuestos_modelo_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_modelo_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_modelo_reglas_mix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_articulo_planificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_corridas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_corrida_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repuestos_modelo_versiones_select ON public.repuestos_modelo_versiones;
CREATE POLICY repuestos_modelo_versiones_select ON public.repuestos_modelo_versiones
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_modelo_segmentos_select ON public.repuestos_modelo_segmentos;
CREATE POLICY repuestos_modelo_segmentos_select ON public.repuestos_modelo_segmentos
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_modelo_reglas_mix_select ON public.repuestos_modelo_reglas_mix;
CREATE POLICY repuestos_modelo_reglas_mix_select ON public.repuestos_modelo_reglas_mix
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_articulo_planificacion_select ON public.repuestos_articulo_planificacion;
CREATE POLICY repuestos_articulo_planificacion_select ON public.repuestos_articulo_planificacion
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_articulo_planificacion_write ON public.repuestos_articulo_planificacion;
CREATE POLICY repuestos_articulo_planificacion_write ON public.repuestos_articulo_planificacion
FOR ALL TO authenticated
USING (
  public.has_module_access(auth.uid(), 'repuestos')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
  )
)
WITH CHECK (
  public.has_module_access(auth.uid(), 'repuestos')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
  )
);

DROP POLICY IF EXISTS repuestos_corridas_select ON public.repuestos_corridas;
CREATE POLICY repuestos_corridas_select ON public.repuestos_corridas
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

DROP POLICY IF EXISTS repuestos_resultados_select ON public.repuestos_corrida_resultados;
CREATE POLICY repuestos_resultados_select ON public.repuestos_corrida_resultados
FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(), 'repuestos'));

GRANT SELECT ON public.repuestos_modelo_versiones TO authenticated;
GRANT SELECT ON public.repuestos_modelo_segmentos TO authenticated;
GRANT SELECT ON public.repuestos_modelo_reglas_mix TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repuestos_articulo_planificacion TO authenticated;
GRANT SELECT ON public.repuestos_corridas TO authenticated;
GRANT SELECT ON public.repuestos_corrida_resultados TO authenticated;

-- Configuracion inicial confirmada por CDM.
INSERT INTO public.repuestos_modelo_versiones (
  marca, version, nombre, activa, lead_time_meses, ciclo_planificacion_meses,
  origen_predeterminado
)
VALUES
  ('CLAAS', 1, 'Modelo inicial CLAAS', true, 3, 1, 'ALEMANIA'),
  ('HORSCH', 1, 'Modelo inicial HORSCH', true, 4, 1, 'ALEMANIA')
ON CONFLICT (marca, version) DO NOTHING;

INSERT INTO public.repuestos_modelo_segmentos (
  modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
)
SELECT m.id, v.segmento, v.nivel_servicio, v.revision_meses, v.valor_z, v.descripcion
FROM public.repuestos_modelo_versiones m
CROSS JOIN (VALUES
  ('ESTRELLA', 0.99::numeric, 1, 2.50::numeric, 'Cobertura alta y seguridad maxima'),
  ('CRITICO ESTRATEGICO', 0.98::numeric, 1, 2.05::numeric, 'Stock asegurado con control de capital'),
  ('DEMANDA VOLATIL', 0.90::numeric, 2, 1.00::numeric, 'Cobertura controlada por variabilidad'),
  ('FLUJO ESTABLE', 0.96::numeric, 2, 1.75::numeric, 'Reposicion automatica estandar'),
  ('SERVICIO ECONOMICO', 0.88::numeric, 3, 0.80::numeric, 'Stock minimo y reposicion restrictiva'),
  ('BAJO PEDIDO', NULL::numeric, 6, 0.00::numeric, 'Sin stock planificado')
) AS v(segmento, nivel_servicio, revision_meses, valor_z, descripcion)
WHERE m.version = 1 AND m.marca IN ('CLAAS', 'HORSCH')
ON CONFLICT (modelo_version_id, segmento) DO NOTHING;

INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
SELECT m.id, v.codigo_mix, v.segmento
FROM public.repuestos_modelo_versiones m
CROSS JOIN (VALUES
  ('ANZD','BAJO PEDIDO'),('ANZE','BAJO PEDIDO'),('BNZD','BAJO PEDIDO'),('BNZE','BAJO PEDIDO'),
  ('ANZV','CRITICO ESTRATEGICO'),('ASYV','CRITICO ESTRATEGICO'),('BNZV','CRITICO ESTRATEGICO'),
  ('BSZV','CRITICO ESTRATEGICO'),('CFZV','CRITICO ESTRATEGICO'),('CNZV','CRITICO ESTRATEGICO'),
  ('CSZV','CRITICO ESTRATEGICO'),('CFYV','CRITICO ESTRATEGICO'),('CSYV','CRITICO ESTRATEGICO'),
  ('ASXV','CRITICO ESTRATEGICO'),
  ('AFZD','DEMANDA VOLATIL'),('AFZE','DEMANDA VOLATIL'),('AFZV','DEMANDA VOLATIL'),
  ('ASXD','DEMANDA VOLATIL'),('ASYD','DEMANDA VOLATIL'),('ASYE','DEMANDA VOLATIL'),
  ('ASZD','DEMANDA VOLATIL'),('ASZE','DEMANDA VOLATIL'),('ASZV','DEMANDA VOLATIL'),
  ('BFZD','DEMANDA VOLATIL'),('BFZE','DEMANDA VOLATIL'),('BFZV','DEMANDA VOLATIL'),
  ('BSXD','DEMANDA VOLATIL'),('BSYD','DEMANDA VOLATIL'),('BSYE','DEMANDA VOLATIL'),
  ('BSZD','DEMANDA VOLATIL'),('BSZE','DEMANDA VOLATIL'),('BSYV','DEMANDA VOLATIL'),
  ('BSXV','DEMANDA VOLATIL'),
  ('AFXE','ESTRELLA'),('AFXV','ESTRELLA'),('AFYE','ESTRELLA'),('AFYV','ESTRELLA'),
  ('BFXE','ESTRELLA'),('BFXV','ESTRELLA'),('BFYE','ESTRELLA'),('BFYV','ESTRELLA'),
  ('AFXD','FLUJO ESTABLE'),('AFYD','FLUJO ESTABLE'),('ASXE','FLUJO ESTABLE'),
  ('BFXD','FLUJO ESTABLE'),('BFYD','FLUJO ESTABLE'),('BSXE','FLUJO ESTABLE'),
  ('CFXD','FLUJO ESTABLE'),('CFXE','FLUJO ESTABLE'),('CFYD','FLUJO ESTABLE'),('CFYE','FLUJO ESTABLE'),
  ('CFZD','SERVICIO ECONOMICO'),('CFZE','SERVICIO ECONOMICO'),('CNZD','SERVICIO ECONOMICO'),
  ('CNZE','SERVICIO ECONOMICO'),('CSXD','SERVICIO ECONOMICO'),('CSXE','SERVICIO ECONOMICO'),
  ('CSYD','SERVICIO ECONOMICO'),('CSYE','SERVICIO ECONOMICO'),('CSZD','SERVICIO ECONOMICO'),
  ('CSZE','SERVICIO ECONOMICO')
) AS v(codigo_mix, segmento)
WHERE m.version = 1 AND m.marca IN ('CLAAS', 'HORSCH')
ON CONFLICT (modelo_version_id, codigo_mix) DO NOTHING;

CREATE OR REPLACE FUNCTION public.repuestos_asignar_criticidad(
  p_producto_codigo text,
  p_criticidad text,
  p_origen text DEFAULT 'ALEMANIA',
  p_observaciones text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'repuestos')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No tenes permiso para editar la criticidad' USING ERRCODE = '42501';
  END IF;

  IF p_criticidad IS NOT NULL AND upper(trim(p_criticidad)) NOT IN ('V','E','D') THEN
    RAISE EXCEPTION 'Criticidad invalida: use V, E o D';
  END IF;

  INSERT INTO public.repuestos_articulo_planificacion (
    producto_codigo, criticidad, origen, observaciones, actualizado_por
  ) VALUES (
    p_producto_codigo,
    NULLIF(upper(trim(coalesce(p_criticidad, ''))), ''),
    upper(trim(coalesce(NULLIF(p_origen, ''), 'ALEMANIA'))),
    NULLIF(trim(coalesce(p_observaciones, '')), ''),
    auth.uid()
  )
  ON CONFLICT (producto_codigo) DO UPDATE SET
    criticidad = EXCLUDED.criticidad,
    origen = EXCLUDED.origen,
    observaciones = EXCLUDED.observaciones,
    actualizado_por = auth.uid(),
    actualizado_en = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_crear_version_modelo(
  p_marca text,
  p_nombre text,
  p_parametros jsonb,
  p_segmentos jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior public.repuestos_modelo_versiones%ROWTYPE;
  v_nueva_id uuid;
  v_version integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'repuestos')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No tenes permiso para configurar el modelo' USING ERRCODE = '42501';
  END IF;

  IF upper(trim(p_marca)) NOT IN ('CLAAS','HORSCH') THEN
    RAISE EXCEPTION 'Marca invalida';
  END IF;

  SELECT * INTO v_anterior
  FROM public.repuestos_modelo_versiones
  WHERE marca::text = upper(trim(p_marca)) AND activa
  FOR UPDATE;

  IF v_anterior.id IS NULL THEN
    RAISE EXCEPTION 'No existe una configuracion activa para %', p_marca;
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.repuestos_modelo_versiones
  WHERE marca = v_anterior.marca;

  UPDATE public.repuestos_modelo_versiones SET activa = false WHERE id = v_anterior.id;

  INSERT INTO public.repuestos_modelo_versiones (
    marca, version, nombre, activa, peso_reciente, peso_anterior,
    lead_time_meses, ciclo_planificacion_meses, origen_predeterminado,
    abc_limite_a, abc_limite_b, fsn_pedidos_f, fsn_dias_f, fsn_dias_n,
    xyz_cv_x, xyz_cv_y, xyz_meses_x, xyz_meses_y_min, xyz_meses_y_max, creado_por
  ) VALUES (
    v_anterior.marca,
    v_version,
    coalesce(NULLIF(trim(p_nombre), ''), 'Modelo ' || upper(trim(p_marca)) || ' v' || v_version),
    true,
    coalesce(NULLIF(p_parametros->>'peso_reciente', '')::numeric, v_anterior.peso_reciente),
    coalesce(NULLIF(p_parametros->>'peso_anterior', '')::numeric, v_anterior.peso_anterior),
    coalesce(NULLIF(p_parametros->>'lead_time_meses', '')::integer, v_anterior.lead_time_meses),
    coalesce(NULLIF(p_parametros->>'ciclo_planificacion_meses', '')::integer, v_anterior.ciclo_planificacion_meses),
    upper(coalesce(NULLIF(trim(p_parametros->>'origen_predeterminado'), ''), v_anterior.origen_predeterminado)),
    coalesce(NULLIF(p_parametros->>'abc_limite_a', '')::numeric, v_anterior.abc_limite_a),
    coalesce(NULLIF(p_parametros->>'abc_limite_b', '')::numeric, v_anterior.abc_limite_b),
    coalesce(NULLIF(p_parametros->>'fsn_pedidos_f', '')::integer, v_anterior.fsn_pedidos_f),
    coalesce(NULLIF(p_parametros->>'fsn_dias_f', '')::integer, v_anterior.fsn_dias_f),
    coalesce(NULLIF(p_parametros->>'fsn_dias_n', '')::integer, v_anterior.fsn_dias_n),
    coalesce(NULLIF(p_parametros->>'xyz_cv_x', '')::numeric, v_anterior.xyz_cv_x),
    coalesce(NULLIF(p_parametros->>'xyz_cv_y', '')::numeric, v_anterior.xyz_cv_y),
    coalesce(NULLIF(p_parametros->>'xyz_meses_x', '')::integer, v_anterior.xyz_meses_x),
    coalesce(NULLIF(p_parametros->>'xyz_meses_y_min', '')::integer, v_anterior.xyz_meses_y_min),
    coalesce(NULLIF(p_parametros->>'xyz_meses_y_max', '')::integer, v_anterior.xyz_meses_y_max),
    auth.uid()
  ) RETURNING id INTO v_nueva_id;

  IF p_segmentos IS NULL OR jsonb_typeof(p_segmentos) <> 'array' THEN
    INSERT INTO public.repuestos_modelo_segmentos (
      modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
    )
    SELECT v_nueva_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
    FROM public.repuestos_modelo_segmentos
    WHERE modelo_version_id = v_anterior.id;
  ELSE
    INSERT INTO public.repuestos_modelo_segmentos (
      modelo_version_id, segmento, nivel_servicio, revision_meses, valor_z, descripcion
    )
    SELECT
      v_nueva_id, x.segmento, x.nivel_servicio, x.revision_meses, x.valor_z, x.descripcion
    FROM jsonb_to_recordset(p_segmentos) AS x(
      segmento text,
      nivel_servicio numeric,
      revision_meses integer,
      valor_z numeric,
      descripcion text
    );
  END IF;

  INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
  SELECT v_nueva_id, codigo_mix, segmento
  FROM public.repuestos_modelo_reglas_mix
  WHERE modelo_version_id = v_anterior.id;

  RETURN v_nueva_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_ejecutar_sugerencia(
  p_marca text,
  p_fecha_analisis date DEFAULT CURRENT_DATE,
  p_nombre text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = 0
AS $$
DECLARE
  v_modelo public.repuestos_modelo_versiones%ROWTYPE;
  v_corrida_id uuid;
  v_fecha date := coalesce(p_fecha_analisis, CURRENT_DATE);
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'repuestos')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'No tenes permiso para ejecutar sugerencias' USING ERRCODE = '42501';
  END IF;

  IF upper(trim(p_marca)) NOT IN ('CLAAS','HORSCH') THEN
    RAISE EXCEPTION 'Marca invalida';
  END IF;

  SELECT * INTO v_modelo
  FROM public.repuestos_modelo_versiones
  WHERE marca::text = upper(trim(p_marca)) AND activa
  LIMIT 1;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'No existe un modelo activo para %', p_marca;
  END IF;

  INSERT INTO public.repuestos_corridas (
    marca, modelo_version_id, nombre, fecha_analisis, estado,
    parametros_snapshot, fuentes_snapshot, creado_por
  ) VALUES (
    v_modelo.marca,
    v_modelo.id,
    coalesce(NULLIF(trim(p_nombre), ''), 'Sugerencia ' || v_modelo.marca::text || ' ' || to_char(v_fecha, 'DD/MM/YYYY')),
    v_fecha,
    'procesando',
    to_jsonb(v_modelo),
    jsonb_build_object(
      'ventas_hasta', (SELECT max(fecha_factura) FROM public.facturacion_lineas_importadas),
      'stock_importado_en', (SELECT max(importado_en) FROM public.repuestos_stock),
      'productos_actualizados_en', (SELECT max(actualizado_en) FROM public.productos),
      'transito_incluido', false
    ),
    auth.uid()
  ) RETURNING id INTO v_corrida_id;

  WITH
  productos_base AS MATERIALIZED (
    SELECT
      p.codigo_interno,
      p.codigo_fabricante,
      p.descripcion,
      p.familia,
      p.marca,
      public.normalizar_codigo_repuesto_flexible(p.codigo_interno) AS codigo_interno_norm,
      public.normalizar_codigo_repuesto_flexible(p.codigo_fabricante) AS codigo_fabricante_norm,
      public.extraer_codigo_repuesto_descripcion(p.descripcion) AS codigo_descripcion_norm,
      ap.criticidad,
      coalesce(NULLIF(trim(ap.origen), ''), v_modelo.origen_predeterminado) AS origen
    FROM public.productos p
    LEFT JOIN public.repuestos_articulo_planificacion ap
      ON ap.producto_codigo = p.codigo_interno
    WHERE p.activo
      AND p.codigo_interno ILIKE 'REP%'
      AND p.marca = v_modelo.marca
  ),
  stock_global AS MATERIALIZED (
    SELECT rs.producto_codigo, coalesce(sum(rs.saldo_actual), 0)::numeric AS stock_global
    FROM public.repuestos_stock rs
    JOIN productos_base p ON p.codigo_interno = rs.producto_codigo
    GROUP BY rs.producto_codigo
  ),
  lineas_repuestos AS MATERIALIZED (
    SELECT
      f.*,
      coalesce(
        f.fecha_factura,
        CASE
          WHEN coalesce(f.codigo_interno_factura, f.factura) IS NOT NULL THEN
            max(f.fecha_factura) OVER (PARTITION BY coalesce(f.codigo_interno_factura, f.factura))
          ELSE NULL
        END
      )::date AS fecha_efectiva
    FROM public.facturacion_lineas_importadas f
    WHERE lower(trim(coalesce(f.grupo_normalizado, f.subgrupo_original, ''))) IN (
      'repuesto', 'repuestos', 'repuestos diversos'
    )
      AND upper(coalesce(f.moneda, 'USD')) <> 'GS'
  ),
  candidatos AS MATERIALIZED (
    SELECT f.id AS linea_id, p.codigo_interno AS producto_codigo, 1 AS prioridad
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_interno_norm
    WHERE p.codigo_interno_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 2
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 3
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 4
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_fabricante_norm
    WHERE p.codigo_fabricante_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 5
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.extraer_codigo_repuesto_descripcion(f.mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 6
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.normalizar_codigo_repuesto_flexible(f.codigo_fabricante) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL

    UNION ALL

    SELECT f.id, p.codigo_interno, 7
    FROM productos_base p
    JOIN lineas_repuestos f
      ON public.normalizar_codigo_repuesto_flexible(f.cod_mercaderia) = p.codigo_descripcion_norm
    WHERE p.codigo_descripcion_norm IS NOT NULL
  ),
  asignaciones AS MATERIALIZED (
    SELECT DISTINCT ON (linea_id)
      linea_id, producto_codigo
    FROM candidatos
    ORDER BY linea_id, prioridad, producto_codigo
  ),
  ventas AS MATERIALIZED (
    SELECT
      a.producto_codigo,
      f.id AS linea_id,
      f.fecha_efectiva AS fecha,
      coalesce(f.cantidad, 0)::numeric AS cantidad,
      coalesce(f.total_venta, 0)::numeric AS total_vendido,
      coalesce(f.codigo_interno_factura, f.factura, f.id::text) AS documento
    FROM asignaciones a
    JOIN lineas_repuestos f ON f.id = a.linea_id
    WHERE f.fecha_efectiva >= (date_trunc('month', v_fecha)::date - interval '23 months')::date
      AND f.fecha_efectiva <= v_fecha
  ),
  meses_12 AS (
    SELECT generate_series(
      date_trunc('month', v_fecha)::date - interval '11 months',
      date_trunc('month', v_fecha)::date,
      interval '1 month'
    )::date AS mes
  ),
  ventas_mes AS MATERIALIZED (
    SELECT producto_codigo, date_trunc('month', fecha)::date AS mes, sum(cantidad)::numeric AS unidades
    FROM ventas
    WHERE fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
    GROUP BY producto_codigo, date_trunc('month', fecha)::date
  ),
  estadistica_mensual AS MATERIALIZED (
    SELECT
      p.codigo_interno AS producto_codigo,
      avg(coalesce(vm.unidades, 0))::numeric AS media_mensual,
      coalesce(stddev_pop(coalesce(vm.unidades, 0)), 0)::numeric AS desviacion_mensual
    FROM productos_base p
    CROSS JOIN meses_12 m
    LEFT JOIN ventas_mes vm
      ON vm.producto_codigo = p.codigo_interno AND vm.mes = m.mes
    GROUP BY p.codigo_interno
  ),
  metricas AS MATERIALIZED (
    SELECT
      p.codigo_interno AS producto_codigo,
      coalesce(sum(v.cantidad) FILTER (
        WHERE v.fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
      ), 0)::numeric AS unidades_12m,
      coalesce(sum(v.cantidad), 0)::numeric AS unidades_24m,
      coalesce(sum(v.total_vendido) FILTER (
        WHERE v.fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
      ), 0)::numeric AS total_vendido_12m,
      coalesce(sum(v.total_vendido), 0)::numeric AS total_vendido_24m,
      count(DISTINCT v.documento) FILTER (
        WHERE v.fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
      )::integer AS pedidos_12m,
      count(DISTINCT v.documento)::integer AS pedidos_24m,
      count(DISTINCT date_trunc('month', v.fecha)) FILTER (
        WHERE v.fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
          AND v.cantidad > 0
      )::integer AS meses_venta_12m,
      count(DISTINCT date_trunc('month', v.fecha)) FILTER (WHERE v.cantidad > 0)::integer AS meses_venta_24m,
      max(v.fecha) AS ultima_venta,
      coalesce(max(abs(v.cantidad)) FILTER (
        WHERE v.fecha >= (date_trunc('month', v_fecha)::date - interval '11 months')::date
      ), 0)::numeric AS max_linea_12m
    FROM productos_base p
    LEFT JOIN ventas v ON v.producto_codigo = p.codigo_interno
    GROUP BY p.codigo_interno
  ),
  base_abc AS MATERIALIZED (
    SELECT
      m.*,
      e.media_mensual,
      e.desviacion_mensual,
      sum(greatest(m.total_vendido_12m, 0)) OVER (
        ORDER BY greatest(m.total_vendido_12m, 0) DESC, m.producto_codigo
      ) AS acumulado_vendido,
      sum(greatest(m.total_vendido_12m, 0)) OVER () AS total_vendido_marca
    FROM metricas m
    JOIN estadistica_mensual e ON e.producto_codigo = m.producto_codigo
  ),
  clasificaciones AS MATERIALIZED (
    SELECT
      b.*,
      CASE
        WHEN b.total_vendido_marca <= 0 THEN 'C'
        WHEN b.acumulado_vendido / b.total_vendido_marca <= v_modelo.abc_limite_a THEN 'A'
        WHEN b.acumulado_vendido / b.total_vendido_marca <= v_modelo.abc_limite_b THEN 'B'
        ELSE 'C'
      END AS abc,
      CASE
        WHEN b.pedidos_12m = 0 OR b.ultima_venta IS NULL OR (v_fecha - b.ultima_venta) > v_modelo.fsn_dias_n THEN 'N'
        WHEN b.pedidos_12m >= v_modelo.fsn_pedidos_f AND (v_fecha - b.ultima_venta) <= v_modelo.fsn_dias_f THEN 'F'
        ELSE 'S'
      END AS fsn,
      CASE
        WHEN b.media_mensual = 0 THEN 'Z'
        WHEN abs(b.desviacion_mensual / NULLIF(abs(b.media_mensual), 0)) <= v_modelo.xyz_cv_x
          AND b.meses_venta_12m >= v_modelo.xyz_meses_x THEN 'X'
        WHEN abs(b.desviacion_mensual / NULLIF(abs(b.media_mensual), 0)) > v_modelo.xyz_cv_x
          AND abs(b.desviacion_mensual / NULLIF(abs(b.media_mensual), 0)) <= v_modelo.xyz_cv_y
          AND b.meses_venta_12m BETWEEN v_modelo.xyz_meses_y_min AND v_modelo.xyz_meses_y_max THEN 'Y'
        ELSE 'Z'
      END AS xyz
    FROM base_abc b
  ),
  mezcla AS MATERIALIZED (
    SELECT
      c.*,
      p.criticidad,
      p.origen,
      p.codigo_fabricante,
      p.descripcion,
      p.familia,
      p.marca,
      coalesce(s.stock_global, 0)::numeric AS stock_global,
      CASE WHEN p.criticidad IS NULL THEN NULL ELSE c.abc || c.fsn || c.xyz || p.criticidad END AS codigo_mix,
      CASE
        WHEN p.criticidad IS NULL THEN 'PENDIENTE CRITICIDAD'
        ELSE coalesce(r.segmento, 'SIN REGLA')
      END AS segmento_base
    FROM clasificaciones c
    JOIN productos_base p ON p.codigo_interno = c.producto_codigo
    LEFT JOIN stock_global s ON s.producto_codigo = c.producto_codigo
    LEFT JOIN public.repuestos_modelo_reglas_mix r
      ON r.modelo_version_id = v_modelo.id
      AND r.codigo_mix = c.abc || c.fsn || c.xyz || p.criticidad
  ),
  segmentos AS MATERIALIZED (
    SELECT
      m.*,
      CASE
        WHEN m.criticidad IS NULL THEN 'PENDIENTE CRITICIDAD'
        WHEN m.segmento_base = 'SERVICIO ECONOMICO' AND m.pedidos_12m < 2 THEN 'BAJO PEDIDO'
        WHEN m.segmento_base = 'SERVICIO ECONOMICO'
          AND m.fsn = 'F' AND m.pedidos_12m >= 10 AND m.meses_venta_12m >= 8
          THEN CASE WHEN m.xyz = 'Z' THEN 'SERVICIO ECONOMICO' ELSE 'FLUJO ESTABLE' END
        WHEN m.segmento_base = 'SERVICIO ECONOMICO'
          AND m.unidades_12m >= 50 AND m.pedidos_12m >= 3 AND m.meses_venta_12m >= 3
          THEN 'DEMANDA VOLATIL'
        ELSE m.segmento_base
      END AS segmento
    FROM mezcla m
  ),
  con_politica AS MATERIALIZED (
    SELECT
      s.*,
      coalesce(pol.revision_meses, 0) AS revision_meses,
      coalesce(pol.valor_z, 0)::numeric AS valor_z,
      (v_modelo.lead_time_meses + coalesce(pol.revision_meses, 0))::integer AS horizonte_meses,
      (
        v_modelo.peso_reciente * (s.unidades_12m / 12.0)
        + v_modelo.peso_anterior * ((s.unidades_24m - s.unidades_12m) / 12.0)
      )::numeric AS demanda_ponderada_mensual,
      CASE
        WHEN s.pedidos_12m > 0 AND s.unidades_12m <> 0
          THEN s.max_linea_12m / greatest(1, abs(s.unidades_12m) / s.pedidos_12m)
        ELSE 1
      END::numeric AS factor_pico
    FROM segmentos s
    LEFT JOIN public.repuestos_modelo_segmentos pol
      ON pol.modelo_version_id = v_modelo.id AND pol.segmento = s.segmento
  ),
  demanda_modelo AS MATERIALIZED (
    SELECT
      c.*,
      greatest(0, c.demanda_ponderada_mensual * c.horizonte_meses)::numeric AS demanda_horizonte_base,
      abs(c.desviacion_mensual * sqrt(greatest(c.horizonte_meses, 0)))::numeric AS desviacion_horizonte
    FROM con_politica c
  ),
  demanda_ajustada AS MATERIALIZED (
    SELECT
      d.*,
      CASE
        WHEN d.criticidad IS NULL OR d.segmento IN ('BAJO PEDIDO', 'SIN REGLA', 'PENDIENTE CRITICIDAD') THEN 0
        WHEN d.pedidos_24m <= 2 AND d.meses_venta_24m <= 2 AND d.xyz = 'Z' AND d.fsn <> 'F' AND d.abc <> 'A'
          THEN least(d.demanda_horizonte_base, greatest(d.unidades_24m, 0) / 4.0)
        WHEN d.factor_pico >= 3 AND d.xyz = 'Z' AND d.fsn <> 'F' AND d.abc <> 'A'
          THEN least(d.demanda_horizonte_base, greatest(d.unidades_24m, 0) / 6.0)
        WHEN d.criticidad = 'V' AND d.demanda_horizonte_base > 0 AND d.demanda_horizonte_base < 1 THEN 1
        ELSE d.demanda_horizonte_base
      END::numeric AS demanda_horizonte
    FROM demanda_modelo d
  ),
  dispersion AS MATERIALIZED (
    SELECT
      d.*,
      CASE
        WHEN d.demanda_horizonte <= 0 THEN 0
        WHEN d.desviacion_horizonte <= 0 THEN greatest(1, sqrt(d.demanda_horizonte))
        ELSE d.desviacion_horizonte
      END::numeric AS desviacion_final
    FROM demanda_ajustada d
  ),
  seguridad AS MATERIALIZED (
    SELECT
      d.*,
      CASE
        WHEN d.criticidad IS NULL OR d.segmento IN ('BAJO PEDIDO', 'SIN REGLA', 'PENDIENTE CRITICIDAD') THEN 0
        WHEN d.segmento = 'SERVICIO ECONOMICO'
          THEN least(d.valor_z * d.desviacion_final, d.demanda_horizonte)
        WHEN d.segmento = 'DEMANDA VOLATIL' AND d.fsn = 'S' AND d.pedidos_24m <= 3
          THEN least(d.valor_z * d.desviacion_final, d.demanda_horizonte + 2)
        WHEN d.segmento = 'CRITICO ESTRATEGICO' AND d.pedidos_24m <= 3
          THEN greatest(1, least(d.valor_z * d.desviacion_final, greatest(d.unidades_24m, 0) / 2.0))
        ELSE d.valor_z * d.desviacion_final
      END::numeric AS stock_seguridad
    FROM dispersion d
  ),
  objetivos AS MATERIALIZED (
    SELECT
      s.*,
      CASE
        WHEN s.criticidad IS NULL OR s.segmento IN ('BAJO PEDIDO', 'SIN REGLA', 'PENDIENTE CRITICIDAD') THEN 0
        WHEN s.segmento = 'SERVICIO ECONOMICO'
          THEN least(s.demanda_horizonte + s.stock_seguridad, greatest(0, 0.8 * s.unidades_12m))
        WHEN s.criticidad = 'V' AND s.fsn = 'F' AND s.unidades_12m >= 800
          THEN greatest(s.demanda_horizonte + s.stock_seguridad, greatest(s.unidades_24m, 0) / 3.0)
        ELSE s.demanda_horizonte + s.stock_seguridad
      END::numeric AS stock_objetivo
    FROM seguridad s
  ),
  finales AS MATERIALIZED (
    SELECT
      o.*,
      (o.stock_objetivo - o.stock_global)::numeric AS necesidad_neta,
      CASE
        WHEN o.criticidad IS NULL OR o.segmento IN ('BAJO PEDIDO', 'SIN REGLA', 'PENDIENTE CRITICIDAD') THEN 0
        WHEN o.criticidad = 'V' AND o.pedidos_24m > 0 AND o.stock_objetivo > o.stock_global
          THEN greatest(1, ceil(o.stock_objetivo - o.stock_global)::integer)
        WHEN o.unidades_12m <= 0 OR o.pedidos_12m <= 1 THEN 0
        ELSE greatest(0, ceil(o.stock_objetivo - o.stock_global)::integer)
      END AS sugerencia_unidades
    FROM objetivos o
  )
  INSERT INTO public.repuestos_corrida_resultados (
    corrida_id, producto_codigo, codigo_fabricante, descripcion, familia, marca,
    criticidad, origen, estado_datos, stock_global, unidades_12m, unidades_24m,
    total_vendido_12m, total_vendido_24m, pedidos_12m, pedidos_24m,
    meses_venta_12m, media_mensual_12m, desviacion_mensual_12m,
    coeficiente_variacion, ultima_venta, dias_ultima_venta, abc, fsn, xyz, ved,
    codigo_mix, segmento, horizonte_meses, demanda_ponderada_mensual,
    demanda_horizonte, stock_seguridad, stock_objetivo, necesidad_neta,
    sugerencia_unidades, explicacion
  )
  SELECT
    v_corrida_id,
    f.producto_codigo,
    f.codigo_fabricante,
    f.descripcion,
    f.familia,
    f.marca,
    f.criticidad,
    f.origen,
    CASE
      WHEN f.criticidad IS NULL THEN 'PENDIENTE_CRITICIDAD'
      WHEN f.segmento = 'SIN REGLA' THEN 'SIN_REGLA_SEGMENTO'
      WHEN f.unidades_24m = 0 THEN 'SIN_VENTAS_24M'
      ELSE 'LISTO'
    END,
    f.stock_global,
    f.unidades_12m,
    f.unidades_24m,
    f.total_vendido_12m,
    f.total_vendido_24m,
    f.pedidos_12m,
    f.pedidos_24m,
    f.meses_venta_12m,
    f.media_mensual,
    f.desviacion_mensual,
    CASE WHEN f.media_mensual = 0 THEN 0 ELSE abs(f.desviacion_mensual / f.media_mensual) END,
    f.ultima_venta,
    CASE WHEN f.ultima_venta IS NULL THEN NULL ELSE v_fecha - f.ultima_venta END,
    f.abc,
    f.fsn,
    f.xyz,
    f.criticidad,
    f.codigo_mix,
    f.segmento,
    f.horizonte_meses,
    f.demanda_ponderada_mensual,
    f.demanda_horizonte,
    f.stock_seguridad,
    f.stock_objetivo,
    f.necesidad_neta,
    f.sugerencia_unidades,
    jsonb_build_object(
      'formula', 'Historico > ABC-FSN-XYZ-VED > horizonte > seguridad > stock global > sugerencia entera',
      'transito', 0,
      'peso_reciente', v_modelo.peso_reciente,
      'peso_anterior', v_modelo.peso_anterior,
      'factor_pico', f.factor_pico,
      'valor_z', f.valor_z,
      'revision_meses', f.revision_meses,
      'motivo', CASE
        WHEN f.criticidad IS NULL THEN 'Falta asignar criticidad'
        WHEN f.segmento = 'BAJO PEDIDO' THEN 'Segmento bajo pedido'
        WHEN f.unidades_12m <= 0 THEN 'Sin ventas en los ultimos 12 meses'
        WHEN f.pedidos_12m <= 1 AND f.criticidad <> 'V' THEN 'Frecuencia insuficiente'
        WHEN f.sugerencia_unidades > 0 THEN 'Stock global por debajo del objetivo'
        ELSE 'Stock global suficiente'
      END
    )
  FROM finales f;

  UPDATE public.repuestos_corridas c
  SET
    estado = 'completada',
    total_piezas = r.total_piezas,
    piezas_sugeridas = r.piezas_sugeridas,
    unidades_sugeridas = r.unidades_sugeridas,
    pendientes_criticidad = r.pendientes_criticidad,
    piezas_sin_ventas = r.piezas_sin_ventas,
    completado_en = now()
  FROM (
    SELECT
      count(*)::integer AS total_piezas,
      count(*) FILTER (WHERE sugerencia_unidades > 0)::integer AS piezas_sugeridas,
      coalesce(sum(sugerencia_unidades), 0)::numeric AS unidades_sugeridas,
      count(*) FILTER (WHERE estado_datos = 'PENDIENTE_CRITICIDAD')::integer AS pendientes_criticidad,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_24M')::integer AS piezas_sin_ventas
    FROM public.repuestos_corrida_resultados
    WHERE corrida_id = v_corrida_id
  ) r
  WHERE c.id = v_corrida_id;

  RETURN v_corrida_id;
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_asignar_criticidad(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_crear_version_modelo(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repuestos_ejecutar_sugerencia(text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_asignar_criticidad(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_crear_version_modelo(text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repuestos_ejecutar_sugerencia(text, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
