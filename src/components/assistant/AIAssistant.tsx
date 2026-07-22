import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, CircleStop, Clock3, Database, History, Loader2, MessageSquarePlus, Send, Sparkles, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type Source = { tool: string; label: string; filters?: Record<string, unknown> };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string; sources?: Source[] };
type AnswerMode = "brief" | "analytic";

const examples = [
  "¿Cuántos trabajos están pendientes y cuáles llevan más tiempo abiertos?",
  "Compará la facturación por sucursal del período visible.",
  "¿Qué técnicos tienen carga esta semana y quiénes no?",
  "¿Cuántas OS cerradas hubo por tipo de tiempo?",
];

type AssistantError = string | {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function friendlyError(error: AssistantError) {
  const message = typeof error === "string" ? error : error.message ?? "Error desconocido del asistente.";
  const code = typeof error === "string" ? "" : error.code ?? "";
  const diagnostic = [code, message, typeof error === "string" ? "" : error.details, typeof error === "string" ? "" : error.hint]
    .filter(Boolean)
    .join(" ");

  if (/PGRST205|42P01|relation .* does not exist|could not find the table .*schema cache/i.test(diagnostic)) {
    return "Falta crear las tablas del asistente en Supabase.";
  }
  if (/42501|permission denied|row-level security|violates row-level security/i.test(diagnostic)) {
    return "Las tablas del asistente existen, pero tu usuario no tiene permiso para usarlas. Aplicá la migración de permisos del asistente.";
  }
  if (/GROQ_API_KEY/i.test(diagnostic)) return "Falta configurar GROQ_API_KEY en Lovable Cloud Secrets.";
  if (/rate limit|limite gratuito|too many requests/i.test(diagnostic)) return "Se alcanzó el límite gratuito de Groq. Intentá nuevamente más tarde.";
  return message;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function MessageBody({ content }: { content: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {content.split(/\n{2,}/).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
    </div>
  );
}

export function AIAssistant() {
  const { isAdmin, session } = useAuth();
  const isMobile = useIsMobile();
  const { context } = useAssistantPageContext();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("brief");
  const [includeContext, setIncludeContext] = useState(true);
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const contextSummary = useMemo(() => {
    const values = Object.entries(context.filters).filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length));
    return values.length ? `${context.module} · ${values.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join(" · ")}` : context.module;
  }, [context]);

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);
    // The generated Database type is updated only after the migration is deployed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: queryError } = await (supabase as any)
      .from("ai_conversations")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    setLoadingHistory(false);
    if (queryError) {
      setError(friendlyError(queryError));
      return;
    }
    setConversations(data ?? []);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingHistory(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: queryError } = await (supabase as any)
      .from("ai_messages")
      .select("id,role,content,created_at,sources")
      .eq("conversation_id", id)
      .order("created_at");
    setLoadingHistory(false);
    if (queryError) {
      setError(friendlyError(queryError));
      return;
    }
    setConversationId(id);
    setMessages(data ?? []);
    setError("");
  }, []);

  useEffect(() => {
    if (open) void loadConversations();
  }, [loadConversations, open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setQuestion("");
    setError("");
  };

  const deleteConversation = async () => {
    if (!conversationId || sending) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any).from("ai_conversations").delete().eq("id", conversationId);
    if (deleteError) {
      setError(friendlyError(deleteError));
      return;
    }
    newConversation();
    await loadConversations();
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  };

  const send = async (suggestion?: string) => {
    const text = (suggestion ?? question).trim();
    if (!text || sending || !session?.access_token) return;
    const optimistic: Message = { id: `local-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setQuestion("");
    setError("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${baseUrl}/functions/v1/ai-data-assistant`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, message: text, mode, context: includeContext ? context : {} }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `No se pudo consultar Kimi (${response.status})`);
      setConversationId(payload.conversation_id);
      setMessages((current) => [...current, payload.message]);
      await loadConversations();
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("Consulta detenida.");
      } else {
        setError(friendlyError(requestError instanceof Error ? requestError.message : String(requestError)));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 h-11 w-11 rounded-full shadow-lg md:bottom-5 md:right-5"
        aria-label="Abrir asistente de datos"
        title="Asistente de datos"
      >
        <Sparkles className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("flex gap-0 p-0", isMobile ? "h-[88dvh] rounded-t-lg" : "w-full sm:max-w-[560px]")}
        >
          <div className="flex min-h-0 w-full flex-col">
            <SheetHeader className="border-b px-4 py-3 pr-12 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Asistente de datos</SheetTitle>
                  <SheetDescription className="truncate">Groq · solo lectura</SheetDescription>
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1"><History className="h-3.5 w-3.5" />Historial</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      {loadingHistory && <div className="p-3 text-xs text-muted-foreground">Cargando...</div>}
                      {!loadingHistory && conversations.length === 0 && <div className="p-3 text-xs text-muted-foreground">Sin conversaciones guardadas.</div>}
                      {conversations.map((conversation) => (
                        <DropdownMenuItem key={conversation.id} onClick={() => void loadMessages(conversation.id)} className="flex-col items-start gap-0.5">
                          <span className="max-w-full truncate text-sm font-medium">{conversation.title}</span>
                          <span className="text-[10px] text-muted-foreground">{formatTime(conversation.updated_at)}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={newConversation} title="Nueva conversación"><MessageSquarePlus className="h-4 w-4" /></Button>
                  {conversationId && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void deleteConversation()} title="Eliminar conversación"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            </SheetHeader>

            <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
              <div className="inline-flex rounded-md border bg-background p-0.5">
                <button type="button" onClick={() => setMode("brief")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "brief" && "bg-primary text-primary-foreground")}>Breve</button>
                <button type="button" onClick={() => setMode("analytic")} className={cn("rounded px-3 py-1 text-xs font-medium", mode === "analytic" && "bg-primary text-primary-foreground")}>Analítica</button>
              </div>
              <button
                type="button"
                onClick={() => setIncludeContext((value) => !value)}
                className={cn("flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", includeContext ? "border-primary/30 bg-primary/5 text-primary" : "text-muted-foreground")}
                title={contextSummary}
              >
                {includeContext ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                <span className="max-w-[190px] truncate">{contextSummary}</span>
              </button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-4">
                {messages.length === 0 && (
                  <div className="space-y-4 py-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Database className="h-6 w-6" /></div>
                    <div className="text-center">
                      <h3 className="font-semibold">Preguntá sobre los datos de la app</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Las cifras se consultan en Supabase mediante herramientas de solo lectura.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {examples.map((example) => (
                        <button key={example} type="button" onClick={() => void send(example)} className="rounded-md border p-3 text-left text-xs leading-relaxed transition-colors hover:border-primary/40 hover:bg-primary/5">{example}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[92%] rounded-lg px-3 py-2.5", message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>
                      <MessageBody content={message.content} />
                      {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                        <Collapsible className="mt-3 border-t pt-2">
                          <CollapsibleTrigger className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground">
                            <span>{message.sources.length} fuentes consultadas</span><ChevronDown className="h-3.5 w-3.5" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-1.5">
                            {message.sources.map((source, index) => (
                              <div key={`${source.tool}-${index}`} className="rounded bg-muted/60 px-2 py-1.5 text-[10px] text-muted-foreground">
                                <div className="font-medium text-foreground">{source.label}</div>
                                {source.filters && Object.keys(source.filters).length > 0 && <div className="mt-0.5 break-all">{JSON.stringify(source.filters)}</div>}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="flex justify-start"><div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Consultando fuentes...</div></div>
                )}
                {error && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            <div className="border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-2 focus-within:ring-primary/30">
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Preguntá por trabajos, facturación, OS, técnicos..."
                  className="min-h-[44px] max-h-32 resize-none border-0 p-1.5 shadow-none focus-visible:ring-0"
                  disabled={sending}
                />
                {sending ? (
                  <Button type="button" size="icon" variant="outline" onClick={stop} className="h-9 w-9 shrink-0" title="Detener"><CircleStop className="h-4 w-4" /></Button>
                ) : (
                  <Button type="button" size="icon" onClick={() => void send()} disabled={!question.trim()} className="h-9 w-9 shrink-0" title="Enviar"><Send className="h-4 w-4" /></Button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" />Puede cometer errores; verificá cifras críticas en la fuente indicada.</div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
