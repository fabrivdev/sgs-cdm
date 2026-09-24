-- El informe de apertura omitió una venta pendiente anterior al corte para el
-- cabezal NB. La NP histórica continúa pendiente y no tiene factura vinculada,
-- por lo que el saldo operativo verificado es 1, no 0.

BEGIN;

DO $$
DECLARE
  v_filas integer;
BEGIN
  UPDATE public.parque_stock_proyectado_apertura
  SET ventas_pendientes_inicial=1
  WHERE fecha_corte=date '2026-08-31'
    AND marca='NB'
    AND modelo_clave=public.parque_modelo_clave('NB MAICERO 20L X 45CM');

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas<>1 THEN
    RAISE EXCEPTION 'No se encontró una única apertura para NB MAICERO 20L X 45CM';
  END IF;
END $$;

COMMIT;
