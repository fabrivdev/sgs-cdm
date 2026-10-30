-- PREPARATION ONLY. Do not apply remotely without approval of these tables/functions/ACL.
BEGIN;
CREATE TABLE public.campi_topic_releases (
 topic_id text PRIMARY KEY, title text NOT NULL, sections text[] NOT NULL CHECK(cardinality(sections)>0),
 require_all boolean NOT NULL DEFAULT true, release_ref text NOT NULL CHECK(length(btrim(release_ref))>0),
 published_at timestamptz NOT NULL
);
-- This registry is written only by an approved deployment, AFTER actual publication.
-- No client/admin RPC can certify publication. No topics are seeded as published.
CREATE TABLE public.campi_topic_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id),
 client_key uuid NOT NULL, question text NOT NULL CHECK(length(btrim(question)) BETWEEN 15 AND 1000),
 status text NOT NULL DEFAULT 'recibida' CHECK(status IN ('recibida','preparacion','disponible','no_viable')),
 topic_id text REFERENCES public.campi_topic_releases(topic_id), reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id), UNIQUE(owner_id,client_key),
 CHECK(status<>'no_viable' OR length(btrim(reason))>=10), CHECK(length(reason)<=1000),
 CHECK(status<>'disponible' OR topic_id IS NOT NULL)
);
CREATE TABLE public.campi_topic_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE REFERENCES public.campi_topic_requests(id),
 owner_id uuid NOT NULL REFERENCES auth.users(id), topic_id text NOT NULL REFERENCES public.campi_topic_releases(topic_id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campi_topic_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campi_topic_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campi_topic_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY requests_read ON public.campi_topic_requests FOR SELECT TO authenticated
 USING(owner_id=auth.uid() OR public.has_role(auth.uid(),'superadmin'::public.app_role));
CREATE POLICY releases_read ON public.campi_topic_releases FOR SELECT TO authenticated USING(
 published_at<=now() AND (CASE WHEN require_all THEN
 (SELECT bool_and(public.has_module_access(auth.uid(),split_part(s,'.',1)) AND public.has_section_access(auth.uid(),s)) FROM unnest(sections)s)
 ELSE (SELECT bool_or(public.has_module_access(auth.uid(),split_part(s,'.',1)) AND public.has_section_access(auth.uid(),s)) FROM unnest(sections)s) END));
CREATE POLICY notices_read ON public.campi_topic_notices FOR SELECT TO authenticated USING(
 owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.campi_topic_releases r WHERE r.topic_id=campi_topic_notices.topic_id));
REVOKE ALL ON public.campi_topic_requests,public.campi_topic_releases,public.campi_topic_notices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.campi_topic_requests,public.campi_topic_releases,public.campi_topic_notices TO authenticated;
CREATE FUNCTION public.campi_submit_topic_request(p_key uuid,p_question text) RETURNS public.campi_topic_requests
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.campi_topic_requests; who uuid:=auth.uid();
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_question IS NULL OR length(btrim(p_question)) NOT BETWEEN 15 AND 1000 THEN RAISE EXCEPTION 'Pregunta inválida' USING ERRCODE='22023'; END IF;
 INSERT INTO public.campi_topic_requests(owner_id,client_key,question) VALUES(who,p_key,btrim(p_question))
 ON CONFLICT(owner_id,client_key) DO NOTHING;
 SELECT * INTO STRICT r FROM public.campi_topic_requests WHERE owner_id=who AND client_key=p_key;
 IF r.question<>btrim(p_question) THEN RAISE EXCEPTION 'Clave de envío reutilizada con contenido distinto' USING ERRCODE='22023'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION public.campi_manage_topic_request(p_id uuid,p_status text,p_topic text DEFAULT NULL,p_reason text DEFAULT '')
 RETURNS public.campi_topic_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.campi_topic_requests; t public.campi_topic_releases; permitted boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'superadmin'::public.app_role),false) THEN RAISE EXCEPTION 'Sólo superadmin' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT r FROM public.campi_topic_requests WHERE id=p_id FOR UPDATE;
 IF p_status IS NULL OR p_status NOT IN ('preparacion','disponible','no_viable') OR p_reason IS NULL OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Estado inválido' USING ERRCODE='22023'; END IF;
 IF r.status=p_status AND r.topic_id IS NOT DISTINCT FROM p_topic AND r.reason=btrim(p_reason) THEN RETURN r; END IF;
 IF r.status IN ('disponible','no_viable') OR (p_status='disponible' AND r.status<>'preparacion') THEN RAISE EXCEPTION 'Transición inválida' USING ERRCODE='22023'; END IF;
 IF p_status='no_viable' AND length(btrim(p_reason))<10 THEN RAISE EXCEPTION 'Motivo obligatorio' USING ERRCODE='22023'; END IF;
 IF p_status='disponible' THEN
  SELECT * INTO t FROM public.campi_topic_releases WHERE topic_id=p_topic AND published_at<=now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tema no publicado' USING ERRCODE='22023'; END IF;
  SELECT CASE WHEN t.require_all THEN bool_and(public.has_module_access(r.owner_id,split_part(s,'.',1)) AND public.has_section_access(r.owner_id,s))
   ELSE bool_or(public.has_module_access(r.owner_id,split_part(s,'.',1)) AND public.has_section_access(r.owner_id,s)) END INTO permitted FROM unnest(t.sections)s;
  IF NOT coalesce(permitted,false) THEN RAISE EXCEPTION 'Tema no autorizado para el solicitante' USING ERRCODE='42501'; END IF;
 END IF;
 UPDATE public.campi_topic_requests SET status=p_status,topic_id=p_topic,reason=btrim(p_reason),updated_at=now(),updated_by=auth.uid() WHERE id=p_id RETURNING * INTO r;
 IF p_status='disponible' THEN INSERT INTO public.campi_topic_notices(request_id,owner_id,topic_id) VALUES(r.id,r.owner_id,r.topic_id) ON CONFLICT(request_id) DO NOTHING; END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.campi_submit_topic_request(uuid,text),public.campi_manage_topic_request(uuid,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.campi_submit_topic_request(uuid,text),public.campi_manage_topic_request(uuid,text,text,text) TO authenticated;
COMMIT;
