import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { machineImportsStory, type MachineImports } from '@/lib/campi/machineImports';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';
import { PanoramaStoryCard } from './PanoramaStoryCard';

afterEach(cleanup);
const data: MachineImports = { observedAt: '2026-11-02', year: 2026, total: 10, completed: 5, completionPercent: 50,
  states: { PLANIFICADO: 2, EN_TRANSITO: 1, ARRIBADO: 2, COMPLETADO: 5 }, brands: [{ label: 'CLAAS', total: 6, completed: 3 }, { label: 'HORSCH', total: 4, completed: 2 }],
  excludedMissingETA: 2, excludedOtherYears: 3, excludedCancelled: 0 };
const show = (story = machineImportsStory(data), legacy = false) => { const Card = legacy ? PanoramaStoryCard : ApprovedPanoramaCard;
  return render(<MemoryRouter><Card story={story} index={0} retrying={false} onRetry={vi.fn()} onPeriodChange={vi.fn()} /></MemoryRouter>); };

describe('approved annual imports card', () => {
  it('renders the percentage, common brand denominator and horizontal states instead of months', () => {
    const { container } = show();
    expect(screen.getByLabelText('Completadas sobre previstas en 2026: 50%')).toBeInTheDocument();
    expect(screen.getByText('5 de 10 completadas · 2026')).toBeInTheDocument();
    expect(container.querySelector('.approved-import-brands')).toHaveTextContent('CLAAS 6 · HORSCH 4');
    const planned=screen.getByLabelText('Planificado: 2 de 10');
    expect(planned.querySelector('i')).toHaveStyle({ width: '20%' });
    expect(screen.getByLabelText('Completado: 5 de 10').querySelector('i')).toHaveStyle({ width: '50%' });
    expect(container.querySelectorAll('.approved-import-state')).toHaveLength(4);
    expect(container.querySelector('.machine-imports-columns')).toBeNull();
    expect(screen.getByRole('link', { name: /Abrir importaciones/ })).toHaveAttribute('href', '/parque-importaciones');
  });
  it('keeps the sibling Mes/Acum control visible and disabled for the annual topic', () => {
    show();
    const group=screen.getByRole('group',{name:'Período de Importaciones de máquinas'});
    for(const name of ['Mes','Acum.']) {const button=within(group).getByRole('button',{name}); expect(button).toBeVisible(); expect(button).toBeDisabled(); fireEvent.click(button);}
    expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  });
  it('routes direct legacy imports calls to the same approved renderer', () => {
    const {container}=show(machineImportsStory(data),true);
    expect(container.querySelector('.approved-story-card[data-topic="maquinas_importacion"]')).toBeInTheDocument();
    expect(container.querySelector('.story-mini-bars')).toBeNull();
  });
  it('retains native source error and retry without fabricated progress', () => {
    show({ ...machineImportsStory(data), status: 'error', primary: null, chart: null, machineImports: undefined, message: 'No se pudo verificar la fuente completa.' });
    expect(within(screen.getByRole('alert')).getByRole('button', { name: /Reintentar fuente/ })).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });
  it('does not turn an empty annual denominator into zero percent', () => {
    show(machineImportsStory({...data,total:0,completed:0,completionPercent:null,states:{PLANIFICADO:0,EN_TRANSITO:0,ARRIBADO:0,COMPLETADO:0},brands:[]}));
    expect(screen.getByLabelText('Completadas sobre previstas en 2026: —')).toBeInTheDocument();
    expect(screen.getByText(/No hay máquinas con embarque estimado válido en 2026/)).toBeInTheDocument();
  });
});
