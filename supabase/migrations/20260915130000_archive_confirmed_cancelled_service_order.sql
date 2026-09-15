BEGIN;

-- Caso confirmado por el usuario: OS y factura anuladas, ausentes de ambos
-- archivos vigentes. NO deduce anulación por ausencia para otras OS.
-- Requiere el archivo auditable de 20260911190000_reconcile_service_order_snapshot.sql.
-- Conserva OS, jornadas y filas originales de factura antes de retirar/excluir.
LOCK TABLE public.ordenes_servicio_importadas,
  public.facturacion_lineas_importadas, public.facturacion,
  public.comisiones_jornadas, public.comisiones_liquidacion_detalle,
  public.trabajos IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_os public.ordenes_servicio_importadas%ROWTYPE;
  v_lineas uuid[];
  v_resumen uuid[];
  v_jornadas jsonb;
  v_lineas_copia jsonb;
  v_resumen_copia jsonb;
BEGIN
  IF (SELECT count(*) FROM public.ordenes_servicio_importadas
    WHERE upper(btrim(os_numero))='05-00000002')>1 THEN
    RAISE EXCEPTION 'Hay más de un registro para la clave de OS anulada; no se modificó nada.';
  END IF;
  SELECT * INTO v_os FROM public.ordenes_servicio_importadas
  WHERE upper(btrim(os_numero))='05-00000002';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.ordenes_servicio_importadas_archivo
      WHERE os_numero='05-00000002'
        AND registro->'anulacion_confirmada'->>'factura'='0050010001425') THEN
      RAISE NOTICE 'La OS 05-00000002 ya fue archivada por esta anulación.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'No se encontró la OS 05-00000002 ni su archivo de anulación; no se modificó nada.';
  END IF;

  IF regexp_replace(upper(coalesce(v_os.nro_chasis,'')),'[^A-Z0-9]','','g')<>'000085'
    OR regexp_replace(upper(coalesce(v_os.cliente_nombre,'')),'[^A-Z0-9]','','g')<>'BUENFUTUROSA'
    OR regexp_replace(coalesce(v_os.factura,''),'[^0-9]','','g')<>'0050010001425'
    OR v_os.raw_data->>'import_era' IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'Cambió la identidad de la OS anulada (cliente, chasis, factura u origen); no se modificó nada.';
  END IF;
  IF v_os.trabajo_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.trabajos WHERE upper(btrim(os_numero))='05-00000002'
  ) THEN
    RAISE EXCEPTION 'La OS ahora tiene un trabajo vinculado; requiere revisión manual, no se modificó nada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.comisiones_jornadas j
    JOIN public.comisiones_liquidacion_detalle d ON d.jornada_id=j.id
    WHERE upper(btrim(j.os_numero))='05-00000002'
  ) THEN
    RAISE EXCEPTION 'La OS ahora tiene comisión liquidada; no se altera el pago ni se modifica nada.';
  END IF;

  SELECT coalesce(array_agg(f.id),'{}'::uuid[]),coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb)
  INTO v_lineas,v_lineas_copia FROM public.facturacion_lineas_importadas f
  WHERE regexp_replace(coalesce(nullif(btrim(f.factura),''),f.codigo_interno_factura,''),'[^0-9]','','g')='0050010001425'
    OR upper(btrim(f.raw_data->>'linked_service_order'))='05-00000002';
  IF EXISTS (
    SELECT 1 FROM public.facturacion_lineas_importadas f WHERE f.id=ANY(v_lineas)
      AND (regexp_replace(upper(coalesce(f.entidad_nombre,'')),'[^A-Z0-9]','','g')<>'BUENFUTUROSA'
        OR regexp_replace(coalesce(nullif(btrim(f.factura),''),f.codigo_interno_factura,''),'[^0-9]','','g')<>'0050010001425'
        OR f.fecha_factura IS NULL OR f.fecha_factura::date<date '2026-07-01'
        OR (nullif(btrim(f.raw_data->>'linked_service_order'),'') IS NOT NULL
          AND upper(btrim(f.raw_data->>'linked_service_order'))<>'05-00000002'))
  ) THEN
    RAISE EXCEPTION 'Las líneas de factura tienen otra identidad, fecha u OS; no se modificó nada.';
  END IF;

  SELECT coalesce(array_agg(f.id),'{}'::uuid[]),coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb)
  INTO v_resumen,v_resumen_copia FROM public.facturacion f
  WHERE regexp_replace(coalesce(f.cod_factura,''),'[^0-9]','','g')='0050010001425';
  IF EXISTS (
    SELECT 1 FROM public.facturacion f WHERE f.id=ANY(v_resumen)
      AND (regexp_replace(upper(coalesce(f.entidad_nombre,'')),'[^A-Z0-9]','','g')<>'BUENFUTUROSA'
        OR f.fecha IS NULL OR f.fecha::date<date '2026-07-01')
  ) THEN
    RAISE EXCEPTION 'El resumen de factura corresponde a otro cliente o período; no se modificó nada.';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) INTO v_jornadas
  FROM public.comisiones_jornadas j WHERE upper(btrim(j.os_numero))='05-00000002';

  INSERT INTO public.ordenes_servicio_importadas_archivo(os_numero,registro,motivo,archivado_por)
  VALUES(v_os.os_numero,to_jsonb(v_os)||jsonb_build_object('anulacion_confirmada',jsonb_build_object(
    'factura','0050010001425','confirmacion','Usuario confirmó anulación y ausencia en archivos vigentes de OS y ventas',
    'jornadas_originales',v_jornadas,'facturacion_lineas_originales',v_lineas_copia,
    'facturacion_resumen_original',v_resumen_copia)),
    'Anulación confirmada: OS 05-00000002 / factura 0050010001425 / BUEN FUTURO S.A. / chasis 000085',NULL);

  UPDATE public.comisiones_jornadas SET vigente=false,estado_validacion='INVALIDA',
    motivos_validacion=array_append(coalesce(motivos_validacion,'{}'::text[]),'OS y factura anuladas: confirmación manual'),
    actualizado_en=now()
  WHERE upper(btrim(os_numero))='05-00000002';
  UPDATE public.facturacion SET excluido_de_reportes=true WHERE id=ANY(v_resumen);
  -- Esta tabla no tiene una exclusión compartida por todos los lectores: se
  -- retiran las líneas operativas una vez copiadas íntegramente en el archivo.
  DELETE FROM public.facturacion_lineas_importadas WHERE id=ANY(v_lineas);
  DELETE FROM public.ordenes_servicio_importadas WHERE os_numero=v_os.os_numero;
  RAISE NOTICE 'OS archivada; % líneas de factura retiradas y % filas resumen excluidas.',
    cardinality(v_lineas),cardinality(v_resumen);
END;
$$;

COMMIT;

-- Verificación de sólo lectura. Debe devolver 0, 0, 0 y al menos 1 archivo.
SELECT
  (SELECT count(*) FROM public.ordenes_servicio_importadas WHERE upper(btrim(os_numero))='05-00000002') AS os_operativas,
  (SELECT count(*) FROM public.comisiones_jornadas WHERE upper(btrim(os_numero))='05-00000002' AND vigente) AS jornadas_vigentes,
  (SELECT count(*) FROM public.facturacion_lineas_importadas WHERE regexp_replace(coalesce(nullif(btrim(factura),''),codigo_interno_factura,''),'[^0-9]','','g')='0050010001425') AS lineas_factura_operativas,
  (SELECT count(*) FROM public.ordenes_servicio_importadas_archivo WHERE os_numero='05-00000002' AND registro->'anulacion_confirmada'->>'factura'='0050010001425') AS copias_archivadas;
