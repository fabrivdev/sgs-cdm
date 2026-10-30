import { describe, expect, it } from 'vitest';
import { mainMachineOwnerIds, projectCoverage, type CoverageMachine, type CoverageWindow } from './parqueCoverage';
const machine = (id: string, owner: string | null, group = 'TRACTORES', active: boolean | null = true): CoverageMachine => ({ id, cliente_id: owner, subgrupo: group, activo: active });
const window: CoverageWindow = { from: '2026-01-01', to: '2026-10-29', owners: ['a', 'b', 'c'], parts: ['a', 'b'], services: ['b', 'c'], complete: true };
describe('shared coverage preparation, inactive until service evidence policy is resolved', () => {
 it('uses unique active principal-machine owners, not owner names', () => {
  expect(mainMachineOwnerIds([machine('1','a'),machine('2','a'),machine('3','b','PLATAFORMAS/CABEZALES'),machine('4','c','TRACTORES',false),machine('5','d','TRACTORES',null),machine('6',null),machine('7','e')])).toEqual(['a','e']);
 });
 it.each(['PLATAFORMA','DIRECT DISC','PLATAFORMAS/CABEZALES'])('excludes attachment alias %s', label => expect(mainMachineOwnerIds([machine('1','a',label)])).toEqual([]));
 it('preserves main owner also owning an attachment', () => expect(mainMachineOwnerIds([machine('1','a'),machine('2','a','PLATAFORMA')])).toEqual(['a']));
 it.each([{selection:[]}, {selection:['parts','services']}, {selection:['services','parts','parts']}] as const)('unions identities for $selection', ({selection}) => expect(projectCoverage(window, selection)?.numerator).toBe(3));
 it.each(['parts','services'] as const)('projects %s with same denominator', rubric => expect(projectCoverage(window,[rubric])).toMatchObject({numerator:2,denominator:3,percent:2/3*100}));
 it('does not round internal percentage', () => expect(projectCoverage({...window,parts:['a']},['parts'])?.percent).toBeCloseTo(100/3));
 it('keeps empty universe distinct from zero coverage', () => {
  expect(projectCoverage({...window,owners:[],parts:[],services:[]},[])?.percent).toBeNull();
  expect(projectCoverage({...window,parts:[],services:[]},[])?.percent).toBe(0);
 });
 it.each(['incomplete','unknown','duplicate','invalid','reversed'] as const)('fails closed on %s', reason => {
  const sample={...window,owners:[...window.owners],parts:[...window.parts]};
  if(reason==='incomplete')sample.complete=false;
  if(reason==='unknown')sample.parts.push('outside');
  if(reason==='duplicate')sample.owners.push('a');
  if(reason==='invalid')sample.from='2026-02-30';
  if(reason==='reversed')sample.from='2027-01-01';
  expect(projectCoverage(sample,[])).toBeNull();
 });

});
