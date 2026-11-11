BEGIN;
-- Contacts belong only to Fleet; never insert profiles or authentication accounts.
CREATE TABLE public.fleet_responsible_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 201),
 given_names text, surnames text, short_name text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE UNIQUE INDEX fleet_responsible_contacts_name_key ON public.fleet_responsible_contacts
 (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')));
ALTER TABLE public.fleet_responsible_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_responsible_contacts FROM anon, authenticated;
ALTER TABLE public.fleet_vehicle_responsibility_events
 ADD COLUMN responsible_contact_id uuid REFERENCES public.fleet_responsible_contacts(id) ON DELETE RESTRICT,
 ADD COLUMN responsible_short_name_snapshot text,
 ADD CONSTRAINT fleet_responsibility_single_identity CHECK (responsible_contact_id IS NULL OR responsible_profile_id IS NULL);
-- Make imported names searchable without rewriting any historical event or guessing name parts.
INSERT INTO public.fleet_responsible_contacts(full_name)
SELECT min(btrim(e.responsible_name_snapshot)) FROM public.fleet_vehicle_responsibility_events e
WHERE e.responsible_profile_id IS NULL AND nullif(btrim(e.responsible_name_snapshot),'') IS NOT NULL
 AND lower(btrim(e.responsible_name_snapshot)) NOT IN ('sin asignación','sin asignacion','sin responsable')
 AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE lower(btrim(p.nombre))=lower(btrim(e.responsible_name_snapshot)))
GROUP BY lower(regexp_replace(btrim(e.responsible_name_snapshot), '\s+', ' ', 'g'));

CREATE FUNCTION public.fleet_list_responsible_options()
RETURNS TABLE(id uuid,nombre text,sucursal public.sucursal,es_tecnico boolean,source text,short_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.fleet_assert_write_access();
 RETURN QUERY SELECT p.id,p.nombre,p.sucursal,p.es_tecnico,'profile'::text,NULL::text
 FROM public.fleet_list_responsible_candidates() p
 UNION ALL SELECT c.id,c.full_name,NULL::public.sucursal,false,'fleet'::text,c.short_name
 FROM public.fleet_responsible_contacts c WHERE c.active;
END $$;

CREATE FUNCTION public.fleet_save_vehicle_responsible(
 p_id uuid,p_data jsonb,p_responsible_id uuid,p_source text,p_names text,p_surnames text,
 p_effective_date date,p_expected_assignment_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid := public.fleet_assert_write_access();
 current_assignment public.fleet_vehicle_responsibility_events%ROWTYPE;
 today_py date := (now() AT TIME ZONE 'America/Asuncion')::date;
 contact_id uuid; profile_id uuid; full_label text; short_label text;
 names_clean text := regexp_replace(btrim(p_names),'\s+',' ','g');
 surnames_clean text := regexp_replace(btrim(p_surnames),'\s+',' ','g');
BEGIN
 PERFORM 1 FROM public.fleet_vehicles WHERE id=p_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vehículo no disponible.'; END IF;
 SELECT * INTO current_assignment FROM public.fleet_vehicle_responsibility_events
 WHERE vehicle_id=p_id AND (effective_date IS NULL OR effective_date<=today_py)
 ORDER BY effective_date DESC NULLS LAST,recorded_at DESC,id DESC LIMIT 1;
 IF current_assignment.id IS DISTINCT FROM p_expected_assignment_id THEN
  RAISE EXCEPTION 'El responsable cambió. Cerrá y volvé a abrir el formulario.' USING ERRCODE='40001';
 END IF;
 IF p_effective_date IS NULL OR p_effective_date>today_py OR p_effective_date<current_assignment.effective_date THEN
  RAISE EXCEPTION 'Ingresá una fecha de asignación válida, no anterior a la actual ni posterior a hoy.' USING ERRCODE='22023';
 END IF;
 IF p_source='new' THEN
  IF p_responsible_id IS NOT NULL OR coalesce(length(names_clean),0) NOT BETWEEN 1 AND 100 OR coalesce(length(surnames_clean),0) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Completá nombres y apellidos (hasta 100 caracteres cada uno).';
  END IF;
  full_label := names_clean || ' ' || surnames_clean;
  IF EXISTS(SELECT 1 FROM public.fleet_list_responsible_options() c
   WHERE lower(regexp_replace(btrim(c.nombre),'\s+',' ','g'))=lower(full_label)) THEN
   RAISE EXCEPTION 'Ese nombre completo ya existe. Buscalo y seleccionalo en Responsable.' USING ERRCODE='23505';
  END IF;
  -- Preserve surname particles, e.g. De la Cruz / De Oliveira / Del Valle.
  short_label := split_part(names_clean,' ',1) || ' ' ||
   coalesce(substring(surnames_clean from '(?i)^((?:(?:de|del|la|las|los|da|das|do|dos|van|von)\s+)*[^ ]+)'),surnames_clean);
  BEGIN
   INSERT INTO public.fleet_responsible_contacts(full_name,given_names,surnames,short_name,created_by)
   VALUES(full_label,names_clean,surnames_clean,short_label,actor) RETURNING id INTO contact_id;
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Ese nombre completo ya existe. Actualizá y seleccionalo en Responsable.' USING ERRCODE='23505';
  END;
 ELSIF p_source='fleet' THEN
  SELECT c.id,c.full_name,c.short_name INTO contact_id,full_label,short_label
  FROM public.fleet_responsible_contacts c WHERE c.id=p_responsible_id AND c.active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsable no disponible.'; END IF;
 ELSIF p_source='profile' THEN
  SELECT c.id,c.nombre INTO profile_id,full_label FROM public.fleet_list_responsible_candidates() c WHERE c.id=p_responsible_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsable no disponible.'; END IF;
 ELSIF p_source='none' AND p_responsible_id IS NULL THEN NULL;
 ELSE RAISE EXCEPTION 'Selección de responsable inválida.';
 END IF;
 INSERT INTO public.fleet_vehicle_responsibility_events
 (vehicle_id,responsible_profile_id,responsible_contact_id,responsible_name_snapshot,responsible_short_name_snapshot,effective_date,recorded_by,recorded_by_name)
 VALUES(p_id,profile_id,contact_id,full_label,short_label,p_effective_date,actor,public.fleet_actor_name(actor));
 IF p_data IS NOT NULL THEN PERFORM public.fleet_save_vehicle(p_id,p_data); END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.fleet_list_responsible_options() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_save_vehicle_responsible(uuid,jsonb,uuid,text,text,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_list_responsible_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_save_vehicle_responsible(uuid,jsonb,uuid,text,text,text,date,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
