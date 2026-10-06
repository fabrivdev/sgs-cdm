-- Aplicación manual posterior a 20261006132000_add_fleet_management.sql.
-- Alta idempotente del catálogo confirmado. No crea lecturas ni permisos.
BEGIN;

DO $$
DECLARE
  v_actor_id uuid;
  v_actor_name text;
  v_actor_count integer;
  v_confirmed_plates text[] := ARRAY[
    'AANS673', 'AANS680', 'AAXR323', 'AAMY981', 'AAXR306',
    'AASJ681', 'AAXR327', 'AAXR308', 'AAXR333', 'AAON294',
    'AAMY984', 'AAXR325', 'AAXR330', 'AAXR334', 'AAXR336'
  ];
BEGIN
  SELECT count(*), max(u.id::text)::uuid
  INTO v_actor_count, v_actor_id
  FROM auth.users u
  WHERE lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py';

  IF v_actor_count <> 1 OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Se esperaba exactamente una cuenta Fabrizio para auditar el alta; se encontraron %.', v_actor_count;
  END IF;

  v_actor_name := public.fleet_actor_name(v_actor_id);

  IF EXISTS (
    SELECT 1
    FROM public.fleet_vehicles fv
    WHERE fv.plate_normalized = ANY (v_confirmed_plates)
      AND fv.created_by <> v_actor_id
  ) THEN
    RAISE EXCEPTION 'Hay chapas confirmadas creadas por otra cuenta. Revisá antes de ejecutar el seed.';
  END IF;

  INSERT INTO public.fleet_vehicles (
    brand,
    model,
    model_year,
    plate,
    plate_normalized,
    active,
    created_by,
    created_by_name
  )
  SELECT
    confirmed.brand,
    confirmed.model,
    confirmed.model_year,
    confirmed.plate,
    public.fleet_normalize_plate(confirmed.plate),
    true,
    v_actor_id,
    v_actor_name
  FROM (VALUES
    ('MAXUS', 'T60 CONFORT 4X4', 2023::smallint, 'AANS-673'),
    ('MAXUS', 'T60 CONFORT 4X4', 2023::smallint, 'AANS-680'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-323'),
    ('ISUZU', 'D-MAX', 2023::smallint, 'AAMY-981'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-306'),
    ('MITSUBISHI', 'L200 TRITON SPORT GL 4X4', 2023::smallint, 'AASJ-681'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-327'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-308'),
    ('ISUZU', 'D-MAX', 2026::smallint, 'AAXR-333'),
    ('ISUZU', 'D-MAX 4X4 C/S', 2023::smallint, 'AAON-294'),
    ('ISUZU', 'D-MAX', 2023::smallint, 'AAMY-984'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-325'),
    ('ISUZU', 'D-MAX', 2026::smallint, 'AAXR-330'),
    ('ISUZU', 'D-MAX', 2025::smallint, 'AAXR-334'),
    ('ISUZU', 'D-MAX', 2026::smallint, 'AAXR-336')
  ) AS confirmed(brand, model, model_year, plate)
  ON CONFLICT (plate_normalized) DO UPDATE
  SET brand = EXCLUDED.brand,
      model = EXCLUDED.model,
      model_year = EXCLUDED.model_year,
      plate = EXCLUDED.plate,
      active = true;

  IF (
    SELECT count(*)
    FROM public.fleet_vehicles fv
    WHERE fv.plate_normalized = ANY (v_confirmed_plates)
  ) <> 15 THEN
    RAISE EXCEPTION 'El catálogo confirmado no quedó con las 15 chapas esperadas.';
  END IF;
END;
$$;

COMMIT;
