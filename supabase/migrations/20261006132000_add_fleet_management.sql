-- Aplicación manual. Crea Flota sin modificar órdenes de servicio ni facturación.
-- Versión posterior a filtros (120000) y Mayor (130000/131000).
BEGIN;

INSERT INTO public.app_secciones (id, modulo_id, nombre, orden, activo)
VALUES ('servicios.flota', 'servicios', 'Flota', 45, true)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    orden = EXCLUDED.orden,
    activo = EXCLUDED.activo;

-- No se copian permisos de otras secciones. La cuenta técnica superadmin ya
-- tiene acceso global; cualquier acceso adicional debe otorgarse explícitamente.

CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL CHECK (char_length(btrim(brand)) BETWEEN 1 AND 80),
  model text NULL CHECK (model IS NULL OR char_length(btrim(model)) BETWEEN 1 AND 120),
  model_year smallint NULL CHECK (model_year BETWEEN 1900 AND 2100),
  image_url text NULL,
  image_source_url text NULL,
  image_license text NULL,
  plate text NOT NULL CHECK (char_length(btrim(plate)) BETWEEN 1 AND 20),
  plate_normalized text NOT NULL CHECK (char_length(plate_normalized) BETWEEN 3 AND 12),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_by_name text NOT NULL,
  CONSTRAINT fleet_vehicles_plate_normalized_key UNIQUE (plate_normalized)
);

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS model text NULL,
  ADD COLUMN IF NOT EXISTS model_year smallint NULL,
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS image_source_url text NULL,
  ADD COLUMN IF NOT EXISTS image_license text NULL;

ALTER TABLE public.fleet_vehicles
  DROP CONSTRAINT IF EXISTS fleet_vehicles_model_check,
  DROP CONSTRAINT IF EXISTS fleet_vehicles_model_year_check;

ALTER TABLE public.fleet_vehicles
  ADD CONSTRAINT fleet_vehicles_model_check
    CHECK (model IS NULL OR char_length(btrim(model)) BETWEEN 1 AND 120),
  ADD CONSTRAINT fleet_vehicles_model_year_check
    CHECK (model_year IS NULL OR model_year BETWEEN 1900 AND 2100);

CREATE TABLE IF NOT EXISTS public.fleet_odometer_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
  reading_date date NOT NULL,
  odometer_km bigint NOT NULL CHECK (odometer_km >= 0),
  reading_kind text NOT NULL CHECK (reading_kind IN ('initial', 'weekly')),
  correction_of uuid NULL REFERENCES public.fleet_odometer_readings(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_by_name text NOT NULL,
  voided_at timestamptz NULL,
  voided_by uuid NULL,
  voided_by_name text NULL,
  void_reason text NULL,
  CONSTRAINT fleet_reading_void_audit_check CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND voided_by_name IS NULL AND void_reason IS NULL)
    OR
    (voided_at IS NOT NULL AND voided_by IS NOT NULL AND voided_by_name IS NOT NULL AND void_reason IS NOT NULL AND char_length(btrim(void_reason)) >= 3)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_readings_active_date_key
ON public.fleet_odometer_readings (vehicle_id, reading_date)
WHERE voided_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_readings_one_initial_key
ON public.fleet_odometer_readings (vehicle_id)
WHERE reading_kind = 'initial' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS fleet_readings_vehicle_timeline_idx
ON public.fleet_odometer_readings (vehicle_id, reading_date, created_at);

ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_odometer_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read fleet vehicles" ON public.fleet_vehicles;
CREATE POLICY "Authenticated users read fleet vehicles"
ON public.fleet_vehicles FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users read fleet readings" ON public.fleet_odometer_readings;
CREATE POLICY "Authenticated users read fleet readings"
ON public.fleet_odometer_readings FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.fleet_vehicles FROM anon;
REVOKE ALL ON public.fleet_odometer_readings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fleet_vehicles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fleet_odometer_readings FROM authenticated;
GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT SELECT ON public.fleet_odometer_readings TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_normalize_plate(p_plate text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(upper(btrim(coalesce(p_plate, ''))), '[^A-Z0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.fleet_actor_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (
      SELECT nullif(btrim(p.nombre), '')
      FROM public.profiles p
      WHERE p.id = p_user_id OR p.auth_user_id = p_user_id
      ORDER BY CASE WHEN p.auth_user_id = p_user_id THEN 0 ELSE 1 END
      LIMIT 1
    ),
    'Usuario'
  )
$$;

CREATE OR REPLACE FUNCTION public.fleet_assert_write_access()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_section_access(v_user_id, 'servicios.flota') THEN
    RAISE EXCEPTION 'Sin acceso a Flota.' USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.fleet_create_vehicle(text, text, date, bigint);

CREATE OR REPLACE FUNCTION public.fleet_create_vehicle(
  p_brand text,
  p_plate text,
  p_model text DEFAULT NULL,
  p_initial_reading_date date DEFAULT NULL,
  p_initial_odometer_km bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.fleet_assert_write_access();
  v_actor_name text := public.fleet_actor_name(v_user_id);
  v_plate_normalized text := public.fleet_normalize_plate(p_plate);
  v_vehicle_id uuid;
BEGIN
  IF nullif(btrim(p_brand), '') IS NULL THEN
    RAISE EXCEPTION 'La marca es obligatoria.' USING ERRCODE = '22023';
  END IF;
  IF p_model IS NOT NULL AND char_length(btrim(p_model)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Ingresá un modelo válido.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_plate_normalized) NOT BETWEEN 3 AND 12 THEN
    RAISE EXCEPTION 'Ingresá una chapa válida.' USING ERRCODE = '22023';
  END IF;
  IF (p_initial_reading_date IS NULL) <> (p_initial_odometer_km IS NULL) THEN
    RAISE EXCEPTION 'Completá fecha y kilometraje inicial, o dejá ambos pendientes.' USING ERRCODE = '22023';
  END IF;
  IF p_initial_reading_date IS NOT NULL AND p_initial_reading_date > current_date THEN
    RAISE EXCEPTION 'Ingresá una fecha inicial válida.' USING ERRCODE = '22023';
  END IF;
  IF p_initial_odometer_km IS NOT NULL AND p_initial_odometer_km < 0 THEN
    RAISE EXCEPTION 'Ingresá un kilometraje inicial válido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fleet_vehicles (
    brand, model, plate, plate_normalized, created_by, created_by_name
  ) VALUES (
    btrim(p_brand), nullif(btrim(p_model), ''), upper(btrim(p_plate)), v_plate_normalized, v_user_id, v_actor_name
  )
  RETURNING id INTO v_vehicle_id;

  IF p_initial_reading_date IS NOT NULL THEN
    INSERT INTO public.fleet_odometer_readings (
      vehicle_id, reading_date, odometer_km, reading_kind, created_by, created_by_name
    ) VALUES (
      v_vehicle_id, p_initial_reading_date, p_initial_odometer_km, 'initial', v_user_id, v_actor_name
    );
  END IF;

  RETURN v_vehicle_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un vehículo con esa chapa.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_add_odometer_reading(
  p_vehicle_id uuid,
  p_reading_date date,
  p_odometer_km bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.fleet_assert_write_access();
  v_actor_name text := public.fleet_actor_name(v_user_id);
  v_previous_km bigint;
  v_next_km bigint;
  v_reading_id uuid;
  v_has_reading boolean;
BEGIN
  IF p_reading_date IS NULL OR p_reading_date > current_date THEN
    RAISE EXCEPTION 'Ingresá una fecha válida.' USING ERRCODE = '22023';
  END IF;
  IF p_odometer_km IS NULL OR p_odometer_km < 0 THEN
    RAISE EXCEPTION 'Ingresá un kilometraje válido.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.fleet_vehicles
  WHERE id = p_vehicle_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehículo no disponible.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fleet_odometer_readings
    WHERE vehicle_id = p_vehicle_id AND reading_date = p_reading_date AND voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya existe una lectura para esa fecha.' USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fleet_odometer_readings
    WHERE vehicle_id = p_vehicle_id AND voided_at IS NULL
  ) INTO v_has_reading;

  IF NOT v_has_reading THEN
    INSERT INTO public.fleet_odometer_readings (
      vehicle_id, reading_date, odometer_km, reading_kind, created_by, created_by_name
    ) VALUES (
      p_vehicle_id, p_reading_date, p_odometer_km, 'initial', v_user_id, v_actor_name
    )
    RETURNING id INTO v_reading_id;

    RETURN v_reading_id;
  END IF;

  SELECT odometer_km INTO v_previous_km
  FROM public.fleet_odometer_readings
  WHERE vehicle_id = p_vehicle_id AND voided_at IS NULL AND reading_date < p_reading_date
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;

  IF v_previous_km IS NULL THEN
    RAISE EXCEPTION 'La fecha debe ser posterior a la lectura inicial.' USING ERRCODE = '22023';
  END IF;

  SELECT odometer_km INTO v_next_km
  FROM public.fleet_odometer_readings
  WHERE vehicle_id = p_vehicle_id AND voided_at IS NULL AND reading_date > p_reading_date
  ORDER BY reading_date, created_at
  LIMIT 1;

  IF p_odometer_km < v_previous_km THEN
    RAISE EXCEPTION 'El kilometraje no puede ser menor que la lectura anterior.' USING ERRCODE = '22023';
  END IF;
  IF v_next_km IS NOT NULL AND p_odometer_km > v_next_km THEN
    RAISE EXCEPTION 'El kilometraje no puede superar la lectura posterior.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fleet_odometer_readings (
    vehicle_id, reading_date, odometer_km, reading_kind, created_by, created_by_name
  ) VALUES (
    p_vehicle_id, p_reading_date, p_odometer_km, 'weekly', v_user_id, v_actor_name
  )
  RETURNING id INTO v_reading_id;

  RETURN v_reading_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una lectura para esa fecha.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_correct_odometer_reading(
  p_reading_id uuid,
  p_reading_date date,
  p_odometer_km bigint,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.fleet_assert_write_access();
  v_actor_name text := public.fleet_actor_name(v_user_id);
  v_original public.fleet_odometer_readings%ROWTYPE;
  v_previous_km bigint;
  v_next_km bigint;
  v_replacement_id uuid;
BEGIN
  IF p_reading_date IS NULL OR p_reading_date > current_date THEN
    RAISE EXCEPTION 'Ingresá una fecha válida.' USING ERRCODE = '22023';
  END IF;
  IF p_odometer_km IS NULL OR p_odometer_km < 0 THEN
    RAISE EXCEPTION 'Ingresá un kilometraje válido.' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indicá el motivo de la corrección.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original
  FROM public.fleet_odometer_readings
  WHERE id = p_reading_id
  FOR UPDATE;

  IF NOT FOUND OR v_original.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'La lectura ya no está disponible.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.fleet_vehicles
  WHERE id = v_original.vehicle_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehículo no disponible.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fleet_odometer_readings
    WHERE vehicle_id = v_original.vehicle_id
      AND id <> v_original.id
      AND reading_date = p_reading_date
      AND voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya existe una lectura para esa fecha.' USING ERRCODE = '23505';
  END IF;

  SELECT odometer_km INTO v_previous_km
  FROM public.fleet_odometer_readings
  WHERE vehicle_id = v_original.vehicle_id
    AND id <> v_original.id
    AND voided_at IS NULL
    AND reading_date < p_reading_date
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;

  SELECT odometer_km INTO v_next_km
  FROM public.fleet_odometer_readings
  WHERE vehicle_id = v_original.vehicle_id
    AND id <> v_original.id
    AND voided_at IS NULL
    AND reading_date > p_reading_date
  ORDER BY reading_date, created_at
  LIMIT 1;

  IF v_original.reading_kind = 'initial' AND EXISTS (
    SELECT 1 FROM public.fleet_odometer_readings
    WHERE vehicle_id = v_original.vehicle_id
      AND id <> v_original.id
      AND voided_at IS NULL
      AND reading_date < p_reading_date
  ) THEN
    RAISE EXCEPTION 'La lectura inicial debe ser la primera fecha.' USING ERRCODE = '22023';
  END IF;
  IF v_original.reading_kind <> 'initial' AND v_previous_km IS NULL THEN
    RAISE EXCEPTION 'La fecha debe ser posterior a la lectura inicial.' USING ERRCODE = '22023';
  END IF;
  IF v_previous_km IS NOT NULL AND p_odometer_km < v_previous_km THEN
    RAISE EXCEPTION 'El kilometraje no puede ser menor que la lectura anterior.' USING ERRCODE = '22023';
  END IF;
  IF v_next_km IS NOT NULL AND p_odometer_km > v_next_km THEN
    RAISE EXCEPTION 'El kilometraje no puede superar la lectura posterior.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fleet_odometer_readings
  SET voided_at = now(),
      voided_by = v_user_id,
      voided_by_name = v_actor_name,
      void_reason = btrim(p_reason)
  WHERE id = v_original.id;

  INSERT INTO public.fleet_odometer_readings (
    vehicle_id, reading_date, odometer_km, reading_kind, correction_of,
    created_by, created_by_name
  ) VALUES (
    v_original.vehicle_id, p_reading_date, p_odometer_km, v_original.reading_kind,
    v_original.id, v_user_id, v_actor_name
  )
  RETURNING id INTO v_replacement_id;

  RETURN v_replacement_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe una lectura para esa fecha.' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_normalize_plate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_actor_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_assert_write_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_create_vehicle(text, text, text, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_add_odometer_reading(uuid, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_correct_odometer_reading(uuid, date, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fleet_create_vehicle(text, text, text, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_add_odometer_reading(uuid, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_correct_odometer_reading(uuid, date, bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
