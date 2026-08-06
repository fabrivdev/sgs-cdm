-- Igual que correo_principal, el telefono del cliente vive directo en
-- clientes (no en contactos_cliente, que es para personas de contacto
-- nombradas aparte) -- el maestro de clientes de TOTVS trae un telefono
-- propio del cliente, no de una persona en particular.
alter table public.clientes add column if not exists telefono text;
