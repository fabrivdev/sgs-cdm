import {expect,it} from 'vitest';
import {ownRequests,validateQuestion,type TopicRequest} from './topicRequests';
it('validates trimmed question length without changing its meaning',()=>{expect(validateQuestion('  Comparar ventas de cada semana  ')).toBe('Comparar ventas de cada semana');expect(()=>validateQuestion('corta')).toThrow();expect(()=>validateQuestion('a'.repeat(1001))).toThrow();});
it('selects only requests belonging to the current user',()=>{const row:TopicRequest={id:'r',owner:'u',question:'Comparar ventas de cada semana',createdAt:'2026-10-30T12:00:00Z',status:'recibida',topicId:null,reason:'',notified:false};expect(ownRequests([row],'u')).toEqual([row]);expect(ownRequests([row],'v')).toEqual([]);});
