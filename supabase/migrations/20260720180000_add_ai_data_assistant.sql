CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nueva consulta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  answer_mode text CHECK (answer_mode IN ('brief', 'analytic')),
  page_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT 'kimi-k2.5',
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12,6),
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx
  ON public.ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON public.ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ai_tool_runs_user_created_idx
  ON public.ai_tool_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage(user_id, created_at DESC);

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

INSERT INTO public.app_configuracion (clave, valor_numero, descripcion)
VALUES
  ('ai_daily_questions_limit', 50, 'Cantidad maxima diaria de preguntas por administrador'),
  ('ai_max_tool_calls', 4, 'Cantidad maxima de herramientas por respuesta'),
  ('ai_max_output_tokens', 1500, 'Tokens maximos de salida del asistente'),
  ('ai_timeout_seconds', 60, 'Tiempo maximo por consulta del asistente')
ON CONFLICT (clave) DO NOTHING;
