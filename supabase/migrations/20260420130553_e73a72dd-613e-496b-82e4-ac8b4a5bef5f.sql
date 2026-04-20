
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'cabecilla', 'tecnico');
CREATE TYPE public.sucursal AS ENUM ('Santa Rita', 'Santa Rosa', 'Campo 9', 'Misiones', 'Loma Plata', 'Katuete');
CREATE TYPE public.marca AS ENUM ('CLAAS', 'HORSCH');
CREATE TYPE public.estado_servicio AS ENUM ('Pendiente', 'Iniciado', 'Completado');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  sucursal public.sucursal,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_sucursal(_user_id UUID)
RETURNS public.sucursal
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sucursal FROM public.profiles WHERE id = _user_id
$$;

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  sucursal public.sucursal NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- ============ SERVICIOS ============
CREATE TABLE public.servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_programada DATE NOT NULL,
  dia_semana TEXT NOT NULL,
  semana INTEGER NOT NULL,
  tecnico_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  auxiliares UUID[] NOT NULL DEFAULT '{}',
  sucursal public.sucursal NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  marca public.marca NOT NULL,
  trabajo_descripcion TEXT NOT NULL,
  estado public.estado_servicio NOT NULL DEFAULT 'Pendiente',
  observaciones TEXT,
  horas_trabajadas NUMERIC(5,2),
  visto_por UUID[] NOT NULL DEFAULT '{}',
  creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_servicios_fecha ON public.servicios(fecha_programada);
CREATE INDEX idx_servicios_sucursal ON public.servicios(sucursal);
CREATE INDEX idx_servicios_responsable ON public.servicios(tecnico_responsable_id);
CREATE INDEX idx_servicios_auxiliares ON public.servicios USING GIN(auxiliares);

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_servicios_updated BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTO CALC dia_semana / semana ============
CREATE OR REPLACE FUNCTION public.set_servicio_fecha_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dias TEXT[] := ARRAY['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
BEGIN
  NEW.dia_semana := dias[EXTRACT(DOW FROM NEW.fecha_programada)::int + 1];
  NEW.semana := EXTRACT(WEEK FROM NEW.fecha_programada)::int;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_servicios_fecha_meta BEFORE INSERT OR UPDATE OF fecha_programada ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.set_servicio_fecha_meta();

-- ============ AUTO PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, sucursal)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    (NEW.raw_user_meta_data->>'sucursal')::public.sucursal
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES: profiles ============
CREATE POLICY "Authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete profile" ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ RLS POLICIES: user_roles ============
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ RLS POLICIES: clientes ============
CREATE POLICY "Admin sees all clientes" ON public.clientes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR sucursal = public.get_user_sucursal(auth.uid())
  );

CREATE POLICY "Admin and cabecilla insert clientes" ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  );

CREATE POLICY "Admin and cabecilla update clientes" ON public.clientes
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  );

CREATE POLICY "Admin deletes clientes" ON public.clientes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ RLS POLICIES: servicios ============
CREATE POLICY "Servicios visibility by role" ON public.servicios
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
    OR tecnico_responsable_id = auth.uid()
    OR auth.uid() = ANY(auxiliares)
  );

CREATE POLICY "Admin and cabecilla insert servicios" ON public.servicios
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  );

CREATE POLICY "Servicios update by role" ON public.servicios
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
    OR tecnico_responsable_id = auth.uid()
    OR auth.uid() = ANY(auxiliares)
  );

CREATE POLICY "Admin and cabecilla delete servicios" ON public.servicios
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'cabecilla') AND sucursal = public.get_user_sucursal(auth.uid()))
  );
