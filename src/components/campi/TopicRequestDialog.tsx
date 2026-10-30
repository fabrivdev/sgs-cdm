import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { PanoramaTopic } from '@/lib/campi/panoramaPreferences';
import { ownRequests, requestStatusLabels, validateQuestion, type TopicRequest, type RequestStatus } from '@/lib/campi/topicRequests';
import { topicRequestApi, REQUESTS_UNAVAILABLE, type TopicRequestApi, type RequestInbox, type TopicRelease } from '@/lib/campi/topicRequestApi';

export function TopicRequestDialog({ userId, superadmin = false, topics, onChoose, api = topicRequestApi }: {
  userId: string; superadmin?: boolean; topics: readonly PanoramaTopic[]; onChoose?: () => void; api?: TopicRequestApi;
}) {
  const [open, setOpen] = useState(false), [inbox, setInbox] = useState<RequestInbox>({ rows: [], releases: [] });
  const [question, setQuestion] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [pending, setPending] = useState(false);
  const busy = useRef(false), token = useRef<{ key: string; question: string } | null>(null), generation = useRef(0), loadId = useRef(0);
  const enabled = api.enabled();
  const invalidate = useCallback(() => { generation.current++; loadId.current++; }, []);
  const refresh = useCallback(async () => {
    if (!api.enabled()) return;
    const current = generation.current, request = ++loadId.current;
    setLoading(true); setLoaded(false); setError('');
    setInbox(previous => ({ ...previous, rows: previous.rows.map(r => ({ ...r, notified: false })) }));
    try {
      const result = await api.load(userId, superadmin);
      if (current === generation.current && request === loadId.current) { setInbox(result); setLoaded(true); }
    } catch (e) { if (current === generation.current && request === loadId.current) setError(e instanceof Error ? e.message : 'No se pudo actualizar el seguimiento.'); }
    finally { if (current === generation.current && request === loadId.current) setLoading(false); }
  }, [api, userId, superadmin]);
  useEffect(() => {
    generation.current++; setInbox({ rows: [], releases: [] }); setQuestion(''); setNotice(''); setError(''); setLoaded(false); setPending(false); busy.current = false; token.current = null;
    void refresh();
    const visible = () => { if (!document.hidden && !busy.current) void refresh(); };
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { invalidate(); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, invalidate]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!enabled || busy.current) return;
    let value: string;
    try { value = validateQuestion(question); } catch (e) { setError((e as Error).message); return; }
    busy.current = true; setPending(true); setError(''); setNotice(''); const current = generation.current;
    if (token.current?.question !== value) token.current = { key: crypto.randomUUID(), question: value };
    try {
      await api.submit(userId, token.current.key, value);
      if (current !== generation.current) return;
      token.current = null; setQuestion(''); setNotice('Solicitud enviada. Podés consultar su estado en Mis solicitudes.');
      await refresh();
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'No se pudo confirmar el envío. Revisá el seguimiento antes de volver a enviar.'); }
    finally { if (current === generation.current) { busy.current = false; setPending(false); } }
  };
  const manage = async (row: TopicRequest, status: RequestStatus, topic: string, reason: string) => {
    if (!enabled || !superadmin || busy.current) return;
    busy.current = true; setPending(true); setError(''); setNotice(''); const current = generation.current;
    try {
      await api.manage(userId, row.id, status, topic, reason);
      if (current !== generation.current) return;
      setNotice('Estado actualizado.'); await refresh();
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'No se pudo confirmar el cambio. Actualizá el seguimiento.'); }
    finally { if (current === generation.current) { busy.current = false; setPending(false); } }
  };
  const available = (r: TopicRequest) => loaded && r.notified && topics.some(t => t.id === r.topicId);
  const own = ownRequests(inbox.rows, userId);
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value && !busy.current) void refresh(); }}>
    <DialogTrigger asChild><Button type="button" variant="link" size="sm" className="px-0">Proponer un tema</Button></DialogTrigger>
    {own.some(available) && <span role="status" className="block text-xs">Tenés un tema solicitado disponible. Abrí Proponer un tema para revisarlo.</span>}
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Proponer un tema</DialogTitle><DialogDescription>Las propuestas se revisan antes de decidir si pueden incorporarse. Este formulario no da una respuesta inmediata.</DialogDescription></DialogHeader>
      {!enabled && <p role="status">{REQUESTS_UNAVAILABLE}</p>}
      <form onSubmit={send} className="space-y-3"><label htmlFor="campi-topic-question" className="block font-medium">¿Qué te gustaría poder consultar en tu panorama?</label><Textarea id="campi-topic-question" disabled={!enabled || !loaded || pending} value={question} minLength={15} maxLength={1000} required aria-describedby="campi-topic-help" onChange={e => setQuestion(e.target.value)} /><p id="campi-topic-help" className="text-sm text-muted-foreground">Entre 15 y 1000 caracteres. Evitá datos personales innecesarios.</p><Button type="submit" disabled={!enabled || !loaded || pending}>{pending ? 'Guardando…' : 'Enviar propuesta'}</Button></form>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {enabled && <><Button variant="outline" disabled={pending || loading} onClick={() => void refresh()}>Actualizar seguimiento</Button>{loading && <p role="status">Consultando solicitudes…</p>}
        {loaded && <section aria-label="Mis solicitudes" className="space-y-3"><h3 className="font-semibold">Mis solicitudes</h3>{!own.length && <p>Todavía no registraste solicitudes.</p>}{own.map(r => <article key={r.id} className="rounded-md border p-3 space-y-2"><RequestSummary row={r} available={available(r)} />{available(r) && <div><p>El tema solicitado está disponible. Podés elegir si lo agregás a tu Panorama.</p><Button variant="outline" disabled={!onChoose} onClick={() => { setOpen(false); onChoose?.(); }}>Elegir mis temas</Button></div>}</article>)}</section>}
        {loaded && superadmin && <section aria-label="Gestión de solicitudes" className="space-y-3"><h3 className="font-semibold">Gestión de solicitudes</h3>{!inbox.rows.length && <p>No hay solicitudes registradas.</p>}{inbox.rows.map(r => <article key={`${r.id}:${r.status}`} className="rounded-md border p-3 space-y-2"><RequestSummary row={r} /><p className="text-xs break-all">Identificador de la cuenta solicitante: {r.owner}</p><Management request={r} releases={inbox.releases.filter(release => topics.some(t => t.id === release.id))} disabled={pending} onSave={(s, t, reason) => void manage(r, s, t, reason)} /></article>)}</section>}
      </>}
    </DialogContent>
  </Dialog>;
}
function RequestSummary({ row, available }: { row: TopicRequest; available?: boolean }) {
  return <><p className="whitespace-pre-wrap break-words">{row.question}</p><p className="text-sm">{row.status === 'disponible' && available === false ? 'La disponibilidad de este tema no está confirmada para tu cuenta.' : requestStatusLabels[row.status]} · {new Date(row.createdAt).toLocaleString('es-PY')}</p>{row.reason && <p className="text-sm whitespace-pre-wrap break-words">{row.reason}</p>}</>;
}
function Management({ request, releases, disabled, onSave }: { request: TopicRequest; releases: TopicRelease[]; disabled: boolean; onSave: (s: RequestStatus, t: string, r: string) => void }) {
  const [status, setStatus] = useState<RequestStatus>('preparacion'), [topic, setTopic] = useState(request.topicId ?? ''), [reason, setReason] = useState(request.reason);
  if (['disponible', 'no_viable'].includes(request.status)) return null;
  return <div className="space-y-2"><label className="block">Estado<select aria-label="Estado de la solicitud" disabled={disabled} className="block w-full rounded border p-2" value={status} onChange={e => setStatus(e.target.value as RequestStatus)}><option value="preparacion">En preparación</option><option value="disponible" disabled={request.status !== 'preparacion'}>Disponible</option><option value="no_viable">No viable</option></select></label>
    {status === 'disponible' && <><label className="block">Tema publicado<select aria-label="Tema publicado" disabled={disabled} className="block w-full rounded border p-2" value={topic} onChange={e => setTopic(e.target.value)}><option value="">Seleccionar un tema</option>{releases.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label><p className="text-sm">Se verificará que el solicitante tenga acceso antes de avisarle.</p></>}
    <label className="block">{status === 'no_viable' ? 'Motivo de la decisión' : 'Nota para el solicitante'}<Textarea aria-label="Nota para el solicitante" disabled={disabled} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
    <Button variant="outline" disabled={disabled || (status === 'disponible' && !topic) || (status === 'no_viable' && reason.trim().length < 10)} onClick={() => onSave(status, status === 'disponible' ? topic : '', reason)}>Guardar estado</Button>
  </div>;
}
