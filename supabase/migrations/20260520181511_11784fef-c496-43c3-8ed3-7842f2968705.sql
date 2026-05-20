-- Sequence for trabajos numero
CREATE SEQUENCE IF NOT EXISTS public.trabajos_numero_seq;

-- Add numero column
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS numero bigint;

-- Backfill existing rows in creation order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY creado_en, id) AS rn
  FROM public.trabajos
  WHERE numero IS NULL
)
UPDATE public.trabajos t
SET numero = o.rn
FROM ordered o
WHERE t.id = o.id;

-- Advance the sequence past existing max
SELECT setval(
  'public.trabajos_numero_seq',
  GREATEST(COALESCE((SELECT MAX(numero) FROM public.trabajos), 0), 1),
  true
);

-- Set default + not null + unique
ALTER TABLE public.trabajos
  ALTER COLUMN numero SET DEFAULT nextval('public.trabajos_numero_seq');

ALTER TABLE public.trabajos
  ALTER COLUMN numero SET NOT NULL;

ALTER SEQUENCE public.trabajos_numero_seq OWNED BY public.trabajos.numero;

CREATE UNIQUE INDEX IF NOT EXISTS trabajos_numero_unique ON public.trabajos(numero);

-- Generated display code column TR-000001
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS codigo text
  GENERATED ALWAYS AS ('TR-' || lpad(numero::text, 6, '0')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS trabajos_codigo_unique ON public.trabajos(codigo);