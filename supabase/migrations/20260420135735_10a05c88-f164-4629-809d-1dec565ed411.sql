CREATE TYPE public.tipo_trabajo AS ENUM ('Visita de campo','Máquina en taller');

ALTER TABLE public.servicios
  ADD COLUMN tipo_trabajo public.tipo_trabajo NOT NULL DEFAULT 'Visita de campo';