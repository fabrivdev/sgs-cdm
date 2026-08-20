-- Algunas bases productivas no recibieron la migracion antigua que definia
-- este normalizador. El reconciliador de codigos legacy debe ser autocontenido.

CREATE OR REPLACE FUNCTION public.normalizar_texto_repuesto(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        translate(
          upper(trim(coalesce(p_texto, ''))),
          'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'AAAAAEEEEIIIIOOOOOUUUUNC'
        ),
        '[^A-Z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.normalizar_texto_repuesto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_texto_repuesto(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
