import type { PanoramaStory } from './panoramaStoryTypes';

export type DateRange = { from: string; to: string };
export type StoryTime = {
  window?: DateRange; comparison?: DateRange; closedMonth?: boolean;
  classificationDate?: string; observedAt?: string; inventoryCutoff?: string; importedAt?: string;
};
export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function formatDay(value: string): string {
  if (!validDay(value)) throw new Error('Fecha inválida.');
  return `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}
export function formatRange({ from, to }: DateRange): string {
  if (from > to) throw new Error('Rango invertido.');
  return `${formatDay(from)}–${formatDay(to)}`;
}
export function formatMonth(value: string): string {
  if (!validDay(value)) throw new Error('Mes inválido.');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${months[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
}
export function monthWindows(to: string, count = 6): DateRange[] {
  if (!validDay(to)) throw new Error('Fecha inválida.');
  const [year, month] = to.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(Date.UTC(year, month - count + i, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month - count + i + 1, 0)).toISOString().slice(0, 10);
    return { from, to: end > to ? to : end };
  });
}
/** Display semantics explicitly; classification/import time never becomes inventory cutoff. */
export function storyDateLines(story: Pick<PanoramaStory, 'time' | 'periodLabel' | 'navigationPeriod'>): string[] {
  const time = story.time;
  if (time?.comparison && time.window) return [`Base ${formatRange(time.comparison)}`, `Recompra ${formatRange(time.window)}`];
  if (time?.classificationDate) return [`Clasificación ${formatDay(time.classificationDate)}`];
  if (time?.window) return [`${time.closedMonth ? 'Mes cerrado ' : ''}${formatRange(time.window)}`];
  if (time?.observedAt) return [`Lectura ${formatDay(time.observedAt)}`];
  if (story.navigationPeriod && validDay(story.navigationPeriod.from) && validDay(story.navigationPeriod.to)) return [formatRange(story.navigationPeriod)];
  return [story.periodLabel];
}

export function formatDateText(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, value => validDay(value) ? formatDay(value) : value);
}
export function storyDetailDateLines(story: PanoramaStory): string[] {
  const lines = storyDateLines(story).map(formatDateText);
  if (story.time?.window && !story.time.comparison && !story.time.closedMonth) lines[0] = 'Período ' + lines[0];
  if (story.time?.inventoryCutoff) lines.push('Corte de inventario ' + formatDay(story.time.inventoryCutoff));
  if (story.time?.importedAt) lines.push('Importación ' + formatDay(story.time.importedAt.slice(0, 10)));
  if (story.cutoff) lines.push((['servicios_eficiencia','servicios_os_facturadas'].includes(story.id) ? 'Corte documental ' : 'Corte de consulta ') + formatDay(story.cutoff));
  return lines;
}

export function monthTick(label: string): string {
  const match = label.match(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() + (label.includes('*') ? '*' : '') : label;
}
