import { machineSubgroupLabel } from './machineModels';

/** Shared preparation, NOT activated: execution-date policy still needs resolution.
 * Source adapters must enforce access and completeness before passing evidence.
 * This module does not treat opening an OS, billing hours or net sales as performed service.
 */
export type CoverageRubric = 'parts' | 'services';
export type CoverageMachine = { id: string; cliente_id: string | null; activo: boolean | null; subgrupo: string | null; subgrupo_personalizado?: string | null };
export function isCoverageAttachment(machine: CoverageMachine) {
  const label = machineSubgroupLabel(machine.subgrupo, machine.subgrupo_personalizado).trim().toLowerCase().replace(/\s+/g, ' ');
  return ['plataforma', 'cabezal', 'cabecal', 'header'].some(value => label.includes(value));
}
export function mainMachineOwnerIds(machines: readonly CoverageMachine[]) {
  return [...new Set(machines.filter(machine => machine.activo === true && machine.cliente_id && !isCoverageAttachment(machine)).map(machine => machine.cliente_id!))].sort();
}
export type CoverageWindow = { from: string; to: string; owners: string[]; parts: string[]; services: string[]; complete: boolean };
const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
/** Both consumers must use this same identity projection, never sum percentages. */
export function projectCoverage(window: CoverageWindow, selection: readonly CoverageRubric[]) {
  if (!window.complete || !day(window.from) || !day(window.to) || window.from > window.to) return null;
  const owners = new Set(window.owners);
  if (owners.size !== window.owners.length || window.owners.some(id => !id) || [...window.parts, ...window.services].some(id => !owners.has(id))) return null;
  const chosen = new Set(selection.length ? selection : ['parts', 'services']);
  if ([...chosen].some(value => value !== 'parts' && value !== 'services')) return null;
  const ids = [...new Set([...(chosen.has('parts') ? window.parts : []), ...(chosen.has('services') ? window.services : [])])].sort();
  return { from: window.from, to: window.to, ids, numerator: ids.length, denominator: owners.size, percent: owners.size ? ids.length / owners.size * 100 : null };
}
