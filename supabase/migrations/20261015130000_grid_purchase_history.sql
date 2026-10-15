BEGIN;
-- Administrative, audited historical import. No public write endpoint.
CREATE TABLE public.repuestos_ficha_grid_cargas (
 archivo_sha256 text PRIMARY KEY CHECK (archivo_sha256 ~ '^[0-9a-f]{64}$'),
 archivo_nombre text NOT NULL,
 fecha_corte date NOT NULL,
 movimientos integer NOT NULL CHECK (movimientos>0),
 codigos_esperados integer NOT NULL CHECK (codigos_esperados>0),
 compras_esperadas integer NOT NULL CHECK (compras_esperadas BETWEEN 0 AND codigos_esperados),
 contenido_md5 text NOT NULL CHECK (contenido_md5 ~ '^[0-9a-f]{32}$'),
 activo boolean NOT NULL DEFAULT false,
 cargado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repuestos_ficha_grid_una_activa ON public.repuestos_ficha_grid_cargas ((true)) WHERE activo;
CREATE TABLE public.repuestos_ficha_grid_compras (
 archivo_sha256 text NOT NULL REFERENCES public.repuestos_ficha_grid_cargas,
 codigo_legacy_norm text NOT NULL CHECK (codigo_legacy_norm ~ '^[0-9]+$'),
 ultima_compra date,
 tipo_movimiento text,
 cantidad numeric,
 codigo_movimiento text,
 fila_origen integer,
 PRIMARY KEY (archivo_sha256,codigo_legacy_norm),
 CHECK ((ultima_compra IS NULL AND tipo_movimiento IS NULL AND cantidad IS NULL AND codigo_movimiento IS NULL AND fila_origen IS NULL)
 OR (ultima_compra IS NOT NULL AND tipo_movimiento IS NOT NULL
 AND tipo_movimiento IN ('ENTRADA POR COMPRA','ENTRADA POR IMPORTACAO','ENTRADA POR IMPORTACAO COM PEDIDO')
 AND cantidad IS NOT NULL AND cantidad>0 AND codigo_movimiento IS NOT NULL AND length(btrim(codigo_movimiento))>0
 AND fila_origen IS NOT NULL AND fila_origen>=2))
);
ALTER TABLE public.repuestos_ficha_grid_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repuestos_ficha_grid_compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY ficha_grid_cargas_lectura ON public.repuestos_ficha_grid_cargas FOR SELECT TO authenticated
 USING (public.has_module_access(auth.uid(),'repuestos'));
CREATE POLICY ficha_grid_compras_lectura ON public.repuestos_ficha_grid_compras FOR SELECT TO authenticated
 USING (public.has_module_access(auth.uid(),'repuestos'));
REVOKE ALL ON public.repuestos_ficha_grid_cargas,public.repuestos_ficha_grid_compras FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.repuestos_ficha_grid_cargas,public.repuestos_ficha_grid_compras TO authenticated;

CREATE FUNCTION public.repuestos_ficha_grid_validar_activacion() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n integer; compras integer; huella text; futuro boolean;
BEGIN
 IF NEW.activo THEN
  SELECT count(*),count(ultima_compra),
   md5(string_agg(codigo_legacy_norm||'|'||coalesce(ultima_compra::text,''),E'\n' ORDER BY codigo_legacy_norm COLLATE "C")),
   coalesce(bool_or(ultima_compra>NEW.fecha_corte OR ultima_compra>current_date),false)
  INTO n,compras,huella,futuro FROM public.repuestos_ficha_grid_compras WHERE archivo_sha256=NEW.archivo_sha256;
  IF n<>NEW.codigos_esperados OR compras<>NEW.compras_esperadas OR huella IS DISTINCT FROM NEW.contenido_md5 OR futuro THEN
   RAISE EXCEPTION 'Ficha GRID incompleta o inconsistente: % códigos, % compras',n,compras;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ficha_grid_validar_activacion BEFORE INSERT OR UPDATE ON public.repuestos_ficha_grid_cargas
 FOR EACH ROW EXECUTE FUNCTION public.repuestos_ficha_grid_validar_activacion();
REVOKE ALL ON FUNCTION public.repuestos_ficha_grid_validar_activacion() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.v_repuestos_ultima_compra WITH (security_invoker=true) AS
WITH historico AS (
 SELECT h.codigo_legacy_norm,h.ultima_compra,'Ficha GRID · compras reales'::text fuente_compra
 FROM public.repuestos_ficha_grid_compras h JOIN public.repuestos_ficha_grid_cargas c USING(archivo_sha256)
 WHERE c.activo AND h.ultima_compra IS NOT NULL
 UNION ALL
 -- Preserve the former source until the complete audited replacement is activated.
 -- Once activated, never restore a return date from the old rotation report.
 SELECT codigo_legacy_norm,ultima_compra,'Histórico GRID' FROM public.repuestos_compras_historicas
 WHERE NOT EXISTS(SELECT 1 FROM public.repuestos_ficha_grid_cargas WHERE activo)
), candidatos AS (
 SELECT m.producto_codigo,h.ultima_compra,h.fuente_compra
 FROM historico h JOIN public.repuestos_maestro_legacy m USING(codigo_legacy_norm)
 JOIN public.repuestos_maestro_legacy_cargas c ON c.id=m.carga_id
 WHERE c.activo AND c.estado='COMPLETADO' AND m.estado_vinculo IN ('CONFIRMADA','CONFIRMADA_CANONICA')
  AND m.producto_codigo IS NOT NULL AND h.ultima_compra<=current_date
 UNION ALL
 SELECT producto_codigo,fecha_emision,'Factura de compra TOTVS'
 FROM public.totvs_facturas_compra_lineas
 WHERE upper(btrim(especie))='NF' AND cantidad>0 AND total_usd>0
  AND regexp_replace(upper(coalesce(tipo_entrada,'')), '[[:space:]]', '', 'g') LIKE '%C/STOCK%'
  AND fecha_emision<=current_date AND producto_codigo LIKE 'REP%'
 UNION ALL
 SELECT producto_codigo,fecha_documento,'Importación TOTVS conciliada'
 FROM public.v_repuestos_compras_importadas_conciliacion WHERE estado='CONCILIADA'
), elegida AS (
 SELECT *,row_number() OVER (PARTITION BY producto_codigo ORDER BY ultima_compra DESC,fuente_compra) orden FROM candidatos
)
SELECT producto_codigo,ultima_compra,fuente_compra FROM elegida WHERE orden=1;
COMMENT ON VIEW public.v_repuestos_ultima_compra IS
 'Última compra real: ficha GRID activa por equivalencia confirmada + NF TOTVS C/STOCK + importaciones conciliadas. Devoluciones y notas de crédito no reinician antigüedad. El histórico anterior se conserva para auditoría y no participa tras activar la ficha.';
GRANT SELECT ON public.v_repuestos_ultima_compra TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
