-- PREPARADA LOCALMENTE: requiere aprobación específica antes de instalar.
-- Uso secuencial: rechaza contención al adquirir locks; no espera a escritores
-- ni SELECT FOR UPDATE existentes. Dos sesiones reales no ensayadas localmente.
BEGIN;
ALTER TABLE public.maquinaria_operaciones ADD COLUMN IF NOT EXISTS anulacion jsonb;

-- Una unidad anulada conserva su chasis histórico sin reservarlo para siempre.
DROP INDEX IF EXISTS public.maquinaria_unidades_chasis_unique;
CREATE UNIQUE INDEX maquinaria_unidades_chasis_unique
ON public.maquinaria_unidades_operacion(public.normalizar_chasis_notificacion(chasis))
WHERE public.normalizar_chasis_notificacion(chasis) IS NOT NULL AND estado <> 'CANCELADA';

CREATE FUNCTION public.maquinaria_anular_pedido(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.maquinaria_operaciones%ROWTYPE; ids uuid[]; lineas uuid[]; registro jsonb;
BEGIN
  IF public.maquinaria_puede_gestionar_flujo() IS NOT TRUE
     OR public.has_section_access(auth.uid(),'parque.operaciones') IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo administración o jefatura con acceso a Operaciones pueden anular pedidos' USING ERRCODE='42501';
  END IF;
  -- EXCLUSIVE también entra en conflicto con ROW SHARE de las asignaciones
  -- que toman primero FOR UPDATE de unidad. NOWAIT evita la espera circular:
  -- si ya trabajan, esta llamada falla y revierte sin liberar nada.
  -- Permite SELECT simples; nuevos escritores esperan hasta terminar la transacción.
  LOCK TABLE public.maquinaria_operaciones, public.maquinaria_operacion_lineas,
    public.maquinaria_unidades_operacion, public.maquinaria_documentos,
    public.maquinaria_facturas_venta_unidades, public.maquinaria_importacion_lineas,
    public.maquinaria_importacion_unidades, public.parque_stock_maquinas,
    public.parque_maquinas, public.facturacion_lineas_importadas IN EXCLUSIVE MODE NOWAIT;
  SELECT * INTO o FROM public.maquinaria_operaciones WHERE id=p_operacion_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe'; END IF;
  IF o.estado='CANCELADA' THEN RETURN jsonb_build_object('anulado',true,'ya_anulado',true); END IF;
  SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO lineas FROM public.maquinaria_operacion_lineas WHERE operacion_id=o.id;
  SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO ids FROM public.maquinaria_unidades_operacion WHERE linea_id=ANY(lineas);
  IF o.estado IN ('FACTURADA','CERRADA')
    OR EXISTS(SELECT 1 FROM public.maquinaria_documentos WHERE operacion_id=o.id AND tipo='FACTURA_VENTA')
    OR EXISTS(SELECT 1 FROM public.maquinaria_facturas_venta_unidades WHERE unidad_operacion_id=ANY(ids))
    OR EXISTS(SELECT 1 FROM public.maquinaria_unidades_operacion u WHERE u.id=ANY(ids)
      AND (u.estado IN ('FACTURADA','EN_PARQUE','TRANSFERIDA') OR u.parque_maquina_id IS NOT NULL
        OR public.maquinaria_unidad_tiene_venta_confirmada(u.id)))
    OR EXISTS(SELECT 1 FROM public.maquinaria_operacion_lineas l WHERE l.id=ANY(lineas)
      AND coalesce(nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_numero'),''),
        nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_venta'),''),
        nullif(btrim(l.datos_extraidos->'historico_pedido'->>'factura_fecha'),'')) IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.maquinaria_importacion_lineas i WHERE
      (i.operacion_id=o.id OR i.linea_id=ANY(lineas) OR i.unidad_id=ANY(ids))
      AND (nullif(btrim(i.factura_venta),'') IS NOT NULL OR upper(btrim(coalesce(i.venta_facturada,''))) IN ('TRUE','SI','SÍ','1')))
  THEN RAISE EXCEPTION 'No se puede anular: hay evidencia de factura de venta o entrega. Requiere revisión comercial y contable.'; END IF;
  IF EXISTS(SELECT 1 FROM (
      SELECT operacion_id,linea_id,unidad_id FROM public.maquinaria_importacion_lineas
      UNION ALL SELECT operacion_id,linea_id,unidad_id FROM public.maquinaria_importacion_unidades
    ) r WHERE (r.operacion_id=o.id OR r.linea_id=ANY(lineas) OR r.unidad_id=ANY(ids))
      AND ((r.operacion_id IS NOT NULL AND r.operacion_id<>o.id)
        OR (r.linea_id IS NOT NULL AND NOT r.linea_id=ANY(lineas))
        OR (r.unidad_id IS NOT NULL AND NOT r.unidad_id=ANY(ids))))
  THEN RAISE EXCEPTION 'No se puede anular: hay asignaciones contradictorias. Revisar sus vínculos sin liberar reservas ajenas.'; END IF;
  registro:=jsonb_build_object('por',auth.uid(),'en',clock_timestamp(),'estado_anterior',o.estado,
    'unidades',(SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') FROM public.maquinaria_unidades_operacion u WHERE id=ANY(ids)),
    'stock',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'unidad_operacion_id',s.unidad_operacion_id)),'[]') FROM public.parque_stock_maquinas s WHERE unidad_operacion_id=ANY(ids)),
    'importacion_lineas',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'operacion_id',i.operacion_id,'linea_id',i.linea_id,'unidad_id',i.unidad_id,'situacion_vinculo',i.situacion_vinculo)),'[]') FROM public.maquinaria_importacion_lineas i WHERE operacion_id=o.id OR linea_id=ANY(lineas) OR unidad_id=ANY(ids)),
    'importacion_unidades',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'operacion_id',i.operacion_id,'linea_id',i.linea_id,'unidad_id',i.unidad_id,'situacion_vinculo',i.situacion_vinculo,'vinculo_manual',i.vinculo_manual)),'[]') FROM public.maquinaria_importacion_unidades i WHERE operacion_id=o.id OR linea_id=ANY(lineas) OR unidad_id=ANY(ids)));
  UPDATE public.parque_stock_maquinas SET unidad_operacion_id=NULL WHERE unidad_operacion_id=ANY(ids);
  UPDATE public.maquinaria_importacion_unidades SET operacion_id=NULL,linea_id=NULL,unidad_id=NULL,situacion_vinculo='SIN PEDIDO',vinculo_manual=false,actualizado_en=now()
    WHERE operacion_id=o.id OR linea_id=ANY(lineas) OR unidad_id=ANY(ids);
  UPDATE public.maquinaria_importacion_lineas SET operacion_id=NULL,linea_id=NULL,unidad_id=NULL,situacion_vinculo='SIN PEDIDO',actualizado_en=now()
    WHERE operacion_id=o.id OR linea_id=ANY(lineas) OR unidad_id=ANY(ids);
  UPDATE public.maquinaria_unidades_operacion SET estado='CANCELADA',actualizado_en=now() WHERE id=ANY(ids);
  UPDATE public.maquinaria_operaciones SET estado='CANCELADA',anulacion=registro,actualizado_en=now() WHERE id=o.id;
  RETURN jsonb_build_object('anulado',true,'ya_anulado',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'Esta solicitud no realizó la anulación: hay otra operación en curso. Revisá el estado cuando termine antes de volver a intentar.' USING ERRCODE='55P03';
END;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_anular_pedido(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.maquinaria_anular_pedido(uuid) TO authenticated;

-- Conserva la ficha anulada: una importación no puede reactivarla ni crear una
-- nueva operación con la misma NP por el índice parcial anterior.
CREATE FUNCTION public.maquinaria_proteger_pedido_anulado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' AND OLD.estado='CANCELADA' THEN
    IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Pedido anulado: se conserva su historial; no se puede eliminar ni reactivar por edición o importación';
  END IF;
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.maquinaria_operaciones o
    WHERE o.estado='CANCELADA' AND o.id<>NEW.id
      AND nullif(upper(btrim(o.np_numero)),'')=nullif(upper(btrim(NEW.np_numero)),'')) THEN
    RAISE EXCEPTION 'La NP ya está anulada. La importación requiere revisión explícita';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maquinaria_proteger_pedido_anulado BEFORE INSERT OR UPDATE OR DELETE ON public.maquinaria_operaciones
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_pedido_anulado();

-- Rechaza nuevas reservas, documentos/ediciones y reactivaciones contra la ficha
-- anulada. No toca archivos de storage ni cambia políticas de acceso existentes.
CREATE FUNCTION public.maquinaria_proteger_vinculo_anulado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; registros jsonb[]; op uuid; unidad uuid; linea uuid;
BEGIN
  registros:=CASE WHEN TG_OP='DELETE' THEN ARRAY[to_jsonb(OLD)] ELSE ARRAY[to_jsonb(NEW)] END;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('maquinaria_operacion_lineas','maquinaria_unidades_operacion','maquinaria_documentos','maquinaria_facturas_venta_unidades') THEN
    registros:=array_append(registros,to_jsonb(OLD));
  END IF;
  FOREACH r IN ARRAY registros LOOP
    op:=nullif(r->>'operacion_id','')::uuid;
    unidad:=nullif(coalesce(r->>'unidad_operacion_id',r->>'unidad_id'),'')::uuid;
    linea:=nullif(r->>'linea_id','')::uuid;
    IF EXISTS(SELECT 1 FROM public.maquinaria_operaciones o WHERE o.estado='CANCELADA'
      AND (o.id=op OR EXISTS(SELECT 1 FROM public.maquinaria_operacion_lineas l
        WHERE l.operacion_id=o.id AND (l.id=linea OR EXISTS(SELECT 1 FROM public.maquinaria_unidades_operacion u WHERE u.id=unidad AND u.linea_id=l.id))))) THEN
      RAISE EXCEPTION 'Pedido anulado: no admite nuevas reservas ni modificación de su evidencia';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER maquinaria_no_reasignar_stock_anulado BEFORE INSERT OR UPDATE OF unidad_operacion_id ON public.parque_stock_maquinas FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_reasignar_importacion_anulada BEFORE INSERT OR UPDATE OF operacion_id,linea_id,unidad_id ON public.maquinaria_importacion_lineas FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_reasignar_importacion_unidad_anulada BEFORE INSERT OR UPDATE OF operacion_id,linea_id,unidad_id ON public.maquinaria_importacion_unidades FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_editar_unidad_anulada BEFORE INSERT OR UPDATE OR DELETE ON public.maquinaria_unidades_operacion FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_editar_linea_anulada BEFORE INSERT OR UPDATE OR DELETE ON public.maquinaria_operacion_lineas FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_editar_documento_anulado BEFORE INSERT OR UPDATE OR DELETE ON public.maquinaria_documentos FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
CREATE TRIGGER maquinaria_no_facturar_unidad_anulada BEFORE INSERT OR UPDATE OR DELETE ON public.maquinaria_facturas_venta_unidades FOR EACH ROW EXECUTE FUNCTION public.maquinaria_proteger_vinculo_anulado();
REVOKE ALL ON FUNCTION public.maquinaria_proteger_pedido_anulado(),public.maquinaria_proteger_vinculo_anulado() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
