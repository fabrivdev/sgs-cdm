-- Importaciones: llaves físicas, previsiones generales con ajustes por unidad
-- y separación entre OC, factura del proveedor y costo definitivo de stock.
-- No borra ni reclasifica importes históricos de costo.
BEGIN;

CREATE TEMP TABLE importaciones_actualizacion_inicial ON COMMIT DROP AS
SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='maquinaria_importacion_unidades' AND column_name='valor_oc') AS inicial;

ALTER TABLE public.maquinaria_importacion_lineas
  ADD COLUMN IF NOT EXISTS valor_oc_general numeric,
  ADD COLUMN IF NOT EXISTS moneda_oc text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS alcance_valor_oc text NOT NULL DEFAULT 'UNITARIO';
ALTER TABLE public.maquinaria_importacion_unidades
  ADD COLUMN IF NOT EXISTS llave_interna text,
  ADD COLUMN IF NOT EXISTS llave_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_oc numeric,
  ADD COLUMN IF NOT EXISTS moneda_oc text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS valor_oc_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eta_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_factura_proveedor numeric,
  ADD COLUMN IF NOT EXISTS costo_stock_moneda text NOT NULL DEFAULT 'USD';

-- El maestro anterior exponía precio_oc por unidad; conservar esa base.
UPDATE public.maquinaria_importacion_lineas
SET valor_oc_general = precio_oc
WHERE valor_oc_general IS NULL AND precio_oc IS NOT NULL
  AND (SELECT inicial FROM importaciones_actualizacion_inicial);
-- Conservar fechas individuales previamente marcadas manuales.
UPDATE public.maquinaria_importacion_unidades
SET eta_manual = true WHERE detalle_manual AND NOT eta_manual
  AND (SELECT inicial FROM importaciones_actualizacion_inicial);
-- Solo copiar importes de una factura de proveedor identificada, no inferirlos
-- del costo_final (puede ser un costo definitivo de stock).
UPDATE public.maquinaria_importacion_unidades u
SET valor_factura_proveedor = f.costo_unidad
FROM public.maquinaria_factura_importacion_unidades f
WHERE f.importacion_unidad_id = u.id AND u.valor_factura_proveedor IS NULL
  AND (SELECT inicial FROM importaciones_actualizacion_inicial);

-- Algunas OC del maestro están divididas en varias cabeceras de una unidad.
-- Reservar primero sus llaves válidas para no reasignar CLA112-2, por ejemplo.
UPDATE public.maquinaria_importacion_unidades u
SET llave_interna=upper(btrim(i.llave_interna))
FROM public.maquinaria_importacion_lineas i
WHERE i.id=u.importacion_linea_id AND i.cantidad=1 AND u.llave_interna IS NULL
  AND coalesce(i.marca_nombre,i.marca_importacion::text,i.proveedor)='CLAAS'
  AND upper(btrim(coalesce(i.llave_interna,''))) ~ '^CLA[0-9]+-[0-9]+$';

CREATE OR REPLACE FUNCTION public.maquinaria_llave_importacion(
  p_marca text, p_oc text, p_referencia text, p_numero integer, p_cantidad integer
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN upper(btrim(coalesce(p_marca,''))) = 'CLAAS' THEN
    CASE WHEN coalesce(p_cantidad,1) = 1
              AND upper(btrim(coalesce(p_referencia,''))) ~ '^CLA[0-9]+-[0-9]+$'
              AND substring(upper(btrim(p_referencia)) FROM '^CLA([0-9]+)-') =
                  substring(btrim(coalesce(p_oc,'')) FROM '([0-9]+)$')
         THEN upper(btrim(p_referencia))
         WHEN substring(btrim(coalesce(p_oc,'')) FROM '([0-9]+)$') IS NOT NULL
         THEN 'CLA' || substring(btrim(p_oc) FROM '([0-9]+)$') || '-' || p_numero::text
         ELSE nullif(btrim(p_referencia),'') END
    ELSE CASE WHEN p_numero = 1 THEN nullif(btrim(p_referencia),'') END END
$$;

CREATE OR REPLACE FUNCTION public.maquinaria_preparar_datos_unidad_importacion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE i public.maquinaria_importacion_lineas%ROWTYPE; v_base numeric;
  v_llave text; v_prefijo text; v_siguiente integer;
BEGIN
  SELECT * INTO STRICT i FROM public.maquinaria_importacion_lineas
  WHERE id = NEW.importacion_linea_id;
  IF NOT NEW.llave_manual THEN
    v_llave := public.maquinaria_llave_importacion(
      coalesce(i.marca_nombre, i.marca_importacion::text, i.proveedor),
      i.oc, i.llave_interna, NEW.numero_unidad, i.cantidad);
    IF v_llave ~ '^CLA[0-9]+-[0-9]+$' THEN
      v_prefijo := regexp_replace(v_llave,'-[0-9]+$','-');
      PERFORM pg_advisory_xact_lock(hashtext('importacion:'||v_prefijo));
      IF TG_OP='UPDATE' AND NEW.numero_unidad=OLD.numero_unidad
         AND coalesce(NEW.llave_interna,'') ~ ('^'||v_prefijo||'[0-9]+$') THEN
        v_llave := NEW.llave_interna;
      END IF;
      IF EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades x
        WHERE x.activa AND x.id<>NEW.id AND lower(x.llave_interna)=lower(v_llave)) THEN
        SELECT coalesce(max(substring(x.llave_interna FROM '-([0-9]+)$')::integer),0)+1
        INTO v_siguiente FROM public.maquinaria_importacion_unidades x
        WHERE x.llave_interna ~ ('^'||v_prefijo||'[0-9]+$');
        v_llave := v_prefijo||v_siguiente::text;
      END IF;
    END IF;
    NEW.llave_interna := v_llave;
  END IF;
  IF NOT NEW.eta_manual THEN NEW.eta := i.eta; END IF;
  IF NOT NEW.valor_oc_manual THEN
    NEW.moneda_oc := i.moneda_oc;
    IF i.alcance_valor_oc = 'TOTAL' THEN
      v_base := trunc(i.valor_oc_general / greatest(coalesce(i.cantidad,1),1), 2);
      NEW.valor_oc := CASE WHEN NEW.numero_unidad = greatest(coalesce(i.cantidad,1),1)
        THEN i.valor_oc_general - v_base * (greatest(coalesce(i.cantidad,1),1)-1)
        ELSE v_base END;
    ELSE NEW.valor_oc := i.valor_oc_general;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS a_maquinaria_datos_unidad_importacion ON public.maquinaria_importacion_unidades;
CREATE TRIGGER a_maquinaria_datos_unidad_importacion
BEFORE INSERT OR UPDATE ON public.maquinaria_importacion_unidades
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_preparar_datos_unidad_importacion();
UPDATE public.maquinaria_importacion_unidades SET actualizado_en = actualizado_en
WHERE llave_interna IS NULL OR (SELECT inicial FROM importaciones_actualizacion_inicial);

CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_importacion_llave_por_pedido_idx
ON public.maquinaria_importacion_unidades(importacion_linea_id, lower(btrim(llave_interna)))
WHERE activa AND llave_interna IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maquinaria_importacion_llave_claas_idx
ON public.maquinaria_importacion_unidades(lower(btrim(llave_interna)))
WHERE activa AND lower(btrim(llave_interna)) ~ '^cla[0-9]+-[0-9]+$';

CREATE OR REPLACE FUNCTION public.maquinaria_validar_datos_unidad_importacion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.valor_oc < 0 OR NEW.valor_factura_proveedor < 0
     OR NEW.valor_oc::text IN ('NaN','Infinity','-Infinity')
     OR NEW.valor_factura_proveedor::text IN ('NaN','Infinity','-Infinity')
     OR NEW.costo_final < 0 OR NEW.costo_final::text IN ('NaN','Infinity','-Infinity')
     OR NEW.moneda_oc NOT IN ('USD','EUR','PYG')
     OR NEW.costo_stock_moneda NOT IN ('USD','EUR','PYG')
     OR (NEW.factura_proveedor_moneda IS NOT NULL AND NEW.factura_proveedor_moneda NOT IN ('USD','EUR','PYG')) THEN
    RAISE EXCEPTION 'Importe o moneda de importación inválido';
  END IF;
  IF auth.uid() IS NOT NULL AND (
      TG_OP = 'INSERT' OR NEW.llave_interna IS DISTINCT FROM OLD.llave_interna
      OR NEW.llave_manual IS DISTINCT FROM OLD.llave_manual
      OR NEW.valor_oc IS DISTINCT FROM OLD.valor_oc OR NEW.moneda_oc IS DISTINCT FROM OLD.moneda_oc
      OR NEW.valor_oc_manual IS DISTINCT FROM OLD.valor_oc_manual
      OR NEW.eta_manual IS DISTINCT FROM OLD.eta_manual
      OR NEW.valor_factura_proveedor IS DISTINCT FROM OLD.valor_factura_proveedor
      OR NEW.costo_final IS DISTINCT FROM OLD.costo_final
      OR NEW.costo_final_sin_iva IS DISTINCT FROM OLD.costo_final_sin_iva
      OR NEW.factura_proveedor_moneda IS DISTINCT FROM OLD.factura_proveedor_moneda
      OR NEW.costo_stock_moneda IS DISTINCT FROM OLD.costo_stock_moneda
  ) AND NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden modificar importaciones' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL
     AND (NEW.costo_final IS DISTINCT FROM OLD.costo_final
       OR NEW.costo_final_sin_iva IS DISTINCT FROM OLD.costo_final_sin_iva
       OR NEW.costo_stock_moneda IS DISTINCT FROM OLD.costo_stock_moneda)
     AND (SELECT count(*) FROM public.parque_stock_maquinas s
       WHERE (s.unidad_operacion_id = NEW.unidad_id
           OR public.normalizar_chasis_notificacion(s.chasis) = public.normalizar_chasis_notificacion(NEW.chasis))
         AND public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'El costo definitivo solo se registra con una máquina identificada en stock';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.maquinaria_validar_compra_importacion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.valor_oc_general < 0 OR NEW.valor_oc_general::text IN ('NaN','Infinity','-Infinity')
     OR NEW.moneda_oc NOT IN ('USD','EUR','PYG')
     OR NEW.alcance_valor_oc NOT IN ('UNITARIO','TOTAL') THEN
    RAISE EXCEPTION 'Valor OC, moneda o alcance inválido';
  END IF;
  IF auth.uid() IS NOT NULL AND (TG_OP='INSERT'
    OR NEW.valor_oc_general IS DISTINCT FROM OLD.valor_oc_general
    OR NEW.moneda_oc IS DISTINCT FROM OLD.moneda_oc
    OR NEW.alcance_valor_oc IS DISTINCT FROM OLD.alcance_valor_oc)
    AND NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden modificar la compra' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS maquinaria_validar_compra_importacion_trigger ON public.maquinaria_importacion_lineas;
CREATE TRIGGER maquinaria_validar_compra_importacion_trigger
BEFORE INSERT OR UPDATE ON public.maquinaria_importacion_lineas
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_validar_compra_importacion();
DROP TRIGGER IF EXISTS z_maquinaria_validar_datos_unidad_importacion ON public.maquinaria_importacion_unidades;
CREATE TRIGGER z_maquinaria_validar_datos_unidad_importacion
BEFORE INSERT OR UPDATE ON public.maquinaria_importacion_unidades
FOR EACH ROW EXECUTE FUNCTION public.maquinaria_validar_datos_unidad_importacion();

CREATE OR REPLACE FUNCTION public.maquinaria_actualizar_unidad_importacion(
  p_unidad_id uuid, p_datos jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u public.maquinaria_importacion_unidades%ROWTYPE;
  v_factura public.maquinaria_facturas_importacion%ROWTYPE; v_factura_id uuid;
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden modificar importaciones' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k NOT IN (
       'llave_interna','chasis','eta','valor_oc','moneda_oc','usar_eta_general','usar_valor_oc_general',
       'invoice_supplier','factura_proveedor_fecha','factura_proveedor_moneda','valor_factura_proveedor',
       'costo_final','costo_stock_moneda')) THEN
    RAISE EXCEPTION 'Campos de importación no admitidos';
  END IF;
  -- Mismo orden de bloqueo que la edición general: cabecera, luego unidad.
  PERFORM 1 FROM public.maquinaria_importacion_lineas i
    WHERE i.id = (SELECT importacion_linea_id FROM public.maquinaria_importacion_unidades WHERE id=p_unidad_id)
    FOR UPDATE;
  SELECT * INTO u FROM public.maquinaria_importacion_unidades
    WHERE id=p_unidad_id AND activa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La unidad no existe o fue eliminada'; END IF;
  IF p_datos ? 'llave_interna' AND nullif(btrim(p_datos->>'llave_interna'),'') IS NULL THEN
    RAISE EXCEPTION 'La llave por unidad no puede quedar vacía';
  END IF;
  UPDATE public.maquinaria_importacion_unidades SET
    llave_interna = CASE WHEN p_datos ? 'llave_interna' THEN upper(btrim(p_datos->>'llave_interna')) ELSE llave_interna END,
    llave_manual = CASE WHEN p_datos ? 'llave_interna' THEN true ELSE llave_manual END,
    chasis = CASE WHEN p_datos ? 'chasis' THEN nullif(btrim(p_datos->>'chasis'),'') ELSE chasis END,
    eta = CASE WHEN p_datos ? 'eta' THEN nullif(p_datos->>'eta','')::date ELSE eta END,
    eta_manual = CASE WHEN coalesce((p_datos->>'usar_eta_general')::boolean,false) THEN false WHEN p_datos ? 'eta' THEN true ELSE eta_manual END,
    valor_oc = CASE WHEN p_datos ? 'valor_oc' THEN round(nullif(p_datos->>'valor_oc','')::numeric,2) ELSE valor_oc END,
    moneda_oc = CASE WHEN p_datos ? 'moneda_oc' THEN p_datos->>'moneda_oc' ELSE moneda_oc END,
    valor_oc_manual = CASE WHEN coalesce((p_datos->>'usar_valor_oc_general')::boolean,false) THEN false
      WHEN p_datos ? 'valor_oc' OR p_datos ? 'moneda_oc' THEN true ELSE valor_oc_manual END,
    invoice_supplier = CASE WHEN p_datos ? 'invoice_supplier' THEN nullif(btrim(p_datos->>'invoice_supplier'),'') ELSE invoice_supplier END,
    factura_proveedor_fecha = CASE WHEN p_datos ? 'factura_proveedor_fecha' THEN nullif(p_datos->>'factura_proveedor_fecha','')::date ELSE factura_proveedor_fecha END,
    factura_proveedor_moneda = CASE WHEN p_datos ? 'factura_proveedor_moneda' THEN p_datos->>'factura_proveedor_moneda' ELSE factura_proveedor_moneda END,
    valor_factura_proveedor = CASE WHEN p_datos ? 'valor_factura_proveedor' THEN round(nullif(p_datos->>'valor_factura_proveedor','')::numeric,2) ELSE valor_factura_proveedor END,
    costo_final = CASE WHEN p_datos ? 'costo_final' THEN round(nullif(p_datos->>'costo_final','')::numeric,2) ELSE costo_final END,
    costo_stock_moneda = CASE WHEN p_datos ? 'costo_stock_moneda' THEN p_datos->>'costo_stock_moneda' ELSE costo_stock_moneda END,
    detalle_manual = detalle_manual OR p_datos ? 'chasis' OR p_datos ? 'invoice_supplier'
      OR p_datos ? 'valor_factura_proveedor' OR p_datos ? 'costo_final',
    actualizado_en = now()
  WHERE id=p_unidad_id;
  -- Mantener coherente el detalle estructurado de facturas cuando hay NP.
  -- Una corrección individual jamás cambia la moneda/fecha de una factura
  -- compartida por otras unidades sin que esos datos ya coincidan.
  IF p_datos ?| ARRAY['invoice_supplier','factura_proveedor_fecha','factura_proveedor_moneda','valor_factura_proveedor'] THEN
    SELECT * INTO u FROM public.maquinaria_importacion_unidades WHERE id=p_unidad_id;
    IF u.valor_factura_proveedor IS NOT NULL AND u.invoice_supplier IS NULL THEN
      RAISE EXCEPTION 'Ingresá el número de factura del proveedor';
    END IF;
    IF u.operacion_id IS NOT NULL AND u.invoice_supplier IS NOT NULL THEN
      SELECT * INTO v_factura FROM public.maquinaria_facturas_importacion
      WHERE operacion_id=u.operacion_id AND factura_numero=u.invoice_supplier FOR UPDATE;
      IF FOUND AND EXISTS (SELECT 1 FROM public.maquinaria_factura_importacion_unidades f
          WHERE f.factura_id=v_factura.id AND f.importacion_unidad_id<>u.id)
         AND (v_factura.moneda IS DISTINCT FROM u.factura_proveedor_moneda
           OR v_factura.factura_fecha IS DISTINCT FROM u.factura_proveedor_fecha) THEN
        RAISE EXCEPTION 'La factura es compartida: fecha y moneda deben coincidir con las otras unidades';
      END IF;
      INSERT INTO public.maquinaria_facturas_importacion(
        operacion_id,factura_numero,factura_fecha,moneda,creado_por,actualizado_en)
      VALUES(u.operacion_id,u.invoice_supplier,u.factura_proveedor_fecha,u.factura_proveedor_moneda,auth.uid(),now())
      ON CONFLICT(operacion_id,factura_numero) DO UPDATE SET
        factura_fecha=excluded.factura_fecha,moneda=excluded.moneda,actualizado_en=now()
      RETURNING id INTO v_factura_id;
      INSERT INTO public.maquinaria_factura_importacion_unidades(
        factura_id,importacion_unidad_id,chasis,costo_unidad,actualizado_en)
      VALUES(v_factura_id,u.id,u.chasis,u.valor_factura_proveedor,now())
      ON CONFLICT(importacion_unidad_id) DO UPDATE SET
        factura_id=excluded.factura_id,chasis=excluded.chasis,
        costo_unidad=excluded.costo_unidad,actualizado_en=now();
    ELSIF EXISTS (SELECT 1 FROM public.maquinaria_factura_importacion_unidades f WHERE f.importacion_unidad_id=u.id) THEN
      RAISE EXCEPTION 'La unidad tiene una factura registrada: corregí el número, no borres su vínculo';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.maquinaria_actualizar_unidad_importacion(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_actualizar_unidad_importacion(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.maquinaria_sincronizar_unidades_importacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cantidad integer := greatest(coalesce(NEW.cantidad, 1), 1);
BEGIN
  INSERT INTO public.maquinaria_importacion_unidades (
    importacion_linea_id, numero_unidad, chasis, estado_fuente, eta, ata,
    invoice_supplier, costo_final_sin_iva, costo_final
  )
  SELECT
    NEW.id, n, CASE WHEN n = 1 THEN NEW.chasis END,
    NEW.estado_fuente, NEW.eta, NEW.ata, NEW.invoice_supplier,
    NEW.costo_final_sin_iva, NEW.costo_final
  FROM generate_series(1, v_cantidad) AS n
  ON CONFLICT (importacion_linea_id, numero_unidad) DO UPDATE
  SET activa = NOT maquinaria_importacion_unidades.eliminada_manualmente,
      estado_fuente = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.estado_fuente ELSE EXCLUDED.estado_fuente END,
      eta = CASE WHEN maquinaria_importacion_unidades.eta_manual
        THEN maquinaria_importacion_unidades.eta ELSE EXCLUDED.eta END,
      ata = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.ata ELSE EXCLUDED.ata END,
      invoice_supplier = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.invoice_supplier ELSE EXCLUDED.invoice_supplier END,
      costo_final_sin_iva = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final_sin_iva ELSE EXCLUDED.costo_final_sin_iva END,
      costo_final = CASE WHEN maquinaria_importacion_unidades.detalle_manual
        THEN maquinaria_importacion_unidades.costo_final ELSE EXCLUDED.costo_final END,
      chasis = CASE
        WHEN maquinaria_importacion_unidades.detalle_manual
          OR maquinaria_importacion_unidades.vinculo_manual
          OR EXCLUDED.numero_unidad <> 1
        THEN maquinaria_importacion_unidades.chasis
        ELSE coalesce(EXCLUDED.chasis, maquinaria_importacion_unidades.chasis)
      END,
      actualizado_en = now();

  UPDATE public.maquinaria_importacion_unidades u
  SET activa = false, actualizado_en = now()
  WHERE u.importacion_linea_id = NEW.id
    AND u.numero_unidad > v_cantidad
    AND NOT u.eliminada_manualmente
    AND u.unidad_id IS NULL
    AND public.normalizar_chasis_notificacion(u.chasis) IS NULL
    AND u.invoice_supplier IS NULL
    AND u.ata IS NULL;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.maquinaria_guardar_importacion(
  p_importacion_id uuid,
  p_datos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id uuid := coalesce(p_importacion_id, gen_random_uuid());
  v_cantidad integer := greatest(1, least(500, coalesce((p_datos ->> 'cantidad')::integer, 1)));
  v_minimo integer;
  v_linea_id uuid := nullif(p_datos ->> 'linea_id', '')::uuid;
  v_operacion_id uuid;
  v_np_numero text;
  v_marca public.marca;
  v_producto text;
  v_modelo text;
  v_disponibles integer := 0;
  v_linea_actual uuid;
  v_linea_vinculada uuid;
  v_valor numeric := nullif(p_datos ->> 'valor_oc_general', '')::numeric;
  v_moneda text := coalesce(nullif(p_datos ->> 'moneda_oc', ''), 'USD');
  v_alcance text := coalesce(nullif(p_datos ->> 'alcance_valor_oc', ''), 'UNITARIO');
BEGIN
  IF NOT public.maquinaria_puede_gestionar_flujo() THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden gestionar importaciones'
      USING ERRCODE = '42501';
  END IF;
  IF v_valor IS NOT NULL AND (v_valor < 0 OR v_valor::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'Ingresá un valor OC válido';
  END IF;
  IF v_moneda NOT IN ('USD','EUR','PYG') OR v_alcance NOT IN ('UNITARIO','TOTAL') THEN
    RAISE EXCEPTION 'Moneda o alcance del valor OC inválido';
  END IF;
  IF upper(coalesce(p_datos ->> 'marca_nombre', p_datos ->> 'marca', '')) <> 'CLAAS'
     AND nullif(btrim(p_datos ->> 'llave_interna'), '') IS NULL THEN
    RAISE EXCEPTION 'La llave interna es obligatoria';
  END IF;

  IF p_importacion_id IS NOT NULL THEN
    SELECT i.linea_id
    INTO v_linea_actual
    FROM public.maquinaria_importacion_lineas i
    WHERE i.id = p_importacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La importacion no existe';
    END IF;

    SELECT iu.linea_id
    INTO v_linea_vinculada
    FROM public.maquinaria_importacion_unidades iu
    WHERE iu.importacion_linea_id = p_importacion_id
      AND iu.unidad_id IS NOT NULL
    ORDER BY iu.numero_unidad
    LIMIT 1;

    IF v_linea_vinculada IS NOT NULL
       AND v_linea_vinculada IS DISTINCT FROM v_linea_id THEN
      RAISE EXCEPTION 'No se puede cambiar la NP: la importacion ya tiene unidades vinculadas';
    END IF;
  END IF;

  IF v_linea_id IS NOT NULL THEN
    SELECT o.id, o.np_numero, l.marca, l.subgrupo::text, l.modelo
    INTO v_operacion_id, v_np_numero, v_marca, v_producto, v_modelo
    FROM public.maquinaria_operacion_lineas l
    JOIN public.maquinaria_operaciones o ON o.id = l.operacion_id
    WHERE l.id = v_linea_id
      AND (
        v_linea_id IS NOT DISTINCT FROM v_linea_actual
        OR (l.abastecimiento = 'IMPORTAR' AND o.estado <> 'CANCELADA')
      )
    FOR UPDATE OF l, o;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La linea de NP elegida no esta disponible para importar';
    END IF;

    SELECT count(*)::integer
    INTO v_disponibles
    FROM public.maquinaria_unidades_operacion u
    WHERE u.linea_id = v_linea_id
      AND u.estado <> 'CANCELADA'
      AND NOT EXISTS (
        SELECT 1
        FROM public.maquinaria_importacion_unidades ocupada
        WHERE ocupada.unidad_id = u.id
          AND ocupada.activa
          AND ocupada.importacion_linea_id <> v_id
      );

    IF v_cantidad > v_disponibles THEN
      RAISE EXCEPTION 'La NP solo tiene % unidad(es) disponibles sin asignar', v_disponibles;
    END IF;
  ELSE
    v_marca := coalesce(nullif(upper(p_datos ->> 'marca'), '')::public.marca, 'OTROS'::public.marca);
    v_producto := nullif(btrim(p_datos ->> 'producto'), '');
    v_modelo := nullif(btrim(p_datos ->> 'modelo'), '');
    v_np_numero := NULL;
  END IF;

  IF v_marca = 'CLAAS' AND nullif(btrim(p_datos ->> 'oc'), '') IS NULL THEN
    RAISE EXCEPTION 'Ingresá el número de OC para generar las llaves CLAAS';
  END IF;
  IF v_marca='CLAAS' AND p_importacion_id IS NULL
     AND substring(btrim(coalesce(p_datos->>'oc','')) FROM '([0-9]+)$') IS NULL THEN
    RAISE EXCEPTION 'La OC CLAAS debe terminar en su número, por ejemplo 18-111';
  END IF;
  IF v_producto IS NULL OR v_modelo IS NULL THEN
    RAISE EXCEPTION 'El producto y el modelo son obligatorios';
  END IF;

  IF p_importacion_id IS NULL THEN
    INSERT INTO public.maquinaria_importacion_lineas (
      id, source_id, source_sheet, datos_fuente, llave_interna,
      marca_importacion, np_numero, proveedor, producto, modelo, cantidad,
      estado_fuente, oc, po, fecha_pedido, eta, transporte, origen, destino,
      notas, operacion_id, linea_id, valor_oc_general, moneda_oc, alcance_valor_oc, marca_nombre
    ) VALUES (
      v_id, 'MANUAL:' || v_id::text, 'CARGA MANUAL',
      jsonb_build_object('origen', 'CARGA MANUAL', 'creado_por', auth.uid()),
      btrim(p_datos ->> 'llave_interna'), v_marca, v_np_numero, v_marca::text,
      v_producto, v_modelo, v_cantidad,
      coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), 'PLANIFICADA'),
      nullif(btrim(p_datos ->> 'oc'), ''), NULL,
      nullif(p_datos ->> 'fecha_pedido', '')::date,
      nullif(p_datos ->> 'eta', '')::date, NULL, NULL, NULL,
      nullif(btrim(p_datos ->> 'notas'), ''), v_operacion_id, v_linea_id,
      round(v_valor, 2), v_moneda, v_alcance, coalesce(nullif(btrim(p_datos ->> 'marca_nombre'), ''), v_marca::text)
    );
  ELSE
    SELECT coalesce(max(u.numero_unidad), 0)
    INTO v_minimo
    FROM public.maquinaria_importacion_unidades u
    WHERE u.importacion_linea_id = p_importacion_id
      AND (
        u.unidad_id IS NOT NULL OR nullif(btrim(u.chasis), '') IS NOT NULL
        OR u.invoice_supplier IS NOT NULL OR u.ata IS NOT NULL
        OR u.valor_factura_proveedor IS NOT NULL OR u.valor_oc_manual OR u.eta_manual OR u.llave_manual
      );

    IF v_cantidad < v_minimo THEN
      RAISE EXCEPTION 'No se puede reducir la cantidad por debajo de %: esas unidades ya tienen trazabilidad', v_minimo;
    END IF;

    UPDATE public.maquinaria_importacion_lineas
    SET llave_interna = btrim(p_datos ->> 'llave_interna'),
        marca_importacion = v_marca,
        np_numero = v_np_numero,
        proveedor = v_marca::text,
        modelo = v_modelo,
        cantidad = v_cantidad,
        estado_fuente = coalesce(nullif(btrim(p_datos ->> 'estado_fuente'), ''), estado_fuente),
        oc = nullif(btrim(p_datos ->> 'oc'), ''),
        fecha_pedido = nullif(p_datos ->> 'fecha_pedido', '')::date,
        eta = nullif(p_datos ->> 'eta', '')::date,
        notas = nullif(btrim(p_datos ->> 'notas'), ''),
        operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        marca_nombre = coalesce(nullif(btrim(p_datos ->> 'marca_nombre'), ''), marca_nombre, v_marca::text),
        valor_oc_general = CASE WHEN p_datos ? 'valor_oc_general' THEN round(v_valor, 2) ELSE valor_oc_general END,
        moneda_oc = CASE WHEN p_datos ? 'moneda_oc' THEN v_moneda ELSE moneda_oc END,
        alcance_valor_oc = CASE WHEN p_datos ? 'alcance_valor_oc' THEN v_alcance ELSE alcance_valor_oc END,
        actualizado_en = now()
    WHERE id = p_importacion_id;
  END IF;

  IF v_linea_id IS NOT NULL THEN
    WITH importables AS (
      SELECT iu.id, row_number() OVER (ORDER BY iu.numero_unidad, iu.id) AS posicion
      FROM public.maquinaria_importacion_unidades iu
      WHERE iu.importacion_linea_id = v_id
        AND iu.activa
        AND iu.unidad_id IS NULL
    ), disponibles AS (
      SELECT u.id, row_number() OVER (ORDER BY u.numero_unidad, u.id) AS posicion
      FROM public.maquinaria_unidades_operacion u
      WHERE u.linea_id = v_linea_id
        AND u.estado <> 'CANCELADA'
        AND NOT EXISTS (
          SELECT 1
          FROM public.maquinaria_importacion_unidades ocupada
          WHERE ocupada.unidad_id = u.id
            AND ocupada.activa
        )
    )
    UPDATE public.maquinaria_importacion_unidades iu
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = disponible.id,
        situacion_vinculo = 'PEDIDO VINCULADO',
        vinculo_manual = true,
        actualizado_en = now()
    FROM importables importable
    JOIN disponibles disponible ON disponible.posicion = importable.posicion
    WHERE iu.id = importable.id;

    UPDATE public.maquinaria_importacion_lineas i
    SET operacion_id = v_operacion_id,
        linea_id = v_linea_id,
        unidad_id = vinculo.unidad_id,
        situacion_vinculo = 'PEDIDO VINCULADO',
        actualizado_en = now()
    FROM (
      SELECT iu.unidad_id
      FROM public.maquinaria_importacion_unidades iu
      WHERE iu.importacion_linea_id = v_id
        AND iu.unidad_id IS NOT NULL
      ORDER BY iu.numero_unidad
      LIMIT 1
    ) vinculo
    WHERE i.id = v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_guardar_importacion(uuid, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.maquinaria_aplicar_factura_importacion(
  p_operacion_id uuid,
  p_factura_numero text,
  p_factura_fecha date,
  p_proveedor text,
  p_moneda text,
  p_valor_total numeric,
  p_unidades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_factura_id uuid;
  v_importacion_operativa_id uuid;
  v_operacion_estado text;
  v_item jsonb;
  v_importacion_unidad_id uuid;
  v_pedido_unidad_id uuid;
  v_chasis text;
  v_chasis_actual text;
  v_costo numeric;
  v_cantidad integer;
  v_actualizadas integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_module_access(auth.uid(), 'parque')
     OR NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Solo admin o jefatura pueden confirmar facturas de importacion'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.estado INTO v_operacion_estado
  FROM public.maquinaria_operaciones o
  WHERE o.id = p_operacion_id
  FOR UPDATE;

  IF NOT FOUND OR v_operacion_estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La operacion no existe o esta cancelada';
  END IF;

  IF nullif(btrim(p_factura_numero), '') IS NULL THEN
    RAISE EXCEPTION 'El numero de factura es obligatorio';
  END IF;
  IF jsonb_typeof(p_unidades) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_unidades) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una maquina incluida en la factura';
  END IF;
  IF p_valor_total IS NOT NULL AND p_valor_total < 0 THEN
    RAISE EXCEPTION 'El valor total de la factura no puede ser negativo';
  END IF;

  -- Rechaza ids repetidos antes de modificar datos.
  SELECT count(*) INTO v_cantidad
  FROM (
    SELECT value ->> 'importacion_unidad_id' AS id
    FROM jsonb_array_elements(p_unidades)
    GROUP BY value ->> 'importacion_unidad_id'
  ) unicas;
  IF v_cantidad <> jsonb_array_length(p_unidades) THEN
    RAISE EXCEPTION 'La misma maquina aparece mas de una vez en la factura';
  END IF;

  INSERT INTO public.maquinaria_facturas_importacion (
    operacion_id, proveedor, factura_numero, factura_fecha, moneda,
    valor_total, creado_por, actualizado_en
  ) VALUES (
    p_operacion_id, nullif(btrim(p_proveedor), ''), btrim(p_factura_numero),
    p_factura_fecha, nullif(btrim(p_moneda), ''), p_valor_total,
    auth.uid(), now()
  )
  ON CONFLICT (operacion_id, factura_numero) DO UPDATE SET
    proveedor = excluded.proveedor,
    factura_fecha = excluded.factura_fecha,
    moneda = excluded.moneda,
    valor_total = excluded.valor_total,
    actualizado_en = now()
  RETURNING id INTO v_factura_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_unidades)
  LOOP
    BEGIN
      v_importacion_unidad_id := nullif(v_item ->> 'importacion_unidad_id', '')::uuid;
      v_costo := nullif(v_item ->> 'costo_unidad', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Una unidad o costo de la factura tiene formato invalido';
    END;
    v_chasis := nullif(btrim(v_item ->> 'chasis'), '');

    IF v_costo IS NOT NULL AND v_costo < 0 THEN
      RAISE EXCEPTION 'El costo de una maquina no puede ser negativo';
    END IF;

    SELECT iu.unidad_id, u.chasis
    INTO v_pedido_unidad_id, v_chasis_actual
    FROM public.maquinaria_importacion_unidades iu
    JOIN public.maquinaria_unidades_operacion u ON u.id = iu.unidad_id
    JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
    WHERE iu.id = v_importacion_unidad_id
      AND iu.activa
      AND iu.operacion_id = p_operacion_id
      AND l.operacion_id = p_operacion_id
      AND l.abastecimiento = 'IMPORTAR'
    FOR UPDATE OF iu, u;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Una maquina seleccionada no esta vinculada a esta operacion';
    END IF;

    IF public.normalizar_chasis_notificacion(v_chasis) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_chasis_actual) IS NOT NULL
       AND public.normalizar_chasis_notificacion(v_chasis)
         <> public.normalizar_chasis_notificacion(v_chasis_actual) THEN
      RAISE EXCEPTION 'El chasis % no coincide con el ya confirmado para la unidad', v_chasis;
    END IF;

    -- Una unidad fisica solo puede pertenecer a una factura de proveedor.
    -- Si se corrige la factura, se mueve explicitamente a la nueva cabecera.
    DELETE FROM public.maquinaria_factura_importacion_unidades fiu
    WHERE fiu.importacion_unidad_id = v_importacion_unidad_id
      AND fiu.factura_id <> v_factura_id;

    INSERT INTO public.maquinaria_factura_importacion_unidades (
      factura_id, importacion_unidad_id, chasis, costo_unidad, actualizado_en
    ) VALUES (
      v_factura_id, v_importacion_unidad_id, v_chasis, v_costo, now()
    )
    ON CONFLICT (factura_id, importacion_unidad_id) DO UPDATE SET
      chasis = excluded.chasis,
      costo_unidad = excluded.costo_unidad,
      actualizado_en = now();

    UPDATE public.maquinaria_importacion_unidades
    SET invoice_supplier = btrim(p_factura_numero),
        factura_proveedor_fecha = p_factura_fecha,
        factura_proveedor_moneda = nullif(btrim(p_moneda), ''),
        valor_factura_proveedor = v_costo,
        chasis = coalesce(v_chasis, chasis),
        estado_fuente = CASE
          WHEN upper(coalesce(estado_fuente, '')) IN ('RECIBIDA', 'ARRIBADA')
            THEN estado_fuente
          ELSE 'EN TRANSITO'
        END,
        detalle_manual = true,
        actualizado_en = now()
    WHERE id = v_importacion_unidad_id;

    UPDATE public.maquinaria_unidades_operacion
    SET chasis = coalesce(nullif(btrim(chasis), ''), v_chasis),
        estado = CASE WHEN estado = 'PENDIENTE' THEN 'EN_TRANSITO' ELSE estado END,
        actualizado_en = now()
    WHERE id = v_pedido_unidad_id;

    v_actualizadas := v_actualizadas + 1;
  END LOOP;

  INSERT INTO public.maquinaria_importaciones_operativas (
    operacion_id, proveedor, factura_numero, factura_fecha, moneda,
    valor_facturado, estado, actualizado_en
  ) VALUES (
    p_operacion_id, nullif(btrim(p_proveedor), ''), btrim(p_factura_numero),
    p_factura_fecha, nullif(btrim(p_moneda), ''), p_valor_total,
    'FACTURA_REVISADA', now()
  )
  ON CONFLICT (operacion_id) DO UPDATE SET
    proveedor = excluded.proveedor,
    factura_numero = excluded.factura_numero,
    factura_fecha = excluded.factura_fecha,
    moneda = excluded.moneda,
    valor_facturado = excluded.valor_facturado,
    estado = 'FACTURA_REVISADA',
    actualizado_en = now()
  RETURNING id INTO v_importacion_operativa_id;

  UPDATE public.maquinaria_operaciones
  SET estado = CASE
        WHEN estado IN ('FACTURADA', 'CERRADA') THEN estado
        ELSE 'EN_IMPORTACION'
      END,
      actualizado_en = now()
  WHERE id = p_operacion_id;

  RETURN jsonb_build_object(
    'factura_id', v_factura_id,
    'importacion_operativa_id', v_importacion_operativa_id,
    'unidades_actualizadas', v_actualizadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maquinaria_aplicar_factura_importacion(
  uuid, text, date, text, text, numeric, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maquinaria_aplicar_factura_importacion(
  uuid, text, date, text, text, numeric, jsonb
) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquinaria_facturas_importacion
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquinaria_factura_importacion_unidades
  TO authenticated;

CREATE OR REPLACE VIEW public.maquinaria_facturas_importacion_detalle
WITH (security_invoker = true)
AS
SELECT
  f.id AS factura_id, f.operacion_id, f.proveedor, f.factura_numero,
  f.factura_fecha, f.moneda, f.valor_total, f.documento_id,
  u.id AS importacion_unidad_id, u.numero_unidad,
  i.id AS importacion_linea_id, i.cantidad AS cantidad_lote,
  i.producto, i.modelo, fiu.chasis, fiu.costo_unidad,
  u.unidad_id AS pedido_unidad_id, f.actualizado_en
FROM public.maquinaria_facturas_importacion f
JOIN public.maquinaria_factura_importacion_unidades fiu ON fiu.factura_id = f.id
JOIN public.maquinaria_importacion_unidades u ON u.id = fiu.importacion_unidad_id
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id;

GRANT SELECT ON public.maquinaria_facturas_importacion_detalle TO authenticated;


CREATE OR REPLACE VIEW public.maquinaria_importacion_unidades_operativas
WITH (security_invoker = true)
AS
SELECT
  u.id, i.id AS importacion_linea_id, u.numero_unidad, i.cantidad AS cantidad_lote,
  1::integer AS cantidad, u.activa, i.source_id, i.source_row, i.source_sheet, i.datos_fuente,
  u.llave_interna, i.prioridad, coalesce(o.np_numero, i.np_numero) AS np_numero,
  coalesce(i.marca_nombre, nullif(i.proveedor, 'OTROS')) AS proveedor,
  coalesce(l.subgrupo::text, i.subgrupo::text, i.producto) AS producto,
  coalesce(nullif(btrim(l.modelo), ''), i.modelo) AS modelo,
  u.estado_fuente, i.oc, i.po, u.eta, i.transporte, u.invoice_supplier,
  u.factura_proveedor_fecha, u.factura_proveedor_moneda, i.tipo_cambio, u.valor_oc AS precio_oc,
  i.descuentos, i.precio_teorico_oc, i.producto_facturado, i.diferencia,
  i.descuento_especial, i.flete_seguro, i.proveedor_flete, i.origen, i.destino, i.notas,
  u.ata, u.costo_final_sin_iva, u.costo_final, u.chasis, i.venta_facturada,
  i.factura_venta, i.valor_venta, i.utilidad, i.margen_porcentaje, u.operacion_id,
  u.linea_id, u.unidad_id, u.situacion_vinculo, u.vinculo_manual, u.detalle_manual,
  i.creado_en, u.actualizado_en,
  coalesce(l.marca_nombre, i.marca_nombre, nullif(l.marca::text, 'OTROS'),
    nullif(i.marca_importacion::text, 'OTROS'), nullif(upper(btrim(i.proveedor)), 'OTROS')) AS marca,
  coalesce(c.nombre, o.cliente_nombre) AS cliente_nombre, o.np_fecha, o.comercial,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'EN_PARQUE'
    WHEN t.estado_disponibilidad IS NOT NULL THEN t.estado_disponibilidad
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NULL THEN 'SIN_CHASIS'
    ELSE 'SIN_CONCILIAR'
  END AS estado_disponibilidad,
  CASE
    WHEN parque.id IS NOT NULL OR uo.estado IN ('EN_PARQUE', 'TRANSFERIDA') THEN 'Parque de clientes'
    WHEN t.disponibilidad_detalle IS NOT NULL THEN t.disponibilidad_detalle
    WHEN public.normalizar_chasis_notificacion(u.chasis) IS NOT NULL THEN 'Chasis sin coincidencia en stock o parque'
    ELSE NULL
  END AS disponibilidad_detalle,
  t.sucursal AS stock_sucursal, t.deposito AS stock_deposito, t.saldo_actual AS stock_saldo,
  i.fecha_pedido,
  i.modelo AS modelo_original,
  i.llave_interna AS llave_interna_general, i.eta AS eta_general,
  i.estado_fuente AS estado_general, i.valor_oc_general, i.alcance_valor_oc,
  i.moneda_oc AS moneda_oc_general, u.moneda_oc, u.valor_oc_manual, u.eta_manual,
  u.valor_factura_proveedor, u.costo_stock_moneda,
  (t.id IS NOT NULL AND t.estado_disponibilidad <> 'CONFLICTO'
    AND (SELECT count(*) FROM public.parque_stock_maquinas s
      WHERE (s.unidad_operacion_id=u.unidad_id
        OR public.normalizar_chasis_notificacion(s.chasis)=public.normalizar_chasis_notificacion(u.chasis))
        AND public.normalizar_chasis_notificacion(s.chasis) IS NOT NULL)=1) AS costo_stock_habilitado,
  (SELECT sum(uu.valor_oc) FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc=i.moneda_oc) AS valor_oc_asignado_total,
  EXISTS (SELECT 1 FROM public.maquinaria_importacion_unidades uu
    WHERE uu.importacion_linea_id=i.id AND uu.activa AND uu.moneda_oc<>i.moneda_oc) AS oc_monedas_diferentes
FROM public.maquinaria_importacion_unidades u
JOIN public.maquinaria_importacion_lineas i ON i.id = u.importacion_linea_id
LEFT JOIN public.maquinaria_operaciones o ON o.id = u.operacion_id
LEFT JOIN public.maquinaria_operacion_lineas l ON l.id = u.linea_id
LEFT JOIN public.maquinaria_unidades_operacion uo ON uo.id = u.unidad_id
LEFT JOIN public.clientes c ON c.id = o.cliente_id
LEFT JOIN LATERAL (
  SELECT st.* FROM public.maquinaria_stock_trazabilidad st
  WHERE st.unidad_operacion_id = u.unidad_id
     OR st.chasis_normalizado = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY (st.unidad_operacion_id = u.unidad_id) DESC,
    (st.estado_disponibilidad = 'CONFLICTO') DESC, st.importado_en DESC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT p.id FROM public.parque_maquinas p
  WHERE public.normalizar_chasis_notificacion(p.serie) = public.normalizar_chasis_notificacion(u.chasis)
  ORDER BY p.actualizado_en DESC NULLS LAST, p.id LIMIT 1
) parque ON true
WHERE u.activa;

GRANT SELECT ON public.maquinaria_importacion_unidades_operativas TO authenticated;


DROP TRIGGER IF EXISTS maquinaria_sincronizar_unidades_importacion_trigger ON public.maquinaria_importacion_lineas;
CREATE TRIGGER maquinaria_sincronizar_unidades_importacion_trigger
AFTER INSERT OR UPDATE OF cantidad,chasis,estado_fuente,eta,ata,invoice_supplier,costo_final_sin_iva,
  costo_final,operacion_id,linea_id,unidad_id,situacion_vinculo,llave_interna,oc,marca_nombre,
  valor_oc_general,moneda_oc,alcance_valor_oc
ON public.maquinaria_importacion_lineas FOR EACH ROW
EXECUTE FUNCTION public.maquinaria_sincronizar_unidades_importacion();
NOTIFY pgrst, 'reload schema';
COMMIT;
