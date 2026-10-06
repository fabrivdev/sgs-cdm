-- Aplicación manual e incremental. Agrega responsables a Flota sin modificar
-- las migraciones ya aplicadas, usuarios, OS ni facturación.
BEGIN;

CREATE TABLE public.fleet_vehicle_responsibility_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
  responsible_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_name_snapshot text NULL,
  effective_date date NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  recorded_by_name text NOT NULL,
  CONSTRAINT fleet_responsibility_name_check CHECK (
    responsible_profile_id IS NULL
    OR char_length(btrim(responsible_name_snapshot)) > 0
  )
);

CREATE UNIQUE INDEX fleet_responsibility_one_baseline_idx
  ON public.fleet_vehicle_responsibility_events (vehicle_id)
  WHERE effective_date IS NULL;

CREATE INDEX fleet_responsibility_timeline_idx
  ON public.fleet_vehicle_responsibility_events (
    vehicle_id,
    effective_date DESC NULLS LAST,
    recorded_at DESC,
    id DESC
  );

ALTER TABLE public.fleet_vehicle_responsibility_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read fleet responsibilities"
ON public.fleet_vehicle_responsibility_events FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.fleet_vehicle_responsibility_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fleet_vehicle_responsibility_events FROM authenticated;
GRANT SELECT ON public.fleet_vehicle_responsibility_events TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_list_responsible_candidates()
RETURNS TABLE (
  id uuid,
  nombre text,
  sucursal public.sucursal,
  es_tecnico boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         p.nombre,
         p.sucursal,
         public.servicios_es_tecnico_activo(p.id) AS es_tecnico
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND public.has_section_access(auth.uid(), 'servicios.flota')
    AND p.activo IS DISTINCT FROM false
    AND (
      public.servicios_es_tecnico_activo(p.id)
      OR p.auth_user_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    )
  ORDER BY p.nombre, p.id;
$$;

CREATE OR REPLACE FUNCTION public.fleet_set_vehicle_responsible(
  p_vehicle_id uuid,
  p_responsible_profile_id uuid,
  p_effective_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := public.fleet_assert_write_access();
  v_actor_name text := public.fleet_actor_name(v_user_id);
  v_responsible_name text;
  v_event_id uuid;
BEGIN
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Ingresá la fecha efectiva del cambio.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.fleet_vehicles
  WHERE id = p_vehicle_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehículo no disponible.' USING ERRCODE = '22023';
  END IF;

  IF p_responsible_profile_id IS NOT NULL THEN
    SELECT p.nombre
    INTO v_responsible_name
    FROM public.profiles p
    WHERE p.id = p_responsible_profile_id
      AND p.activo IS DISTINCT FROM false
      AND (
        public.servicios_es_tecnico_activo(p.id)
        OR p.auth_user_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      );

    IF v_responsible_name IS NULL THEN
      RAISE EXCEPTION 'Responsable no disponible.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.fleet_vehicle_responsibility_events (
    vehicle_id,
    responsible_profile_id,
    responsible_name_snapshot,
    effective_date,
    recorded_by,
    recorded_by_name
  ) VALUES (
    p_vehicle_id,
    p_responsible_profile_id,
    nullif(btrim(v_responsible_name), ''),
    p_effective_date,
    v_user_id,
    v_actor_name
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_list_responsible_candidates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_set_vehicle_responsible(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_list_responsible_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_set_vehicle_responsible(uuid, uuid, date) TO authenticated;

-- Las dos fichas fuente que sí identificaban responsable no informaban fecha
-- de inicio. Se guardan como línea de base sin inventar una fecha. La
-- migración se detiene si chapa, cuenta autora o perfil no resuelven de forma
-- única; nunca crea usuarios ni elige entre homónimos.
DO $$
DECLARE
  v_actor_ids uuid[];
  v_vehicle_ids uuid[];
  v_profile_ids uuid[];
  v_seed record;
BEGIN
  SELECT array_agg(u.id ORDER BY u.id)
  INTO v_actor_ids
  FROM auth.users u
  WHERE lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py';

  IF coalesce(cardinality(v_actor_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'Se requiere exactamente la cuenta fabrizio.vega@cdm.com.py.';
  END IF;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('AAXR334'::text, 'Hugo Rodas'::text),
      ('AAXR336'::text, 'Ruben Monges'::text)
    ) AS seed(plate_normalized, responsible_name)
  LOOP
    SELECT array_agg(v.id ORDER BY v.id)
    INTO v_vehicle_ids
    FROM public.fleet_vehicles v
    WHERE v.plate_normalized = v_seed.plate_normalized;

    IF coalesce(cardinality(v_vehicle_ids), 0) <> 1 THEN
      RAISE EXCEPTION 'No se encontró una única camioneta con chapa %.', v_seed.plate_normalized;
    END IF;

    SELECT array_agg(p.id ORDER BY p.id)
    INTO v_profile_ids
    FROM public.profiles p
    WHERE lower(btrim(p.nombre)) = lower(v_seed.responsible_name)
      AND p.activo IS DISTINCT FROM false
      AND (
        public.servicios_es_tecnico_activo(p.id)
        OR p.auth_user_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      );

    IF coalesce(cardinality(v_profile_ids), 0) <> 1 THEN
      RAISE EXCEPTION 'No se encontró un único perfil activo para %.', v_seed.responsible_name;
    END IF;

    INSERT INTO public.fleet_vehicle_responsibility_events (
      vehicle_id,
      responsible_profile_id,
      responsible_name_snapshot,
      effective_date,
      recorded_by,
      recorded_by_name
    )
    SELECT
      v_vehicle_ids[1],
      v_profile_ids[1],
      v_seed.responsible_name,
      NULL,
      v_actor_ids[1],
      public.fleet_actor_name(v_actor_ids[1])
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fleet_vehicle_responsibility_events e
      WHERE e.vehicle_id = v_vehicle_ids[1]
        AND e.effective_date IS NULL
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
