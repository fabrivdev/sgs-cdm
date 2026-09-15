BEGIN;
-- Requiere 20260915180000. Solo cambia la identidad del reporte, nunca los movimientos.
-- Alias contrastados en query-results-export-2026-09-15_17-14-50.csv.
-- Normalizar ANTES del GROUP BY y la paginación evita filas duplicadas por vendedor.
CREATE OR REPLACE FUNCTION public.ventas_repuestos_normalizar_vendedor(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  WITH limpio AS (
    SELECT btrim(upper(regexp_replace(regexp_replace(btrim(coalesce(p_nombre,'')),
      '^([0-9]+([[:space:]]*[-–—:][[:space:]]*|[[:space:]]+)|[A-Za-z]{1,4}[0-9]+[[:space:]]*[-–—:][[:space:]]*)',
      ''), '[[:space:]]+', ' ', 'g'))) nombre
  ), clave AS (SELECT nombre,translate(nombre,'ÁÉÍÓÚÜÑ','AEIOUUN') valor FROM limpio)
  SELECT CASE
    WHEN nombre='' OR nombre ~ '^[-–—]+$' OR nombre ~ '^([0-9]+|[A-Z]{1,4}[0-9]+)$' THEN NULL
    WHEN valor IN ('CARLOS JAVIER BENITEZ ZARZA','CARLOS BENITEZ') THEN 'CARLOS BENITEZ'
    WHEN valor IN ('OSCAR DANIEL BENITEZ MEZA','OSCAR BENITEZ') THEN 'OSCAR BENITEZ'
    WHEN valor IN ('LUIS ANDRES CANETE RODRIGUEZ','ANDRES CANETE','LUIS CANETE') THEN 'LUIS CAÑETE'
    WHEN valor IN ('JUAN DANIEL APODACA FERREIRA','JUAN APODACA') THEN 'JUAN APODACA'
    WHEN valor IN ('RUBEN JUAN ANTONIO CENTURION RAMOS','RUBEN CENTURION') THEN 'RUBEN CENTURION'
    WHEN valor IN ('HELWIN LOPEZ BORGES','HELWIN LOPEZ') THEN 'HELWIN LOPEZ'
    WHEN valor IN ('ABEL LOPEZ GONZALEZ','ABEL LOPEZ') THEN 'ABEL LOPEZ'
    WHEN valor IN ('ARNALDO JOSE ALMADA GONZALEZ','ARNALDO ALMADA','ARNADLO ALMADA') THEN 'ARNALDO ALMADA'
    WHEN valor='RUBEN ROTELA' THEN 'RUBEN ROTELA'
    WHEN valor IN ('FERNANDO PETTER ANTES','FERNANDO PETTER') THEN 'FERNANDO PETTER'
    WHEN valor IN ('LUCAS MAUGER QUIRING','LUCAS MAUGER') THEN 'LUCAS MAUGER'
    WHEN valor IN ('FRANCISCO JAVIER NALERIO LAURENT','JAVIER NALERIO','FRANCISCO NALERIO') THEN 'FRANCISCO NALERIO'
    WHEN valor IN ('MAURO CABALLERO LOPEZ','MAURO CABALLERO') THEN 'MAURO CABALLERO'
    WHEN valor IN ('WILLIAM DAVID CHAVEZ','WILLIAM CHAVEZ') THEN 'WILLIAM CHAVEZ'
    WHEN valor IN ('PEDRO HECTOR SERVIAN ACUNA','PEDRO SERVIAN') THEN 'PEDRO SERVIAN'
    WHEN valor IN ('TIAGO ALEX LANDO DE MOURA','TIAGO LANDO') THEN 'TIAGO LANDO'
    WHEN valor IN ('ROQUE ANTONIO ZARATE MEDINA','ROQUE ZARATE') THEN 'ROQUE ZARATE'
    WHEN valor IN ('MONICA ROCHA RABELO','MONICA ROCHA') THEN 'MONICA ROCHA'
    ELSE nombre -- No fusionar desconocidos por compartir un nombre o apellido.
  END FROM clave;
$$;
REVOKE ALL ON FUNCTION public.ventas_repuestos_normalizar_vendedor(text) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
