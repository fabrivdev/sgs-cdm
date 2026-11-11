BEGIN;
CREATE OR REPLACE FUNCTION public.fleet_save_vehicle_assignment(
 p_id uuid, p_data jsonb, p_responsible_profile_id uuid,
 p_effective_date date, p_expected_assignment_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_assignment public.fleet_vehicle_responsibility_events%ROWTYPE;
 today_py date := (now() AT TIME ZONE 'America/Asuncion')::date;
BEGIN
 PERFORM public.fleet_assert_write_access();
 PERFORM 1 FROM public.fleet_vehicles WHERE id=p_id AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vehículo no disponible.'; END IF;
 SELECT * INTO current_assignment FROM public.fleet_vehicle_responsibility_events
 WHERE vehicle_id=p_id AND (effective_date IS NULL OR effective_date <= today_py)
 ORDER BY effective_date DESC NULLS LAST, recorded_at DESC, id DESC LIMIT 1;
 IF current_assignment.id IS DISTINCT FROM p_expected_assignment_id THEN
  RAISE EXCEPTION 'El responsable cambió desde que abriste el formulario. Cerrá y volvé a abrir Editar vehículo.' USING ERRCODE='40001';
 END IF;
 IF p_effective_date IS NULL OR p_effective_date > today_py OR p_effective_date < current_assignment.effective_date THEN
  RAISE EXCEPTION 'Ingresá una fecha de asignación válida, no anterior a la actual ni posterior a hoy.' USING ERRCODE='22023';
 END IF;
 -- Append via the existing audited assignment flow; never update or delete past events.
 -- Save both operations in this transaction, including rollback on any failure.
 PERFORM public.fleet_set_vehicle_responsible(p_id,p_responsible_profile_id,p_effective_date);
 PERFORM public.fleet_save_vehicle(p_id,p_data);
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.fleet_save_vehicle_assignment(uuid,jsonb,uuid,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_save_vehicle_assignment(uuid,jsonb,uuid,date,uuid) TO authenticated;
COMMIT;
