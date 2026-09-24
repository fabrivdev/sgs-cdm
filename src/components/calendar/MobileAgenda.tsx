import { ChevronRight } from "lucide-react";

export type AgendaDay<T> = {
  key: string; label: string; nonWorking?: string;
  events: { key: string; label: string; value: T; status: string }[];
  availability: { key: string; label: string }[];
};

/** Presentation only. Keeps each jornada and availability entry supplied by the caller. */
export function MobileAgenda<T>({ days, onDay, onEvent }: {
  days: AgendaDay<T>[]; onDay: (key: string) => void; onEvent: (value: T) => void;
}) {
  return <div className="min-w-0 divide-y rounded-lg border bg-card">
    {days.map(day => <section key={day.key} aria-label={day.label} className="min-w-0 px-3 py-1">
      <button type="button" onClick={() => onDay(day.key)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-[13px] font-semibold">
        <span className="min-w-0 capitalize">{day.label}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {day.nonWorking && <p className="pb-2 text-[12px] text-muted-foreground">{day.nonWorking}</p>}
      {day.availability.map(item => <p key={item.key} className="mb-1 break-words rounded bg-sky-50 px-2 py-2 text-[12px] text-sky-800">{item.label}</p>)}
      {day.events.map(event => <button key={event.key} type="button" onClick={() => onEvent(event.value)} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 border-t text-left text-[13px]" title={event.label}>
        <span className="min-w-0 truncate">{event.label}</span><span className="shrink-0 text-[11px] text-muted-foreground">{event.status}</span>
      </button>)}
      {!day.events.length && !day.availability.length && <p className="pb-3 text-[12px] text-muted-foreground">Sin actividades programadas</p>}
    </section>)}
  </div>;
}
