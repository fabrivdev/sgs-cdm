-- La criticidad faltante deja de bloquear el calculo.
-- El motor propone V/E/D por familia y, si no hay evidencia suficiente,
-- mediante una heuristica conservadora. Toda propuesta automatica queda
-- marcada para revision y puede ser reemplazada manualmente.

ALTER TABLE public.repuestos_articulo_planificacion
  ADD COLUMN IF NOT EXISTS criticidad_fuente text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS criticidad_confianza numeric NOT NULL DEFAULT 1;

ALTER TABLE public.repuestos_articulo_planificacion
  DROP CONSTRAINT IF EXISTS repuestos_articulo_planificacion_criticidad_fuente_check;
ALTER TABLE public.repuestos_articulo_planificacion
  ADD CONSTRAINT repuestos_articulo_planificacion_criticidad_fuente_check
  CHECK (criticidad_fuente IN ('MANUAL', 'IMPORTADA', 'AUTOMATICA_FAMILIA', 'AUTOMATICA_HEURISTICA'));

ALTER TABLE public.repuestos_articulo_planificacion
  DROP CONSTRAINT IF EXISTS repuestos_articulo_planificacion_criticidad_confianza_check;
ALTER TABLE public.repuestos_articulo_planificacion
  ADD CONSTRAINT repuestos_articulo_planificacion_criticidad_confianza_check
  CHECK (criticidad_confianza BETWEEN 0 AND 1);

ALTER TABLE public.repuestos_corrida_resultados
  ADD COLUMN IF NOT EXISTS criticidad_fuente text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS criticidad_confianza numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS criticidad_revisar boolean NOT NULL DEFAULT false;

UPDATE public.repuestos_articulo_planificacion
SET criticidad_fuente = 'IMPORTADA', criticidad_confianza = 1
WHERE observaciones = 'Criticidad importada desde libro de segmentacion';

-- Completa cualquier combinacion ABC-FSN-XYZ-VED que no estaba en los libros.
-- Las reglas originales tienen prioridad y no se reemplazan.
INSERT INTO public.repuestos_modelo_reglas_mix (modelo_version_id, codigo_mix, segmento)
SELECT
  m.id,
  abc.valor || fsn.valor || xyz.valor || ved.valor,
  CASE
    WHEN ved.valor = 'V' THEN 'CRITICO ESTRATEGICO'
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
CROSS JOIN (VALUES ('V'), ('E'), ('D')) AS ved(valor)
ON CONFLICT (modelo_version_id, codigo_mix) DO NOTHING;

CREATE OR REPLACE FUNCTION public.repuestos_preparar_criticidades_automaticas(p_marca text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aplicadas integer := 0;
BEGIN
  IF upper(trim(p_marca)) NOT IN ('CLAAS', 'HORSCH') THEN
    RAISE EXCEPTION 'Marca invalida';
  END IF;

  WITH
  evidencia AS MATERIALIZED (
    SELECT
      p.familia,
      ap.criticidad,
      count(*)::integer AS cantidad
    FROM public.productos p
    JOIN public.repuestos_articulo_planificacion ap
      ON ap.producto_codigo = p.codigo_interno
    WHERE p.activo
      AND p.marca::text = upper(trim(p_marca))
      AND p.familia IS NOT NULL
      AND ap.criticidad IS NOT NULL
      AND ap.criticidad_fuente IN ('MANUAL', 'IMPORTADA')
    GROUP BY p.familia, ap.criticidad
  ),
  familias AS MATERIALIZED (
    SELECT
      e.*,
      sum(e.cantidad) OVER (PARTITION BY e.familia)::integer AS total_familia,
      row_number() OVER (
        PARTITION BY e.familia
        ORDER BY e.cantidad DESC,
          CASE e.criticidad WHEN 'V' THEN 1 WHEN 'E' THEN 2 ELSE 3 END
      ) AS posicion
    FROM evidencia e
  ),
  propuestas AS MATERIALIZED (
    SELECT
      p.codigo_interno AS producto_codigo,
      CASE
        WHEN f.total_familia >= 3 THEN f.criticidad
        WHEN upper(coalesce(p.familia, '') || ' ' || p.descripcion) ~
          '(FRENO|DIRECCION|HIDRAUL|ELECTR|SENSOR|VALVULA|BOMBA|MOTOR|EMBRAGUE|TRANSMISION|RODAMIENT)'
          THEN 'E'
        ELSE 'D'
      END AS criticidad,
      CASE
        WHEN f.total_familia >= 3 THEN 'AUTOMATICA_FAMILIA'
        ELSE 'AUTOMATICA_HEURISTICA'
      END AS fuente,
      CASE
        WHEN f.total_familia >= 3 THEN least(
          0.90,
          greatest(0.55, (f.cantidad::numeric / NULLIF(f.total_familia, 0)))
        )
        ELSE 0.40
      END AS confianza,
      CASE
        WHEN f.total_familia >= 3 THEN
          'Sugerida por la criticidad predominante de ' || f.total_familia || ' piezas de la familia'
        ELSE 'Sugerida por familia y descripcion; requiere revision manual'
      END AS observaciones
    FROM public.productos p
    LEFT JOIN familias f ON f.familia = p.familia AND f.posicion = 1
    LEFT JOIN public.repuestos_articulo_planificacion ap
      ON ap.producto_codigo = p.codigo_interno
    WHERE p.activo
      AND p.codigo_interno ILIKE 'REP%'
      AND p.marca::text = upper(trim(p_marca))
      AND (ap.producto_codigo IS NULL OR ap.criticidad IS NULL OR ap.criticidad_fuente LIKE 'AUTOMATICA_%')
  ),
  guardadas AS (
    INSERT INTO public.repuestos_articulo_planificacion (
      producto_codigo, criticidad, origen, observaciones,
      criticidad_fuente, criticidad_confianza, actualizado_por
    )
    SELECT
      producto_codigo, criticidad, 'ALEMANIA', observaciones,
      fuente, confianza, auth.uid()
    FROM propuestas
    ON CONFLICT (producto_codigo) DO UPDATE SET
      criticidad = EXCLUDED.criticidad,
      origen = coalesce(NULLIF(public.repuestos_articulo_planificacion.origen, ''), 'ALEMANIA'),
      observaciones = EXCLUDED.observaciones,
      criticidad_fuente = EXCLUDED.criticidad_fuente,
      criticidad_confianza = EXCLUDED.criticidad_confianza,
      actualizado_por = auth.uid(),
      actualizado_en = now()
    WHERE public.repuestos_articulo_planificacion.criticidad IS NULL
       OR public.repuestos_articulo_planificacion.criticidad_fuente LIKE 'AUTOMATICA_%'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_aplicadas FROM guardadas;

  RETURN jsonb_build_object('aplicadas', v_aplicadas);
END;
$$;

REVOKE ALL ON FUNCTION public.repuestos_preparar_criticidades_automaticas(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.repuestos_preparar_criticidades_corrida_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.repuestos_preparar_criticidades_automaticas(NEW.marca::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_preparar_criticidades_corrida_trigger
  ON public.repuestos_corridas;
CREATE TRIGGER repuestos_preparar_criticidades_corrida_trigger
BEFORE INSERT ON public.repuestos_corridas
FOR EACH ROW EXECUTE FUNCTION public.repuestos_preparar_criticidades_corrida_trigger();

CREATE OR REPLACE FUNCTION public.repuestos_resultado_criticidad_snapshot_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fuente text;
  v_confianza numeric;
BEGIN
  SELECT criticidad_fuente, criticidad_confianza
  INTO v_fuente, v_confianza
  FROM public.repuestos_articulo_planificacion
  WHERE producto_codigo = NEW.producto_codigo;

  NEW.criticidad_fuente := coalesce(v_fuente, 'AUTOMATICA_HEURISTICA');
  NEW.criticidad_confianza := coalesce(v_confianza, 0.40);
  NEW.criticidad_revisar := NEW.criticidad_fuente LIKE 'AUTOMATICA_%';
  NEW.explicacion := coalesce(NEW.explicacion, '{}'::jsonb) || jsonb_build_object(
    'criticidad_fuente', NEW.criticidad_fuente,
    'criticidad_confianza', NEW.criticidad_confianza,
    'criticidad_revisar', NEW.criticidad_revisar
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_resultado_criticidad_snapshot_trigger
  ON public.repuestos_corrida_resultados;
CREATE TRIGGER repuestos_resultado_criticidad_snapshot_trigger
BEFORE INSERT ON public.repuestos_corrida_resultados
FOR EACH ROW EXECUTE FUNCTION public.repuestos_resultado_criticidad_snapshot_trigger();

CREATE OR REPLACE FUNCTION public.repuestos_corrida_revision_count_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'completada' THEN
    SELECT count(*)::integer
    INTO NEW.pendientes_criticidad
    FROM public.repuestos_corrida_resultados
    WHERE corrida_id = NEW.id AND criticidad_revisar;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_corrida_revision_count_trigger
  ON public.repuestos_corridas;
CREATE TRIGGER repuestos_corrida_revision_count_trigger
BEFORE UPDATE ON public.repuestos_corridas
FOR EACH ROW EXECUTE FUNCTION public.repuestos_corrida_revision_count_trigger();

CREATE OR REPLACE FUNCTION public.repuestos_marcar_fuente_importada_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.observaciones = 'Criticidad importada desde libro de segmentacion' THEN
    NEW.criticidad_fuente := 'IMPORTADA';
    NEW.criticidad_confianza := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repuestos_marcar_fuente_importada_trigger
  ON public.repuestos_articulo_planificacion;
CREATE TRIGGER repuestos_marcar_fuente_importada_trigger
BEFORE INSERT OR UPDATE ON public.repuestos_articulo_planificacion
FOR EACH ROW EXECUTE FUNCTION public.repuestos_marcar_fuente_importada_trigger();

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
    producto_codigo, criticidad, origen, observaciones, actualizado_por,
    criticidad_fuente, criticidad_confianza
  ) VALUES (
    p_producto_codigo,
    NULLIF(upper(trim(coalesce(p_criticidad, ''))), ''),
    upper(trim(coalesce(NULLIF(p_origen, ''), 'ALEMANIA'))),
    NULLIF(trim(coalesce(p_observaciones, '')), ''),
    auth.uid(),
    'MANUAL',
    1
  )
  ON CONFLICT (producto_codigo) DO UPDATE SET
    criticidad = EXCLUDED.criticidad,
    origen = EXCLUDED.origen,
    observaciones = EXCLUDED.observaciones,
    actualizado_por = auth.uid(),
    criticidad_fuente = 'MANUAL',
    criticidad_confianza = 1,
    actualizado_en = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.repuestos_asignar_criticidad(text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
