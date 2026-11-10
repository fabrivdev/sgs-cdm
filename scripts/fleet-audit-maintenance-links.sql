-- Solo lectura. No modifica vínculos, vehículos ni historial.
-- El vínculo por ID prevalece ante cambios de chapa; se compara el alias solo para detectar pendientes.
WITH datos AS (
 SELECT 'Historial'::text origen, id, plate, vehicle_id, occurred_on fecha
 FROM public.fleet_maintenance_history
 UNION ALL
 SELECT 'Factura', id, plate, vehicle_id, COALESCE(performed_on,invoice_date)
 FROM public.fleet_maintenance_invoices
), audit AS (
 SELECT d.*, v.plate chapa_actual, public.fleet_match_plate(d.plate) coincidencia_actual
 FROM datos d LEFT JOIN public.fleet_vehicles v ON v.id=d.vehicle_id
)
SELECT origen, plate chapa_original, chapa_actual, vehicle_id,
 CASE WHEN vehicle_id IS NOT NULL THEN 'Vinculado por ID'
      WHEN coincidencia_actual IS NOT NULL THEN 'Pendiente de vincular: coincidencia exacta'
      ELSE 'Sin coincidencia en flota o alias' END estado,
 COUNT(*) registros, MIN(fecha) primera_fecha, MAX(fecha) ultima_fecha,
 COUNT(*) FILTER(WHERE fecha IS NULL) sin_fecha,
 COUNT(*) FILTER(WHERE fecha >= date_trunc('year',CURRENT_DATE)::date) desde_inicio_anio
FROM audit
GROUP BY origen, plate, chapa_actual, vehicle_id, coincidencia_actual
ORDER BY origen, plate;
