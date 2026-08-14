DROP POLICY IF EXISTS "Gerencia select facturacion" ON public.facturacion;
CREATE POLICY "Gerencia select facturacion" ON public.facturacion
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'gerencia'::app_role));

DROP POLICY IF EXISTS "Gerencia select facturacion lineas" ON public.facturacion_lineas_importadas;
CREATE POLICY "Gerencia select facturacion lineas" ON public.facturacion_lineas_importadas
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'gerencia'::app_role));

DROP POLICY IF EXISTS "Gerencia select ordenes servicio" ON public.ordenes_servicio_importadas;
CREATE POLICY "Gerencia select ordenes servicio" ON public.ordenes_servicio_importadas
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'gerencia'::app_role));