import type { PanoramaStory, StoryDatum } from './panoramaStoryTypes';

export type StoryCardFact = { label: string; value: number; unit: StoryDatum['unit'] };

/** Short, source-backed facts for the question answered by each card. */
export function storyCardFacts(story: PanoramaStory): StoryCardFact[] {
  const pick = (label: string, shortLabel = label): StoryCardFact | null => {
    const datum = story.supporting.find(item => item.label === label);
    return datum && typeof datum.value === 'number' && Number.isFinite(datum.value)
      ? { label: shortLabel, value: datum.value, unit: datum.unit } : null;
  };
  const primary = story.primary;
  if (story.id === 'ventas_evolucion') return [];
  if (story.id === 'servicios_pendientes') {
    const delta = primary?.value !== null && primary?.value !== undefined && primary.comparison
      ? [{ label: 'Δ mes ant.', value: primary.value - primary.comparison.value, unit: 'days' as const }] : [];
    const closed = story.supporting[0] ? pick(story.supporting[0].label, 'OS cerradas') : null;
    return [...delta, ...(closed ? [closed] : [])].slice(0, 2);
  }
  const labels: Partial<Record<PanoramaStory['id'], [string, string][]>> = {
    maquinas_pedidos: [['Unidades pendientes', 'Unidades'], ['Pedidos con stock completo', 'Stock completo']],
    servicios_os_facturadas: [['Facturadas a cliente', 'Facturadas'], ['OS cerradas', 'Cerradas']],
    agenda_cumplimiento: [['Completadas', 'Completadas'], ['Evaluables', 'Evaluables']],
    servicios_productividad: [['Horas trabajadas', 'Trabajadas h'], ['Horas disponibles', 'Disponibles h']],
    servicios_eficiencia: [['Horas facturadas', 'Facturadas h'], ['Horas trabajadas', 'Trabajadas h']],
    repuestos_stock: [['Códigos en gris y rojo', 'Códigos']],
    repuestos_alertas: [['Códigos expuestos', 'Códigos']],
    clientes_retencion: [['Retenidos', 'Retenidos'], ['Cohorte base', 'Cohorte']],
    clientes_cobertura_posventa: [['Con compra', story.coverageBasis==='attention'?'Con cobertura':'Con compra'], ['Propietarios', 'Propietarios']],
  };
  return (labels[story.id] ?? []).map(([label, shortLabel]) => pick(label, shortLabel)).filter((fact): fact is StoryCardFact => fact !== null).slice(0, 2);
}
