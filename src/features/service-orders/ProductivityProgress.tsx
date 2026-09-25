const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

export function ProductivityProgress({ hours, target, label }: { hours: number; target: number; label: string }) {
  if (!(target > 0)) return <span aria-label={`${label}: meta no disponible`}>—</span>;
  const percent = hours / target * 100;
  const text = `${number.format(percent)}%`;
  return <div className="flex min-w-0 items-center justify-end gap-2" title={`${number.format(hours)} / ${number.format(target)} h · ${text}`}>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(100, percent)} aria-valuenow={Math.max(0, percent)}
      aria-valuetext={`${number.format(hours)} de ${number.format(target)} horas; ${text} de meta`}
      className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
    <span className="min-w-[3.5rem] shrink-0 text-right tabular-nums">{text}</span>
  </div>;
}
