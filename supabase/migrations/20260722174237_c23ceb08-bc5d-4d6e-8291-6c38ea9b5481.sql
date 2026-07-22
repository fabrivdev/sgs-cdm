GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_tool_runs TO authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;

GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
GRANT ALL ON public.ai_tool_runs TO service_role;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users manage own AI conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users manage own AI messages" ON public.ai_messages;
CREATE POLICY "Users manage own AI messages"
  ON public.ai_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users read own AI tool runs" ON public.ai_tool_runs;
CREATE POLICY "Users read own AI tool runs"
  ON public.ai_tool_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users read own AI usage" ON public.ai_usage;
CREATE POLICY "Users read own AI usage"
  ON public.ai_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';