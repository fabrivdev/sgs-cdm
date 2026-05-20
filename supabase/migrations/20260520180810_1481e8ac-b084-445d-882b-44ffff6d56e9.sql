
-- 1) Agregar valor 'Cancelada' al enum estado_servicio si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'estado_servicio' AND e.enumlabel = 'Cancelada'
  ) THEN
    ALTER TYPE public.estado_servicio ADD VALUE 'Cancelada';
  END IF;
END$$;
