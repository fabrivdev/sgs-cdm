import { MACHINE_IMPORT_STATES } from '@/lib/campi/machineImports';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import './machine-imports-chart.css';

export function MachineImportsChart({ story }: { story: PanoramaStory }) {
  const data = story.machineImports;
  const valid = data && Number.isInteger(data.total) && data.total >= 0 &&
    MACHINE_IMPORT_STATES.every(({ state }) => Number.isInteger(data.states[state]) && data.states[state] >= 0) &&
    MACHINE_IMPORT_STATES.reduce((sum, { state }) => sum + data.states[state], 0) === data.total &&
    data.completed === data.states.COMPLETADO && data.brands.reduce((sum, brand) => sum + brand.total, 0) === data.total;
  if (!valid) return <div className="approved-chart-empty" role="status">Estados de importación no conciliados</div>;
  return <figure className="approved-resolution approved-import-states" aria-label={`Estados actuales de las máquinas previstas en ${data.year}`}>
    <figcaption className="sr-only">Cada barra representa su cantidad sobre el total de {data.total} máquinas previstas por embarque estimado.</figcaption>
    {MACHINE_IMPORT_STATES.map(({ state, label }) => <div className="approved-resolution-row approved-import-state" key={state}
      aria-label={`${label}: ${data.states[state]} de ${data.total}`}>
      <span>{label}</span><span className="approved-resolution-track" aria-hidden="true"><i data-state={state}
        style={{ width: `${data.total ? data.states[state] / data.total * 100 : 0}%` }} /></span>
      <strong>{data.states[state]}</strong>
    </div>)}
  </figure>;
}
