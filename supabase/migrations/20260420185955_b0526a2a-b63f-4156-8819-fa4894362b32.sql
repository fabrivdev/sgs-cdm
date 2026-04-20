-- =========================================
-- ENUMS NUEVOS
-- =========================================
CREATE TYPE public.subgrupo_maquina AS ENUM (
  'COSECHADORAS','SEMBRADORAS','PICADORAS','PLATAFORMAS','PULVERIZADORAS','TRACTORES','OTRO'
);

CREATE TYPE public.tipo_facturacion AS ENUM ('Repuesto','Servicio');

CREATE TYPE public.resultado_seguimiento AS ENUM (
  'Contactado','No contesta','Rechazó','Agendó servicio','Pendiente llamar'
);

CREATE TYPE public.tipo_importacion AS ENUM ('parque','facturacion');

-- =========================================
-- EXTENDER TABLA clientes
-- =========================================
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ruc TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS localidad TEXT,
  ADD COLUMN IF NOT EXISTS correo_principal TEXT,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre_unique_ci
  ON public.clientes (LOWER(nombre));

-- =========================================
-- TABLA contactos_cliente
-- =========================================
CREATE TABLE public.contactos_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cargo TEXT,
  telefono TEXT,
  correo TEXT,
  es_whatsapp BOOLEAN NOT NULL DEFAULT false,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contactos_cliente_cliente ON public.contactos_cliente(cliente_id);

-- =========================================
-- TABLA parque_maquinas
-- =========================================
CREATE TABLE public.parque_maquinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  anio INTEGER,
  sucursal public.sucursal,
  localidad TEXT,
  subgrupo public.subgrupo_maquina NOT NULL DEFAULT 'OTRO',
  modelo_tipo TEXT,
  serie TEXT NOT NULL,
  vendedor TEXT,
  marca public.marca NOT NULL,
  agregado_manualmente BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_parque_serie_unique ON public.parque_maquinas(LOWER(serie));
CREATE INDEX idx_parque_cliente ON public.parque_maquinas(cliente_id);
CREATE INDEX idx_parque_sucursal ON public.parque_maquinas(sucursal);

-- =========================================
-- TABLA facturacion
-- =========================================
CREATE TABLE public.facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  sucursal public.sucursal,
  tipo public.tipo_facturacion NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  entidad_nombre TEXT NOT NULL,
  cod_entidad TEXT,
  total_venta NUMERIC(14,2) NOT NULL DEFAULT 0,
  grupo TEXT,
  cod_factura TEXT NOT NULL,
  importado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_facturacion_codfactura_unique ON public.facturacion(LOWER(cod_factura));
CREATE INDEX idx_facturacion_cliente ON public.facturacion(cliente_id);
CREATE INDEX idx_facturacion_fecha ON public.facturacion(fecha);
CREATE INDEX idx_facturacion_sucursal ON public.facturacion(sucursal);

-- =========================================
-- TABLA seguimiento_comercial
-- =========================================
CREATE TABLE public.seguimiento_comercial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  resultado public.resultado_seguimiento NOT NULL,
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seguimiento_cliente ON public.seguimiento_comercial(cliente_id);
CREATE INDEX idx_seguimiento_fecha ON public.seguimiento_comercial(fecha DESC);

-- =========================================
-- TABLA importaciones (historial)
-- =========================================
CREATE TABLE public.importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo public.tipo_importacion NOT NULL,
  total_filas INTEGER NOT NULL DEFAULT 0,
  insertados INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  archivo_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_importaciones_creado ON public.importaciones(creado_en DESC);

-- =========================================
-- TRIGGERS de actualizado_en
-- =========================================
CREATE TRIGGER trg_contactos_cliente_updated
  BEFORE UPDATE ON public.contactos_cliente
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_parque_maquinas_updated
  BEFORE UPDATE ON public.parque_maquinas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RLS — habilitar
-- =========================================
ALTER TABLE public.contactos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parque_maquinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_comercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importaciones ENABLE ROW LEVEL SECURITY;

-- =========================================
-- AJUSTAR RLS de clientes (excluir tecnicos, cabecilla solo su sucursal)
-- =========================================
DROP POLICY IF EXISTS "Authenticated can view clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin and cabecilla insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin and cabecilla update clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin deletes clientes" ON public.clientes;

CREATE POLICY "Clientes select admin/cabecilla"
  ON public.clientes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Clientes insert admin/cabecilla"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Clientes update admin/cabecilla"
  ON public.clientes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Clientes delete admin"
  ON public.clientes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- RLS contactos_cliente
-- =========================================
CREATE POLICY "Contactos select"
  ON public.contactos_cliente FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla') AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = contactos_cliente.cliente_id
          AND (c.sucursal IS NULL OR c.sucursal = public.get_user_sucursal(auth.uid()))
    ))
  );

CREATE POLICY "Contactos insert"
  ON public.contactos_cliente FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla') AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = contactos_cliente.cliente_id
          AND (c.sucursal IS NULL OR c.sucursal = public.get_user_sucursal(auth.uid()))
    ))
  );

CREATE POLICY "Contactos update"
  ON public.contactos_cliente FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla') AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = contactos_cliente.cliente_id
          AND (c.sucursal IS NULL OR c.sucursal = public.get_user_sucursal(auth.uid()))
    ))
  );

CREATE POLICY "Contactos delete"
  ON public.contactos_cliente FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- RLS parque_maquinas
-- =========================================
CREATE POLICY "Parque select"
  ON public.parque_maquinas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Parque insert"
  ON public.parque_maquinas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Parque update"
  ON public.parque_maquinas FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Parque delete"
  ON public.parque_maquinas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- RLS facturacion
-- =========================================
CREATE POLICY "Facturacion select"
  ON public.facturacion FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Facturacion insert"
  ON public.facturacion FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla')
        AND (sucursal IS NULL OR sucursal = public.get_user_sucursal(auth.uid())))
  );

CREATE POLICY "Facturacion update"
  ON public.facturacion FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Facturacion delete"
  ON public.facturacion FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- RLS seguimiento_comercial
-- =========================================
CREATE POLICY "Seguimiento select"
  ON public.seguimiento_comercial FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla') AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = seguimiento_comercial.cliente_id
          AND (c.sucursal IS NULL OR c.sucursal = public.get_user_sucursal(auth.uid()))
    ))
  );

CREATE POLICY "Seguimiento insert"
  ON public.seguimiento_comercial FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cabecilla'))
    AND usuario_id = auth.uid()
  );

CREATE POLICY "Seguimiento update own"
  ON public.seguimiento_comercial FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'cabecilla') AND usuario_id = auth.uid())
  );

CREATE POLICY "Seguimiento delete admin"
  ON public.seguimiento_comercial FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- RLS importaciones
-- =========================================
CREATE POLICY "Importaciones select"
  ON public.importaciones FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cabecilla')
  );

CREATE POLICY "Importaciones insert"
  ON public.importaciones FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cabecilla'))
    AND usuario_id = auth.uid()
  );