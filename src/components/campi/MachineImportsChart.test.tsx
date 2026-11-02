import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { machineImportsStory, type MachineImports } from '@/lib/campi/machineImports';
import { panoramaTopicTone } from '@/lib/campi/panoramaTopicTone';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApprovedPanoramaCard } from './ApprovedPanoramaCard';
import { PanoramaStoryCard } from './PanoramaStoryCard';

afterEach(cleanup);
const sharedStyles = readFileSync(resolve('src/components/campi/approved-panorama-card.css'), 'utf8');
const importStyles = readFileSync(resolve('src/components/campi/machine-imports-chart.css'), 'utf8');
const data: MachineImports = { observedAt: '2026-11-02', year: 2026, total: 10, completed: 5, completionPercent: 50,
  states: { PLANIFICADO: 2, EN_TRANSITO: 1, ARRIBADO: 2, COMPLETADO: 5 }, brands: [{ label: 'CLAAS', total: 6, completed: 3 }, { label: 'HORSCH', total: 4, completed: 2 }],
  excludedMissingETA: 2, excludedOtherYears: 3, excludedCancelled: 0 };
const show = (story = machineImportsStory(data), legacy = false) => { const Card = legacy ? PanoramaStoryCard : ApprovedPanoramaCard;
  return render(<MemoryRouter><Card story={story} index={0} retrying={false} onRetry={vi.fn()} onPeriodChange={vi.fn()} /></MemoryRouter>); };

describe('approved annual imports card', () => {
  it('inherits the canonical topic tone and the same typography and bar styles as approved siblings', () => {
    const {container}=show();
    const card=container.querySelector<HTMLElement>('.approved-story-card')!;
    const tone=panoramaTopicTone('maquinas_importacion');
    expect(tone).toMatchObject({accent:'#c2410c',tint:'#fff7ed'});
    expect(card.style.getPropertyValue('--approved-accent')).toBe(tone.accent);
    expect(card.style.getPropertyValue('--approved-tint')).toBe(tone.tint);
    expect(container.querySelector('.approved-import-context')).toHaveClass('approved-card-context');
    expect(container.querySelector('.approved-import-states')).toHaveClass('approved-resolution');
    expect(container.querySelectorAll('.approved-resolution-row')).toHaveLength(4);
    expect(container.querySelectorAll('.approved-resolution-track')).toHaveLength(4);
    expect(importStyles).not.toMatch(/font-size|line-height|--approved-accent|--approved-tint|background:|border-color|approved-kpi-row|approved-card-header|approved-card-summary/);
    expect(sharedStyles).toContain('font-size: clamp(20px, 3.4cqw, 30px)');
    expect(sharedStyles).toContain('background: color-mix(in srgb, var(--approved-accent) 62%, white)');
  });

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
