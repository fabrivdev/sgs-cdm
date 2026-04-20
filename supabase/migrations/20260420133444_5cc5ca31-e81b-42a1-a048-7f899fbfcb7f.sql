
-- 1) Hacer sucursal opcional en clientes
ALTER TABLE public.clientes ALTER COLUMN sucursal DROP NOT NULL;

-- 2) Índice único por nombre (case-insensitive) para permitir ON CONFLICT y evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre_unique_idx ON public.clientes (LOWER(nombre));

-- 3) Reemplazar RLS de clientes
DROP POLICY IF EXISTS "Admin sees all clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin and cabecilla insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin and cabecilla update clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin deletes clientes" ON public.clientes;

CREATE POLICY "Authenticated can view clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin and cabecilla insert clientes"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'cabecilla'::app_role)
);

CREATE POLICY "Admin and cabecilla update clientes"
ON public.clientes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'cabecilla'::app_role)
);

CREATE POLICY "Admin deletes clientes"
ON public.clientes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
