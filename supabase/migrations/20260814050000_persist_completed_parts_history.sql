-- Persiste la preparación ya completada por lotes. La demanda mensual existe
-- y no debe depender de que el RPC informativo de calidad responda al recargar.

UPDATE public.repuestos_facturacion_historica_cargas c
SET
  publicacion_estado = 'COMPLETADO',
  publicado_en = coalesce(c.publicado_en, now()),
  publicacion_hasta = greatest(coalesce(c.publicacion_hasta, DATE '2026-07-01'), DATE '2026-07-01')
WHERE c.activo
  AND c.estado = 'COMPLETADO'
  AND (
    c.publicacion_estado = 'COMPLETADO'
    OR c.publicacion_hasta >= DATE '2026-07-01'
    OR (
      SELECT count(DISTINCT d.mes)
      FROM public.repuestos_demanda_mensual d
      WHERE d.mes >= DATE '2025-08-01' AND d.mes < DATE '2026-07-01'
    ) = 11
  );

NOTIFY pgrst, 'reload schema';
