const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

export function ProductivityProgress({ hours, target, label, partial = false, stacked = false }: { hours: number; target: number; label: string; partial?: boolean; stacked?: boolean }) {
  if (!(target > 0)) return <span aria-label={`${label}: meta no disponible`}>—</span>;
  const percent = hours / target * 100;
  const text = `${number.format(percent)}%`;
  const status = partial ? " · Parcial: solo horas válidas" : "";
  if (stacked) return <div className="flex min-w-0 flex-col items-stretch gap-1 text-right" title={`${number.format(hours)} / ${number.format(target)} h · ${text}${status}`}>
    <span className="tabular-nums">{text}</span>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(100, percent)} aria-valuenow={Math.max(0, percent)}
      aria-valuetext={`${number.format(hours)} de ${number.format(target)} horas; ${text} de meta${status}`}
      className="h-1.5 min-w-6 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  </div>;
  return <div className="flex min-w-0 items-center justify-end gap-2" title={`${number.format(hours)} / ${number.format(target)} h · ${text}${status}`}>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(100, percent)} aria-valuenow={Math.max(0, percent)}
      aria-valuetext={`${number.format(hours)} de ${number.format(target)} horas; ${text} de meta${status}`}
      className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
    <span className="min-w-[3.5rem] shrink-0 text-right tabular-nums">{text}</span>
  </div>;
}
