-- Asociacion de trabajos con Orden de Servicio interna (OS)
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS os_numero text;

UPDATE public.trabajos
SET os_numero = NULL
WHERE os_numero IS NOT NULL
  AND btrim(os_numero) = '';

CREATE UNIQUE INDEX IF NOT EXISTS trabajos_os_numero_unique
  ON public.trabajos (os_numero)
  WHERE os_numero IS NOT NULL;

-- Staging estable para futuras importaciones del listado "Ordenes de Servicios - CDM".
-- La vinculacion primaria se hace por os_numero; trabajo_id queda opcional para cachear el match.
CREATE TABLE IF NOT EXISTS public.ordenes_servicio_importadas (
  os_numero text PRIMARY KEY,
  trabajo_id uuid REFERENCES public.trabajos(id) ON DELETE SET NULL,
  cliente_nombre text,
  situacion_os text,
  situacion_facturacion text,
  responsable text,
  cod_mecanico text,
  factura text,
  cod_interno text,
  fecha_abierta_os timestamptz,
  fecha_emision_factura timestamptz,
  nro_chasis text,
  marca text,
  tipo_tiempo text,
  problema text,
  km_cantidad numeric,
  km_valor_unitario numeric,
  servicios_cantidad numeric,
  servicios_valor_unitario numeric,
  terceros_valor numeric,
  kilometro_valor numeric,
  servicios_valor numeric,
  repuesto_valor numeric,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  importado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordenes_servicio_trabajo_idx
  ON public.ordenes_servicio_importadas(trabajo_id);

CREATE INDEX IF NOT EXISTS ordenes_servicio_tipo_tiempo_idx
  ON public.ordenes_servicio_importadas(tipo_tiempo);

ALTER TABLE public.ordenes_servicio_importadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ordenes servicio select" ON public.ordenes_servicio_importadas;
CREATE POLICY "Ordenes servicio select"
  ON public.ordenes_servicio_importadas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Ordenes servicio manage" ON public.ordenes_servicio_importadas;
CREATE POLICY "Ordenes servicio manage"
  ON public.ordenes_servicio_importadas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'cabecilla'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'cabecilla'::public.app_role));
