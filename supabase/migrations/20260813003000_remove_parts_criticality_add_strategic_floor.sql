-- Motor v2: ABC-FSN-XYZ sin criticidad VED.
-- Las columnas historicas de criticidad se conservan para poder consultar
-- corridas anteriores, pero dejan de intervenir en clasificacion y calculo.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos'
      AND column_name = 'incorporado_en'
  ) THEN
    ALTER TABLE public.productos
      ADD COLUMN incorporado_en timestamptz NOT NULL DEFAULT now();

    -- Todo lo que ya estaba en el maestro al instalar esta version constituye
    -- la base historica. Los insertados luego conservaran el valor now().
    UPDATE public.productos
    SET incorporado_en = least(actualizado_en, now() - interval '12 months');
  END IF;
END;
$migration$;

ALTER TABLE public.repuestos_articulo_planificacion
  ADD COLUMN IF NOT EXISTS stock_minimo_estrategico numeric NOT NULL DEFAULT 0;

ALTER TABLE public.repuestos_articulo_planificacion
  DROP CONSTRAINT IF EXISTS repuestos_articulo_planificacion_stock_minimo_check;
ALTER TABLE public.repuestos_articulo_planificacion
  ADD CONSTRAINT repuestos_articulo_planificacion_stock_minimo_check
  CHECK (stock_minimo_estrategico >= 0);

ALTER TABLE public.repuestos_corrida_resultados
  ADD COLUMN IF NOT EXISTS stock_minimo_estrategico numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incorporado_en timestamptz;

ALTER TABLE public.repuestos_corridas
  ADD COLUMN IF NOT EXISTS piezas_nuevas_sin_historial integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS piezas_sin_ventas_recientes integer NOT NULL DEFAULT 0;

-- Elimina el proceso automatico V/E/D. La E solo queda como valor neutro de
-- compatibilidad porque la funcion v1 todavia inserta las columnas heredadas.
DROP TRIGGER IF EXISTS repuestos_preparar_criticidades_corrida_trigger
  ON public.repuestos_corridas;

CREATE OR REPLACE FUNCTION public.repuestos_preparar_planificacion_neutral(p_marca text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.repuestos_articulo_planificacion (
    producto_codigo, criticidad, origen, stock_minimo_estrategico,
    criticidad_fuente, criticidad_confianza, actualizado_por
  )
  SELECT
    p.codigo_interno, 'E', 'ALEMANIA', 0, 'MANUAL', 1, auth.uid()
  FROM public.productos p
  WHERE p.activo
    AND p.codigo_interno ILIKE 'REP%'
    AND p.marca::text = upper(trim(p_marca))
  ON CONFLICT (producto_codigo) DO UPDATE SET
    criticidad = 'E',
    criticidad_fuente = 'MANUAL',
    criticidad_confianza = 1,
    actualizado_en = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_preparar_planificacion_corrida_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.repuestos_preparar_planificacion_neutral(NEW.marca::text);
  NEW.parametros_snapshot := coalesce(NEW.parametros_snapshot, '{}'::jsonb) || jsonb_build_object(
    'motor', 'v2_abc_fsn_xyz',
    'codigo_nuevo_meses', 6,
    'usa_criticidad', false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_preparar_planificacion_corrida_trigger
  ON public.repuestos_corridas;
CREATE TRIGGER repuestos_preparar_planificacion_corrida_trigger
BEFORE INSERT ON public.repuestos_corridas
FOR EACH ROW EXECUTE FUNCTION public.repuestos_preparar_planificacion_corrida_trigger();

-- Las 27 combinaciones se resuelven solo con ABC-FSN-XYZ. Se almacenan con
-- una E final por compatibilidad con la funcion de calculo v1.
INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
SELECT
  m.id,
  abc.valor || fsn.valor || xyz.valor || 'E',
  CASE
    WHEN fsn.valor = 'N' THEN 'BAJO PEDIDO'
    WHEN abc.valor = 'A' AND fsn.valor = 'F' AND xyz.valor IN ('X', 'Y') THEN 'ESTRELLA'
    WHEN xyz.valor = 'Z' OR abc.valor IN ('A', 'B') THEN 'DEMANDA VOLATIL'
    WHEN abc.valor = 'C' AND fsn.valor = 'F' AND xyz.valor IN ('X', 'Y') THEN 'FLUJO ESTABLE'
    ELSE 'SERVICIO ECONOMICO'
  END
FROM public.repuestos_modelo_versiones m
CROSS JOIN (VALUES ('A'), ('B'), ('C')) AS abc(valor)
CROSS JOIN (VALUES ('F'), ('S'), ('N')) AS fsn(valor)
CROSS JOIN (VALUES ('X'), ('Y'), ('Z')) AS xyz(valor)
ON CONFLICT (modelo_version_id, codigo_mix) DO UPDATE
SET segmento = EXCLUDED.segmento;

DROP TRIGGER IF EXISTS repuestos_resultado_criticidad_snapshot_trigger
  ON public.repuestos_corrida_resultados;

CREATE OR REPLACE FUNCTION public.repuestos_resultado_motor_v2_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_minimo numeric := 0;
  v_incorporado_en timestamptz;
  v_fecha_analisis date;
  v_objetivo_motor numeric;
BEGIN
  SELECT
    coalesce(ap.stock_minimo_estrategico, 0),
    p.incorporado_en,
    c.fecha_analisis
  INTO v_stock_minimo, v_incorporado_en, v_fecha_analisis
  FROM public.productos p
  JOIN public.repuestos_corridas c ON c.id = NEW.corrida_id
  LEFT JOIN public.repuestos_articulo_planificacion ap
    ON ap.producto_codigo = p.codigo_interno
  WHERE p.codigo_interno = NEW.producto_codigo;

  v_objetivo_motor := NEW.stock_objetivo;
  NEW.stock_minimo_estrategico := v_stock_minimo;
  NEW.incorporado_en := v_incorporado_en;
  NEW.stock_objetivo := greatest(NEW.stock_objetivo, v_stock_minimo);
  NEW.necesidad_neta := NEW.stock_objetivo - NEW.stock_global;

  IF v_stock_minimo > NEW.stock_global THEN
    NEW.sugerencia_unidades := greatest(
      NEW.sugerencia_unidades,
      ceil(v_stock_minimo - NEW.stock_global)::integer
    );
  END IF;

  NEW.estado_datos := CASE
    WHEN NEW.unidades_24m > 0 THEN 'LISTO'
    WHEN v_incorporado_en >= (v_fecha_analisis::timestamp - interval '6 months')
      THEN 'CODIGO_NUEVO_SIN_HISTORIAL'
    ELSE 'SIN_VENTAS_RECIENTES'
  END;

  -- Se limpian los campos VED del snapshot nuevo; los valores viejos siguen
  -- disponibles en las corridas historicas.
  NEW.criticidad := NULL;
  NEW.ved := NULL;
  NEW.codigo_mix := NEW.abc || NEW.fsn || NEW.xyz;
  NEW.criticidad_revisar := false;
  NEW.criticidad_confianza := 1;
  NEW.explicacion := coalesce(NEW.explicacion, '{}'::jsonb) || jsonb_build_object(
    'formula', 'Historico > ABC-FSN-XYZ > horizonte > seguridad > minimo estrategico > stock global > sugerencia entera',
    'clasificacion', NEW.abc || NEW.fsn || NEW.xyz,
    'stock_minimo_estrategico', v_stock_minimo,
    'objetivo_sin_minimo_estrategico', v_objetivo_motor,
    'estado_historial', NEW.estado_datos,
    'motivo', CASE
      WHEN NEW.estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL' THEN 'Codigo nuevo sin historial suficiente'
      WHEN NEW.estado_datos = 'SIN_VENTAS_RECIENTES' THEN 'Codigo anterior sin ventas en los ultimos 24 meses'
      WHEN v_stock_minimo > v_objetivo_motor THEN 'Objetivo elevado por stock minimo estrategico'
      WHEN NEW.sugerencia_unidades > 0 THEN 'Stock global por debajo del objetivo'
      ELSE 'Stock global suficiente'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_resultado_motor_v2_trigger
  ON public.repuestos_corrida_resultados;
CREATE TRIGGER repuestos_resultado_motor_v2_trigger
BEFORE INSERT ON public.repuestos_corrida_resultados
FOR EACH ROW EXECUTE FUNCTION public.repuestos_resultado_motor_v2_trigger();

CREATE OR REPLACE FUNCTION public.repuestos_corrida_revision_count_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'completada' THEN
    SELECT
      count(*) FILTER (WHERE estado_datos = 'CODIGO_NUEVO_SIN_HISTORIAL')::integer,
      count(*) FILTER (WHERE estado_datos = 'SIN_VENTAS_RECIENTES')::integer
    INTO NEW.piezas_nuevas_sin_historial, NEW.piezas_sin_ventas_recientes
    FROM public.repuestos_corrida_resultados
    WHERE corrida_id = NEW.id;

    NEW.pendientes_criticidad := 0;
    NEW.piezas_sin_ventas := NEW.piezas_nuevas_sin_historial + NEW.piezas_sin_ventas_recientes;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.repuestos_guardar_planificacion_articulo(
  p_producto_codigo text,
  p_stock_minimo_estrategico numeric DEFAULT 0,
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
    RAISE EXCEPTION 'No tenes permiso para editar la planificacion' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_stock_minimo_estrategico, 0) < 0 THEN
    RAISE EXCEPTION 'El stock minimo estrategico no puede ser negativo';
  END IF;

  INSERT INTO public.repuestos_articulo_planificacion (
    producto_codigo, criticidad, origen, observaciones, actualizado_por,
    criticidad_fuente, criticidad_confianza, stock_minimo_estrategico
  ) VALUES (
    p_producto_codigo,
    'E',
    upper(trim(coalesce(NULLIF(p_origen, ''), 'ALEMANIA'))),
    NULLIF(trim(coalesce(p_observaciones, '')), ''),
    auth.uid(),
    'MANUAL',
    1,
    coalesce(p_stock_minimo_estrategico, 0)
  )
  ON CONFLICT (producto_codigo) DO UPDATE SET
    criticidad = 'E',
    origen = EXCLUDED.origen,
    observaciones = EXCLUDED.observaciones,
    actualizado_por = auth.uid(),
    criticidad_fuente = 'MANUAL',
    criticidad_confianza = 1,
    stock_minimo_estrategico = EXCLUDED.stock_minimo_estrategico,
    actualizado_en = now();
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_guardar_planificacion_articulo(text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repuestos_guardar_planificacion_articulo(text, numeric, text, text) TO authenticated;

-- Las funciones antiguas quedan sin acceso desde la aplicacion. Se conservan
-- para que una reversa de frontend no falle por ausencia del objeto.
REVOKE EXECUTE ON FUNCTION public.repuestos_asignar_criticidad(text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.repuestos_preparar_criticidades_automaticas(text) FROM authenticated;

NOTIFY pgrst, 'reload schema';
