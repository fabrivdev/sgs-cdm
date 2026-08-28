-- Sub-etapa B: proteger la edicion manual de chasis a nivel de base de
-- datos. La policy "Acceso modulo parque" (FOR ALL) sigue igual para
-- todo lo demas -- este trigger solo agrega una restriccion extra,
-- especifica para la columna chasis, sin tocar esa policy.
--
-- Se aplica tanto a la edicion manual nueva como al flujo existente de
-- "Subir factura" (confirmInvoice), porque ambos escriben la misma
-- columna con el mismo UPDATE -- restringir solo uno de los dos
-- caminos dejaria el otro como atajo para evitar el candado.

CREATE OR REPLACE FUNCTION public.guard_chasis_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.chasis IS DISTINCT FROM OLD.chasis
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'jefatura'::public.app_role)
     )
  THEN
    RAISE EXCEPTION
      'Solo admin o jefatura pueden editar el chasis'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_chasis_edit_trigger
  ON public.maquinaria_unidades_operacion;

CREATE TRIGGER guard_chasis_edit_trigger
  BEFORE UPDATE ON public.maquinaria_unidades_operacion
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chasis_edit();
